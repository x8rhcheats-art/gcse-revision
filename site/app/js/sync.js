// sync.js — share one copy of progress between two laptops.
//
// Manual on purpose. Nothing syncs in the background, because the failure mode
// of automatic sync is silently overwriting the machine that has the real work
// on it. Push sends this device's progress up; Pull replaces this device's
// progress with what is up there. Both say what they are about to do first.

import { getPref, importJson, gatherAllSubjects } from './store.js';

// The endpoint lives on the hosted copy, so it is reachable from the laptop
// app (localhost) and the phone alike.
const ENDPOINT = 'https://quiet-harbour-k7m3q.pages.dev/sync';

// The sync code belongs to the app, not to a subject — switching subject must
// not appear to lose it. It used to live in the physics store's prefs, so
// read from there when the dedicated key has nothing (then write forward).
const globalGet = (key, legacyPref) => {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* fall through */ }
  return getPref(legacyPref, '') || '';
};
const globalSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* keeps working in-session */ }
};

export const getSyncCode = () => globalGet('revision-sync-code', 'sync.code');
export const setSyncCode = (code) => globalSet('revision-sync-code', code.trim());
export const getDeviceName = () => globalGet('revision-sync-device', 'sync.device');
export const setDeviceName = (name) => globalSet('revision-sync-device', name.trim().slice(0, 40));

/** A code long enough not to be guessed, readable enough to retype. */
export function generateSyncCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';   // no look-alikes
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const body = [...bytes].map(b => alphabet[b % alphabet.length]).join('');
  return `${body.slice(0, 6)}-${body.slice(6, 12)}-${body.slice(12, 18)}`;
}

function assertCode() {
  const code = getSyncCode();
  if (!/^[A-Za-z0-9-]{12,64}$/.test(code)) {
    throw new Error('Set a sync code first — the same one on both machines.');
  }
  return code;
}

/**
 * Sync is the one part of the app that needs a connection. Everything else
 * works offline, so a failure here should say plainly that this is the
 * exception rather than leave "Failed to fetch" on screen.
 */
async function request(options) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('No internet connection. Everything else in the app works offline — only sync needs one. Try again when you are back online.');
  }
  try {
    return await fetch(ENDPOINT, options);
  } catch {
    throw new Error('Could not reach the sync store — you may be offline. Everything else in the app works without a connection.');
  }
}

/** What is currently stored remotely, without changing anything locally. */
export async function peek() {
  const code = assertCode();
  const res = await request({ headers: { 'x-sync-key': code } });
  if (!res.ok) throw new Error(`Could not reach the sync store (${res.status}).`);
  const body = await res.json();
  if (body.empty) return null;
  return body;   // { pushedAt, device, state }
}

/** Send this device's progress up, replacing whatever is there. */
export async function push() {
  const code = assertCode();
  const res = await request({
    method: 'PUT',
    headers: { 'x-sync-key': code, 'content-type': 'application/json' },
    // the envelope carries every subject's progress, so one push covers the lot
    body: JSON.stringify({ device: getDeviceName() || 'unnamed device', state: gatherAllSubjects() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Push failed (${res.status}).`);
  globalSet('revision-sync-last-push', body.pushedAt);
  return body.pushedAt;
}

/** Replace this device's progress with what is stored remotely. */
export async function pull() {
  const remote = await peek();
  if (!remote) throw new Error('Nothing has been pushed with that code yet.');
  importJson(JSON.stringify(remote.state));   // validates before it replaces
  globalSet('revision-sync-last-pull', new Date().toISOString());
  return remote;
}

/** A plain-English summary of how the two copies compare. */
export function compare(local, remote) {
  if (!remote) return 'Nothing stored remotely yet.';
  // sums across every subject in an envelope; still reads a bare (pre-subject,
  // physics-only) state, which is what an un-repushed remote will hold
  const count = (s) => {
    const states = s && s.subjects ? Object.values(s.subjects) : [s || {}];
    const out = { tags: 0, attempts: 0, papers: 0 };
    for (const st of states) {
      out.tags += Object.keys(st.confidence || {}).length;
      out.attempts += (st.attempts || []).length;
      out.papers += (st.mockAttempts || []).length + (st.diagnosticAttempts || []).length;
    }
    return out;
  };
  const l = count(local), r = count(remote.state);
  return `Here: ${l.tags} tags, ${l.attempts} answers, ${l.papers} papers. ` +
    `Stored: ${r.tags} tags, ${r.attempts} answers, ${r.papers} papers.`;
}

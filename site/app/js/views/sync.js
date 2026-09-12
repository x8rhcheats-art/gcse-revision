// views/sync.js — the Push / Pull screen.
//
// Two laptops, one shared copy. Nothing happens automatically: each direction
// is a button, each says what it will overwrite, and both show the two copies
// side by side first so a choice is informed rather than hopeful.

import { el, view, shortDate } from '../ui.js';
import { getPref, exportJson, gatherAllSubjects } from '../store.js';

// counts across every subject in an envelope (or a bare legacy state)
function tally(s) {
  const states = s && s.subjects ? Object.values(s.subjects) : [s || {}];
  const out = { tags: 0, attempts: 0 };
  for (const st of states) {
    out.tags += Object.keys(st.confidence || {}).length;
    out.attempts += (st.attempts || []).length;
  }
  return out;
}
import {
  getSyncCode, setSyncCode, generateSyncCode,
  getDeviceName, setDeviceName, peek, push, pull, compare,
} from '../sync.js';

export function renderSync() {
  const root = view('Sync between machines',
    'Progress normally lives only in the browser it was made in. This puts one shared copy in the middle, so the laptop John revises on and the laptop the coach view is read on can see the same thing.');

  root.append(el('p', { class: 'plain-note' },
    'This page is the only part of the app that needs an internet connection. ' +
    'Everything else — reading, tagging, quizzes, flashcards, mocks, the coach view — works with no connection at all. ' +
    'Revise offline, then push next time you are online.'));

  const status = el('p', { class: 'sync-status' });
  const remoteBox = el('div', { class: 'sync-remote' });

  const say = (msg, kind = '') => { status.className = `sync-status ${kind}`; status.textContent = msg; };

  // ---- 1. the code ----
  root.append(el('h2', {}, el('span', { class: 'num' }, '01'), 'The sync code'));
  root.append(el('p', {}, 'Both machines must use the same code. Generate it once here, then type it into the other machine. Anyone with the code can read and replace this progress, so keep it to yourselves.'));

  const codeInput = el('input', { type: 'text', class: 'wide', value: getSyncCode(), placeholder: 'e.g. kfhq2m-pw7rtx-9dnvbe', spellcheck: 'false' });
  const deviceInput = el('input', { type: 'text', class: 'wide', value: getDeviceName(), placeholder: 'e.g. John’s laptop', maxlength: 40 });

  root.append(
    el('p', {}, 'Sync code', el('br'), codeInput),
    el('p', {},
      el('button', {
        class: 'act secondary', onclick: () => { codeInput.value = generateSyncCode(); say('New code generated — press Save, then type it into the other machine.'); },
      }, 'Generate a code'),
      ' ',
      el('button', {
        class: 'act', onclick: () => {
          setSyncCode(codeInput.value);
          setDeviceName(deviceInput.value);
          say(getSyncCode() ? 'Saved on this machine.' : 'Cleared.', 'ok');
        },
      }, 'Save')),
    el('p', {}, 'What to call this machine', el('br'), deviceInput,
      el('span', { class: 'plain-note' }, ' Shown when the other machine looks at what is stored.')));

  // ---- 2. compare ----
  root.append(el('h2', {}, el('span', { class: 'num' }, '02'), 'What is where'));
  root.append(el('p', {},
    el('button', {
      class: 'act secondary', onclick: async () => {
        remoteBox.replaceChildren();
        say('Checking…');
        try {
          const remote = await peek();
          say(compare(gatherAllSubjects(), remote), 'ok');
          remoteBox.append(remote
            ? el('p', { class: 'plain-note' }, `Stored copy last pushed ${shortDate(remote.pushedAt)} from “${remote.device}”.`)
            : el('p', { class: 'plain-note' }, 'Nothing stored with that code yet — press Push to put this machine’s progress up.'));
        } catch (e) { say(e.message, 'bad'); }
      },
    }, 'Check what is stored')));
  root.append(status, remoteBox);

  // ---- 3. push / pull ----
  root.append(el('h2', {}, el('span', { class: 'num' }, '03'), 'Move it'));
  root.append(el('p', {}, 'Neither of these merges anything. Push makes the stored copy match this machine; Pull makes this machine match the stored copy. Whichever machine has done the real work should Push, and the other should Pull.'));

  root.append(el('p', {},
    el('button', {
      class: 'act', onclick: async () => {
        const mine = tally(gatherAllSubjects());
        if (!confirm(`Push this machine's progress — every subject (${mine.tags} tags, ${mine.attempts} answers) — and replace whatever is stored?`)) return;
        say('Pushing…');
        try { say(`Pushed at ${shortDate(await push())}. The other machine can Pull now.`, 'ok'); }
        catch (e) { say(e.message, 'bad'); }
      },
    }, 'Push — this machine → stored'),
    ' ',
    el('button', {
      class: 'act', onclick: async () => {
        say('Checking what is stored…');
        let remote;
        try { remote = await peek(); } catch (e) { return say(e.message, 'bad'); }
        if (!remote) return say('Nothing has been pushed with that code yet.', 'bad');
        const mine = tally(gatherAllSubjects());
        const theirs = tally(remote.state);
        if (!confirm(
          `Replace this machine's progress with the stored copy?\n\n` +
          `This machine: ${mine.tags} tags, ${mine.attempts} answers\n` +
          `Stored (${remote.device}, ${shortDate(remote.pushedAt)}): ${theirs.tags} tags, ${theirs.attempts} answers\n\n` +
          `Anything on this machine that is not in the stored copy will be lost.`)) return;
        try { await pull(); say('Pulled. Reloading…', 'ok'); setTimeout(() => location.reload(), 600); }
        catch (e) { say(e.message, 'bad'); }
      },
    }, 'Pull — stored → this machine')));

  const lastPush = (() => { try { return localStorage.getItem('revision-sync-last-push'); } catch { return null; } })() || getPref('sync.lastPush', null);
  const lastPull = (() => { try { return localStorage.getItem('revision-sync-last-pull'); } catch { return null; } })() || getPref('sync.lastPull', null);
  root.append(el('p', { class: 'plain-note' },
    lastPush ? `Last pushed from this machine ${shortDate(lastPush)}. ` : 'Never pushed from this machine. ',
    lastPull ? `Last pulled ${shortDate(lastPull)}.` : 'Never pulled here.'));

  root.append(el('p', { class: 'plain-note' },
    'Before a Pull, it is worth taking a local copy: ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); exportJson(); } }, 'back up this machine first'), '.'));

  return root;
}

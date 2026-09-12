// store.js — the only module that touches localStorage.
// Versioned schema. Two signals kept strictly separate:
//   confidence  — declared (John's own tags)
//   attempts / mockAttempts / diagnosticAttempts — demonstrated (what happened)
// Derived state is never stored (see model.js).
//
// One store per subject, each under its own key. Physics keeps the exact key
// it has always had, so nothing ever needs migrating. initStore() must run
// before anything reads state; switching subject just re-runs it.

let SUBJECT = 'physics';
let ALL_SUBJECTS = ['physics'];
const keyFor = (subject) => `${subject}-progress-v1`;
const KEY = () => keyFor(SUBJECT);
const VERSION = 1;

function emptyState() {
  return {
    version: VERSION,
    lastOpened: null,
    lastExported: null,
    // SIGNAL 1 — declared confidence. itemId -> { value, at, history[] }
    confidence: {},
    // SIGNAL 2 — demonstrated performance.
    attempts: [],            // { questionId, at, selfRating, attemptNumber }
    mockAttempts: [],        // { mockId, at, totalScore, totalMarks, minutesTaken, questionScores[], errorTags[] }
    diagnosticAttempts: [],  // { at, sections: [{letter, score, marks, codes:{K,W,M,U,P}}], finishedInTime, blankQuestions }
    flashcards: {},          // cardId -> { due: 'YYYY-MM-DD', history: [{at, rating}] }
    writtenAnswers: {},      // questionId -> latest answer he typed before revealing
    activeMock: null,        // { mockId, startedAt, minutes }
    checklist: {},           // schedule row index -> true
    prefs: {},               // e.g. { 'mode.mcq': 'even' } — how each practice
                             // area picks questions; his choice, and it sticks
  };
}

// NB: function declarations, not const arrows — load() is called at module
// evaluation below, before any const in this file is initialised.
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function validShape(parsed) {
  return parsed && parsed.version === VERSION
    && isObj(parsed.confidence)
    && Array.isArray(parsed.attempts)
    && Array.isArray(parsed.mockAttempts)
    && Array.isArray(parsed.diagnosticAttempts)
    && isObj(parsed.flashcards);
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY()); } catch { /* storage unavailable */ }
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    if (validShape(parsed)) return { ...emptyState(), ...parsed };
    // future-versioned or unrecognised: keep a copy rather than destroy it
    localStorage.setItem(KEY() + '-unrecognised', raw);
    return emptyState();
  } catch (err) {
    // Never silent: reaching here means saved progress was not loaded, and the
    // next write will overwrite it. Keep the original and say so out loud.
    console.error('Saved progress could not be read — kept a copy under ' +
      `"${KEY()}-corrupt". Reason:`, err);
    try { localStorage.setItem(KEY() + '-corrupt', raw); } catch { /* best effort */ }
    return emptyState();
  }
}

// Empty until initStore() points it at a subject — main.js boots the store
// before anything renders, so no view ever sees this placeholder.
let state = emptyState();

/** Point the store at a subject's saved progress. Safe to call repeatedly. */
export function initStore(subjectId, allSubjectIds = null) {
  SUBJECT = subjectId;
  if (allSubjectIds && allSubjectIds.length) ALL_SUBJECTS = allSubjectIds;
  state = load();
  document.dispatchEvent(new CustomEvent('store-changed'));
}

// Second copy on disk: the local server writes site/progress/…json on every
// change (debounced). Survives cleared browser data; lives in the app folder,
// so it can be committed and pushed like any other file. Fire-and-forget —
// if the server is old or absent, localStorage alone still works.
let mirrorTimer = null;
// Only meaningful when our own little server is there to receive it. The
// offline build runs from file://, where a request is refused outright; a
// hosted copy has no such endpoint at all. In both cases, stop trying — one
// quiet failure, not a console error on every change.
// The mirror writes into the project folder, which only exists behind our own
// start.bat server — always on localhost. Anywhere else (the offline file, a
// hosted copy) there is nothing to write to, so never even ask.
let mirrorOff = typeof location === 'undefined'
  || !/^https?:$/.test(location.protocol)
  || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function scheduleMirror() {
  if (mirrorOff) return;
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    // subject named in the envelope so the server files each one separately
    fetch('save-progress', { method: 'POST', body: JSON.stringify({ subject: SUBJECT, state }) })
      .then(r => { if (!r.ok) mirrorOff = true; })
      .catch(() => { mirrorOff = true; });
  }, 1500);
}

let persistFailed = false;
function persist() {
  try {
    localStorage.setItem(KEY(), JSON.stringify(state));
    persistFailed = false;
    scheduleMirror();
  } catch {
    // storage full or unavailable: the change is in memory only. Say so —
    // silently losing weeks of tags on the next reload is the worst outcome.
    if (!persistFailed) {
      persistFailed = true;
      document.dispatchEvent(new CustomEvent('store-persist-failed'));
    }
  }
  document.dispatchEvent(new CustomEvent('store-changed'));
}

export function getState() { return state; }

export function touchOpened() {
  state = { ...state, lastOpened: new Date().toISOString() };
  persist();
}

// ---------- declared confidence ----------

export function setTag(itemId, value) {
  const at = new Date().toISOString();
  const prev = state.confidence[itemId];
  const confidence = { ...state.confidence };
  if (value === null) {
    if (!prev) return;
    // clearing keeps history — the record that it was once tagged matters
    confidence[itemId] = { value: null, at, history: [...(prev.history || []), { value: null, at }] };
  } else {
    confidence[itemId] = {
      value, at,
      history: [...(prev ? prev.history || [] : []), { value, at }],
    };
  }
  state = { ...state, confidence };
  persist();
}

export function getTag(itemId) {
  const t = state.confidence[itemId];
  return t && t.value ? t : null;
}

// ---------- demonstrated performance ----------

/**
 * @param extras optional { markPointsHit, markPointsTotal } from self-marking an
 * extended answer against the mark scheme — more precise than the 3-way rating,
 * and used in preference to it by the model when present.
 */
export function recordAttempt(questionId, selfRating, extras = null) {
  const prior = state.attempts.filter(a => a.questionId === questionId).length;
  state = {
    ...state,
    attempts: [...state.attempts, {
      questionId, at: new Date().toISOString(), selfRating, attemptNumber: prior + 1,
      ...(extras && extras.markPointsTotal ? {
        markPointsHit: extras.markPointsHit, markPointsTotal: extras.markPointsTotal,
      } : {}),
    }],
  };
  persist();
}

/** Refine the most recent attempt with self-marked mark points. */
export function updateLastAttempt(questionId, extras) {
  const idx = state.attempts.map(a => a.questionId).lastIndexOf(questionId);
  if (idx < 0) return;
  const attempts = [...state.attempts];
  attempts[idx] = { ...attempts[idx], ...extras };
  state = { ...state, attempts };
  persist();
}

export function getWrittenAnswer(questionId) {
  return state.writtenAnswers[questionId] || '';
}

export function saveWrittenAnswer(questionId, text) {
  if ((state.writtenAnswers[questionId] || '') === text) return;
  const writtenAnswers = { ...state.writtenAnswers };
  if (text.trim()) writtenAnswers[questionId] = text;
  else delete writtenAnswers[questionId];
  state = { ...state, writtenAnswers };
  persist();
}

export function saveMockAttempt(attempt) {
  state = { ...state, mockAttempts: [...state.mockAttempts, attempt], activeMock: null };
  persist();
}

export function saveDiagnosticAttempt(attempt) {
  state = { ...state, diagnosticAttempts: [...state.diagnosticAttempts, attempt] };
  persist();
}

export function latestMockAttempt(mockId) {
  const list = state.mockAttempts.filter(a => a.mockId === mockId);
  return list.length ? list[list.length - 1] : null;
}

export function latestDiagnostic() {
  const list = state.diagnosticAttempts;
  return list.length ? list[list.length - 1] : null;
}

// ---------- mock timer session ----------

export function startMock(mockId, minutes) {
  state = { ...state, activeMock: { mockId, startedAt: new Date().toISOString(), minutes } };
  persist();
}

export function abandonMock() {
  state = { ...state, activeMock: null };
  persist();
}

// ---------- flashcards ----------

export function rateCard(cardId, rating, dueDate) {
  const prev = state.flashcards[cardId];
  state = {
    ...state,
    flashcards: {
      ...state.flashcards,
      [cardId]: { due: dueDate, history: [...(prev ? prev.history || [] : []), { at: new Date().toISOString(), rating }] },
    },
  };
  persist();
}

// ---------- schedule checklist ----------

// ---------- preferences ----------

export function getPref(key, fallback = null) {
  const v = (state.prefs || {})[key];
  return v === undefined ? fallback : v;
}

export function setPref(key, value) {
  state = { ...state, prefs: { ...(state.prefs || {}), [key]: value } };
  persist();
}

export function toggleChecklist(key) {
  state = { ...state, checklist: { ...state.checklist, [key]: !state.checklist[key] } };
  persist();
}

// ---------- export / import ----------

/**
 * Every subject's saved progress in one envelope — what backups and sync move
 * around. One file covers everything, exactly as it did when there was only
 * one subject to cover.
 */
export function gatherAllSubjects() {
  const subjects = {};
  for (const id of ALL_SUBJECTS) {
    if (id === SUBJECT) { subjects[id] = state; continue; }
    try {
      const raw = localStorage.getItem(keyFor(id));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (validShape(parsed)) subjects[id] = parsed;
    } catch { /* an unreadable sibling never blocks a backup of the rest */ }
  }
  return {
    app: 'john-exams-progress', version: 2,
    exportedAt: new Date().toISOString(), subjects,
  };
}

export function exportJson() {
  state = { ...state, lastExported: new Date().toISOString() };
  persist();
  const blob = new Blob([JSON.stringify(gatherAllSubjects(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `revision-progress-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Replace saved progress with an exported file. Accepts both the current
 * all-subjects envelope and the original physics-only export, so a backup made
 * before the app grew subjects still restores. Throws readably on bad input.
 */
export function importJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }

  if (parsed && parsed.app === 'john-exams-progress' && isObj(parsed.subjects)) {
    let imported = 0;
    for (const [id, s] of Object.entries(parsed.subjects)) {
      if (!validShape(s)) continue;
      try { localStorage.setItem(keyFor(id), JSON.stringify({ ...emptyState(), ...s })); imported++; }
      catch { throw new Error('Browser storage refused the import — it may be full. Nothing further was changed.'); }
    }
    if (!imported) throw new Error('That file contains no readable progress. Nothing was changed.');
    state = load();   // adopt whatever just landed for the active subject
    document.dispatchEvent(new CustomEvent('store-changed'));
    return;
  }

  if (!validShape(parsed)) {
    throw new Error('That file does not look like a progress export from this app. Nothing was changed.');
  }
  // legacy single-subject export: it was always physics
  try { localStorage.setItem(keyFor('physics'), JSON.stringify({ ...emptyState(), ...parsed })); }
  catch { throw new Error('Browser storage refused the import — it may be full. Nothing was changed.'); }
  if (SUBJECT === 'physics') state = load();
  document.dispatchEvent(new CustomEvent('store-changed'));
}

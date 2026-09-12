// model.js — the confidence model (scoping memo §5).
// Two signals, kept separate in the store, reconciled HERE, at read time.
// Nothing in this file is ever persisted.

import { content, index } from './content.js';
import { getState, getTag } from './store.js';

// Self-rating -> share of the question's marks it counts as.
const RATING_WEIGHT = { 'got-it': 1.0, 'partly': 0.5, 'no-idea': 0.0 };
// Understanding questions carry no marks; they count as this much evidence each.
const UNDERSTANDING_NOMINAL_MARKS = 2;
// Demonstrated thresholds (memo §6, amended per planback):
const STRONG_PCT = 0.75, WEAK_PCT = 0.50;
const STRONG_MIN_QUESTIONS = 5;   // ...unless mock/diagnostic evidence covers it
const MOCK_MARKS_GATE = 6;        // mock marks that alone qualify a topic for strong/weak
const UNTESTED_MAX_QUESTIONS = 2; // fewer than 3 attempts and no mock data
const BLIND_SPOT_MIN_MARKS = 4;   // never flag a blind spot on less evidence than this

// ---------- declared ----------

/** Effective tag for an item: its own explicit tag, else nearest tagged ancestor. */
export function effectiveTag(itemId) {
  let id = itemId, hops = 0;
  while (id != null && hops < 10) {
    const t = getTag(id);
    if (t) return { value: t.value, at: t.at, from: id, explicit: id === itemId };
    id = index.itemParent.get(id) ?? null;
    hops++;
  }
  return null;
}

/**
 * Declared state for a whole module: the latest explicit module-level tag if
 * there is one; otherwise the majority colour among explicit tags anywhere in
 * the module (ties broken by most recent tag).
 */
export function declaredForModule(moduleId) {
  const own = getTag(moduleId);
  if (own) return { value: own.value, at: own.at, basis: 'whole module tagged' };

  const st = getState();
  const counts = { red: 0, amber: 0, green: 0 };
  const latestByColor = { red: '', amber: '', green: '' };
  let latestAt = '';
  let n = 0;
  for (const [itemId, t] of Object.entries(st.confidence)) {
    if (!t.value) continue;
    const info = index.itemInfo.get(itemId);
    if (!info || info.moduleId !== moduleId) continue;
    counts[t.value]++; n++;
    if (t.at > latestByColor[t.value]) latestByColor[t.value] = t.at;
    if (t.at > latestAt) latestAt = t.at;
  }
  if (!n) return null;
  const max = Math.max(counts.red, counts.amber, counts.green);
  const leaders = ['red', 'amber', 'green'].filter(v => counts[v] === max);
  // ties break to the most recently tagged colour AMONG the leaders
  const value = leaders.sort((a, b) => (latestByColor[b] < latestByColor[a] ? -1 : 1))[0];
  return { value, at: latestAt, basis: `${n} item tag${n === 1 ? '' : 's'} (${counts.red} red, ${counts.amber} amber, ${counts.green} green)` };
}

// ---------- demonstrated ----------

/** Latest attempt per question id. */
function latestAttempts() {
  const map = new Map();
  for (const a of getState().attempts) map.set(a.questionId, a); // chronological order; last wins
  return map;
}

function latestPerMock() {
  const map = new Map();
  for (const a of getState().mockAttempts) map.set(a.mockId, a);
  return map;
}

/**
 * Pool every piece of demonstrated evidence for a module:
 * self-rated question attempts (latest per question), mock question scores,
 * diagnostic section scores. Returns marks-weighted percentage plus the
 * evidence needed to quote it.
 */
export function demonstratedForModule(moduleId) {
  const ev = {
    scored: 0, available: 0,
    questionsAttempted: 0,
    mockMarks: 0,
    selfRatingBreakdown: { 'got-it': 0, 'partly': 0, 'no-idea': 0 },
    mockScores: [],       // { label, topic, score, marks }
    weakQuestions: [],    // worst evidence, for quoting
    errorCodes: {},
  };

  const attempts = latestAttempts();
  for (const [qid, a] of attempts) {
    const entry = index.questionById.get(qid);
    if (!entry || !a.selfRating) continue;
    const inModule = entry.kind === 'exam'
      ? entry.moduleIds.includes(moduleId)
      : entry.moduleId === moduleId;
    if (!inModule) continue;
    const marks = entry.kind === 'exam' ? (entry.marks || UNDERSTANDING_NOMINAL_MARKS)
      : entry.kind === 'mcq' ? 1
      : entry.kind === 'drill' ? (entry.q.marks || UNDERSTANDING_NOMINAL_MARKS)
      : UNDERSTANDING_NOMINAL_MARKS;
    ev.available += marks;
    // self-marked mark points beat the 3-way rating when he has done that work
    const fraction = a.markPointsTotal
      ? a.markPointsHit / a.markPointsTotal
      : RATING_WEIGHT[a.selfRating];
    ev.scored += marks * fraction;
    ev.questionsAttempted++;
    ev.selfRatingBreakdown[a.selfRating]++;
    if (a.markPointsTotal) {
      ev.markPointsHit = (ev.markPointsHit || 0) + a.markPointsHit;
      ev.markPointsSeen = (ev.markPointsSeen || 0) + a.markPointsTotal;
    }
    if (a.selfRating === 'no-idea') {
      // exam and MCQ entries carry a label; module questions carry the question object
      const label = entry.q ? entry.q.qid : (entry.label || 'question');
      const how = entry.kind === 'mcq' ? 'answered wrong' : 'self-rated “no idea”';
      ev.weakQuestions.push({ label: `${label} ${how}`, itemId: qid });
    }
  }

  for (const [mockId, att] of latestPerMock()) {
    const mock = index.mockById.get(mockId);
    if (!mock) continue;
    for (const qs of att.questionScores || []) {
      const q = mock.questions.find(x => x.number === qs.number);
      if (!q || !q.moduleIds.includes(moduleId)) continue;
      ev.available += q.marks; ev.scored += qs.score;
      ev.mockMarks += q.marks;
      ev.questionsAttempted++;
      ev.mockScores.push({ label: `${mock.title} Q${q.number}`, topic: q.topic, score: qs.score, marks: q.marks });
      if (qs.score / q.marks < WEAK_PCT) ev.weakQuestions.push({ label: `${mock.title} Q${q.number} (${q.topic}) ${qs.score}/${q.marks}` });
    }
    for (const tag of att.errorTags || []) {
      const q = mock.questions.find(x => x.number === tag.questionNumber);
      if (!q || !q.moduleIds.includes(moduleId)) continue;
      ev.errorCodes[tag.code] = (ev.errorCodes[tag.code] || 0) + tag.marksLost;
    }
  }

  const diag = getState().diagnosticAttempts.slice(-1)[0];
  if (diag && content.diagnostic) {
    for (const s of diag.sections || []) {
      const spec = content.diagnostic.sections.find(x => x.letter === s.letter);
      if (!spec || spec.moduleId !== moduleId) continue;
      ev.available += spec.marks; ev.scored += s.score;
      ev.mockMarks += spec.marks;
      ev.questionsAttempted++;
      ev.mockScores.push({ label: `Diagnostic §${s.letter}`, topic: spec.title, score: s.score, marks: spec.marks });
      if (s.score / spec.marks < WEAK_PCT) ev.weakQuestions.push({ label: `Diagnostic §${s.letter} (${spec.title}) ${s.score}/${spec.marks}` });
      const letterToCode = { K: 'knowledge', W: 'wording', M: 'maths', U: 'unit-conversion', P: 'presentation' };
      for (const [letter, n] of Object.entries(s.codes || {})) {
        if (n) ev.errorCodes[letterToCode[letter]] = (ev.errorCodes[letterToCode[letter]] || 0) + n;
      }
    }
  }

  const pct = ev.available > 0 ? ev.scored / ev.available : null;
  let level;
  if (ev.questionsAttempted <= UNTESTED_MAX_QUESTIONS && ev.mockMarks === 0) level = 'untested';
  else if (pct === null) level = 'untested';
  else if (pct >= STRONG_PCT && (ev.questionsAttempted >= STRONG_MIN_QUESTIONS || ev.mockMarks >= MOCK_MARKS_GATE)) level = 'strong';
  else if (pct < WEAK_PCT) level = 'weak';
  else level = 'mixed';

  return { level, pct, ...ev };
}

// ---------- reconciliation (memo §5.2) ----------

/**
 * Amber and untagged map onto the six memo states as follows:
 * amber+weak -> known-gap, amber+strong -> secure, amber+untested -> unverified,
 * untagged+weak -> known-gap, untagged+strong -> secure, untagged/mixed -> unknown-ish.
 */
export function moduleState(moduleId) {
  const declared = declaredForModule(moduleId);
  const demo = demonstratedForModule(moduleId);
  const d = declared ? declared.value : null;
  const mod = index.moduleById.get(moduleId);

  let state;
  if (d === 'green' && demo.level === 'weak' && demo.available >= BLIND_SPOT_MIN_MARKS) state = 'blind-spot';
  else if (d === 'green' && demo.level === 'strong') state = 'secure';
  else if (d === 'green' && demo.level === 'untested') state = 'unverified';
  else if (d === 'green') state = 'mixed-evidence';
  else if (d === 'red' && demo.level === 'strong') state = 'confidence-gap';
  else if (d === 'red') state = 'known-gap';
  else if (d === 'amber') {
    state = demo.level === 'weak' ? 'known-gap' : demo.level === 'strong' ? 'secure' : 'unverified';
  } else {
    state = demo.level === 'weak' ? 'known-gap' : demo.level === 'strong' ? 'secure' : 'unknown';
  }

  return {
    moduleId, title: mod ? mod.title : moduleId,
    examWeight: mod ? mod.examWeight : 0,
    declared, demonstrated: demo, state,
  };
}

export function allModuleStates() {
  return content.modules.map(m => moduleState(m.id));
}

// ---------- what to practise next: the feedback loop ----------

// How badly each reconciled state needs work. Blind spots lead — he believes
// he is fine and is not — then declared gaps, then anything with no evidence.
const STATE_NEED = {
  'blind-spot': 6,
  'known-gap': 4.5,
  'mixed-evidence': 3,
  'unknown': 2.5,
  'unverified': 2,
  'confidence-gap': 1.5,
  'secure': 1,
};

/** moduleId -> number of items whose effective tag is red. */
export function redItemsByModule() {
  const counts = new Map();
  const { explicit, inherited } = redList();
  for (const r of [...explicit, ...inherited]) {
    if (r.info.moduleId) counts.set(r.info.moduleId, (counts.get(r.info.moduleId) || 0) + 1);
  }
  return counts;
}

export function modulesWithRed() {
  return [...redItemsByModule().keys()];
}

/**
 * How much this module needs work. State dominates; exam weight and the number
 * of red items tilt it without ever overriding the state.
 * `redCounts` may be passed in to avoid recomputing the red list per module.
 */
export function moduleNeed(moduleId, redCounts = null) {
  const s = moduleState(moduleId);
  const reds = (redCounts || redItemsByModule()).get(moduleId) || 0;
  const base = STATE_NEED[s.state] ?? 2;
  const score = base * (1 + (s.examWeight || 0) * 2) * (1 + Math.min(reds, 10) * 0.05);
  return { ...s, reds, score };
}

/** Every module, most in need of work first. */
export function modulesByNeed() {
  const counts = redItemsByModule();
  return content.modules.map(m => moduleNeed(m.id, counts)).sort((a, b) => b.score - a.score);
}

/**
 * Per-question sampling weight from his own history: something he got wrong
 * should come back often, something he got right should fade — never vanish.
 */
export function questionNeedWeight(itemId) {
  const last = latestAttempts().get(itemId);
  if (!last || !last.selfRating) return 1;          // never attempted
  if (last.selfRating === 'no-idea') return 3;
  if (last.selfRating === 'partly') return 1.8;
  return 0.35;                                       // got it
}

/**
 * The Priority Module: one module's worth of material, assembled from whatever
 * currently needs work most, across all eight. Items keep their original
 * itemIds, so tagging here is the same tag as in the source module.
 *
 * Sizes are chosen to match a real module rather than to dump everything.
 */
const PRIORITY_SIZES = { equations: 6, definitions: 10, traps: 6, understanding: 5, drill: 8 };

const TAG_NEED = { red: 4, amber: 2.5, green: 0.4 };
const tagNeed = itemId => {
  const eff = effectiveTag(itemId);
  return eff ? (TAG_NEED[eff.value] ?? 1.2) : 1.2;      // untagged sits mid-table
};

export function priorityModule() {
  const st = getState();
  const hasSignal = st.attempts.length > 0 || Object.keys(st.confidence).length > 0;
  const redCounts = redItemsByModule();
  const needOf = new Map(content.modules.map(m => [m.id, moduleNeed(m.id, redCounts).score]));

  const pick = (rows, n, scorer) =>
    rows.map(r => ({ ...r, score: scorer(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);

  const eqs = [], defs = [], traps = [], understanding = [], drill = [];
  for (const mod of content.modules) {
    for (const sub of mod.sections.sheet.subsections) {
      for (const e of sub.equations) eqs.push({ item: e, moduleId: mod.id, heading: sub.heading });
      for (const d of sub.definitions) defs.push({ item: d, moduleId: mod.id, heading: sub.heading });
      for (const t of sub.traps) traps.push({ item: t, moduleId: mod.id, heading: sub.heading });
    }
    for (const q of mod.sections.understanding.questions) understanding.push({ item: q, moduleId: mod.id });
    for (const q of mod.sections.drill.questions) drill.push({ item: q, moduleId: mod.id });
  }

  // With no tags and no attempts there is nothing to prioritise on, so fall
  // back to exam weight — "start with what is worth most" is at least honest.
  const sheetScore = r => hasSignal
    ? tagNeed(r.item.itemId) * (needOf.get(r.moduleId) || 2)
    : (index.moduleById.get(r.moduleId)?.examWeight || 0);
  const questionScore = r => hasSignal
    ? tagNeed(r.item.itemId) * questionNeedWeight(r.item.itemId) * (needOf.get(r.moduleId) || 2)
    : (index.moduleById.get(r.moduleId)?.examWeight || 0);

  const out = {
    hasSignal,
    equations: pick(eqs, PRIORITY_SIZES.equations, sheetScore),
    definitions: pick(defs, PRIORITY_SIZES.definitions, sheetScore),
    traps: pick(traps, PRIORITY_SIZES.traps, sheetScore),
    understanding: pick(understanding, PRIORITY_SIZES.understanding, questionScore),
    drill: pick(drill, PRIORITY_SIZES.drill, questionScore),
  };

  // Which modules this material actually came from, most represented first —
  // shown at the top so it is obvious why these items are here.
  const counts = new Map();
  for (const r of [...out.equations, ...out.definitions, ...out.traps, ...out.understanding, ...out.drill]) {
    counts.set(r.moduleId, (counts.get(r.moduleId) || 0) + 1);
  }
  out.sources = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([moduleId, n]) => ({ moduleId, title: index.moduleById.get(moduleId)?.title || moduleId, n }));
  out.total = [...counts.values()].reduce((a, n) => a + n, 0);
  return out;
}

/** Weighted sample without replacement. */
export function weightedSample(items, n, weightOf) {
  const pool = [...items];
  const picked = [];
  while (picked.length < n && pool.length) {
    const weights = pool.map(weightOf);
    const total = weights.reduce((a, w) => a + w, 0);
    if (!(total > 0)) { picked.push(...pool.splice(0, n - picked.length)); break; }
    let r = Math.random() * total, idx = 0;
    for (; idx < pool.length; idx++) { r -= weights[idx]; if (r <= 0) break; }
    picked.push(...pool.splice(Math.min(idx, pool.length - 1), 1));
  }
  return picked;
}

// ---------- red list ----------

/** Every taggable item whose effective state is red, explicit first. */
export function redList() {
  const explicit = [], inherited = [];
  for (const [itemId, info] of index.itemInfo) {
    if (info.kind === 'module') continue; // module rows would duplicate every child
    const eff = effectiveTag(itemId);
    if (!eff || eff.value !== 'red') continue;
    const row = { itemId, info, eff };
    (eff.explicit ? explicit : inherited).push(row);
  }
  const weight = id => -(index.moduleById.get(index.itemInfo.get(id).moduleId)?.examWeight || 0);
  explicit.sort((a, b) => weight(a.itemId) - weight(b.itemId));
  inherited.sort((a, b) => weight(a.itemId) - weight(b.itemId));
  return { explicit, inherited };
}

export function redCount() {
  const { explicit, inherited } = redList();
  return explicit.length + inherited.length;
}

// ---------- error codes, movement, coverage, trend (dashboard blocks) ----------

export function errorCodeDistribution() {
  const totals = {};
  const add = (code, n) => { totals[code] = (totals[code] || 0) + n; };
  const letterToCode = { K: 'knowledge', W: 'wording', M: 'maths', U: 'unit-conversion', P: 'presentation' };
  const diag = getState().diagnosticAttempts.slice(-1)[0];
  if (diag) for (const s of diag.sections || []) {
    for (const [letter, n] of Object.entries(s.codes || {})) if (n) add(letterToCode[letter], n);
  }
  for (const att of latestPerMock().values()) {
    for (const t of att.errorTags || []) add(t.code, t.marksLost);
  }
  return totals;
}

/** Tag transitions in the last `days`, plus modules with no activity at all in that window. */
export function movement(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const changes = [];
  for (const [itemId, t] of Object.entries(getState().confidence)) {
    const hist = t.history || [];
    const recent = hist.filter(h => h.at >= since);
    if (!recent.length) continue;
    const before = hist.filter(h => h.at < since).slice(-1)[0] || null;
    const from = before ? before.value : null;
    const to = recent.slice(-1)[0].value;
    if (from === to) continue;
    const info = index.itemInfo.get(itemId);
    if (!info) continue;
    changes.push({ itemId, info, from, to, at: recent.slice(-1)[0].at });
  }
  changes.sort((a, b) => (a.at < b.at ? 1 : -1));

  const activeModules = new Set();
  for (const c of changes) activeModules.add(c.info.moduleId);
  for (const a of getState().attempts) {
    if (a.at >= since) {
      const e = index.questionById.get(a.questionId);
      if (e) activeModules.add(e.moduleId);
    }
  }
  for (const att of getState().mockAttempts) if (att.at >= since) content.modules.forEach(m => activeModules.add(m.id));
  const stale = content.modules.filter(m => !activeModules.has(m.id)).map(m => m.id);
  return { changes, stale };
}

export function coverage() {
  const attempts = latestAttempts();
  return content.modules.map(mod => {
    const qs = [...mod.sections.understanding.questions, ...mod.sections.drill.questions];
    const attempted = qs.filter(q => attempts.has(q.itemId)).length;
    let tagged = 0, taggable = 0;
    for (const [itemId, info] of index.itemInfo) {
      if (info.moduleId !== mod.id) continue;
      taggable++;
      if (getTag(itemId)) tagged++;
    }
    let last = null;
    for (const [qid, a] of attempts) {
      const e = index.questionById.get(qid);
      if (e && e.moduleId === mod.id && (!last || a.at > last)) last = a.at;
    }
    for (const [itemId, t] of Object.entries(getState().confidence)) {
      const info = index.itemInfo.get(itemId);
      if (info && info.moduleId === mod.id && t.at && (!last || t.at > last)) last = t.at;
    }
    return { moduleId: mod.id, title: mod.title, attempted, totalQuestions: qs.length, tagged, taggable, lastActivity: last };
  });
}

export function mockTrend() {
  const rows = [];
  const diag = getState().diagnosticAttempts.slice(-1)[0];
  if (diag && content.diagnostic) {
    const total = (diag.sections || []).reduce((a, s) => a + s.score, 0);
    const max = content.diagnostic.sections.reduce((a, s) => a + s.marks, 0);
    rows.push({ id: 'diagnostic', title: 'Diagnostic', at: diag.at, score: total, marks: max, perQuestion: (diag.sections || []).map(s => ({ label: `§${s.letter}`, score: s.score, marks: content.diagnostic.sections.find(x => x.letter === s.letter)?.marks ?? 8 })) });
  }
  for (const mock of [...content.mocks, ...content.pastPapers]) {
    const att = latestPerMock().get(mock.id);
    if (!att) continue;
    rows.push({
      id: mock.id, title: mock.title, at: att.at,
      score: att.totalScore, marks: att.totalMarks, minutesTaken: att.minutesTaken,
      perQuestion: (att.questionScores || []).map(qs => {
        const q = mock.questions.find(x => x.number === qs.number);
        return { label: `Q${qs.number}`, topic: q ? q.topic : '', score: qs.score, marks: q ? q.marks : qs.marks };
      }),
    });
  }
  return rows;
}

// ---------- flashcard scheduling ----------

const msDay = 86400000;
// LOCAL calendar date, not UTC — during BST, toISOString() is yesterday until 1am
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const iso = localDate;

/** Interval per rating; compressed in the final week; never due after two days
 * before the exam (the taper — cheat sheets only from then). Derived from
 * meta.examDate so a rescheduled exam moves the whole scheme with it. */
export function nextDue(rating, today = new Date()) {
  // no exam date (long-haul revision subject): plain spaced intervals, no
  // taper and no compression — there is nothing to taper towards
  if (!content.meta?.examDate) {
    const days = rating === 'got-it' ? 7 : rating === 'partly' ? 3 : 1;
    return iso(new Date(today.getTime() + days * msDay));
  }
  const exam = new Date(content.meta.examDate + 'T12:00:00');
  const capDate = iso(new Date(exam.getTime() - 2 * msDay));
  const compressFrom = iso(new Date(exam.getTime() - 9 * msDay));
  const compress = iso(today) >= compressFrom;
  const days = rating === 'got-it' ? (compress ? 4 : 7) : rating === 'partly' ? (compress ? 2 : 3) : 1;
  let due = iso(new Date(today.getTime() + days * msDay));
  if (due > capDate) due = capDate;
  return due;
}

/** Cards scheduled for review today (or never seen). Used for the counts. */
export function dueCards(today = new Date(), moduleIds = null) {
  const t = iso(today);
  const st = getState();
  return cardQueue(today, moduleIds).filter(c => {
    const fc = st.flashcards[c.cardId];
    return !fc || fc.due <= t;
  });
}

/**
 * The full deck, always — nothing is ever hidden. Ratings only reorder:
 * due (or never-seen) cards first, then red before amber before untagged
 * before green, then by scheduled date. A card rated "got it" sinks towards
 * the back for a few days; it never disappears.
 */
export function cardQueue(today = new Date(), moduleIds = null) {
  const t = iso(today);
  const st = getState();
  const rank = { red: 0, amber: 1, null: 2, undefined: 2, green: 3 };
  const pool = moduleIds && moduleIds.length
    ? index.cards.filter(c => moduleIds.includes(c.moduleId))
    : index.cards;
  return [...pool].sort((a, b) => {
    const fa = st.flashcards[a.cardId], fb = st.flashcards[b.cardId];
    const dueA = !fa || fa.due <= t ? 0 : 1, dueB = !fb || fb.due <= t ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    const ea = effectiveTag(a.cardId), eb = effectiveTag(b.cardId);
    const ra = rank[ea ? ea.value : null], rb = rank[eb ? eb.value : null];
    if (ra !== rb) return ra - rb;
    const da = fa?.due || '0', db = fb?.due || '0';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

/** Days until this subject's exam, or null when no date is set. */
export function daysToExam(today = new Date()) {
  if (!content.meta?.examDate) return null;
  const exam = new Date(content.meta.examDate);
  return Math.max(0, Math.round((exam - today) / msDay));
}

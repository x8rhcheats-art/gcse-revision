// content.js — loads one subject's content/<subject>/*.json and builds the
// lookup indexes every other module relies on. Content is read-only after
// load; switching subject reloads the lot.

// Which subjects exist (from content/subjects.json) and which one is active.
export const registry = {
  subjects: [],   // [{ id, title, code, board, tagline, examDate, completePack }]
  activeId: null,
};

export function activeSubject() {
  return registry.subjects.find(s => s.id === registry.activeId) || null;
}

export const content = {
  modules: [],
  mocks: [],
  pastPapers: [],
  diagnostic: null,
  meta: null,
  mcq: {},          // moduleId -> [{id, q, options, answer, explain}]
  spec: [],         // 136 specification points, each mapped to its module(s)
  reference: null,  // exam day, formula sheet, technique rules, diagram checklists
  predictions: null, // what the past papers suggest is coming (may be null)
};

export const index = {
  moduleById: new Map(),
  mockById: new Map(),
  itemParent: new Map(),   // itemId -> parent itemId (inheritance chain for tags)
  itemInfo: new Map(),     // itemId -> { kind, label, moduleId, anchor }
  questionById: new Map(), // itemId -> { q, moduleId, kind }
  cards: [],               // flashcards: { cardId, moduleId, type, front, backHtml }
  searchDocs: [],          // { itemId, moduleId, kind, label, text }
};

export const SECTION_LABELS = {
  intel: 'What comes up',
  teach: 'How it actually works',
  sheet: 'Cheat sheet',
  understand: 'Understanding it',
  drill: 'Exam drill',
};

const stripTags = html => {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent.replace(/\s+/g, ' ').trim();
};

// Every card carries an explicit task so the front is never just a bare noun.
const CARD_PROMPTS = {
  equation: 'State the equation',
  definition: 'Define it — exact wording',
  vocabulary: 'This wording costs marks. What do you write instead?',
};

// Fronts that need more than the generic cleanup: either the extracted name is
// meaningless out of context, or it gives the answer away. Keyed by itemId so
// tag identity is untouched.
const CARD_FIXES = {
  '02-solids-liquids-gases/eq/on-the-formula-sheet-boyles-law': { front: 'Boyle’s law' },
  '02-solids-liquids-gases/eq/on-the-formula-sheet-pressure-law': { front: 'The pressure law' },
  '02-solids-liquids-gases/eq/both-directions': { front: 'Kelvin ↔ Celsius conversion, both directions' },
  '06-radioactivity/eq/alpha-decay-mass-4-atomic-2': {
    front: 'Alpha decay — what happens to mass and atomic number? Give an example equation',
    back: 'Mass −4, atomic −2 · ²³⁸₉₂U → ²³⁴₉₀Th + ⁴₂He',
  },
  '06-radioactivity/eq/beta-decay-mass-unchanged-atomic-1': {
    front: 'Beta decay — what happens to mass and atomic number? Give an example equation',
    back: 'Mass unchanged, atomic +1 · ¹⁴₆C → ¹⁴₇N + ⁰₋₁e',
  },
  '06-radioactivity/eq/gamma-emission-both-unchanged': {
    front: 'Gamma emission — what happens to mass and atomic number?',
    back: 'Both unchanged — gamma is energy, not particles',
  },
  '08-energy/eq/efficiency-memorise-the-wording-exactly': { front: 'Efficiency' },
};

/** Card front from an equation name: drop authoring qualifiers. */
function eqCardFront(name) {
  return name
    .replace(/^on the formula sheet\s*[—-]?\s*/i, '')
    .replace(/\s*[—-]\s*memorise.*$/i, '')
    .trim();
}

// Symbol keys live in tools/equation-glossary.json and arrive on each equation
// record as symbolKey, so the app, the phone copy and the PDF all say the same
// thing. Nothing about them is duplicated here.

// The offline single-file build embeds the content instead of serving it,
// because fetch() is blocked for file:// pages (which is how a phone opens it).
// Shape: { subjects: [...registry], content: { <subjectId>: { 'modules.json': {...}, ... } } }
const embedded = () => (typeof window !== 'undefined' ? window.__OFFLINE_CONTENT__ : null);

/** Which subjects exist. Must resolve before the first loadContent(). */
export async function loadRegistry() {
  const emb = embedded();
  if (emb && emb.subjects) { registry.subjects = emb.subjects; return; }
  const res = await fetch('content/subjects.json');
  if (!res.ok) throw new Error(`subjects.json: ${res.status}`);
  registry.subjects = (await res.json()).subjects;
}

export async function loadContent(subjectId) {
  const emb = embedded();
  const get = (f) => emb
    ? Promise.resolve(emb.content[subjectId][f])
    : fetch(`content/${subjectId}/${f}`).then(r => { if (!r.ok) throw new Error(`${subjectId}/${f}: ${r.status}`); return r.json(); });
  const [modules, mocks, meta, mcq, spec, reference, predictions] = await Promise.all(
    ['modules.json', 'mocks.json', 'meta.json', 'mcq.json', 'spec.json', 'reference.json', 'predictions.json'].map(get));
  registry.activeId = subjectId;
  content.mcq = mcq.modules;
  content.spec = spec.points;
  content.reference = reference;
  content.predictions = predictions;
  content.modules = modules.modules;
  content.mocks = mocks.mocks;
  content.pastPapers = mocks.pastPapers || [];
  content.diagnostic = mocks.diagnostic;
  content.meta = meta;
  buildIndexes();
}

function addItem(itemId, parent, info) {
  index.itemParent.set(itemId, parent);
  index.itemInfo.set(itemId, info);
}

function buildIndexes() {
  // switching subject rebuilds from scratch — stale entries from the previous
  // subject must never survive into the new one's lookups
  index.moduleById.clear();
  index.mockById.clear();
  index.itemParent.clear();
  index.itemInfo.clear();
  index.questionById.clear();
  index.cards.length = 0;
  index.searchDocs.length = 0;

  for (const mod of content.modules) {
    index.moduleById.set(mod.id, mod);
    addItem(mod.id, null, { kind: 'module', label: mod.title, moduleId: mod.id });

    for (const sec of ['intel', 'teach', 'sheet', 'understand', 'drill']) {
      if (sec === 'teach' && !mod.sections.teach) continue;
      addItem(`${mod.id}/section/${sec}`, mod.id, {
        kind: 'section', label: `${mod.title} — ${SECTION_LABELS[sec]}`, moduleId: mod.id,
      });
    }

    // The teaching section is prose only — taggable and searchable, but it
    // holds no equations or definitions of its own; those stay on the sheet so
    // they are defined in exactly one place.
    for (const sub of (mod.sections.teach ? mod.sections.teach.subsections : [])) {
      const label = sub.heading || 'Introduction';
      addItem(sub.itemId, `${mod.id}/section/teach`, { kind: 'teaching', label, moduleId: mod.id });
      index.searchDocs.push({
        itemId: sub.itemId, moduleId: mod.id, kind: 'how it works', label,
        text: (label + ' ' + stripTags(sub.html)).toLowerCase(),
      });
    }

    for (const sub of mod.sections.sheet.subsections) {
      const label = sub.heading || 'Cheat sheet introduction';
      addItem(sub.itemId, `${mod.id}/section/sheet`, { kind: 'sheet section', label, moduleId: mod.id });
      index.searchDocs.push({ itemId: sub.itemId, moduleId: mod.id, kind: 'cheat sheet', label, text: (label + ' ' + stripTags(sub.html)).toLowerCase() });

      for (const eq of sub.equations) {
        addItem(eq.itemId, sub.itemId, { kind: 'equation', label: eq.name, moduleId: mod.id });
        // no-name equation boxes (formula-sheet items, the EM spectrum order) would
        // make front===back cards — taggable and searchable, but not flashcards
        if (eq.name !== eq.formula) {
          const fix = CARD_FIXES[eq.itemId] || {};
          const note = eq.symbolKey;
          index.cards.push({
            cardId: eq.itemId, moduleId: mod.id, type: 'equation',
            prompt: CARD_PROMPTS.equation,
            front: fix.front || eqCardFront(eq.name),
            // structured too, so consumers never have to unpick the HTML
            formula: fix.back || eq.formula,
            symbolKey: note || null,
            backHtml: `<span class="eqtext">${fix.back || eq.formula}</span>` +
              (note ? `<div class="card-note">${note}</div>` : ''),
            meta: eq.mustMemorise ? 'must memorise' : (eq.onFormulaSheet ? 'on the formula sheet' : ''),
          });
        }
        index.searchDocs.push({ itemId: eq.itemId, moduleId: mod.id, kind: 'equation', label: eq.name, text: (eq.name + ' ' + eq.formula).toLowerCase() });
      }
      for (const def of sub.definitions) {
        addItem(def.itemId, sub.itemId, { kind: 'definition', label: def.term, moduleId: mod.id });
        index.cards.push({
          cardId: def.itemId, moduleId: mod.id, type: 'definition',
          prompt: CARD_PROMPTS.definition,
          front: def.term, backHtml: def.acceptedWording, meta: 'exact wording',
        });
        index.searchDocs.push({ itemId: def.itemId, moduleId: mod.id, kind: 'definition', label: def.term, text: (def.term + ' ' + stripTags(def.acceptedWording)).toLowerCase() });
      }
      for (const trap of sub.traps) {
        addItem(trap.itemId, sub.itemId, { kind: 'vocabulary', label: `“${trap.wrong}”`, moduleId: mod.id });
        index.cards.push({
          cardId: trap.itemId, moduleId: mod.id, type: 'vocabulary',
          prompt: CARD_PROMPTS.vocabulary,
          front: `“${trap.wrong}”`, backHtml: `Write: <strong>${trap.right}</strong>`, meta: 'costs marks',
        });
        index.searchDocs.push({ itemId: trap.itemId, moduleId: mod.id, kind: 'vocabulary', label: trap.wrong, text: (trap.wrong + ' ' + trap.right).toLowerCase() });
      }
    }

    for (const [kind, secId] of [['understanding', 'understand'], ['drill', 'drill']]) {
      for (const q of mod.sections[kind].questions) {
        addItem(q.itemId, `${mod.id}/section/${secId}`, {
          kind: kind === 'drill' ? 'drill question' : 'understanding question',
          label: `${mod.title} ${q.qid}`, moduleId: mod.id,
        });
        index.questionById.set(q.itemId, { q, moduleId: mod.id, kind });
        index.searchDocs.push({
          itemId: q.itemId, moduleId: mod.id, kind: kind === 'drill' ? 'drill' : 'understanding',
          label: `${q.qid}`, text: (stripTags(q.promptHtml) + ' ' + stripTags(q.answerHtml)).toLowerCase(),
        });
      }
    }
  }

  // Spec points hang off their module, so a module-level tag colours the whole
  // topic automatically and an individual point can still be overridden.
  for (const p of content.spec) {
    addItem(p.itemId, p.moduleIds[0] || null, {
      kind: 'spec point', label: `${p.code} ${p.text.slice(0, 70)}`, moduleId: p.moduleIds[0] || null,
    });
    index.searchDocs.push({
      itemId: p.itemId, moduleId: p.moduleIds[0] || null, kind: 'spec point',
      label: `${p.code} ${p.text.slice(0, 60)}`, text: `${p.code} ${p.text}`.toLowerCase(),
    });
  }

  // Technique rules are taggable but belong to no module — they are exam craft.
  // A subject without a reference pack yet simply has none.
  for (const r of (content.reference && content.reference.techniqueRules) || []) {
    addItem(r.itemId, null, { kind: 'technique rule', label: r.rule, moduleId: null });
    index.searchDocs.push({
      itemId: r.itemId, moduleId: null, kind: 'technique rule',
      label: r.rule, text: `${r.rule} ${r.detail}`.toLowerCase(),
    });
  }

  // MCQs feed the demonstrated signal (1 mark each, objective right/wrong).
  // Registered for evidence pooling only — not tagged, not in the red list.
  for (const [modId, qs] of Object.entries(content.mcq)) {
    for (const q of qs) {
      q.itemId = `${modId}/mcq/${q.id}`;
      index.questionById.set(q.itemId, { kind: 'mcq', marks: 1, moduleId: modId, label: `MCQ ${q.id}` });
    }
  }

  for (const exam of [...content.mocks, ...content.pastPapers]) {
    index.mockById.set(exam.id, exam);
    // real question totals: trust the per-question sum, not the header (mock-1 says 90, is 100)
    exam.computedMarks = exam.questions.reduce((a, q) => a + (q.marks || 0), 0);

    // every exam question is a taggable, self-rateable item: revision mode
    // uses these to feed both signals (tags -> red list, ratings -> evidence)
    for (const q of exam.questions) {
      const qItemId = `${exam.id}/q/${q.number}`;
      q.itemId = qItemId;
      const firstMod = (q.moduleIds && q.moduleIds[0]) || null;
      addItem(qItemId, firstMod, {
        kind: 'exam question',
        label: `${exam.title} Q${q.number} — ${q.topic}`,
        moduleId: firstMod,
      });
      index.questionById.set(qItemId, {
        kind: 'exam', marks: q.marks || 0, moduleIds: q.moduleIds || [],
        label: `${exam.title} Q${q.number} (${q.topic})`,
      });
    }
  }
}

/** Where a taggable item lives — not everything is inside a module. */
export function itemHref(itemId) {
  const info = index.itemInfo.get(itemId);
  const q = `?item=${encodeURIComponent(itemId)}`;
  if (!info) return '#/home';
  if (info.kind === 'technique rule') return `#/reference${q}`;
  if (info.kind === 'spec point') return `#/spec${q}`;
  if (info.kind === 'module') return `#/module/${itemId}`;
  return info.moduleId ? `#/module/${info.moduleId}${q}` : '#/home';
}

export function moduleTitle(moduleId) {
  const m = index.moduleById.get(moduleId);
  return m ? m.title : moduleId;
}

/**
 * Module selections travel in the URL as short module numbers ("mods=1,3,5"),
 * so a built session is bookmarkable and survives a reload.
 */
export function modsToParam(moduleIds) {
  return (moduleIds || [])
    .map(id => index.moduleById.get(id)?.number)
    .filter(Boolean)
    .sort((a, b) => a - b)
    .join(',');
}

export function paramToMods(param) {
  if (!param) return null;
  const nums = String(param).split(',').map(Number).filter(n => n > 0);
  if (!nums.length) return null;
  const ids = content.modules.filter(m => nums.includes(m.number)).map(m => m.id);
  return ids.length ? ids : null;
}

/** All modules ordered by exam weight, heaviest first. */
export function modulesByWeight() {
  return [...content.modules].sort((a, b) => (b.examWeight || 0) - (a.examWeight || 0));
}

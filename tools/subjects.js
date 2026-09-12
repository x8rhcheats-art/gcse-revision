/**
 * subjects.js — the one list of subjects and where each one's source material
 * lives. extract.js loops over this; adding a subject means adding an entry
 * here and creating the folders it names, nothing else.
 *
 * Every path is relative to the repo root. Optional fields simply omit a
 * feature for that subject (no diagnostic, no equation glossary, no exam date)
 * rather than requiring placeholder files.
 */
module.exports = {
  physics: {
    id: 'physics',
    title: 'Physics',
    code: '4PH1',
    board: 'Edexcel IGCSE Physics 4PH1',
    // shown under the subject name in the sidebar; per-subject because only
    // physics is a dated resit — the others are long-haul GCSE revision
    tagline: 'resit · 7 September',
    // longer form used on the subject's home screen
    standfirst: 'Resit Monday 7 September',
    modulesDir: 'site/modules/physics',
    mocksDir: 'site/mocks/physics',
    out: 'site/content/physics',
    mocks: [
      ['mock-1.html', 'mock-1-markscheme.html', 'mock-1'],
      ['mock-2.html', 'mock-2-markscheme.html', 'mock-2'],
    ],
    diagnostic: {
      paper: 'Claude AI Materials/01-diagnostic-paper.md',
      scheme: 'Claude AI Materials/02-diagnostic-markscheme.md',
      outDir: 'site/diagnostic/physics',
    },
    equationGlossary: 'tools/physics/equation-glossary.json',
    mcqBanks: ['tools/physics/mcq-bank-1.json', 'tools/physics/mcq-bank-2.json', 'tools/physics/mcq-bank-3.json'],
    specPoints: 'tools/physics/spec-points.json',
    examReference: 'tools/physics/exam-reference.json',
    predictions: 'tools/physics/predictions.json',
    pastPapers: ['tools/physics/past-papers.json', 'tools/physics/topic-tests.json'],
    pastPaperSchemes: ['tools/physics/past-papers-schemes.json', 'tools/physics/topic-tests-schemes.json'],
    examDate: '2026-09-07',
    // the printed revision plan lives in the physics landing page
    scheduleFrom: 'site/index.html',
    // physics-only extras surfaced in the app
    completePack: 'complete-pack.html',
    plannedModules: 9,
  },

  // Content for these two is being authored from the school material in
  // John School Materials/. Registered now so the app knows they exist;
  // everything inside them is optional until it does.
  chemistry: {
    id: 'chemistry',
    title: 'Chemistry',
    code: '4CH1',
    board: 'Edexcel IGCSE Chemistry 4CH1',
    standfirst: 'GCSE summer 2027 — long-haul revision, no exam date yet',
    modulesDir: 'site/modules/chemistry',
    mocksDir: 'site/mocks/chemistry',
    out: 'site/content/chemistry',
    mocks: [],
    specPoints: 'tools/chemistry/spec-points.json',
    examReference: 'tools/chemistry/exam-reference.json',
    predictions: 'tools/chemistry/predictions.json',
    pastPapers: 'tools/chemistry/past-papers.json',
    pastPaperSchemes: 'tools/chemistry/past-papers-schemes.json',
    mcqBanks: ['tools/chemistry/mcq-bank-1.json', 'tools/chemistry/mcq-bank-2.json', 'tools/chemistry/mcq-bank-3.json', 'tools/chemistry/mcq-bank-4.json', 'tools/chemistry/mcq-bank-5.json'],
    plannedModules: 10,
  },

  biology: {
    id: 'biology',
    title: 'Biology',
    code: '4BI1',
    board: 'Edexcel IGCSE Biology 4BI1',
    standfirst: 'GCSE summer 2027 — long-haul revision, no exam date yet',
    modulesDir: 'site/modules/biology',
    mocksDir: 'site/mocks/biology',
    out: 'site/content/biology',
    mocks: [],
  },
};

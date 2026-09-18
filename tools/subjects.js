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
    officialPapers: 'tools/physics/official-papers.json',
    pastPapers: ['tools/physics/past-papers.json', 'tools/physics/topic-tests.json', 'tools/physics/real-papers.json'],
    pastPaperSchemes: ['tools/physics/past-papers-schemes.json', 'tools/physics/topic-tests-schemes.json', 'tools/physics/real-papers-schemes.json'],
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
    officialPapers: 'tools/chemistry/official-papers.json',
    pastPapers: ['tools/chemistry/past-papers.json', 'tools/chemistry/real-papers.json'],
    pastPaperSchemes: ['tools/chemistry/past-papers-schemes.json', 'tools/chemistry/real-papers-schemes.json'],
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
    // The checklist for the Year 10 end-of-year exam defines modules 01-10;
    // modules 11-18 are the Year 11 half of the course, which that exam does
    // not cover. Both live in one subject — see the phase banner on each.
    specPoints: 'tools/biology/spec-points.json',
    mcqBanks: ['tools/biology/mcq-bank-1.json', 'tools/biology/mcq-bank-2.json', 'tools/biology/mcq-bank-3.json', 'tools/biology/mcq-bank-4.json', 'tools/biology/mcq-bank-6.json'],
    officialPapers: 'tools/biology/official-papers.json',
    pastPapers: ['tools/biology/past-papers.json', 'tools/biology/real-papers.json'],
    pastPaperSchemes: ['tools/biology/past-papers-schemes.json', 'tools/biology/real-papers-schemes.json'],
    plannedModules: 18,
    // Shown as headings in the module list. Year 10 is everything up to and
    // including human impacts; the Year 11 topics come after it.
    moduleGroups: [
      { title: 'Year 10', from: 1, to: 12 },
      { title: 'Year 11', from: 13, to: 18 },
    ],
  },
};

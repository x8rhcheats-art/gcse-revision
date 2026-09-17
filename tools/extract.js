#!/usr/bin/env node
/**
 * extract.js — one-shot content extraction for the revision app.
 *
 * Loops over every subject in tools/subjects.js. For each, reads its module
 * HTML files, mock papers + mark schemes, and (where configured) the
 * diagnostic markdown pair. Emits, per subject:
 *   site/content/<subject>/modules.json — canonical module content, itemIds embedded
 *   site/content/<subject>/mocks.json   — mocks + diagnostic structure
 *   site/content/<subject>/meta.json    — exam date, schedule, error codes
 *   site/content/<subject>/item-manifest.json — every taggable itemId (orphan checks)
 *   tools/validation-report-<subject>.md — everything the extractor is unsure about
 * plus the shared registry the app boots from:
 *   site/content/subjects.json
 *
 * Authoring-time tool only. The end user never runs this. Output is committed.
 * Tolerant of future content additions (e.g. inline <svg> figures): unknown
 * elements pass through untouched inside stored HTML.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { marked } = require('marked');
const equationsLib = require('./equations.js');
const SUBJECTS = require('./subjects.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');

// Per-subject state. Set by buildSubject() before any extraction runs; the
// helpers below read these rather than taking them as parameters, which keeps
// their signatures identical to the single-subject original.
let CFG = null;
let eqGlossary = equationsLib.none();
const warnings = [];
const info = [];
const manifest = [];

function warn(msg) { warnings.push(msg); }
function note(msg) { info.push(msg); }

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, m => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(m)))
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Register an itemId, de-duplicating within scope. */
const seenIds = new Set();
function itemId(...parts) {
  let id = parts.join('/');
  if (seenIds.has(id)) {
    let n = 2;
    while (seenIds.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
    warn(`itemId collision resolved by suffix: ${id}`);
  }
  seenIds.add(id);
  manifest.push(id);
  return id;
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

function parseMeta($) {
  const meta = { examWeight: null, specPoints: null, estimatedSessions: null, appearedIn: null };
  $('header .meta .tag').each((_, el) => {
    const t = $(el).text().trim();
    let m;
    if ((m = t.match(/~?(\d+)%\s*of marks/i))) meta.examWeight = Number(m[1]) / 100;
    else if ((m = t.match(/^Spec\s+(.*)$/i))) meta.specPoints = m[1].trim();
    else if ((m = t.match(/^Est\.\s+(.*)$/i))) meta.estimatedSessions = m[1].trim();
    else if ((m = t.match(/^Appeared in\s+(.*)$/i))) meta.appearedIn = m[1].trim();
  });
  return meta;
}

function extractPastPaperRefs($, section) {
  const refs = [];
  section.find('table').each((_, tbl) => {
    const firstTh = $(tbl).find('th').first().text().trim();
    if (firstTh !== 'Paper') return;
    $(tbl).find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 2) return;
      // e.g. "2024 Q7 (10)", "2025 Q3a (4)", "2024 Q2b–c (8)", "2023 Q2 (5–6)", "2024 Q2b, Q6a (9)",
      // and approximate chemistry totals like "2023 Q2a, Q4a, Q6e (~7)"
      const cell = $(tds[0]).text().trim();
      const m = cell.match(/^(\d{4})\s+(.+?)\s*\(~?([\d]+)(?:[–-](\d+))?\)$/);
      if (m) refs.push({
        paper: m[1], question: m[2],
        marks: Number(m[4] || m[3]),          // upper bound of a range
        topic: $(tds[1]).text().trim(),
      });
      else warn(`unparsed past-paper ref cell: "${cell}"`);
    });
  });
  return refs;
}

/** Section inner HTML with the h2 removed. */
function sectionHtml($, section) {
  const clone = section.clone();
  clone.find('h2').first().remove();
  return clone.html().trim();
}

function extractEquations($, container, moduleId) {
  const eqs = [];
  container.find('div.eq').each((_, el) => {
    const $el = $(el);
    const nameRaw = $el.find('.name').first().text().trim();
    // formula = text minus the name span
    const clone = $el.clone();
    clone.find('.name, .sym, .eq-line .sym').remove();   // a key already present is not part of the formula
    const formula = clone.text().trim();
    const mustMemorise = /memorise/i.test(nameRaw);
    const onFormulaSheet = /formula sheet/i.test(nameRaw);
    let name = nameRaw.replace(/\s*[—-]\s*memorise\s*$/i, '').replace(/^on the formula sheet$/i, '').trim();
    let slug = slugify(name);
    if (!slug) { name = formula; slug = slugify(formula); }
    const id = itemId(moduleId, 'eq', slug);
    $el.attr('data-item-id', id);
    eqs.push({ itemId: id, name, formula, mustMemorise, onFormulaSheet, symbolKey: eqGlossary.keyFor(formula) });
  });
  return eqs;
}

function extractDefinitions($, tbl, moduleId) {
  const defs = [];
  $(tbl).find('tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 2) return;
    const term = $(tds[0]).text().trim();
    const id = itemId(moduleId, 'def', slugify(term));
    $(tr).attr('data-item-id', id);
    defs.push({ itemId: id, term, acceptedWording: $(tds[1]).html().trim() });
  });
  return defs;
}

function extractTraps($, tbl, moduleId) {
  const traps = [];
  $(tbl).find('tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 2) return;
    const wrong = $(tds[0]).text().trim();
    const id = itemId(moduleId, 'trap', slugify(wrong));
    $(tr).attr('data-item-id', id);
    traps.push({ itemId: id, wrong, right: $(tds[1]).text().trim() });
  });
  return traps;
}

function classifyTable($, tbl) {
  const ths = $(tbl).find('th').map((_, th) => $(th).text().trim()).get();
  if (ths[0] === 'Term') return 'definitions';
  const hasNoYes = $(tbl).find('td.no').length > 0 && $(tbl).find('td.yes').length > 0;
  if (hasNoYes || (ths[0] === "Don't write" && ths[1] === 'Write')) return 'traps';
  return 'generic';
}

/**
 * Cheat sheet → ordered subsections split on h3, typed itemisation where
 * signatures match. The teaching section has the same shape — h3-delimited
 * prose with the occasional table — so it reuses this with its own item type,
 * which keeps its headings independently taggable.
 */
function extractSheet($, section, moduleId, type = 'sheet') {
  const subsections = [];
  const children = section.children().toArray();
  let current = null;
  const flush = () => { if (current) { subsections.push(current); current = null; } };

  for (const el of children) {
    const tag = el.tagName && el.tagName.toLowerCase();
    if (tag === 'h2') continue;
    if (tag === 'h3') {
      flush();
      const heading = $(el).text().trim();
      current = { heading, slug: slugify(heading), nodes: [] };
      continue;
    }
    if (!current) current = { heading: null, slug: 'intro', nodes: [] };
    current.nodes.push(el);
  }
  flush();

  return subsections.map(sub => {
    const id = itemId(moduleId, type, sub.slug);
    // wrap nodes in a temp container for typed extraction + annotated html
    const $wrap = $('<div></div>');
    for (const n of sub.nodes) $wrap.append($(n));
    const equations = extractEquations($, $wrap, moduleId);
    const definitions = [];
    const traps = [];
    $wrap.find('table').each((_, tbl) => {
      const kind = classifyTable($, tbl);
      if (kind === 'definitions') definitions.push(...extractDefinitions($, tbl, moduleId));
      else if (kind === 'traps') traps.push(...extractTraps($, tbl, moduleId));
    });
    return {
      itemId: id,
      heading: sub.heading,
      html: eqGlossary.injectIntoHtml($wrap.html().trim()),
      equations, definitions, traps,
    };
  });
}

/** Parse a .q block into a question object. kind: 'understanding' | 'drill' */
function extractQuestion($, qEl, moduleId, kind) {
  const $q = $(qEl);
  const qid = $q.find('.qid').first().text().trim();
  const id = itemId(moduleId, kind, qid);
  const $body = $q.find('.qbody').first().clone();

  const $ans = $body.find('details.ans').first();
  const answerHtml = $ans.find('.inner').first().html()?.trim() ?? '';
  $body.find('details.ans').remove();

  let hint = null;
  const $hint = $body.find('p.hint').first();
  if ($hint.length) {
    const hc = $hint.clone();
    hc.find('b').remove();
    hint = hc.text().trim();
    $body.find('p.hint').remove();
  }

  const promptHtml = $body.html().trim();

  const q = { itemId: id, qid, promptHtml, hint, answerHtml };

  if (kind === 'drill') {
    // total marks: sum of (n) in .marks spans within the prompt
    let marks = 0;
    $(qEl).find('.qbody > p .marks, .qbody > .marks').each((_, el) => {
      const m = $(el).text().match(/\((\d+)\)/);
      if (m && !$(el).parents('details').length) marks += Number(m[1]);
    });
    q.marks = marks;

    // mark scheme, best-effort: each p/li containing .mp spans
    const scheme = [];
    let mpTotal = 0;
    $ans.find('.inner').find('p, li').each((_, el) => {
      const mps = $(el).find('.mp').length;
      if (!mps) return;
      mpTotal += mps;
      const clone = $(el).clone();
      clone.find('.mp').remove();
      scheme.push({ point: clone.text().trim().replace(/\s+/g, ' '), marks: mps });
    });
    q.markScheme = scheme;
    q.mpTotal = mpTotal;
    if (marks !== mpTotal) warn(`${id}: prompt marks (${marks}) != mark points (${mpTotal})`);
    if (marks === 0) warn(`${id}: no marks found in prompt`);
  }
  return q;
}

function extractModule(file) {
  const html = fs.readFileSync(path.join(ROOT, CFG.modulesDir, file), 'utf8');
  const $ = cheerio.load(html);
  const moduleId = file.replace(/\.html$/, '');
  const number = Number(($('header .eyebrow').text().match(/Module (\d+)/) || [])[1]) || null;
  const title = $('header h1').first().text().trim();
  const standfirst = $('header .standfirst').first().text().trim();
  const meta = parseMeta($);

  itemId(moduleId); // whole-module tag target

  const sections = {};
  for (const secId of ['intel', 'sheet', 'understand', 'drill']) {
    if (!$(`section#${secId}`).length) warn(`${moduleId}: missing section #${secId}`);
    else itemId(moduleId, 'section', secId);
  }

  const $intel = $('section#intel');
  sections.intel = { html: null, pastPaperRefs: extractPastPaperRefs($, $intel) };

  // The teaching section is being written module by module, so a module without
  // one is expected rather than an error — the view simply omits it.
  // Any lead-in paragraph before the first h3 becomes an unheaded subsection,
  // exactly as it does for the cheat sheet — so there is no separate intro
  // field to render twice.
  const $teach = $('section#teach');
  if ($teach.length) {
    itemId(moduleId, 'section', 'teach');
    sections.teach = { subsections: extractSheet($, $teach, moduleId, 'teach') };
  } else {
    sections.teach = null;
  }

  const $sheet = $('section#sheet');
  sections.sheet = { subsections: extractSheet($, $sheet, moduleId) };
  // intel html captured AFTER sheet so annotations don't matter there; intel has none.
  // A subject with no past papers yet has nothing to put in this section, so a
  // module without one is expected rather than fatal — the view omits it.
  sections.intel.html = $intel.length ? sectionHtml($, $intel) : null;

  sections.understanding = { questions: [] };
  $('section#understand .q').each((_, q) => {
    sections.understanding.questions.push(extractQuestion($, q, moduleId, 'understanding'));
  });
  const $uIntro = $('section#understand > p').first();
  sections.understanding.intro = $uIntro.length ? $uIntro.html().trim() : null;

  sections.drill = { questions: [] };
  $('section#drill .q').each((_, q) => {
    sections.drill.questions.push(extractQuestion($, q, moduleId, 'drill'));
  });
  const $dIntro = $('section#drill > p').first();
  sections.drill.intro = $dIntro.length ? $dIntro.html().trim() : null;

  // Typed items are pulled from the teaching section as well as the cheat sheet,
  // so count both — a module that keeps its equations inline in the teaching
  // prose was previously reported as having none.
  const allSubs = [...(sections.teach ? sections.teach.subsections : []), ...sections.sheet.subsections];
  const total = key => allSubs.reduce((a, s) => a + s[key].length, 0);
  note(`${moduleId}: ${sections.teach ? sections.teach.subsections.length : 0} teach subsections, ` +
    `${sections.sheet.subsections.length} sheet subsections, ` +
    `${total('equations')} eq, ${total('definitions')} def, ${total('traps')} trap, ` +
    `${sections.understanding.questions.length} understanding, ${sections.drill.questions.length} drill`);

  return {
    id: moduleId, number, title, standfirst,
    examWeight: meta.examWeight, specPoints: meta.specPoints,
    estimatedSessions: meta.estimatedSessions, appearedIn: meta.appearedIn,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function extractMock(paperFile, schemeFile, mockId) {
  const $p = cheerio.load(fs.readFileSync(path.join(ROOT, CFG.mocksDir, paperFile), 'utf8'));
  const $s = cheerio.load(fs.readFileSync(path.join(ROOT, CFG.mocksDir, schemeFile), 'utf8'));

  const title = $p('header h1').first().text().trim();
  let totalMarks = null, minutes = null, targetDate = null;
  $p('header .meta .tag').each((_, el) => {
    const t = $p(el).text().trim();
    let m;
    if ((m = t.match(/^(\d+)\s*marks$/i))) totalMarks = Number(m[1]);
    else if ((m = t.match(/^(\d+)\s*minutes$/i))) minutes = Number(m[1]);
    else if ((m = t.match(/^Target:\s*(\d+)\s+Aug$/i))) targetDate = `2026-08-${String(m[1]).padStart(2, '0')}`;
  });

  // instructions + formulae panel: the section whose num is not "Question N"
  let instructionsHtml = null;
  const questions = [];

  $p('section').each((_, sec) => {
    const $sec = $p(sec);
    const num = $sec.find('h2 .num').first().text().trim();
    const qm = num.match(/^Question (\d+)$/);
    if (!qm) {
      const clone = $sec.clone(); clone.find('h2').remove();
      instructionsHtml = eqGlossary.injectIntoHtml(clone.html().trim());
      return;
    }
    const $h2 = $sec.find('h2').first();
    const marksM = $h2.find('.marks').last().text().match(/\((\d+)\s*marks?\)/);
    const h2c = $h2.clone(); h2c.find('.num, .marks').remove();
    const clone = $sec.clone(); clone.find('h2').remove();
    questions.push({
      number: Number(qm[1]),
      topic: h2c.text().trim(),
      marks: marksM ? Number(marksM[1]) : null,
      promptHtml: clone.html().trim(),
      moduleIds: [], markSchemeHtml: null, schemeNoteHtml: null,
    });
  });

  // mark scheme sections: num "Q1" etc; module links in h2
  $s('section').each((_, sec) => {
    const $sec = $s(sec);
    const num = $sec.find('h2 .num').first().text().trim();
    const qm = num.match(/^Q(\d+)$/);
    if (!qm) return;
    const q = questions.find(x => x.number === Number(qm[1]));
    if (!q) { warn(`${mockId}: scheme has Q${qm[1]} but paper does not`); return; }
    const moduleIds = [];
    $sec.find('h2 a[href]').each((_, a) => {
      const base = path.basename($s(a).attr('href'), '.html');
      if (base.match(/^\d\d-/)) moduleIds.push(base);
    });
    q.moduleIds = moduleIds;
    const clone = $sec.clone(); clone.find('h2').remove();
    q.markSchemeHtml = clone.html().trim();
    if (!moduleIds.length) warn(`${mockId} Q${q.number}: no module links found in scheme heading`);
  });

  const sum = questions.reduce((a, q) => a + (q.marks || 0), 0);
  if (sum !== totalMarks) warn(`${mockId}: question marks sum to ${sum}, header says ${totalMarks}`);
  for (const q of questions) {
    if (q.marks == null) warn(`${mockId} Q${q.number}: no marks parsed`);
    if (!q.markSchemeHtml) warn(`${mockId} Q${q.number}: no mark scheme section matched`);
  }
  note(`${mockId}: ${questions.length} questions, ${sum} marks`);

  return { id: mockId, kind: 'mock', title, totalMarks, minutes, targetDate, instructionsHtml, questions };
}

// ---------------------------------------------------------------------------
// Diagnostic (markdown pair)
// ---------------------------------------------------------------------------

const DIAG_MODULE_MAP = {
  'forces and motion': '01-forces-and-motion',
  'energy': '08-energy',
  'waves and the electromagnetic spectrum': '04-waves-and-em-spectrum',
  'static electricity': '05-static-electricity',
  'electrical circuits': '03-electrical-circuits',
  'solids, liquids and gases': '02-solids-liquids-gases',
  'radioactivity': '06-radioactivity',
  'practical and data skills': '07-practical-and-data-skills',
};

function extractDiagnostic(paperMd, schemeMd) {
  const src = fs.readFileSync(paperMd, 'utf8');
  const sections = [];
  const secRe = /^## Section ([A-H]) — (.+)$/gm;
  let m;
  const bounds = [];
  while ((m = secRe.exec(src))) bounds.push({ letter: m[1], title: m[2].trim(), start: m.index });
  bounds.forEach((b, i) => {
    const end = i + 1 < bounds.length ? bounds[i + 1].start : src.length;
    const body = src.slice(b.start, end);
    const questions = [];
    const qRe = /\*\*([A-H]\d(?:\s*\([a-z]\))?)\*\*[\s\S]*?\*\*\((\d+)\)\*\*/g;
    let qm;
    while ((qm = qRe.exec(body))) {
      questions.push({ id: qm[1].replace(/\s/g, ''), marks: Number(qm[2]) });
    }
    const moduleId = DIAG_MODULE_MAP[b.title.toLowerCase()] || null;
    if (!moduleId) warn(`diagnostic: no module mapping for section "${b.title}"`);
    const marks = questions.reduce((a, q) => a + q.marks, 0);
    if (marks !== 8) warn(`diagnostic section ${b.letter} (${b.title}): marks sum to ${marks}, expected 8`);
    sections.push({ letter: b.letter, title: b.title, moduleId, marks, questions });
  });
  if (sections.length !== 8) warn(`diagnostic: found ${sections.length} sections, expected 8`);
  note(`diagnostic: ${sections.length} sections, ${sections.reduce((a, s) => a + s.marks, 0)} marks`);
  return {
    id: 'diagnostic', kind: 'diagnostic',
    title: 'Diagnostic Assessment', totalMarks: 64, minutes: 70,
    targetDate: '2026-08-09',
    sections,
  };
}

/** Render the diagnostic md pair as styled fallback pages in the subject's diagnostic dir. */
function renderDiagnosticPages(paperMd, schemeMd) {
  const outDir = path.join(ROOT, CFG.diagnostic.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const page = (title, eyebrow, standfirst, bodyHtml, extraNav = '') => `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — IGCSE Physics 4PH1</title>
<link rel="stylesheet" href="../../assets/style.css">
<style>.md h2{font-size:24px}.md blockquote{border-left:3px solid var(--rule);margin:0 0 16px;padding:4px 0 4px 16px;color:var(--ink-soft)}.md hr{border:0;border-top:1px solid var(--rule);margin:32px 0}</style>
</head>
<body>
<div class="sheet">
<header class="top">
  <p class="eyebrow">${eyebrow}</p>
  <h1>${title}</h1>
  <p class="standfirst">${standfirst}</p>
</header>
<nav class="jump">
  <a href="../../index.html">← All modules</a>
  ${extraNav}
</nav>
<div class="md">
${bodyHtml}
</div>
<footer>${title} · Edexcel IGCSE Physics 4PH1</footer>
</div>
</body>
</html>
`;
  const paperSrc = fs.readFileSync(paperMd, 'utf8').replace(/^# .+\n/, '');
  const schemeSrc = fs.readFileSync(schemeMd, 'utf8').replace(/^# .+\n/, '');
  fs.writeFileSync(path.join(outDir, 'diagnostic.html'), page(
    'Diagnostic Assessment', 'Diagnostic · Edexcel IGCSE Physics 4PH1',
    'Sat on paper, 8–9 August. 64 marks, 70 minutes. The result decides where the next three weeks go.',
    marked.parse(paperSrc), '<a href="diagnostic-markscheme.html">Mark scheme</a>'));
  fs.writeFileSync(path.join(outDir, 'diagnostic-markscheme.html'), page(
    'Diagnostic — Mark Scheme', 'Diagnostic · Mark Scheme and Analysis',
    'Mark each question, code every lost mark, and enter the results in the app.',
    marked.parse(schemeSrc), '<a href="diagnostic.html">The paper</a>'));
  note('diagnostic: rendered site/diagnostic/diagnostic.html and diagnostic-markscheme.html');
}

// ---------------------------------------------------------------------------
// Schedule (from index.html) + meta
// ---------------------------------------------------------------------------

function extractSchedule(fromFile) {
  const $ = cheerio.load(fs.readFileSync(path.join(ROOT, fromFile), 'utf8'));
  const rows = [];
  $('#plan table tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length === 2) rows.push({ dates: $(tds[0]).text().trim(), what: $(tds[1]).text().trim() });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Run — once per subject in tools/subjects.js
// ---------------------------------------------------------------------------

function buildSubject(cfg) {
  // reset per-subject state (arrays/sets are shared module-level references)
  CFG = cfg;
  eqGlossary = cfg.equationGlossary
    ? equationsLib.load(path.join(ROOT, cfg.equationGlossary))
    : equationsLib.none();
  warnings.length = 0;
  info.length = 0;
  manifest.length = 0;
  seenIds.clear();

  const OUT = path.join(ROOT, cfg.out);

  const moduleFiles = fs.readdirSync(path.join(ROOT, cfg.modulesDir))
    .filter(f => f.endsWith('.html')).sort();
  const modules = moduleFiles.map(extractModule);

  const mocks = (cfg.mocks || []).map(([paper, scheme, id]) => extractMock(paper, scheme, id));

  let diagnostic = null;
  if (cfg.diagnostic) {
    diagnostic = extractDiagnostic(
      path.join(ROOT, cfg.diagnostic.paper),
      path.join(ROOT, cfg.diagnostic.scheme));
    renderDiagnosticPages(
      path.join(ROOT, cfg.diagnostic.paper),
      path.join(ROOT, cfg.diagnostic.scheme));
  }

  const meta = {
    examDate: cfg.examDate || null,
    errorCodes: [
      { code: 'knowledge', letter: 'K', label: 'Knowledge gap' },
      { code: 'wording', letter: 'W', label: 'Knew it, worded it imprecisely' },
      { code: 'maths', letter: 'M', label: 'Maths error' },
      { code: 'unit-conversion', letter: 'U', label: 'Unit conversion missed' },
      { code: 'presentation', letter: 'P', label: 'Presentation — units, sig figs, formula not stated' },
    ],
    schedule: cfg.scheduleFrom ? extractSchedule(cfg.scheduleFrom) : [],
  };

  // Past papers: hand-authored structure (the source PDFs/DOCX are image-heavy),
  // cross-checked against the papers' own totals. Files staged in site/papers/.
  let pastPapers = [];
  if (cfg.pastPapers) {
    // one file or several — a subject can keep real past papers and school
    // topic tests in separate files and have them merge into one list
    const paperFiles = [].concat(cfg.pastPapers);
    const schemeFiles = [].concat(cfg.pastPaperSchemes || []);
    pastPapers = paperFiles.flatMap(f =>
      JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).papers);
    const paperSchemes = Object.assign({}, ...schemeFiles.map(f =>
      JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).schemes));
    for (const p of pastPapers) {
      const sum = p.questions.reduce((a, q) => a + q.marks, 0);
      if (sum !== p.totalMarks) warn(`${p.id}: question marks sum to ${sum}, expected ${p.totalMarks}`);
      // a null file means "no PDF exists for this one" (e.g. a docx-only mark
      // scheme) — the app hides the link; only real paths are checked
      for (const f of [p.paperFile, p.markSchemeFile].filter(Boolean)) {
        if (!fs.existsSync(path.join(SITE, f))) warn(`${p.id}: missing file ${f}`);
      }
      for (const q of p.questions) {
        q.markSchemeHtml = (paperSchemes[p.id] || {})[String(q.number)] || null;
        if (!q.markSchemeHtml) warn(`${p.id} Q${q.number}: no transcribed mark scheme`);
      }
    }
    note(`past papers: ${pastPapers.length} papers, ${pastPapers.reduce((a, p) => a + p.questions.length, 0)} questions`);
  }

  // MCQ bank: authored in tools/<subject>/mcq-bank-*.json, validated here.
  // A module may span several bank files; later files APPEND to it, and ids
  // must stay unique across the whole merged set.
  const mcqModules = {};
  const mcqSeenIds = {};
  for (const f of cfg.mcqBanks || []) {
    const bank = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).modules;
    for (const [modId, qs] of Object.entries(bank)) {
      if (!modules.find(m => m.id === modId)) { warn(`mcq: unknown module ${modId}`); continue; }
      const ids = (mcqSeenIds[modId] = mcqSeenIds[modId] || new Set());
      for (const q of qs) {
        if (ids.has(q.id)) warn(`mcq ${modId}/${q.id}: duplicate id`);
        ids.add(q.id);
        if (!Array.isArray(q.options) || q.options.length !== 4) warn(`mcq ${modId}/${q.id}: needs exactly 4 options`);
        if (!(q.answer >= 0 && q.answer <= 3)) warn(`mcq ${modId}/${q.id}: bad answer index`);
        if (!q.explain) warn(`mcq ${modId}/${q.id}: missing explanation`);
      }
      mcqModules[modId] = (mcqModules[modId] || []).concat(qs);
    }
  }
  note(`mcq bank: ${Object.values(mcqModules).reduce((a, qs) => a + qs.length, 0)} questions across ${Object.keys(mcqModules).length} modules`);

  // Specification tick-sheet (parsed from the info pack by parse-spec.js) and the
  // exam reference pack. Spec points hang off their module so tags inherit.
  let specPoints = [];
  if (cfg.specPoints) {
    specPoints = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.specPoints), 'utf8')).points;
    for (const p of specPoints) {
      if (!p.moduleIds.length) { warn(`spec ${p.code}: no module mapping`); continue; }
      for (const mid of p.moduleIds) {
        if (!modules.find(m => m.id === mid)) warn(`spec ${p.code}: unknown module ${mid}`);
      }
      p.itemId = `spec/${p.code}`;
      manifest.push(p.itemId);
    }
    note(`spec tick-sheet: ${specPoints.length} points across ${new Set(specPoints.map(p => p.topic)).size} topics`);
  }

  let reference = null;
  if (cfg.examReference) {
    reference = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.examReference), 'utf8'));
    // formulaSheet symbol keys: the reference sheet shows formulas, so it explains them too
    for (const f of (reference.formulaSheet || {}).given || []) f.symbolKey = eqGlossary.keyFor(f.symbols);
    for (const r of reference.techniqueRules || []) {
      r.itemId = `technique/${r.id}`;
      manifest.push(r.itemId);
    }
    note(`exam reference: ${(reference.techniqueRules || []).length} technique rules, ` +
      `${(reference.diagramChecklists || []).length} diagram checklists, ${((reference.formulaSheet || {}).given || []).length} given formulae`);
  }

  // Exam predictions: authored per subject from its own past papers. Every
  // claim carries its evidence, and the view labels the whole page a
  // prediction — so an absent file simply hides the page.
  let predictions = null;
  if (cfg.predictions) {
    predictions = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.predictions), 'utf8'));
    const bands = predictions.bands || [];
    const items = bands.reduce((a, b) => a + (b.items || []).length, 0);
    for (const b of bands) {
      for (const it of b.items || []) {
        if (!it.evidence) warn(`prediction "${it.claim}": no evidence cited`);
        for (const mid of it.moduleIds || []) {
          if (!modules.find(m => m.id === mid)) warn(`prediction "${it.claim}": unknown module ${mid}`);
        }
      }
    }
    note(`predictions: ${items} items across ${bands.length} bands`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'predictions.json'), JSON.stringify(predictions, null, 1));
  fs.writeFileSync(path.join(OUT, 'spec.json'), JSON.stringify({ points: specPoints }, null, 1));
  fs.writeFileSync(path.join(OUT, 'reference.json'), JSON.stringify(reference, null, 1));
  fs.writeFileSync(path.join(OUT, 'mcq.json'), JSON.stringify({ modules: mcqModules }, null, 1));
  fs.writeFileSync(path.join(OUT, 'modules.json'), JSON.stringify({ modules }, null, 1));
  fs.writeFileSync(path.join(OUT, 'mocks.json'), JSON.stringify({ mocks, diagnostic, pastPapers }, null, 1));
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  fs.writeFileSync(path.join(OUT, 'item-manifest.json'), JSON.stringify({ itemIds: manifest }, null, 1));

  const report = `# Extraction validation report — ${cfg.title}

Generated ${new Date().toISOString()} from ${moduleFiles.length} modules, ${mocks.length} mocks, ${diagnostic ? 1 : 0} diagnostic.

## Counts
${info.map(l => `- ${l}`).join('\n')}
- taggable itemIds: ${manifest.length}

## Formula symbol keys
${eqGlossary.report("coverage")}

## Warnings (${warnings.length})
${warnings.length ? warnings.map(l => `- ${l}`).join('\n') : '- none'}
`;
  fs.writeFileSync(path.join(__dirname, `validation-report-${cfg.id}.md`), report);
  console.log(report);

  // headline numbers for the landing page — embedded in the registry so the
  // app never has to load a subject's content just to describe it
  return {
    moduleCount: modules.length,
    mcqCount: Object.values(mcqModules).reduce((a, qs) => a + qs.length, 0),
    paperCount: mocks.length + pastPapers.length + (diagnostic ? 1 : 0),
  };
}

const stats = {};
for (const cfg of Object.values(SUBJECTS)) stats[cfg.id] = buildSubject(cfg);

// The registry the app boots from: which subjects exist and how each presents
// itself. Generated so it cannot drift from what was actually extracted.
const registry = Object.values(SUBJECTS).map(cfg => ({
  id: cfg.id,
  title: cfg.title,
  code: cfg.code,
  board: cfg.board,
  tagline: cfg.tagline || null,
  standfirst: cfg.standfirst || null,
  examDate: cfg.examDate || null,
  completePack: cfg.completePack || null,
  plannedModules: cfg.plannedModules || null,
  moduleGroups: cfg.moduleGroups || null,
  // links to the board's real papers — small, so they ride in the registry
  officialPapers: cfg.officialPapers
    ? JSON.parse(fs.readFileSync(path.join(ROOT, cfg.officialPapers), 'utf8'))
    : null,
  ...stats[cfg.id],
}));
fs.writeFileSync(path.join(SITE, 'content', 'subjects.json'),
  JSON.stringify({ subjects: registry }, null, 1));
console.log(`wrote site/content/subjects.json — ${registry.length} subject(s): ${registry.map(s => s.id).join(', ')}`);

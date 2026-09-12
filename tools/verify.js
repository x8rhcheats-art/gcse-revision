#!/usr/bin/env node
/**
 * verify.js — round-trip check that extraction dropped nothing.
 *
 * For every module and mock, every text chunk in the original HTML's content
 * sections must appear somewhere in the JSON-derived text. Reorganisation is
 * fine; loss is not.
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const SUBJECTS = require('./subjects.js');

const ROOT = path.resolve(__dirname, '..');
const norm = s => s.replace(/\s+/g, ' ').trim();

/**
 * Text of extracted HTML, with the symbol keys we add stripped out — they are
 * new material, not original content, and would otherwise sit between the
 * formulas of a multi-formula block and break a contiguous match.
 */
const textOf = (html) => {
  if (!html) return '';
  const $ = cheerio.load(`<div>${html}</div>`);
  $('.sym').remove();
  return norm($('div').first().text());
};

// Whitespace is ignored when comparing: splitting one formula block into one
// line per formula is a deliberate restructure, not a loss of content.
const squash = s => s.replace(/\s+/g, '');

let failures = 0;

function checkContainment(label, originalChunks, blob) {
  const squashedBlob = squash(blob);
  const missing = originalChunks.filter(c =>
    c.length > 3 && !blob.includes(c) && !squashedBlob.includes(squash(c)));
  if (missing.length) {
    failures += missing.length;
    console.log(`FAIL ${label}: ${missing.length} missing chunk(s)`);
    missing.slice(0, 5).forEach(c => console.log(`   ✗ "${c.slice(0, 100)}"`));
  }
}

// chunks = normalized text of each leaf-ish element in the original sections
function chunksOf($, sel) {
  $('.sym').remove();   // symbol keys are new material, not original content
  const out = [];
  $(sel).find('p, li, td, th, h3, h4, .eq, summary').each((_, el) => {
    const t = norm($(el).clone().children('ul,ol,table,div,details').remove().end().text());
    if (t) out.push(t);
  });
  return out;
}

function verifySubject(cfg) {
const modulesJson = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.out, 'modules.json'), 'utf8'));
const mocksJson = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.out, 'mocks.json'), 'utf8'));

for (const mod of modulesJson.modules) {
  const orig = fs.readFileSync(path.join(ROOT, cfg.modulesDir, `${mod.id}.html`), 'utf8');
  const $ = cheerio.load(orig);

  const parts = [];
  parts.push(textOf(mod.sections.intel.html));
  for (const s of mod.sections.sheet.subsections) {
    if (s.heading) parts.push(norm(s.heading));
    parts.push(textOf(s.html));
  }
  for (const kind of ['understanding', 'drill']) {
    const sec = mod.sections[kind];
    if (sec.intro) parts.push(textOf(sec.intro));
    for (const q of sec.questions) {
      parts.push(q.qid, textOf(q.promptHtml), q.hint ? norm(q.hint) : '', textOf(q.answerHtml));
    }
  }
  const blob = parts.join(' ▪ ');

  const origChunks = [
    ...chunksOf($, 'section#intel'),
    ...chunksOf($, 'section#sheet'),
    ...chunksOf($, 'section#understand'),
    ...chunksOf($, 'section#drill'),
  ].filter(c => c !== 'Show answer' && !/^Think about/.test(c) === false || c !== 'Show answer');

  // simpler: drop known chrome strings
  const chrome = new Set(['Show answer']);
  checkContainment(mod.id, origChunks.filter(c => !chrome.has(c)).map(c => c.replace(/^Think about\s*/, '')), blob);
}

for (const mock of mocksJson.mocks) {
  const $p = cheerio.load(fs.readFileSync(path.join(ROOT, cfg.mocksDir, `${mock.id}.html`), 'utf8'));
  const $s = cheerio.load(fs.readFileSync(path.join(ROOT, cfg.mocksDir, `${mock.id}-markscheme.html`), 'utf8'));
  const blob = [
    textOf(mock.instructionsHtml),
    ...mock.questions.flatMap(q => [q.topic, textOf(q.promptHtml), textOf(q.markSchemeHtml)]),
  ].join(' ▪ ');
  const chunks = [...chunksOf($p, 'section'), ...chunksOf($s, 'section')]
    // the scheme's scoring-grid + "reading the result" section is not per-question data; skip #grid
    .filter(c => c.length > 3);
  const gridChunks = new Set(chunksOf($s, 'section#grid'));
  checkContainment(mock.id, chunks.filter(c => !gridChunks.has(c)), blob);
}
}

for (const cfg of Object.values(SUBJECTS)) verifySubject(cfg);

console.log(failures === 0 ? 'VERIFY OK — no content lost' : `VERIFY: ${failures} missing chunks`);
process.exit(failures ? 1 : 0);

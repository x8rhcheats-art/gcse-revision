#!/usr/bin/env node
/**
 * module-brief.js — everything needed to write a module's teaching section,
 * gathered in one place: its spec points, every past-paper and mock question
 * that touches it with the mark scheme, and what the module already contains.
 *
 * This exists so teaching content is written against the evidence rather than
 * from memory. If a heading cannot cite a spec point or a question from here,
 * it does not belong in the module.
 *
 *   node module-brief.js 01-forces-and-motion
 */
const path = require('path');
const C = path.join(__dirname, '..', 'site', 'content');

const target = process.argv[2];
if (!target) {
  const mods = require(path.join(C, 'modules.json')).modules;
  console.log('usage: node module-brief.js <moduleId>\n');
  for (const m of mods) console.log('  ' + m.id);
  process.exit(1);
}

const mods = require(path.join(C, 'modules.json')).modules;
const mod = mods.find(m => m.id === target || m.id.startsWith(target));
if (!mod) { console.error(`no module matching "${target}"`); process.exit(1); }

const spec = require(path.join(C, 'spec.json')).points;
const mocks = require(path.join(C, 'mocks.json'));
const plain = (o) => JSON.stringify(o).replace(/<[^>]+>/g, ' ')
  .replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\s+/g, ' ');
const touches = (q) => (q.moduleIds || [q.moduleId] || []).includes(mod.id);

console.log(`\n${'='.repeat(70)}\n${mod.number}. ${mod.title}  —  ${mod.id}`);
console.log(`weight ${Math.round((mod.examWeight || 0) * 100)}%  ·  spec ${mod.specPoints}  ·  ${mod.estimatedSessions}`);
console.log('='.repeat(70));

const points = spec.filter(p => (p.moduleIds || [p.moduleId]).includes(mod.id));
console.log(`\n---- SPEC POINTS (${points.length}) — the boundary of what may be taught ----`);
for (const p of points) console.log(`${String(p.code).padEnd(8)} ${p.text.replace(/\s+/g, ' ')}`);

console.log(`\n---- ASKED IN PAST PAPERS ----`);
for (const paper of mocks.pastPapers) {
  for (const q of paper.questions.filter(touches)) {
    console.log(`\n### ${paper.year} Q${q.number} (${q.marks} marks) — ${q.topic}`);
    if (q.markSchemeHtml) console.log(plain(q.markSchemeHtml).slice(0, 1100));
  }
}

console.log(`\n---- ASKED IN THE MOCKS ----`);
for (const mk of mocks.mocks) {
  for (const q of mk.questions.filter(touches)) {
    console.log(`\n### ${mk.id} Q${q.number} (${q.marks} marks) — ${q.topic}`);
    if (q.promptHtml) console.log('PROMPT: ' + plain(q.promptHtml).slice(0, 800));
    if (q.markSchemeHtml) console.log('SCHEME: ' + plain(q.markSchemeHtml).slice(0, 900));
  }
}

console.log(`\n---- ALREADY IN THE MODULE ----`);
console.log('intel: ' + plain(mod.sections.intel.html).slice(0, 900));
console.log('\nsheet headings: ' + mod.sections.sheet.subsections.map(s => s.heading || '(intro)').join(' · '));
console.log('teach headings: ' + (mod.sections.teach
  ? mod.sections.teach.subsections.map(s => s.heading || '(intro)').join(' · ') : 'NONE YET'));
for (const kind of ['understanding', 'drill']) {
  console.log(`\n${kind} (${mod.sections[kind].questions.length}):`);
  for (const q of mod.sections[kind].questions) {
    console.log(`  ${q.qid}: ${plain(q.promptHtml).replace(/^\{?"?/, '').slice(0, 150)}`);
  }
}

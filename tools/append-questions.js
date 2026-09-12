#!/usr/bin/env node
/**
 * append-questions.js — adds question blocks to the end of a module's
 * understanding or drill section.
 *
 * Checks before writing that no question id already exists in the module, so a
 * re-run cannot quietly create two D9s — duplicate ids would collide in the
 * item manifest and corrupt tagging.
 *
 *   node append-questions.js 01-forces-and-motion drill path/to/new-drill.html
 */
const fs = require('fs');
const path = require('path');

const [moduleId, which, file] = process.argv.slice(2);
if (!moduleId || !['understand', 'drill'].includes(which) || !file) {
  console.error('usage: node append-questions.js <moduleId> <understand|drill> <questions.html>');
  process.exit(1);
}

const target = path.join(__dirname, '..', 'site', 'modules', `${moduleId}.html`);
const src = fs.readFileSync(target, 'utf8');
const add = fs.readFileSync(file, 'utf8').trim();

const start = src.indexOf(`<section id="${which}">`);
if (start < 0) { console.error(`${moduleId}: no <section id="${which}">`); process.exit(1); }
const end = src.indexOf('</section>', start);

// the captured group, not the whole match — U7 and D7 are different questions
const idsIn = (s) => [...s.matchAll(/class="qid">([A-Z]+\d+)</g)].map(m => m[1]);
const existing = new Set(idsIn(src));
const incoming = idsIn(add);
if (!incoming.length) { console.error('no question ids found in the file'); process.exit(1); }
const clash = incoming.filter(id => existing.has(id));
if (clash.length) {
  console.error(`${moduleId}: these ids already exist — ${clash.join(', ')}`);
  process.exit(1);
}

fs.writeFileSync(target, src.slice(0, end) + '\n' + add + '\n' + src.slice(end));
console.log(`  ${moduleId} ${which}: added ${incoming.length} (${incoming.join(', ')})`);

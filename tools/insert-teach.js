#!/usr/bin/env node
/**
 * insert-teach.js — puts a written "How it actually works" section into a
 * module file, renumbers the sections that follow it, and adds the jump link.
 *
 * Replaces an existing teach section rather than stacking a second one, so it
 * is safe to re-run while a section is being revised.
 *
 *   node insert-teach.js 01-forces-and-motion path/to/teach-01.html
 */
const fs = require('fs');
const path = require('path');

const [moduleId, teachPath] = process.argv.slice(2);
if (!moduleId || !teachPath) {
  console.error('usage: node insert-teach.js <moduleId> <teach-section.html>');
  process.exit(1);
}

const target = path.join(__dirname, '..', 'site', 'modules', `${moduleId}.html`);
let src = fs.readFileSync(target, 'utf8');
const fresh = fs.readFileSync(teachPath, 'utf8').trim();

if (!/^<section id="teach">/.test(fresh) || !/<\/section>$/.test(fresh)) {
  console.error('the teach file must be exactly one <section id="teach"> … </section>');
  process.exit(1);
}

const sheetAt = () => src.indexOf('<section id="sheet">');
if (sheetAt() < 0) { console.error(`${moduleId}: no <section id="sheet">`); process.exit(1); }

// drop any previous teach section so re-runs replace rather than duplicate
const existing = src.indexOf('<section id="teach">');
if (existing >= 0) {
  const end = src.lastIndexOf('</section>', sheetAt()) + '</section>'.length;
  src = src.slice(0, existing) + src.slice(end);
  console.log('  replaced the existing teach section');
}

// insert, then renumber: intel stays 01, teach becomes 02, the rest shift down
src = src.slice(0, sheetAt()) + fresh + '\n\n' + src.slice(sheetAt());
const renumber = [['Cheat sheet', '03'], ['Understanding it', '04'], ['Exam drill', '05']];
for (const [label, n] of renumber) {
  const re = new RegExp(`<h2><span class="num">\\d+</span>${label}</h2>`);
  if (!re.test(src)) console.warn(`  ! could not renumber "${label}"`);
  src = src.replace(re, `<h2><span class="num">${n}</span>${label}</h2>`);
}

// jump nav — insert the link once, ahead of the cheat sheet link
if (!/href="#teach"/.test(src)) {
  src = src.replace(/(\s*)<a href="#sheet">/, '$1<a href="#teach">How it works</a>$1<a href="#sheet">');
  if (!/href="#teach"/.test(src)) console.warn('  ! could not add the jump link');
}

fs.writeFileSync(target, src);
const words = (s) => (s.replace(/<[^>]+>/g, ' ').match(/[A-Za-z][A-Za-z'-]+/g) || []).length;
const headings = (fresh.match(/<h3>/g) || []).length;
const cited = (fresh.match(/class="asked"/g) || []).length;
console.log(`  ${moduleId}: ${words(fresh)} words, ${headings} headings, ${cited} cited`);
if (cited < headings) console.warn(`  ! ${headings - cited} heading(s) cite no paper or spec point`);

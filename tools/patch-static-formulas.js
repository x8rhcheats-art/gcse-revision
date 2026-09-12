#!/usr/bin/env node
/**
 * patch-static-formulas.js — add the symbol key to the standalone HTML pages.
 *
 * The app reads content/*.json, which the extractor already enriches. These
 * files are hand-authored and read directly: the eight module pages, the two
 * mock papers, and the complete pack linked from the sidebar. Without this they
 * would be the only place a formula appears with no explanation.
 *
 * Idempotent — a block that already has a key is left alone.
 */
const fs = require('fs');
const path = require('path');
const eqGlossary = require('./equations.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');

const targets = [
  ...fs.readdirSync(path.join(SITE, 'modules')).filter(f => f.endsWith('.html'))
    .map(f => path.join(SITE, 'modules', f)),
  ...fs.readdirSync(path.join(SITE, 'mocks')).filter(f => f.endsWith('.html'))
    .map(f => path.join(SITE, 'mocks', f)),
  path.join(SITE, 'complete-pack.html'),
];

let changedFiles = 0, changedBlocks = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = eqGlossary.injectIntoHtml(before);
  if (after !== before) {
    const added = (after.match(/class="sym"/g) || []).length - (before.match(/class="sym"/g) || []).length;
    fs.writeFileSync(file, after);
    changedFiles++; changedBlocks += added;
    console.log(`  ${path.relative(ROOT, file)} — ${added} key(s) added`);
  }
}

console.log(`\n${changedBlocks} symbol keys added across ${changedFiles} file(s)`);
console.log(eqGlossary.report('coverage'));

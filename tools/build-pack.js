#!/usr/bin/env node
/**
 * build-pack.js — refreshes the module chapters inside site/complete-pack.html
 * from site/modules/*.html.
 *
 * The pack is one printable document: a fixed head and contents list, then the
 * eight modules, then the mock papers and mark schemes. Only the module
 * chapters are generated here — everything else in the file is left exactly as
 * it is, so the mocks and the closing pages are never at risk.
 *
 * It exists because the pack was previously a hand-made copy of the modules.
 * The moment a module gained a section, the pack silently disagreed with the
 * app, and nothing would have caught it.
 *
 *   node build-pack.js
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PACK = path.join(SITE, 'complete-pack.html');

const SUBJECT = process.argv[2] || 'physics';
const moduleFiles = fs.readdirSync(path.join(SITE, 'modules', SUBJECT))
  .filter(f => f.endsWith('.html')).sort();

const $ = cheerio.load(fs.readFileSync(PACK, 'utf8'), { decodeEntities: false });
let replaced = 0;

for (const file of moduleFiles) {
  const moduleId = file.replace(/\.html$/, '');
  const heading = $(`h1#${moduleId}`);
  if (!heading.length) {
    console.warn(`  ! ${moduleId}: no chapter heading in the pack, skipped`);
    continue;
  }

  // The chapter's content is every <section> following the chapter div, up to
  // the next chapter. Anchor on the wrapper so the standfirst and meta tags,
  // which the pack words slightly differently, are left alone.
  const chapter = heading.closest('.chapter');
  const old = [];
  for (let n = chapter[0].nextSibling; n; n = n.nextSibling) {
    if (n.type !== 'tag') continue;
    if ($(n).hasClass('chapter')) break;
    if (n.tagName === 'section') old.push(n);
    else break;                       // mocks and closing pages start here
  }
  if (!old.length) {
    console.warn(`  ! ${moduleId}: no sections found after the chapter heading`);
    continue;
  }

  const $mod = cheerio.load(fs.readFileSync(path.join(SITE, 'modules', SUBJECT, file), 'utf8'),
    { decodeEntities: false });
  const fresh = $mod('body .sheet > section').toArray()
    .map(s => $mod.html(s)).join('\n\n');
  if (!fresh.trim()) {
    console.warn(`  ! ${moduleId}: module file has no sections, skipped`);
    continue;
  }

  $(old[0]).before(fresh);
  for (const n of old) $(n).remove();
  replaced++;
  console.log(`  ${moduleId}: ${$mod('body .sheet > section').length} sections refreshed`);
}

fs.writeFileSync(PACK, $.html());
console.log(`\nrewrote site/complete-pack.html — ${replaced} of ${moduleFiles.length} modules refreshed`);

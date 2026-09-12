// pdf-outline.js — lists the bookmark titles in the generated PDF, so we can
// confirm the navigation sidebar iOS shows is actually useful.
const fs = require('fs');
const path = require('path');
const s = fs.readFileSync(path.resolve(__dirname, '..', 'John-Physics-Revision.pdf'), 'latin1');
const titles = [...s.matchAll(/\/Title\s*\(([^)]{0,90})\)/g)].map(m => m[1]);
console.log('first 24 bookmarks:');
titles.slice(0, 24).forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t}`));
console.log(`\ntotal bookmarks: ${titles.length}`);

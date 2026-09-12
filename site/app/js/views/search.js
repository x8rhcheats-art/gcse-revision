// views/search.js — plain substring search across all module content.

import { index, modulesByWeight, itemHref } from '../content.js';
import { el, view } from '../ui.js';

export function renderSearch() {
  const root = view('Search', 'Substring match across every module.');
  const input = el('input', { type: 'search', class: 'wide', placeholder: 'e.g. terminal velocity, kelvin, electroscope…', autofocus: '' });
  const results = el('div', {});
  root.append(el('p', {}, input), results);

  let t = null;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });

  function run() {
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (q.length < 2) return;
    const hits = index.searchDocs.filter(d => d.text.includes(q)).slice(0, 60);
    if (!hits.length) { results.append(el('p', { class: 'plain-note' }, 'No matches.')); return; }
    const byModule = new Map();
    for (const h of hits) {
      if (!byModule.has(h.moduleId)) byModule.set(h.moduleId, []);
      byModule.get(h.moduleId).push(h);
    }
    for (const m of modulesByWeight()) {
      const list = byModule.get(m.id);
      if (!list) continue;
      results.append(el('h3', {}, m.title));
      for (const h of list) {
        results.append(el('a', { class: 'rowlink', href: itemHref(h.itemId) },
          el('span', {}, el('span', { class: 'kind-chip' }, h.kind), el('span', { class: 't' }, h.label))));
      }
    }
    // items that belong to no module (exam technique rules)
    const loose = byModule.get(null);
    if (loose) {
      results.append(el('h3', {}, 'Exam technique'));
      for (const h of loose) {
        results.append(el('a', { class: 'rowlink', href: itemHref(h.itemId) },
          el('span', {}, el('span', { class: 'kind-chip' }, h.kind), el('span', { class: 't' }, h.label))));
      }
    }
    if (hits.length === 60) results.append(el('p', { class: 'plain-note' }, 'First 60 matches shown.'));
  }
  setTimeout(() => input.focus(), 50);
  return root;
}

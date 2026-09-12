// views/redlist.js — everything flagged red, across all modules. The study queue.

import { index, modulesByWeight, itemHref } from '../content.js';
import { el, view, shortDate } from '../ui.js';
import { redList } from '../model.js';

function rows(list, root) {
  const byModule = new Map();
  for (const row of list) {
    const mid = row.info.moduleId;
    if (!byModule.has(mid)) byModule.set(mid, []);
    byModule.get(mid).push(row);
  }
  const groups = [
    ...modulesByWeight().map(m => ({ id: m.id, title: m.title })),
    // items belonging to no module (exam technique rules) still need a home
    { id: null, title: 'Exam technique' },
  ];
  for (const g of groups) {
    const items = byModule.get(g.id);
    if (!items) continue;
    root.append(el('h3', {}, g.title));
    for (const { itemId, info, eff } of items) {
      root.append(el('a', { class: 'rowlink', href: itemHref(itemId) },
        el('span', {},
          el('span', { class: 'kind-chip' }, info.kind),
          el('span', { class: 't' }, info.label)),
        el('span', { class: 'r' }, eff.explicit
          ? `tagged ${shortDate(eff.at)}`
          : `via ${index.itemInfo.get(eff.from)?.label || 'section tag'}`)));
    }
  }
}

export function renderRedList() {
  const { explicit, inherited } = redList();
  const root = view('Red topics', 'Everything currently flagged red, heaviest module first.');

  if (!explicit.length && !inherited.length) {
    root.append(el('p', {}, 'Nothing is tagged red at the moment.'),
      el('p', { class: 'plain-note' }, 'Tag items red, amber or green with the dots in the left margin of any module.'));
    return root;
  }

  root.append(el('p', { class: 'plain-note' },
    `${explicit.length} item${explicit.length === 1 ? '' : 's'} tagged red` +
    (inherited.length ? ` · ${inherited.length} more inherit red from a section tag` : '') + '.'));

  if (explicit.length) rows(explicit, root);
  if (inherited.length) {
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Inherited'), 'Red via a section tag'));
    rows(inherited, root);
  }
  return root;
}

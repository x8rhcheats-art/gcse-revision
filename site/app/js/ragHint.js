// ragHint.js — the one-line explanation of the margin rating control.
//
// The control is a dot in the left margin: quiet by design, so it does not
// clutter a page holding nineteen definitions. Quiet turned out to mean
// undiscoverable, so every page that has a rail now says what it is, shows the
// three colours inline, and counts how much has been rated.

import { el } from './ui.js';
import { getTag } from './store.js';

/**
 * @param itemIds  every taggable id on the page, for the "n of m rated" count
 */
export function ragHint(itemIds) {
  const total = itemIds.length;
  const rated = itemIds.filter(id => getTag(id)).length;

  const swatch = (cls, label) => el('span', { class: `hint-sw ${cls}`, title: label });

  return el('p', { class: 'rag-hint' },
    el('span', { class: 'hint-dot' }),
    ' Rate anything on this page — tap the circle in the margin, then pick ',
    swatch('sw-red', 'red — needs work'),
    swatch('sw-amber', 'amber — shaky'),
    swatch('sw-green', 'green — secure'),
    '. Red items become your study list. ',
    el('span', { class: 'hint-count' },
      rated ? `${rated} of ${total} rated on this page.` : `Nothing rated here yet — ${total} things you can rate.`),
  );
}

// ragButtons.js — the visible red / amber / green control.
//
// The original design put a small dot in the left margin, on the theory that a
// page holding nineteen definitions would drown in coloured buttons. In
// practice nobody found it: a dot floating in a gutter reads as decoration, not
// as a control, however dark you make it.
//
// So the three colours are now shown outright, attached to the things worth
// rating most — each cheat-sheet section and each question. The margin dot
// stays for fine-grained items (a single definition inside a table), where
// there genuinely is no room for three buttons per row.

import { el } from './ui.js';
import { setTag, getTag } from './store.js';
import { effectiveTag } from './model.js';

const VALUES = [
  ['red', 'Needs work'],
  ['amber', 'Shaky'],
  ['green', 'Secure'],
];

/**
 * @param itemId  the thing being rated
 * @param opts    { label } optional leading text, e.g. "Rate this section"
 */
export function ragControl(itemId, opts = {}) {
  const wrap = el('div', { class: 'rag-buttons', dataset: { for: itemId } });
  if (opts.label !== false) wrap.append(el('span', { class: 'rb-label' }, opts.label || 'How is this?'));

  const buttons = [];
  const paint = () => {
    const own = getTag(itemId);
    const eff = effectiveTag(itemId);
    for (const { btn, value } of buttons) {
      const isOwn = own && own.value === value;
      // inherited from a section tag: shown faintly, so it is clear it was not
      // set on this item directly
      const isInherited = !own && eff && eff.value === value;
      btn.classList.toggle('on', !!isOwn);
      btn.classList.toggle('inherited', !!isInherited);
      btn.setAttribute('aria-pressed', isOwn ? 'true' : 'false');
    }
  };

  for (const [value, title] of VALUES) {
    const btn = el('button', {
      class: `rb rb-${value}`,
      title: `${title} — click again to clear`,
      'aria-label': title,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const own = getTag(itemId);
        setTag(itemId, own && own.value === value ? null : value);
        paint();
        document.dispatchEvent(new CustomEvent('tags-changed'));
      },
    }, el('span', { class: 'rb-dot' }));
    buttons.push({ btn, value });
    wrap.append(btn);
  }

  paint();
  // keep in step when the same item is rated somewhere else on the page
  document.addEventListener('tags-changed', () => { if (wrap.isConnected) paint(); });
  return wrap;
}

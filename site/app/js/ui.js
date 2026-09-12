// ui.js — small DOM helpers shared by every view. No state.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Aug" from an ISO timestamp or date. */
export function shortDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function daysAgo(isoStr) {
  if (!isoStr) return null;
  return Math.floor((Date.now() - new Date(isoStr).getTime()) / 86400000);
}

/** Standard view scaffold: header + content root. */
export function view(title, standfirst) {
  const root = el('div', { class: 'view' });
  const head = el('header', { class: 'vhead' },
    el('h1', {}, title),
    standfirst ? el('p', { class: 'standfirst' }, standfirst) : null);
  root.append(head);
  return root;
}

/**
 * A small two-or-more-way switch used by every practice view, so choosing
 * between full coverage and needs-work weighting always looks the same and is
 * never hidden. `options` is [{ value, label }]; onPick receives the value.
 */
export function modeSwitch(label, options, current, onPick) {
  const row = el('div', { class: 'mode-switch' }, el('span', { class: 'ms-label' }, label));
  for (const o of options) {
    row.append(el('button', {
      class: `ms-opt${o.value === current ? ' current' : ''}`,
      onclick: () => { if (o.value !== current) onPick(o.value); },
    }, o.label));
  }
  return row;
}

/** A dead end with a way out — used whenever an id in the URL matches nothing. */
export function notFound(what) {
  return el('div', { class: 'view' },
    el('header', { class: 'vhead' },
      el('h1', {}, 'Not found'),
      el('p', { class: 'standfirst' }, `There is no ${what} with that name. It may have been renamed, or the link may be mistyped.`)),
    el('p', {},
      el('a', { class: 'act', href: '#/home' }, 'Home'), ' ',
      el('a', { class: 'act secondary', href: '#/search' }, 'Search the content')));
}

export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

/** Scroll to an element by [data-item-id] and flash it. */
export function flashItem(container, itemId) {
  const target = container.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
  if (!target) return;
  target.scrollIntoView({ block: 'center' });
  target.classList.add('flash');
  setTimeout(() => target.classList.remove('flash'), 1800);
}

/**
 * View-scoped keyboard shortcuts. The listener lives on document (views are
 * built detached), fires only while the view is connected, ignores typing in
 * form fields, and removes itself once the view has been replaced.
 */
export function attachKeys(root, handler) {
  const onKey = (e) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    handler(e);
  };
  document.addEventListener('keydown', onKey);
}

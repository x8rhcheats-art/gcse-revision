// rail.js — the traffic-light tagging rail.
// Every element carrying [data-item-id] inside an attached container gets a
// persistent state dot in the left gutter. Hover (mouse) or tap (touch) opens
// a red/amber/green triplet; one further click sets the tag. Works identically
// on dense definition tables and on section headings.

import { el } from './ui.js';
import { setTag, getTag } from './store.js';
import { effectiveTag } from './model.js';

const VALUES = ['red', 'amber', 'green'];

export function attachRail(container) {
  container.classList.add('railed');
  const dots = new Map(); // itemId -> dot element
  let openPop = null;

  function closePop() {
    if (openPop) { openPop.pop.remove(); openPop.dot.classList.remove('open'); openPop = null; }
  }

  function dotStateClass(itemId) {
    const eff = effectiveTag(itemId);
    if (!eff) return '';
    return `v-${eff.value}${eff.explicit ? '' : ' inherited'}`;
  }

  function refreshDot(dot, itemId) {
    dot.className = `rag-dot ${dot.dataset.level} ${dotStateClass(itemId)}`.trim();
    const eff = effectiveTag(itemId);
    dot.title = eff
      ? (eff.explicit ? `Tagged ${eff.value}` : `${eff.value} — inherited from section tag`)
      : 'Not tagged. Red / amber / green.';
  }

  function openPopFor(dot, itemId) {
    closePop();
    const current = getTag(itemId);
    const pop = el('div', { class: 'rag-pop', role: 'group', 'aria-label': 'Confidence tag' });
    for (const v of VALUES) {
      pop.append(el('button', {
        class: `sw-${v}${current && current.value === v ? ' current' : ''}`,
        'aria-label': v,
        onclick: (e) => { e.stopPropagation(); setTag(itemId, v); closePop(); refreshAll(); },
      }));
    }
    if (current) {
      pop.append(el('button', {
        class: 'sw-clear',
        onclick: (e) => { e.stopPropagation(); setTag(itemId, null); closePop(); refreshAll(); },
      }, 'clear'));
    }
    pop.style.left = '2px';
    pop.style.top = `${dot.offsetTop + 24}px`;
    container.append(pop);
    dot.classList.add('open');
    openPop = { pop, dot, itemId };
    // Arriving at the popup must cancel the close the dot scheduled when the
    // pointer left it — without this the swatches vanish before they can be
    // clicked, which makes the control look broken.
    pop.addEventListener('pointerenter', cancelClose);
    pop.addEventListener('pointerleave', scheduleClose);
  }

  let closeTimer = null;
  // long enough to cross the gap between the dot and the swatches
  function scheduleClose() { clearTimeout(closeTimer); closeTimer = setTimeout(closePop, 600); }
  function cancelClose() { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } }

  function makeDot(target, itemId) {
    const isHeading = /^H[23]$/.test(target.tagName) || target.dataset.railLevel === 'section';
    const dot = el('button', {
      class: 'rag-dot', 'aria-label': `Confidence tag for this item`,
      dataset: { level: isHeading ? 'level-section' : 'level-item', for: itemId },
      onclick: (e) => {
        e.stopPropagation();
        if (openPop && openPop.itemId === itemId) closePop();
        else openPopFor(dot, itemId);
      },
      onpointerenter: (e) => { if (e.pointerType === 'mouse') { cancelClose(); openPopFor(dot, itemId); } },
      onpointerleave: (e) => { if (e.pointerType === 'mouse') scheduleClose(); },
    }, el('span', { class: 'disc' }));
    return dot;
  }

  function position() {
    const cRect = container.getBoundingClientRect();
    for (const [itemId, dot] of dots) {
      const target = container.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
      if (!target || target.offsetParent === null) { dot.style.display = 'none'; continue; }
      dot.style.display = '';
      const tRect = target.getBoundingClientRect();
      dot.style.top = `${tRect.top - cRect.top + 2}px`;
    }
  }

  function refreshAll() {
    for (const [itemId, dot] of dots) refreshDot(dot, itemId);
    document.dispatchEvent(new CustomEvent('tags-changed'));
  }

  // build dots
  for (const target of container.querySelectorAll('[data-item-id]')) {
    const itemId = target.dataset.itemId;
    if (dots.has(itemId)) continue;
    const dot = makeDot(target, itemId);
    refreshDot(dot, itemId);
    dots.set(itemId, dot);
    container.append(dot);
  }
  // the view is built detached and inserted synchronously by the router, so
  // position after insertion (setTimeout, not rAF: rAF stalls in hidden tabs)
  setTimeout(position, 0);

  // reposition when layout moves: answers opening, images, window resize.
  // Global listeners self-remove once the view has been navigated away from,
  // otherwise every module visit would leak two permanent handlers.
  const ro = new ResizeObserver(() => position());
  ro.observe(container);
  container.addEventListener('toggle', () => position(), true);
  const onResize = () => {
    if (!container.isConnected) return cleanup();
    position();
  };
  const onDocClick = (e) => {
    if (!container.isConnected) return cleanup();
    if (openPop && !openPop.pop.contains(e.target) && !openPop.dot.contains(e.target)) closePop();
  };
  function cleanup() {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('click', onDocClick);
    ro.disconnect();
  }
  window.addEventListener('resize', onResize);
  document.addEventListener('click', onDocClick);

  return { refresh: refreshAll, position };
}

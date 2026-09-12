// capture.js — demonstrated-performance capture on answer reveal.
// Before an answer opens, one optional tap: Got it / Partly / No idea / just show.
// Skippable forever (memo §5.4: never gate anything on a rating).
//
// The strip must live OUTSIDE the <details> element: non-summary children of a
// closed <details> are not rendered, so a strip inserted inside it is invisible
// to the user (a real click on "Show answer" would appear to do nothing).

import { el } from './ui.js';
import { recordAttempt, updateLastAttempt } from './store.js';

/**
 * After the answer opens, offer the mark scheme as a tick-list. Ticking is the
 * exam skill: not "did I know it" but "did I actually write that point".
 * The tally refines the attempt already recorded, rather than adding a new one.
 */
function attachMarkPoints(qWrap, details) {
  const scheme = qWrap._markScheme;
  if (!scheme || !scheme.length || qWrap.querySelector('.markpoints')) return;
  const questionId = qWrap.dataset.questionId;
  const total = scheme.reduce((a, p) => a + (p.marks || 1), 0);

  const tally = el('p', { class: 'mp-tally' });
  const boxes = [];
  const recount = () => {
    const hit = boxes.reduce((a, b) => a + (b.input.checked ? b.marks : 0), 0);
    tally.textContent = `${hit} of ${total} mark points`;
    updateLastAttempt(questionId, { markPointsHit: hit, markPointsTotal: total });
  };

  const list = el('div', { class: 'markpoints' },
    el('p', { class: 'lbl' }, 'Tick each mark point you actually wrote:'));
  for (const p of scheme) {
    const input = el('input', { type: 'checkbox', onchange: recount });
    boxes.push({ input, marks: p.marks || 1 });
    list.append(el('label', { class: 'mp-row' }, input,
      el('span', {}, p.point),
      el('span', { class: 'mp' }, String(p.marks || 1))));
  }
  list.append(tally);
  details.after(list);
}

export function attachCapture(container) {
  container.addEventListener('click', (e) => {
    const summary = e.target.closest('details.ans > summary');
    if (!summary || !container.contains(summary)) return;
    const details = summary.parentElement;
    const qWrap = details.closest('[data-question-id]');
    if (!qWrap) return;                       // not a capturable question
    if (details.open) return;                 // closing — always allowed
    if (details.dataset.asked === '1') {      // already rated; just reopen + re-offer marking
      setTimeout(() => attachMarkPoints(qWrap, details), 0);
      return;
    }

    e.preventDefault();
    if (qWrap.querySelector('.rate-strip')) return; // strip already showing

    const strip = el('div', { class: 'rate-strip', style: 'border:1px solid var(--rule)' },
      el('span', { class: 'lbl' }, 'Before you look — how did it go?'));
    const choose = (rating) => {
      if (rating) recordAttempt(qWrap.dataset.questionId, rating);
      details.dataset.asked = '1';
      strip.remove();
      details.style.display = '';
      details.open = true;
      attachMarkPoints(qWrap, details);
    };
    strip.append(
      el('button', { onclick: () => choose('got-it') }, 'Got it'),
      el('button', { onclick: () => choose('partly') }, 'Partly'),
      el('button', { onclick: () => choose('no-idea') }, 'No idea'),
      el('button', { class: 'just-show', onclick: () => choose(null) }, 'just show me'),
    );
    // strip replaces the collapsed answer row until a choice is made
    details.before(strip);
    details.style.display = 'none';
  });
}

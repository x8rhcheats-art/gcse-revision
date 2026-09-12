// views/review.js — everything he has got wrong, in one place.
//
// The app already records every wrong MCQ and every "no idea" self-rating; it
// just had nowhere to show them. This is the highest-yield practice material
// in the app, so it gets its own queue and a one-click retry of the MCQs.

import { index, moduleTitle, modulesByWeight } from '../content.js';
import { el, view, shortDate } from '../ui.js';
import { getState } from '../store.js';

/** Latest attempt per question that ended badly, newest first. */
export function wrongAttempts() {
  const latest = new Map();
  for (const a of getState().attempts) latest.set(a.questionId, a);
  const rows = [];
  for (const [qid, a] of latest) {
    const entry = index.questionById.get(qid);
    if (!entry) continue;
    // a self-marked answer that scored under half counts as weak too
    const weakByMarkPoints = a.markPointsTotal && (a.markPointsHit / a.markPointsTotal) < 0.5;
    if (a.selfRating !== 'no-idea' && !weakByMarkPoints) continue;
    rows.push({ qid, at: a.at, entry, attempt: a });
  }
  rows.sort((x, y) => (x.at < y.at ? 1 : -1));
  return rows;
}

export function renderReview() {
  const rows = wrongAttempts();
  const root = view('Get these right',
    'Every question you have got wrong or rated “no idea”, newest first. Nothing is more worth your time than this list.');

  if (!rows.length) {
    root.append(el('p', {}, 'Nothing here yet.'),
      el('p', { class: 'plain-note' }, 'Wrong multiple-choice answers and anything you rate “no idea” collect here automatically.'));
    return root;
  }

  const mcqRows = rows.filter(r => r.entry.kind === 'mcq');
  const otherRows = rows.filter(r => r.entry.kind !== 'mcq');

  root.append(el('p', { class: 'plain-note' },
    `${rows.length} to fix — ${mcqRows.length} multiple choice, ${otherRows.length} written.`));

  if (mcqRows.length) {
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Multiple choice'), `${mcqRows.length} wrong`),
      el('p', {}, el('a', { class: 'act', href: '#/mcq/wrong' }, 'Retry these now')));
    const byModule = new Map();
    for (const r of mcqRows) {
      const mid = r.entry.moduleId;
      if (!byModule.has(mid)) byModule.set(mid, []);
      byModule.get(mid).push(r);
    }
    const t = el('table', {});
    t.append(el('tr', {}, el('th', {}, 'Module'), el('th', {}, 'Questions wrong')));
    for (const m of modulesByWeight()) {
      const list = byModule.get(m.id);
      if (!list) continue;
      t.append(el('tr', {},
        el('td', {}, el('a', { href: `#/mcq/${m.id}` }, m.title)),
        el('td', { class: 'num' }, String(list.length))));
    }
    root.append(t);
  }

  if (otherRows.length) {
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Written'), `${otherRows.length} to redo`));
    for (const r of otherRows) {
      const e = r.entry;
      const mid = e.moduleId || (e.moduleIds && e.moduleIds[0]);
      const href = e.kind === 'exam'
        ? `#/mock/${r.qid.split('/')[0]}?mode=revise`
        : `#/module/${mid}?item=${encodeURIComponent(r.qid)}`;
      const scoreNote = r.attempt.markPointsTotal
        ? `${r.attempt.markPointsHit}/${r.attempt.markPointsTotal} mark points`
        : 'rated “no idea”';
      root.append(el('a', { class: 'rowlink', href },
        el('span', {},
          el('span', { class: 'kind-chip' }, e.kind === 'exam' ? 'exam question' : e.kind),
          el('span', { class: 't' }, e.label || r.qid),
          mid ? el('span', { class: 'd' }, ' ' + moduleTitle(mid)) : null),
        el('span', { class: 'r' }, `${scoreNote} · ${shortDate(r.at)}`)));
    }
  }
  return root;
}

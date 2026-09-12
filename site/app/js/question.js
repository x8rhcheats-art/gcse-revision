// question.js — the shared question block used by the module reader, mixed
// practice and mock revision mode.
//
// The important addition over a plain "reveal answer" block is the writing
// step: extended-answer marks are lost to wording, not physics (the diagnostic
// mark scheme calls this the fastest thing to fix), so the block gives him
// somewhere to write the answer first and then self-mark it against the actual
// mark points, one tick at a time.

import { el } from './ui.js';
import { getWrittenAnswer, saveWrittenAnswer } from './store.js';
import { ragControl } from './ragButtons.js';

/**
 * @param q         { itemId, qid, promptHtml, hint, answerHtml, marks, markScheme }
 * @param opts      { writing: boolean }  — show the answer box + mark-point self-marking
 */
export function questionBlock(q, opts = {}) {
  const writing = opts.writing !== false && Array.isArray(q.markScheme) && q.markScheme.length > 0;

  const body = el('div', { class: 'qbody' }, el('div', { html: q.promptHtml }));
  if (q.hint) body.append(el('p', { class: 'hint' }, el('b', {}, 'Think about'), ' ', q.hint));

  if (writing) {
    const saved = getWrittenAnswer(q.itemId);
    const box = el('textarea', {
      class: 'answer-box', rows: 4,
      placeholder: q.marks
        ? `Write your answer here first — ${q.marks} mark${q.marks === 1 ? '' : 's'}, so aim for ${q.marks} separate points.`
        : 'Write your answer here first.',
    });
    if (saved) box.value = saved;
    let t = null;
    const flush = () => { clearTimeout(t); saveWrittenAnswer(q.itemId, box.value); };
    box.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(flush, 600);
    });
    box.addEventListener('blur', flush);        // revealing the answer blurs the box
    box.addEventListener('change', flush);
    body.append(box);
  }

  body.append(el('details', { class: 'ans' },
    el('summary', {}, 'Show answer'),
    el('div', { class: 'inner', html: q.answerHtml })));

  // the visible rating control, on the question itself
  body.append(ragControl(q.itemId, { label: 'How was this one?' }));

  const wrap = el('div', {
    class: 'q', 'data-item-id': q.itemId, 'data-question-id': q.itemId,
    dataset: { redable: '1' },
  },
    el('div', { class: 'qid', title: q.marks ? `${q.qid} (${q.marks} marks)` : q.qid }, q.qid),
    body);

  // handed to capture.js after the answer opens, without serialising through DOM
  if (writing) wrap._markScheme = q.markScheme;
  return wrap;
}

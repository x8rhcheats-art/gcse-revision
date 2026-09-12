// views/reference.js — exam day card, the formula sheet actually issued,
// the department's list of thrown-away marks, and self-mark checklists for
// the drawings the app cannot mark.
//
// The technique rules are taggable like anything else, so the ones he keeps
// getting wrong land on the red list next to the physics.

import { content, index } from '../content.js';
import { el, view, flashItem } from '../ui.js';
import { attachRail } from '../rail.js';
import { daysToExam } from '../model.js';

export function renderReference(params, query = {}) {
  const ref = content.reference;
  if (!ref) {
    return view('Exam reference',
      'No exam reference pack exists for this subject yet — it will appear here once one is built.');
  }
  const root = view('Exam reference',
    'What you get given, what you must know, and the specific things this department takes marks off for.');

  // ---- exam day ----
  const days = daysToExam();
  const day = el('section', { id: 'examday' },
    el('h2', {}, el('span', { class: 'num' }, 'Exam day'), ref.examDay.dateText),
    el('p', { class: 'plain-note' },
      `${days === null ? '' : `${days} day${days === 1 ? '' : 's'} away · `}${ref.examDay.durationText}`));
  const cols = el('div', { class: 'two-col' },
    el('div', {}, el('h3', {}, 'Take with you'),
      el('ul', {}, ...ref.examDay.bring.map(b => el('li', {}, b)))),
    el('div', {}, el('h3', {}, 'Given to you'),
      el('ul', {}, ...ref.examDay.provided.map(b => el('li', {}, b)))));
  day.append(cols, el('h3', {}, 'In the room'),
    el('ol', {}, ...ref.examDay.rules.map(r => el('li', {}, r))));
  root.append(day);

  // ---- formula sheet ----
  const fs = el('section', { id: 'formulae' },
    el('h2', {}, el('span', { class: 'num' }, 'Formula sheet'), 'What you are given'),
    el('p', {}, ref.formulaSheet.note));
  const given = el('table', {});
  given.append(el('tr', {}, el('th', {}, 'In words'), el('th', {}, 'In symbols')));
  for (const f of ref.formulaSheet.given) {
    given.append(el('tr', { style: f.outOfScope ? 'opacity:.5' : null },
      el('td', {}, f.words, f.outOfScope ? el('span', { class: 'kind-chip', style: 'margin-left:8px' }, 'not on your exam') : null),
      el('td', {},
        el('code', {}, f.symbols),
        f.symbolKey ? el('span', { class: 'sym' }, f.symbolKey) : null)));
  }
  fs.append(given);

  // must-memorise: pulled live from the module content, not duplicated
  const memorise = index.cards.filter(c => c.type === 'equation' && c.meta === 'must memorise');
  fs.append(el('h3', {}, `The ${memorise.length} you must memorise — these are NOT on the sheet`));
  const mt = el('table', {});
  mt.append(el('tr', {}, el('th', {}, 'Equation'), el('th', {}, 'Formula'), el('th', {}, 'Module')));
  for (const c of memorise) {
    mt.append(el('tr', {},
      el('td', {}, c.front),
      el('td', {},
        el('code', {}, c.formula),
        c.symbolKey ? el('span', { class: 'sym' }, c.symbolKey) : null),
      el('td', {}, el('a', { href: `#/module/${c.moduleId}` }, index.moduleById.get(c.moduleId)?.title || c.moduleId))));
  }
  fs.append(mt, el('p', {}, el('a', { class: 'act', href: '#/eq-drill?only=memorise' }, 'Drill just these')));
  root.append(fs);

  // ---- technique rules (taggable) ----
  const groups = [...new Set(ref.techniqueRules.map(r => r.group))];
  const tech = el('section', { id: 'technique' },
    el('h2', {}, el('span', { class: 'num' }, 'Technique'), 'The marks this department throws away'),
    el('p', {}, 'Taken from the examiner reports on the 2023, 2024 and 2025 papers. None of these require any new subject knowledge. Tag any you keep forgetting and they join your red list.'));
  for (const g of groups) {
    tech.append(el('h3', {}, g));
    for (const r of ref.techniqueRules.filter(x => x.group === g)) {
      tech.append(el('div', { class: 'rule', 'data-item-id': r.itemId, dataset: { redable: '1' } },
        el('p', { class: 'rule-head' }, r.rule),
        el('p', { class: 'rule-detail' }, r.detail)));
    }
  }
  root.append(tech);

  // ---- diagram checklists ----
  const dg = el('section', { id: 'diagrams' },
    el('h2', {}, el('span', { class: 'num' }, 'Drawings'), 'Self-mark checklists'),
    el('p', {}, 'The app cannot mark a drawing. Draw it on paper, then check it against these — every line is a mark someone lost.'));
  for (const c of ref.diagramChecklists) {
    const box = el('div', { class: 'panel' },
      el('h4', {}, c.title),
      el('p', { class: 'plain-note' }, c.note));
    for (const item of c.items) {
      box.append(el('label', { class: 'mp-row' }, el('input', { type: 'checkbox' }), el('span', {}, item)));
    }
    dg.append(box);
  }
  root.append(dg);

  attachRail(root);
  if (query.item) setTimeout(() => flashItem(root, query.item), 60);
  return root;
}

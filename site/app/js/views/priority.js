// views/priority.js — the Priority Module.
//
// A module-shaped view whose contents are assembled from whatever currently
// needs work most, across all eight modules: the same four sections, roughly
// the same length, but the material is chosen by the confidence model rather
// than by syllabus order.
//
// Items keep their original itemIds, so a tag applied here is the same tag as
// in the source module — this is a different route through the content, not a
// copy of it.

import { moduleTitle, activeSubject } from '../content.js';
import { el, flashItem } from '../ui.js';
import { attachRail } from '../rail.js';
import { ragHint } from '../ragHint.js';
import { attachCapture } from '../capture.js';
import { questionBlock } from '../question.js';
import { priorityModule, effectiveTag } from '../model.js';

/** Small "where this came from" note under an item. */
function sourceNote(moduleId, heading) {
  return el('span', { class: 'src-note' },
    heading ? `${moduleTitle(moduleId)} · ${heading}` : moduleTitle(moduleId));
}

function tagWord(itemId) {
  const eff = effectiveTag(itemId);
  return eff ? el('span', { class: `tagword-${eff.value}` }, eff.value) : null;
}

export function renderPriority(params, query = {}) {
  const p = priorityModule();
  const root = el('div', { class: 'view module-view' });

  root.append(el('header', { class: 'top' },
    el('p', { class: 'eyebrow' }, 'Priority Module · assembled from your own results'),
    el('h1', {}, 'Priority Module'),
    el('p', { class: 'standfirst' }, p.hasSignal
      ? 'One module’s worth of material, pulled from whatever currently needs the most work. It changes as your tags and results change.'
      : 'Nothing has been tagged or attempted yet, so this is ordered by exam weight — the topics worth the most marks. It will re-assemble around your own results as soon as there are some.'),
    el('div', { class: 'meta' },
      el('span', { class: 'tag' }, el('strong', {}, String(p.total)), ' items'),
      el('span', { class: 'tag' }, 'Rebuilt ', el('strong', {}, 'every visit')),
      p.hasSignal ? el('span', { class: 'tag' }, 'From ', el('strong', {}, String(p.sources.length)), ' modules') : null)));

  root.append(el('nav', { class: 'jump' },
    el('a', { href: '#/home' }, '← All modules'),
    el('a', { href: '#sheet-a' }, 'Cheat sheet'),
    el('a', { href: '#understand-a' }, 'Understanding it'),
    el('a', { href: '#drill-a' }, 'Exam drill'),
    el('a', { href: '#/practice' }, 'Build a session')));

  // ---- where it came from ----
  if (p.sources.length) {
    const src = el('section', {},
      el('h2', {}, el('span', { class: 'num' }, '01'), 'Why these'),
      el('p', {}, p.hasSignal
        ? 'Drawn from the modules where your tags and results show the most need. The count is how many items each contributed.'
        : 'Ordered by share of marks in the exam, since there are no results to go on yet.'));
    const t = el('table', {});
    t.append(el('tr', {}, el('th', {}, 'Module'), el('th', {}, 'Items here'), el('th', {}, '')));
    for (const s of p.sources) {
      t.append(el('tr', {},
        el('td', {}, el('a', { href: `#/module/${s.moduleId}` }, s.title)),
        el('td', { class: 'num' }, String(s.n)),
        el('td', { class: 'num' }, tagWord(s.moduleId) || '')));
    }
    src.append(t);
    root.append(src);
  }

  // ---- 02 cheat sheet ----
  const sheet = el('section', { id: 'sheet-a' }, el('h2', {}, el('span', { class: 'num' }, '02'), 'Cheat sheet'));

  if (p.equations.length) {
    sheet.append(el('h3', {}, 'Equations'));
    for (const r of p.equations) {
      const e = r.item;
      sheet.append(el('div', { class: 'eq', 'data-item-id': e.itemId, dataset: { redable: '1' } },
        el('span', { class: 'name' }, e.name, ' — ', sourceNote(r.moduleId)),
        e.formula,
        e.symbolKey ? el('span', { class: 'sym' }, e.symbolKey) : null));
    }
  }

  if (p.definitions.length) {
    sheet.append(el('h3', {}, 'Definitions — the exact wording'));
    const t = el('table', {});
    t.append(el('tr', {}, el('th', {}, 'Term'), el('th', {}, 'Say this')));
    for (const r of p.definitions) {
      const d = r.item;
      t.append(el('tr', { 'data-item-id': d.itemId, dataset: { redable: '1' } },
        el('td', {}, d.term, el('br'), sourceNote(r.moduleId)),
        el('td', { html: d.acceptedWording })));
    }
    sheet.append(t);
  }

  if (p.traps.length) {
    sheet.append(el('h3', {}, 'Vocabulary that costs marks'));
    const t = el('table', {});
    t.append(el('tr', {}, el('th', {}, 'Don’t write'), el('th', {}, 'Write')));
    for (const r of p.traps) {
      const tr = r.item;
      t.append(el('tr', { 'data-item-id': tr.itemId, dataset: { redable: '1' } },
        el('td', { class: 'no' }, tr.wrong),
        el('td', { class: 'yes' }, tr.right)));
    }
    sheet.append(t);
  }
  root.append(sheet);

  // ---- 03 understanding ----
  if (p.understanding.length) {
    const und = el('section', { id: 'understand-a' },
      el('h2', {}, el('span', { class: 'num' }, '03'), 'Understanding it'));
    for (const r of p.understanding) {
      const block = questionBlock(r.item, { writing: false });
      block.querySelector('.qid')?.append(el('span', { class: 'src-note' }, moduleTitle(r.moduleId)));
      und.append(block);
    }
    root.append(und);
  }

  // ---- 04 drill ----
  if (p.drill.length) {
    const drill = el('section', { id: 'drill-a' },
      el('h2', {}, el('span', { class: 'num' }, '04'), 'Exam drill'),
      el('p', {}, 'Write the answer first, then tick the mark points you actually wrote.'));
    for (const r of p.drill) {
      const block = questionBlock(r.item);
      block.querySelector('.qid')?.append(el('span', { class: 'src-note' }, moduleTitle(r.moduleId)));
      drill.append(block);
    }
    root.append(drill);
  }

  root.append(el('footer', {}, `Priority Module · assembled from your tags and results · ${activeSubject().board}`));

  // built once the content exists so the count is real, then lifted to the top
  root.querySelector('nav.jump')
    .after(ragHint([...root.querySelectorAll('[data-item-id]')].map(n => n.dataset.itemId)));

  attachRail(root);
  attachCapture(root);
  if (query.item) setTimeout(() => flashItem(root, query.item), 60);
  return root;
}

// views/module.js — the module reader. Renders one module from content JSON
// with the tagging rail, answer capture, section jump links, and a red-only filter.

import { index, content, activeSubject, SECTION_LABELS } from '../content.js';
import { el, view, flashItem, notFound } from '../ui.js';
import { attachRail } from '../rail.js';
import { ragHint } from '../ragHint.js';
import { ragControl } from '../ragButtons.js';
import { attachCapture } from '../capture.js';
import { questionBlock } from '../question.js';
import { effectiveTag } from '../model.js';

function sectionHeading(mod, secId, num) {
  return el('h2', { 'data-item-id': `${mod.id}/section/${secId}`, dataset: { railLevel: 'section' } },
    el('span', { class: 'num' }, num), SECTION_LABELS[secId]);
}

export function renderModule(params, query) {
  const mod = index.moduleById.get(params.id);
  if (!mod) return notFound('module');

  const root = el('div', { class: 'view module-view' });

  // masthead — the module-level tag target
  root.append(el('header', { class: 'top', 'data-item-id': mod.id, dataset: { railLevel: 'section' } },
    el('p', { class: 'eyebrow' }, `Module ${mod.number} of ${activeSubject().plannedModules || content.modules.length} · ${activeSubject().board}`),
    el('h1', {}, mod.title),
    el('p', { class: 'standfirst' }, mod.standfirst),
    el('div', { class: 'meta' },
      el('span', { class: 'tag' }, el('strong', {}, `~${Math.round((mod.examWeight || 0) * 100)}%`), ' of marks'),
      el('span', { class: 'tag' }, 'Spec ', el('strong', {}, mod.specPoints || '—')),
      mod.appearedIn ? el('span', { class: 'tag' }, 'Appeared in ', el('strong', {}, mod.appearedIn)) : null,
      el('span', { class: 'tag' }, 'Est. ', el('strong', {}, mod.estimatedSessions || '—')),
    )));

  // jump nav + red filter
  const filterBtn = el('button', { class: 'act secondary', onclick: () => toggleRed() }, 'Show red only');
  // Section numbering shifts when a module has a teaching section, so it is
  // derived rather than hard-coded — otherwise the module page and the printed
  // sheet disagree about which section is which.
  const teach = mod.sections.teach;
  const num = (n) => String(teach ? n + 1 : n).padStart(2, '0');

  const jump = el('nav', { class: 'jump' },
    el('a', { href: '#/home' }, '← All modules'),
    el('a', { href: '#intel-a' }, 'What comes up'),
    teach ? el('a', { href: '#teach-a' }, 'How it works') : null,
    el('a', { href: '#sheet-a' }, 'Cheat sheet'),
    el('a', { href: '#understand-a' }, 'Understanding it'),
    el('a', { href: '#drill-a' }, 'Exam drill'),
    filterBtn);
  root.append(jump);

  // subsections of prose, each its own taggable unit
  const proseSection = (id, key, label, subsections) => {
    const sec = el('section', { id }, sectionHeading(mod, key, label));
    for (const sub of subsections) {
      const wrap = el('div', { class: 'subsection', 'data-item-id': sub.itemId, dataset: { redable: '1' } });
      if (sub.heading) wrap.append(el('h3', {}, sub.heading));
      // the visible control, on the thing most worth rating in one go
      if (sub.heading) wrap.append(ragControl(sub.itemId, { label: 'How is this?' }));
      wrap.append(el('div', { html: sub.html }));
      sec.append(wrap);
    }
    return sec;
  };

  // 01 — intel
  const intel = el('section', { id: 'intel-a' }, sectionHeading(mod, 'intel', '01'),
    el('div', { html: mod.sections.intel.html }));
  root.append(intel);

  // 02 — how it works (only where it has been written)
  if (teach) root.append(proseSection('teach-a', 'teach', '02', teach.subsections));

  // cheat sheet
  root.append(proseSection('sheet-a', 'sheet', num(2), mod.sections.sheet.subsections));

  // understanding
  const und = el('section', { id: 'understand-a' }, sectionHeading(mod, 'understand', num(3)));
  if (mod.sections.understanding.intro) und.append(el('p', { html: mod.sections.understanding.intro }));
  for (const q of mod.sections.understanding.questions) und.append(questionBlock(q, { writing: false }));
  root.append(und);

  // drill
  const drill = el('section', { id: 'drill-a' }, sectionHeading(mod, 'drill', num(4)));
  if (mod.sections.drill.intro) drill.append(el('p', { html: mod.sections.drill.intro }));
  for (const q of mod.sections.drill.questions) drill.append(questionBlock(q));
  root.append(drill);

  root.append(el('footer', {}, `Module ${mod.number} of ${activeSubject().plannedModules || content.modules.length} · ${mod.title} · ${activeSubject().board}`));

  // Say what the margin dots are — a quiet control still has to be findable.
  // Built now that the content exists, so the "n of m rated" count is real,
  // then lifted up to sit directly under the jump nav.
  jump.after(ragHint([...root.querySelectorAll('[data-item-id]')].map(n => n.dataset.itemId)));

  // red-only filter: hides subsections/questions whose effective tag isn't red
  let redOnly = false;
  function applyRedFilter() {
    const isRedId = id => { const eff = effectiveTag(id); return !!eff && eff.value === 'red'; };
    for (const elWrap of root.querySelectorAll('[data-redable]')) {
      // a block stays visible if it, or anything inside it, is effectively red
      const anyRed = isRedId(elWrap.dataset.itemId) ||
        [...elWrap.querySelectorAll('[data-item-id]')].some(n => isRedId(n.dataset.itemId));
      elWrap.style.display = redOnly && !anyRed ? 'none' : '';
    }
    // hide whole sections left empty by the filter
    for (const sec of root.querySelectorAll('section')) {
      const anyVisible = [...sec.querySelectorAll('[data-redable]')].some(w => w.style.display !== 'none');
      const hasRedables = sec.querySelector('[data-redable]');
      sec.style.display = redOnly && hasRedables && !anyVisible ? 'none' : '';
    }
    filterBtn.textContent = redOnly ? 'Show everything' : 'Show red only';
    rail.position();
  }
  function toggleRed() { redOnly = !redOnly; applyRedFilter(); }

  const rail = attachRail(root);
  attachCapture(root);
  const onTagsChanged = () => {
    if (!root.isConnected) { document.removeEventListener('tags-changed', onTagsChanged); return; }
    if (redOnly) applyRedFilter();
  };
  document.addEventListener('tags-changed', onTagsChanged);

  if (query.item) setTimeout(() => flashItem(root, query.item), 60);
  return root;
}

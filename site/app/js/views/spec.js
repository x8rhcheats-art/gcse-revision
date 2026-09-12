// views/spec.js — the school's own specification tick-sheet.
//
// The info pack tells students to traffic-light these 136 points. Rather than
// making that a second, parallel tagging job, each point hangs off its module,
// so a module or section tag colours its spec points automatically — and any
// individual point can still be overridden. The value this adds over module
// coverage is syllabus-level assurance: it can answer "is there anything
// examinable we have not touched at all?"

import { content, moduleTitle } from '../content.js';
import { el, view, flashItem } from '../ui.js';
import { attachRail } from '../rail.js';
import { effectiveTag } from '../model.js';

export function renderSpec(params, query = {}) {
  const root = view('Specification',
    `All ${content.spec.length} points you can be examined on, straight from the school's information pack. Colours come from the tags you have already applied to the modules — tag a point directly to override it.`);

  const filterBtn = el('button', { class: 'act secondary' }, 'Show untagged only');
  root.append(el('div', { class: 'filter-bar' }, filterBtn,
    el('a', { class: 'act secondary', href: '#/red' }, 'Red list')));

  const summary = el('p', { class: 'plain-note' });
  root.append(summary);

  const byTopic = new Map();
  for (const p of content.spec) {
    if (!byTopic.has(p.topicName)) byTopic.set(p.topicName, []);
    byTopic.get(p.topicName).push(p);
  }

  for (const [topicName, points] of byTopic) {
    const modId = points[0].moduleIds[0];
    const sec = el('section', {},
      el('h2', {}, el('span', { class: 'num' }, `${points.length} points`), topicName || 'Other'));
    if (modId) {
      sec.append(el('p', { class: 'plain-note' },
        'Covered by ', el('a', { href: `#/module/${modId}` }, moduleTitle(modId)),
        points.some(p => p.moduleIds.length > 1) ? ' (practicals also in Practical and Data Skills)' : ''));
    }
    let lastSection = null;
    for (const p of points) {
      if (p.section !== lastSection) {
        sec.append(el('h3', {}, p.section || ''));
        lastSection = p.section;
      }
      sec.append(el('div', { class: 'specpoint', 'data-item-id': p.itemId, dataset: { redable: '1' } },
        el('span', { class: 'spec-code' }, p.code),
        el('span', { class: 'spec-text' }, p.text),
        p.isPractical ? el('span', { class: 'kind-chip' }, 'practical') : null));
    }
    root.append(sec);
  }

  // counts + untagged filter
  let untaggedOnly = false;
  function refresh() {
    let tagged = 0;
    for (const node of root.querySelectorAll('.specpoint')) {
      const eff = effectiveTag(node.dataset.itemId);
      if (eff) tagged++;
      node.style.display = untaggedOnly && eff ? 'none' : '';
    }
    for (const sec of root.querySelectorAll('section')) {
      const any = [...sec.querySelectorAll('.specpoint')].some(n => n.style.display !== 'none');
      sec.style.display = untaggedOnly && !any ? 'none' : '';
    }
    summary.textContent = `${tagged} of ${content.spec.length} points carry a colour (directly or from their module). ` +
      `${content.spec.length - tagged} have never been touched.`;
    filterBtn.textContent = untaggedOnly ? 'Show everything' : 'Show untagged only';
    rail.position();
  }
  filterBtn.addEventListener('click', () => { untaggedOnly = !untaggedOnly; refresh(); });

  const rail = attachRail(root);
  refresh();
  document.addEventListener('tags-changed', () => { if (root.isConnected) refresh(); });
  if (query.item) setTimeout(() => flashItem(root, query.item), 60);
  return root;
}

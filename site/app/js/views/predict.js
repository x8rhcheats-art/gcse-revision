// views/predict.js — what the past papers say is coming.
//
// Two halves, deliberately kept apart:
//   1. FACT — a frequency table computed live from the past papers actually in
//      the app. Nothing is authored here; it is arithmetic on real data.
//   2. PREDICTION — authored bands from content/<subject>/predictions.json,
//      every item carrying the papers it is based on.
//
// The third section is the one worth having: it crosses the predictions with
// the confidence model, so "likely to come up" is filtered down to "likely to
// come up AND you are currently weak on it". That is the revision order.

import { content, index, moduleTitle, activeSubject } from '../content.js';
import { el, view } from '../ui.js';
import { moduleNeed, redItemsByModule } from '../model.js';

// The reconciled states that mean "this needs work", with the plain-English
// reason shown in the table. Names must match model.js exactly.
const WEAK_STATES = {
  'blind-spot': 'rated green, but performing weak',
  'known-gap': 'you have flagged it, or the results are weak',
  'mixed-evidence': 'rated green, evidence is mixed',
  'unverified': 'rated green but never tested',
  'unknown': 'no evidence either way yet',
};

/** Per-module appearance count and marks, computed from the papers we hold. */
function paperStats() {
  const papers = [...content.pastPapers, ...content.mocks];
  const years = [...new Set(papers.map(p => p.year).filter(Boolean))].sort();
  const byModule = new Map();
  for (const p of papers) {
    for (const q of p.questions) {
      for (const mid of q.moduleIds || []) {
        if (!byModule.has(mid)) byModule.set(mid, { years: new Set(), marks: 0 });
        const s = byModule.get(mid);
        if (p.year) s.years.add(p.year);
        s.marks += q.marks || 0;
      }
    }
  }
  return { years, byModule };
}

export function renderPredict() {
  const subj = activeSubject();
  const pred = content.predictions;
  const { years, byModule } = paperStats();

  if (!pred) {
    return view('What is likely to come up',
      `No prediction has been built for ${subj.title} yet — it needs past papers to read. Once they are in the app this page fills itself in.`);
  }

  const root = view('What is likely to come up', pred.basis);

  // the honesty line, first thing on the page and impossible to miss
  root.append(el('div', { class: 'predict-caveat' },
    el('p', {}, el('strong', {}, 'This is a prediction, not a leak. '), pred.caveat)));

  // ---- 1. the shape of the paper ----
  if (pred.paperShape) {
    const ps = pred.paperShape;
    const shape = el('section', {},
      el('h2', {}, el('span', { class: 'num' }, '01'), 'The shape of the paper'));
    const t = el('table', {});
    for (const [k, v] of [
      ['Questions', ps.questions], ['Marks', ps.marks],
      ['Time', ps.time], ['What you are given', ps.given],
    ]) if (v) t.append(el('tr', {}, el('td', { style: 'width:34%' }, k), el('td', {}, v)));
    shape.append(t);
    if (ps.notes && ps.notes.length) {
      shape.append(el('ul', {}, ...ps.notes.map(n => el('li', {}, n))));
    }
    root.append(shape);
  }

  // ---- 2. what the papers ACTUALLY did (computed, not authored) ----
  if (byModule.size) {
    const facts = el('section', {},
      el('h2', {}, el('span', { class: 'num' }, '02'), 'What the papers actually did'),
      el('p', {}, `Counted from the ${years.length} paper${years.length === 1 ? '' : 's'} in the app`,
        years.length ? ` (${years.join(', ')})` : '',
        '. This half is arithmetic, not opinion — it updates itself whenever a paper is added.'));
    const rows = [...byModule.entries()]
      .sort((a, b) => b[1].marks - a[1].marks);
    const max = rows.length ? rows[0][1].marks : 1;
    const table = el('table', {});
    table.append(el('tr', {},
      el('th', {}, 'Topic'), el('th', {}, 'Appeared'), el('th', {}, 'Marks'), el('th', {}, '')));
    for (const [mid, s] of rows) {
      const every = years.length && s.years.size === years.length;
      table.append(el('tr', {},
        el('td', {}, el('a', { href: `#/module/${mid}` }, moduleTitle(mid))),
        el('td', { class: every ? 'every-year' : '' },
          `${s.years.size} of ${years.length}${every ? ' — every year' : ''}`),
        el('td', {}, String(s.marks)),
        el('td', { style: 'width:34%' },
          el('span', { class: 'freq-bar', style: `width:${Math.round((s.marks / max) * 100)}%` }))));
    }
    facts.append(table);
    root.append(facts);
  }

  // ---- 3. the prediction bands ----
  let n = 2;
  for (const band of pred.bands || []) {
    n++;
    const sec = el('section', { class: `predict-band band-${band.id}` },
      el('h2', {}, el('span', { class: 'num' }, String(n).padStart(2, '0')), band.title),
      el('p', {}, band.note));
    for (const item of band.items || []) {
      const box = el('div', { class: 'predict-item' },
        el('p', { class: 'pi-claim' }, item.claim),
        el('p', { class: 'pi-why' }, item.why),
        el('p', { class: 'pi-meta' },
          el('span', { class: 'pi-evidence' }, item.evidence),
          item.marks ? el('span', { class: 'pi-marks' }, `${item.marks} marks`) : null));

      // What you have to know. Each point leads with a plain, shouty one-liner
      // you can skim, then the examiner's own wording underneath — that wording
      // is what actually scores, so it stays on the page rather than being
      // paraphrased away.
      if ((item.mustKnow || []).length) {
        box.append(
          el('h4', { class: 'pi-h' }, 'What you have to know'),
          el('ul', { class: 'pi-know' }, ...item.mustKnow.map(k =>
            el('li', {},
              el('span', { class: 'pk-gist' }, k.gist),
              el('span', { class: 'pk-exact', html: k.exact })))));
      }

      // practice, answers hidden behind a native <details> so you try first
      if ((item.practice || []).length) {
        box.append(el('h4', { class: 'pi-h' },
          `Practice — ${item.practice.length} question${item.practice.length === 1 ? '' : 's'}`));
        for (const p of item.practice) {
          box.append(el('div', { class: 'pi-q' },
            el('p', { class: 'pi-qtext' }, p.q,
              p.marks ? el('span', { class: 'marks' }, ` (${p.marks})`) : null),
            el('details', { class: 'ans' },
              el('summary', {}, 'Show answer'),
              el('div', { class: 'inner', html: p.a }))));
        }
      }

      if ((item.moduleIds || []).length) {
        box.append(el('p', { class: 'pi-links' },
          'Full module: ',
          ...item.moduleIds.flatMap((mid, i) => [
            i ? ' · ' : '',
            el('a', { href: `#/module/${mid}` }, moduleTitle(mid)),
          ])));
      }
      sec.append(box);
    }
    root.append(sec);
  }

  // ---- 4. crossed with your own progress ----
  const reds = redItemsByModule();
  const scored = [];
  for (const [mid, s] of byModule.entries()) {
    if (!index.moduleById.has(mid)) continue;
    const need = moduleNeed(mid, reds);          // { state, reds, score, ... }
    // flagged when the reconciled state says it needs work, or anything inside
    // it is tagged red. "secure" and "confidence-gap" (red but performing well)
    // are deliberately not flagged.
    if (WEAK_STATES[need.state] || need.reds > 0) {
      scored.push({ mid, marks: s.marks, need });
    }
  }
  // heaviest on the paper first — that is what makes this a revision ORDER
  scored.sort((a, b) => b.marks - a.marks);

  const cross = el('section', {},
    el('h2', {}, el('span', { class: 'num' }, String(n + 1).padStart(2, '0')),
      'Heavy on the paper, weak for you'),
    el('p', {}, 'The two halves of this page crossed together: topics that carry the most marks in the past papers AND that your own tags or results say are shaky. This is the revision order.'));

  if (!scored.length) {
    cross.append(el('p', { class: 'plain-note' },
      'Nothing flagged — either nothing is tagged red yet, or you have no weak results recorded. Tag a few things red in the modules, or sit some multiple choice, and this list fills itself in.'));
  } else {
    const list = el('table', {});
    list.append(el('tr', {}, el('th', {}, 'Topic'), el('th', {}, 'Marks in past papers'), el('th', {}, 'Why it is flagged')));
    for (const s of scored.slice(0, 6)) {
      const reasons = [];
      if (s.need.reds) reasons.push(`${s.need.reds} item${s.need.reds === 1 ? '' : 's'} tagged red`);
      if (WEAK_STATES[s.need.state]) reasons.push(WEAK_STATES[s.need.state]);
      list.append(el('tr', {},
        el('td', {}, el('a', { href: `#/module/${s.mid}` }, moduleTitle(s.mid))),
        el('td', {}, String(s.marks)),
        el('td', {}, reasons.join(' · ') || 'flagged')));
    }
    cross.append(list);
    cross.append(el('p', {},
      el('a', { class: 'act', href: '#/priority' }, 'Build a session on these'), ' ',
      el('a', { class: 'act secondary', href: '#/red' }, 'See the full red list')));
  }
  root.append(cross);

  root.append(el('footer', {},
    `Prediction for ${subj.title} · read from ${years.length} past paper${years.length === 1 ? '' : 's'} · not a leak, and no substitute for covering the specification`));
  return root;
}

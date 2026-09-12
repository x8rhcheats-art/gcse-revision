// views/coach.js — the coach dashboard. Read-only, dense, scannable in
// thirty seconds, phone-width friendly. Blind spots pinned on top, always.
// Statements of fact only.

import { content, index } from '../content.js';
import { el, view, shortDate, daysAgo } from '../ui.js';
import { getState, exportJson, importJson } from '../store.js';
import { allModuleStates, errorCodeDistribution, movement, coverage, mockTrend } from '../model.js';

const STATE_LABELS = {
  'blind-spot': 'blind spot', 'known-gap': 'known gap', 'confidence-gap': 'confidence gap',
  'secure': 'secure', 'unverified': 'unverified', 'unknown': 'unknown', 'mixed-evidence': 'mixed evidence',
};
const CODE_LABELS = {
  knowledge: 'Knowledge', wording: 'Wording', maths: 'Maths',
  'unit-conversion': 'Unit conversion', presentation: 'Presentation',
};

const pctText = p => p == null ? '—' : `${Math.round(p * 100)}%`;
const tagword = v => v ? el('span', { class: `tagword-${v}` }, v) : el('span', {}, 'untagged');

function block(title, cls = '') {
  return el('div', { class: `block ${cls}` }, el('h2', {}, title));
}

function evidenceLines(s) {
  const out = [];
  if (s.declared) out.push(`Rated ${s.declared.value} ${shortDate(s.declared.at)} — ${s.declared.basis}.`);
  else out.push('Not tagged.');
  if (s.demonstrated.available > 0) {
    out.push(`Demonstrated: ${pctText(s.demonstrated.pct)} of ${Math.round(s.demonstrated.available)} marks of evidence, ${s.demonstrated.questionsAttempted} question${s.demonstrated.questionsAttempted === 1 ? '' : 's'}.`);
  } else out.push('No demonstrated evidence yet.');
  for (const wq of (s.demonstrated.weakQuestions || []).slice(0, 3)) out.push(wq.label + '.');
  return out;
}

export function renderCoach() {
  const root = view('Coach view', 'Read-only. Two signals — what John says, what John does — reconciled at read time.');
  root.classList.add('coach');
  const states = allModuleStates();

  // 1 — blind spots, pinned, visually distinct
  const blind = states.filter(s => s.state === 'blind-spot');
  const b1 = block('Blind spots', 'blind');
  if (blind.length) {
    b1.append(el('p', { class: 'statline' }, 'Rated green, performing weak. These will not get revised unprompted.'));
    for (const s of blind) {
      b1.append(el('h3', {}, s.title));
      for (const line of evidenceLines(s)) b1.append(el('p', { class: 'evidence' }, line));
    }
  } else {
    b1.append(el('p', { class: 'statline' }, 'None detected. A blind spot needs a green rating plus at least 4 marks of weak evidence — check Coverage below for topics with no evidence either way.'));
  }
  root.append(b1);

  // 2 — known gaps ranked by exam weight
  const gaps = states.filter(s => s.state === 'known-gap')
    .sort((a, b) => (b.examWeight || 0) - (a.examWeight || 0));
  const b2 = block('Known gaps, ranked by exam weight');
  if (gaps.length) {
    const t = el('table', {});
    t.append(el('tr', {}, el('th', {}, 'Module'), el('th', {}, 'Weight'), el('th', {}, 'Declared'), el('th', {}, 'Demonstrated')));
    for (const s of gaps) {
      t.append(el('tr', {},
        el('td', {}, s.title),
        el('td', { class: 'num' }, `~${Math.round((s.examWeight || 0) * 100)}%`),
        el('td', {}, tagword(s.declared ? s.declared.value : null)),
        el('td', { class: 'num' }, s.demonstrated.available ? `${pctText(s.demonstrated.pct)} of ${Math.round(s.demonstrated.available)} marks` : 'untested')));
    }
    b2.append(t);
  } else b2.append(el('p', { class: 'statline' }, 'None at the moment.'));
  root.append(b2);

  // 3 — error-code distribution
  const codes = errorCodeDistribution();
  const b3 = block('Marks lost by error code — diagnostic and mocks');
  const totalLost = Object.values(codes).reduce((a, n) => a + n, 0);
  if (totalLost) {
    const max = Math.max(...Object.values(codes));
    const t = el('table', {});
    for (const [code, label] of Object.entries(CODE_LABELS)) {
      const n = codes[code] || 0;
      t.append(el('tr', {},
        el('td', { style: 'width:38%' }, label),
        el('td', { class: 'num', style: 'width:64px' }, `${n}`),
        el('td', {}, el('span', { class: 'bar', style: `width:${max ? Math.round((n / max) * 160) : 0}px` }))));
    }
    b3.append(t, el('p', { class: 'statline' }, `${totalLost} coded marks in total.`));
  } else b3.append(el('p', { class: 'statline' }, 'No coded marks entered yet.'));
  root.append(b3);

  // 4 — confidence movement, last 7 days
  const mv = movement(7);
  const b4 = block('Confidence movement — last 7 days');
  if (mv.changes.length) {
    const t = el('table', {});
    for (const c of mv.changes.slice(0, 25)) {
      t.append(el('tr', {},
        el('td', {}, el('span', { class: 'kind-chip' }, c.info.kind), c.info.label),
        el('td', {}, c.from ? tagword(c.from) : 'untagged', ' → ', tagword(c.to)),
        el('td', { class: 'num' }, shortDate(c.at))));
    }
    b4.append(t);
    if (mv.changes.length > 25) b4.append(el('p', { class: 'statline' }, `${mv.changes.length - 25} more changes not shown.`));
  } else b4.append(el('p', { class: 'statline' }, 'No tag changes in the last 7 days.'));
  if (mv.stale.length) {
    b4.append(el('p', { class: 'statline' },
      'No activity at all in 7 days: ' + mv.stale.map(id => index.moduleById.get(id)?.title || id).join(', ') + '.'));
  }
  root.append(b4);

  // 5 — coverage
  const b5 = block('Coverage');
  const t5 = el('table', {});
  t5.append(el('tr', {}, el('th', {}, 'Module'), el('th', {}, 'Questions attempted'), el('th', {}, 'Items tagged'), el('th', {}, 'Last activity')));
  for (const c of coverage()) {
    t5.append(el('tr', {},
      el('td', {}, c.title),
      el('td', { class: 'num' }, `${c.attempted} of ${c.totalQuestions}`),
      el('td', { class: 'num' }, `${c.tagged} of ${c.taggable}`),
      el('td', { class: 'num' }, c.lastActivity ? shortDate(c.lastActivity) : 'never opened')));
  }
  b5.append(t5);
  root.append(b5);

  // 6 — mock trend
  const trend = mockTrend();
  const b6 = block('Papers');
  if (trend.length) {
    for (const row of trend) {
      b6.append(el('p', { class: 'statline' },
        `${row.title} · ${shortDate(row.at)} · ${row.score}/${row.marks}` +
        (row.minutesTaken ? ` · ${row.minutesTaken} min` : '')));
      const t = el('table', {});
      const cells = row.perQuestion.map(q =>
        el('td', { class: 'num', title: q.topic || '' }, `${q.label} ${q.score}/${q.marks}`));
      t.append(el('tr', {}, ...cells));
      b6.append(t);
    }
  } else b6.append(el('p', { class: 'statline' }, 'No paper results entered yet.'));
  root.append(b6);

  // all-states overview
  const b7 = block('All modules');
  const t7 = el('table', {});
  t7.append(el('tr', {}, el('th', {}, 'Module'), el('th', {}, 'Declared'), el('th', {}, 'Demonstrated'), el('th', {}, 'State')));
  for (const s of [...states].sort((a, b) => (b.examWeight || 0) - (a.examWeight || 0))) {
    t7.append(el('tr', {},
      el('td', {}, s.title),
      el('td', {}, tagword(s.declared ? s.declared.value : null)),
      el('td', { class: 'num' }, s.demonstrated.level === 'untested' ? 'untested' : `${s.demonstrated.level} · ${pctText(s.demonstrated.pct)}`),
      el('td', {}, el('span', { class: `state-chip ${s.state}` }, STATE_LABELS[s.state]))));
  }
  b7.append(t7);
  root.append(b7);

  // data safety footer
  const st = getState();
  const exp = daysAgo(st.lastExported);
  const file = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  file.addEventListener('change', async () => {
    if (!file.files.length) return;
    try {
      if (confirm('Replace the progress stored in this browser with the contents of this file?')) {
        importJson(await file.files[0].text()); location.reload();
      }
    } catch (err) { alert(err.message); }
  });
  root.append(el('p', { class: 'plain-note no-export' },
    st.lastExported ? `Last backup: ${shortDate(st.lastExported)} (${exp} day${exp === 1 ? '' : 's'} ago). ` : '',
    'A copy of progress is also saved automatically to the app folder. ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); saveReport(root); } }, 'Save coach report'), ' · ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); exportJson(); } }, 'Export progress'), ' · ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); file.click(); } }, 'Import'), ' · ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); window.print(); } }, 'Print this page'),
    file));
  return root;
}

/**
 * One self-contained HTML file of this dashboard — CSS inlined, nothing to
 * install, opens in any phone browser. Made to be sent over chat or email.
 */
async function saveReport(root) {
  // Served build: read the stylesheets. Offline single-file build: they are
  // already inlined in the page, and fetch is refused on file:// anyway.
  const inline = [...document.querySelectorAll('style')].map(s => s.textContent);
  const css = inline.length
    ? inline
    : await Promise.all(['assets/style.css', 'app/app.css'].map(u => fetch(u).then(r => r.text())));
  const clone = root.cloneNode(true);
  for (const n of clone.querySelectorAll('.no-export, input')) n.remove();
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const html = `<!DOCTYPE html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Coach report · ${stamp}</title>
<style>${css.join('\n')}</style>
</head><body class="app-body"><main style="padding-bottom:40px">${clone.outerHTML}
<p class="plain-note" style="max-width:860px;margin:0 auto;padding:0 24px">Snapshot saved ${stamp}. Generated by the revision app.</p>
</main></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `coach-report-${stamp}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

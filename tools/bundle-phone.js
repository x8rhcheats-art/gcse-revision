#!/usr/bin/env node
/**
 * bundle-phone.js — a single HTML file that works on an iPhone.
 *
 * iOS renders an HTML file you tap (in Mail or Files) through Quick Look, which
 * shows HTML and CSS but does NOT run JavaScript. The app build is therefore
 * blank there. This build uses no JavaScript at all: answers open with native
 * <details>, navigation is plain anchors. Everything readable, nothing to run.
 *
 * What it cannot do, by definition: tagging, self-rating, the coach view — all
 * of those need storage and scripting. Those stay on the laptop.
 *
 * Output: John-Physics-Phone.html
 */
const fs = require('fs');
const path = require('path');

const SUBJECTS = require('./subjects.js');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
// Which subject: `node bundle-phone.js chemistry`, or no argument to build
// every subject that has modules. Output: John-<Subject>-Phone.html each.
const argued = process.argv[2];
const cfgs = argued
  ? [SUBJECTS[argued] || (() => { throw new Error(`unknown subject "${argued}" — one of: ${Object.keys(SUBJECTS).join(', ')}`); })()]
  : Object.values(SUBJECTS);

for (const cfg of cfgs) buildPhone(cfg);

function buildPhone(cfg) {
const OUT = path.join(ROOT, `John-${cfg.title}-Phone.html`);
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, cfg.out, f), 'utf8'));

const { modules } = read('modules.json');
if (!modules.length) { console.log(`${cfg.id}: no modules yet — skipped`); return; }
const mocksData = read('mocks.json');
const mcq = read('mcq.json').modules;
const reference = read('reference.json');
const spec = read('spec.json').points;
const meta = read('meta.json');
const predictions = fs.existsSync(path.join(ROOT, cfg.out, 'predictions.json'))
  ? read('predictions.json') : null;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const details = (summary, body) =>
  `<details class="ans"><summary>${esc(summary)}</summary><div class="inner">${body}</div></details>`;

// ---------- modules ----------
const moduleSections = modules.map(m => {
  const sheet = m.sections.sheet.subsections.map(s =>
    `${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}${s.html}`).join('\n');

  const understanding = m.sections.understanding.questions.map(q => `
<div class="q"><div class="qid">${esc(q.qid)}</div><div class="qbody">
${q.promptHtml}
${q.hint ? `<p class="hint"><b>Think about</b> ${esc(q.hint)}</p>` : ''}
${details('Show answer', q.answerHtml)}
</div></div>`).join('\n');

  const drill = m.sections.drill.questions.map(q => `
<div class="q"><div class="qid">${esc(q.qid)}</div><div class="qbody">
${q.promptHtml}
${q.hint ? `<p class="hint"><b>Think about</b> ${esc(q.hint)}</p>` : ''}
${details('Show answer', q.answerHtml)}
</div></div>`).join('\n');

  const quiz = (mcq[m.id] || []).map((q, i) => `
<div class="q"><div class="qid">${esc(q.id)}</div><div class="qbody">
<p><strong>${esc(q.q)}</strong></p>
<ol class="opts">${q.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>
${details('Show answer', `<p><strong>${esc('ABCD'[q.answer])} — ${esc(q.options[q.answer])}</strong></p><p>${esc(q.explain)}</p>`)}
</div></div>`).join('\n');

  return `
<section id="${esc(m.id)}">
<h2><span class="num">Module ${m.number}</span>${esc(m.title)}</h2>
<p class="standfirst">${esc(m.standfirst)}</p>
<div class="meta"><span class="tag"><strong>~${Math.round((m.examWeight || 0) * 100)}%</strong> of marks</span>
<span class="tag">Spec <strong>${esc(m.specPoints || '—')}</strong></span></div>

<h3 class="big">What comes up</h3>
${m.sections.intel.html}

<h3 class="big">Cheat sheet</h3>
${sheet}

<h3 class="big">Understanding it</h3>
${understanding}

<h3 class="big">Exam drill</h3>
${drill}

<h3 class="big">Multiple choice — ${(mcq[m.id] || []).length} questions</h3>
${quiz}
<p class="totop"><a href="#top">↑ Contents</a></p>
</section>`;
}).join('\n');

// ---------- exam reference (a subject may not have one yet) ----------
const groups = reference ? [...new Set(reference.techniqueRules.map(r => r.group))] : [];
const referenceSection = !reference ? '' : `
<section id="reference">
<h2><span class="num">Reference</span>Exam technique and the exam day</h2>

<h3 class="big">On the day</h3>
<div class="panel">
<p><strong>${esc(reference.examDay.dateText || reference.examDay.date || meta.examDate || '')}</strong></p>
<ul>${(reference.examDay.bring || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
<ul>${(reference.examDay.rules || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
</div>

<h3 class="big">${esc(reference.formulaSheet.note ? 'Formulae' : 'The formula sheet')}</h3>
<div class="panel">
<p>${esc(reference.formulaSheet.note || '')}</p>
${(reference.formulaSheet.given || []).map(f =>
  `<div class="eq">${f.words ? `<span class="name">${esc(f.words)}</span>` : ''}${esc(f.symbols || f)}</div>`).join('')}
</div>

${groups.map(g => `
<h3 class="big">${esc(g)}</h3>
<table><tr><th>Rule</th><th>Why</th></tr>
${reference.techniqueRules.filter(r => r.group === g).map(r =>
  `<tr><td><strong>${esc(r.rule)}</strong></td><td>${esc(r.detail || '')}</td></tr>`).join('')}
</table>`).join('')}

<h3 class="big">Self-mark checklists for drawings</h3>
${reference.diagramChecklists.map(c => `
<div class="panel"><h4>${esc(c.title)}</h4>
<p>${esc(c.note || '')}</p>
<ul>${(c.items || c.points || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}
<p class="totop"><a href="#top">↑ Contents</a></p>
</section>`;

// ---------- papers ----------
const paperSection = `
<section id="papers">
<h2><span class="num">Papers</span>Mock exams and mark schemes</h2>
${mocksData.mocks.map(mk => `
<h3 class="big">${esc(mk.title)} — ${mk.questions.reduce((a, q) => a + (q.marks || 0), 0)} marks</h3>
${mk.instructionsHtml || ''}
${mk.questions.map(q => `
<div class="q"><div class="qid">Q${q.number}</div><div class="qbody">
<p><strong>${esc(q.topic)}</strong> <span class="marks">(${q.marks})</span></p>
${q.promptHtml || ''}
${q.markSchemeHtml ? details('Show mark scheme', q.markSchemeHtml) : ''}
</div></div>`).join('')}`).join('')}

${mocksData.pastPapers.map(p => `
<h3 class="big">${esc(p.title)} — ${p.totalMarks} marks</h3>
<p class="plain-note">Work from the printed paper; the mark scheme is below.</p>
${p.questions.map(q => `
<div class="q"><div class="qid">Q${q.number}</div><div class="qbody">
<p><strong>${esc(q.topic)}</strong> <span class="marks">(${q.marks})</span></p>
${q.markSchemeHtml ? details('Show mark scheme', q.markSchemeHtml) : ''}
</div></div>`).join('')}`).join('')}
<p class="totop"><a href="#top">↑ Contents</a></p>
</section>`;

// ---------- what is likely to come up ----------
// The same authored bands as the app's predict view. The computed frequency
// table is left out: it needs the confidence model, which needs storage.
const predictSection = !predictions ? '' : `
<section id="predict">
<h2><span class="num">Prediction</span>What is likely to come up</h2>
<p>${esc(predictions.basis || '')}</p>
<div class="trap"><p><strong>This is a prediction, not a leak.</strong> ${esc(predictions.caveat || '')}</p></div>
${(predictions.bands || []).map(band => `
<h3 class="big">${esc(band.title)}</h3>
<p>${esc(band.note || '')}</p>
${(band.items || []).map(item => `
<div class="panel">
<p><strong>${esc(item.claim)}</strong></p>
<p>${esc(item.why || '')}</p>
<p class="plain-note">${esc(item.evidence || '')}${item.marks ? ` · ${esc(item.marks)} marks` : ''}</p>
${(item.mustKnow || []).length ? `<h4>What you have to know</h4>
<ul>${item.mustKnow.map(k => `<li><span class="pk-gist">${esc(k.gist)}</span><span class="pk-exact">${k.exact}</span></li>`).join('')}</ul>` : ''}
${(item.practice || []).length ? `<h4>Practice</h4>
${item.practice.map(p => `<div class="q"><div class="qbody">
<p>${esc(p.q)}${p.marks ? ` <span class="marks">(${p.marks})</span>` : ''}</p>
${details('Show answer', p.a)}
</div></div>`).join('')}` : ''}
</div>`).join('')}`).join('')}
<p class="totop"><a href="#top">↑ Contents</a></p>
</section>`;

// ---------- specification ----------
const byTopic = {};
for (const p of spec) (byTopic[p.topicName] = byTopic[p.topicName] || []).push(p);
const specSection = `
<section id="spec">
<h2><span class="num">Specification</span>All ${spec.length} examinable points</h2>
<p>Everything the exam can ask. Tick them off on paper if it helps.</p>
${Object.entries(byTopic).map(([topic, pts]) => `
<h3 class="big">${esc(topic)}</h3>
<table>${pts.map(p => `<tr><td style="width:64px"><strong>${esc(p.code)}</strong></td><td>${esc(p.text)}</td></tr>`).join('')}</table>`).join('')}
<p class="totop"><a href="#top">↑ Contents</a></p>
</section>`;

const css = ['assets/style.css'].map(f => fs.readFileSync(path.join(SITE, f), 'utf8')).join('\n');

const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(cfg.title)} Revision — phone copy</title>
<style>
${css}
/* phone copy: no scripts, so everything opens with native <details> */
.big { border-top: 1px solid var(--ink); padding-top: 14px; margin-top: 34px; font-size: 21px; }
.pk-gist { display: block; font-weight: 650; line-height: 1.45; margin-bottom: 3px; }
.pk-exact { display: block; font-size: 13.5px; line-height: 1.55; color: var(--ink-soft); padding-left: 10px; border-left: 2px solid var(--rule); }
#predict li { margin-bottom: 12px; }
.opts { margin: 8px 0 0; padding-left: 24px; }
.opts li { margin-bottom: 4px; }
.totop { margin-top: 30px; font-family: var(--mono); font-size: 12px; }
.toc a { display: block; padding: 11px 2px; border-bottom: 1px solid var(--rule); text-decoration: none; }
.toc a:last-child { border-bottom: none; }
@media (max-width: 620px) {
  .sheet { padding-left: 14px; padding-right: 14px; }
  table { font-size: 14px; }
  td:first-child { width: auto; }
}
</style>
</head>
<body>
<div class="sheet" id="top">

<header class="top">
  <p class="eyebrow">${esc(cfg.board)} · phone copy</p>
  <h1>${esc(cfg.title)} Revision</h1>
  <p class="standfirst">Everything readable, on one page: all ${modules.length} modules, ${Object.values(mcq).reduce((a, q) => a + q.length, 0)} multiple-choice questions with answers, the exam-technique rules, the papers and the specification. Tap any “Show answer” to open it.</p>
  <div class="meta">
    ${cfg.examDate ? `<span class="tag">Exam <strong>${esc(new Date(cfg.examDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</strong></span>` : '<span class="tag">GCSE <strong>2027</strong></span>'}
    <span class="tag">No internet needed</span>
  </div>
</header>

<section>
<h2><span class="num">Contents</span>Jump to</h2>
<div class="toc">
${modules.map(m => `<a href="#${esc(m.id)}">${m.number}. ${esc(m.title)}</a>`).join('\n')}
${reference ? `<a href="#reference">Exam technique and the exam day</a>` : ''}
<a href="#papers">Mock exams and mark schemes</a>
${predictions ? `<a href="#predict">What is likely to come up</a>` : ''}
<a href="#spec">The specification</a>
</div>
<p class="plain-note">Tagging, scores and the coach view need the full app on the laptop — this copy is for reading and self-testing.</p>
</section>

${moduleSections}
${referenceSection}
${paperSection}
${predictSection}
${specSection}

<footer>${esc(cfg.board)} · phone copy · no internet required</footer>
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`wrote ${path.relative(ROOT, OUT)} — ${Math.round(fs.statSync(OUT).size / 1024)} KB, zero JavaScript`);
}

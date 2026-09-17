// main.js — boot, hash router, sidebar navigation.
//
// Routing is subject-aware: "#/physics/red" names its subject, and a path with
// no subject prefix ("#/red" — every pre-multi-subject bookmark) resolves to
// the active subject, then the hash is quietly rewritten to the canonical
// prefixed form so any link copied from the address bar names its subject.

import { loadContent, loadRegistry, registry, activeSubject, content } from './content.js';
import { initStore, touchOpened } from './store.js';
import { redCount, dueCards } from './model.js';
import { el } from './ui.js';
import { renderHome } from './views/home.js';
import { renderModule } from './views/module.js';
import { renderRedList } from './views/redlist.js';
import { renderMock } from './views/mock.js';
import { renderDiagnostic } from './views/diagnostic.js';
import { renderCoach } from './views/coach.js';
import { renderCards, renderEqDrill, renderMixDrill } from './views/practice.js';
import { renderMcqHome, renderMcqQuiz } from './views/mcq.js';
import { renderSession } from './views/session.js';
import { renderPriority } from './views/priority.js';
import { renderReview, wrongAttempts } from './views/review.js';
import { renderReference } from './views/reference.js';
import { renderSpec } from './views/spec.js';
import { renderFinalSheet } from './views/finalsheet.js';
import { renderSearch } from './views/search.js';
import { renderSync } from './views/sync.js';
import { renderLanding } from './views/landing.js';
import { renderPredict } from './views/predict.js';
import { renderOfficial } from './views/official.js';

// bump on every change set; shown in the sidebar so a stale tab is obvious
const APP_VERSION = 'v36';

// remembers which subject to open next time; deliberately its own key, not
// part of any subject's progress store
const ACTIVE_SUBJECT_KEY = 'revision-active-subject';

const main = document.getElementById('main');
const sidenav = document.getElementById('sidenav');

const ROUTES = [
  [/^\/?$|^\/home$/, () => renderHome()],
  [/^\/module\/([\w-]+)$/, (m, q) => renderModule({ id: m[1] }, q)],
  [/^\/red$/, () => renderRedList()],
  [/^\/mock\/([\w-]+)$/, (m, q) => renderMock({ id: m[1] }, q)],
  [/^\/diagnostic$/, () => renderDiagnostic()],
  [/^\/coach$/, () => renderCoach()],
  [/^\/cards$/, (m, q) => renderCards(q)],
  [/^\/practice$/, () => renderSession()],
  [/^\/priority$/, (m, q) => renderPriority({}, q)],
  [/^\/eq-drill$/, (m, q) => renderEqDrill(q)],
  [/^\/mix-drill$/, (m, q) => renderMixDrill(q)],
  [/^\/mcq$/, () => renderMcqHome()],
  [/^\/mcq\/([\w-]+)$/, (m, q) => renderMcqQuiz({ id: m[1] }, q)],
  [/^\/review$/, () => renderReview()],
  [/^\/reference$/, (m, q) => renderReference({}, q)],
  [/^\/spec$/, (m, q) => renderSpec({}, q)],
  [/^\/final$/, () => renderFinalSheet()],
  [/^\/predict$/, () => renderPredict()],
  [/^\/official$/, () => renderOfficial()],
  [/^\/search$/, () => renderSearch()],
  [/^\/sync$/, () => renderSync()],
];

function parseHash() {
  // no hash at all lands on the subject picker, not inside a subject
  const raw = location.hash.replace(/^#/, '') || '/subjects';
  const [pathPart, queryPart] = raw.split('?');
  const query = {};
  if (queryPart) for (const kv of queryPart.split('&')) {
    const [k, v] = kv.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  // a leading segment that names a subject selects it; anything else is a
  // plain route within the active subject
  let path = pathPart;
  let subject = registry.activeId;
  const m = path.match(/^\/([\w-]+)(\/.*)?$/);
  if (m && registry.subjects.some(s => s.id === m[1])) {
    subject = m[1];
    path = m[2] || '/home';
  }
  return { subject, path, query, queryPart };
}

async function switchSubject(subjectId) {
  initStore(subjectId, registry.subjects.map(s => s.id));
  await loadContent(subjectId);
  try { localStorage.setItem(ACTIVE_SUBJECT_KEY, subjectId); } catch { /* cosmetic */ }
  // per-subject accent colour — CSS keys off this attribute
  document.body.dataset.subject = subjectId;
  const subj = activeSubject();
  document.title = `${subj.title} Revision — ${subj.board}`;
  touchOpened();
}

async function route() {
  const { subject, path, query, queryPart } = parseHash();
  // the landing page stands outside any subject: no switch, no prefix
  if (path === '/subjects') {
    if (location.hash !== '#/subjects') history.replaceState(null, '', '#/subjects');
    document.title = 'GCSE Revision';
    delete document.body.dataset.subject;   // landing is subject-neutral
    main.replaceChildren(renderLanding());
    window.scrollTo(0, 0);
    buildNav('/subjects');
    return;
  }
  if (subject !== registry.activeId) await switchSubject(subject);
  // rewrite the hash to its canonical subject-prefixed form (replaceState
  // fires no hashchange, so this cannot loop)
  const canonical = `#/${registry.activeId}${path}${queryPart ? '?' + queryPart : ''}`;
  if (location.hash !== canonical) history.replaceState(null, '', canonical);
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) {
      main.replaceChildren(fn(m, query));
      window.scrollTo(0, 0);
      buildNav(path);
      return;
    }
  }
  main.replaceChildren(el('div', { class: 'view' }, el('p', {}, 'Page not found. ', el('a', { href: '#/home' }, 'Home.'))));
  buildNav('');
}

function buildNav(activePath) {
  const reds = redCount();
  const due = dueCards().length;
  const wrong = wrongAttempts().length;
  const link = (href, label, extra = {}) => {
    const path = href.replace(/^#/, '');
    return el('a', {
      class: `navlink${extra.cls || ''}${activePath === path || (extra.prefix && activePath.startsWith(extra.prefix)) ? ' active' : ''}`,
      href,
      // clicking the link for the view you are already on re-renders it fresh
      // (a plain same-hash href fires no hashchange, which reads as "stuck")
      onclick: (e) => {
        if (location.hash === href) { e.preventDefault(); route(); }
      },
    }, ...label);
  };
  // the landing page gets a bare sidebar: the wordmark and the subjects
  if (activePath === '/subjects') {
    sidenav.replaceChildren(
      el('a', { class: 'brand', href: '#/subjects' }, 'Revision',
        el('small', {}, `John’s GCSEs · ${APP_VERSION}`)),
      ...registry.subjects.map(s => {
        const a = link(`#/${s.id}/home`, [s.title,
          s.moduleCount ? el('span', { class: 'count' }, ` ${s.moduleCount}`) : '']);
        return a;
      }));
    return;
  }

  const subj = activeSubject();
  sidenav.replaceChildren(
    // the wordmark is the way back out to the subject picker
    el('a', { class: 'brand', href: '#/subjects' }, `${subj.title} ${subj.code}`,
      el('small', {}, `${subj.tagline ? subj.tagline + ' · ' : ''}${APP_VERSION}`)),
    // subject switcher — only exists once there is something to switch to
    ...(registry.subjects.length > 1 ? [el('div', { class: 'subject-switch' },
      ...registry.subjects.map(s => el('a', {
        class: `subjlink${s.id === subj.id ? ' current' : ''}`,
        href: `#/${s.id}/home`,
      }, s.title)))] : []),
    link('#/home', ['Home']),
    link('#/red', ['Red topics', reds ? el('span', { class: 'count' }, ` ${reds}`) : '']),
    link('#/review', ['Get these right', wrong ? el('span', { class: 'count' }, ` ${wrong}`) : '']),
    link('#/cards', ['Flashcards', due ? el('span', { class: 'count' }, ` ${due}`) : '']),
    link('#/eq-drill', ['Equation drill']),
    link('#/mix-drill', ['Mixed practice']),
    link('#/practice', ['Build a session']),
    // a subject whose multiple-choice bank has not been written yet would send
    // this link to "not found", so it only appears once there are questions
    ...(Object.values(content.mcq || {}).some(qs => qs.length)
      ? [link('#/mcq', ['Multiple choice'], { prefix: '/mcq' })] : []),
    link('#/search', ['Search']),
    el('div', { class: 'navgroup' }, 'Modules'),
    link('#/priority', ['Priority Module']),
    ...content.modules.flatMap((m, i, all) => {
      const a = link(`#/module/${m.id}`, [`${m.number}. ${m.title}`]);
      a.classList.add('navmod');
      // year headings for subjects that group their modules (biology)
      const group = (subj.moduleGroups || []).find(g => m.number >= g.from && m.number <= g.to);
      const prev = i ? (subj.moduleGroups || []).find(g => all[i - 1].number >= g.from && all[i - 1].number <= g.to) : null;
      return group && group !== prev ? [el('div', { class: 'navgroup' }, group.title), a] : [a];
    }),
    // the complete pack is a plain page, not a route — it opens in its own tab
    ...(subj.completePack
      ? [el('a', { class: 'navlink navmod', href: subj.completePack, target: '_blank' }, 'Complete pack ↗')]
      : []),
    el('div', { class: 'navgroup' }, 'Papers'),
    ...(content.diagnostic ? [link('#/diagnostic', ['Diagnostic'])] : []),
    ...content.mocks.map(mk => link(`#/mock/${mk.id}`, [mk.title])),
    // grouped papers get their own small heading in the sidebar
    ...content.pastPapers.flatMap((p, i, all) => [
      ...(p.group && p.group !== (all[i - 1] || {}).group ? [el('div', { class: 'navgroup' }, p.group)] : []),
      link(`#/mock/${p.id}`, [p.title]),
    ]),
    // the board's own papers, for Year 11 — links out, only where some exist
    ...(((subj.officialPapers || {}).papers || []).length
      ? [el('div', { class: 'navgroup' }, 'Year 11 — real exams'), link('#/official', ['Real Edexcel papers'])] : []),
    el('div', { class: 'navgroup' }, 'Reference'),
    link('#/reference', ['Exam reference']),
    link('#/spec', ['Specification']),
    ...(content.predictions ? [link('#/predict', ['What comes up ✦'])] : []),
    link('#/final', ['The last sheet']),
    // PDFs, not routes — they open in their own tab like the complete pack
    ...(content.meta.documents || []).map(d =>
      el('a', { class: 'navlink', href: d.file, target: '_blank', title: d.note || '' }, `${d.title} ↗`)),
    el('div', { class: 'navgroup' }, ' '),
    link('#/coach', ['Coach view']),
    link('#/sync', ['Sync']),
  );
}

async function boot() {
  try {
    await loadRegistry();
    // subject priority: named in the URL > last used > first in the registry
    const seg = ((location.hash.replace(/^#/, '').split('?')[0] || '').match(/^\/([\w-]+)/) || [])[1];
    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_SUBJECT_KEY); } catch { /* fine */ }
    const ids = registry.subjects.map(s => s.id);
    const subjectId = ids.includes(seg) ? seg : (ids.includes(saved) ? saved : ids[0]);
    await switchSubject(subjectId);
  } catch (err) {
    main.replaceChildren(el('div', { class: 'view' },
      el('h1', {}, 'Could not load content'),
      el('p', {}, 'This app needs its local server. Close this tab and double-click ', el('code', {}, 'start.bat'), ' in the project folder.'),
      el('p', { class: 'plain-note' }, String(err))));
    return;
  }
  window.addEventListener('hashchange', route);
  // never let a nav-rebuild error propagate back into the store mutation
  // that dispatched the event (it would freeze the action that saved)
  document.addEventListener('store-changed', () => {
    try { buildNav(parseHash().path); } catch (err) { console.error('nav rebuild failed', err); }
  });
  document.addEventListener('store-persist-failed', () => {
    if (document.getElementById('persist-warning')) return;
    const bar = el('div', {
      id: 'persist-warning',
      style: 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:var(--trap);color:#fff;' +
        'font-family:var(--mono);font-size:12px;padding:10px 16px;text-align:center',
    }, 'Progress could not be saved — browser storage is full or unavailable. Export a backup now from the home page before closing this tab.');
    document.body.append(bar);
  });
  registerServiceWorker();
  route();
}

/**
 * Stores the app in the browser so the hosted address keeps working with no
 * connection. Only meaningful over http(s); the local file build has nothing
 * to fetch anyway. A new version announces itself rather than reloading
 * underneath him mid-question.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      if (!fresh) return;
      fresh.addEventListener('statechange', () => {
        // controller present means this is an update, not the first install
        if (fresh.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar();
      });
    });
  }).catch(() => { /* offline support is a bonus, never a blocker */ });
}

function showUpdateBar() {
  if (document.getElementById('update-bar')) return;
  document.body.append(el('div', {
    id: 'update-bar',
    style: 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:var(--ink);color:var(--paper);' +
      'font-family:var(--mono);font-size:12px;padding:10px 16px;text-align:center;cursor:pointer',
    onclick: () => location.reload(),
  }, 'A newer version of the app is ready. Click here to load it.'));
}

boot();

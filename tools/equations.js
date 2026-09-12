/**
 * equations.js — one source of truth for what the letters in a formula mean.
 *
 * Every place a formula is shown pulls its symbol key from here: module cheat
 * sheets, the mock formulae panels, the exam reference sheet, flashcards and the
 * Priority Module. Answers deliberately do not get one — by then he has the
 * working in front of him.
 *
 * Anything unmatched is reported rather than silently skipped, so coverage can
 * be proved instead of assumed.
 */
const fs = require('fs');

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Build a glossary instance from a JSON file. Each subject gets its own via
 * subjects.js (physics: tools/physics/equation-glossary.json); a subject with
 * no glossary uses none() below and every formula passes through unannotated.
 */
function load(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const GLOSSARY = new Map(Object.entries(data.glossary).map(([k, v]) => [norm(k), v]));
  const SKIP = new Set(data.skip.map(norm));

  const unmatched = new Set();

/** The symbol key for a formula, or null if it is not a formula / has no entry. */
function keyFor(formula) {
  const k = norm(formula);
  if (!k || SKIP.has(k)) return null;
  const hit = GLOSSARY.get(k);
  if (!hit) { unmatched.add(k); return null; }
  return hit;
}

/** The markup appended inside a .eq block. */
function keyHtml(formula) {
  const key = keyFor(formula);
  return key ? `<span class="sym">${key}</span>` : '';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The mock papers list every provided formula inside one block, separated by
 * runs of spaces and newlines. Split it so each formula gets its own key.
 * Returns null when the block is not one of these.
 */
function splitMultiFormula(text) {
  const parts = text.split(/\s{2,}|\n/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const matched = parts.filter(p => GLOSSARY.has(norm(p)));
  if (matched.length < 2) return null;
  return parts;
}

/**
 * Add a symbol key to every <div class="eq"> in a chunk of HTML.
 * Idempotent: a block that already has one is left alone.
 */
function injectIntoHtml(html) {
  if (!html) return html;
  // the block may already carry attributes (the extractor stamps data-item-id
  // before this runs), so match them and keep them
  return html.replace(/<div class="eq"([^>]*)>([\s\S]*?)<\/div>/g, (whole, attrs, inner) => {
    if (inner.includes('class="sym"')) return whole;
    // the formula is the block's text minus its <span class="name"> label
    const label = (inner.match(/<span class="name">[\s\S]*?<\/span>/) || [''])[0];
    const body = inner.replace(/<span class="name">[\s\S]*?<\/span>/, '').replace(/<[^>]+>/g, '');

    const parts = splitMultiFormula(body);
    if (parts) {
      // one line per formula, each with its own key
      const lines = parts.map(p => {
        const key = keyFor(p);
        return `<div class="eq-line">${esc(p)}${key ? `<span class="sym">${key}</span>` : ''}</div>`;
      }).join('');
      return `<div class="eq"${attrs}>${label}${lines}</div>`;
    }

    const key = keyHtml(body);
    return key ? `<div class="eq"${attrs}>${inner}${key}</div>` : whole;
  });
}

function report(label) {
  if (!unmatched.size) return `${label}: every formula has a symbol key`;
  return `${label}: ${unmatched.size} formula(s) with no glossary entry:\n` +
    [...unmatched].map(u => `    ${u}`).join('\n');
}

  return { keyFor, keyHtml, injectIntoHtml, report, unmatched };
}

/** The no-glossary glossary: annotates nothing, complains about nothing. */
function none() {
  return {
    keyFor: () => null,
    keyHtml: () => '',
    injectIntoHtml: html => html,
    report: label => `${label}: no equation glossary for this subject`,
    unmatched: new Set(),
  };
}

module.exports = { load, none };

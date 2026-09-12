#!/usr/bin/env node
/**
 * parse-spec.js — pull the specification tick-sheet out of the school's exam
 * information pack and emit tools/spec-points.json.
 *
 * The pack lists every spec point examinable in the end-of-year exam across
 * Years 9 and 10. The school's own guidance tells students to traffic-light
 * these; the app instead colours them from the tags John has already applied
 * to module content, so there is nothing extra to tag.
 *
 * Authoring-time only. Run when the info pack changes.
 */
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const ROOT = path.resolve(__dirname, '..');
const PACK = path.join(ROOT, 'John School Materials', 'Physics', 'Y10 EOYE Info 2026.pdf');

// Spec topic number -> module. Electricity splits: circuits vs electrostatics.
const TOPIC_MODULE = {
  '1': '01-forces-and-motion',
  '2': '03-electrical-circuits',      // 2.22P+ overridden below
  '3': '04-waves-and-em-spectrum',
  '4': '08-energy',
  '5': '02-solids-liquids-gases',
  '7': '06-radioactivity',
};
const TOPIC_NAME = {
  '1': 'Forces and motion', '2': 'Electricity', '3': 'Waves',
  '4': 'Energy', '5': 'Solids, liquids and gases', '7': 'Radioactivity and particles',
};

function moduleFor(code) {
  const [topic, rest] = code.split('.');
  if (topic === '2') {
    const n = parseInt(rest, 10);
    if (n >= 22) return '05-static-electricity';   // (d) Electric charge
    return '03-electrical-circuits';
  }
  return TOPIC_MODULE[topic] || null;
}

(async () => {
  const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(PACK)) });
  const { text } = await parser.getText();
  const lines = text.split('\n');

  const points = [];
  let current = null;
  let section = null;
  const pointRe = /^(\d+\.\d+P?)\s+(.*)$/;
  const sectionRe = /^\(([a-z])\)\s+(.+?)(?:\s+REVISED\?.*)?$/;

  const flush = () => {
    if (!current) return;
    // collapse the PDF's hard-wrapped lines and stray equation fragments
    current.text = current.text.replace(/\s+/g, ' ').trim();
    if (current.text) points.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^-- \d+ of \d+ --$/.test(line)) continue;
    const pm = line.match(pointRe);
    if (pm) {
      flush();
      const code = pm[1];
      current = {
        code, topic: code.split('.')[0], topicName: TOPIC_NAME[code.split('.')[0]] || null,
        section, text: pm[2], moduleId: moduleFor(code),
        isPractical: /^practical:/i.test(pm[2]),
      };
      continue;
    }
    const sm = line.match(sectionRe);
    if (sm && !current?.text.endsWith(':')) {
      flush();
      section = sm[2].trim();
      continue;
    }
    if (current) current.text += ' ' + line;
  }
  flush();

  // practicals also belong to the practical-skills module
  for (const p of points) {
    p.moduleIds = p.isPractical && p.moduleId
      ? [p.moduleId, '07-practical-and-data-skills']
      : (p.moduleId ? [p.moduleId] : []);
  }

  const byTopic = {};
  for (const p of points) byTopic[p.topic] = (byTopic[p.topic] || 0) + 1;
  console.log(`parsed ${points.length} spec points:`,
    Object.entries(byTopic).map(([t, n]) => `${TOPIC_NAME[t]}=${n}`).join(', '));
  const unmapped = points.filter(p => !p.moduleIds.length);
  if (unmapped.length) console.log('UNMAPPED:', unmapped.map(p => p.code).join(', '));

  fs.writeFileSync(path.join(__dirname, 'spec-points.json'),
    JSON.stringify({ points }, null, 1));
})();

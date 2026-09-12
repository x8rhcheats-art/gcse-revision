#!/usr/bin/env node
/**
 * static-check.js — catches the class of bug the browser only finds at runtime:
 * importing a name that is not exported, duplicate declarations, and modules
 * that do not parse as ES modules (which `node --check` silently misses).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', 'site', 'app', 'js');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(ROOT);

const problems = [];
const exportsOf = new Map();

// ---- pass 1: parse as a real ES module, and collect exported names ----
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: src, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    problems.push(`${path.relative(ROOT, f)}: does not parse — ${String(e.stderr).split('\n').find(l => l.includes('Error')) || 'see node output'}`);
  }
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+(\w+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  exportsOf.set(path.resolve(f), names);
}

// ---- pass 2: every imported name must actually be exported ----
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) {
      problems.push(`${path.relative(ROOT, f)}: imports missing file ${spec}`);
      continue;
    }
    const available = exportsOf.get(target);
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (available && !available.has(name)) {
        problems.push(`${path.relative(ROOT, f)}: imports "${name}" from ${spec}, which does not export it`);
      }
    }
  }
}

// ---- pass 3: obvious dead imports (imported but never used in the body) ----
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const body = src.replace(/^import[^;]+;$/gm, '');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (!name) continue;
      if (!new RegExp(`\\b${name}\\b`).test(body)) {
        problems.push(`${path.relative(ROOT, f)}: imports "${name}" but never uses it`);
      }
    }
  }
}

console.log(problems.length ? problems.map(p => '  ' + p).join('\n') : '  no static problems found');
console.log(`\nchecked ${files.length} modules`);
process.exit(problems.some(p => !p.includes('never uses it')) ? 1 : 0);

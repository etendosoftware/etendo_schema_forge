#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT_DIR = path.join(ROOT, 'reports', 'react-doctor');
mkdirSync(OUT_DIR, { recursive: true });

const now = new Date();
const iso = now.toISOString();
const stamp = iso.replace(/[:.]/g, '-').slice(0, 19);

console.log('Running react-doctor on all workspaces (this may take ~1 min)...');
let raw;
try {
  raw = execSync('npx --yes react-doctor@latest -y --json --offline', {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch (err) {
  if (err.stdout) raw = err.stdout.toString();
  else throw err;
}

const data = JSON.parse(raw);
const projects = data.projects || [];

const sevCount = (diags) => {
  const out = { error: 0, warning: 0 };
  for (const d of diags) out[d.severity] = (out[d.severity] || 0) + 1;
  return out;
};

const avgScore = projects.length
  ? Math.round(projects.reduce((s, p) => s + (p.score?.score ?? 0), 0) / projects.length)
  : 0;

const totals = sevCount(data.diagnostics || []);

const lines = [];
lines.push('# React Doctor Report');
lines.push('');
lines.push(`- **Date**: ${iso}`);
lines.push(`- **Average score**: ${avgScore}/100`);
lines.push(`- **Workspaces scanned**: ${projects.length}`);
lines.push(`- **Total errors**: ${totals.error}`);
lines.push(`- **Total warnings**: ${totals.warning}`);
lines.push('');
lines.push('## Per workspace');
lines.push('');
lines.push('| Workspace | Score | Label | Files | Errors | Warnings |');
lines.push('|---|---:|---|---:|---:|---:|');
const sorted = [...projects].sort((a, b) => (a.score?.score ?? 0) - (b.score?.score ?? 0));
for (const p of sorted) {
  const sev = sevCount(p.diagnostics || []);
  lines.push(
    `| ${p.project.projectName} | ${p.score?.score ?? '-'} | ${p.score?.label ?? '-'} | ${p.project.sourceFileCount} | ${sev.error} | ${sev.warning} |`
  );
}
lines.push('');

const ruleCounts = {};
const catCounts = {};
for (const d of data.diagnostics || []) {
  const k = `${d.plugin}/${d.rule}`;
  ruleCounts[k] = (ruleCounts[k] || 0) + 1;
  catCounts[d.category || 'Other'] = (catCounts[d.category || 'Other'] || 0) + 1;
}

lines.push('## Issues by category');
lines.push('');
lines.push('| Category | Count |');
lines.push('|---|---:|');
for (const [c, n] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${c} | ${n} |`);
}
lines.push('');

lines.push('## Top 15 rules');
lines.push('');
lines.push('| Rule | Count |');
lines.push('|---|---:|');
for (const [r, c] of Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  lines.push(`| ${r} | ${c} |`);
}
lines.push('');

lines.push('## Errors (must fix)');
lines.push('');
const errors = (data.diagnostics || []).filter((d) => d.severity === 'error');
if (errors.length === 0) {
  lines.push('_None_');
} else {
  lines.push('| File | Rule | Line | Message |');
  lines.push('|---|---|---:|---|');
  for (const d of errors) {
    const msg = (d.message || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${d.filePath} | ${d.plugin}/${d.rule} | ${d.line} | ${msg} |`);
  }
}
lines.push('');

const md = lines.join('\n');
const mdPath = path.join(OUT_DIR, `${stamp}.md`);
const jsonPath = path.join(OUT_DIR, `${stamp}.json`);
writeFileSync(mdPath, md);
writeFileSync(jsonPath, raw);
writeFileSync(path.join(OUT_DIR, 'current.md'), md);
writeFileSync(path.join(OUT_DIR, 'current.json'), raw);

const csvPath = path.join(OUT_DIR, 'history.csv');
if (!existsSync(csvPath)) {
  writeFileSync(csvPath, 'timestamp,workspace,score,files,errors,warnings\n');
}
let csv = '';
for (const p of projects) {
  const sev = sevCount(p.diagnostics || []);
  csv += `${iso},${p.project.projectName},${p.score?.score ?? ''},${p.project.sourceFileCount},${sev.error},${sev.warning}\n`;
}
csv += `${iso},__average__,${avgScore},,${totals.error},${totals.warning}\n`;
appendFileSync(csvPath, csv);

console.log('');
console.log(`Report:  ${path.relative(ROOT, mdPath)}`);
console.log(`Current: reports/react-doctor/current.md  (tracked in git)`);
console.log(`History: reports/react-doctor/history.csv`);
console.log(`Average score: ${avgScore}/100  (errors: ${totals.error}, warnings: ${totals.warning})`);

#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Absolute path to the npx that ships alongside the running node binary, so the
// command is NOT resolved through PATH. On Windows npx is npx.cmd.
const NPX_BIN = path.join(
  path.dirname(process.execPath),
  process.platform === 'win32' ? 'npx.cmd' : 'npx'
);
// Pin the tool version for deterministic, reproducible reports (no `@latest`).
const REACT_DOCTOR_VERSION = '0.5.8';
const ROOT = path.resolve(HERE, '../..');
const OUT_DIR = path.join(ROOT, 'reports', 'react-doctor');

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no I/O, no side effects)
// ---------------------------------------------------------------------------

/** Count diagnostics by severity. */
export function sevCount(diags = []) {
  const out = { error: 0, warning: 0 };
  for (const d of diags) out[d.severity] = (out[d.severity] || 0) + 1;
  return out;
}

/** Rounded average of per-project scores (0 when there are no projects). */
export function computeAvgScore(projects = []) {
  return projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.score?.score ?? 0), 0) / projects.length)
    : 0;
}

/**
 * Build the human-readable markdown report from the FULL react-doctor payload
 * (i.e. before sanitization, so warning-level aggregates stay complete).
 */
export function buildMarkdownReport(data, iso) {
  const projects = data.projects || [];
  const totals = sevCount(data.diagnostics || []);

  const lines = [];
  lines.push('# React Doctor Report');
  lines.push('');
  lines.push(`- **Date**: ${iso}`);
  lines.push(`- **Average score**: ${computeAvgScore(projects)}/100`);
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

  return lines.join('\n');
}

/** Build the history.csv rows (one per project + an `__average__` row). */
export function buildCsvRows(projects, iso) {
  projects = projects || [];
  const totals = sevCount(projects.flatMap((p) => p.diagnostics || []));
  const avgScore = computeAvgScore(projects);
  let csv = '';
  for (const p of projects) {
    const sev = sevCount(p.diagnostics || []);
    csv += `${iso},${p.project.projectName},${p.score?.score ?? ''},${p.project.sourceFileCount},${sev.error},${sev.warning}\n`;
  }
  csv += `${iso},__average__,${avgScore},,${totals.error},${totals.warning}\n`;
  return csv;
}

/** Relativize an absolute path to `root`; already-relative values pass through. */
export function relativizePath(p, root) {
  if (typeof p !== 'string' || !p || !path.isAbsolute(p)) return p;
  const rel = path.relative(root, p);
  return rel === '' ? '.' : rel;
}

/** Strip the verbose, static `help` field from a diagnostic. */
function stripHelp({ help, ...rest }) {
  return rest;
}

/**
 * Produce a slim, portable, diff-able snapshot for tracking in git:
 *  - relativizes machine-specific absolute paths to the repo root
 *  - drops the top-level `diagnostics` array (a full duplicate of the
 *    per-project diagnostics)
 *  - keeps only ERROR-severity per-project diagnostics (warnings live on in the
 *    aggregate counts) and strips their static `help` text
 * Aggregate warning/error counts survive via `summary` and per-project
 * `severityCounts`, so nothing is silently lost. Does not mutate `data`.
 */
export function sanitizeReport(data, root) {
  const projects = (data.projects || []).map((p) => {
    const diagnostics = (p.diagnostics || []);
    return {
      ...p,
      directory: relativizePath(p.directory, root),
      project: { ...p.project, rootDirectory: relativizePath(p.project?.rootDirectory, root) },
      severityCounts: sevCount(diagnostics),
      diagnostics: diagnostics.filter((d) => d.severity === 'error').map(stripHelp),
    };
  });

  const { diagnostics, ...top } = data;
  return {
    ...top,
    directory: relativizePath(data.directory, root),
    projects,
  };
}

// ---------------------------------------------------------------------------
// Entry point (side effects live here — runs only when invoked directly)
// ---------------------------------------------------------------------------

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const iso = new Date().toISOString();
  const stamp = iso.replace(/[:.]/g, '-').slice(0, 19);

  console.log('Running react-doctor on all workspaces (this may take ~1 min)...');
  let raw;
  try {
    // Invoke npx by absolute path (no shell, no PATH lookup) with a fixed
    // argument list — arguments are constants, not user input.
    raw = execFileSync(NPX_BIN, ['--yes', `react-doctor@${REACT_DOCTOR_VERSION}`, '-y', '--json', '--offline'], {
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
  const totals = sevCount(data.diagnostics || []);
  const avgScore = computeAvgScore(projects);

  const md = buildMarkdownReport(data, iso);
  // Minified, sanitized JSON — portable across machines and small enough to track.
  const json = JSON.stringify(sanitizeReport(data, ROOT));

  const mdPath = path.join(OUT_DIR, `${stamp}.md`);
  const jsonPath = path.join(OUT_DIR, `${stamp}.json`);
  writeFileSync(mdPath, md);
  writeFileSync(jsonPath, json);
  writeFileSync(path.join(OUT_DIR, 'current.md'), md);
  writeFileSync(path.join(OUT_DIR, 'current.json'), json);

  const csvPath = path.join(OUT_DIR, 'history.csv');
  if (!existsSync(csvPath)) {
    writeFileSync(csvPath, 'timestamp,workspace,score,files,errors,warnings\n');
  }
  appendFileSync(csvPath, buildCsvRows(projects, iso));

  console.log('');
  console.log(`Report:  ${path.relative(ROOT, mdPath)}`);
  console.log(`Current: reports/react-doctor/current.md  (tracked in git)`);
  console.log(`History: reports/react-doctor/history.csv`);
  console.log(`Average score: ${avgScore}/100  (errors: ${totals.error}, warnings: ${totals.warning})`);
}

// Run only when executed as the CLI entry point, not when imported by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

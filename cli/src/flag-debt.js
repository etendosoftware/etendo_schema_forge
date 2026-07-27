#!/usr/bin/env node
/**
 * flag-debt.js — per-flag technical-debt scorer ("flag debt scorecard v0").
 *
 * Reads flag METADATA from flags-registry.json and DERIVES a debt score for
 * each flag from the working tree. Nothing is written back to the registry:
 * the score is always recomputed, never stored.
 *
 * Four dimensions, summed into one score (higher = more debt):
 *
 *   1. touch points — references to the flag outside its own files. Cheap to
 *      remove while there are a few, an archaeology exercise once they spread.
 *   2. tests        — declared specs that do not exist on disk.
 *   3. coverage     — uncovered lines in the flag's owned files, read from an
 *      existing SonarQube analysis. Skipped (0 pts) when unavailable.
 *   4. lifecycle    — how far past its TTL the flag is.
 *
 * v0 is report-only: the process always exits 0. Thresholds and CI gating are
 * deliberately out of scope. See docs/flag-debt.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(HERE, '..', '..');
export const REGISTRY_FILENAME = 'flags-registry.json';

/** Every points rule in one place, so the scale is tunable and greppable. */
export const POINTS = {
  /** Touch-point files that are free: a route, a menu entry, a servlet hook. */
  freeTouchPoints: 3,
  /** Cost of every touch-point file beyond the free ones. */
  perExtraTouchPoint: 2,
  /** Flat cost when the unit spec list has any missing entry. */
  missingUnitSpecs: 5,
  /** Flat cost when the e2e spec list has any missing entry. */
  missingE2eSpecs: 8,
  /** Uncovered lines that cost one point. */
  uncoveredLinesPerPoint: 10,
  /** Cost per started week past the TTL. */
  perWeekOverdue: 3,
};

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.java',
  '.json', '.md', '.yml', '.yaml', '.properties', '.xml', '.sh', '.sql',
]);

/** Owned files worth asking SonarQube about. */
const COVERAGE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.java']);

/**
 * Directories skipped entirely while walking. `generated` and `locales` cover
 * artifacts/<w>/generated and the locale bundles; the rest are build output,
 * dependencies or test reports.
 */
const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', '.gradle', '.worktrees', '.scannerwork', '.idea',
  'dist', 'build', 'coverage', 'generated', 'locales',
  'test-results', 'playwright-report', 'e2e-report',
]);

/** Files that describe the scorecard rather than participate in it. */
const SKIP_FILE_NAMES = new Set([
  REGISTRY_FILENAME, 'package-lock.json', 'flag-debt.js', 'flag-debt.json',
  'flag-debt.html', 'flag-debt.md',
]);

const MAX_SCANNED_BYTES = 512 * 1024;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Registry ────────────────────────────────────────────────────────────────

export function loadRegistry(registryPath) {
  const raw = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(raw);
  if (!Array.isArray(registry.flags)) {
    throw new Error(`${registryPath}: expected a "flags" array`);
  }
  return registry;
}

/**
 * Resolves the on-disk root for each declared repo root.
 *
 * The backend module is a separate, git-ignored checkout, so it is absent from
 * a worktree. Candidates, in order: an explicit ETENDO_GO_MODULE, the path
 * under the repo root, then the same path under the main checkout (a worktree
 * lives at <main>/.worktrees/<name>). Missing backend is reported, never fatal.
 */
export function resolveRoots(registry, { repoRoot = DEFAULT_REPO_ROOT, env = process.env } = {}) {
  const declared = registry.roots || {};
  const frontend = path.resolve(repoRoot, declared.frontend || '.');

  const backendRelative = declared.backend;
  const candidates = [];
  if (env.ETENDO_GO_MODULE) candidates.push(path.resolve(env.ETENDO_GO_MODULE));
  if (backendRelative) {
    candidates.push(path.resolve(repoRoot, backendRelative));
    candidates.push(path.resolve(repoRoot, '..', '..', backendRelative));
  }
  const backend = candidates.find((dir) => isDirectory(dir)) || null;

  return {
    frontend,
    backend,
    backendUnavailableReason: backend
      ? null
      : `backend module not found (looked in: ${candidates.join(', ') || 'nothing declared'}). `
        + 'Set ETENDO_GO_MODULE to scan it.',
  };
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

// ── Scanning ────────────────────────────────────────────────────────────────

/** Yields every scannable file under `root`, as a path relative to `root`. */
export function* walkFiles(root, { skipDirNames = SKIP_DIR_NAMES, extensions = SOURCE_EXTENSIONS } = {}) {
  const stack = [''];
  while (stack.length > 0) {
    const relativeDir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, relativeDir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const relative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (!skipDirNames.has(entry.name)) stack.push(relative);
      } else if (entry.isFile()) {
        if (SKIP_FILE_NAMES.has(entry.name)) continue;
        if (extensions.has(path.extname(entry.name))) yield relative;
      }
    }
  }
}

/** Line numbers and text of every line in `file` containing any symbol. */
export function findSymbolHits(absolutePath, symbols) {
  let stat;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return [];
  }
  if (stat.size > MAX_SCANNED_BYTES) return [];

  let content;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return [];
  }
  if (!symbols.some((symbol) => content.includes(symbol))) return [];

  const hits = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (symbols.some((symbol) => lines[i].includes(symbol))) {
      hits.push({ line: i + 1, text: lines[i].trim().slice(0, 160) });
    }
  }
  return hits;
}

// ── Classification ──────────────────────────────────────────────────────────

const toPosix = (relative) => relative.split(path.sep).join('/');

/** True when `relative` is, or lives under, `declared`. */
export function matchesPath(relative, declared) {
  const target = toPosix(relative);
  const prefix = toPosix(declared);
  if (prefix.endsWith('/')) return target.startsWith(prefix);
  return target === prefix || target.startsWith(`${prefix}/`);
}

export function isFrameworkPath(relative, frameworkPaths) {
  const target = toPosix(relative);
  return frameworkPaths.some((fragment) => target.includes(toPosix(fragment)));
}

export function isDocPath(relative) {
  return path.extname(relative) === '.md';
}

export function isTestPath(relative) {
  const target = toPosix(relative);
  return target.includes('/__tests__/')
    || target.startsWith('__tests__/')
    || target.includes('/src-test/')
    || target.startsWith('src-test/')
    || /\.(test|spec|vitest)\.[a-z]+$/.test(target)
    || /Test\.java$/.test(target);
}

/**
 * Buckets one referencing file.
 *
 * `code` is the only bucket that scores. `docs` and `tests` are reported for
 * completeness: they are real references a removal must clean up, but charging
 * for them would double-count the tests dimension and penalise documenting.
 */
export function classifyReference(relative, { ownedPaths, frameworkPaths, specPaths }) {
  if (ownedPaths.some((owned) => matchesPath(relative, owned))) return 'owned';
  if (isFrameworkPath(relative, frameworkPaths)) return 'framework';
  if (specPaths.some((spec) => matchesPath(relative, spec))) return 'tests';
  if (isDocPath(relative)) return 'docs';
  if (isTestPath(relative)) return 'tests';
  return 'code';
}

// ── Dimension 1: touch points ───────────────────────────────────────────────

export function collectTouchPoints(flag, { roots, frameworkPaths }) {
  const buckets = { code: [], docs: [], tests: [] };
  const scannedRoots = [];
  const skippedRoots = [];

  for (const [rootName, rootDir] of Object.entries(roots)) {
    if (!rootDir) {
      skippedRoots.push(rootName);
      continue;
    }
    scannedRoots.push(rootName);
    const ownedPaths = (flag.paths && flag.paths[rootName]) || [];
    const specPaths = allSpecs(flag)
      .filter((spec) => spec.root === rootName)
      .map((spec) => spec.path);

    for (const relative of walkFiles(rootDir)) {
      const hits = findSymbolHits(path.join(rootDir, relative), flag.symbols || [flag.key]);
      if (hits.length === 0) continue;
      const bucket = classifyReference(relative, { ownedPaths, frameworkPaths, specPaths });
      if (bucket === 'owned' || bucket === 'framework') continue;
      buckets[bucket].push({ root: rootName, path: toPosix(relative), hits });
    }
  }

  for (const list of Object.values(buckets)) {
    list.sort((a, b) => `${a.root}/${a.path}`.localeCompare(`${b.root}/${b.path}`));
  }

  const extra = Math.max(0, buckets.code.length - POINTS.freeTouchPoints);
  return {
    files: buckets.code,
    docReferences: buckets.docs,
    testReferences: buckets.tests,
    freeAllowance: POINTS.freeTouchPoints,
    extraFiles: extra,
    scannedRoots,
    skippedRoots,
    points: extra * POINTS.perExtraTouchPoint,
  };
}

// ── Dimension 2: tests ──────────────────────────────────────────────────────

/** Normalises both spec shapes (a bare string or an object) into objects. */
export function normalizeSpec(spec) {
  if (typeof spec === 'string') return { path: spec, root: 'frontend', expected: false };
  return { path: spec.path, root: spec.root || 'frontend', expected: Boolean(spec.expected) };
}

function allSpecs(flag) {
  const specs = flag.testSpecs || {};
  return [...(specs.unit || []), ...(specs.e2e || [])].map(normalizeSpec);
}

export function checkTestSpecs(flag, { roots }) {
  const kinds = { unit: POINTS.missingUnitSpecs, e2e: POINTS.missingE2eSpecs };
  const result = { kinds: {}, points: 0 };

  for (const [kind, penalty] of Object.entries(kinds)) {
    const specs = ((flag.testSpecs || {})[kind] || []).map(normalizeSpec);
    const checked = specs.map((spec) => {
      const rootDir = roots[spec.root];
      const exists = rootDir ? isFile(path.join(rootDir, spec.path)) : false;
      return {
        ...spec,
        exists,
        unverifiable: !rootDir,
        note: exists ? null : (spec.expected ? 'pending Tester' : 'missing'),
      };
    });
    const missing = checked.filter((spec) => !spec.exists);
    const points = missing.length > 0 ? penalty : 0;
    result.kinds[kind] = { specs: checked, missing, declared: checked.length, points };
    result.points += points;
  }
  return result;
}

// ── Dimension 3: coverage ───────────────────────────────────────────────────

const SONAR_PROJECT_BY_ROOT = { frontend: 'schema-forge', backend: 'etendo-go' };

/** The script ships with the published CLI; a local core checkout wins. */
export function resolveCoverageScript(repoRoot) {
  const candidates = [
    path.join(repoRoot, 'cli', 'sonar-coverage.sh'),
    path.join(repoRoot, 'node_modules', '@etendosoftware', 'schema-forge-cli', 'sonar-coverage.sh'),
  ];
  return candidates.find((candidate) => isFile(candidate)) || null;
}

/** Owned source files, expanded from the declared paths (dirs included). */
export function expandOwnedFiles(flag, roots) {
  const files = [];
  for (const [rootName, rootDir] of Object.entries(roots)) {
    if (!rootDir) continue;
    for (const declared of (flag.paths && flag.paths[rootName]) || []) {
      const absolute = path.join(rootDir, declared);
      if (isFile(absolute)) {
        if (COVERAGE_EXTENSIONS.has(path.extname(absolute))) {
          files.push({ root: rootName, path: toPosix(declared) });
        }
      } else if (isDirectory(absolute)) {
        for (const relative of walkFiles(absolute, { extensions: COVERAGE_EXTENSIONS })) {
          files.push({ root: rootName, path: toPosix(path.join(declared, relative)) });
        }
      }
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Pulls the uncovered-line count out of sonar-coverage.sh's report. */
export function parseUncoveredLines(output) {
  const summary = output.match(/uncovered lines:\s*(\d+)/i);
  if (summary) return Number(summary[1]);
  if (/no coverage data on server/i.test(output)) return null;

  const ranges = output.match(/^\s*Uncovered:\s*(.+)$/mi);
  if (!ranges) return null;
  if (/^\s*none\s*$/i.test(ranges[1])) return 0;
  return ranges[1].split(',').reduce((total, chunk) => {
    const span = chunk.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!span) return total;
    const from = Number(span[1]);
    const to = span[2] ? Number(span[2]) : from;
    return total + (to - from + 1);
  }, 0);
}

export function collectCoverage(flag, { roots, repoRoot, env = process.env, runner = runCoverageScript }) {
  const ownedFiles = expandOwnedFiles(flag, roots);

  if (!env.SONAR_TOKEN) {
    return { status: 'unavailable', reason: 'SONAR_TOKEN not set', files: [], points: 0 };
  }
  const script = resolveCoverageScript(repoRoot);
  if (!script) {
    return { status: 'unavailable', reason: 'sonar-coverage.sh not found', files: [], points: 0 };
  }

  const files = [];
  let points = 0;
  for (const owned of ownedFiles) {
    const outcome = runner({ script, cwd: roots[owned.root], file: owned.path, project: SONAR_PROJECT_BY_ROOT[owned.root], env });
    if (outcome.uncovered === null) {
      files.push({ ...owned, uncovered: null, points: 0, note: outcome.reason || 'no analysis' });
      continue;
    }
    const filePoints = Math.floor(outcome.uncovered / POINTS.uncoveredLinesPerPoint);
    points += filePoints;
    files.push({ ...owned, uncovered: outcome.uncovered, points: filePoints, note: null });
  }

  const measured = files.filter((file) => file.uncovered !== null);
  return {
    status: measured.length > 0 ? 'measured' : 'unavailable',
    reason: measured.length > 0 ? null : 'no analysis on server for the owned files',
    files,
    points,
  };
}

function runCoverageScript({ script, cwd, file, project, env }) {
  try {
    const result = spawnSync(script, ['--project', project, file], {
      cwd, env, encoding: 'utf8', timeout: 60_000,
    });
    if (result.error || result.status === null || result.status > 1) {
      return { uncovered: null, reason: 'coverage lookup failed' };
    }
    return { uncovered: parseUncoveredLines(`${result.stdout || ''}\n${result.stderr || ''}`) };
  } catch {
    return { uncovered: null, reason: 'coverage lookup failed' };
  }
}

// ── Dimension 4: lifecycle ──────────────────────────────────────────────────

export function scoreLifecycle(flag, now = new Date()) {
  if (!flag.ttl) {
    return { ttl: null, daysRemaining: null, weeksOverdue: 0, points: 0, note: 'no TTL declared' };
  }
  const ttl = new Date(`${flag.ttl}T00:00:00Z`);
  if (Number.isNaN(ttl.getTime())) {
    return { ttl: flag.ttl, daysRemaining: null, weeksOverdue: 0, points: 0, note: 'unparseable TTL' };
  }
  const daysRemaining = Math.ceil((ttl.getTime() - now.getTime()) / MS_PER_DAY);
  if (daysRemaining >= 0) {
    return { ttl: flag.ttl, daysRemaining, weeksOverdue: 0, points: 0, note: null };
  }
  const weeksOverdue = Math.ceil(-daysRemaining / 7);
  return {
    ttl: flag.ttl,
    daysRemaining,
    weeksOverdue,
    points: weeksOverdue * POINTS.perWeekOverdue,
    note: 'past TTL',
  };
}

// ── Report ──────────────────────────────────────────────────────────────────

export function scoreFlag(flag, context) {
  const touchPoints = collectTouchPoints(flag, context);
  const tests = checkTestSpecs(flag, context);
  const coverage = collectCoverage(flag, context);
  const lifecycle = scoreLifecycle(flag, context.now);
  return {
    key: flag.key,
    description: flag.description || '',
    owner: flag.owner || 'unassigned',
    jira: flag.jira || null,
    created: flag.created || null,
    defaultValue: flag.defaultValue,
    ttlNote: flag.ttlNote || null,
    touchPoints,
    tests,
    coverage,
    lifecycle,
    total: touchPoints.points + tests.points + coverage.points + lifecycle.points,
  };
}

export function buildReport(registry, context) {
  return {
    generatedAt: (context.now || new Date()).toISOString(),
    version: registry.version ?? null,
    roots: {
      frontend: context.roots.frontend,
      backend: context.roots.backend,
      backendUnavailableReason: context.backendUnavailableReason || null,
    },
    flags: registry.flags.map((flag) => scoreFlag(flag, context)),
  };
}

// ── Console rendering ───────────────────────────────────────────────────────

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);

function renderTouchPointLines(touchPoints) {
  const lines = [];
  for (const file of touchPoints.files) {
    const where = file.hits.map((hit) => hit.line).join(',');
    lines.push(`      ${file.root}: ${file.path}:${where}`);
  }
  if (touchPoints.docReferences.length > 0) {
    lines.push(`      documentation references (not scored): ${touchPoints.docReferences.length} file(s)`);
  }
  if (touchPoints.testReferences.length > 0) {
    lines.push(`      test references (not scored): ${touchPoints.testReferences.length} file(s)`);
  }
  return lines;
}

function renderSpecLines(tests) {
  const lines = [];
  for (const [kind, result] of Object.entries(tests.kinds)) {
    const present = result.declared - result.missing.length;
    lines.push(`      ${kind}: ${present}/${result.declared} present`);
    for (const spec of result.missing) {
      lines.push(`        missing — ${spec.root}: ${spec.path} (${spec.note})`);
    }
  }
  return lines;
}

export function renderConsole(report) {
  const lines = [];
  lines.push('');
  lines.push(`Flag debt scorecard v0 — ${report.flags.length} flag(s) — ${report.generatedAt}`);
  if (report.roots.backendUnavailableReason) {
    lines.push(`  warning: ${report.roots.backendUnavailableReason}`);
  }
  lines.push('');

  for (const flag of report.flags) {
    const meta = [flag.jira, `owner ${flag.owner}`, `default ${flag.defaultValue}`]
      .filter(Boolean).join(' · ');
    lines.push(`${flag.key}  (${meta})`);
    lines.push(`  ${flag.description}`);
    lines.push('');

    const tp = flag.touchPoints;
    lines.push(`  ${pad('touch points', 14)} ${padStart(`${tp.points} pts`, 8)}  `
      + `${tp.files.length} file(s), ${tp.extraFiles} beyond the ${tp.freeAllowance} expected`);
    lines.push(...renderTouchPointLines(tp));

    lines.push(`  ${pad('tests', 14)} ${padStart(`${flag.tests.points} pts`, 8)}`);
    lines.push(...renderSpecLines(flag.tests));

    const cov = flag.coverage;
    const covSummary = cov.status === 'measured'
      ? `${cov.files.length} owned file(s) analysed`
      : `unavailable (${cov.reason})`;
    lines.push(`  ${pad('coverage', 14)} ${padStart(`${cov.points} pts`, 8)}  ${covSummary}`);
    for (const file of cov.files.filter((entry) => entry.uncovered !== null)) {
      lines.push(`        ${file.path} — ${file.uncovered} uncovered (${file.points} pts)`);
    }

    const life = flag.lifecycle;
    const lifeSummary = life.ttl === null
      ? 'no TTL declared'
      : (life.daysRemaining >= 0
        ? `ttl ${life.ttl} · ${life.daysRemaining} day(s) remaining`
        : `ttl ${life.ttl} · ${-life.daysRemaining} day(s) overdue (${life.weeksOverdue} week(s))`);
    lines.push(`  ${pad('lifecycle', 14)} ${padStart(`${life.points} pts`, 8)}  ${lifeSummary}`);
    if (flag.ttlNote) lines.push(`        note: ${flag.ttlNote}`);
    lines.push('');
    lines.push(`  ${pad('TOTAL', 14)} ${padStart(`${flag.total} pts`, 8)}`);
    lines.push('');
  }

  const width = Math.max(4, ...report.flags.map((flag) => flag.key.length));
  lines.push(`  ${pad('FLAG', width)}  ${padStart('TOUCH', 6)}  ${padStart('TESTS', 6)}  `
    + `${padStart('COV', 5)}  ${padStart('LIFE', 5)}  ${padStart('TOTAL', 6)}`);
  for (const flag of report.flags) {
    lines.push(`  ${pad(flag.key, width)}  ${padStart(flag.touchPoints.points, 6)}  `
      + `${padStart(flag.tests.points, 6)}  ${padStart(flag.coverage.points, 5)}  `
      + `${padStart(flag.lifecycle.points, 5)}  ${padStart(flag.total, 6)}`);
  }
  lines.push('');
  lines.push('  Report only — v0 never fails a build. Scale: docs/flag-debt.md');
  lines.push('');
  return lines.join('\n');
}

// ── HTML rendering ──────────────────────────────────────────────────────────

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function htmlRow(label, points, detail) {
  return `<tr><th>${escapeHtml(label)}</th><td class="pts">${escapeHtml(points)}</td>`
    + `<td>${detail}</td></tr>`;
}

function htmlFlagCard(flag) {
  const tp = flag.touchPoints;
  const touchDetail = [
    `${tp.files.length} file(s), ${tp.extraFiles} beyond the ${tp.freeAllowance} expected`,
    tp.files.length > 0
      ? `<ul>${tp.files.map((file) => `<li><code>${escapeHtml(file.root)}: ${escapeHtml(file.path)}</code>`
        + ` <span class="muted">lines ${escapeHtml(file.hits.map((hit) => hit.line).join(', '))}</span></li>`).join('')}</ul>`
      : '',
    tp.docReferences.length > 0
      ? `<p class="muted">${tp.docReferences.length} documentation reference(s), not scored</p>` : '',
    tp.testReferences.length > 0
      ? `<p class="muted">${tp.testReferences.length} test reference(s), not scored</p>` : '',
  ].join('');

  const testDetail = Object.entries(flag.tests.kinds).map(([kind, result]) => {
    const present = result.declared - result.missing.length;
    const missing = result.missing.length > 0
      ? `<ul>${result.missing.map((spec) => `<li><code>${escapeHtml(spec.root)}: ${escapeHtml(spec.path)}</code>`
        + ` <span class="muted">${escapeHtml(spec.note)}</span></li>`).join('')}</ul>`
      : '';
    return `<p><strong>${escapeHtml(kind)}</strong>: ${present}/${result.declared} present</p>${missing}`;
  }).join('');

  const cov = flag.coverage;
  const covDetail = cov.status === 'measured'
    ? `<ul>${cov.files.map((file) => `<li><code>${escapeHtml(file.path)}</code> — `
      + `${file.uncovered === null ? escapeHtml(file.note) : `${file.uncovered} uncovered`}</li>`).join('')}</ul>`
    : `<span class="muted">unavailable (${escapeHtml(cov.reason)})</span>`;

  const life = flag.lifecycle;
  const lifeDetail = life.ttl === null
    ? '<span class="muted">no TTL declared</span>'
    : (life.daysRemaining >= 0
      ? `TTL ${escapeHtml(life.ttl)} — ${life.daysRemaining} day(s) remaining`
      : `TTL ${escapeHtml(life.ttl)} — ${-life.daysRemaining} day(s) overdue`)
      + (flag.ttlNote ? `<p class="muted">${escapeHtml(flag.ttlNote)}</p>` : '');

  return `<section class="card">
  <header>
    <h2><code>${escapeHtml(flag.key)}</code></h2>
    <span class="total">${flag.total} pts</span>
  </header>
  <p class="desc">${escapeHtml(flag.description)}</p>
  <p class="muted">${escapeHtml(flag.jira || 'no Jira')} · owner ${escapeHtml(flag.owner)} · default ${escapeHtml(flag.defaultValue)} · created ${escapeHtml(flag.created || 'unknown')}</p>
  <table>
    <thead><tr><th>Dimension</th><th class="pts">Points</th><th>Detail</th></tr></thead>
    <tbody>
      ${htmlRow('Touch points', tp.points, touchDetail)}
      ${htmlRow('Tests', flag.tests.points, testDetail)}
      ${htmlRow('Coverage', cov.points, covDetail)}
      ${htmlRow('Lifecycle', life.points, lifeDetail)}
    </tbody>
  </table>
</section>`;
}

export function renderHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flag debt scorecard</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfbfd; --fg: #16181d; --muted: #666c78; --line: #d9dde5; --card: #fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14161a; --fg: #e7e9ee; --muted: #9aa2b1; --line: #2c313a; --card: #1b1e24; }
  }
  body { margin: 0; padding: 2rem 1rem; background: var(--bg); color: var(--fg);
         font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 60rem; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .muted { color: var(--muted); font-size: .9em; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
          padding: 1rem 1.25rem; margin: 1.25rem 0; }
  .card header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .card h2 { font-size: 1.1rem; margin: 0; }
  .total { font-weight: 700; font-size: 1.1rem; }
  .desc { margin: .5rem 0; }
  table { width: 100%; border-collapse: collapse; margin-top: .75rem; }
  th, td { text-align: left; vertical-align: top; padding: .5rem .6rem; border-top: 1px solid var(--line); }
  thead th { border-top: 0; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .pts { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  ul { margin: .35rem 0; padding-left: 1.1rem; }
  li { margin: .15rem 0; }
  p { margin: .35rem 0; }
  footer { color: var(--muted); font-size: .85em; margin-top: 2rem; }
</style>
</head>
<body>
<main>
  <h1>Flag debt scorecard <span class="muted">v0</span></h1>
  <p class="muted">Generated ${escapeHtml(report.generatedAt)} · ${report.flags.length} flag(s)${
    report.roots.backendUnavailableReason ? ` · ${escapeHtml(report.roots.backendUnavailableReason)}` : ''
  }</p>
  ${report.flags.map(htmlFlagCard).join('\n')}
  <footer>Higher is worse. Report only — v0 never fails a build. Scale and rules: docs/flag-debt.md</footer>
</main>
</body>
</html>
`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const options = { json: false, html: false, flag: null, repoRoot: DEFAULT_REPO_ROOT, registry: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--html') options.html = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--flag') options.flag = argv[++i];
    else if (arg.startsWith('--flag=')) options.flag = arg.slice('--flag='.length);
    else if (arg === '--root') options.repoRoot = path.resolve(argv[++i]);
    else if (arg.startsWith('--root=')) options.repoRoot = path.resolve(arg.slice('--root='.length));
    else if (arg === '--registry') options.registry = path.resolve(argv[++i]);
    else if (arg.startsWith('--registry=')) options.registry = path.resolve(arg.slice('--registry='.length));
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

const HELP = `flag-debt — per-flag technical-debt scorer (v0, report only)

Usage: node cli/src/flag-debt.js [options]

  --flag <key>       Score a single flag instead of every registered one
  --json             Also write flag-debt.json (git-ignored)
  --html             Also write flag-debt.html (git-ignored)
  --registry <path>  Registry file (default: <repo>/flags-registry.json)
  --root <path>      Repo root (default: inferred from this script)
  -h, --help         Show this help

Env: SONAR_TOKEN / SONAR_HOST_URL enable the coverage dimension.
     ETENDO_GO_MODULE points at the com.etendoerp.go checkout.
Docs: docs/flag-debt.md
`;

export function main(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    stdout.write(HELP);
    return 0;
  }

  const registryPath = options.registry || path.join(options.repoRoot, REGISTRY_FILENAME);
  const registry = loadRegistry(registryPath);
  if (options.flag) {
    registry.flags = registry.flags.filter((flag) => flag.key === options.flag);
    if (registry.flags.length === 0) {
      stdout.write(`No flag "${options.flag}" in ${registryPath}\n`);
      return 0;
    }
  }

  const { frontend, backend, backendUnavailableReason } = resolveRoots(registry, { repoRoot: options.repoRoot });
  const report = buildReport(registry, {
    roots: { frontend, backend },
    backendUnavailableReason,
    frameworkPaths: (registry.conventions && registry.conventions.frameworkPaths) || [],
    repoRoot: options.repoRoot,
    now: new Date(),
  });

  stdout.write(renderConsole(report));

  if (options.json) {
    const target = path.join(options.repoRoot, 'flag-debt.json');
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    stdout.write(`  JSON written to ${target}\n`);
  }
  if (options.html) {
    const target = path.join(options.repoRoot, 'flag-debt.html');
    fs.writeFileSync(target, renderHtml(report));
    stdout.write(`  HTML written to ${target}\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    // A broken invocation or an unreadable registry is a usage error, and is the
    // only way this command fails: debt itself never sets a non-zero exit in v0.
    process.stderr.write(`flag-debt: ${error.message}\n`);
    process.exitCode = 2;
  }
}

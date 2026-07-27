#!/usr/bin/env node
/**
 * flag-debt.js — per-flag technical-debt scorer ("flag debt scorecard v0").
 *
 * Reads flag METADATA from flags-registry.json and DERIVES a debt score for
 * each flag from the working tree. Nothing is written back to the registry:
 * the score is always recomputed, never stored.
 *
 * Five dimensions, summed into one score (higher = more debt):
 *
 *   1. touch points — references to the flag outside its own files. Cheap to
 *      remove while there are a few, an archaeology exercise once they spread.
 *   2. tests        — declared specs that do not exist on disk.
 *   3. coverage     — uncovered lines in the flag's owned files, read from an
 *      existing SonarQube analysis. Skipped (0 pts) when unavailable.
 *   4. lifecycle    — how far past its TTL the flag is.
 *   5. open items   — decisions the flag is still holding, scored per item.
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
  /**
   * Flat cost when a spec list has any PENDING entry (missing, but someone is
   * expected to write it). Flat, because the signal is "this suite has a hole".
   * Accepted-debt specs are charged the same amount but PER ITEM — a standing
   * decision not to test something is owned individually and does not go away
   * when the rest of the suite lands.
   */
  missingUnitSpecs: 5,
  missingE2eSpecs: 8,
  /** Uncovered lines that cost one point. */
  uncoveredLinesPerPoint: 10,
  /** Cost per started week past the TTL. */
  perWeekOverdue: 3,
  /**
   * Cost of a deferred open item, by kind. A deferred decision is a standing
   * decision, exactly like an accepted-debt spec, so it is charged per item.
   *
   * `precondition` is anchored at the missing-unit-spec penalty: one decision
   * that blocks the next step costs the same as one untested unit. `cosmetic`
   * is deliberately non-zero — a free bucket is a bucket everything gets
   * labelled into — but small enough not to distort the total.
   */
  deferredItemKind: { precondition: 5, open: 3, cosmetic: 1 },
  /**
   * Added per component beyond the first on a bundled item. Bundling keeps the
   * card readable; this keeps the score honest about breadth, so a bundle of
   * eight does not cost the same as a bundle of one.
   */
  perExtraDeferredComponent: 1,
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
  // Tool output that mentions source it analysed. A flag key echoed inside a
  // Sonar report is not a touch point, and counting it charges real debt
  // points for having run a scan.
  'sonar-reports', '.quality-gate-cache', 'logs', 'tmp',
  // A separate, git-ignored checkout (.gitignore line 1) that happens to sit
  // inside this repo. It is not frontend source, and walking it charges the
  // backend module's own owned files as unowned frontend touch points.
  'etendo_core', 'etendo_core_ar',
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

/**
 * Yields every scannable file under `root`, as a path relative to `root`.
 *
 * `skipPaths` blocks specific absolute directories. Roots can nest — the
 * backend module lives inside the repo — and without this a file under the
 * inner root is visited twice: once correctly, and once under the outer root
 * where its owned-path declarations do not apply, turning owned code into a
 * phantom touch point.
 */
export function* walkFiles(root, {
  skipDirNames = SKIP_DIR_NAMES, extensions = SOURCE_EXTENSIONS, skipPaths = [],
} = {}) {
  const blocked = new Set(skipPaths.map((target) => path.resolve(target)));
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
        if (skipDirNames.has(entry.name)) continue;
        if (blocked.has(path.resolve(root, relative))) continue;
        stack.push(relative);
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

    const nestedRoots = Object.entries(roots)
      .filter(([name, dir]) => name !== rootName && dir)
      .map(([, dir]) => dir);

    for (const relative of walkFiles(rootDir, { skipPaths: nestedRoots })) {
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
  if (typeof spec === 'string') {
    return { path: spec, root: 'frontend', expected: false, acceptedDebt: false, note: null };
  }
  return {
    path: spec.path,
    root: spec.root || 'frontend',
    expected: Boolean(spec.expected),
    acceptedDebt: Boolean(spec.acceptedDebt),
    note: spec.note || null,
  };
}

/**
 * A spec is one of four things, and the difference is the whole point:
 *
 *   present      — on disk
 *   pending      — missing, someone is expected to write it (transient)
 *   accepted-debt— missing, the team decided not to write it (standing)
 *   missing      — missing with no declared intent either way
 *
 * `acceptedDebt` wins over `expected`: overloading "expected" to mean both
 * "queued" and "deliberately deferred" is how a registry stops being trusted.
 */
export function specStatus(spec, exists) {
  if (exists) return 'present';
  if (spec.acceptedDebt) return 'accepted-debt';
  if (spec.expected) return 'pending';
  return 'missing';
}

const DEFAULT_SPEC_NOTE = {
  'accepted-debt': 'accepted debt — deliberately not written',
  pending: 'pending Tester',
  missing: 'missing',
};

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
      const status = specStatus(spec, exists);
      return {
        ...spec,
        exists,
        status,
        unverifiable: !rootDir,
        // A declared note wins over the status default.
        note: exists ? null : (spec.note || DEFAULT_SPEC_NOTE[status]),
      };
    });
    const missing = checked.filter((spec) => !spec.exists);
    const acceptedDebt = missing.filter((spec) => spec.status === 'accepted-debt');
    const pending = missing.filter((spec) => spec.status !== 'accepted-debt');

    const flatPoints = pending.length > 0 ? penalty : 0;
    const acceptedDebtPoints = acceptedDebt.length * penalty;
    const points = flatPoints + acceptedDebtPoints;

    result.kinds[kind] = {
      specs: checked, missing, pending, acceptedDebt,
      declared: checked.length, flatPoints, acceptedDebtPoints, points,
    };
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

// ── Dimension 5: deferred open items ────────────────────────────────────────

/**
 * Scores the open decisions a flag is carrying that are not test gaps.
 *
 * These used to be recorded and left unscored, which was the wrong call: the
 * scale already charges accepted-debt specs per item on the grounds that a
 * standing decision is owned individually, and a deferred item is exactly that
 * — someone decided not to do this yet, and the flag carries the consequence
 * until they do. Recording it on the card but leaving it out of the number made
 * the number describe less than the card did.
 *
 * A bundled item (one theme, several components) costs its kind plus one per
 * component beyond the first, so breadth shows up without one theme swamping
 * the total. Promote a component to its own item once it is scheduled
 * separately — at that point it stops being part of one decision.
 *
 * Pure: no filesystem, no clock. `points` on an item overrides the formula.
 */
export function scoreDeferredItems(flag) {
  const items = (flag.deferredItems || []).map((item) => {
    const kind = item.kind || 'open';
    const kindRecognized = Object.hasOwn(POINTS.deferredItemKind, kind);
    const components = (item.components || []).map((component) => ({
      id: component.id,
      note: component.note || '',
      ref: component.ref || null,
    }));
    const base = kindRecognized
      ? POINTS.deferredItemKind[kind]
      : POINTS.deferredItemKind.open;
    const breadth = Math.max(0, components.length - 1) * POINTS.perExtraDeferredComponent;
    const derived = base + breadth;

    const declared = item.points;
    const hasDeclared = declared !== undefined && declared !== null;
    const declaredUsable = isUsableOverride(declared);

    return {
      id: item.id,
      kind,
      kindRecognized,
      note: item.note || '',
      refs: item.refs || [],
      components,
      points: declaredUsable ? declared : derived,
      pointsOverridden: declaredUsable,
      // A declared value that is not a whole number of points is dropped, not
      // repaired. Debt cannot be negative and the scale has no halves, so there
      // is no honest guess at the intent — and clamping -50 to 0 would make a
      // broken entry indistinguishable from a deliberate zero. The derived
      // score stands instead, and the report says the override was ignored.
      pointsOverrideIgnored: hasDeclared && !declaredUsable,
      declaredPoints: hasDeclared && !declaredUsable ? declared : null,
    };
  });
  return { items, points: items.reduce((total, item) => total + item.points, 0) };
}

/** An override is honoured only as a whole, non-negative number of points. */
export function isUsableOverride(value) {
  return Number.isInteger(value) && value >= 0;
}

// ── Report ──────────────────────────────────────────────────────────────────

export function scoreFlag(flag, context) {
  const touchPoints = collectTouchPoints(flag, context);
  const tests = checkTestSpecs(flag, context);
  const coverage = collectCoverage(flag, context);
  const lifecycle = scoreLifecycle(flag, context.now);
  const deferred = scoreDeferredItems(flag);
  return {
    key: flag.key,
    description: flag.description || '',
    owner: flag.owner || 'unassigned',
    jira: flag.jira || null,
    created: flag.created || null,
    defaultValue: flag.defaultValue,
    ttlNote: flag.ttlNote || null,
    deferred,
    touchPoints,
    tests,
    coverage,
    lifecycle,
    total: touchPoints.points + tests.points + coverage.points
      + lifecycle.points + deferred.points,
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

/** Word-wraps `text` to `width`, prefixing every line with `indent`. */
export function wrapText(text, width, indent = '') {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    if (`${current} ${word}`.length > width) {
      lines.push(indent + current);
      current = word;
    } else {
      current += ` ${word}`;
    }
  }
  lines.push(indent + current);
  return lines;
}

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
    const summary = [`${present}/${result.declared} present`];
    if (result.pending.length > 0) {
      summary.push(`${result.pending.length} pending (+${result.flatPoints})`);
    }
    if (result.acceptedDebt.length > 0) {
      summary.push(`${result.acceptedDebt.length} accepted debt (+${result.acceptedDebtPoints})`);
    }
    lines.push(`      ${kind}: ${summary.join(' · ')}`);
    for (const spec of result.pending) {
      lines.push(`        pending — ${spec.root}: ${spec.path} (${spec.note})`);
    }
    for (const spec of result.acceptedDebt) {
      lines.push(`        accepted debt — ${spec.root}: ${spec.path} (${spec.note})`);
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

    if (flag.deferred.items.length > 0) {
      lines.push(`  ${pad('open items', 14)} ${padStart(`${flag.deferred.points} pts`, 8)}  `
        + `${flag.deferred.items.length} deferred`);
      for (const item of flag.deferred.items) {
        const unit = item.points === 1 ? 'pt' : 'pts';
        let breakdown = `${item.points} ${unit}`;
        if (item.pointsOverridden) breakdown += ', declared';
        if (item.pointsOverrideIgnored) {
          breakdown += `, declared ${JSON.stringify(item.declaredPoints)} IGNORED `
            + '(not a whole number of points)';
        }
        const label = item.kindRecognized ? item.kind : `${item.kind} → open rate`;
        lines.push(`        [${label}] ${item.id} — ${breakdown}`);
        lines.push(...wrapText(item.note, 92, '          '));
        for (const component of item.components) {
          lines.push(`          · ${component.id}`);
          lines.push(...wrapText(component.note, 88, '              '));
          if (component.ref) lines.push(`              ref: ${component.ref}`);
        }
        for (const ref of item.refs) lines.push(`          ref: ${ref}`);
      }
    }
    lines.push('');
    lines.push(`  ${pad('TOTAL', 14)} ${padStart(`${flag.total} pts`, 8)}`);
    lines.push('');
  }

  const width = Math.max(4, ...report.flags.map((flag) => flag.key.length));
  lines.push(`  ${pad('FLAG', width)}  ${padStart('TOUCH', 6)}  ${padStart('TESTS', 6)}  `
    + `${padStart('COV', 5)}  ${padStart('LIFE', 5)}  ${padStart('OPEN', 5)}  ${padStart('TOTAL', 6)}`);
  for (const flag of report.flags) {
    lines.push(`  ${pad(flag.key, width)}  ${padStart(flag.touchPoints.points, 6)}  `
      + `${padStart(flag.tests.points, 6)}  ${padStart(flag.coverage.points, 5)}  `
      + `${padStart(flag.lifecycle.points, 5)}  ${padStart(flag.deferred.points, 5)}  `
      + `${padStart(flag.total, 6)}`);
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

function htmlRow(label, points, detail, slot) {
  // The swatch is what ties a row to its segment in the composition bar; the
  // label carries the identity, so the colour is never the only cue.
  const swatch = slot ? `<span class="dot s${slot}"></span>` : '';
  const zero = points === 0 ? ' class="zero"' : '';
  return `<tr><th>${swatch}${escapeHtml(label)}</th><td class="pts"${zero}>${escapeHtml(points)}</td>`
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

  const specList = (specs, label) => (specs.length === 0 ? '' : `<ul>${specs.map((spec) =>
    `<li><span class="tag">${escapeHtml(label)}</span> <code>${escapeHtml(spec.root)}: ${escapeHtml(spec.path)}</code>`
    + ` <span class="muted">${escapeHtml(spec.note)}</span></li>`).join('')}</ul>`);

  const testDetail = Object.entries(flag.tests.kinds).map(([kind, result]) => {
    const present = result.declared - result.missing.length;
    const summary = [`${present}/${result.declared} present`];
    if (result.pending.length > 0) summary.push(`${result.pending.length} pending (+${result.flatPoints})`);
    if (result.acceptedDebt.length > 0) {
      summary.push(`${result.acceptedDebt.length} accepted debt (+${result.acceptedDebtPoints})`);
    }
    return `<p><strong>${escapeHtml(kind)}</strong>: ${escapeHtml(summary.join(' · '))}</p>`
      + specList(result.pending, 'pending')
      + specList(result.acceptedDebt, 'accepted debt');
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

  const deferred = flag.deferred.items.length === 0 ? '' : `
  <div class="deferred">
    <h3>Open items <span class="muted">— ${flag.deferred.items.length} deferred, ${flag.deferred.points} pts</span></h3>
    <ul>${flag.deferred.items.map((item) => `<li><span class="tag ${escapeHtml(item.kind)}">${escapeHtml(item.kind)}`
      + `${item.kindRecognized ? '' : ' &rarr; open rate'}</span> `
      + `<code>${escapeHtml(item.id)}</code> <span class="pts-inline">${item.points} pts`
      + `${item.pointsOverridden ? ', declared' : ''}`
      + `${item.pointsOverrideIgnored
        ? `, declared ${escapeHtml(JSON.stringify(item.declaredPoints))} ignored`
        : ''}</span>`
      + `<p>${escapeHtml(item.note)}</p>`
      + (item.components.length > 0
        ? `<ul class="components">${item.components.map((component) =>
          `<li><code>${escapeHtml(component.id)}</code> ${escapeHtml(component.note)}`
          + (component.ref ? ` <span class="muted">${escapeHtml(component.ref)}</span>` : '')
          + '</li>').join('')}</ul>`
        : '')
      + (item.refs.length > 0
        ? `<p class="muted">${item.refs.map((ref) => escapeHtml(ref)).join('<br>')}</p>`
        : '')
      + '</li>').join('')}</ul>
  </div>`;

  // The total is the sum of its dimensions, so a part-to-whole bar is the honest
  // form: it reads as one magnitude and decomposes without a second chart. Each
  // segment is directly labelled, which is also what discharges the light-mode
  // contrast relief the palette validator asks for.
  const dimensions = [
    { slot: 1, label: 'Touch points', points: tp.points },
    { slot: 2, label: 'Tests', points: flag.tests.points },
    { slot: 3, label: 'Coverage', points: cov.points },
    { slot: 4, label: 'Lifecycle', points: life.points },
    { slot: 5, label: 'Open items', points: flag.deferred.points },
  ];
  const carried = dimensions.filter((dimension) => dimension.points > 0);

  const composition = carried.length === 0
    ? '<p class="empty">No debt recorded against this flag.</p>'
    : `<div class="bar" role="img" aria-label="${escapeHtml(
      carried.map((d) => `${d.label} ${d.points} points`).join(', ')
    )}">${carried.map((d) =>
      `<span class="seg s${d.slot}" style="flex:${d.points}"></span>`).join('')}</div>
    <ul class="legend">${carried.map((d) =>
      `<li><span class="dot s${d.slot}"></span>${escapeHtml(d.label)}`
      + ` <span class="legend-pts">${d.points}</span></li>`).join('')}</ul>`;

  return `<section class="card">
  <header>
    <div class="ident">
      <h2><code>${escapeHtml(flag.key)}</code></h2>
      <p class="desc">${escapeHtml(flag.description)}</p>
    </div>
    <div class="score">
      <span class="score-num">${flag.total}</span>
      <span class="score-unit">pts</span>
    </div>
  </header>
  <ul class="meta">
    <li>${escapeHtml(flag.jira || 'no Jira')}</li>
    <li>owner ${escapeHtml(flag.owner)}</li>
    <li>default ${escapeHtml(flag.defaultValue)}</li>
    <li>created ${escapeHtml(flag.created || 'unknown')}</li>
    <li>${life.ttl === null
      ? 'no TTL'
      : (life.daysRemaining >= 0
        ? `TTL in ${life.daysRemaining}d`
        : `TTL ${-life.daysRemaining}d overdue`)}</li>
  </ul>
  ${composition}
  <table>
    <thead><tr><th>Dimension</th><th class="pts">Points</th><th>Detail</th></tr></thead>
    <tbody>
      ${htmlRow('Touch points', tp.points, touchDetail, 1)}
      ${htmlRow('Tests', flag.tests.points, testDetail, 2)}
      ${htmlRow('Coverage', cov.points, covDetail, 3)}
      ${htmlRow('Lifecycle', life.points, lifeDetail, 4)}
    </tbody>
  </table>${deferred}
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
  /* Categorical slots are assigned in fixed order and never cycled; dark is the
     same hues re-stepped for the dark surface, not an automatic flip. Both
     orderings pass the CVD and normal-vision floors. */
  :root {
    color-scheme: light dark;
    --bg: #fcfcfb; --fg: #16181d; --muted: #666c78; --line: #dcdcd8; --card: #fff;
    --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #4a3aa7;
    --serious: #ec835a; --critical: #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a19; --fg: #e7e9ee; --muted: #9aa2b1; --line: #2f2f2d; --card: #212120;
      --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #9085e9;
      --serious: #ec835a; --critical: #e26a6a;
    }
  }
  body { margin: 0; padding: 2.5rem 1rem 4rem; background: var(--bg); color: var(--fg);
         font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         -webkit-font-smoothing: antialiased; }
  main { max-width: 64rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; letter-spacing: -.01em; margin: 0 0 .25rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .muted { color: var(--muted); font-size: .9em; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
          padding: 1.4rem 1.5rem; margin: 1.5rem 0; }
  .card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; }
  .ident { min-width: 0; }
  .card h2 { font-size: 1.05rem; margin: 0; }
  .desc { margin: .4rem 0 0; max-width: 46rem; }

  /* Hero number: the headline reads before any decomposition. */
  .score { display: flex; align-items: baseline; gap: .2rem; flex-shrink: 0;
           font-variant-numeric: tabular-nums; }
  .score-num { font-size: 2.6rem; font-weight: 650; letter-spacing: -.03em; line-height: 1; }
  .score-unit { font-size: .8rem; color: var(--muted); }

  .meta { display: flex; flex-wrap: wrap; gap: .4rem; list-style: none;
          margin: 1rem 0 1.1rem; padding: 0; }
  .meta li { font-size: .78rem; color: var(--muted); border: 1px solid var(--line);
             border-radius: 999px; padding: .1rem .55rem; }

  /* Part-to-whole bar: 2px surface gaps keep adjacent fills legible, and the
     rounded ends read as one mark rather than four. */
  .bar { display: flex; gap: 2px; height: 10px; border-radius: 5px; overflow: hidden; }
  .seg { min-width: 3px; }
  .empty { color: var(--muted); font-size: .9em; margin: .25rem 0 0; }
  .legend { display: flex; flex-wrap: wrap; gap: .1rem 1.1rem; list-style: none;
            margin: .7rem 0 0; padding: 0; font-size: .85rem; }
  .legend li { display: flex; align-items: center; gap: .4rem; color: var(--muted); }
  .legend-pts { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
  .dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; display: inline-block; }
  .s1, .dot.s1 { background: var(--s1); }
  .s2, .dot.s2 { background: var(--s2); }
  .s3, .dot.s3 { background: var(--s3); }
  .s4, .dot.s4 { background: var(--s4); }
  .s5, .dot.s5 { background: var(--s5); }
  .zero { color: var(--muted); }
  table { width: 100%; border-collapse: collapse; margin-top: 1.2rem; }
  th, td { text-align: left; vertical-align: top; padding: .6rem .6rem; border-top: 1px solid var(--line); }
  tbody th { font-weight: 600; white-space: nowrap; }
  tbody th .dot { margin-right: .5rem; vertical-align: baseline; }
  thead th { border-top: 0; font-size: .72rem; text-transform: uppercase; letter-spacing: .06em;
             color: var(--muted); font-weight: 600; padding-bottom: .35rem; }
  .pts { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
  ul { margin: .35rem 0; padding-left: 1.1rem; }
  .tag { display: inline-block; font-size: .7rem; text-transform: uppercase; letter-spacing: .05em;
         border: 1px solid var(--line); border-radius: 4px; padding: 0 .32rem; color: var(--muted);
         white-space: nowrap; }
  /* Status colours are reserved and always ship with the label beside them. */
  .tag.precondition { border-color: var(--serious); color: var(--serious); }
  .tag.cosmetic { opacity: .8; }
  .deferred { margin-top: 1.3rem; border-top: 1px solid var(--line); padding-top: 1rem; }
  .deferred h3 { font-size: .82rem; text-transform: uppercase; letter-spacing: .06em;
                 color: var(--muted); font-weight: 600; margin: 0 0 .5rem; }
  .deferred > ul { list-style: none; padding-left: 0; }
  .deferred > ul > li { margin: .6rem 0; }
  .pts-inline { font-variant-numeric: tabular-nums; font-weight: 600; font-size: .85em; }
  .components { margin: .35rem 0 .35rem .25rem; padding-left: 1rem; border-left: 2px solid var(--line); }
  .components li { margin: .25rem 0; }
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

#!/usr/bin/env node
// Answers "where are the tests for X?" for a functional source file or a
// com.etendoerp.go Java class. Step 1 of the reuse-first protocol
// (docs/testing/test-reuse-policy.md): locate existing tests before writing one.
//
// Usage:
//   node scripts/find-tests.js <path|JavaClass|FQN> [--json]
//   make find-tests FILE=<path|JavaClass|FQN>
//
// Sources merged: `@covers` tags, import statements that resolve to the file
// (Java: imports + same-package references), and `readFileSync` path literals.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const SF_ROOT = process.env.SF_ROOT || resolve(SCRIPT_DIR, '..');
export const GO_ROOT = process.env.GO_ROOT || resolve(SF_ROOT, '..', 'modules', 'com.etendoerp.go');

const TEST_FILE_RE = /\.(test|vitest|spec)\.[cm]?[jt]sx?$/;
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];
const ALIASES = [
  ['@/', 'tools/app-shell/src/'],
  ['@generated/', 'artifacts/'],
];
const SOURCE_ORDER = ['covers', 'import', 'same-package', 'readFileSync', 'readFileSync:basename'];

function toPosix(path) {
  return path.split('\\').join('/');
}

function gitLsFiles(root, patterns) {
  try {
    const out = execFileSync('git', ['ls-files', '--', ...patterns], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

// ── Target resolution ──────────────────────────────────────────────────────

/**
 * Decides which repo a CLI argument belongs to and normalizes it.
 * Returns { repo: 'functional', relPath } or { repo: 'go', classes: [FQN...] }
 * or { error }.
 */
export function resolveTarget(arg, { sfRoot = SF_ROOT, goRoot = GO_ROOT, cwd = process.cwd() } = {}) {
  if (!arg) return { error: 'missing FILE argument' };
  const input = arg.trim();

  // Java FQN or bare class name: no slash, no extension, starts like a class.
  if (!input.includes('/') && !/\.[a-z]+$/.test(input) && /^([a-z_][\w]*\.)*[A-Z]\w*$/.test(input)) {
    if (input.includes('.')) return { repo: 'go', classes: [input] };
    const matches = gitLsFiles(goRoot, [`src/**/${input}.java`, `src-util/**/src/**/${input}.java`])
      .map(javaPathToFqn).filter(Boolean);
    if (matches.length === 0) return { error: `no Java class named ${input} under ${goRoot}/src or src-util` };
    return { repo: 'go', classes: matches };
  }

  const candidates = isAbsolute(input)
    ? [input]
    : [resolve(cwd, input), resolve(sfRoot, input), resolve(goRoot, input)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) return { error: `file not found: ${input}` };

  const abs = normalize(found);
  if (isInside(abs, goRoot)) {
    const rel = toPosix(relative(goRoot, abs));
    if (!rel.endsWith('.java')) return { error: `only Java classes are supported in com.etendoerp.go: ${rel}` };
    const fqn = javaPathToFqn(rel);
    if (!fqn) return { error: `cannot derive a class name from ${rel}` };
    return { repo: 'go', classes: [fqn] };
  }
  if (isInside(abs, sfRoot)) {
    return { repo: 'functional', relPath: toPosix(relative(sfRoot, abs)) };
  }
  return { error: `${input} is not inside schema_forge or com.etendoerp.go` };
}

function isInside(abs, root) {
  const rel = relative(root, abs);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** `src/com/etendoerp/go/rest/Foo.java` → `com.etendoerp.go.rest.Foo`. */
export function javaPathToFqn(relPath) {
  const match = toPosix(relPath).match(/(?:^|\/)(?:src-test\/src|src)\/(.+)\.java$/);
  return match ? match[1].split('/').join('.') : null;
}

// ── Functional repo ────────────────────────────────────────────────────────

// A tag counts only when it opens a comment line (`// @covers x`, ` * @covers x`,
// `/** @covers x */`), so a string literal or prose that mentions it is ignored.
const COVERS_LINE_RE = /^\s*(?:\/\/|\/?\*+)\s*@covers\s+(\S+?)\s*(?:\*\/)?\s*$/;

/** The `@covers` target declared on one source line, or null. */
export function coversOnLine(line) {
  const match = line.match(COVERS_LINE_RE);
  return match ? match[1] : null;
}

/** Every `@covers <token>` in a file, in order. */
export function parseCovers(src) {
  return src.split('\n').map(coversOnLine).filter(Boolean);
}

/** Module specifiers that bring code into the test (vi.mock / jest.mock excluded). */
export function parseImportSpecifiers(src) {
  const specs = new Set();
  const patterns = [
    /\bimport\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"`;]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) specs.add(m[1]);
  }
  return [...specs];
}

function stripSourceExtension(path) {
  const withoutIndex = path.replace(/\/index(\.[cm]?[jt]sx?)?$/, '');
  for (const ext of SOURCE_EXTENSIONS) {
    if (withoutIndex.endsWith(ext)) return withoutIndex.slice(0, -ext.length);
  }
  return withoutIndex;
}

/** Resolves an import specifier to a repo-relative path (extension kept if written). */
export function resolveSpecifier(spec, testRelPath) {
  if (spec.startsWith('.')) {
    return posix.normalize(posix.join(posix.dirname(testRelPath), spec));
  }
  for (const [prefix, target] of ALIASES) {
    if (spec.startsWith(prefix)) return target + spec.slice(prefix.length);
  }
  return null;
}

export function importMatches(spec, testRelPath, targetRelPath) {
  const resolved = resolveSpecifier(spec, testRelPath);
  if (!resolved) return false;
  return stripSourceExtension(resolved) === stripSourceExtension(targetRelPath);
}

/**
 * Checks whether a file that reads sources as text names the target in a path
 * literal. Returns 'readFileSync' (resolved), 'readFileSync:basename' (only the
 * file name matched), or null.
 */
export function readFileSyncMatch(src, testRelPath, targetRelPath) {
  if (!/\breadFile(Sync)?\s*\(/.test(src)) return null;
  const targetBase = posix.basename(targetRelPath);
  if (!src.includes(targetBase)) return null;

  // path.join / resolve / new URL calls: join their string literals and try
  // both the test's directory and the repo root as the base.
  const callRe = /\b(?:join|resolve|URL)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  for (const m of src.matchAll(callRe)) {
    const literals = [...m[1].matchAll(/['"`]([^'"`$]+)['"`]/g)].map((l) => l[1]);
    if (!literals.some((lit) => lit.includes(targetBase))) continue;
    const joined = posix.join(...literals);
    const fromTest = posix.normalize(posix.join(posix.dirname(testRelPath), joined));
    const fromRoot = posix.normalize(joined);
    if (fromTest === targetRelPath || fromRoot === targetRelPath) return 'readFileSync';
  }

  // A literal that is a segment-aligned suffix of the target path. Import
  // specifiers are skipped: they are the `import` source, not a text read.
  const specifiers = new Set(parseImportSpecifiers(src));
  for (const m of src.matchAll(/['"`]([^'"`$\n]+)['"`]/g)) {
    if (specifiers.has(m[1])) continue;
    const lit = m[1].replace(/^(\.\.?\/)+/, '');
    if (!lit.endsWith(targetBase)) continue;
    if (lit.includes('/') && (targetRelPath === lit || targetRelPath.endsWith(`/${lit}`))) {
      return 'readFileSync';
    }
    if (lit === targetBase) return 'readFileSync:basename';
  }
  return null;
}

export function findFunctionalTests(targetRelPath, { root = SF_ROOT, files } = {}) {
  const testFiles = (files ?? gitLsFiles(root, ['*.test.*', '*.vitest.*', '*.spec.*']))
    .filter((f) => TEST_FILE_RE.test(f) && !f.startsWith('.claude/'));
  const hits = [];
  for (const rel of testFiles) {
    const src = readText(join(root, rel));
    if (!src) continue;
    const sources = new Set();
    if (parseCovers(src).includes(targetRelPath)) sources.add('covers');
    if (parseImportSpecifiers(src).some((spec) => importMatches(spec, rel, targetRelPath))) {
      sources.add('import');
    }
    const rfs = readFileSyncMatch(src, rel, targetRelPath);
    if (rfs) sources.add(rfs);
    if (sources.size) hits.push({ file: rel, sources: sortSources(sources) });
  }
  return rankHits(hits);
}

// ── com.etendoerp.go ───────────────────────────────────────────────────────

export function javaPackage(src) {
  const m = src.match(/^\s*package\s+([\w.]+)\s*;/m);
  return m ? m[1] : '';
}

export function javaMatchSources(src, fqn) {
  const sources = new Set();
  const simple = fqn.slice(fqn.lastIndexOf('.') + 1);
  const pkg = fqn.slice(0, fqn.lastIndexOf('.'));
  const escaped = fqn.replace(/\./g, '\\.');

  if (parseCovers(src).includes(fqn)) sources.add('covers');
  if (new RegExp(`^\\s*import\\s+(static\\s+)?${escaped}(\\.[\\w*]+)?\\s*;`, 'm').test(src)) {
    sources.add('import');
  }
  if (javaPackage(src) === pkg && new RegExp(`\\b${simple}\\b`).test(src)) {
    sources.add('same-package');
  }
  return sources;
}

export function findJavaTests(fqn, { root = GO_ROOT, files } = {}) {
  const testFiles = (files ?? gitLsFiles(root, ['src-test/**/*.java']));
  const selfTest = `${fqn.split('.').join('/')}.java`;
  const hits = [];
  for (const rel of testFiles) {
    if (rel.endsWith(selfTest)) continue; // the class itself, if it lives under src-test
    const src = readText(join(root, rel));
    if (!src) continue;
    const sources = javaMatchSources(src, fqn);
    if (sources.size) hits.push({ file: rel, sources: sortSources(sources) });
  }
  return rankHits(hits);
}

// ── Output ─────────────────────────────────────────────────────────────────

function sortSources(set) {
  return [...set].sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b));
}

function rankHits(hits) {
  const score = (hit) => Math.min(...hit.sources.map((s) => SOURCE_ORDER.indexOf(s)));
  return hits.sort((a, b) => score(a) - score(b) || a.file.localeCompare(b.file));
}

export function formatReport({ label, repo, hits, root }) {
  const lines = [`find-tests: ${label} (${repo === 'go' ? 'com.etendoerp.go' : 'functional'})`];
  if (hits.length === 0) {
    lines.push('  no existing tests found — a new file is justified only if the unit is really uncovered');
    return lines.join('\n');
  }
  lines.push(`  ${hits.length} test file(s)${repo === 'go' ? ` under ${root}` : ''}:`);
  const width = Math.min(Math.max(...hits.map((h) => h.file.length)), 110);
  for (const hit of hits) {
    lines.push(`  ${hit.file.padEnd(width)}  [${hit.sources.join(', ')}]`);
  }
  return lines.join('\n');
}

export function main(argv) {
  const args = argv.filter((a) => a !== '--json');
  const asJson = argv.includes('--json');
  if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    console.error('Usage: node scripts/find-tests.js <path|JavaClass|FQN> [--json]');
    return 2;
  }
  const target = resolveTarget(args[0]);
  if (target.error) {
    console.error(`find-tests: ${target.error}`);
    return 2;
  }

  const reports = target.repo === 'functional'
    ? [{ label: target.relPath, repo: 'functional', hits: findFunctionalTests(target.relPath), root: SF_ROOT }]
    : target.classes.map((fqn) => ({ label: fqn, repo: 'go', hits: findJavaTests(fqn), root: GO_ROOT }));

  if (asJson) {
    console.log(JSON.stringify(reports.map(({ label, repo, hits }) => ({ target: label, repo, hits })), null, 2));
  } else {
    console.log(reports.map(formatReport).join('\n\n'));
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}


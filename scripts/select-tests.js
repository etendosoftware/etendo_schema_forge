#!/usr/bin/env node
// Picks the unit tests a change can affect, so the pre-push (step 2) and `make test-changed`
// run those instead of the whole suite (ETP-5695). The full suite still runs in CI.
//
// Usage:
//   node scripts/select-tests.js --base <ref> [--head <ref>] [--out <file>] [--json]
//
// A unit test (one of the GROUPS below, the same file sets `make test-all-coverage` runs) is
// selected when:
//   - it is a changed file itself;
//   - it reaches a changed file through static imports: relative paths, the `@/` and
//     `@generated/` aliases, and `import.meta.glob` patterns, followed transitively;
//   - it, or a module it reaches, reads a changed file as text (`readFileSync`, path literals)
//     or declares `@covers` it: the matching `make find-tests` uses.
// When in doubt, it runs more: a dependency, config or tooling change selects whole groups, and
// a changed non-code file nothing is found to depend on falls back to the tests of its area.
// A changed code module that no test reaches selects nothing and is listed as untested.
//
// --out writes the plan as TSV, one `<group>\t<test file>` line per test, or `<group>\t*` for a
// whole group (scripts/test-changed.sh reads it). Without --out it prints a readable summary.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizedGitEnv } from './lib/git-env.js';
import {
  isEntryPoint,
  parseCovers,
  parseImportSpecifiers,
  pathLiteralMatch,
  readFileSyncMatch,
  resolveSpecifier,
} from './find-tests.js';

const SF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Keep in sync with the find commands of `make test-all-coverage` (and the vitest `include`).
export const GROUPS = [
  { name: 'cli', re: /^cli\/test\/.+\.test\.js$/ },
  {
    name: 'appshell',
    re: /^tools\/app-shell\/src\/(?:.+\/)?__tests__\/.+\.test\.js$/,
    exclude: /(?:^|\/)useEntity-helpers\.test\.js$/,
  },
  { name: 'appshell-test', re: /^tools\/app-shell\/test\/.+\.test\.js$/ },
  { name: 'artifacts', re: /^artifacts\/(?:.+\/)?__tests__\/.+\.test\.js$/ },
  { name: 'scripts', re: /^scripts\/__tests__\/.+\.test\.js$/ },
  { name: 'vitest', re: /^tools\/app-shell\/src\/(?:.+\/)?[^/]+\.(?:vitest|spec)\.jsx?$/ },
];
const ALL_GROUPS = GROUPS.map((g) => g.name);

// A change here can affect tests in ways imports do not show: run whole groups.
export const TRIGGERS = [
  {
    re: /^(?:package(?:-lock)?\.json|tools\/app-shell\/package(?:-lock)?\.json|\.nvmrc|\.npmrc|Makefile|run-sonar\.sh)$|^\.githooks\//,
    groups: ALL_GROUPS,
  },
  { re: /^scripts\/(?:select-tests\.js|test-changed\.sh|find-tests\.js|merge-lcov\.js|lib\/git-env\.js)$/, groups: ALL_GROUPS },
  { re: /^tools\/app-shell\/(?:vite|vitest)\.config\.js$|^tools\/app-shell\/src\/test\/setup\.js$/, groups: ['vitest'] },
];

// Files no unit test depends on: docs, images, Playwright (its own pre-push step), agent config.
export const SAFE_RE = new RegExp([
  '(?:^|/)[^/]*\\.md$', '^docs/', '(?:^|/)LICENSE', '^\\.gitignore$', '^\\.gitattributes$',
  '\\.(?:png|jpe?g|gif|svg|ico|webp)$', '^e2e/', '^\\.github/', '^agent-prompts/',
  '^\\.(?:claude|codex|opencode|agents|superpowers|atl)/',
].join('|'));

const CODE_RE = /\.[cm]?[jt]sx?$/;
const TEST_FILE_RE = /\.(?:test|vitest|spec)\.[cm]?[jt]sx?$/;
const RESOLVE_SUFFIXES = ['', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json',
  '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

export function groupOf(file) {
  const group = GROUPS.find((g) => g.re.test(file) && !(g.exclude && g.exclude.test(file)));
  return group ? group.name : null;
}

/** The repo file an import specifier lands on, or null (packages, unresolved paths). */
export function resolveToFile(spec, fromRel, fileSet) {
  const base = resolveSpecifier(spec, fromRel);
  if (!base) return null;
  for (const suffix of RESOLVE_SUFFIXES) {
    if (fileSet.has(base + suffix)) return base + suffix;
  }
  return null;
}

/** `import.meta.glob('…')` / `import.meta.glob(['…', …])` patterns (negations dropped). */
export function parseGlobPatterns(src) {
  const patterns = [];
  for (const m of src.matchAll(/\bimport\.meta\.glob\s*\(\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/g)) {
    for (const lit of m[1].matchAll(/['"`]([^'"`]+)['"`]/g)) {
      if (!lit[1].startsWith('!')) patterns.push(lit[1]);
    }
  }
  return patterns;
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',') re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** target file -> files that import it (statically or through an import.meta.glob). */
export function buildImporters(files, readText) {
  const fileSet = new Set(files);
  const importers = new Map();
  const link = (target, importer) => {
    if (!importers.has(target)) importers.set(target, new Set());
    importers.get(target).add(importer);
  };
  for (const rel of files) {
    if (!CODE_RE.test(rel)) continue;
    const src = readText(rel);
    if (src == null) continue;
    for (const spec of parseImportSpecifiers(src)) {
      const target = resolveToFile(spec, rel, fileSet);
      if (target) link(target, rel);
    }
    for (const pattern of parseGlobPatterns(src)) {
      const resolved = resolveSpecifier(pattern, rel);
      if (!resolved) continue;
      const re = globToRegExp(resolved);
      for (const f of files) if (re.test(f)) link(f, rel);
    }
  }
  return importers;
}

/** Code files that read `target` as text or name it in `@covers`. */
export function textReaders(target, files, readText) {
  const readers = [];
  for (const rel of files) {
    if (rel === target || !CODE_RE.test(rel)) continue;
    const src = readText(rel);
    if (src == null || !src.includes(posix.basename(target))) continue;
    if (readFileSyncMatch(src, rel, target) === 'readFileSync'
        || pathLiteralMatch(src, rel, target)
        || parseCovers(src).includes(target)) {
      readers.push(rel);
    }
  }
  return readers;
}

/** Unit tests reachable from `start` through importers (start itself included). */
function reachTests(start, importers) {
  const tests = new Set();
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) {
    const file = queue.shift();
    if (groupOf(file)) tests.add(file);
    for (const importer of importers.get(file) ?? []) {
      if (!seen.has(importer)) {
        seen.add(importer);
        queue.push(importer);
      }
    }
  }
  return tests;
}

/** Groups to run whole when a non-code file nothing depends on changes in their area. */
export function fallbackGroups(file) {
  if (file.startsWith('cli/')) return { groups: ['cli'] };
  if (file.startsWith('scripts/')) return { groups: ['scripts'] };
  if (file.startsWith('tools/app-shell/test/')) return { groups: ['appshell-test'] };
  if (file.startsWith('tools/app-shell/')) return { groups: ['appshell', 'appshell-test', 'vitest'] };
  const window = file.match(/^artifacts\/([^/]+)\//);
  if (window) return { prefix: `artifacts/${window[1]}/` };
  return { groups: ALL_GROUPS };
}

/**
 * The selection for a change set: { whole: Set<group>, tests: Set<file>, reasons: string[],
 * untested: string[] }. `files` is every tracked file; `readText(rel)` returns its text or null.
 */
export function selectTests({ changed, files, readText }) {
  const fileSet = new Set(files);
  const whole = new Set();
  const tests = new Set();
  const reasons = [];
  const untested = [];
  let importers = null;

  for (const file of changed) {
    const trigger = TRIGGERS.find((t) => t.re.test(file));
    if (trigger) {
      trigger.groups.forEach((g) => whole.add(g));
      reasons.push(`whole group: ${file} → ${trigger.groups.length === ALL_GROUPS.length ? 'all groups' : trigger.groups.join(', ')}`);
      continue;
    }
    if (SAFE_RE.test(file) || !fileSet.has(file)) continue; // docs and the like, or deleted
    if (groupOf(file)) {
      tests.add(file);
      continue;
    }
    if (TEST_FILE_RE.test(file)) continue; // a test outside the unit suite (gateway, mcp-tests…)

    importers ??= buildImporters(files, readText);
    const reached = reachTests([file, ...textReaders(file, files, readText)], importers);
    if (reached.size) {
      reached.forEach((t) => tests.add(t));
    } else if (CODE_RE.test(file)) {
      untested.push(file);
    } else {
      const fallback = fallbackGroups(file);
      if (fallback.groups) {
        fallback.groups.forEach((g) => whole.add(g));
        reasons.push(`fallback: ${file} (no dependent found) → ${fallback.groups.length === ALL_GROUPS.length ? 'all groups' : fallback.groups.join(', ')}`);
      } else {
        files.filter((f) => f.startsWith(fallback.prefix) && groupOf(f)).forEach((t) => tests.add(t));
        reasons.push(`fallback: ${file} (no dependent found) → tests under ${fallback.prefix}`);
      }
    }
  }
  for (const t of [...tests]) if (whole.has(groupOf(t))) tests.delete(t);
  return { whole, tests, reasons, untested };
}

/** TSV plan lines, `<group>\t<file>` or `<group>\t*`, grouped in GROUPS order. */
export function planLines(selection) {
  const lines = [];
  for (const { name } of GROUPS) {
    if (selection.whole.has(name)) {
      lines.push(`${name}\t*`);
      continue;
    }
    [...selection.tests].filter((t) => groupOf(t) === name).sort().forEach((t) => lines.push(`${name}\t${t}`));
  }
  return lines;
}

export function summary(selection, files) {
  const totals = Object.fromEntries(GROUPS.map((g) => [g.name, 0]));
  for (const f of files) {
    const g = groupOf(f);
    if (g) totals[g] += 1;
  }
  let picked = 0;
  let total = 0;
  const parts = GROUPS.map(({ name }) => {
    const n = selection.whole.has(name) ? totals[name] : [...selection.tests].filter((t) => groupOf(t) === name).length;
    picked += n;
    total += totals[name];
    return `${name} ${n}/${totals[name]}`;
  });
  const out = [`select-tests: ${picked}/${total} unit test files (${parts.join(', ')})`];
  for (const r of selection.reasons) out.push(`  ${r}`);
  for (const u of selection.untested) out.push(`  untested (no unit test reaches it): ${u}`);
  return out;
}

function git(args) {
  return execFileSync('git', args, { cwd: SF_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: sanitizedGitEnv() });
}

export function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base = arg('--base');
  if (!base) {
    console.error('usage: select-tests.js --base <ref> [--head <ref>] [--out <file>] [--json]');
    return 2;
  }
  const head = arg('--head') ?? 'HEAD';
  const changed = git(['diff', '--name-only', `${base}...${head}`]).split('\n').filter(Boolean);
  const files = git(['ls-files']).split('\n').filter(Boolean);
  const cache = new Map();
  const readText = (rel) => {
    if (!cache.has(rel)) {
      try {
        cache.set(rel, readFileSync(join(SF_ROOT, rel), 'utf8'));
      } catch {
        cache.set(rel, null);
      }
    }
    return cache.get(rel);
  };
  const selection = selectTests({ changed, files, readText });
  const out = arg('--out');
  if (out) writeFileSync(out, planLines(selection).map((l) => `${l}\n`).join(''));
  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      whole: [...selection.whole], tests: [...selection.tests].sort(),
      reasons: selection.reasons, untested: selection.untested,
    }, null, 2));
  } else {
    summary(selection, files).forEach((l) => console.log(l));
  }
  return 0;
}

if (isEntryPoint(import.meta.url)) process.exit(main(process.argv.slice(2)));

#!/usr/bin/env node
// Picks the mocked Playwright specs a change can affect, so the pre-push runs those instead of the
// whole mocked suite (ETP-5891). The PR's mini pipeline and the cut's Jenkins pipeline still run
// every mocked spec: this only narrows the local pre-push.
//
// Usage:
//   node scripts/select-mocked-specs.js --base <ref> [--head <ref>] [--map <map.json>] [--develop <ref>]
//                                       [--out <file>] [--json]
//
// The map (scripts/e2e-coverage-map.mjs) lists, for each app source file, the mocked specs whose
// tests executed it. Without --map it is the one CI published for where this branch left develop
// (--develop, origin/develop by default; scripts/lib/e2e-coverage-map-lookup.js). A mocked spec
// is selected when:
//   - it changed, or its screenshot baselines did;
//   - it executed a changed file, according to the map;
//   - it imports a changed e2e file (a helper, a mock), reads it or declares `@covers` it, directly
//     or through other e2e files;
//   - a changed file the map does not have (a new file, or one with only top-level code) is
//     imported, through any number of files the map does not have either, by files it executed:
//     the nearest mapped importers on each path;
//   - the change touches app code and the spec is in e2e/mocked-always-run.json (the map cannot
//     see everything it executes), the map does not know it yet (newer than the map) or the map
//     only has part of its coverage (one of its tests did not pass when the map was built).
// It runs the whole suite when it cannot follow a change: dependencies, the Vite or Playwright
// configuration, the quarantine list, or app or e2e code that reaches nothing mapped (a dynamic
// import, a registry). The locale files (tools/app-shell/src/locales/<locale>.json) are not
// imported but sliced by a Vite plugin, and code reads their keys by name: one that only adds keys
// adds nothing (only code in the same change can use a new key), one that changes or removes a
// key runs the whole suite. A window file (artifacts/) that reaches nothing mapped adds nothing, as
// when only windows change: they do not call for the mocked suite (.githooks/lib/relevance.sh).
// Files outside the mocked run (docs, unit tests, cli/, scripts/) are left out; an unknown file
// already makes relevance.sh run every check before this script is asked.
//
// --out writes the decision for the pre-push: `*` for the whole suite, else one spec per line,
// relative to e2e/ (what scripts/run-e2e-full.sh takes in E2E_MOCKED_SPECS). Without --out it
// prints a readable summary with the reason for each spec.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizedGitEnv } from './lib/git-env.js';
import { findCoverageMap } from './lib/e2e-coverage-map-lookup.js';
import { isEntryPoint } from './find-tests.js';
import { buildImporters, changedPaths, textReaders } from './select-tests.js';

const SF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ALWAYS_RUN_FILE = 'e2e/mocked-always-run.json';
const MAP_CACHE_DIR = join(SF_ROOT, 'tmp', 'e2e-coverage-map');

const MOCKED_SPEC_RE = /^e2e\/.+\.mocked\.spec\.js$/;
const SPEC_RE = /^e2e\/.+\.spec\.js$/;
const SNAPSHOT_RE = /^(e2e\/.+\.mocked\.spec\.js)-snapshots\//;
const UNIT_TEST_RE = /\/__tests__\/|\.(?:test|vitest)\.[cm]?[jt]sx?$|^tools\/app-shell\/src\/(?:.+\/)?[^/]+\.spec\.jsx?$|^tools\/app-shell\/src\/test\//;
const SAFE_RE = /(?:^|\/)[^/]*\.md$|^docs\/|(?:^|\/)LICENSE|\.(?:png|jpe?g|gif|svg|ico|webp)$/;
// The selection cannot follow these: they change how every spec runs.
const WHOLE_RE = /^(?:package(?:-lock)?\.json|e2e\/(?:playwright\.config\.js|package(?:-lock)?\.json|quarantine\.json)|tools\/app-shell\/(?!src\/|test\/).+)$/;
// Changing what this script reads changes the selection, not the app.
const SELECTION_CONFIG = new Set([ALWAYS_RUN_FILE]);

const APP_PREFIX = 'tools/app-shell/src/';
const WINDOW_RE = /^artifacts\/[^/]+\//;
const LOCALE_RE = /^tools\/app-shell\/src\/locales\/[^/]+\.json$/;

/** Every leaf of a locale dictionary as `a.b.c` → its JSON value. */
function leaves(node, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(node ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) leaves(value, path, out);
    else out.set(path, JSON.stringify(value));
  }
  return out;
}

/**
 * The keys of a locale file that `head` changes or removes against `base` (texts, or null for a
 * missing file): { changed: [key] }, or { error } when a side is not valid JSON.
 */
export function changedLocaleKeys(base, head) {
  let before;
  let after;
  try {
    before = leaves(base == null ? {} : JSON.parse(base));
    after = leaves(JSON.parse(head));
  } catch (err) {
    return { error: `not valid JSON (${err.message})` };
  }
  return { changed: [...before].filter(([key, value]) => after.get(key) !== value).map(([key]) => key) };
}

/** A path as people read it: the app and window aliases, specs relative to e2e/. */
export function shortPath(file) {
  if (file.startsWith(APP_PREFIX)) return `@/${file.slice(APP_PREFIX.length)}`;
  if (file.startsWith('artifacts/')) return `@generated/${file.slice('artifacts/'.length)}`;
  if (SPEC_RE.test(file)) return file.slice('e2e/'.length);
  return file;
}

/** `{ specs, files }` from the map's JSON, or an Error saying why it cannot be used. */
export function parseMap(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return new Error(`not JSON (${err.message})`);
  }
  if (!data || !Array.isArray(data.specs) || !data.files || typeof data.files !== 'object') {
    return new Error('no `specs` list or `files` object');
  }
  return { commit: data.commit ?? null, specs: data.specs, partial: Array.isArray(data.partial) ? data.partial : [], files: data.files };
}

/** The specs of e2e/mocked-always-run.json, as repo paths; [] when it is missing or unreadable. */
export function parseAlwaysRun(text) {
  if (text == null) return [];
  try {
    const { specs } = JSON.parse(text);
    return Array.isArray(specs) ? specs.map((s) => `e2e/${s.file}`) : [];
  } catch {
    return [];
  }
}

function list(files, max = 3) {
  const names = files.map(shortPath);
  return names.length > max ? `${names.slice(0, max).join(', ')} +${names.length - max} more` : names.join(', ');
}

const count = (n) => `${n} spec${n === 1 ? '' : 's'}`;

/**
 * Walks up from `file` and the files that read it, through their importers, and stops on each path
 * at the first file the map has, or at a spec. `within` keeps the walk from leaving one folder (a
 * window) through its own imports. Returns the mapped files and the specs it reached.
 */
function reachUp(file, readers, { importers, mapped, within }) {
  const reachedMapped = new Set();
  const reachedSpecs = new Set();
  const seen = new Set([file, ...readers]);
  const queue = [...seen];
  while (queue.length) {
    const current = queue.shift();
    if (SPEC_RE.test(current)) {
      reachedSpecs.add(current);
      continue;
    }
    if (current !== file && mapped.has(current)) {
      reachedMapped.add(current);
      continue;
    }
    const leaves = within && current.startsWith(within);
    for (const importer of importers.get(current) ?? []) {
      if (seen.has(importer) || (leaves && !importer.startsWith(within))) continue;
      seen.add(importer);
      queue.push(importer);
    }
  }
  return { mapped: [...reachedMapped].sort(), specs: [...reachedSpecs].sort() };
}

/**
 * The selection for a change set: { whole: boolean, specs: Set<file>, reasons: string[],
 * ignored: string[], total }. `files` is every tracked file, `readText(rel)` its text or null,
 * `readBaseText(rel)` its text where the change starts (null when it did not exist), `map` what
 * parseMap returned and `alwaysRun` the specs of e2e/mocked-always-run.json.
 */
export function selectMockedSpecs({ changed, files, readText, readBaseText = () => null, map, alwaysRun = [] }) {
  const fileSet = new Set(files);
  const existingSpecs = files.filter((f) => MOCKED_SPEC_RE.test(f));
  const total = existingSpecs.length;
  const mapped = new Map(Object.entries(map.files));
  const specs = new Set();
  const reasons = [];
  const wholeReasons = [];
  const ignored = [];
  let touchesApp = false;
  let importers = null;
  const removed = changed.filter((f) => !fileSet.has(f));
  const graph = () => (importers ??= buildImporters(files, readText, removed));
  const live = (list) => list.filter((s) => MOCKED_SPEC_RE.test(s) && fileSet.has(s));
  const add = (file, picked, how) => {
    picked.forEach((s) => specs.add(s));
    reasons.push(`${shortPath(file)} → ${how ? `${how} → ` : ''}${count(picked.length)}`);
  };

  for (const file of changed) {
    if (SAFE_RE.test(file) && !SNAPSHOT_RE.test(file)) continue;
    if (SELECTION_CONFIG.has(file)) continue;
    const snapshot = file.match(SNAPSHOT_RE);
    if (snapshot) {
      if (fileSet.has(snapshot[1])) add(file, [snapshot[1]], 'its spec\'s screenshot');
      continue;
    }
    if (MOCKED_SPEC_RE.test(file)) {
      if (fileSet.has(file)) {
        specs.add(file);
        reasons.push(`${shortPath(file)} → changed spec`);
      }
      continue;
    }
    if (WHOLE_RE.test(file)) {
      wholeReasons.push(`${shortPath(file)} → changes how every spec runs`);
      continue;
    }
    if (SPEC_RE.test(file) || UNIT_TEST_RE.test(file)) {
      ignored.push(file);
      continue;
    }
    if (LOCALE_RE.test(file)) {
      const keys = fileSet.has(file) ? changedLocaleKeys(readBaseText(file), readText(file)) : { error: 'removed' };
      if (keys.error) {
        wholeReasons.push(`${shortPath(file)} → ${keys.error}`);
      } else if (keys.changed.length) {
        const shown = keys.changed.slice(0, 3).join(', ') + (keys.changed.length > 3 ? ` +${keys.changed.length - 3} more` : '');
        wholeReasons.push(`${shortPath(file)} → changes or removes ${keys.changed.length} key(s), which code reads by name (${shown})`);
      } else {
        reasons.push(`${shortPath(file)} → only adds keys: nothing to run for them`);
      }
      continue;
    }
    const isApp = file.startsWith(APP_PREFIX);
    const windowDir = file.match(WINDOW_RE)?.[0] ?? null;
    const isE2e = file.startsWith('e2e/');
    if (!isApp && !windowDir && !isE2e) {
      ignored.push(file);
      continue;
    }

    // Specs that read the file or declare `@covers` it, whatever the map says.
    const readers = textReaders(file, files, readText);
    if (mapped.has(file)) {
      if (isApp || windowDir) touchesApp = true;
      const picked = [...new Set([...live(mapped.get(file)), ...live(readers)])].sort();
      add(file, picked, fileSet.has(file) ? '' : 'removed');
      continue;
    }

    const reached = reachUp(file, readers, { importers: graph(), mapped, within: windowDir });
    const viaMap = [...new Set(reached.mapped.flatMap((m) => live(mapped.get(m))))];
    const viaSpecs = live(reached.specs);
    const picked = [...new Set([...viaMap, ...viaSpecs])].sort();
    if (picked.length && (isApp || windowDir)) touchesApp = true;
    if (picked.length) {
      const how = [];
      if (reached.mapped.length) how.push(`imported by ${list(reached.mapped)}`);
      if (viaSpecs.length) how.push(`used by ${list(viaSpecs)}`);
      add(file, picked, `${fileSet.has(file) ? 'not in the map' : 'removed'}, ${how.join('; ')}`);
    } else if (!fileSet.has(file)) {
      reasons.push(`${shortPath(file)} → removed, nothing imports it anymore`);
    } else if (windowDir) {
      reasons.push(`${shortPath(file)} → no mocked spec executes this window`);
    } else if (isE2e && reached.specs.length) {
      ignored.push(file); // only integration specs use it
    } else {
      wholeReasons.push(`${shortPath(file)} → not in the map and reaches nothing mapped`);
    }
  }

  if (wholeReasons.length) {
    return { whole: true, specs: new Set(existingSpecs), reasons: wholeReasons, ignored, total, commit: map.commit };
  }
  if (touchesApp) {
    const always = live(alwaysRun).filter((s) => !specs.has(s));
    if (always.length) {
      always.forEach((s) => specs.add(s));
      reasons.push(`always run (${ALWAYS_RUN_FILE}): ${list(always)}`);
    }
    const known = new Set(map.specs);
    const unknown = existingSpecs.filter((s) => !known.has(s) && !specs.has(s));
    if (unknown.length) {
      unknown.forEach((s) => specs.add(s));
      reasons.push(`newer than the map: ${list(unknown)}`);
    }
    const partial = live(map.partial ?? []).filter((s) => !specs.has(s));
    if (partial.length) {
      partial.forEach((s) => specs.add(s));
      reasons.push(`partial coverage in the map (a test did not pass when it was built): ${list(partial)}`);
    }
  }
  return { whole: false, specs, reasons, ignored, total, commit: map.commit };
}

/** Lines for --out: `*` for the whole suite, else one spec per line relative to e2e/. */
export function planLines(selection) {
  if (selection.whole) return ['*'];
  return [...selection.specs].sort().map((s) => s.slice('e2e/'.length));
}

export function summary(selection) {
  const from = selection.commit ? ` (map of ${String(selection.commit).slice(0, 9)})` : '';
  const head = selection.whole
    ? `select-mocked-specs: the whole suite, ${selection.total} specs${from}`
    : `select-mocked-specs: ${selection.specs.size}/${selection.total} mocked specs${from}`;
  const out = [head, ...selection.reasons.map((r) => `  ${r}`)];
  if (selection.ignored.length) out.push(`  left out: ${selection.ignored.length} file(s) outside the mocked run`);
  return out;
}

function git(args) {
  return execFileSync('git', args, { cwd: SF_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: sanitizedGitEnv() });
}

// A pre-push must not hang on the network: one minute covers a 50 KB download.
function gh(args) {
  return execFileSync('gh', args, {
    cwd: SF_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...sanitizedGitEnv(), GH_PROMPT_DISABLED: '1' },
  });
}

/** `--map` as given, or the one CI published for develop: { path, label } or { error }. */
export function resolveMap({ mapArg, developRef, find = findCoverageMap }) {
  if (mapArg) return { path: mapArg, label: mapArg };
  const found = find({ git, gh, cacheDir: MAP_CACHE_DIR, developRef });
  if (found.error) return found;
  const age = found.distance === 0 ? 'where this branch left develop' : `${found.distance} merge(s) before where this branch left develop`;
  const label = `develop ${found.sha.slice(0, 9)}, ${age}, ${found.source}`;
  return { path: found.path, label, note: found.note };
}

function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base = arg('--base');
  if (!base) {
    console.error('usage: select-mocked-specs.js --base <ref> [--head <ref>] [--map <map.json>] [--develop <ref>] [--out <file>] [--json]');
    return 2;
  }
  const out = arg('--out');
  // Without a usable map nothing can be narrowed: run everything, never less.
  const whole = (why) => {
    console.log(`select-mocked-specs: the whole suite (${why})`);
    if (out) writeFileSync(out, '*\n');
    return 0;
  };
  const found = resolveMap({ mapArg: arg('--map'), developRef: arg('--develop') ?? 'origin/develop' });
  if (found.error) return whole(`no map: ${found.error}`);
  const text = readOrNull(found.path);
  const map = text == null ? new Error(`cannot read ${found.path}`) : parseMap(text);
  if (map instanceof Error) return whole(`map unusable: ${map.message}`);
  const info = argv.includes('--json') ? console.error : console.log;
  if (found.note) info(`select-mocked-specs: ${found.note}`);
  info(`select-mocked-specs: map of ${found.label}`);
  const head = arg('--head') ?? 'HEAD';
  const changed = changedPaths(git(['diff', '--name-status', '-M', `${base}...${head}`]));
  const files = git(['ls-files']).split('\n').filter(Boolean);
  const cache = new Map();
  const readText = (rel) => {
    if (!cache.has(rel)) cache.set(rel, readOrNull(join(SF_ROOT, rel)));
    return cache.get(rel);
  };
  const alwaysRun = parseAlwaysRun(readText(ALWAYS_RUN_FILE));
  // The diff is three-dot, so a file's "before" is its text at the merge-base.
  const start = git(['merge-base', base, head]).trim();
  const readBaseText = (rel) => {
    try {
      return execFileSync('git', ['show', `${start}:${rel}`], {
        cwd: SF_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], env: sanitizedGitEnv(),
      });
    } catch {
      return null;
    }
  };
  const selection = selectMockedSpecs({ changed, files, readText, readBaseText, map, alwaysRun });
  if (out) writeFileSync(out, planLines(selection).map((l) => `${l}\n`).join(''));
  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      whole: selection.whole, specs: [...selection.specs].sort(), reasons: selection.reasons,
      ignored: selection.ignored, total: selection.total, commit: selection.commit,
    }, null, 2));
  } else {
    summary(selection).forEach((l) => console.log(l));
  }
  return 0;
}

if (isEntryPoint(import.meta.url)) process.exit(main(process.argv.slice(2)));

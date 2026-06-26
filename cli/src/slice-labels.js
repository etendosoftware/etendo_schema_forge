#!/usr/bin/env node
/**
 * slice-labels.js — build-time label slicer (ETP-4300, Approach G).
 *
 * Splits the monolithic locale dictionaries into:
 *   1. Per-window slices: artifacts/<win>/generated/web/<win>/labels.js
 *      — only the field labels that window's contract columns need, both locales,
 *        label-only (no `description`). Rides the window's existing lazy chunk.
 *   2. Shared core:        packages/app-shell-core/src/locales/generated/core.<locale>.json
 *      — the full dictionary minus `fields` (genericLabels/ui/menus/windows/tabs/statuses),
 *        loaded lazily for the active locale only.
 *
 * Pure transform over the committed locale JSONs (NO DB access), so it is safe in
 * offline CI and under `make regen SKIP_EXTRACT=1`.
 *
 * Design: docs/superpowers/specs/2026-06-23-efficient-localization-design.md
 *
 * Usage:
 *   node cli/src/slice-labels.js --window sales-order          # slice one window + emit core
 *   node cli/src/slice-labels.js --all                         # slice every active window + emit core
 *   node cli/src/slice-labels.js --window sales-order --dry-run # preview, write nothing
 *   node cli/src/slice-labels.js --all --check                 # fail if any committed slice/core is stale
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..'); // schema_forge root (cli/src → ../../)

const LOCALES_DIR = join(ROOT, 'packages', 'app-shell-core', 'src', 'locales');
const GENERATED_LOCALES_DIR = join(LOCALES_DIR, 'generated');
const ARTIFACTS_DIR = join(ROOT, 'artifacts');

/**
 * Windows that have a contract but never load as a standalone UI chunk
 * (consumed via fetch by other components). They must NOT get a labels.js,
 * and F18 must not flag them as missing. Mirrors registry.js `apiOnlyWindows`.
 */
const API_ONLY_WINDOWS = new Set([
  'sii-config', 'tbai-config', 'verifactu-config',
  'sii-monitor', 'monitor-verifactu', 'tbai-facturas-enviadas',
]);

// --- Pure helpers (exported for tests) ---

/** sha256 hex of a value, serialized canonically (sorted keys). */
export function sha256(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** JSON.stringify with deterministically sorted object keys. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Collect every AD column referenced by a window's contract, across ALL entities
 * (header/lines is not guaranteed — e.g. `contacts` has 15 entities).
 * @returns {string[]} sorted, de-duplicated column names
 */
export function collectWindowColumns(contract) {
  const entities = contract?.frontendContract?.entities ?? {};
  const cols = new Set();
  for (const entity of Object.values(entities)) {
    for (const field of entity?.fields ?? []) {
      if (field?.column) cols.add(field.column);
    }
  }
  return [...cols].sort();
}

/**
 * Columns that are actually rendered (form or grid). A missing label only hurts
 * the user for these — non-rendered columns (e.g. custom `EM_*` with form/grid
 * false) carry no user-visible label, so they must not trip the F18 warning.
 * @returns {Set<string>}
 */
export function collectRenderedColumns(contract) {
  const entities = contract?.frontendContract?.entities ?? {};
  const cols = new Set();
  for (const entity of Object.values(entities)) {
    for (const field of entity?.fields ?? []) {
      if (field?.column && (field.form || field.grid)) cols.add(field.column);
    }
  }
  return cols;
}

/**
 * Build the per-window label slice: { <locale>: { <column>: <label> } }.
 * Label-only (drops `description`). Columns absent from a locale's `fields`
 * are reported as missing and omitted (caller falls back to the raw AD label).
 * @returns {{ slice: object, missing: Record<string,string[]> }}
 */
export function sliceLabels(columns, dictsByLocale) {
  const slice = {};
  const missing = {};
  for (const [locale, dict] of Object.entries(dictsByLocale)) {
    const fields = dict?.fields ?? {};
    const out = {};
    const miss = [];
    for (const col of columns) {
      const label = fields[col]?.label;
      if (label != null && label !== '') out[col] = label;
      else miss.push(col);
    }
    slice[locale] = out;
    if (miss.length) missing[locale] = miss;
  }
  return { slice, missing };
}

/** Full dictionary minus the `fields` section (drops descriptions with it). */
export function buildCore(dict) {
  const { fields, ...core } = dict; // eslint-disable-line no-unused-vars
  return core;
}

/** Render the generated labels.js module source for a window slice. */
export function labelsModuleSource(slice) {
  return [
    '// AUTO-GENERATED by cli/src/slice-labels.js — do not edit.',
    '// Per-window field-label slice (ETP-4300). One entry per locale, label-only.',
    `export default ${JSON.stringify(slice, null, 2)};`,
    '',
  ].join('\n');
}

/** Checksum binding a window's columns to their label text across locales. */
export function labelsChecksum(columns, slice) {
  return sha256({ columns: [...columns].sort(), slice });
}

// --- IO ---

/** Discover locale codes (e.g. en_US) from top-level *.json in the locales dir. */
export async function loadLocales() {
  const entries = await readdir(LOCALES_DIR, { withFileTypes: true });
  const codes = entries
    .filter(e => e.isFile() && /^[a-z]{2}_[A-Z]{2}\.json$/.test(e.name))
    .map(e => e.name.replace(/\.json$/, ''))
    .sort();
  const dicts = {};
  for (const code of codes) {
    dicts[code] = JSON.parse(await readFile(join(LOCALES_DIR, `${code}.json`), 'utf-8'));
  }
  return { codes, dicts };
}

async function readContract(name) {
  return JSON.parse(await readFile(join(ARTIFACTS_DIR, name, 'contract.json'), 'utf-8'));
}

function windowGeneratedDir(name) {
  return join(ARTIFACTS_DIR, name, 'generated', 'web', name);
}

async function updateManifestChecksum(name, checksum) {
  const manifestPath = join(ARTIFACTS_DIR, name, 'generated', '.manifest.json');
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  } catch {
    // No manifest yet (real-window manifest emitter is the pending P2 patch).
  }
  manifest.labelsChecksum = checksum;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * Slice one window. Returns a summary object. Writes nothing when dryRun.
 */
export async function sliceWindow(name, dicts, { dryRun = false } = {}) {
  const contract = await readContract(name);
  const columns = collectWindowColumns(contract);
  const rendered = collectRenderedColumns(contract);
  const { slice, missing } = sliceLabels(columns, dicts);
  const checksum = labelsChecksum(columns, slice);

  // A missing label only matters for rendered columns — that is the F18 signal.
  const missingRendered = {};
  for (const [locale, cols] of Object.entries(missing)) {
    const hit = cols.filter(c => rendered.has(c));
    if (hit.length) missingRendered[locale] = hit;
  }

  if (!dryRun) {
    const dir = windowGeneratedDir(name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'labels.js'), labelsModuleSource(slice), 'utf-8');
    await updateManifestChecksum(name, checksum);
  }
  return { name, columns: columns.length, missing, missingRendered, checksum, slice };
}

/** Emit core.<locale>.json for every locale. Writes nothing when dryRun. */
export async function emitCore(dicts, { dryRun = false } = {}) {
  const result = {};
  if (!dryRun) await mkdir(GENERATED_LOCALES_DIR, { recursive: true });
  for (const [locale, dict] of Object.entries(dicts)) {
    const core = buildCore(dict);
    const checksum = sha256(core);
    if (!dryRun) {
      await writeFile(
        join(GENERATED_LOCALES_DIR, `core.${locale}.json`),
        JSON.stringify(core, null, 2) + '\n',
        'utf-8',
      );
    }
    result[locale] = { bytes: stableStringify(core).length, checksum };
  }
  return result;
}

/** List window artifact names that have a contract.json (excludes API-only). */
async function listWindows() {
  const entries = await readdir(ARTIFACTS_DIR, { withFileTypes: true });
  const names = [];
  for (const e of entries) {
    if (!e.isDirectory() || API_ONLY_WINDOWS.has(e.name)) continue;
    try {
      await readFile(join(ARTIFACTS_DIR, e.name, 'contract.json'));
      names.push(e.name);
    } catch {
      // no contract → not a window artifact
    }
  }
  return names.sort();
}

// --- CLI ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { window: null, all: false, core: true, dryRun: false, check: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--window' && args[i + 1]) opts.window = args[++i];
    else if (args[i] === '--all') opts.all = true;
    else if (args[i] === '--no-core') opts.core = false;
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--check') { opts.check = true; opts.dryRun = true; }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.window && !opts.all) {
    console.error('Usage: node cli/src/slice-labels.js (--window <name> | --all) [--dry-run] [--check] [--no-core]');
    process.exit(1);
  }

  const { codes, dicts } = await loadLocales();
  console.log(`Locales: ${codes.join(', ')}`);

  const windows = opts.all ? await listWindows() : [opts.window];
  let staleOrMissing = 0;

  for (const name of windows) {
    const r = await sliceWindow(name, dicts, { dryRun: opts.dryRun });
    const missNote = Object.keys(r.missingRendered).length
      ? ` | ⚠ missing rendered label: ${Object.entries(r.missingRendered).map(([l, c]) => `${l}=${c.join('/')}`).join(', ')}`
      : '';
    console.log(`  ${r.name.padEnd(30)} ${String(r.columns).padStart(3)} cols${missNote}`);

    // --check: compare against the committed labels.js (stale detection).
    if (opts.check) {
      let committed = null;
      try { committed = await readFile(join(windowGeneratedDir(name), 'labels.js'), 'utf-8'); } catch {}
      if (committed == null || committed !== labelsModuleSource(r.slice)) {
        console.error(`  ✗ STALE/MISSING slice: ${name}`);
        staleOrMissing++;
      }
    }
  }

  if (opts.core) {
    const core = await emitCore(dicts, { dryRun: opts.dryRun });
    for (const [locale, info] of Object.entries(core)) {
      console.log(`  core.${locale}.json  ~${(info.bytes / 1024).toFixed(0)} KB  ${info.checksum.slice(0, 12)}…`);
    }
  }

  if (opts.dryRun && !opts.check) console.log('\n(dry-run — nothing written)');
  if (opts.check && staleOrMissing) {
    console.error(`\n✗ ${staleOrMissing} window(s) have a stale/missing slice. Run: make regen`);
    process.exit(1);
  }
  if (!opts.dryRun) console.log('\nDone.');
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('slice-labels.js') || process.argv[1].endsWith('slice-labels')
);
if (isMain) {
  main().catch((err) => {
    console.error('slice-labels failed:', err.message);
    process.exit(1);
  });
}

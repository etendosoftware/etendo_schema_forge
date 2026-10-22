#!/usr/bin/env node
/**
 * Cross-repo sync + parity contract for `templates/reports/helpers/*.js`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `templates/` is not part of any published package, so the report helper modules
 * exist as one physical copy per repo:
 *
 *   * `etendo_schema_forge`     — the CANONICAL copy. It is the one the report-server
 *     image ends up carrying (`scripts/assemble-report-server-context.sh` copies this
 *     repo's `templates/` last, on purpose) and the one the browser bundle imports.
 *   * `schema_forge_core`       — a mirrored copy, used when someone runs
 *     `tools/report-server/server.js` from a core checkout (core dev, core tests).
 *
 * They are plain duplicated files with no publish step. They diverged silently once
 * already (ETP-4908 brought core up to date; ETP-5107 later added the HALF_UP
 * rounding to this copy only, so core rendered half-cent amounts a cent lower), and
 * the copies are still not byte-identical on their first line: this repo imports the
 * shared `report-i18n` module from the PUBLISHED CLI package, while core reaches it
 * relatively inside its own tree.
 *
 * This script makes the duplication mechanical:
 *
 *   * `npm`-less, dependency-free, run as `make sync-report-helpers`;
 *   * it rewrites core's copy of every module from the canonical source (that one
 *     import line apart) and regenerates the parity manifest in BOTH repos;
 *   * the manifest is the contract: one canonical sha256 per module, verified by a
 *     test in each repo against its own copy (`parity.json`), plus a cross-repo
 *     comparison in this repo's test whenever the sibling checkout exists.
 *
 * Usage:
 *   node scripts/sync-report-helpers.mjs [--check] [<core-dir>]
 *   node scripts/sync-report-helpers.mjs --relativize-import <dir>
 *   CORE_DIR=<core-dir> make sync-report-helpers
 *
 * `--check` reports what would change without writing anything (exit 1 if pending).
 * `--relativize-import <dir>` rewrites the report-i18n import of the helper modules
 * already under `<dir>` to the relative form — what the report-server build-context
 * assembly calls on the tree it just assembled.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This repo (canonical), resolved from this file — never from `process.cwd()`. */
export const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Repo-relative directory holding the mirrored modules and the manifest. */
export const HELPERS_DIR = 'templates/reports/helpers';

/** The mirrored modules, in a stable order (the manifest's own key order). */
export const HELPER_MODULES = [
  'common.js',
  'jsreport-helpers.js',
  'report-html-helpers.js',
];

/** Name of the parity manifest, committed in both repos with identical bytes. */
export const PARITY_FILE = 'parity.json';

/** Identifier used as this repo's key in the manifest. */
export const CANONICAL_REPO = 'schema_forge';

/** Identifier used as the mirror's key in the manifest. */
export const MIRROR_REPO = 'schema_forge_core';

/**
 * The ONLY difference allowed between the two copies (and therefore the only
 * normalisation applied before hashing): the specifier of the shared
 * `report-i18n` module. This repo imports it from the published CLI package; core,
 * which ships it in `cli/src`, reaches it relatively. Keep both strings in sync with
 * the module's first line when either side moves.
 */
export const IMPORT_LINE = {
  [CANONICAL_REPO]:
    "import { RETURN_LABELS, DOC_TYPE_LABEL_OVERRIDES } from '@etendosoftware/schema-forge-cli/src/report-i18n.js';",
  [MIRROR_REPO]:
    "import { RETURN_LABELS, DOC_TYPE_LABEL_OVERRIDES } from '../../../cli/src/report-i18n.js';",
};

const MANIFEST_DESCRIPTION = [
  'Cross-repo parity contract for templates/reports/helpers/*.js.',
  'The canonical copy lives in etendosoftware/etendo_schema_forge; the schema_forge_core',
  'copy must be identical except for the report-i18n import specifier recorded below.',
  'Regenerate both copies and this file with `make sync-report-helpers` in etendo_schema_forge.',
  'Guarded by tools/app-shell/test/report-template-helpers-contract.test.js (canonical) and',
  'cli/test/report-jsreport-helpers-builder.test.js (mirror).',
].join(' ');

/**
 * CRLF is a checkout artifact, not a content difference: hash line-ending-agnostic text.
 *
 * @param {string} text Raw module source.
 * @returns {string} The same source with `\r\n` collapsed to `\n`.
 */
export function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Reduce any of the two copies to the canonical form: normalise line endings and
 * rewrite the mirror's import specifier back to the canonical one. Applying it to the
 * canonical copy is a no-op.
 *
 * @param {string} text Raw module source of either repo.
 * @returns {string} The same source in canonical form.
 */
export function canonicalize(text) {
  return normalizeNewlines(text).split(IMPORT_LINE[MIRROR_REPO]).join(IMPORT_LINE[CANONICAL_REPO]);
}

/**
 * Rewrite canonical source into the mirror's form (the inverse of `canonicalize`),
 * i.e. the bytes `schema_forge_core` must carry. A module that does not import the
 * shared `report-i18n` module is copied verbatim.
 *
 * @param {string} canonicalText Canonical module source.
 * @returns {string} The mirror's module source.
 */
export function toMirrorSource(canonicalText) {
  return normalizeNewlines(canonicalText).split(IMPORT_LINE[CANONICAL_REPO]).join(IMPORT_LINE[MIRROR_REPO]);
}

/**
 * sha256 of a module's canonical form — the value stored per module in the manifest.
 *
 * @param {string} text Raw module source of either repo.
 * @returns {string} Lower-case hex digest.
 */
export function canonicalDigest(text) {
  return createHash('sha256').update(canonicalize(text), 'utf8').digest('hex');
}

/**
 * Resolve one mirrored module's path inside a checkout.
 *
 * @param {string} dir Checkout root.
 * @param {string} name Module file name, e.g. `report-html-helpers.js`.
 * @returns {string} Absolute path of the module inside the checkout.
 */
export function modulePath(dir, name) {
  return join(dir, HELPERS_DIR, name);
}

/**
 * Resolve the parity manifest's path inside a checkout.
 *
 * @param {string} dir Checkout root.
 * @returns {string} Absolute path of `parity.json` inside the checkout.
 */
export function manifestPath(dir) {
  return join(dir, HELPERS_DIR, PARITY_FILE);
}

/**
 * Build the parity manifest from this repo's canonical modules. The result is what
 * both repos must commit, byte for byte.
 *
 * @returns {object} The manifest object.
 */
export function buildManifest() {
  const sha256 = {};
  for (const name of HELPER_MODULES) {
    sha256[name] = canonicalDigest(readFileSync(modulePath(REPO_ROOT, name), 'utf8'));
  }
  return {
    version: 1,
    description: MANIFEST_DESCRIPTION,
    canonicalRepo: 'etendosoftware/etendo_schema_forge',
    mirrorRepo: 'etendosoftware/schema_forge_core',
    modules: [...HELPER_MODULES],
    importLine: { ...IMPORT_LINE },
    sha256,
  };
}

/**
 * Serialize the manifest to exactly the bytes both repos commit.
 *
 * @param {object} manifest Manifest object, as returned by `buildManifest()`.
 * @returns {string} The manifest's serialized text.
 */
export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Check that a checkout's copy of every module matches the manifest's canonical
 * digest. Used by this repo's tests and reusable by any consumer that has both
 * checkouts.
 *
 * @param {string} dir Checkout root to verify.
 * @param {object} [manifest] Manifest to verify against. Defaults to the one on disk here.
 * @returns {Array<{module: string, actual: string, expected: string}>} Mismatches, empty when in parity.
 */
export function compareWithManifest(dir, manifest = buildManifest()) {
  return HELPER_MODULES.filter((name) => existsSync(modulePath(dir, name)))
    .map((name) => ({
      module: name,
      actual: canonicalDigest(readFileSync(modulePath(dir, name), 'utf8')),
      expected: manifest.sha256[name],
    }))
    .filter(({ actual, expected }) => actual !== expected);
}

/**
 * Rewrite the report-i18n import of every helper module **already present under `dir`**
 * from the canonical specifier to the relative one, in place. Used by the report-server
 * build-context assembly: the assembled tree carries core's `cli/src` next to this
 * repo's `templates/`, i.e. exactly the mirror layout, so the relative specifier is the
 * one that resolves there (the canonical one names a published package the image does
 * not install — the image failed to start for that reason, ETP-4910).
 *
 * Idempotent; a module without the canonical import is left untouched.
 *
 * @param {string} dir Root of the tree to rewrite (the assembled context, e.g.).
 * @returns {string[]} The modules that were rewritten.
 */
export function relativizeImport(dir) {
  const rewritten = [];
  for (const name of HELPER_MODULES) {
    const target = modulePath(dir, name);
    if (!existsSync(target)) continue;
    const current = readFileSync(target, 'utf8');
    const relative = toMirrorSource(current);
    if (relative === current) continue;
    writeFileSync(target, relative);
    rewritten.push(name);
  }
  return rewritten;
}

/**
 * Mirror this repo's helper modules into a schema_forge_core checkout and write the
 * parity manifest into both repos (same bytes).
 *
 * @param {object} options
 * @param {string} options.coreDir Root of the schema_forge_core checkout.
 * @param {boolean} [options.check=false] Report what would change, write nothing.
 * @returns {{changed: boolean, report: string[]}} Whether anything was written, and one line per file.
 * @throws {Error} When `coreDir` is not a schema_forge_core checkout.
 */
export function syncReportHelpers({ coreDir, check = false }) {
  if (!existsSync(join(coreDir, 'cli/src/report-i18n.js'))) {
    throw new Error(
      `${coreDir} does not look like a schema_forge_core checkout (` +
        'cli/src/report-i18n.js is missing). Pass the directory as an argument or set CORE_DIR.',
    );
  }

  const manifestBytes = serializeManifest(buildManifest());
  const report = [];

  for (const name of HELPER_MODULES) {
    const target = modulePath(coreDir, name);
    const content = toMirrorSource(readFileSync(modulePath(REPO_ROOT, name), 'utf8'));
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (!check && current !== content) writeFileSync(target, content);
    report.push(`${current === content ? 'unchanged' : 'updated  '} ${MIRROR_REPO}/${HELPERS_DIR}/${name}`);
  }

  for (const dir of [REPO_ROOT, coreDir]) {
    const target = manifestPath(dir);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (!check && current !== manifestBytes) writeFileSync(target, manifestBytes);
    report.push(`${current === manifestBytes ? 'unchanged' : 'updated  '} ${dir}/${HELPERS_DIR}/${PARITY_FILE}`);
  }

  return { changed: report.some((line) => line.startsWith('updated')), report };
}

/** CLI entry point: `node scripts/sync-report-helpers.mjs [--check] [<core-dir>]`. */
function main(argv) {
  const relativizeAt = argv.indexOf('--relativize-import');
  if (relativizeAt !== -1) {
    const dir = argv[relativizeAt + 1];
    if (!dir) {
      console.error('usage: node scripts/sync-report-helpers.mjs --relativize-import <dir>');
      process.exitCode = 2;
      return;
    }
    const rewritten = relativizeImport(resolve(dir));
    console.log(
      rewritten.length
        ? `relative report-i18n import written for: ${rewritten.join(', ')} (under ${resolve(dir)})`
        : `no helper module under ${resolve(dir)} needed the import rewrite`,
    );
    return;
  }

  const check = argv.includes('--check');
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const coreDir = resolve(positional[0] || process.env.CORE_DIR || join(REPO_ROOT, '..', MIRROR_REPO));

  const { changed, report } = syncReportHelpers({ coreDir, check });
  for (const line of report) console.log(line);

  if (check) {
    if (changed) {
      console.error('\nReport helper copies are OUT OF PARITY. Run `make sync-report-helpers`.');
      process.exitCode = 1;
    } else {
      console.log('\nReport helpers are in parity with the canonical copy.');
    }
    return;
  }
  console.log(changed ? '\nSynced. Commit the change in BOTH repos.' : '\nAlready in parity — nothing to commit.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}

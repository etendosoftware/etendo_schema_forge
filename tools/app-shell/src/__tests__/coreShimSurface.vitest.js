/**
 * ETP-4708 — shim-surface guard for EVERY re-export shim onto
 * `@etendosoftware/app-shell-core`.
 *
 * When a module is promoted to core, a re-export shim is left behind at its
 * original `@/…` path so consumers do not have to change. The failure mode this
 * guards is silent: a shim written as only `export * from '…'` drops the module's
 * `default` export, because `export *` does not forward a default. Consumers
 * importing the default then get `undefined` at runtime with no import error and no
 * test failure anywhere — the core-side unit tests cannot catch it, since they
 * import each module directly rather than through the shim.
 *
 * Scope is deliberately the `default` export and nothing else: per the ES spec
 * `export * from` re-exports every NAMED export by construction, so a named export
 * cannot go missing through a shim. `default` is the only thing that can, which
 * makes it the whole of the invariant rather than a part of it.
 *
 * The shim list is DERIVED, not hand-maintained: every file under `src/` whose
 * entire body is re-export statements pointing at the package is treated as a shim.
 * An earlier version of this test enumerated a fixed list, which quietly scoped it
 * to one ticket's modules and stepped around pre-existing defects in shims created
 * by earlier tickets. Deriving the list is what makes the guard cover the whole
 * class, including shims that do not exist yet.
 *
 * Core is read from source rather than imported: Vite only rewrites statically
 * analyzable specifiers, so a computed `import()` of a package subpath falls
 * through to Node's bare resolver (which knows nothing about the LOCAL_CORE alias),
 * and an absolute path into a sibling checkout is outside the test server's root.
 * Reading the file the exports map points at sidesteps both, and makes a missing
 * `exports` entry fail this test too.
 *
 * Requires the local-core profile, since promoted subpaths only exist in the
 * published package after a preview is cut:
 *   LOCAL_CORE=1 SCHEMA_FORGE_CORE=<core-checkout> npx vitest run src/__tests__/coreShimSurface.vitest.js
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = '@etendosoftware/app-shell-core';

// Locating core the same way vitest.config.js does, so this test and the alias that
// serves the app agree on which checkout is under test.
const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_REPO = process.env.SCHEMA_FORGE_CORE || resolve(HERE, '../../../../../schema_forge_core');
const CORE_PKG_DIR = resolve(CORE_REPO, 'packages/app-shell-core');
const CORE_EXPORTS = JSON.parse(readFileSync(resolve(CORE_PKG_DIR, 'package.json'), 'utf8')).exports;

const SOURCES = import.meta.glob('../**/*.{js,jsx}', { query: '?raw', import: 'default', eager: true });
const LOADERS = import.meta.glob('../**/*.{js,jsx}');

const RE_EXPORT_ALL = new RegExp(`^export \\* from '(${PACKAGE}[^']*)';$`);
const RE_EXPORT_DEFAULT = new RegExp(`^export \\{ default \\} from '(${PACKAGE}[^']*)';$`);

/** Strip comments and blank lines so a file's shape can be judged by its statements. */
function statements(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

/**
 * A shim is a file whose ENTIRE body is re-exports from the core package. Anything
 * carrying logic of its own is a real module that merely imports from core, and its
 * surface is deliberately its own — not a shim, and not this test's business.
 */
function detectShim(source) {
  const lines = statements(source);
  if (lines.length === 0) return null;

  const targets = new Set();
  let forwardsDefault = false;
  for (const line of lines) {
    const all = RE_EXPORT_ALL.exec(line);
    const dflt = RE_EXPORT_DEFAULT.exec(line);
    if (all) targets.add(all[1]);
    else if (dflt) { targets.add(dflt[1]); forwardsDefault = true; }
    else return null;                      // a non-re-export line → not a pure shim
  }
  if (targets.size !== 1) return null;     // fans out to several modules → not a simple shim
  return { target: [...targets][0], forwardsDefault };
}

/** Resolve a package specifier through core's own `exports`, the way Node will post-publish. */
function resolveThroughExports(specifier) {
  const subpath = `.${specifier.slice(PACKAGE.length)}`;
  const direct = CORE_EXPORTS[subpath];
  if (typeof direct === 'string') return resolve(CORE_PKG_DIR, direct);

  // Node picks the pattern with the longest literal prefix before the `*`.
  const patterns = Object.keys(CORE_EXPORTS)
    .filter((k) => k.includes('*'))
    .sort((a, b) => b.indexOf('*') - a.indexOf('*'));
  for (const pattern of patterns) {
    const [head, tail] = pattern.split('*');
    if (subpath.startsWith(head) && subpath.endsWith(tail)) {
      const wildcard = subpath.slice(head.length, subpath.length - (tail.length || 0));
      return resolve(CORE_PKG_DIR, CORE_EXPORTS[pattern].replace('*', wildcard));
    }
  }
  return null;
}

/**
 * Does the core module expose a default? Read from source rather than imported, per
 * the file header. Covers both spellings: a direct `export default …` and the
 * rename form `export { Foo as default }`.
 */
function coreHasDefaultExport(corePath) {
  const source = readFileSync(corePath, 'utf8');
  return statements(source).some(
    (l) => /^export\s+default\b/.test(l) || /^export\s*\{[^}]*\bas\s+default\b/.test(l),
  );
}

const SHIMS = Object.entries(SOURCES)
  .map(([path, source]) => ({ path, ...(detectShim(source) || {}) }))
  .filter((s) => s.target)
  .map((s) => ({ ...s, name: s.path.replace(/^\.\.\//, '') }))
  .sort((a, b) => a.name.localeCompare(b.name));

describe('core re-export shims forward their module\'s default export', () => {
  it('discovers the shims by shape rather than from a fixed list', () => {
    // A derivation that silently matched nothing would make every assertion below
    // vacuous, so assert the discovery itself found a plausible population.
    expect(SHIMS.length).toBeGreaterThan(50);
  });

  it.each(SHIMS.map((s) => [s.name, s]))('%s', async (name, shimInfo) => {
    const corePath = resolveThroughExports(shimInfo.target);
    expect(corePath, `${name}: ${shimInfo.target} has no entry in core's exports map`).toBeTruthy();
    expect(existsSync(corePath), `${name}: core's exports map points at a missing file (${corePath})`).toBe(true);

    if (!coreHasDefaultExport(corePath)) return;   // nothing for `export *` to drop

    const shim = await LOADERS[shimInfo.path]();
    expect(
      Object.keys(shim),
      `${name}: ${shimInfo.target} has a default export but the shim does not forward it — `
        + "`export *` does not re-export a default; add `export { default } from '…'`",
    ).toContain('default');
    expect(shim.default, `${name}: shim forwards a default that resolves to undefined`).toBeDefined();
  });
});

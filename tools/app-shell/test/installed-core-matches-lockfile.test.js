import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync,
} from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5443 guardrail — a stale `node_modules` looks exactly like a broken backend.
 *
 * Francisco hit this while testing the ADR-0001 cookie-session migration: his checkout's
 * installed `@etendosoftware/*` core packages were behind what `package-lock.json` had
 * already moved to, so every readiness check (`/sws/neo/session`, defaults, payment terms)
 * came back 401 — a session/auth symptom with a dependency-drift cause. `npm install`
 * fixed it, but nothing failed loudly beforehand to say the tree was stale.
 *
 * This guard is the loud failure: for every `@etendosoftware/*` package the app-shell (or
 * the root workspace) depends on, the version actually sitting in `node_modules` must
 * equal the version `package-lock.json` resolves to — using the SAME resolution order
 * Node itself would use starting from `tools/app-shell` (walk up through `node_modules`
 * at each ancestor directory until one has the package, or until the repo root is
 * reached). Root-only deps (`schema-forge-cli`, `schema-forge-core`) are still caught by
 * this same walk, since it passes through the repo root on its way up.
 *
 * A `LOCAL_CORE`-linked dev install (docs/repo-topology.md) resolves the package through
 * a symlink into a local `schema_forge_core` checkout — there is no meaningful "version"
 * to compare there, so that case is diagnosed and skipped, not failed.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SHELL_DIR = join(__dirname, '..');
const REPO_ROOT = join(APP_SHELL_DIR, '..', '..');

/**
 * Walks from `startDir` up to (and including) `repoRoot`, returning the first
 * `node_modules/<pkgName>` found — mirroring Node's own module resolution order.
 * A symlinked directory is reported as such rather than followed, so a LOCAL_CORE
 * link is distinguishable from a real published install.
 */
function findInstalled(pkgName, startDir, repoRoot) {
  const parts = pkgName.split('/');
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', ...parts);
    let stat;
    try {
      stat = lstatSync(candidate);
    } catch {
      stat = null;
    }
    if (stat) {
      if (stat.isSymbolicLink()) {
        return { found: true, symlink: true, path: candidate };
      }
      const pkgJsonPath = join(candidate, 'package.json');
      if (existsSync(pkgJsonPath)) {
        const version = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
        return {
          found: true, symlink: false, path: candidate, version,
        };
      }
    }
    if (dir === repoRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { found: false };
}

/**
 * Same walk, applied to `package-lock.json`'s `packages` map (lockfileVersion 3), whose
 * keys are repo-root-relative paths (`"node_modules/@scope/pkg"`,
 * `"tools/app-shell/node_modules/@scope/pkg"`, …). Walking mirrors `findInstalled` so both
 * sides agree on which occurrence of the package is "the relevant" one.
 */
function findLockfileVersion(pkgName, startDir, repoRoot, lockPackages) {
  let dir = startDir;
  for (;;) {
    const rel = relative(repoRoot, dir).split(sep).join('/');
    const key = rel ? `${rel}/node_modules/${pkgName}` : `node_modules/${pkgName}`;
    if (Object.prototype.hasOwnProperty.call(lockPackages, key)) {
      return { found: true, key, version: lockPackages[key].version };
    }
    if (dir === repoRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { found: false };
}

/** Every `@etendosoftware/*` name declared anywhere the app-shell tree could see it. */
function collectEtendoDeps(repoRoot, appShellDir) {
  const names = new Set();
  for (const pkgJsonPath of [join(repoRoot, 'package.json'), join(appShellDir, 'package.json')]) {
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    for (const section of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(pkg[section] || {})) {
        if (name.startsWith('@etendosoftware/')) names.add(name);
      }
    }
  }
  return [...names].sort();
}

describe('installed @etendosoftware/* core matches package-lock.json (ETP-5443)', () => {
  const lockfile = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'));
  const lockPackages = lockfile.packages || {};
  const deps = collectEtendoDeps(REPO_ROOT, APP_SHELL_DIR);

  it('found at least one @etendosoftware/* dependency to check', () => {
    // A guard that silently checks zero packages is a guard that silently checks nothing —
    // if this ever trips, either the dependency section moved or got renamed upstream.
    assert.ok(deps.length > 0, 'expected root/app-shell package.json to declare @etendosoftware/* deps');
  });

  for (const pkgName of deps) {
    it(`${pkgName}: node_modules version matches package-lock.json`, (t) => {
      const installed = findInstalled(pkgName, APP_SHELL_DIR, REPO_ROOT);
      assert.ok(
        installed.found,
        `${pkgName} is declared as a dependency but is not installed anywhere under `
        + `node_modules (walked from ${relative(REPO_ROOT, APP_SHELL_DIR)} up to the repo root) `
        + '— run `npm install`.',
      );

      if (installed.symlink) {
        t.skip(
          `${pkgName} resolves through a symlink at ${relative(REPO_ROOT, installed.path)} — `
          + 'this looks like a LOCAL_CORE-linked dev install into a local schema_forge_core '
          + 'checkout (see docs/repo-topology.md), which has no lockfile-comparable version. '
          + 'Skipping the version check for this package.',
        );
        return;
      }

      const locked = findLockfileVersion(pkgName, APP_SHELL_DIR, REPO_ROOT, lockPackages);
      assert.ok(
        locked.found,
        `${pkgName} is installed (${installed.version}) but package-lock.json has no matching `
        + 'entry for it — the lockfile and node_modules have diverged; run `npm install`.',
      );

      assert.equal(
        installed.version,
        locked.version,
        `${pkgName}: installed node_modules has ${installed.version}, but package-lock.json wants `
        + `${locked.version} — run \`npm install\` to sync your local dependencies. This is exactly `
        + 'the drift that made every readiness check (session, defaults, payment terms) answer 401 '
        + 'during ETP-5443 manual testing: a stale core package looks like a broken backend.',
      );
    });
  }
});

describe('installed-core-matches-lockfile guard behavior (proven with a synthetic fixture)', () => {
  // These tests never touch the real repo's node_modules or package-lock.json — they build a
  // throwaway fixture tree so the RED/GREEN/LOCAL_CORE cases are provable without risking the
  // real checkout. Each fixture is removed in a `finally`, so a failed assertion still cleans up.
  function makeFixture({ lockedVersion, installedVersion, symlinkInstall = false }) {
    const root = mkdtempSync(join(tmpdir(), 'installed-core-fixture-'));
    const appDir = join(root, 'tools', 'app-shell');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/@acme/widget': { version: lockedVersion },
      },
    }));

    const pkgDir = join(root, 'node_modules', '@acme', 'widget');
    mkdirSync(pkgDir, { recursive: true });
    if (symlinkInstall) {
      rmSync(pkgDir, { recursive: true, force: true });
      const localCoreCheckout = join(root, 'local-core-checkout');
      mkdirSync(localCoreCheckout, { recursive: true });
      writeFileSync(join(localCoreCheckout, 'package.json'), JSON.stringify({ version: installedVersion }));
      mkdirSync(dirname(pkgDir), { recursive: true });
      symlinkSync(localCoreCheckout, pkgDir, 'dir');
    } else {
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version: installedVersion }));
    }
    return { root, appDir };
  }

  it('RED — reproduces the ETP-5443 bug: a stale node_modules is flagged, not silently trusted', () => {
    const { root, appDir } = makeFixture({ lockedVersion: '2.0.0', installedVersion: '1.0.0' });
    try {
      const installed = findInstalled('@acme/widget', appDir, root);
      const lockPackages = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages;
      const locked = findLockfileVersion('@acme/widget', appDir, root, lockPackages);
      assert.equal(installed.version, '1.0.0');
      assert.equal(locked.version, '2.0.0');
      assert.notEqual(installed.version, locked.version, 'fixture must reproduce the mismatch this guard exists to catch');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('GREEN — a synced node_modules matches package-lock.json', () => {
    const { root, appDir } = makeFixture({ lockedVersion: '2.0.0', installedVersion: '2.0.0' });
    try {
      const installed = findInstalled('@acme/widget', appDir, root);
      const lockPackages = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages;
      const locked = findLockfileVersion('@acme/widget', appDir, root, lockPackages);
      assert.equal(installed.version, locked.version);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('LOCAL_CORE — a symlinked install is diagnosed, never compared as a version mismatch', () => {
    const { root, appDir } = makeFixture({ lockedVersion: '2.0.0', installedVersion: '9.9.9', symlinkInstall: true });
    try {
      const installed = findInstalled('@acme/widget', appDir, root);
      assert.equal(installed.found, true);
      assert.equal(installed.symlink, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

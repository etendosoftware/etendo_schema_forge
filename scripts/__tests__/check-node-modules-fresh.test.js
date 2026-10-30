// @covers scripts/check-node-modules-fresh.js
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-node-modules-fresh.js');

describe('check-node-modules-fresh.js', () => {
  let root;
  const write = (rel, packages) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), JSON.stringify({ packages }));
  };
  const run = () => spawnSync('node', [SCRIPT, root], { encoding: 'utf8' });
  const LOCK = {
    '': {},
    'node_modules/core': { version: '0.3.75' },
    'node_modules/fsevents': { version: '2.0.0', optional: true },
  };

  before(() => { root = mkdtempSync(join(tmpdir(), 'nm-fresh-')); });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('is stale when node_modules does not exist', () => {
    write('package-lock.json', LOCK);
    assert.equal(run().status, 1);
  });

  it('is stale when an installed version is older than the lockfile', () => {
    write('node_modules/.package-lock.json', { 'node_modules/core': { version: '0.3.74' } });
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /installed 0\.3\.74, lockfile 0\.3\.75/);
  });

  it('is stale when a required locked package is not installed', () => {
    write('node_modules/.package-lock.json', {});
    assert.match(run().stdout, /not installed/);
  });

  it('is fresh when versions match, ignoring uninstalled optional packages', () => {
    write('node_modules/.package-lock.json', { 'node_modules/core': { version: '0.3.75' } });
    assert.equal(run().status, 0);
  });
});

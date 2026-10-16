// @covers scripts/test-changed.sh
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-changed.sh');

describe('test-changed.sh before any test runs', () => {
  let root;
  const run = () => spawnSync('bash', [join(root, 'scripts', 'test-changed.sh')], { encoding: 'utf8' });

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'test-changed-'));
    mkdirSync(join(root, 'scripts'));
    copyFileSync(SCRIPT, join(root, 'scripts', 'test-changed.sh'));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('asks for npm ci at the root when the root dependencies are missing', () => {
    const out = run();
    assert.equal(out.status, 2);
    assert.match(out.stderr, /node_modules\/@etendosoftware\/schema-forge-cli is missing\. Run 'npm ci' at the repository root/);
  });

  it('names vitest when only the test runner is missing', () => {
    mkdirSync(join(root, 'node_modules', '@etendosoftware', 'schema-forge-cli'), { recursive: true });
    const out = run();
    assert.equal(out.status, 2);
    assert.match(out.stderr, /test-changed: vitest is missing/);
  });

  it('accepts vitest hoisted to the root by the npm workspaces, as npm ci installs it', () => {
    mkdirSync(join(root, 'node_modules', 'vitest'), { recursive: true });
    const out = run();
    assert.doesNotMatch(out.stderr, /is missing/);
  });
});

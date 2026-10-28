// @covers scripts/e2e-coverage-map.mjs
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMap, main } from '../e2e-coverage-map.mjs';
import { parseMap } from '../select-mocked-specs.js';

const A = 'e2e/tests/flows/sales/orders.mocked.spec.js';
const B = 'e2e/tests/flows/sales/invoices.mocked.spec.js';

describe('buildMap', () => {
  it('folds per-test results into file → specs, each spec once and both sides sorted', () => {
    const map = buildMap([
      { spec: B, files: ['tools/app-shell/src/List.jsx', 'tools/app-shell/src/App.jsx'] },
      { spec: A, files: ['tools/app-shell/src/List.jsx'] },
      { spec: A, files: ['tools/app-shell/src/List.jsx', 'artifacts/orders/generated/Orders.jsx'] },
    ], { commit: 'abc' });
    assert.deepEqual(map, {
      commit: 'abc',
      specs: [B, A],
      files: {
        'artifacts/orders/generated/Orders.jsx': [A],
        'tools/app-shell/src/App.jsx': [B],
        'tools/app-shell/src/List.jsx': [B, A],
      },
    });
  });

  it('keeps the core package but drops other third-party code', () => {
    const map = buildMap([{ spec: A, files: [
      'node_modules/react-dom/cjs/react-dom.production.js',
      'tools/app-shell/node_modules/@etendosoftware/app-shell-core/src/auth.js',
    ] }]);
    assert.deepEqual(Object.keys(map.files), ['tools/app-shell/node_modules/@etendosoftware/app-shell-core/src/auth.js']);
    assert.equal(map.commit, null);
  });
});

describe('main', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-map-build-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const quiet = (fn) => {
    const { log, error } = console;
    console.log = () => {};
    console.error = () => {};
    try {
      return fn();
    } finally {
      Object.assign(console, { log, error });
    }
  };

  it('writes a map the selector reads, carrying the commit it was built on', () => {
    const dir = join(root, 'coverage');
    mkdirSync(dir);
    writeFileSync(join(dir, 'test-1.json'), JSON.stringify({ spec: A, title: 't', files: ['tools/app-shell/src/List.jsx'] }));
    writeFileSync(join(dir, 'notes.txt'), 'not a result');
    const out = join(root, 'map.json');
    assert.equal(quiet(() => main(['build', dir, out, '--commit', 'deadbeef'])), 0);
    const map = parseMap(readFileSync(out, 'utf8'));
    assert.equal(map.commit, 'deadbeef');
    assert.deepEqual(map.specs, [A]);
  });

  it('fails instead of writing an empty map when there are no coverage files', () => {
    const empty = join(root, 'empty');
    mkdirSync(empty);
    assert.equal(quiet(() => main(['build', empty, join(root, 'none.json')])), 1);
    assert.equal(quiet(() => main(['build', join(root, 'missing'), join(root, 'none.json')])), 1);
  });

  it('exits 2 on a wrong command line', () => {
    assert.equal(quiet(() => main(['select', 'a', 'b'])), 2);
    assert.equal(quiet(() => main(['build'])), 2);
  });
});

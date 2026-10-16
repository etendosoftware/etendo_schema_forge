// @covers e2e/support/test-cell.mjs
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CELLS, cellProblems, playwrightArgs } from '../../e2e/support/test-cell.mjs';

const tmpDirs = [];
after(() => tmpDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A throwaway tests/flows tree with the given folders and loose files. */
function flowsTree({ folders = [], files = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'flows-'));
  tmpDirs.push(dir);
  folders.forEach((folder) => mkdirSync(join(dir, folder)));
  files.forEach((file) => writeFileSync(join(dir, file), ''));
  return dir;
}

describe('cellProblems', () => {
  it('accepts the real tests/flows tree: every spec belongs to a cell', () => {
    assert.deepEqual(cellProblems(), []);
  });

  it('reports a spec left loose in tests/flows', () => {
    const dir = flowsTree({ folders: ['sales'], files: ['loose.mocked.spec.js'] });
    assert.deepEqual(cellProblems(dir, { ventas: ['sales'] }), [
      'tests/flows/loose.mocked.spec.js is not inside a cell folder',
    ]);
  });

  it('reports a folder that no cell owns', () => {
    const dir = flowsTree({ folders: ['sales', 'shipping'] });
    const problems = cellProblems(dir, { ventas: ['sales'] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /tests\/flows\/shipping\/ does not belong to any cell/);
  });
});

describe('playwrightArgs', () => {
  it('runs every folder of the cell on both mocked projects for mock', () => {
    assert.deepEqual(playwrightArgs('almacenes', 'mock'), [
      'playwright', 'test', 'tests/flows/inventory/', 'tests/flows/products/',
      '--project=mocked', '--project=mocked-serial',
    ]);
  });

  it('runs only the integration project for integration and passes extra arguments through', () => {
    assert.deepEqual(playwrightArgs('financiero', 'integration', ['--list']), [
      'playwright', 'test', 'tests/flows/finance/', '--project=integration', '--list',
    ]);
  });

  it('includes the folder shared by ventas and compras in both cells', () => {
    assert.ok(CELLS.ventas.includes('sales-purchases'));
    assert.ok(CELLS.compras.includes('sales-purchases'));
  });

  it('runs every folder when the cell is all', () => {
    assert.deepEqual(playwrightArgs('all', 'all'), [
      'playwright', 'test', '--project=mocked', '--project=mocked-serial', '--project=integration',
    ]);
  });

  it('rejects an unknown cell or kind', () => {
    assert.throws(() => playwrightArgs('logistica'), /Unknown cell "logistica"/);
    assert.throws(() => playwrightArgs('ventas', 'smoke'), /Unknown kind "smoke"/);
  });
});

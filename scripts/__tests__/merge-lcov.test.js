import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeLcovFiles } from '../merge-lcov.js';

test('mergeLcovFiles combines duplicate source-file records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-lcov-'));
  const first = join(dir, 'first.info');
  const second = join(dir, 'second.info');

  writeFileSync(
    first,
    [
      'TN:',
      'SF:src/example.js',
      'FN:1,load',
      'FNDA:1,load',
      'FNF:1',
      'FNH:1',
      'DA:1,1',
      'DA:2,0',
      'LF:2',
      'LH:1',
      'end_of_record',
      '',
    ].join('\n'),
  );
  writeFileSync(
    second,
    [
      'TN:',
      'SF:src/example.js',
      'FN:1,load',
      'FNDA:2,load',
      'FNF:1',
      'FNH:1',
      'DA:1,2',
      'DA:2,3',
      'LF:2',
      'LH:2',
      'end_of_record',
      '',
    ].join('\n'),
  );

  const merged = mergeLcovFiles([first, second]);

  assert.match(merged, /SF:src\/example\.js/);
  assert.match(merged, /FNDA:3,load/);
  assert.match(merged, /DA:1,3/);
  assert.match(merged, /DA:2,3/);
  assert.match(merged, /LF:2/);
  assert.match(merged, /LH:2/);
  assert.equal((merged.match(/SF:src\/example\.js/g) || []).length, 1);
});

// ETP-4756: `node --test --experimental-test-coverage` emits a DA:/FN:/BRDA: entry for every
// line/function/branch in the file, including comments and blank lines — inflating the
// denominator with phantom "uncoverable" entries once merged with a real report. vitest's
// v8 coverage only emits entries for what's actually instrumentable, so once a file has a
// vitest-sourced report, it must be treated as ground truth and node-only entries dropped.
test('mergeLcovFiles drops node-only phantom lines/functions/branches once a vitest report covers the same file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-lcov-'));
  const nodeReport = join(dir, 'appshell-lcov.info');
  const vitestReport = join(dir, 'vitest-lcov.info');

  writeFileSync(
    nodeReport,
    [
      'TN:',
      'SF:src/example.js',
      'FN:1,load',
      'FN:3,phantomFn',
      'FNDA:1,load',
      'FNDA:0,phantomFn',
      'FNF:2',
      'FNH:1',
      'BRDA:1,0,0,1',
      'BRDA:3,0,0,0',
      'BRF:2',
      'BRH:1',
      'DA:1,1',
      'DA:2,0',
      'DA:3,0',
      'LF:3',
      'LH:1',
      'end_of_record',
      '',
    ].join('\n'),
  );
  writeFileSync(
    vitestReport,
    [
      'TN:',
      'SF:src/example.js',
      'FN:1,load',
      'FNDA:2,load',
      'FNF:1',
      'FNH:1',
      'BRDA:1,0,0,2',
      'BRF:1',
      'BRH:1',
      'DA:1,2',
      'DA:2,1',
      'LF:2',
      'LH:2',
      'end_of_record',
      '',
    ].join('\n'),
  );

  const merged = mergeLcovFiles([nodeReport, vitestReport]);

  // Real lines/function/branch: hits summed across both reports.
  assert.match(merged, /DA:1,3/);
  assert.match(merged, /DA:2,1/);
  assert.match(merged, /FNDA:3,load/);
  assert.match(merged, /BRDA:1,0,0,3/);

  // Phantom entries (present only in the node report, not in vitest's) are dropped entirely.
  assert.doesNotMatch(merged, /^DA:3,/m);
  assert.doesNotMatch(merged, /phantomFn/);
  assert.doesNotMatch(merged, /^BRDA:3,/m);

  // Denominators reflect vitest's set (2 lines, 1 function, 1 branch), not the 3/2/2 union.
  assert.match(merged, /LF:2/);
  assert.match(merged, /LH:2/);
  assert.match(merged, /FNF:1/);
  assert.match(merged, /FNH:1/);
  assert.match(merged, /BRF:1/);
  assert.match(merged, /BRH:1/);
});

test('mergeLcovFiles keeps the union of lines when no vitest report covers the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-lcov-'));
  const first = join(dir, 'cli-lcov.info');
  const second = join(dir, 'artifacts-lcov.info');

  writeFileSync(
    first,
    ['TN:', 'SF:src/only-node.js', 'DA:1,1', 'DA:2,0', 'LF:2', 'LH:1', 'end_of_record', ''].join('\n'),
  );
  writeFileSync(
    second,
    ['TN:', 'SF:src/only-node.js', 'DA:3,1', 'LF:1', 'LH:1', 'end_of_record', ''].join('\n'),
  );

  const merged = mergeLcovFiles([first, second]);

  // No vitest source touched this file, so nothing gets filtered out — same behavior as before.
  assert.match(merged, /DA:1,1/);
  assert.match(merged, /DA:2,0/);
  assert.match(merged, /DA:3,1/);
  assert.match(merged, /LF:3/);
  assert.match(merged, /LH:2/);
});

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

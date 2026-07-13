import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { SHARED_LABEL_COLUMNS } from '../src/shared-label-columns.js';

describe('SHARED_LABEL_COLUMNS', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(SHARED_LABEL_COLUMNS));
    assert.ok(SHARED_LABEL_COLUMNS.length > 0);
  });

  it('contains only non-empty strings', () => {
    for (const col of SHARED_LABEL_COLUMNS) {
      assert.equal(typeof col, 'string', `expected string, got ${typeof col}`);
      assert.ok(col.trim().length > 0, 'column name must be non-empty');
    }
  });

  it('has no duplicate entries', () => {
    assert.equal(
      new Set(SHARED_LABEL_COLUMNS).size,
      SHARED_LABEL_COLUMNS.length,
      'SHARED_LABEL_COLUMNS must not contain duplicates',
    );
  });
});

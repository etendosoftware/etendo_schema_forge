import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRangeCopySuffix, RANGE_COPY_SUFFIX } from '../dashboardRangeCopy.js';

describe('resolveRangeCopySuffix (ETP-5493)', () => {
  it('maps every known range to its own suffix', () => {
    assert.equal(resolveRangeCopySuffix('ytd'), 'Ytd');
    assert.equal(resolveRangeCopySuffix('mtd'), 'Mtd');
    assert.equal(resolveRangeCopySuffix('last30d'), 'Last30d');
    assert.equal(resolveRangeCopySuffix('last90d'), 'Last90d');
    assert.equal(resolveRangeCopySuffix('lastYear'), 'LastYear');
    assert.deepEqual(Object.keys(RANGE_COPY_SUFFIX).sort(), ['last30d', 'last90d', 'lastYear', 'mtd', 'ytd']);
  });

  it('ignores surrounding whitespace on a known range', () => {
    assert.equal(resolveRangeCopySuffix('  mtd '), 'Mtd');
  });

  it('returns the default Ytd for a missing or blank range', () => {
    for (const v of [undefined, null, '', '   ', 42]) {
      assert.equal(resolveRangeCopySuffix(v), 'Ytd');
    }
  });

  it('returns the caller-provided suffix for a missing range', () => {
    assert.equal(resolveRangeCopySuffix(undefined, 'LastYear'), 'LastYear');
    assert.equal(resolveRangeCopySuffix('', 'Mtd'), 'Mtd');
  });

  it('resolves an unknown range to LastYear, ignoring the missing suffix', () => {
    assert.equal(resolveRangeCopySuffix('decade'), 'LastYear');
    assert.equal(resolveRangeCopySuffix('decade', 'Mtd'), 'LastYear');
  });
});

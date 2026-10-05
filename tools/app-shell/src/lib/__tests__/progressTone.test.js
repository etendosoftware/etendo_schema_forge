import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getProgressTone } from '../progressTone.js';

describe('getProgressTone', () => {
  it('returns success at 100%', () => {
    assert.equal(getProgressTone(1), 'success');
  });

  it('returns success when fractional rounding lands within FULL_THRESHOLD', () => {
    assert.equal(getProgressTone(0.9995), 'success');
  });

  it('returns neutral (not warning) between 0 and the success threshold', () => {
    assert.equal(getProgressTone(0.5), 'neutral');
    assert.equal(getProgressTone(0.99), 'neutral');
    assert.equal(getProgressTone(0.01), 'neutral');
  });

  it('returns neutral at 0%', () => {
    assert.equal(getProgressTone(0), 'neutral');
  });

  it('returns neutral for non-finite inputs (NaN from divide-by-zero)', () => {
    assert.equal(getProgressTone(NaN), 'neutral');
    assert.equal(getProgressTone(Infinity), 'neutral');
    assert.equal(getProgressTone(undefined), 'neutral');
    assert.equal(getProgressTone(null), 'neutral');
  });

  it('returns neutral for negative inputs (defensive)', () => {
    assert.equal(getProgressTone(-0.1), 'neutral');
  });
});

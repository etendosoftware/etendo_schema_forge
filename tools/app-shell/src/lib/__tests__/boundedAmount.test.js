// @covers tools/app-shell/src/lib/boundedAmount.js
//
// The amount rules shared by the line grid's in-place cell (InlineLinesPanel `editInPlace`) and
// the document picker: not empty, not 0, the sign of the bound, and no larger than it in magnitude,
// with a half-cent tolerance. They mirror what the backend refuses.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDED_AMOUNT_ERRORS, sameAmount, validateBoundedAmount } from '../boundedAmount.js';

const errorOf = (raw, max) => validateBoundedAmount(raw, max).error;

describe('validateBoundedAmount', () => {
  it('exposes the four refusal keys', () => {
    assert.deepEqual({ ...BOUNDED_AMOUNT_ERRORS }, {
      required: 'boundedAmountRequired',
      zero: 'boundedAmountZero',
      signMismatch: 'boundedAmountSignMismatch',
      exceedsMax: 'boundedAmountExceedsMax',
    });
    assert.ok(Object.isFrozen(BOUNDED_AMOUNT_ERRORS));
  });

  it('refuses an empty, missing or unparseable value as required', () => {
    for (const raw of ['', null, undefined, 'abc']) {
      assert.deepEqual(validateBoundedAmount(raw, 100), { value: null, error: 'boundedAmountRequired' }, String(raw));
    }
  });

  it('refuses 0 and anything under half a cent', () => {
    assert.deepEqual(validateBoundedAmount('0', 100), { value: 0, error: 'boundedAmountZero' });
    assert.equal(errorOf(0, 100), 'boundedAmountZero');
    assert.equal(errorOf('0.004', 100), 'boundedAmountZero');
    assert.equal(errorOf('-0.004', 100), 'boundedAmountZero');
    assert.equal(errorOf('0.01', 100), null);
  });

  it('refuses a sign different from the bound’s', () => {
    assert.equal(errorOf('-5', 100), 'boundedAmountSignMismatch');
    assert.equal(errorOf('5', -100), 'boundedAmountSignMismatch');
    assert.equal(errorOf('-5', -100), null);
  });

  it('refuses a magnitude over the bound’s', () => {
    assert.deepEqual(validateBoundedAmount('100.01', 100), { value: 100.01, error: 'boundedAmountExceedsMax' });
    assert.equal(errorOf('-100.01', -100), 'boundedAmountExceedsMax');
  });

  it('accepts exactly the bound', () => {
    assert.deepEqual(validateBoundedAmount('100', 100), { value: 100, error: null });
    assert.equal(errorOf('-100', -100), null);
    assert.equal(errorOf(100, '100.00'), null);
  });

  it('tolerates a typed amount within half a cent of a float bound', () => {
    // A stored 99.999999… from a float sum must not refuse the 100,00 the user sees.
    assert.equal(errorOf('100', 99.996), null);
    assert.equal(errorOf('100.004', 100), null);
    assert.equal(errorOf('100.01', 100), 'boundedAmountExceedsMax');
  });

  it('accepts any non-zero amount, of either sign, without a bound', () => {
    for (const max of [undefined, null, '', 'n/a', 0, '0.001']) {
      assert.equal(errorOf('123456.78', max), null, String(max));
      assert.equal(errorOf('-5', max), null, String(max));
      assert.equal(errorOf('0', max), 'boundedAmountZero', String(max));
    }
  });

  it('returns the parsed value with every outcome that parsed', () => {
    assert.equal(validateBoundedAmount('42.5', 100).value, 42.5);
    assert.equal(validateBoundedAmount('500', 100).value, 500);
    assert.equal(validateBoundedAmount(-3, 100).value, -3);
  });
});

describe('sameAmount', () => {
  it('is true to the cent, across numbers and strings', () => {
    assert.equal(sameAmount(100, '100.00'), true);
    assert.equal(sameAmount('10.5', 10.504), true);
    assert.equal(sameAmount(10.5, 10.51), false);
    assert.equal(sameAmount(-1, 1), false);
  });

  it('two missing values are equal; one missing one is not', () => {
    assert.equal(sameAmount(null, undefined), true);
    assert.equal(sameAmount('', null), true);
    assert.equal(sameAmount(null, 0), false);
    assert.equal(sameAmount('5', ''), false);
  });
});

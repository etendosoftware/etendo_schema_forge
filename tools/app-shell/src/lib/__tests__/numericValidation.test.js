import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getNumericFieldError, numericFieldToastId } from '../numericValidation.js';

// Pure, declarative numeric validation (min / integer) shared by EntityForm's
// on-blur feedback and useEntity's save-block gate. ETP-4542.
// The helper returns a `{ key, params }` descriptor (or null) so callers can
// interpolate the i18n message via `ui(key, params)`.
describe('getNumericFieldError', () => {
  it('returns null for an empty string (required handles emptiness, not this helper)', () => {
    assert.equal(getNumericFieldError({ min: 1, integer: true }, ''), null);
  });

  it('returns null for null / undefined', () => {
    assert.equal(getNumericFieldError({ min: 1, integer: true }, null), null);
    assert.equal(getNumericFieldError({ min: 1, integer: true }, undefined), null);
  });

  it('flags a value below min with fieldMinValueError and the min param', () => {
    assert.deepEqual(getNumericFieldError({ min: 1 }, 0), { key: 'fieldMinValueError', params: { min: 1 } });
    assert.deepEqual(getNumericFieldError({ min: 1 }, -3), { key: 'fieldMinValueError', params: { min: 1 } });
    assert.deepEqual(getNumericFieldError({ min: 1 }, '0'), { key: 'fieldMinValueError', params: { min: 1 } });
  });

  it('carries the declared min in the params so the message interpolates {min}', () => {
    // min:1 → "at least 1"
    assert.deepEqual(getNumericFieldError({ min: 1 }, 0), { key: 'fieldMinValueError', params: { min: 1 } });
    // min:0 → "at least 0" (0 is not negative — the whole reason this bug was filed)
    assert.deepEqual(getNumericFieldError({ min: 0 }, -1), { key: 'fieldMinValueError', params: { min: 0 } });
    // min:5 → "at least 5"
    assert.deepEqual(getNumericFieldError({ min: 5 }, 4), { key: 'fieldMinValueError', params: { min: 5 } });
  });

  it('accepts a value equal to or above min', () => {
    assert.equal(getNumericFieldError({ min: 1 }, 1), null);
    assert.equal(getNumericFieldError({ min: 1 }, 12), null);
  });

  it('flags a decimal with fieldIntegerError (no params) when integer:true', () => {
    assert.deepEqual(getNumericFieldError({ integer: true }, 5.5), { key: 'fieldIntegerError', params: {} });
    assert.deepEqual(getNumericFieldError({ integer: true }, '2.5'), { key: 'fieldIntegerError', params: {} });
  });

  it('accepts a whole number when integer:true', () => {
    assert.equal(getNumericFieldError({ integer: true }, 5), null);
    assert.equal(getNumericFieldError({ integer: true }, '10'), null);
  });

  it('DEFAULT (no integer flag) accepts decimals — backwards-compatible', () => {
    assert.equal(getNumericFieldError({}, 2.5), null);
    assert.equal(getNumericFieldError({ min: 0 }, 2.5), null);
    assert.equal(getNumericFieldError({ integer: false }, 2.5), null);
  });

  it('is a no-op for a field with neither min nor integer', () => {
    assert.equal(getNumericFieldError({}, -100), null);
    assert.equal(getNumericFieldError(undefined, 3.14), null);
  });

  it('reports min BEFORE integer when both fail (first failing key)', () => {
    // 0.5 is both below min:1 and non-integer — min is checked first.
    assert.deepEqual(getNumericFieldError({ min: 1, integer: true }, 0.5), { key: 'fieldMinValueError', params: { min: 1 } });
  });

  it('treats a non-numeric value as an integer violation only when integer:true', () => {
    assert.deepEqual(getNumericFieldError({ integer: true }, 'abc'), { key: 'fieldIntegerError', params: {} });
    assert.equal(getNumericFieldError({ min: 1 }, 'abc'), null);
  });

  it('covers the Assets usableLife contract (min 1, integer)', () => {
    const usableLife = { min: 1, integer: true };
    assert.equal(getNumericFieldError(usableLife, 12), null);
    assert.deepEqual(getNumericFieldError(usableLife, 0), { key: 'fieldMinValueError', params: { min: 1 } });
    assert.deepEqual(getNumericFieldError(usableLife, -1), { key: 'fieldMinValueError', params: { min: 1 } });
    assert.deepEqual(getNumericFieldError(usableLife, 5.5), { key: 'fieldIntegerError', params: {} });
  });
});

// Shared sonner toast `id` for a numeric-field violation. Both EntityForm's
// on-blur toast and useEntity's save-gate toast pass this SAME derived id for
// the SAME field key, so a click on "Save" without leaving the input first
// (blur fires just before onClick) dedupes into one visible toast instead of
// stacking two identical ones. ETP-4542, bug 2/3.
describe('numericFieldToastId', () => {
  it('derives a stable id from the field key', () => {
    assert.equal(numericFieldToastId('usableLifeMonths'), 'numeric-field-usableLifeMonths');
  });

  it('produces the SAME id for the SAME key on repeated calls (the dedup contract)', () => {
    assert.equal(numericFieldToastId('qty'), numericFieldToastId('qty'));
  });

  it('produces DIFFERENT ids for different keys (no cross-field dedup)', () => {
    assert.notEqual(numericFieldToastId('qty'), numericFieldToastId('rate'));
  });
});

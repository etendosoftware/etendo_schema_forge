import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getNumericFieldError, numericFieldToastId,
  trackSaveBlockToast, dismissSaveBlockToasts, resetSaveBlockToastTracking,
} from '../numericValidation.js';

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

// ETP-5002 — save-blocking toast bookkeeping. ETP-4830 gave the success toast a FIXED id,
// which sonner applies as an in-place UPDATE rather than a front insert, so a newer error
// toast keeps `data-front` and the user who just fixed the value still sees the error.
// The success path therefore has to retire the errors it supersedes.
describe('save-block toast tracking', () => {
  it('dismisses exactly the tracked ids, once each', () => {
    resetSaveBlockToastTracking();
    trackSaveBlockToast('numeric-field-usableLifeMonths');
    trackSaveBlockToast('numeric-field-annualDepreciation');

    const dismissed = [];
    dismissSaveBlockToasts(id => dismissed.push(id));

    assert.deepEqual(dismissed.sort(), [
      'numeric-field-annualDepreciation',
      'numeric-field-usableLifeMonths',
    ]);
  });

  it('clears its set, so a second success does not re-dismiss stale ids', () => {
    resetSaveBlockToastTracking();
    trackSaveBlockToast('numeric-field-x');
    dismissSaveBlockToasts(() => {});

    const dismissed = [];
    dismissSaveBlockToasts(id => dismissed.push(id));
    assert.deepEqual(dismissed, [], 'a cleared set must not dismiss anything again');
  });

  it('dedupes a repeatedly-raised toast for the same field', () => {
    resetSaveBlockToastTracking();
    trackSaveBlockToast('numeric-field-usableLifeMonths');
    trackSaveBlockToast('numeric-field-usableLifeMonths');

    const dismissed = [];
    dismissSaveBlockToasts(id => dismissed.push(id));
    assert.deepEqual(dismissed, ['numeric-field-usableLifeMonths']);
  });

  it('ignores a falsy id rather than tracking an untargetable toast', () => {
    resetSaveBlockToastTracking();
    trackSaveBlockToast(undefined);
    trackSaveBlockToast('');

    const dismissed = [];
    dismissSaveBlockToasts(id => dismissed.push(id));
    assert.deepEqual(dismissed, [], 'the email/website/phone gates pass no id and stay untracked');
  });

  it('is a no-op when nothing is pending, without calling dismiss at all', () => {
    resetSaveBlockToastTracking();
    let calls = 0;
    dismissSaveBlockToasts(() => { calls += 1; });
    assert.equal(calls, 0, 'a bare dismiss() would also wipe unrelated backend messages');
  });

  it('tolerates a missing dismiss fn without throwing', () => {
    resetSaveBlockToastTracking();
    trackSaveBlockToast('numeric-field-x');
    dismissSaveBlockToasts(undefined);
    assert.ok(true);
  });
});

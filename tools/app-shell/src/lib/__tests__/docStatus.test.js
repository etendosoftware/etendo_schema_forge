import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_STATUS, isDraftStatus, isCompletedStatus, isVoidedStatus, isNotApprovedStatus, isEditableStatus, docStatusCode,
} from '../docStatus.js';

const PREDICATES = {
  DR: isDraftStatus, CO: isCompletedStatus, VO: isVoidedStatus, UE: isNotApprovedStatus,
};

describe('docStatus', () => {
  it('each predicate accepts only its own code', () => {
    for (const [code, fn] of Object.entries(PREDICATES)) {
      for (const other of ['DR', 'CO', 'VO', 'UE', 'IP', 'XX', '', null, undefined]) {
        assert.equal(fn(other), other === code, `${fn.name}(${other})`);
      }
    }
  });

  it('isEditableStatus is true only for draft', () => {
    assert.equal(isEditableStatus('DR'), true);
    for (const s of ['CO', 'VO', 'UE', 'IP', 'XX', '', null, undefined]) assert.equal(isEditableStatus(s), false, String(s));
  });

  it('unwraps reference objects, preferring id', () => {
    assert.equal(docStatusCode({ id: 'CO' }), 'CO');
    assert.equal(isCompletedStatus({ value: 'CO' }), true);
    assert.equal(docStatusCode({ id: null, value: 'DR' }), 'DR');
    assert.equal(docStatusCode({}), null);
  });

  it('normalizes the lower-case aliases', () => {
    assert.equal(isDraftStatus('draft'), true);
    assert.equal(isCompletedStatus('complete'), true);
    assert.equal(isCompletedStatus('completed'), true);
    assert.equal(isDraftStatus('completed'), false);
  });

  it('returns null for absent values and passes unknown strings through', () => {
    assert.equal(docStatusCode(undefined), null);
    assert.equal(docStatusCode(null), null);
    assert.equal(docStatusCode('ETGO_AC'), 'ETGO_AC');
    assert.equal(DOC_STATUS.NOT_APPROVED, 'UE');
  });
});

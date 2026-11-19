import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDraftStatus, isCompletedStatus, isVoidedStatus, isEditableStatus, docStatusCode } from '../docStatus.js';

describe('docStatus', () => {
  it('classifies codes', () => {
    assert.equal(isDraftStatus('DR'), true);
    assert.equal(isCompletedStatus('CO'), true);
    assert.equal(isVoidedStatus('VO'), true);
    assert.equal(isEditableStatus('CO'), false);
    assert.equal(isEditableStatus('UE'), false);
    assert.equal(isDraftStatus(undefined), false);
  });
  it('unwraps reference objects', () => {
    assert.equal(docStatusCode({ id: 'CO' }), 'CO');
    assert.equal(isCompletedStatus({ value: 'CO' }), true);
  });
});

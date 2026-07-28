import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isCapabilityVisible } from '../capabilityVisibility.js';

describe('isCapabilityVisible', () => {
  it('returns true when no key is given (opt-in, default visible)', () => {
    assert.equal(isCapabilityVisible({}, undefined), true);
    assert.equal(isCapabilityVisible({}, null), true);
    assert.equal(isCapabilityVisible({}, ''), true);
    assert.equal(isCapabilityVisible(undefined, undefined), true);
  });

  it('returns true when the capability resolves to exactly true', () => {
    assert.equal(isCapabilityVisible({ showAccountingFields: true }, 'showAccountingFields'), true);
  });

  it('fails closed when the capability is explicitly false', () => {
    assert.equal(isCapabilityVisible({ showAccountingFields: false }, 'showAccountingFields'), false);
  });

  it('fails closed when the key is missing from the map', () => {
    assert.equal(isCapabilityVisible({ otherFlag: true }, 'showAccountingFields'), false);
  });

  it('fails closed when the map has not loaded yet ({} or null/undefined)', () => {
    assert.equal(isCapabilityVisible({}, 'showAccountingFields'), false);
    assert.equal(isCapabilityVisible(null, 'showAccountingFields'), false);
    assert.equal(isCapabilityVisible(undefined, 'showAccountingFields'), false);
  });

  it('fails closed for truthy-but-not-strictly-true values (defensive)', () => {
    assert.equal(isCapabilityVisible({ showAccountingFields: 'true' }, 'showAccountingFields'), false);
    assert.equal(isCapabilityVisible({ showAccountingFields: 1 }, 'showAccountingFields'), false);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCOUNTING_CAPABILITY,
  filterPostingActions,
  isCapabilityVisible,
  isPostingAction,
} from '../capabilityVisibility.js';

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

describe('ACCOUNTING_CAPABILITY', () => {
  it('names the capability served by SFWindowAccessMap', () => {
    assert.equal(ACCOUNTING_CAPABILITY, 'showAccountingFields');
  });
});

describe('isPostingAction', () => {
  it('recognizes a menu/row descriptor by its neoAction', () => {
    assert.equal(isPostingAction({ key: 'post', neoAction: 'post' }), true);
    assert.equal(isPostingAction({ key: 'unpost', neoAction: 'unpost' }), true);
  });

  it('recognizes a bulk descriptor by its value', () => {
    assert.equal(isPostingAction({ value: 'post', labelKey: 'post' }), true);
    assert.equal(isPostingAction({ value: 'unpost', labelKey: 'unpost' }), true);
  });

  it('does not match other actions, even when their key says post', () => {
    assert.equal(isPostingAction({ key: 'post', documentAction: 'CO' }), false);
    assert.equal(isPostingAction({ value: 'CO' }), false);
    assert.equal(isPostingAction({ neoAction: 'void' }), false);
    assert.equal(isPostingAction(null), false);
    assert.equal(isPostingAction(undefined), false);
  });
});

describe('filterPostingActions', () => {
  const post = { key: 'post', neoAction: 'post' };
  const unpost = { value: 'unpost' };
  const complete = { key: 'complete', documentAction: 'CO' };

  it('keeps the same array when accounting is visible', () => {
    const actions = [post, unpost, complete];
    assert.equal(filterPostingActions(actions, { showAccountingFields: true }), actions);
  });

  it('drops post and unpost when the capability is false', () => {
    assert.deepEqual(filterPostingActions([post, unpost, complete], { showAccountingFields: false }), [complete]);
  });

  it('fails closed when the capability map has not loaded', () => {
    assert.deepEqual(filterPostingActions([post, complete], {}), [complete]);
    assert.deepEqual(filterPostingActions([post, complete], undefined), [complete]);
  });

  it('passes a non-array through unchanged', () => {
    assert.equal(filterPostingActions(undefined, {}), undefined);
    assert.equal(filterPostingActions(null, {}), null);
  });
});

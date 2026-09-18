import {
  notifySaveBlock,
  getSaveBlockCount,
  subscribeSaveBlock,
  resetSaveBlockSignals,
} from '../saveBlockSignal.js';

/**
 * ETP-5245 — the bus that lets a dismissed banner know the block it explained just fired again.
 * The contract that matters to callers: counts are per-id and monotonic, subscribers only hear
 * about their own id, and unsubscribing really stops the notifications (the banner unmounts as
 * soon as the record stops being blocked, and a leaked listener would keep a dead tree alive).
 */
describe('saveBlockSignal', () => {
  beforeEach(() => {
    resetSaveBlockSignals();
  });

  it('starts every id at zero', () => {
    expect(getSaveBlockCount('product-cost-required')).toBe(0);
  });

  it('increments the count for the notified id', () => {
    notifySaveBlock('product-cost-required');
    notifySaveBlock('product-cost-required');
    expect(getSaveBlockCount('product-cost-required')).toBe(2);
  });

  it('keeps counts separate per id', () => {
    notifySaveBlock('product-cost-required');
    expect(getSaveBlockCount('numeric-field-usableLifeMonths')).toBe(0);
  });

  it('notifies subscribers of its own id only', () => {
    const mine = vi.fn();
    const other = vi.fn();
    subscribeSaveBlock('product-cost-required', mine);
    subscribeSaveBlock('some-other-block', other);
    notifySaveBlock('product-cost-required');
    expect(mine).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSaveBlock('product-cost-required', listener);
    notifySaveBlock('product-cost-required');
    unsubscribe();
    notifySaveBlock('product-cost-required');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('survives a listener that unsubscribes itself while being notified', () => {
    const other = vi.fn();
    let unsubscribe;
    const selfRemoving = vi.fn(() => unsubscribe());
    unsubscribe = subscribeSaveBlock('product-cost-required', selfRemoving);
    subscribeSaveBlock('product-cost-required', other);
    expect(() => notifySaveBlock('product-cost-required')).not.toThrow();
    expect(other).toHaveBeenCalledTimes(1);
  });

  // The email/website/phone gates block a save without a stable id; they must not blow up here,
  // and they must not be able to reopen somebody else's banner.
  it('ignores a falsy id on both notify and subscribe', () => {
    const listener = vi.fn();
    expect(() => notifySaveBlock(undefined)).not.toThrow();
    expect(() => notifySaveBlock('')).not.toThrow();
    expect(subscribeSaveBlock(undefined, listener)).toBeInstanceOf(Function);
    expect(getSaveBlockCount(undefined)).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('resets counts and subscribers', () => {
    const listener = vi.fn();
    subscribeSaveBlock('product-cost-required', listener);
    notifySaveBlock('product-cost-required');
    resetSaveBlockSignals();
    expect(getSaveBlockCount('product-cost-required')).toBe(0);
    notifySaveBlock('product-cost-required');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

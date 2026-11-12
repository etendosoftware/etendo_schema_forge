// @covers tools/app-shell/src/lib/formPendingWork.js
import { describe, it, expect, vi } from 'vitest';
import {
  registerPending, getPendingCount, isCalculating, subscribePending,
} from '../formPendingWork.js';

const scope = () => () => {};

describe('formPendingWork', () => {
  it('counts synchronously and is calculating while anything is pending', () => {
    const s = scope();
    expect(isCalculating(s)).toBe(false);
    const releaseA = registerPending(s);
    expect(getPendingCount(s)).toBe(1);
    expect(isCalculating(s)).toBe(true);
    releaseA();
    expect(isCalculating(s)).toBe(false);
  });

  it('stays calculating until every registration is released', () => {
    const s = scope();
    const releaseA = registerPending(s);
    const releaseB = registerPending(s);
    releaseA();
    expect(isCalculating(s)).toBe(true);
    releaseB();
    expect(isCalculating(s)).toBe(false);
  });

  it('release is idempotent', () => {
    const s = scope();
    const releaseA = registerPending(s);
    const releaseB = registerPending(s);
    releaseA();
    releaseA();
    expect(getPendingCount(s)).toBe(1);
    releaseB();
    expect(getPendingCount(s)).toBe(0);
  });

  it('isolates scopes: one form never sees another form\'s pending work', () => {
    const main = scope();
    const popup = scope();
    const release = registerPending(popup);
    expect(isCalculating(popup)).toBe(true);
    expect(isCalculating(main)).toBe(false);
    release();
  });

  it('notifies subscribers on register and release, and stops after unsubscribe', () => {
    const s = scope();
    const listener = vi.fn();
    const unsubscribe = subscribePending(s, listener);
    const release = registerPending(s);
    release();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    registerPending(s)();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a missing scope is a no-op that never throws', () => {
    expect(registerPending(undefined)()).toBeUndefined();
    expect(getPendingCount(null)).toBe(0);
    expect(isCalculating(undefined)).toBe(false);
    expect(subscribePending(undefined, () => {})()).toBeUndefined();
  });
});

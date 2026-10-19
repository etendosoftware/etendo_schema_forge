/**
 * ETP-5489 — the access-load error store: only a 401 that did not end the session is recorded,
 * subscribers are told once per change, and the test seam resets everything.
 */
import {
  clearAccessLoadError,
  getAccessLoadError,
  recordAccessLoadError,
  resetAccessLoadErrorForTest,
  subscribeAccessLoadError,
} from '@/lib/accessLoadError.js';

function sessionAliveError() {
  const error = new Error('Unauthorized, but the session is still alive.');
  error.name = 'SessionAliveUnauthorizedError';
  return error;
}

describe('accessLoadError store', () => {
  beforeEach(() => resetAccessLoadErrorForTest());

  it('starts clear', () => {
    expect(getAccessLoadError()).toBe(false);
  });

  it('records a session-alive 401 and reports it did', () => {
    expect(recordAccessLoadError(sessionAliveError())).toBe(true);
    expect(getAccessLoadError()).toBe(true);
  });

  it.each([
    ['a plain Unauthorized (the session really is gone)', new Error('Unauthorized')],
    ['a network failure', new TypeError('Failed to fetch')],
    ['undefined', undefined],
  ])('ignores %s', (_label, error) => {
    expect(recordAccessLoadError(error)).toBe(false);
    expect(getAccessLoadError()).toBe(false);
  });

  it('notifies subscribers once per change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAccessLoadError(listener);
    recordAccessLoadError(sessionAliveError());
    recordAccessLoadError(sessionAliveError());
    expect(listener).toHaveBeenCalledTimes(1);
    clearAccessLoadError();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    recordAccessLoadError(sessionAliveError());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

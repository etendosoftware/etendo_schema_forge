import {
  parseEnvironmentAccessDecision,
  readEnvironmentAccessDecision,
  isBlockingAccessDecision,
  setEnvironmentAccessDecision,
  getEnvironmentAccessDecision,
  subscribeEnvironmentAccessDecision,
  resetEnvironmentAccessGateForTest,
} from '../environmentAccessGate.js';

/**
 * ETP-5443 follow-up — the plain module that detects a commercial access cut-off (demo trial
 * expired / subscription payment grace elapsed) from a NEO `/sws/neo/windowaccessmap` 402, and
 * holds the resulting decision as module-level state for `hooks/useEnvironmentAccessGate.js` (the
 * React binding, exercised indirectly through `layout/AppLayout.jsx`'s own suite) and for
 * `App.jsx`'s `fetchWindowAccess` (exercised directly in
 * `__tests__/fetchWindowAccessEnvironmentGate.vitest.jsx`). This file is the one place that tests
 * the plain functions themselves: message parsing, the blocking-decision allowlist, and the
 * store's set/notify/no-op/reset contract.
 */
describe('environmentAccessGate', () => {
  beforeEach(() => {
    resetEnvironmentAccessGateForTest();
  });

  describe('parseEnvironmentAccessDecision', () => {
    it('extracts DEMO_TRIAL_EXPIRED from the real NeoAuthenticator message shape', () => {
      expect(parseEnvironmentAccessDecision('Environment access is not available: DEMO_TRIAL_EXPIRED'))
        .toBe('DEMO_TRIAL_EXPIRED');
    });

    it('extracts SUBSCRIPTION_REQUIRED', () => {
      expect(parseEnvironmentAccessDecision('Environment access is not available: SUBSCRIPTION_REQUIRED'))
        .toBe('SUBSCRIPTION_REQUIRED');
    });

    // Parsing and blocking are deliberately separate concerns (see isBlockingAccessDecision
    // below): MEMBERSHIP_REQUIRED is a real EnvironmentAccessPolicy.Decision and parses cleanly,
    // it just isn't a commercial block.
    it('extracts MEMBERSHIP_REQUIRED just like the other two decisions', () => {
      expect(parseEnvironmentAccessDecision('Environment access is not available: MEMBERSHIP_REQUIRED'))
        .toBe('MEMBERSHIP_REQUIRED');
    });

    it('trims surrounding whitespace around the decision name', () => {
      expect(parseEnvironmentAccessDecision('Environment access is not available:   DEMO_TRIAL_EXPIRED  '))
        .toBe('DEMO_TRIAL_EXPIRED');
    });

    it('returns null for a differently-worded 402 (unrecognized prefix)', () => {
      expect(parseEnvironmentAccessDecision('Rate limit exceeded')).toBeNull();
    });

    // A message that IS the prefix, with nothing after it, must not turn into "" being
    // treated as a decision.
    it('returns null when nothing follows the prefix', () => {
      expect(parseEnvironmentAccessDecision('Environment access is not available:')).toBeNull();
      expect(parseEnvironmentAccessDecision('Environment access is not available:   ')).toBeNull();
    });

    it('returns null for a missing message', () => {
      expect(parseEnvironmentAccessDecision(undefined)).toBeNull();
      expect(parseEnvironmentAccessDecision(null)).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseEnvironmentAccessDecision('')).toBeNull();
    });
  });

  // ETP-5047 — the body reader fetchWindowAccess hands a parsed 402 to. Structured
  // `error.code` / `error.decision` first (EnvironmentAccessGuard.Denial.errorBody), then the
  // pre-ETP-5047 message-prefix fallback, never throwing on an unexpected shape.
  describe('readEnvironmentAccessDecision', () => {
    const PREFIX = 'Environment access is not available: ';
    const denial = (decision, extra = {}) => ({
      error: {
        message: `${PREFIX}${decision}`,
        status: 402,
        code: 'ENVIRONMENT_ACCESS_DENIED',
        decision,
        ...extra,
      },
    });

    it('reads the structured decision of the shared ETP-5047 body', () => {
      expect(readEnvironmentAccessDecision(denial('SUBSCRIPTION_REQUIRED'))).toBe('SUBSCRIPTION_REQUIRED');
      expect(readEnvironmentAccessDecision(denial('DEMO_TRIAL_EXPIRED'))).toBe('DEMO_TRIAL_EXPIRED');
    });

    it('prefers the structured decision over a message that says otherwise', () => {
      const body = denial('DEMO_TRIAL_EXPIRED', { message: `${PREFIX}SUBSCRIPTION_REQUIRED` });
      expect(readEnvironmentAccessDecision(body)).toBe('DEMO_TRIAL_EXPIRED');
    });

    it('trims the structured decision', () => {
      expect(readEnvironmentAccessDecision(denial('  SUBSCRIPTION_REQUIRED  '))).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('falls back to error.message when the body has no structured decision (pre-ETP-5047 backend)', () => {
      expect(readEnvironmentAccessDecision({ error: { message: `${PREFIX}DEMO_TRIAL_EXPIRED` } }))
        .toBe('DEMO_TRIAL_EXPIRED');
    });

    it('parses a string error', () => {
      expect(readEnvironmentAccessDecision({ error: `${PREFIX}SUBSCRIPTION_REQUIRED` }))
        .toBe('SUBSCRIPTION_REQUIRED');
    });

    it('parses a top-level message when there is no error at all', () => {
      expect(readEnvironmentAccessDecision({ message: `${PREFIX}DEMO_TRIAL_EXPIRED` }))
        .toBe('DEMO_TRIAL_EXPIRED');
    });

    // A decision under a foreign code is not the guard's: only the message may speak for it.
    it('ignores the decision field under a different error code and reads the message instead', () => {
      expect(readEnvironmentAccessDecision(denial('SUBSCRIPTION_REQUIRED', {
        code: 'SOMETHING_ELSE', message: `${PREFIX}DEMO_TRIAL_EXPIRED`,
      }))).toBe('DEMO_TRIAL_EXPIRED');
      expect(readEnvironmentAccessDecision(denial('SUBSCRIPTION_REQUIRED', {
        code: 'SOMETHING_ELSE', message: 'Rate limit exceeded',
      }))).toBeNull();
      expect(readEnvironmentAccessDecision({ error: { decision: 'SUBSCRIPTION_REQUIRED' } })).toBeNull();
    });

    it('falls back to the message when the structured decision is blank or not a string', () => {
      expect(readEnvironmentAccessDecision(denial('   '))).toBeNull();
      expect(readEnvironmentAccessDecision(denial('', { message: `${PREFIX}DEMO_TRIAL_EXPIRED` })))
        .toBe('DEMO_TRIAL_EXPIRED');
      expect(readEnvironmentAccessDecision(denial(null, { message: `${PREFIX}SUBSCRIPTION_REQUIRED` })))
        .toBe('SUBSCRIPTION_REQUIRED');
      expect(readEnvironmentAccessDecision(denial(42, { message: 'no prefix here' }))).toBeNull();
    });

    it('returns null for a body carrying no recognisable decision', () => {
      expect(readEnvironmentAccessDecision({ error: { message: 'Rate limit exceeded' } })).toBeNull();
      expect(readEnvironmentAccessDecision({ error: 'Rate limit exceeded' })).toBeNull();
      expect(readEnvironmentAccessDecision({ message: 'internal error' })).toBeNull();
      expect(readEnvironmentAccessDecision({})).toBeNull();
    });

    it('never throws on an unexpected shape', () => {
      for (const body of [null, undefined, '', 'text', 42, [], { error: null }, { error: 42 },
        { error: [] }, { error: { message: 42 } }]) {
        expect(() => readEnvironmentAccessDecision(body)).not.toThrow();
        expect(readEnvironmentAccessDecision(body)).toBeNull();
      }
    });

    // Reading and blocking stay separate: MEMBERSHIP_REQUIRED is read verbatim, and it is
    // isBlockingAccessDecision that keeps it off the blocked-access screen.
    it('reads MEMBERSHIP_REQUIRED verbatim (blocking is decided elsewhere)', () => {
      expect(readEnvironmentAccessDecision(denial('MEMBERSHIP_REQUIRED'))).toBe('MEMBERSHIP_REQUIRED');
    });
  });

  describe('isBlockingAccessDecision', () => {
    it('treats DEMO_TRIAL_EXPIRED and SUBSCRIPTION_REQUIRED as blocking', () => {
      expect(isBlockingAccessDecision('DEMO_TRIAL_EXPIRED')).toBe(true);
      expect(isBlockingAccessDecision('SUBSCRIPTION_REQUIRED')).toBe(true);
    });

    // The one case that matters most: MEMBERSHIP_REQUIRED is "not a member of this
    // environment", a different problem NoAccessScreen's own company-switch flow already
    // covers — it must never trip the blocked-access screen.
    it('does not treat MEMBERSHIP_REQUIRED as blocking', () => {
      expect(isBlockingAccessDecision('MEMBERSHIP_REQUIRED')).toBe(false);
    });

    it('does not treat null/undefined/an unrecognized string as blocking', () => {
      expect(isBlockingAccessDecision(null)).toBe(false);
      expect(isBlockingAccessDecision(undefined)).toBe(false);
      expect(isBlockingAccessDecision('SOMETHING_ELSE')).toBe(false);
    });
  });

  describe('setEnvironmentAccessDecision / getEnvironmentAccessDecision', () => {
    it('starts at null', () => {
      expect(getEnvironmentAccessDecision()).toBeNull();
    });

    it('records a blocking decision', () => {
      setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED');
      expect(getEnvironmentAccessDecision()).toBe('DEMO_TRIAL_EXPIRED');

      setEnvironmentAccessDecision('SUBSCRIPTION_REQUIRED');
      expect(getEnvironmentAccessDecision()).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('clears a recorded decision back to null', () => {
      setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED');
      setEnvironmentAccessDecision(null);
      expect(getEnvironmentAccessDecision()).toBeNull();
    });

    // Normalization at the write, not the read: a non-blocking value (MEMBERSHIP_REQUIRED, or
    // anything isBlockingAccessDecision does not recognize) must never be STORED as the current
    // decision, so a later plain `getEnvironmentAccessDecision() === 'MEMBERSHIP_REQUIRED'` check
    // elsewhere in the codebase can't accidentally start passing.
    it('normalizes a non-blocking decision to null instead of storing it verbatim', () => {
      setEnvironmentAccessDecision('MEMBERSHIP_REQUIRED');
      expect(getEnvironmentAccessDecision()).toBeNull();

      setEnvironmentAccessDecision('SOMETHING_UNRECOGNIZED');
      expect(getEnvironmentAccessDecision()).toBeNull();
    });
  });

  describe('subscribeEnvironmentAccessDecision — notify semantics', () => {
    it('notifies subscribers on a real transition', () => {
      const listener = vi.fn();
      subscribeEnvironmentAccessDecision(listener);

      setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    // Called on every silent refresh (bootstrap, tab focus/visibility, the 5-min poll), not just
    // on state transitions — a listener firing on every one of those (most of which are
    // no-changes) would re-render whatever subscribes to this pointlessly.
    it('does not notify when set to the same value again', () => {
      setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED');
      const listener = vi.fn();
      subscribeEnvironmentAccessDecision(listener);

      setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED');

      expect(listener).not.toHaveBeenCalled();
    });

    // A non-blocking decision normalizes to the SAME null the store already holds while
    // unblocked — must not manufacture a spurious notification out of that normalization.
    it('does not notify when a non-blocking decision normalizes to the already-current null', () => {
      const listener = vi.fn();
      subscribeEnvironmentAccessDecision(listener);

      setEnvironmentAccessDecision('MEMBERSHIP_REQUIRED');

      expect(listener).not.toHaveBeenCalled();
      expect(getEnvironmentAccessDecision()).toBeNull();
    });

    it('stops notifying after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeEnvironmentAccessDecision(listener);

      unsubscribe();
      setEnvironmentAccessDecision('SUBSCRIPTION_REQUIRED');

      expect(listener).not.toHaveBeenCalled();
    });

    // Mirrors lib/saveBlockSignal.js's own suite: notify() copies the listener set before
    // iterating, specifically so a listener unsubscribing itself mid-notification cannot skip
    // or crash the remaining ones.
    it('survives a listener that unsubscribes itself while being notified', () => {
      const other = vi.fn();
      let unsubscribe;
      const selfRemoving = vi.fn(() => unsubscribe());
      unsubscribe = subscribeEnvironmentAccessDecision(selfRemoving);
      subscribeEnvironmentAccessDecision(other);

      expect(() => setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED')).not.toThrow();

      expect(other).toHaveBeenCalledTimes(1);
    });

    it('ignores a non-function listener instead of throwing on notify', () => {
      const unsubscribe = subscribeEnvironmentAccessDecision('not-a-function');

      expect(() => setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED')).not.toThrow();
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('resetEnvironmentAccessGateForTest', () => {
    it('clears the recorded decision', () => {
      setEnvironmentAccessDecision('DEMO_TRIAL_EXPIRED');
      resetEnvironmentAccessGateForTest();
      expect(getEnvironmentAccessDecision()).toBeNull();
    });

    it('drops every subscriber, so a listener from a previous test is never notified again', () => {
      const listener = vi.fn();
      subscribeEnvironmentAccessDecision(listener);

      resetEnvironmentAccessGateForTest();
      setEnvironmentAccessDecision('SUBSCRIPTION_REQUIRED');

      expect(listener).not.toHaveBeenCalled();
    });
  });
});

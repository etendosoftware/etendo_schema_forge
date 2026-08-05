/**
 * Shared `useAuth` mock for the cookie-session contract (ETP-4576).
 *
 * Since the session moved into the `__Host-go_session` cookie, any component or
 * hook that sends an unsafe request reads its CSRF proof from the auth context.
 * Mounting one without a provider throws `useAuth must be used within
 * AuthProvider`, so ~60 test files grew the same mock preamble. This is that
 * preamble, once.
 *
 * Mocked rather than wrapped in a real `AuthProvider` so those stay unit tests:
 * a real provider would boot the session (it defaults `restoreSession` to
 * `fetchCookieSession`) and every test would have to stub that too.
 *
 * Usage — the `vi.mock` call must stay in the test file, because Vitest only
 * hoists calls it can see there, and the factory must import this module lazily
 * rather than close over an outer binding (a hoisted factory runs before any
 * top-level `const` is initialized). That one call is the whole preamble:
 *
 *   vi.mock('@/auth/AuthContext.jsx', async () =>
 *     (await import('@/test/authContextMock.js')).authContextMock);
 *
 * The value resets to the default before every test — `src/test/setup.js`
 * registers that globally — so a file only declares something when it needs a
 * different baseline (`configureAuthMock`) or a one-test override
 * (`setAuthMock`).
 */

/** An authenticated session holding a usable CSRF proof. */
const DEFAULT_AUTH = { isAuthenticated: true, csrfToken: 'test-csrf' };

let fileDefault = { ...DEFAULT_AUTH };
let authValue = { ...DEFAULT_AUTH };

/**
 * The module shape to return from the `vi.mock` factory.
 *
 * `useAuth` is a plain arrow reading a module-level binding, not a `vi.fn()`
 * with `mockReturnValueOnce`: React can invoke a hook more than once per render,
 * and a "once" override would decay to the default mid-render.
 */
export const authContextMock = {
  useAuth: () => authValue,
};

/**
 * Overrides the value `useAuth()` returns for the current test only.
 *
 * Copies the input so the returned object keeps a stable identity until the next
 * call — a hook memoized on the context value must not see a new object on every
 * render.
 *
 * @param {object} [next] Defaults to an authenticated session with a CSRF proof.
 * @returns {object} The value `useAuth()` will now return.
 */
export function setAuthMock(next = DEFAULT_AUTH) {
  authValue = { ...next };
  return authValue;
}

/**
 * Sets the baseline this file's tests start from, and applies it immediately.
 * Call at module top level, for a suite whose subject needs something other than
 * an authenticated session with a CSRF proof — a hook gated only on
 * `isAuthenticated`, say, or one that also reads `username`.
 *
 * @param {object} [next]
 * @returns {object} The value `useAuth()` will now return.
 */
export function configureAuthMock(next = DEFAULT_AUTH) {
  fileDefault = { ...next };
  return setAuthMock(next);
}

/**
 * Restores this file's baseline, undoing any `setAuthMock` a test performed.
 * Registered as a global `beforeEach` in `src/test/setup.js`, so no test file
 * has to reset the mock itself.
 *
 * @returns {object} The value `useAuth()` will now return.
 */
export function resetAuthMock() {
  authValue = { ...fileDefault };
  return authValue;
}

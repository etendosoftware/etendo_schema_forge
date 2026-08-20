/**
 * Shared assertions for the cookie-session request contract (ETP-4576).
 *
 * Single definition for the whole suite. This assertion was copy-pasted into 26
 * test files during the migration, which is both duplication and a maintenance
 * trap: the contract it encodes is one decision, so a change to it (a new
 * credential-bearing header to forbid, say) has to land in one place, not 26.
 */
import { expect } from 'vitest';
// The leaf, not the `./auth` barrel: the barrel re-exports AuthContext.jsx, which
// makes this helper unusable from `node --test` (no JSX loader).
import { CREDENTIAL_MODES, setSessionCredentials } from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

/** The CSRF proof these suites assert on. Matches the shared useAuth mock. */
export const TEST_CSRF_TOKEN = 'test-csrf';

/** The bearer token the legacy-scheme suites assert on. */
export const TEST_BEARER_TOKEN = 'test-bearer';

/**
 * Puts the request builders into cookie-session mode for the current test.
 *
 * Needed because these suites mock `useAuth` instead of mounting AuthProvider,
 * and the provider is what publishes the credentials in production — with it
 * mocked away, nothing does, so the builders stay on the default (bearer) and a
 * suite asserting the CSRF proof would see only a Content-Type.
 *
 * Call from a `beforeEach`: `src/test/setup.js` resets the scheme before every
 * test, so declaring it once at module scope would not survive.
 */
export function declareCookieSession(csrfToken = TEST_CSRF_TOKEN) {
  // BOTH credentials are published on purpose, so `mode` is the ONLY thing that
  // distinguishes this from `declareBearerSession`. If each helper published only
  // its own credential, an implementation that ignored `mode` entirely and just
  // emitted whatever it held would pass every assertion — the absence checks
  // would hold for the wrong reason (nothing to emit) rather than the right one
  // (the scheme said no). Verified by mutation: removing the mode check from
  // `writeHeaders`/`jsonHeaders` went undetected until both were published here.
  return setSessionCredentials({
    mode: CREDENTIAL_MODES.cookie,
    token: TEST_BEARER_TOKEN,
    csrfToken,
  });
}

/**
 * The pair of `declareCookieSession`: puts the builders into bearer mode, the
 * scheme the app runs on while the CSRF preference is off.
 *
 * Both helpers exist so a suite can assert the SAME call site under BOTH schemes.
 * That is the property the preference actually promises — one switch, two working
 * schemes — and it cannot be verified by testing either mode alone.
 */
export function declareBearerSession(token = TEST_BEARER_TOKEN) {
  // Publishes both credentials, for the reason documented on declareCookieSession.
  return setSessionCredentials({
    mode: CREDENTIAL_MODES.bearer,
    token,
    csrfToken: TEST_CSRF_TOKEN,
  });
}

/**
 * Asserts every recorded request carried the bearer token — the mirror of
 * `expectNoAuthorizationHeader`, for the legacy scheme.
 *
 * @param {{ mock: { calls: Array<[unknown, RequestInit|undefined]> } }} [fetchMock]
 */
export function expectBearerHeader(token = TEST_BEARER_TOKEN, fetchMock = globalThis.fetch) {
  expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  for (const [, init] of fetchMock.mock.calls) {
    expect(init?.headers ?? {}).toMatchObject({ Authorization: `Bearer ${token}` });
  }
}

/**
 * Asserts no request carried the CSRF proof. Under the bearer scheme the header
 * is meaningless, and sending it anyway would mean the builders are ignoring the
 * active mode — the exact bug the preference is supposed to make impossible.
 *
 * @param {{ mock: { calls: Array<[unknown, RequestInit|undefined]> } }} [fetchMock]
 */
export function expectNoCsrfHeader(fetchMock = globalThis.fetch) {
  for (const [, init] of fetchMock.mock.calls) {
    const keys = Object.keys(init?.headers ?? {}).map((k) => k.toLowerCase());
    expect(keys).not.toContain('x-go-csrf');
  }
}

/**
 * Asserts that no request recorded by the fetch mock carried a bearer token —
 * the whole point of ETP-4576.
 *
 * Checks the header name case-insensitively (a caller could send `authorization`
 * lowercase) and also scans the serialized value, so a token smuggled under a
 * differently-named header is still caught.
 *
 * The mock is read at call time rather than bound at import time, so a suite
 * that reinstalls `globalThis.fetch` between tests still asserts on the current
 * one.
 *
 * @param {{ mock: { calls: Array<[unknown, RequestInit|undefined]> } }} [fetchMock]
 */
export function expectNoAuthorizationHeader(fetchMock = globalThis.fetch) {
  for (const [, init] of fetchMock.mock.calls) {
    const headers = init?.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  }
}

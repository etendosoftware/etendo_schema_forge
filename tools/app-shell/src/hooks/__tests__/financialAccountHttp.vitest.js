/**
 * ETP-4576 — `financialAccountHttp.js` is the shared fetch plumbing of the
 * `financial-account` spec's two hooks (`useAccountMutations`,
 * `useFinancialAccountAccounting`). It had no test of its own, which is exactly
 * how an `Authorization: Bearer` header survived in it while the callers around
 * it migrated to the server-side `__Host-go_session` cookie.
 *
 * The single `authHeaders(token)` builder served BOTH reads and writes, so it
 * cannot simply grow a CSRF header — that would attach the proof to GETs too.
 * It is therefore split in two, and this suite pins both halves:
 *   - `jsonHeaders()`  → safe methods (GET): no write proof, ever.
 *   - `writeHeaders()` → unsafe methods (POST/PUT/PATCH/DELETE): adds whatever
 *     proof the active scheme requires, omitted entirely when none is held.
 *
 * Neither takes the credential as an ARGUMENT any more. Both read the scheme that
 * the preference selected, which is what makes one DB switch flip the whole app.
 * That also means this module re-exports the platform builders rather than owning
 * them, so what is pinned here is the contract its callers depend on — including,
 * now, that the contract holds under BOTH schemes. The previous version of this
 * suite asserted the cookie scheme only, so a builder that ignored the mode
 * entirely would have passed it.
 *
 * `readErrorMessage` / `throwHttpError` are untouched by this migration and stay
 * covered through the two consumer hooks' own suites.
 */
import * as financialAccountHttp from '../financialAccountHttp.js';
import { jsonHeaders, writeHeaders } from '../financialAccountHttp.js';
import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
} from '@/test/sessionContract.js';
import { CREDENTIAL_MODES, setSessionCredentials } from '@etendosoftware/app-shell-core/auth';

const CONTENT_TYPE = { 'Content-Type': 'application/json' };
const CSRF_HEADER = 'X-Go-CSRF';

/** No header object produced by this module may carry a bearer token. */
function expectNoAuthorization(headers) {
  const keys = Object.keys(headers).map((k) => k.toLowerCase());
  expect(keys).not.toContain('authorization');
}

/** Falsy proofs that must all collapse to "no CSRF header at all". */
const MISSING_PROOFS = [
  ['undefined', undefined],
  ['null', null],
  ['an empty string', ''],
];

describe('financialAccountHttp — module surface', () => {
  it('exports the two header builders', () => {
    expect(typeof financialAccountHttp.jsonHeaders).toBe('function');
    expect(typeof financialAccountHttp.writeHeaders).toBe('function');
  });

  it('no longer exports authHeaders', () => {
    // The bearer-token builder is gone: a caller that still reaches for it must
    // break loudly at build time rather than silently send a stale header.
    expect(Object.keys(financialAccountHttp)).not.toContain('authHeaders');
    expect(financialAccountHttp.authHeaders).toBeUndefined();
  });

  it('keeps the error helpers the split was not supposed to touch', () => {
    expect(typeof financialAccountHttp.readErrorMessage).toBe('function');
    expect(typeof financialAccountHttp.throwHttpError).toBe('function');
  });
});

describe('jsonHeaders (safe methods) — cookie scheme', () => {
  beforeEach(() => declareCookieSession());

  it('returns only the JSON content type', () => {
    expect(jsonHeaders()).toEqual(CONTENT_TYPE);
  });

  it('never emits an Authorization header', () => {
    expectNoAuthorization(jsonHeaders());
  });

  it('never emits the CSRF proof — safe methods must not carry it', () => {
    expect(CSRF_HEADER in jsonHeaders()).toBe(false);
  });

  it('ignores any argument it is handed', () => {
    // Guards against a rename-only refactor of authHeaders(token): passing a
    // leftover token must not resurrect an Authorization header.
    const headers = jsonHeaders('legacy-token');
    expect(headers).toEqual(CONTENT_TYPE);
    expectNoAuthorization(headers);
  });

  it('returns a fresh object on every call', () => {
    const first = jsonHeaders();
    const second = jsonHeaders();
    expect(first).not.toBe(second);
    first.injected = 'x';
    expect(jsonHeaders()).toEqual(CONTENT_TYPE);
  });
});

describe('writeHeaders (unsafe methods) — cookie scheme', () => {
  it('returns the JSON content type plus the CSRF proof', () => {
    declareCookieSession(TEST_CSRF_TOKEN);
    expect(writeHeaders()).toEqual({ ...CONTENT_TYPE, [CSRF_HEADER]: TEST_CSRF_TOKEN });
  });

  it('never emits an Authorization header when a proof is present', () => {
    declareCookieSession(TEST_CSRF_TOKEN);
    expectNoAuthorization(writeHeaders());
  });

  for (const [label, value] of MISSING_PROOFS) {
    it(`omits X-Go-CSRF entirely when the proof is ${label}`, () => {
      // A session can be authenticated before the CSRF proof lands. The header
      // must be absent, never present with an empty/undefined value.
      // Published directly rather than through declareCookieSession: that helper
      // defaults its argument, so `undefined` would silently become the real test
      // proof and this case would assert nothing. The value has to reach the
      // builder verbatim.
      setSessionCredentials({ mode: CREDENTIAL_MODES.cookie, csrfToken: value });
      const headers = writeHeaders();
      expect(CSRF_HEADER in headers).toBe(false);
      expect(headers).toEqual(CONTENT_TYPE);
      expectNoAuthorization(headers);
    });
  }

  it('omits X-Go-CSRF entirely when no session has been declared at all', () => {
    // src/test/setup.js resets to the default, which holds no proof.
    const headers = writeHeaders();
    expect(CSRF_HEADER in headers).toBe(false);
    expectNoAuthorization(headers);
  });

  it('never emits an Authorization header for a bearer-looking proof value', () => {
    // The proof is opaque to these helpers — whatever it is, it goes to X-Go-CSRF
    // and nowhere else. Notably it must NOT be re-read as a bearer token just
    // because it looks like one.
    declareCookieSession('Bearer legacy-token');
    const headers = writeHeaders();
    expectNoAuthorization(headers);
    expect(headers[CSRF_HEADER]).toBe('Bearer legacy-token');
  });

  it('returns a fresh object on every call', () => {
    declareCookieSession(TEST_CSRF_TOKEN);
    const first = writeHeaders();
    const second = writeHeaders();
    expect(first).not.toBe(second);
    first.injected = 'x';
    expect(writeHeaders()).toEqual({ ...CONTENT_TYPE, [CSRF_HEADER]: TEST_CSRF_TOKEN });
  });
});

// The half the old suite could not express, because the builders took the proof
// as an argument: with the preference off, this module's callers must authenticate
// with the bearer token instead. Same call, same file, other scheme.
describe('both builders — bearer scheme', () => {
  beforeEach(() => declareBearerSession(TEST_BEARER_TOKEN));

  it('jsonHeaders carries the bearer token, so reads stay authenticated', () => {
    expect(jsonHeaders()).toMatchObject({ Authorization: `Bearer ${TEST_BEARER_TOKEN}` });
  });

  it('writeHeaders carries the bearer token as well', () => {
    expect(writeHeaders()).toMatchObject({ Authorization: `Bearer ${TEST_BEARER_TOKEN}` });
  });

  it('neither builder emits the CSRF proof — it is meaningless under bearer', () => {
    // declareBearerSession publishes a csrfToken too, on purpose: the MODE has to
    // be what suppresses the header, not the absence of a value.
    expect(CSRF_HEADER in jsonHeaders()).toBe(false);
    expect(CSRF_HEADER in writeHeaders()).toBe(false);
  });
});

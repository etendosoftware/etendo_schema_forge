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
 *   - `jsonHeaders()`           → safe methods (GET): the JSON content type only.
 *   - `writeHeaders(csrfToken)` → unsafe methods (POST/PUT/PATCH/DELETE): the
 *     JSON content type plus a guarded `X-Go-CSRF`, omitted entirely when no
 *     proof is available.
 * Neither may ever emit an `Authorization` header, under any input.
 *
 * `readErrorMessage` / `throwHttpError` are untouched by this migration and stay
 * covered through the two consumer hooks' own suites.
 */
import * as financialAccountHttp from '../financialAccountHttp.js';
import { jsonHeaders, writeHeaders } from '../financialAccountHttp.js';

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

describe('jsonHeaders (safe methods)', () => {
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

describe('writeHeaders (unsafe methods)', () => {
  it('returns the JSON content type plus the CSRF proof', () => {
    expect(writeHeaders('test-csrf')).toEqual({
      ...CONTENT_TYPE,
      [CSRF_HEADER]: 'test-csrf',
    });
  });

  it('never emits an Authorization header when a proof is present', () => {
    expectNoAuthorization(writeHeaders('test-csrf'));
  });

  for (const [label, value] of MISSING_PROOFS) {
    it(`omits X-Go-CSRF entirely when the proof is ${label}`, () => {
      // A session can be authenticated before the CSRF proof lands. The header
      // must be absent, never present with an empty/undefined value.
      const headers = writeHeaders(value);
      expect(CSRF_HEADER in headers).toBe(false);
      expect(headers).toEqual(CONTENT_TYPE);
      expectNoAuthorization(headers);
    });
  }

  it('omits X-Go-CSRF entirely when called with no argument', () => {
    const headers = writeHeaders();
    expect(CSRF_HEADER in headers).toBe(false);
    expect(headers).toEqual(CONTENT_TYPE);
    expectNoAuthorization(headers);
  });

  it('never emits an Authorization header for a bearer-looking proof value', () => {
    // The proof is opaque to this helper — whatever it is, it goes to X-Go-CSRF
    // and nowhere else.
    const headers = writeHeaders('Bearer legacy-token');
    expectNoAuthorization(headers);
    expect(headers[CSRF_HEADER]).toBe('Bearer legacy-token');
  });

  it('returns a fresh object on every call', () => {
    const first = writeHeaders('test-csrf');
    const second = writeHeaders('test-csrf');
    expect(first).not.toBe(second);
    first.injected = 'x';
    expect(writeHeaders('test-csrf')).toEqual({
      ...CONTENT_TYPE,
      [CSRF_HEADER]: 'test-csrf',
    });
  });
});

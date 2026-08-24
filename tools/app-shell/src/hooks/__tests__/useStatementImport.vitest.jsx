/**
 * ETP-4576 — which credential scheme is live is a BACKEND PREFERENCE, so both are
 * reachable at runtime and this hook's single POST has to work under either one:
 *
 *  - bearer: `Authorization: Bearer <token>`, and never a CSRF proof (sending one
 *            would mean the builders are ignoring the active mode).
 *  - cookie: the `__Host-go_session` cookie travels via `credentials: 'include'`,
 *            no header carries a credential, and the POST — an unsafe method —
 *            proves intent with `X-Go-CSRF`.
 *
 * Every credential-sensitive case below therefore declares its scheme and runs
 * once per scheme. That is not ceremony: `src/test/setup.js` resets the scheme to
 * the bearer default before EVERY test, so an assertion like "no Authorization
 * header was sent" that does not declare a scheme is only ever exercising that
 * default — it passes by omission (the default holds no token, so there is
 * nothing to send) rather than by proving the cookie scheme suppresses it.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { setAuthMock } from '@/test/authContextMock.js';
import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
  expectBearerHeader,
  expectNoAuthorizationHeader,
  expectNoCsrfHeader,
} from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

import { useStatementImport } from '../useStatementImport.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

/**
 * Asserts every recorded request carried the CSRF proof. The positive mirror of
 * `expectNoCsrfHeader`; the lookup is case-insensitive so a builder that emitted
 * `x-go-csrf` would still satisfy the backend contract and this assertion.
 */
function expectCsrfHeader(token = TEST_CSRF_TOKEN) {
  expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(0);
  for (const [, init] of globalThis.fetch.mock.calls) {
    const headers = Object.fromEntries(
      Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers['x-go-csrf']).toBe(token);
  }
}

/**
 * The two schemes the preference switches between, each stating the FULL contract
 * for an unsafe request: the header that must be present AND the one that must be
 * absent. Asserting only the presence would let an implementation that emits both
 * credentials at once pass, which is precisely the bug the preference exists to
 * make impossible.
 *
 * `assertCredentialWithoutProof` is the same contract for a session that is
 * authenticated but holds no CSRF proof yet — the bearer credential must survive
 * that (it does not depend on the proof), while the cookie scheme must simply omit
 * the header rather than send it empty.
 */
const SCHEMES = [
  {
    name: 'bearer',
    declare: declareBearerSession,
    assertCredential: () => {
      expectBearerHeader();
      expectNoCsrfHeader();
    },
    assertCredentialWithoutProof: () => {
      expectBearerHeader();
      expectNoCsrfHeader();
    },
  },
  {
    name: 'cookie',
    declare: declareCookieSession,
    assertCredential: () => {
      expectCsrfHeader();
      expectNoAuthorizationHeader();
    },
    assertCredentialWithoutProof: () => {
      expectNoCsrfHeader();
      expectNoAuthorizationHeader();
    },
  },
];

describe('useStatementImport', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useStatementImport());
    expect(result.current.importing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.importStatement).toBe('function');
  });

  for (const scheme of SCHEMES) {
    it(`POSTs to bank-statements?action=import with the expected body under the ${scheme.name} scheme`, async () => {
      scheme.declare();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: { id: 'st-1', lineCount: 3 } } }),
      });

      const { result } = renderHook(() => useStatementImport());

      let res;
      await act(async () => {
        res = await result.current.importStatement({
          accountId: 'acc-1',
          fileName: 'extracto.c43',
          contentBase64: 'ZmFrZQ==',
        });
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('/etendo/sws/neo/bank-statements?action=import');
      expect(init.method).toBe('POST');
      // Unconditional in both schemes: required so the `__Host-` cookie travels,
      // and a same-origin no-op under bearer. Making it conditional on the scheme
      // would break the switch in one direction.
      expect(init.credentials).toBe('include');
      expect(init.headers['Content-Type']).toBe('application/json');
      scheme.assertCredential();
      expect(JSON.parse(init.body)).toEqual({
        FIN_Financial_Account_ID: 'acc-1',
        fileName: 'extracto.c43',
        contentBase64: 'ZmFrZQ==',
      });
      expect(res).toEqual({ id: 'st-1', lineCount: 3 });
    });

    it(`omits X-Go-CSRF entirely under ${scheme.name} when no CSRF proof is available`, async () => {
      // A session can be authenticated before the CSRF proof lands; the header must
      // be added defensively, never sent as an empty/undefined value.
      scheme.declare();
      // Declared first, then overridden: setAuthMock republishes the credentials
      // while PRESERVING the mode, so dropping the proof cannot silently drop the
      // scheme. The bearer token is restated because the same call also republishes
      // `token`, and bearer must keep authenticating without a CSRF proof.
      setAuthMock({ isAuthenticated: true, token: TEST_BEARER_TOKEN, csrfToken: null });
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ response: { data: {} } }) });

      const { result } = renderHook(() => useStatementImport());
      await act(async () => {
        await result.current.importStatement({ accountId: 'a', fileName: 'f', contentBase64: 'x' });
      });

      const [, init] = globalThis.fetch.mock.calls[0];
      expect(Object.keys(init.headers)).not.toContain('X-Go-CSRF');
      expect(init.credentials).toBe('include');
      scheme.assertCredentialWithoutProof();
    });
  }

  it('flips importing during the call', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(
      new Promise((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useStatementImport());
    let promise;
    act(() => {
      promise = result.current.importStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      });
    });
    await waitFor(() => expect(result.current.importing).toBe(true));

    await act(async () => {
      resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      await promise;
    });
    expect(result.current.importing).toBe(false);
  });

  it('throws and captures the error on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 422, text: async () => 'parse error',
    });
    const { result } = renderHook(() => useStatementImport());

    await act(async () => {
      await expect(result.current.importStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      })).rejects.toThrow(/HTTP 422/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('parse error');
  });

  it('propagates a network rejection', async () => {
    globalThis.fetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useStatementImport());

    await act(async () => {
      await expect(result.current.importStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      })).rejects.toThrow('offline');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('offline');
  });

  it('returns {} when the API omits response.data', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true, json: async () => ({}),
    });
    const { result } = renderHook(() => useStatementImport());

    let res;
    await act(async () => {
      res = await result.current.importStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      });
    });
    expect(res).toEqual({});
  });
});

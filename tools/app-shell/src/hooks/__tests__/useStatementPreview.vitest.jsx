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

import { useStatementPreview } from '../useStatementPreview.js';

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

describe('useStatementPreview', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useStatementPreview());
    expect(result.current.previewing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.previewStatement).toBe('function');
  });

  for (const scheme of SCHEMES) {
    it(`POSTs to bank-statements?action=preview with the expected body under the ${scheme.name} scheme`, async () => {
      scheme.declare();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: { format: 'C43', lineCount: 7 } } }),
      });

      const { result } = renderHook(() => useStatementPreview());

      let res;
      await act(async () => {
        res = await result.current.previewStatement({
          accountId: 'acc-1',
          fileName: 'ext.c43',
          contentBase64: 'AAAA',
        });
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('/etendo/sws/neo/bank-statements?action=preview');
      expect(init.method).toBe('POST');
      // Unconditional in both schemes: required so the `__Host-` cookie travels,
      // and a same-origin no-op under bearer. Making it conditional on the scheme
      // would break the switch in one direction.
      expect(init.credentials).toBe('include');
      scheme.assertCredential();
      expect(JSON.parse(init.body)).toEqual({
        FIN_Financial_Account_ID: 'acc-1',
        fileName: 'ext.c43',
        contentBase64: 'AAAA',
      });
      expect(res).toEqual({ format: 'C43', lineCount: 7 });
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

      const { result } = renderHook(() => useStatementPreview());
      await act(async () => {
        await result.current.previewStatement({ accountId: 'a', fileName: 'f', contentBase64: 'x' });
      });

      const [, init] = globalThis.fetch.mock.calls[0];
      expect(Object.keys(init.headers)).not.toContain('X-Go-CSRF');
      expect(init.credentials).toBe('include');
      scheme.assertCredentialWithoutProof();
    });
  }

  it('flips previewing during the call', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(
      new Promise((r) => { resolve = r; }),
    );

    const { result } = renderHook(() => useStatementPreview());
    let promise;
    act(() => {
      promise = result.current.previewStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      });
    });
    await waitFor(() => expect(result.current.previewing).toBe(true));

    await act(async () => {
      resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      await promise;
    });
    expect(result.current.previewing).toBe(false);
  });

  it('throws an Error with the HTTP status attached on backend failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 415, text: async () => 'unsupported',
    });
    const { result } = renderHook(() => useStatementPreview());

    let caught;
    await act(async () => {
      try {
        await result.current.previewStatement({
          accountId: 'a', fileName: 'f', contentBase64: 'b',
        });
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(415);
    expect(caught.message).toContain('HTTP 415');
    expect(caught.message).toContain('unsupported');
    expect(result.current.error).toBe(caught);
  });

  it('propagates network rejection and stores it', async () => {
    globalThis.fetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useStatementPreview());

    await act(async () => {
      await expect(result.current.previewStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      })).rejects.toThrow('offline');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('offline');
  });

  it('returns {} when the API omits response.data', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useStatementPreview());

    let res;
    await act(async () => {
      res = await result.current.previewStatement({
        accountId: 'a', fileName: 'f', contentBase64: 'b',
      });
    });
    expect(res).toEqual({});
  });
});

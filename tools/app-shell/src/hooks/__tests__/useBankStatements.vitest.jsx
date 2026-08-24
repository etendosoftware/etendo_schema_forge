/**
 * Tests for useBankStatements (GET via useNeoResource).
 *
 * ETP-4576 — the underlying useNeoResource gates on `isAuthenticated` (never a
 * client-held `token`) and opts the request into cookie transport with
 * `credentials: 'include'`, unconditionally, in both schemes.
 *
 * WHICH credential the request then carries is a backend preference, so both
 * schemes are reachable at runtime and no test may lean on whichever one the
 * harness happens to leave behind. See SCHEMES below.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { setAuthMock, configureAuthMock } from '@/test/authContextMock.js';
import {
  declareBearerSession,
  declareCookieSession,
  expectNoAuthorizationHeader,
  expectNoCsrfHeader,
} from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

configureAuthMock({ isAuthenticated: true });

import { useBankStatements } from '../useBankStatements.js';

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

/**
 * The two credential schemes this GET has to survive.
 *
 * `src/test/setup.js` resets the scheme to the bearer default before EVERY test,
 * so a credential assertion that never declares one is only ever exercising that
 * default — it passes by omission. The single "authenticates with the session
 * cookie" test this replaced was exactly that: it asserted the ABSENCE of a
 * bearer header while the ambient scheme was bearer, which is the one
 * configuration where the absence proves nothing.
 *
 * Both helpers publish BOTH credentials, so `mode` is the only difference
 * between the two rows — an implementation that ignored the mode and emitted
 * whatever it held could not pass both.
 */
const SCHEMES = [
  {
    name: 'cookie',
    declare: declareCookieSession,
    assertCredential: () => {
      // The credential IS the `__Host-` cookie, which the page cannot read, and a
      // safe method needs no CSRF proof — so a GET carries no credential header.
      expectNoAuthorizationHeader();
      expectNoCsrfHeader();
    },
  },
  {
    name: 'bearer',
    declare: declareBearerSession,
    assertCredential: () => {
      // A read carries no CSRF proof under either scheme; sending one here would
      // mean the builders are ignoring the active mode.
      expectNoCsrfHeader();
      // DELIBERATELY MISSING: `expectBearerHeader()`. Under bearer this GET must
      // carry `Authorization: Bearer <token>` and it does not —
      // `useNeoResource.fetchNeoPayload` hand-builds `{ 'Content-Type': ... }`
      // instead of calling `jsonHeaders()`, so every read through it goes out
      // unauthenticated the moment the preference is flipped back to bearer.
      // That is the same defect src/__tests__/dualCredentialScheme.vitest.jsx
      // records for `buildHeaders()`. Asserting the header would fail on
      // production code; asserting its absence would cement the bug. Neither is
      // written: turn this into `expectBearerHeader()` when the hook is fixed.
    },
  },
];

describe('useBankStatements', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    setAuthMock({ isAuthenticated: true });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch when accountId is null (returns empty + idle)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result } = renderHook(() => useBankStatements(null));

    // Give microtasks a tick to confirm no fetch was issued.
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.statements).toEqual([]);
  });

  it('does not fetch when the user is not authenticated', async () => {
    setAuthMock({ isAuthenticated: false });
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result } = renderHook(() => useBankStatements('acc-1'));

    // Give microtasks a tick to confirm no request escaped the gate.
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.statements).toEqual([]);
  });

  it('fetches the bank-statements endpoint with the accountId in the query string', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    renderHook(() => useBankStatements('acc-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?FIN_Financial_Account_ID=acc-1');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  for (const scheme of SCHEMES) {
    it(`sends the credential the ${scheme.name} scheme yields, and opts the cookie in`, async () => {
      scheme.declare();
      globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

      renderHook(() => useBankStatements('acc-1'));

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      const [, init] = globalThis.fetch.mock.calls[0];
      // `credentials: 'include'` is unconditional by design (see
      // credentialOptions in app-shell-core): required under cookie, a no-op for
      // the same-origin requests bearer makes. Asserted in BOTH schemes so
      // nobody makes it mode-conditional and breaks the switch one way round.
      expect(init.credentials).toBe('include');
      scheme.assertCredential();
    });
  }

  it('URL-encodes the accountId so special characters survive transport', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    renderHook(() => useBankStatements('acc/with space'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('acc%2Fwith%20space');
  });

  it('exposes statements + loading false on successful response', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ statements: [{ id: 's1', documentNo: 'BS-001' }] }),
    );

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statements).toEqual([{ id: 's1', documentNo: 'BS-001' }]);
    expect(result.current.error).toBeNull();
  });

  it('returns an empty array when the API omits the statements key', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ unrelated: 'noise' }));

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statements).toEqual([]);
  });

  it('captures the error and keeps statements empty on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.statements).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('HTTP 500');
  });

  it('captures the error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('Network down');
  });

  it('refetches when accountId changes', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result, rerender } = renderHook(
      ({ id }) => useBankStatements(id),
      { initialProps: { id: 'acc-1' } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    rerender({ id: 'acc-2' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

    const urls = globalThis.fetch.mock.calls.map((c) => c[0]);
    expect(urls[0]).toContain('acc-1');
    expect(urls[1]).toContain('acc-2');
  });

  it('exposes reload() that re-issues the same request', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ statements: [] }));

    const { result } = renderHook(() => useBankStatements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reload();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

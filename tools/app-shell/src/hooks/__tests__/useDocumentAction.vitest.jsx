/**
 * ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
 * hook holds no bearer token: its request must carry `credentials: 'include'`
 * and NO Authorization header, ever.
 *
 * The `token` OPTION is gone from the signature — the hook reads the CSRF proof
 * from `useAuth().csrfToken` itself. `baseOpts` below therefore no longer
 * carries a token, which is the signature change this suite pins; one dedicated
 * test still hands it a stray `token` as a hostile input so a rename-only
 * refactor (option kept, header still built) cannot pass.
 *
 * The only request this hook issues is a POST, i.e. an unsafe method, so the
 * `X-Go-CSRF` proof header is legitimate on it — but it must be omitted
 * entirely, not sent empty, when no proof is available.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, act } from '@testing-library/react';
import { setAuthMock } from '@/test/authContextMock.js';
import { declareCookieSession, expectNoAuthorizationHeader } from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

import { useDocumentAction } from '../useDocumentAction';

const CSRF_HEADER = 'X-Go-CSRF';

/** Falsy proofs that must all collapse to "no CSRF header at all". */
const MISSING_PROOFS = [
  ['undefined', undefined],
  ['null', null],
  ['an empty string', ''],
];

/** The init object of the most recent fetch call. */
function lastInit() {
  const calls = globalThis.fetch.mock.calls;
  return calls[calls.length - 1][1];
}

describe('useDocumentAction', () => {
  const baseOpts = {
    apiBaseUrl: 'http://localhost/api',
    entity: 'header',
  };

  beforeEach(() => {
    // ETP-4576 — declare the scheme this suite asserts on. The builders read the
    // active scheme, and src/test/setup.js resets it to the bearer default before
    // every test, so a suite expecting the CSRF proof has to say so.
    declareCookieSession();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading=false and error=null', () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('executes a document action with correct URL and payload', async () => {
    const responseData = { response: { status: 'Success' } };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => responseData,
    });

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let data;
    await act(async () => {
      data = await result.current.execute('record-123', 'CO');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/record-123/action/documentAction',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ docAction: 'CO' }),
        credentials: 'include',
        headers: expect.objectContaining({
          [CSRF_HEADER]: 'test-csrf',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expectNoAuthorizationHeader();
    expect(data).toEqual(responseData);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("passes credentials: 'include' so the __Host-go_session cookie travels", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useDocumentAction(baseOpts));
    await act(async () => { await result.current.execute('rec-1', 'CO'); });
    expect(lastInit().credentials).toBe('include');
  });

  it('never sends an Authorization header', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useDocumentAction(baseOpts));
    await act(async () => { await result.current.execute('rec-1', 'CO'); });
    expectNoAuthorizationHeader();
  });

  it('works without being handed a token — the option no longer exists', async () => {
    // baseOpts deliberately carries no `token`. If the hook still depended on
    // one, the request would go out with a `Bearer undefined` header.
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { result } = renderHook(() => useDocumentAction(baseOpts));
    await act(async () => { await result.current.execute('rec-1', 'CO'); });
    expectNoAuthorizationHeader();
    expect(result.current.error).toBeNull();
  });

  it('ignores a stray token option — a leftover credential reaches no wire', async () => {
    // Hostile input: a caller that was not cleaned up yet keeps threading the
    // now-dead prop. It must not resurrect an Authorization header.
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() =>
      useDocumentAction({ ...baseOpts, token: 'legacy-token' })
    );
    await act(async () => { await result.current.execute('rec-1', 'CO'); });
    expectNoAuthorizationHeader();
    expect(JSON.stringify(lastInit().headers)).not.toContain('legacy-token');
  });

  for (const [label, value] of MISSING_PROOFS) {
    it(`omits ${CSRF_HEADER} entirely when csrfToken is ${label}`, async () => {
      // A session can be authenticated before the CSRF proof lands. The header
      // must be absent, never present with an empty/undefined value.
      setAuthMock({ isAuthenticated: true, csrfToken: value });
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      const { result } = renderHook(() => useDocumentAction(baseOpts));
      await act(async () => { await result.current.execute('rec-1', 'CO'); });
      const init = lastInit();
      expect(CSRF_HEADER in init.headers).toBe(false);
      expect(init.credentials).toBe('include');
      expectNoAuthorizationHeader();
    });
  }

  it('sets loading=true during execution', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; })
    );

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let executePromise;
    act(() => {
      executePromise = result.current.execute('rec-1', 'CO').catch(() => {});
    });

    // loading should be true while fetch is pending
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ success: true }),
      });
      await executePromise;
    });

    expect(result.current.loading).toBe(false);
  });

  it('throws and sets error when recordId is missing', async () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute(null, 'CO');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('useDocumentAction.execute requires recordId and docAction');
    expect(result.current.error).toBe('useDocumentAction.execute requires recordId and docAction');
  });

  it('throws and sets error when docAction is missing', async () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute('rec-1', null);
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('useDocumentAction.execute requires recordId and docAction');
  });

  it('handles server error with message from response payload', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ response: { message: 'Document already completed' } }),
    });

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute('rec-1', 'CO');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError.message).toBe('Document already completed');
    expect(result.current.error).toBe('Document already completed');
    expect(result.current.loading).toBe(false);
  });

  it('handles server error with fallback status code', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('invalid json'); },
    });

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute('rec-1', 'CO');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError.message).toBe('Error 500');
    expect(result.current.error).toBe('Error 500');
  });

  it('calls onSuccess callback on success', async () => {
    const responseData = { ok: true };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => responseData,
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    await act(async () => {
      await result.current.execute('rec-1', 'CO', { onSuccess });
    });

    expect(onSuccess).toHaveBeenCalledWith(responseData);
  });

  it('calls onError callback on failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });

    const onError = vi.fn();
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    await act(async () => {
      await result.current.execute('rec-1', 'CO', { onError }).catch(() => {});
    });

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toBe('Forbidden');
  });

  it('clearError resets the error state', async () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    await act(async () => {
      await result.current.execute(null, 'CO').catch(() => {});
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('uses default entity "header" when not specified', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() =>
      useDocumentAction({ apiBaseUrl: 'http://localhost/api' })
    );

    await act(async () => {
      await result.current.execute('rec-1', 'CO');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/rec-1/action/documentAction',
      expect.anything(),
    );
  });
});

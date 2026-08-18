/**
 * ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
 * hook holds no bearer token: every request must carry `credentials: 'include'`
 * and NO Authorization header.
 *
 * This hook is the subtle one in the batch: it has a single generic
 * `call(method, action, …)` whose method is a PARAMETER, and callers pass both
 * 'GET' (accounts / providers / status) and 'POST' (connect / link /
 * createAndLink / reconnect / disconnect / sync / import-settings). The CSRF
 * proof header `X-Go-CSRF` is only legitimate on the unsafe methods, so both
 * sides of that branch are asserted here: a POST action MUST send it, a GET
 * action MUST NOT. A blanket "always send it" implementation and a "never send
 * it" one both have to fail.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { setAuthMock } from '@/test/authContextMock.js';
import { declareCookieSession, expectNoAuthorizationHeader } from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('../useNeoResource', () => ({
  getApiBase: () => '',
}));

import {
  useBankConnectionActions,
  launchSaltEdgePopup,
  BANK_CONNECTION_CALLBACK_PATH,
  BANK_CONNECTION_KEY,
} from '../useBankConnectionActions';

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

describe('useBankConnectionActions — constants', () => {
  it('exposes the SPA callback path and connection storage key', () => {
    expect(BANK_CONNECTION_CALLBACK_PATH).toBe('/financial-account/bank-connection-callback');
    expect(BANK_CONNECTION_KEY).toBe('bankConnection:lastConnectionId');
  });
});

describe('useBankConnectionActions — hook', () => {
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

  it('starts with loading false and no error', () => {
    const { result } = renderHook(() => useBankConnectionActions());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('connect posts to the bridge and returns the connectUrl', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ connectUrl: 'https://saltedge/connect' }));

    const { result } = renderHook(() => useBankConnectionActions());
    let url;
    await act(async () => {
      url = await result.current.connect();
    });

    expect(url).toBe('https://saltedge/connect');
    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('/sws/neo/financial-account-bank-connection');
    expect(calledUrl).toContain('action=connect');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
    expect(JSON.parse(init.body)).toEqual({});
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('connect sends the financialAccountId in the body when provided', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ connectUrl: 'https://x' }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.connect('FA-1');
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1' });
  });

  it('fetchAccounts normalizes the payload and passes query params', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({
        accounts: [{ id: 'acc1' }],
        providerName: 'BBVA',
        providerLogoUrl: 'https://logo',
      }),
    );

    const { result } = renderHook(() => useBankConnectionActions());
    let data;
    await act(async () => {
      data = await result.current.fetchAccounts('conn-1', 'B', 'FA-1');
    });

    expect(data).toEqual({
      accounts: [{ id: 'acc1' }],
      providerName: 'BBVA',
      providerLogoUrl: 'https://logo',
    });
    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    // GET is a safe method — the CSRF proof must not be attached to it.
    expect(Object.keys(init.headers ?? {})).not.toContain('X-Go-CSRF');
    expectNoAuthorizationHeader();
    expect(calledUrl).toContain('action=accounts');
    expect(calledUrl).toContain('connectionId=conn-1');
    expect(calledUrl).toContain('type=B');
    expect(calledUrl).toContain('financialAccountId=FA-1');
  });

  it('fetchAccounts falls back to empty defaults when fields are missing', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({}));

    const { result } = renderHook(() => useBankConnectionActions());
    let data;
    await act(async () => {
      data = await result.current.fetchAccounts('conn-1');
    });

    expect(data).toEqual({ accounts: [], providerName: '', providerLogoUrl: '' });
  });

  it('fetchProviders returns the providers array with a short timeout', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ providers: [{ code: 'p1' }] }));

    const { result } = renderHook(() => useBankConnectionActions());
    let providers;
    await act(async () => {
      providers = await result.current.fetchProviders('ES', 'bbva');
    });

    expect(providers).toEqual([{ code: 'p1' }]);
    const [calledUrl] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=providers');
    expect(calledUrl).toContain('country=ES');
    expect(calledUrl).toContain('q=bbva');
  });

  it('fetchProviders returns an empty array when the payload has no providers', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({}));

    const { result } = renderHook(() => useBankConnectionActions());
    let providers;
    await act(async () => {
      providers = await result.current.fetchProviders();
    });

    expect(providers).toEqual([]);
  });

  it('link posts the payload as the body', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ok: true }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.link({ financialAccountId: 'FA-1', connectionId: 'c1' });
    });

    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=link');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1', connectionId: 'c1' });
  });

  it('createAndLink posts the payload as the body', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ id: 'new' }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.createAndLink({ type: 'B', connectionId: 'c1' });
    });

    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=createAndLink');
    expect(JSON.parse(init.body)).toEqual({ type: 'B', connectionId: 'c1' });
  });

  it('reconnect returns the reconnectUrl', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ reconnectUrl: 'https://reconnect' }));

    const { result } = renderHook(() => useBankConnectionActions());
    let url;
    await act(async () => {
      url = await result.current.reconnect('FA-1');
    });

    expect(url).toBe('https://reconnect');
    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=reconnect');
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1' });
  });

  it('disconnect posts the financialAccountId', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ok: true }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.disconnect('FA-1');
    });

    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=disconnect');
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1' });
  });

  it('sync posts the financialAccountId', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ok: true }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.sync('FA-1');
    });

    const [calledUrl] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=sync');
  });

  it('saveImportSettings posts to the import-settings action', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ok: true }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.saveImportSettings({ financialAccountId: 'FA-1', frequency: 'daily' });
    });

    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=import-settings');
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1', frequency: 'daily' });
  });

  it('fetchStatus issues a GET with the financialAccountId query', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ connected: true }));

    const { result } = renderHook(() => useBankConnectionActions());
    let status;
    await act(async () => {
      status = await result.current.fetchStatus('FA-1');
    });

    expect(status).toEqual({ connected: true });
    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    // GET is a safe method — the CSRF proof must not be attached to it.
    expect(Object.keys(init.headers ?? {})).not.toContain('X-Go-CSRF');
    expectNoAuthorizationHeader();
    expect(calledUrl).toContain('action=status');
    expect(calledUrl).toContain('financialAccountId=FA-1');
  });

  // ── CSRF proof: both sides of the generic call(method, …) branch ────────────
  // `call` takes the method as a parameter, so the header decision cannot be
  // hardcoded per-callsite. Every POST action must carry X-Go-CSRF and every GET
  // action must not, exercised through the public API of the hook.
  const POST_ACTIONS = [
    { label: 'connect', invoke: (api) => api.connect('FA-1') },
    { label: 'link', invoke: (api) => api.link({ financialAccountId: 'FA-1' }) },
    { label: 'createAndLink', invoke: (api) => api.createAndLink({ type: 'B' }) },
    { label: 'reconnect', invoke: (api) => api.reconnect('FA-1') },
    { label: 'disconnect', invoke: (api) => api.disconnect('FA-1') },
    { label: 'sync', invoke: (api) => api.sync('FA-1') },
    { label: 'import-settings', invoke: (api) => api.saveImportSettings({ financialAccountId: 'FA-1' }) },
  ];

  const GET_ACTIONS = [
    { label: 'accounts', invoke: (api) => api.fetchAccounts('conn-1') },
    { label: 'providers', invoke: (api) => api.fetchProviders('ES') },
    { label: 'status', invoke: (api) => api.fetchStatus('FA-1') },
  ];

  for (const { label, invoke } of POST_ACTIONS) {
    it(`sends X-Go-CSRF on the unsafe ${label} action`, async () => {
      globalThis.fetch.mockResolvedValue(okResponse({}));
      const { result } = renderHook(() => useBankConnectionActions());

      await act(async () => { await invoke(result.current); });

      const [, init] = globalThis.fetch.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
      expectNoAuthorizationHeader();
    });
  }

  for (const { label, invoke } of GET_ACTIONS) {
    it(`does not send X-Go-CSRF on the safe ${label} action`, async () => {
      globalThis.fetch.mockResolvedValue(okResponse({}));
      const { result } = renderHook(() => useBankConnectionActions());

      await act(async () => { await invoke(result.current); });

      const [, init] = globalThis.fetch.mock.calls[0];
      expect(init.method).toBe('GET');
      expect(init.credentials).toBe('include');
      expect(Object.keys(init.headers ?? {})).not.toContain('X-Go-CSRF');
      expectNoAuthorizationHeader();
    });
  }

  it('omits X-Go-CSRF entirely on a POST action when no CSRF proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands; the header must
    // be added defensively, never sent as an empty/undefined value.
    setAuthMock({ isAuthenticated: true, csrfToken: null });
    globalThis.fetch.mockResolvedValue(okResponse({}));
    const { result } = renderHook(() => useBankConnectionActions());

    await act(async () => { await result.current.sync('FA-1'); });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(Object.keys(init.headers ?? {})).not.toContain('X-Go-CSRF');
    expect(init.credentials).toBe('include');
    expectNoAuthorizationHeader();
  });

  it('returns an empty object when the response has no data payload', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useBankConnectionActions());
    let data;
    await act(async () => {
      data = await result.current.sync('FA-1');
    });

    expect(data).toEqual({});
  });

  it('surfaces a server error message and status, then sets error state', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bank rejected', status: 422 } }),
    });

    const { result } = renderHook(() => useBankConnectionActions());
    let thrown;
    await act(async () => {
      try {
        await result.current.sync('FA-1');
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe('Bank rejected');
    expect(thrown.status).toBe(422);
    await waitFor(() => expect(result.current.error).toBe(thrown));
    expect(result.current.loading).toBe(false);
  });

  it('falls back to an HTTP status message when the error body has no message', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
    });

    const { result } = renderHook(() => useBankConnectionActions());
    let thrown;
    await act(async () => {
      try {
        await result.current.sync('FA-1');
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown.message).toBe('HTTP 503');
    expect(thrown.status).toBe(503);
  });

  it('maps an AbortError to a BANK_CONNECTION_TIMEOUT error', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    globalThis.fetch.mockRejectedValue(abortErr);

    const { result } = renderHook(() => useBankConnectionActions());
    let thrown;
    await act(async () => {
      try {
        await result.current.sync('FA-1');
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown.message).toBe('BANK_CONNECTION_TIMEOUT');
    await waitFor(() => expect(result.current.error?.message).toBe('BANK_CONNECTION_TIMEOUT'));
  });

  it('propagates a generic network error unchanged', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useBankConnectionActions());
    let thrown;
    await act(async () => {
      try {
        await result.current.sync('FA-1');
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown.message).toBe('Network down');
  });
});

describe('launchSaltEdgePopup', () => {
  let popup;
  let openSpy;

  beforeEach(() => {
    popup = { location: { href: '' }, closed: false, close: vi.fn() };
    openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);
    Object.defineProperty(window, 'screen', {
      value: { width: 1000, height: 800 },
      writable: true,
      configurable: true,
    });
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws POPUP_BLOCKED when window.open returns null', async () => {
    openSpy.mockReturnValue(null);
    await expect(launchSaltEdgePopup(async () => 'https://url')).rejects.toThrow('POPUP_BLOCKED');
  });

  it('closes the popup and rethrows when getConnectUrl fails', async () => {
    await expect(
      launchSaltEdgePopup(async () => { throw new Error('resolve failed'); }),
    ).rejects.toThrow('resolve failed');
    expect(popup.close).toHaveBeenCalled();
  });

  it('closes the popup and throws NO_CONNECT_URL when no url resolves', async () => {
    await expect(launchSaltEdgePopup(async () => '')).rejects.toThrow('NO_CONNECT_URL');
    expect(popup.close).toHaveBeenCalled();
  });

  it('navigates the popup and resolves the connection id from a postMessage', async () => {
    const promise = launchSaltEdgePopup(async () => 'https://connect');

    await waitFor(() => expect(popup.location.href).toBe('https://connect'));

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'bank-connection-connected', connectionId: 'CONN-42' },
      }),
    );

    await expect(promise).resolves.toBe('CONN-42');
  });

  it('ignores postMessages from a foreign origin', async () => {
    vi.useFakeTimers();
    try {
      const promise = launchSaltEdgePopup(async () => 'https://connect');
      await Promise.resolve();

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example',
          data: { type: 'bank-connection-connected', connectionId: 'HACK' },
        }),
      );

      popup.closed = true;
      await vi.advanceTimersByTimeAsync(600);

      await expect(promise).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves the stored connection id picked up by the poll timer', async () => {
    vi.useFakeTimers();
    try {
      const promise = launchSaltEdgePopup(async () => 'https://connect');
      await Promise.resolve();

      localStorage.setItem(BANK_CONNECTION_KEY, 'STORED-7');
      await vi.advanceTimersByTimeAsync(600);

      await expect(promise).resolves.toBe('STORED-7');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves null when the popup is closed without finishing', async () => {
    vi.useFakeTimers();
    try {
      const promise = launchSaltEdgePopup(async () => 'https://connect');
      await Promise.resolve();

      popup.closed = true;
      await vi.advanceTimersByTimeAsync(600);

      await expect(promise).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

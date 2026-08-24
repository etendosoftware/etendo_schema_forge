/**
 * ETP-4576 — this hook under BOTH credential schemes.
 *
 * Which scheme is live is a backend preference, so both are reachable at runtime:
 *   - bearer — `Authorization: Bearer <token>` on every request, no CSRF proof;
 *   - cookie — the `__Host-go_session` cookie travels via `credentials: 'include'`
 *              and unsafe methods prove intent with `X-Go-CSRF`; reads carry no
 *              credential header at all.
 * Neither may be the one a test happens to inherit: `src/test/setup.js` resets to
 * the bearer default before EVERY test, so an assertion like "no Authorization
 * header was sent" that declares no scheme passes by OMISSION — it only ever
 * exercises that default and proves nothing about the other one.
 *
 * This hook is the subtle one in the batch: it has a single generic
 * `call(method, action, …)` whose method is a PARAMETER, and callers pass both
 * 'GET' (accounts / providers / status) and 'POST' (connect / link /
 * createAndLink / reconnect / disconnect / sync / import-settings). So the header
 * decision has two independent inputs — the active scheme and the method's safety
 * — and every credential-sensitive test below drives the same call site once per
 * scheme, asserting the header that must be PRESENT and the one that must be
 * ABSENT both times.
 *
 * An implementation that always sends the CSRF proof, one that never sends it,
 * one that ignores the active mode, and one that sends both credentials at once
 * each have to fail at least one of the four assertion sets in SCHEMES.
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

/**
 * The two schemes, each with the FULL header contract it promises.
 *
 * Both `declare` helpers publish BOTH credentials (see src/test/sessionContract.js),
 * so `mode` is the only thing that differs between them — that is what makes an
 * implementation which ignores the mode and emits whatever it holds fail, instead
 * of passing the absence checks for the wrong reason ("nothing to emit").
 *
 * `assertUnsafe` and `assertSafe` are separate because the CSRF proof is only
 * legitimate on POST/PUT/PATCH/DELETE; `assertCredential` is the scheme's own
 * credential alone, for the cases where the proof is deliberately unavailable.
 */
const SCHEMES = [
  {
    name: 'bearer',
    declare: declareBearerSession,
    assertCredential: () => expectBearerHeader(),
    // Reads carry the token just as much as writes do: a builder left
    // credential-less while only the cookie scheme existed silently
    // unauthenticated every GET the moment bearer came back.
    assertUnsafe: () => { expectBearerHeader(); expectNoCsrfHeader(); },
    assertSafe: () => { expectBearerHeader(); expectNoCsrfHeader(); },
  },
  {
    name: 'cookie',
    declare: declareCookieSession,
    assertCredential: () => expectNoAuthorizationHeader(),
    assertUnsafe: (init) => {
      expect(init.headers['X-Go-CSRF']).toBe(TEST_CSRF_TOKEN);
      expectNoAuthorizationHeader();
    },
    assertSafe: (init) => {
      // A read needs no proof of intent — the browser attaches the `__Host-`
      // cookie and nothing else is required.
      expect(Object.keys(init.headers ?? {})).not.toContain('X-Go-CSRF');
      expectNoAuthorizationHeader();
    },
  },
];

describe('useBankConnectionActions — constants', () => {
  it('exposes the SPA callback path and connection storage key', () => {
    expect(BANK_CONNECTION_CALLBACK_PATH).toBe('/financial-account/bank-connection-callback');
    expect(BANK_CONNECTION_KEY).toBe('bankConnection:lastConnectionId');
  });
});

describe('useBankConnectionActions — hook', () => {
  beforeEach(() => {
    // ETP-4576 — baseline for the tests that are NOT about credentials (URL
    // shape, payload normalization, error mapping): they still have to run under
    // a real scheme, and the cookie session is the target one. Every
    // credential-sensitive test below overrides this by declaring its own scheme
    // and runs once per scheme, so none of them depends on this line.
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

  for (const scheme of SCHEMES) {
    it(`connect posts to the bridge and returns the connectUrl under the ${scheme.name} scheme`, async () => {
      scheme.declare();
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
      // Unconditional in both schemes: required for the cookie to travel, a no-op
      // for bearer. Making it scheme-conditional would break the switch one way.
      expect(init.credentials).toBe('include');
      scheme.assertUnsafe(init);
      expect(JSON.parse(init.body)).toEqual({});
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  }

  it('connect sends the financialAccountId in the body when provided', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ connectUrl: 'https://x' }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.connect('FA-1');
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1' });
  });

  for (const scheme of SCHEMES) {
    it(`fetchAccounts normalizes the payload and passes query params under the ${scheme.name} scheme`, async () => {
      scheme.declare();
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
      // GET is a safe method: no CSRF proof in either scheme, and whichever
      // credential the scheme does use must still be there.
      scheme.assertSafe(init);
      expect(calledUrl).toContain('action=accounts');
      expect(calledUrl).toContain('connectionId=conn-1');
      expect(calledUrl).toContain('type=B');
      expect(calledUrl).toContain('financialAccountId=FA-1');
    });
  }

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

  it('disconnect posts the financialAccountId and defaults to a soft disconnect', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ok: true }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.disconnect('FA-1');
    });

    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=disconnect');
    // Defaulting to false keeps the recoverable behavior when no mode is given.
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1', permanentDeletion: false });
  });

  it('disconnect forwards permanentDeletion when a permanent removal is requested', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ok: true }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.disconnect('FA-1', { permanentDeletion: true });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'FA-1', permanentDeletion: true });
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

  for (const scheme of SCHEMES) {
    it(`fetchStatus issues a GET with the financialAccountId query under the ${scheme.name} scheme`, async () => {
      scheme.declare();
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
      scheme.assertSafe(init);
      expect(calledUrl).toContain('action=status');
      expect(calledUrl).toContain('financialAccountId=FA-1');
    });
  }

  // ── credential contract: scheme x method-safety, over every action ─────────
  // `call` takes the method as a parameter, so the header decision cannot be
  // hardcoded per-callsite — and the scheme is a second, independent input. Every
  // action is therefore driven once per scheme through the hook's public API: an
  // unsafe action must carry the active scheme's proof, a safe one must not, and
  // neither may ever carry the other scheme's credential.
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

  for (const scheme of SCHEMES) {
    for (const { label, invoke } of POST_ACTIONS) {
      it(`sends the ${scheme.name} scheme's write credential on the unsafe ${label} action`, async () => {
        scheme.declare();
        globalThis.fetch.mockResolvedValue(okResponse({}));
        const { result } = renderHook(() => useBankConnectionActions());

        await act(async () => { await invoke(result.current); });

        const [, init] = globalThis.fetch.mock.calls[0];
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('include');
        scheme.assertUnsafe(init);
      });
    }

    for (const { label, invoke } of GET_ACTIONS) {
      it(`sends no write proof on the safe ${label} action under the ${scheme.name} scheme`, async () => {
        scheme.declare();
        globalThis.fetch.mockResolvedValue(okResponse({}));
        const { result } = renderHook(() => useBankConnectionActions());

        await act(async () => { await invoke(result.current); });

        const [, init] = globalThis.fetch.mock.calls[0];
        expect(init.method).toBe('GET');
        expect(init.credentials).toBe('include');
        scheme.assertSafe(init);
      });
    }

    it(`omits X-Go-CSRF on a POST under the ${scheme.name} scheme when the session holds no proof`, async () => {
      scheme.declare();
      // A session can be authenticated before the CSRF proof lands; the header
      // must be added defensively, never sent as an empty/undefined value. The
      // token is kept so this stays the SAME session in both schemes — only the
      // proof is missing — and `setAuthMock` republishes it while preserving the
      // mode declared above, so the scheme is not silently changed here.
      setAuthMock({ isAuthenticated: true, token: TEST_BEARER_TOKEN, csrfToken: null });
      globalThis.fetch.mockResolvedValue(okResponse({}));
      const { result } = renderHook(() => useBankConnectionActions());

      await act(async () => { await result.current.sync('FA-1'); });

      const [, init] = globalThis.fetch.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(Object.keys(init.headers ?? {})).not.toContain('X-Go-CSRF');
      expect(init.credentials).toBe('include');
      // Under bearer the request is still authenticated by the token; under
      // cookie by the cookie, with no header at all.
      scheme.assertCredential();
    });
  }

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

// @covers tools/app-shell/src/hooks/useBankConnectionActions.js
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// ETP-6151 — flag `psd2-statement-import-settings`. Off by default: the pre-existing suites below
// describe the flag-off behaviour; the ETP-6151 block turns it on.
const importSettingsFlag = vi.hoisted(() => ({ on: false }));
vi.mock('../usePsd2ImportSettingsFlag.js', () => ({
  usePsd2ImportSettingsFlag: () => importSettingsFlag.on,
}));

vi.mock('../useNeoResource', () => ({
  getApiBase: () => '',
}));

import {
  useBankConnectionActions,
  launchSaltEdgePopup,
  BANK_CONNECTION_CALLBACK_PATH,
  BANK_CONNECTION_KEY,
  SYNC_STATUS_MAX_IDS,
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

  it('syncStatus reads every id in one GET request and returns the accounts map', async () => {
    const accounts = {
      'FA-1': { inProgress: true },
      'FA-2': { inProgress: false, lastSyncDate: '2026-11-05T10:00:00Z' },
    };
    globalThis.fetch.mockResolvedValue(okResponse({ accounts }));

    const { result } = renderHook(() => useBankConnectionActions());
    let out;
    await act(async () => {
      out = await result.current.syncStatus(['FA-1', 'FA-2']);
    });

    expect(out).toEqual(accounts);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('action=syncStatus');
    // ETP-6154 follow-up — GET with the ids as a comma-separated query param (read access only).
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(calledUrl).toContain(`financialAccountIds=${encodeURIComponent('FA-1,FA-2')}`);
  });

  it.each([
    ['no accounts key', {}],
    ['a null accounts value', { accounts: null }],
    ['a non-object accounts value', { accounts: 'nope' }],
  ])('syncStatus returns an empty map when the payload has %s', async (_label, payload) => {
    globalThis.fetch.mockResolvedValue(okResponse(payload));

    const { result } = renderHook(() => useBankConnectionActions());
    let out;
    await act(async () => {
      out = await result.current.syncStatus(['FA-1']);
    });

    expect(out).toEqual({});
  });

  // The ids one syncStatus GET carried, decoded from its query string.
  function idsOfCall(n) {
    const [calledUrl] = globalThis.fetch.mock.calls[n];
    return new URL(calledUrl, 'http://localhost').searchParams.get('financialAccountIds').split(',');
  }

  it('syncStatus splits more than SYNC_STATUS_MAX_IDS ids into chunks and merges their maps', async () => {
    expect(SYNC_STATUS_MAX_IDS).toBe(200);
    const ids = Array.from({ length: 201 }, (_, i) => `FA-${i}`);
    globalThis.fetch
      .mockResolvedValueOnce(okResponse({ accounts: { 'FA-0': { inProgress: true }, 'FA-199': { inProgress: false } } }))
      .mockResolvedValueOnce(okResponse({ accounts: { 'FA-200': { inProgress: true } } }));

    const { result } = renderHook(() => useBankConnectionActions());
    let out;
    await act(async () => {
      out = await result.current.syncStatus(ids);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(idsOfCall(0)).toEqual(ids.slice(0, 200));
    expect(idsOfCall(1)).toEqual(['FA-200']);
    globalThis.fetch.mock.calls.forEach(([, init]) => expect(init.method).toBe('GET'));
    expect(out).toEqual({
      'FA-0': { inProgress: true },
      'FA-199': { inProgress: false },
      'FA-200': { inProgress: true },
    });
  });

  it('syncStatus drops duplicate and empty ids before chunking', async () => {
    // 200 distinct ids once duplicates and empties are gone: ONE request, not two.
    const distinct = Array.from({ length: 200 }, (_, i) => `FA-${i}`);
    const noisy = [...distinct, 'FA-0', 'FA-199', '', null, undefined, 'FA-5'];
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: {} }));

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.syncStatus(noisy);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(idsOfCall(0)).toEqual(distinct);
  });

  it.each([
    ['an empty array', []],
    ['only empty ids', ['', null, undefined]],
    ['null', null],
    ['undefined', undefined],
  ])('syncStatus sends no request and returns {} for %s', async (_label, input) => {
    const { result } = renderHook(() => useBankConnectionActions());
    let out;
    await act(async () => {
      out = await result.current.syncStatus(input);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });

  it('syncStatus URL-encodes an id that needs it', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: {} }));
    const odd = 'FA 1&x=2/ñ';

    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => {
      await result.current.syncStatus([odd, 'FA-2']);
    });

    const [calledUrl] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain(`financialAccountIds=${encodeURIComponent(`${odd},FA-2`)}`);
    expect(calledUrl).not.toContain('&x=2');
    expect(idsOfCall(0)).toEqual([odd, 'FA-2']);
  });

  // Current behaviour: the chunks run in parallel through Promise.all, so ONE failing chunk
  // rejects the whole read and the maps of the chunks that did answer are discarded.
  it('syncStatus rejects the whole read when one chunk fails', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `FA-${i}`);
    globalThis.fetch
      .mockResolvedValueOnce(okResponse({ accounts: { 'FA-0': { inProgress: true } } }))
      .mockResolvedValueOnce({
        ok: false, status: 500, json: async () => ({ error: { message: 'chunk failed' } }),
      });

    const { result } = renderHook(() => useBankConnectionActions());
    let out;
    let thrown;
    await act(async () => {
      try {
        out = await result.current.syncStatus(ids);
      } catch (err) {
        thrown = err;
      }
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(out).toBeUndefined();
    expect(thrown?.message).toBe('chunk failed');
    expect(thrown?.status).toBe(500);
  });

  it('syncStatus gives up after 15 s (BANK_CONNECTION_TIMEOUT), well before the 45 s default', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const abortErr = new Error('aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      }));

      const { result } = renderHook(() => useBankConnectionActions());
      let thrown = null;
      const pending = result.current.syncStatus(['FA-1']).catch((err) => { thrown = err; });

      await act(async () => { await vi.advanceTimersByTimeAsync(14999); });
      expect(thrown).toBeNull();

      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      await pending;
      expect(thrown?.message).toBe('BANK_CONNECTION_TIMEOUT');
    } finally {
      vi.useRealTimers();
    }
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
    expect(calledUrl).toContain('action=status');
    expect(calledUrl).toContain('financialAccountId=FA-1');
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

  it('carries the error body code on the thrown error (translated by identity downstream)', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: { message: 'Could not acquire the sync lock', status: 503, code: 'BANK_SYNC_LOCK_UNAVAILABLE' },
      }),
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

    expect(thrown.message).toBe('Could not acquire the sync lock');
    expect(thrown.status).toBe(503);
    expect(thrown.code).toBe('BANK_SYNC_LOCK_UNAVAILABLE');
  });

  it('leaves code undefined when the error body has none', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bank rejected' } }),
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

    expect(thrown.message).toBe('Bank rejected');
    expect(thrown).not.toHaveProperty('code');
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

/**
 * ETP-5179 — `fetchAccounts` must forward the bridge's empty-list diagnosis.
 *
 * The hook used to normalize the payload down to a fixed three-field shape, which dropped the
 * `emptyReason` / `accountCurrency` the bridge now sends when the filtered list comes back empty.
 * Without them the flow can only raise its generic "no compatible accounts" toast, so a USD
 * account connected to a EUR-only bank never learns that currency was the cause.
 */
describe('useBankConnectionActions — fetchAccounts empty-list diagnosis', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function fetchAccountsWith(payload) {
    globalThis.fetch.mockResolvedValue(okResponse(payload));
    const { result } = renderHook(() => useBankConnectionActions());
    let data;
    await act(async () => {
      data = await result.current.fetchAccounts('conn-1', 'B', 'FA-USD');
    });
    return data;
  }

  it('propagates emptyReason and accountCurrency on a currency mismatch', async () => {
    const data = await fetchAccountsWith({
      accounts: [],
      emptyReason: 'currencyMismatch',
      accountCurrency: 'USD',
    });

    expect(data.accounts).toEqual([]);
    expect(data.emptyReason).toBe('currencyMismatch');
    expect(data.accountCurrency).toBe('USD');
  });

  it('propagates a reason that carries no currency', async () => {
    const data = await fetchAccountsWith({ accounts: [], emptyReason: 'typeMismatch' });

    expect(data.emptyReason).toBe('typeMismatch');
    expect(data.accountCurrency).toBeUndefined();
  });

  it('leaves both fields undefined when the backend sends neither', async () => {
    const data = await fetchAccountsWith({ accounts: [{ id: 'acc1' }], providerName: 'BBVA' });

    expect(data.emptyReason).toBeUndefined();
    expect(data.accountCurrency).toBeUndefined();
  });
});

/**
 * ETP-6151 — `link` / `createAndLink` return the bridge's top-level `messages` (NeoHints such as
 * the fetch-interval advisory) next to their data, so the flow can show them; every other action
 * keeps returning exactly its `data`. And `fetchAccounts` forwards the bank's `maxFetchInterval`
 * for the connect modal's advisory, undefined when the bridge publishes no usable number.
 */
describe('useBankConnectionActions — link advisories and fetch interval (ETP-6151)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    importSettingsFlag.on = true;
  });

  afterEach(() => {
    importSettingsFlag.on = false;
    vi.restoreAllMocks();
  });

  function responseWithMessages(data, messages) {
    return { ok: true, json: async () => ({ response: { data }, messages }) };
  }

  const WARNING = { type: 'warning', text: 'This bank only provides the last 90 days.' };

  it('flag off: link and createAndLink return exactly the bridge data, no messages key', async () => {
    importSettingsFlag.on = false;
    globalThis.fetch.mockResolvedValue(responseWithMessages({ linked: true }, [WARNING]));
    const { result } = renderHook(() => useBankConnectionActions());

    let linked;
    let created;
    await act(async () => {
      linked = await result.current.link({ financialAccountId: 'FA-1' });
      created = await result.current.createAndLink({ type: 'B', connectionId: 'c1' });
    });

    expect(linked).toEqual({ linked: true });
    expect(created).toEqual({ linked: true });
  });

  it('link returns the data together with the top-level messages', async () => {
    globalThis.fetch.mockResolvedValue(responseWithMessages({ linked: true }, [WARNING]));
    const { result } = renderHook(() => useBankConnectionActions());

    let data;
    await act(async () => {
      data = await result.current.link({
        financialAccountId: 'FA-1', connectionId: 'c1', saltEdgeAccountId: 'se1',
        importFromDate: '2026-11-01', statementGrouping: '1BM',
      });
    });

    expect(data).toEqual({ linked: true, messages: [WARNING] });
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      financialAccountId: 'FA-1', connectionId: 'c1', saltEdgeAccountId: 'se1',
      importFromDate: '2026-11-01', statementGrouping: '1BM',
    });
  });

  it('createAndLink returns the data together with the top-level messages', async () => {
    globalThis.fetch.mockResolvedValue(responseWithMessages({ id: 'new' }, [WARNING]));
    const { result } = renderHook(() => useBankConnectionActions());

    let data;
    await act(async () => {
      data = await result.current.createAndLink({ type: 'B', connectionId: 'c1' });
    });

    expect(data).toEqual({ id: 'new', messages: [WARNING] });
  });

  it('link returns an empty messages list when the response carries none', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ linked: true }));
    const { result } = renderHook(() => useBankConnectionActions());

    let data;
    await act(async () => {
      data = await result.current.link({ financialAccountId: 'FA-1' });
    });

    expect(data).toEqual({ linked: true, messages: [] });
  });

  it('link returns an empty messages list when messages is not an array', async () => {
    globalThis.fetch.mockResolvedValue(responseWithMessages({}, { type: 'warning' }));
    const { result } = renderHook(() => useBankConnectionActions());

    let data;
    await act(async () => {
      data = await result.current.createAndLink({ type: 'B' });
    });

    expect(data).toEqual({ messages: [] });
  });

  it('keeps every other action returning only its data, messages included in the body or not', async () => {
    globalThis.fetch.mockImplementation(async () => responseWithMessages({ ok: true }, [WARNING]));
    const { result } = renderHook(() => useBankConnectionActions());

    let saved;
    let synced;
    let status;
    await act(async () => {
      saved = await result.current.saveImportSettings({ financialAccountId: 'FA-1' });
      synced = await result.current.sync('FA-1');
      status = await result.current.fetchStatus('FA-1');
    });

    expect(saved).toEqual({ ok: true });
    expect(synced).toEqual({ ok: true });
    expect(status).toEqual({ ok: true });
  });

  async function fetchAccountsWith(payload) {
    globalThis.fetch.mockResolvedValue(okResponse(payload));
    const { result } = renderHook(() => useBankConnectionActions());
    let data;
    await act(async () => {
      data = await result.current.fetchAccounts('conn-1', 'B', 'FA-1');
    });
    return data;
  }

  it('fetchAccounts forwards the bank maxFetchInterval', async () => {
    const data = await fetchAccountsWith({ accounts: [{ id: 'a' }], maxFetchInterval: 180 });

    expect(data.maxFetchInterval).toBe(180);
  });

  it('fetchAccounts leaves maxFetchInterval undefined when the bridge omits it', async () => {
    const data = await fetchAccountsWith({ accounts: [{ id: 'a' }] });

    expect(data.maxFetchInterval).toBeUndefined();
  });

  it.each([
    ['a numeric string', '90'],
    ['null', null],
    ['an object', { days: 90 }],
  ])('fetchAccounts leaves maxFetchInterval undefined when it is %s', async (_label, value) => {
    const data = await fetchAccountsWith({ accounts: [], maxFetchInterval: value });

    expect(data.maxFetchInterval).toBeUndefined();
  });
});

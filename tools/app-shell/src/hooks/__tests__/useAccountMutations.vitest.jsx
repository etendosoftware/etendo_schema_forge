import { renderHook, act } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useAccountMutations } from '../useAccountMutations.js';

const ENTITY_URL = '/etendo/sws/neo/financial-account/account';

function okResponse(rows) {
  return { ok: true, json: async () => ({ response: { data: rows } }) };
}

function errorResponse(status, message) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  };
}

describe('useAccountMutations', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── createAccount ─────────────────────────────────────────────────────────

  it('createAccount POSTs to the W entity endpoint (no ?action=) with auth headers', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'acc-new', name: 'BBVA' }]));

    const { result } = renderHook(() => useAccountMutations());

    let created;
    await act(async () => {
      created = await result.current.createAccount({ name: 'BBVA', currencyId: '102' });
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(ENTITY_URL);
    expect(url).not.toContain('action=');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(created).toEqual({ id: 'acc-new', name: 'BBVA' });
  });

  it('createAccount maps the SPA payload to DAL names (currency, iBAN)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'acc-new' }]));

    const { result } = renderHook(() => useAccountMutations());
    await act(async () => {
      await result.current.createAccount({
        name: 'BBVA',
        type: 'B',
        currencyId: '102',
        iban: 'ES9121000418450200051332',
        swiftCode: 'CAIXESBBXXX',
      });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      name: 'BBVA',
      type: 'B',
      currency: '102',
      iBAN: 'ES9121000418450200051332',
      swiftCode: 'CAIXESBBXXX',
    });
  });

  it('createAccount omits keys that are absent from the payload', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'acc-new' }]));

    const { result } = renderHook(() => useAccountMutations());
    await act(async () => {
      await result.current.createAccount({ name: 'Caja', currencyId: '102' });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ name: 'Caja', currency: '102' });
    expect(body).not.toHaveProperty('swiftCode');
    expect(body).not.toHaveProperty('iBAN');
    expect(body).not.toHaveProperty('type');
  });

  it('createAccount returns the first record of the W envelope', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse([{ id: 'acc-1', name: 'First' }, { id: 'acc-2', name: 'Second' }]),
    );

    const { result } = renderHook(() => useAccountMutations());
    let created;
    await act(async () => {
      created = await result.current.createAccount({ name: 'First' });
    });
    expect(created).toEqual({ id: 'acc-1', name: 'First' });
  });

  it('createAccount unwraps a non-array data envelope', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ id: 'acc-obj', name: 'Object' }));

    const { result } = renderHook(() => useAccountMutations());
    let created;
    await act(async () => {
      created = await result.current.createAccount({ name: 'Object' });
    });
    expect(created).toEqual({ id: 'acc-obj', name: 'Object' });
  });

  it('createAccount returns null when the envelope has no data', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useAccountMutations());
    let created;
    await act(async () => {
      created = await result.current.createAccount({ name: 'X', currencyId: '102' });
    });
    expect(created).toBeNull();
  });

  it('createAccount returns null when the envelope data array is empty', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([]));

    const { result } = renderHook(() => useAccountMutations());
    let created;
    await act(async () => {
      created = await result.current.createAccount({ name: 'X' });
    });
    expect(created).toBeNull();
  });

  it('createAccount throws an Error with .status on a 409 (duplicate name)', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(409, 'duplicate name'));

    const { result } = renderHook(() => useAccountMutations());

    await act(async () => {
      await expect(
        result.current.createAccount({ name: 'BBVA', currencyId: '102' }),
      ).rejects.toMatchObject({ message: 'duplicate name', status: 409 });
    });
  });

  it('createAccount falls back to "HTTP <status>" when the error body is unparseable', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useAccountMutations());

    await act(async () => {
      await expect(
        result.current.createAccount({ name: 'X', currencyId: '102' }),
      ).rejects.toMatchObject({ message: 'HTTP 500', status: 500 });
    });
  });

  // ── updateAccount ─────────────────────────────────────────────────────────

  it('updateAccount PUTs to /account/{id} with the DAL-mapped body', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'acc-1', name: 'Renamed' }]));

    const { result } = renderHook(() => useAccountMutations());

    let updated;
    await act(async () => {
      updated = await result.current.updateAccount('acc-1', {
        name: 'Renamed',
        iban: 'ES9121000418450200051332',
      });
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${ENTITY_URL}/acc-1`);
    expect(url).not.toContain('action=');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Renamed',
      iBAN: 'ES9121000418450200051332',
    });
    expect(updated).toEqual({ id: 'acc-1', name: 'Renamed' });
  });

  it('updateAccount URL-encodes the account id', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'x', name: 'x' }]));

    const { result } = renderHook(() => useAccountMutations());
    await act(async () => {
      await result.current.updateAccount('acc/with space', { name: 'x' });
    });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${ENTITY_URL}/acc%2Fwith%20space`);
  });

  it('updateAccount throws with .status on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(409, 'taken'));

    const { result } = renderHook(() => useAccountMutations());
    await act(async () => {
      await expect(
        result.current.updateAccount('acc-1', { name: 'taken' }),
      ).rejects.toMatchObject({ message: 'taken', status: 409 });
    });
  });

  // ── archiveAccount ──────────────────────────────────────────────────────────

  it('archiveAccount DELETEs /account/{id} and returns true', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });

    const { result } = renderHook(() => useAccountMutations());

    let res;
    await act(async () => {
      res = await result.current.archiveAccount('acc-1');
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${ENTITY_URL}/acc-1`);
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(res).toBe(true);
  });

  it('archiveAccount throws with .status on a 409 (open reconciliations)', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(409, 'open reconciliations'));

    const { result } = renderHook(() => useAccountMutations());
    await act(async () => {
      await expect(result.current.archiveAccount('acc-1')).rejects.toMatchObject({
        message: 'open reconciliations',
        status: 409,
      });
    });
  });

  // ── fetchDefaults ───────────────────────────────────────────────────────────

  const SELECTORS_URL = `${ENTITY_URL}/selectors/C_Currency_ID?limit=200`;
  const DEFAULTS_URL = `${ENTITY_URL}/defaults`;

  /** Routes the fetch mock by URL: selector rows + defaults envelope. */
  function mockDefaultsFetch({ selectorJson, defaultsJson, defaultsFails } = {}) {
    globalThis.fetch.mockImplementation(async (url) => {
      if (url.includes('/selectors/C_Currency_ID')) {
        return { ok: true, json: async () => selectorJson };
      }
      if (url.endsWith('/defaults')) {
        if (defaultsFails === 'reject') throw new Error('network down');
        if (defaultsFails === 'non-ok') {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: true, json: async () => defaultsJson };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  }

  it('fetchDefaults GETs the currency selector (limit=200) then the defaults endpoint', async () => {
    mockDefaultsFetch({
      selectorJson: { items: [{ id: '102', name: 'EUR', symbol: '€' }] },
      defaultsJson: { defaults: { currency: '102' } },
    });

    const { result } = renderHook(() => useAccountMutations());

    let defaults;
    await act(async () => {
      defaults = await result.current.fetchDefaults();
    });

    const [selectorsUrl, selectorsInit] = globalThis.fetch.mock.calls[0];
    const [defaultsUrl, defaultsInit] = globalThis.fetch.mock.calls[1];
    expect(selectorsUrl).toBe(SELECTORS_URL);
    expect(defaultsUrl).toBe(DEFAULTS_URL);
    // GETs: no explicit method passed to fetch
    expect(selectorsInit.method).toBeUndefined();
    expect(defaultsInit.method).toBeUndefined();
    expect(selectorsInit.headers.Authorization).toBe('Bearer test-token');
    expect(defaultsInit.headers.Authorization).toBe('Bearer test-token');
    expect(defaults).toEqual({
      currencies: [{ id: '102', iso: 'EUR', symbol: '€' }],
      defaultCurrencyId: '102',
    });
  });

  it('fetchDefaults maps selector rows from the response.data envelope shape', async () => {
    mockDefaultsFetch({
      selectorJson: {
        response: { data: [{ id: '100', name: 'USD' }, { id: '102', name: 'EUR' }] },
      },
      defaultsJson: { defaults: { currency: '100' } },
    });

    const { result } = renderHook(() => useAccountMutations());
    let defaults;
    await act(async () => {
      defaults = await result.current.fetchDefaults();
    });

    expect(defaults).toEqual({
      currencies: [
        { id: '100', iso: 'USD', symbol: '' },
        { id: '102', iso: 'EUR', symbol: '' },
      ],
      defaultCurrencyId: '100',
    });
  });

  it('fetchDefaults falls back to _identifier when the row has no name', async () => {
    mockDefaultsFetch({
      selectorJson: { items: [{ id: '102', _identifier: 'EUR' }, { id: '103' }] },
      defaultsJson: { defaults: { currency: '' } },
    });

    const { result } = renderHook(() => useAccountMutations());
    let defaults;
    await act(async () => {
      defaults = await result.current.fetchDefaults();
    });

    expect(defaults.currencies).toEqual([
      { id: '102', iso: 'EUR', symbol: '' },
      { id: '103', iso: '', symbol: '' },
    ]);
  });

  it('fetchDefaults returns an empty defaultCurrencyId when the defaults call rejects', async () => {
    mockDefaultsFetch({
      selectorJson: { items: [{ id: '102', name: 'EUR' }] },
      defaultsFails: 'reject',
    });

    const { result } = renderHook(() => useAccountMutations());
    let defaults;
    await act(async () => {
      defaults = await result.current.fetchDefaults();
    });

    expect(defaults).toEqual({
      currencies: [{ id: '102', iso: 'EUR', symbol: '' }],
      defaultCurrencyId: '',
    });
  });

  it('fetchDefaults returns an empty defaultCurrencyId when the defaults call is non-ok', async () => {
    mockDefaultsFetch({
      selectorJson: { items: [{ id: '102', name: 'EUR' }] },
      defaultsFails: 'non-ok',
    });

    const { result } = renderHook(() => useAccountMutations());
    let defaults;
    await act(async () => {
      defaults = await result.current.fetchDefaults();
    });

    expect(defaults).toEqual({
      currencies: [{ id: '102', iso: 'EUR', symbol: '' }],
      defaultCurrencyId: '',
    });
  });

  it('fetchDefaults throws with .status when the selectors call fails', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(500, 'boom'));

    const { result } = renderHook(() => useAccountMutations());
    await act(async () => {
      await expect(result.current.fetchDefaults()).rejects.toMatchObject({
        message: 'boom',
        status: 500,
      });
    });
    // The best-effort defaults call must not happen when selectors fail.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

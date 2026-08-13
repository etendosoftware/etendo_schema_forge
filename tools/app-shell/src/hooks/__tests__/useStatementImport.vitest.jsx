import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useStatementImport } from '../useStatementImport.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

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

  it('POSTs to bank-statements?action=import with the expected body and headers', async () => {
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
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      FIN_Financial_Account_ID: 'acc-1',
      fileName: 'extracto.c43',
      contentBase64: 'ZmFrZQ==',
    });
    expect(res).toEqual({ id: 'st-1', lineCount: 3 });
  });

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

/**
 * ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
 * hook holds no bearer token: the request must carry `credentials: 'include'`
 * and NO Authorization header. The single call is a POST (an unsafe method), so
 * it must also carry the session-bound `X-Go-CSRF` proof, and must omit that
 * header entirely when no proof is available yet.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

let mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

import { useStatementImport } from '../useStatementImport.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

/** Asserts no request carried a bearer token — the point of ETP-4576. */
function expectNoAuthorizationHeader() {
  for (const [, init] of globalThis.fetch.mock.calls) {
    const headers = init?.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  }
}

describe('useStatementImport', () => {
  beforeEach(() => {
    mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };
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
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      FIN_Financial_Account_ID: 'acc-1',
      fileName: 'extracto.c43',
      contentBase64: 'ZmFrZQ==',
    });
    expect(res).toEqual({ id: 'st-1', lineCount: 3 });
  });

  it('omits X-Go-CSRF entirely when no CSRF proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands; the header must
    // be added defensively, never sent as an empty/undefined value.
    mockAuth = { isAuthenticated: true, csrfToken: null };
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ response: { data: {} } }) });

    const { result } = renderHook(() => useStatementImport());
    await act(async () => {
      await result.current.importStatement({ accountId: 'a', fileName: 'f', contentBase64: 'x' });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(Object.keys(init.headers)).not.toContain('X-Go-CSRF');
    expect(init.credentials).toBe('include');
    expectNoAuthorizationHeader();
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

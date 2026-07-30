/**
 * ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
 * hook holds no bearer token: every request must carry `credentials: 'include'`
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

import { useCreateStatement } from '../useCreateStatement.js';

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

const PAYLOAD = {
  accountId: 'acc-1',
  name: 'Extracto manual',
  transactionDate: '2026-06-04T00:00:00Z',
  importDate: '2026-06-04T00:00:00Z',
  fileName: '',
  notes: 'Notas internas',
  lines: [{
    date: '2026-06-02T00:00:00Z', reference: 'REF-1', description: 'Transferencia',
    bpartnerName: 'Acme', bpartnerId: 'bp-1', glItemId: 'gl-1', in: 3500, out: 0,
  }],
};

describe('useCreateStatement', () => {
  beforeEach(() => {
    mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useCreateStatement());
    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.createStatement).toBe('function');
  });

  it('POSTs to bank-statements?action=create with the expected body and headers', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { id: 'st-1', name: 'Extracto manual', lineCount: 1 } } }),
    });

    const { result } = renderHook(() => useCreateStatement());

    let res;
    await act(async () => {
      res = await result.current.createStatement(PAYLOAD);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=create');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      FIN_Financial_Account_ID: 'acc-1',
      name: 'Extracto manual',
      transactionDate: '2026-06-04T00:00:00Z',
      importDate: '2026-06-04T00:00:00Z',
      fileName: '',
      notes: 'Notas internas',
      process: true,
      lines: PAYLOAD.lines,
    });
    expect(res).toEqual({ id: 'st-1', name: 'Extracto manual', lineCount: 1 });
  });

  it('flips creating during the call', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => useCreateStatement());
    let promise;
    act(() => { promise = result.current.createStatement(PAYLOAD); });
    await waitFor(() => expect(result.current.creating).toBe(true));

    await act(async () => {
      resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      await promise;
    });
    expect(result.current.creating).toBe(false);
  });

  it('throws and captures the error on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 400, text: async () => 'At least one line is required',
    });
    const { result } = renderHook(() => useCreateStatement());

    await act(async () => {
      await expect(result.current.createStatement(PAYLOAD)).rejects.toThrow(/HTTP 400/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('At least one line is required');
  });

  it('propagates a network rejection', async () => {
    globalThis.fetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCreateStatement());

    await act(async () => {
      await expect(result.current.createStatement(PAYLOAD)).rejects.toThrow('offline');
    });
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('omits X-Go-CSRF entirely when no CSRF proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands; the header must
    // be added defensively, never sent as an empty/undefined value.
    mockAuth = { isAuthenticated: true, csrfToken: null };
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ response: { data: {} } }) });
    const { result } = renderHook(() => useCreateStatement());

    await act(async () => { await result.current.createStatement(PAYLOAD); });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(Object.keys(init.headers)).not.toContain('X-Go-CSRF');
    expect(init.credentials).toBe('include');
    expectNoAuthorizationHeader();
  });

  it('returns {} when the API omits response.data', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useCreateStatement());

    let res;
    await act(async () => { res = await result.current.createStatement(PAYLOAD); });
    expect(res).toEqual({});
  });
});

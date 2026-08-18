/**
 * ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
 * hook holds no bearer token: every request must carry `credentials: 'include'`
 * and NO Authorization header. All four actions (process / reactivate / update /
 * delete) are POSTs — unsafe methods — so each must also carry the session-bound
 * `X-Go-CSRF` proof, and must omit that header entirely when none is available.
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

import { useStatementActions } from '../useStatementActions.js';

function setPathname(pathname) {
  Object.defineProperty(window, 'location', { value: { pathname }, writable: true });
}

const okJson = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

describe('useStatementActions', () => {
  beforeEach(() => {
    // ETP-4576 — declare the scheme this suite asserts on. The builders read the
    // active scheme, and src/test/setup.js resets it to the bearer default before
    // every test, so a suite expecting the CSRF proof has to say so.
    declareCookieSession();
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useStatementActions());
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.processStatement).toBe('function');
    expect(typeof result.current.updateStatement).toBe('function');
    expect(typeof result.current.deleteStatement).toBe('function');
  });

  it('processStatement POSTs ?action=process with the id', async () => {
    globalThis.fetch.mockResolvedValue(okJson({ id: 'st-1', processed: true }));
    const { result } = renderHook(() => useStatementActions());

    let res;
    await act(async () => { res = await result.current.processStatement('st-1'); });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=process');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
    expect(JSON.parse(init.body)).toEqual({ id: 'st-1' });
    expect(res).toEqual({ id: 'st-1', processed: true });
  });

  it('sends X-Go-CSRF and no Authorization on every POST action', async () => {
    globalThis.fetch.mockResolvedValue(okJson({}));
    const { result } = renderHook(() => useStatementActions());

    await act(async () => { await result.current.processStatement('st-1'); });
    await act(async () => { await result.current.reactivateStatement('st-1'); });
    await act(async () => { await result.current.updateStatement({ id: 'st-1', lines: [] }); });
    await act(async () => { await result.current.deleteStatement('st-1'); });

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    for (const [, init] of globalThis.fetch.mock.calls) {
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    }
    expectNoAuthorizationHeader();
  });

  it('omits X-Go-CSRF entirely when no CSRF proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands; the header must
    // be added defensively, never sent as an empty/undefined value.
    setAuthMock({ isAuthenticated: true, csrfToken: null });
    globalThis.fetch.mockResolvedValue(okJson({}));
    const { result } = renderHook(() => useStatementActions());

    await act(async () => { await result.current.processStatement('st-1'); });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(Object.keys(init.headers)).not.toContain('X-Go-CSRF');
    expect(init.credentials).toBe('include');
    expectNoAuthorizationHeader();
  });

  it('updateStatement POSTs ?action=update with the full header + lines (process defaults to false)', async () => {
    globalThis.fetch.mockResolvedValue(okJson({ id: 'st-2', lineCount: 2 }));
    const { result } = renderHook(() => useStatementActions());

    const payload = {
      id: 'st-2',
      name: 'Extracto editado',
      transactionDate: '2026-06-04T00:00:00Z',
      importDate: '2026-06-04T00:00:00Z',
      fileName: '',
      notes: '',
      lines: [{ date: '2026-06-02T00:00:00Z', reference: '', bpartnerName: 'Acme', bpartnerId: null, glItemId: null, in: 10, out: 0 }],
    };
    await act(async () => { await result.current.updateStatement(payload); });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=update');
    expect(JSON.parse(init.body)).toEqual({ ...payload, process: false });
  });

  it('deleteStatement POSTs ?action=delete with the id', async () => {
    globalThis.fetch.mockResolvedValue(okJson({ id: 'st-3' }));
    const { result } = renderHook(() => useStatementActions());

    await act(async () => { await result.current.deleteStatement('st-3'); });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=delete');
    expect(JSON.parse(init.body)).toEqual({ id: 'st-3' });
  });

  it('flips busy during a call', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useStatementActions());

    let promise;
    act(() => { promise = result.current.processStatement('st-1'); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => { resolve(okJson({})); await promise; });
    expect(result.current.busy).toBe(false);
  });

  it('throws and captures the error on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 400, text: async () => 'Only draft (unprocessed) statements can be modified',
    });
    const { result } = renderHook(() => useStatementActions());

    await act(async () => {
      await expect(result.current.processStatement('st-1')).rejects.toThrow(/HTTP 400/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('Only draft');
  });
});

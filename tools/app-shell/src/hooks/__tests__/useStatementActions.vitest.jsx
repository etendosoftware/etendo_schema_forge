import { renderHook, act, waitFor } from '@testing-library/react';

import { AuthProvider } from '@/auth/AuthContext.jsx';
import { useStatementActions } from '../useStatementActions.js';

// ETP-5022: useStatementActions now goes through useApiFetch, which reads the
// token from the real core AuthProvider (or falls back to the ambient session)
// rather than from a mocked `useAuth`. A mocked `@/auth/AuthContext.jsx` never
// crosses the `useApiFetch` shim (it imports auth via the core package's own
// relative path, which the `@/auth` alias does not intercept), so a real
// AuthProvider seeded with a token is required instead.
const wrapper = ({ children }) => (
  <AuthProvider initialSession={{ token: 'test-token' }}>{children}</AuthProvider>
);

function setPathname(pathname) {
  Object.defineProperty(window, 'location', { value: { pathname }, writable: true });
}

const okJson = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

describe('useStatementActions', () => {
  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns the initial idle state', () => {
    const { result } = renderHook(() => useStatementActions(), { wrapper });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.processStatement).toBe('function');
    expect(typeof result.current.reactivateStatement).toBe('function');
    expect(typeof result.current.updateStatement).toBe('function');
    expect(typeof result.current.deleteStatement).toBe('function');
  });

  // ── ETP-5121: reactivate ──────────────────────────────────────────────────
  //
  // `reactivate` is the action at the root of ETP-5121: it returns a processed statement to draft
  // and, by design, does NOT reverse the reconciliations of its already-matched lines (see
  // BankStatementsHandler.handleReactivate). The panel therefore has to keep showing those lines
  // afterwards. The hook itself only owns the request contract, which was untested.

  it('reactivateStatement POSTs ?action=reactivate with the id', async () => {
    globalThis.fetch.mockResolvedValue(okJson({ id: 'st-4', processed: false }));
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    let res;
    await act(async () => { res = await result.current.reactivateStatement('st-4'); });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=reactivate');
    expect(init.method).toBe('POST');
    // Goes through the shared authenticated helper, so the session token is attached.
    expect(init.headers.Authorization).toBe('Bearer test-token');
    // The body carries the id and NOTHING else: reactivation is a header-only operation, it must
    // never send (and so never rewrite) the statement's lines.
    expect(JSON.parse(init.body)).toEqual({ id: 'st-4' });
    // The backend echoes the new draft state, which is what the caller reloads on.
    expect(res).toEqual({ id: 'st-4', processed: false });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('flips busy during a reactivate and clears it on success', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    let promise;
    act(() => { promise = result.current.reactivateStatement('st-4'); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => { resolve(okJson({ id: 'st-4', processed: false })); await promise; });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the backend reason when reactivating a draft statement', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Only processed statements can be reactivated', status: 400 },
      }),
    });
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    await act(async () => {
      await expect(result.current.reactivateStatement('st-4'))
        .rejects.toThrow('Only processed statements can be reactivated');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.busy).toBe(false);
  });

  it('surfaces the backend reason when reactivating a posted statement', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Posted statements cannot be modified', status: 400 },
      }),
    });
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    await act(async () => {
      await expect(result.current.reactivateStatement('st-4'))
        .rejects.toThrow('Posted statements cannot be modified');
    });
    expect(result.current.error.message).not.toMatch(/HTTP/);
  });

  it('processStatement POSTs ?action=process with the id', async () => {
    globalThis.fetch.mockResolvedValue(okJson({ id: 'st-1', processed: true }));
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    let res;
    await act(async () => { res = await result.current.processStatement('st-1'); });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=process');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ id: 'st-1' });
    expect(res).toEqual({ id: 'st-1', processed: true });
  });

  it('updateStatement POSTs ?action=update with the full header + lines (process defaults to false)', async () => {
    globalThis.fetch.mockResolvedValue(okJson({ id: 'st-2', lineCount: 2 }));
    const { result } = renderHook(() => useStatementActions(), { wrapper });

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
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    await act(async () => { await result.current.deleteStatement('st-3'); });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/etendo/sws/neo/bank-statements?action=delete');
    expect(JSON.parse(init.body)).toEqual({ id: 'st-3' });
  });

  it('flips busy during a call', async () => {
    let resolve;
    globalThis.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    let promise;
    act(() => { promise = result.current.processStatement('st-1'); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => { resolve(okJson({})); await promise; });
    expect(result.current.busy).toBe(false);
  });

  // ETP-4921 — the message must be the backend's own reason, not a generic "HTTP 400" wrapper:
  // it flows straight into a toast (see ImportedStatementsTab.runConfirm), so a caller that
  // shows it verbatim (or translates it via backendErrors.js) needs the real sentence.
  it('throws the backend reason, unwrapped, on a NEO error envelope', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Only draft (unprocessed) statements can be modified', status: 400 } }),
    });
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    await act(async () => {
      await expect(result.current.processStatement('st-1'))
        .rejects.toThrow('Only draft (unprocessed) statements can be modified');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).not.toMatch(/HTTP/);
  });

  // A body that isn't the expected NEO envelope (or isn't JSON at all) must not surface as
  // "undefined" or an empty toast — fall back to a status-only message.
  it('falls back to an HTTP-status message when the error body has no reason', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 500, json: async () => { throw new SyntaxError('not json'); },
    });
    const { result } = renderHook(() => useStatementActions());

    await act(async () => {
      await expect(result.current.deleteStatement('st-1')).rejects.toThrow('HTTP 500');
    });
  });
});

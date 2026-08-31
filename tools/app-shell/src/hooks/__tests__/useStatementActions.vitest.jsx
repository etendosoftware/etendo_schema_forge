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
    expect(typeof result.current.updateStatement).toBe('function');
    expect(typeof result.current.deleteStatement).toBe('function');
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

  it('throws and captures the error on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false, status: 400, text: async () => 'Only draft (unprocessed) statements can be modified',
    });
    const { result } = renderHook(() => useStatementActions(), { wrapper });

    await act(async () => {
      await expect(result.current.processStatement('st-1')).rejects.toThrow(/HTTP 400/);
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('Only draft');
  });
});

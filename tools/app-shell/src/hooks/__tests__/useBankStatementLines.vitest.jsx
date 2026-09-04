import { renderHook, waitFor, act } from '@testing-library/react';
import { setSessionCredentials, CREDENTIAL_MODES } from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));
// ETP-5022 — the hook gets its request function from `useApiFetch`, which reads the session
// with the core's `useAuthOptional`. Mocking only `@/auth/AuthContext.jsx` no longer reaches
// it, so the core module is mocked too (spread from the original, since useApiFetch also
// imports createApiFetch and getAmbientToken from there).
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => ({ token: 'test-token' }),
}));

import { useBankStatementLines } from '../useBankStatementLines.js';

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

describe('useBankStatementLines', () => {
  // ETP-4576 — apiFetch takes the credential from the active scheme, not from an argument,
  // so a test that expects an Authorization header has to declare the scheme first.
  beforeEach(() => setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: 'test-token' }));

  beforeEach(() => {
    setPathname('/etendo/web/app');
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch when statementId is null', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ lines: [] }));

    const { result } = renderHook(() => useBankStatementLines(null));

    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.lines).toEqual([]);
  });

  it('builds the correct ?action=lines URL with the bearer token', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ lines: [] }));

    renderHook(() => useBankStatementLines('stmt-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(
      '/etendo/sws/neo/bank-statements?action=lines&statementId=stmt-1',
    );
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  it('URL-encodes the statementId', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ lines: [] }));

    renderHook(() => useBankStatementLines('id/with space'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('statementId=id%2Fwith%20space');
  });

  it('exposes lines once the response resolves', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ lines: [{ id: 'l1', description: 'foo' }] }),
    );

    const { result } = renderHook(() => useBankStatementLines('stmt-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lines).toEqual([{ id: 'l1', description: 'foo' }]);
    expect(result.current.error).toBeNull();
  });

  it('returns an empty array when the API omits the lines key', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ extra: 'noise' }));

    const { result } = renderHook(() => useBankStatementLines('stmt-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lines).toEqual([]);
  });

  it('captures the error on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });

    const { result } = renderHook(() => useBankStatementLines('stmt-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toContain('HTTP 404');
  });

  it('captures the error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useBankStatementLines('stmt-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('boom');
  });

  it('refetches when statementId changes', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ lines: [] }));

    const { result, rerender } = renderHook(
      ({ id }) => useBankStatementLines(id),
      { initialProps: { id: 'stmt-1' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    rerender({ id: 'stmt-2' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });

  it('reload() re-issues the request', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ lines: [] }));

    const { result } = renderHook(() => useBankStatementLines('stmt-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reload();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  /**
   * ETP-4921 — the lines of a statement change from OUTSIDE this hook (the edit modal's
   * ?action=update, a reconciliation), while every consumer keys only off statementId. Without a
   * second dependency the fetch happens once and never again, which is why an expanded row kept
   * showing the pre-edit amounts under a header that had already updated.
   */
  it('refetches the same statement when the refresh token changes', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ lines: [] }));

    const { result, rerender } = renderHook(
      ({ tok }) => useBankStatementLines('stmt-1', tok),
      { initialProps: { tok: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    rerender({ tok: 1 });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    // Same statement, same URL — only the invalidation signal differed.
    expect(globalThis.fetch.mock.calls[1][0]).toBe(globalThis.fetch.mock.calls[0][0]);
  });

  // Guard against the opposite mistake: a token that never changes must not cause a refetch
  // loop on every render.
  it('does not refetch while the token stays the same', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ lines: [] }));

    const { result, rerender } = renderHook(
      ({ tok }) => useBankStatementLines('stmt-1', tok),
      { initialProps: { tok: 7 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ tok: 7 });
    rerender({ tok: 7 });
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

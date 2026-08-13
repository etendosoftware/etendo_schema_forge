import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
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
});

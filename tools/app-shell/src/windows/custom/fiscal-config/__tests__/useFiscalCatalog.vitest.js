// @covers tools/app-shell/src/windows/custom/fiscal-config/useFiscalCatalog.js
// @covers tools/app-shell/src/windows/custom/fiscal-config/fiscalSystemApi.js
import { renderHook, waitFor } from '@testing-library/react';
import { FISCAL_SYSTEM_CATALOG } from './fiscalSystemCatalog.fixture.js';

// One stable apiFetch, as the real (memoized) useApiFetch returns: the hook's effect depends on it.
const mockApiFetch = vi.fn();

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => mockApiFetch),
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => `${url}/neo`,
}));

import { useFiscalCatalog } from '../useFiscalCatalog.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockImplementation(() => jsonResponse({ response: { data: FISCAL_SYSTEM_CATALOG } }));
});

describe('useFiscalCatalog', () => {
  it('binds apiFetch to the NEO base of the given apiBaseUrl', () => {
    renderHook(() => useFiscalCatalog('/api', 'ORG1'));
    expect(useApiFetch).toHaveBeenCalledWith('/api/neo');
  });

  it('loads the catalog of the organization and exposes it', async () => {
    const { result } = renderHook(() => useFiscalCatalog('/api', 'ORG1'));

    expect(result.current.loading).toBe(true);
    expect(result.current.catalog).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog).toEqual(FISCAL_SYSTEM_CATALOG);
    expect(result.current.error).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/sii-config/siiConfiguration/ORG1/action/fiscalSystemCatalog');
    expect(mockApiFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('exposes the failure message and no catalog when the read fails', async () => {
    mockApiFetch.mockImplementation(() => jsonResponse(
      { error: { message: 'Could not read the fiscal system catalog.' } },
      { ok: false, status: 500 },
    ));

    const { result } = renderHook(() => useFiscalCatalog('/api', 'ORG1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog).toBeNull();
    expect(result.current.error).toBe('Could not read the fiscal system catalog.');
  });

  it('flags forbidden when the role may not read the catalog (403 without messageKeys)', async () => {
    mockApiFetch.mockImplementation(() => jsonResponse(
      { error: { message: 'Access denied to spec for current role', status: 403 } },
      { ok: false, status: 403 },
    ));

    const { result } = renderHook(() => useFiscalCatalog('/api', 'ORG1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forbidden).toBe(true);
    expect(result.current.catalog).toBeNull();
  });

  it('does not flag forbidden on an ordinary failure', async () => {
    mockApiFetch.mockImplementation(() => jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }));

    const { result } = renderHook(() => useFiscalCatalog('/api', 'ORG1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forbidden).toBe(false);
    expect(result.current.error).toBe('boom');
  });

  it('exposes a network error message', async () => {
    mockApiFetch.mockRejectedValue(new Error('networkErrorRetry'));

    const { result } = renderHook(() => useFiscalCatalog('/api', 'ORG1'));

    await waitFor(() => expect(result.current.error).toBe('networkErrorRetry'));
    expect(result.current.catalog).toBeNull();
  });

  it('does not fetch without an organization', async () => {
    const { result } = renderHook(() => useFiscalCatalog('/api', null));

    expect(result.current).toEqual({ catalog: null, error: null, forbidden: false, loading: false });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does not fetch without an apiBaseUrl', () => {
    const { result } = renderHook(() => useFiscalCatalog('', 'ORG1'));

    expect(result.current).toEqual({ catalog: null, error: null, forbidden: false, loading: false });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('re-reads on an organization change and aborts the previous request', async () => {
    const { result, rerender } = renderHook(({ orgId }) => useFiscalCatalog('/api', orgId), {
      initialProps: { orgId: 'ORG1' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstSignal = mockApiFetch.mock.calls[0][1].signal;

    rerender({ orgId: 'ORG2' });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(mockApiFetch.mock.calls[1][0]).toBe('/sii-config/siiConfiguration/ORG2/action/fiscalSystemCatalog');
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('ignores an answer that arrives after the organization was cleared', async () => {
    let resolveLate;
    mockApiFetch.mockImplementation(() => new Promise((resolve) => { resolveLate = resolve; }));
    const { result, rerender } = renderHook(({ orgId }) => useFiscalCatalog('/api', orgId), {
      initialProps: { orgId: 'ORG1' },
    });

    rerender({ orgId: null });
    resolveLate({ ok: true, json: async () => FISCAL_SYSTEM_CATALOG });
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current).toEqual({ catalog: null, error: null, forbidden: false, loading: false });
  });

  it('keeps the same state across re-renders with the same inputs (no re-fetch loop)', async () => {
    const { result, rerender } = renderHook(() => useFiscalCatalog('/api', 'ORG1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender();
    rerender();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.catalog).toEqual(FISCAL_SYSTEM_CATALOG);
  });
});

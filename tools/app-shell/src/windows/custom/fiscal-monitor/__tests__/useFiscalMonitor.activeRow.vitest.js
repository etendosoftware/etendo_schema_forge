// Focused tests for the ETP-4785 active-row resolution in useFiscalMonitor
// (addresses Alex's N1). Unlike useFiscalMonitor.vitest.js, this file does NOT
// mock detectProfile — it exercises the REAL isActiveRecord / activeOrNull /
// detectProfile so an inactive ("Change SIF") trace row never resolves the
// monitor to a configured state.

import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

// computeKpis is orthogonal to profile resolution — stub it to a no-op so the
// tests focus purely on the active-row gate.
vi.mock('../fiscalMonitor.utils.js', () => ({
  computeKpis: () => ({}),
}));

import { useFiscalMonitor } from '../useFiscalMonitor.js';

// --- Helpers --------------------------------------------------------------

// Config specs used for profile detection. Any other spec (monitor data) gets
// an empty envelope so the downstream count fetches resolve harmlessly.
const CONFIG_SPECS = ['sii-config', 'tbai-config', 'verifactu-config'];

function apiFor(rowsBySpec) {
  return (path) => {
    const spec = CONFIG_SPECS.find((s) => path.startsWith(`/${s}/`));
    const rows = spec ? (rowsBySpec[spec] ?? []) : [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: { data: rows, totalRows: 0 } }),
    });
  };
}

const EMPTY = { 'sii-config': [], 'tbai-config': [], 'verifactu-config': [] };

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests ----------------------------------------------------------------

describe('useFiscalMonitor — active-row preference (N1)', () => {
  it('prefers the ACTIVE sii config row over a leftover inactive trace', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        ...EMPTY,
        'sii-config': [
          { id: 'sii-old', active: 'N' },
          { id: 'sii-active', active: 'Y', taxtype: 'IVA' },
        ],
      }),
    );
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('sii');
    expect(result.current.error).toBeNull();
  });

  it('resolves "unconfigured" when the only config row is inactive (trace-only)', async () => {
    mockApiFetch.mockImplementation(
      apiFor({ ...EMPTY, 'verifactu-config': [{ id: 'vf-old', active: 'N' }] }),
    );
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
  });

  it('resolves "unconfigured" when every config spec returns 0 rows (no crash)', async () => {
    mockApiFetch.mockImplementation(apiFor(EMPTY));
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
    expect(result.current.monitorData).toEqual({});
  });

  it('sets profile "unconfigured" when orgId is null and skips the API', async () => {
    const { result } = renderHook(() => useFiscalMonitor(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('unconfigured');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

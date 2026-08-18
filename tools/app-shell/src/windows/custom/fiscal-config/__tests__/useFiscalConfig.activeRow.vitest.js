// Focused tests for the ETP-4785 active-row resolution in useFiscalConfig
// (addresses Alex's N1). Unlike useFiscalConfig.vitest.js, this file does NOT
// mock fiscalConfig.utils — it exercises the REAL isActiveRecord / activeOrNull
// / detectProfile so the "prefer the active row, gate inactive traces" behavior
// is verified end-to-end.

import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import { useFiscalConfig } from '../useFiscalConfig.js';

// --- Helpers --------------------------------------------------------------

// Returns a fetch impl keyed by spec name so each of the 3 config specs can be
// fed its own row set. `rowsBySpec` maps spec → array of API rows.
function apiFor(rowsBySpec) {
  return (path) => {
    const spec = Object.keys(rowsBySpec).find((s) => path.startsWith(`/${s}/`));
    const rows = rowsBySpec[spec] ?? [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: { data: rows } }),
    });
  };
}

const EMPTY = { 'sii-config': [], 'tbai-config': [], 'verifactu-config': [] };

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests ----------------------------------------------------------------

describe('useFiscalConfig — active-row preference (N1)', () => {
  it('prefers the ACTIVE sii row over a leftover inactive trace row', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        ...EMPTY,
        'sii-config': [
          { id: 'sii-old', active: 'N' },        // Change SIF trace — must be ignored
          { id: 'sii-active', active: 'Y', taxtype: 'IVA' },
        ],
      }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiRecord).toMatchObject({ id: 'sii-active' });
    expect(result.current.profile).toBe('sii');
  });

  it('resolves "unconfigured" when the ONLY sii row is inactive (trace-only)', async () => {
    mockApiFetch.mockImplementation(
      apiFor({ ...EMPTY, 'sii-config': [{ id: 'sii-old', active: 'N' }] }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // find(isActiveRecord) misses → falls back to rows[0], but activeOrNull()
    // then drops it before detectProfile → unconfigured, no crash.
    expect(result.current.siiRecord).toBeNull();
    expect(result.current.profile).toBe('unconfigured');
  });

  it('resolves "unconfigured" when every spec returns 0 rows', async () => {
    mockApiFetch.mockImplementation(apiFor(EMPTY));
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiRecord).toBeNull();
    expect(result.current.tbaiRecord).toBeNull();
    expect(result.current.verifactuRecord).toBeNull();
    expect(result.current.profile).toBe('unconfigured');
  });

  it('treats a row with NO active flag as active', async () => {
    mockApiFetch.mockImplementation(
      apiFor({ ...EMPTY, 'tbai-config': [{ id: 'tbai-1', etsgSifTerritory: 'ARABA' }] }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tbaiRecord).toMatchObject({ id: 'tbai-1' });
    expect(result.current.profile).toBe('tbai');
  });

  it('resolves sii+tbai when both have an active row alongside inactive traces', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        ...EMPTY,
        'sii-config': [{ id: 'sii-dead', active: 'N' }, { id: 'sii-live', active: 'Y' }],
        'tbai-config': [{ id: 'tbai-dead', active: 'N' }, { id: 'tbai-live', active: 'Y' }],
      }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiRecord).toMatchObject({ id: 'sii-live' });
    expect(result.current.tbaiRecord).toMatchObject({ id: 'tbai-live' });
    expect(result.current.profile).toBe('sii+tbai');
  });
});

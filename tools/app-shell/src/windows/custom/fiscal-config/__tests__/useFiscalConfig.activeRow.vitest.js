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

// ETP-5229 — earliestSiiCutoverDate/earliestTbaiCutoverDate/earliestVerifactuCutoverDate:
// the MIN cutover across ALL rows for a system (active or inactive), computed independently
// of the active-row projection (siiRecord/tbaiRecord/verifactuRecord) covered above.
describe('useFiscalConfig — earliest-ever cutover date (ETP-5229)', () => {
  it('is the accounting-cutover (monitordate) of the SOLE sii row when there is only one', async () => {
    mockApiFetch.mockImplementation(
      apiFor({ ...EMPTY, 'sii-config': [{ id: 'sii-1', active: 'Y', monitordate: '2026-06-01T00:00:00.000Z' }] }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestSiiCutoverDate).toBe('2026-06-01T00:00:00.000Z');
  });

  // Scenario B: an OLD deactivated config has an EARLIER cutover than the
  // currently-active one — the earliest-ever value must come from the
  // deactivated (inactive) row, not the active row's own (later) date.
  it('picks the EARLIEST monitordate across an inactive-old + active-new sii pair (scenario B)', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        ...EMPTY,
        'sii-config': [
          { id: 'sii-old', active: 'N', monitordate: '2026-01-01T00:00:00.000Z' },
          { id: 'sii-new', active: 'Y', monitordate: '2026-06-01T00:00:00.000Z' },
        ],
      }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestSiiCutoverDate).toBe('2026-01-01T00:00:00.000Z');
    // The active-row projection is UNAFFECTED — it still resolves to the
    // active row's own record, not the earlier one.
    expect(result.current.siiRecord).toMatchObject({ id: 'sii-new' });
  });

  it('is order-independent — the same MIN is picked regardless of row order in the API response', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        ...EMPTY,
        'tbai-config': [
          { id: 'tbai-newest', active: 'Y', tbaisystemdate: '2026-09-01T00:00:00.000Z' },
          { id: 'tbai-oldest', active: 'N', tbaisystemdate: '2026-01-01T00:00:00.000Z' },
          { id: 'tbai-middle', active: 'N', tbaisystemdate: '2026-05-01T00:00:00.000Z' },
        ],
      }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestTbaiCutoverDate).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is null when no row for that system carries the cutover field at all', async () => {
    mockApiFetch.mockImplementation(
      apiFor({ ...EMPTY, 'verifactu-config': [{ id: 'vf-1', active: 'Y' }] }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestVerifactuCutoverDate).toBeNull();
  });

  // Never-configured-for-this-system case: no row at all for a system → null,
  // regardless of the other two systems being configured.
  it('is null for verifactu when the org has zero verifactu rows, even though sii/tbai are configured', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        'sii-config': [{ id: 'sii-1', active: 'Y', monitordate: '2026-01-01T00:00:00.000Z' }],
        'tbai-config': [{ id: 'tbai-1', active: 'Y', tbaisystemdate: '2026-01-01T00:00:00.000Z' }],
        'verifactu-config': [],
      }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestVerifactuCutoverDate).toBeNull();
    expect(result.current.earliestSiiCutoverDate).toBe('2026-01-01T00:00:00.000Z');
    expect(result.current.earliestTbaiCutoverDate).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is null for every system when the org has zero rows anywhere', async () => {
    mockApiFetch.mockImplementation(apiFor(EMPTY));
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestSiiCutoverDate).toBeNull();
    expect(result.current.earliestTbaiCutoverDate).toBeNull();
    expect(result.current.earliestVerifactuCutoverDate).toBeNull();
  });

  it('ignores an unparsable cutover value on one row but still picks the earliest VALID one', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        ...EMPTY,
        'sii-config': [
          { id: 'sii-bad', active: 'N', monitordate: 'not-a-date' },
          { id: 'sii-good', active: 'Y', monitordate: '2026-03-01T00:00:00.000Z' },
        ],
      }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestSiiCutoverDate).toBe('2026-03-01T00:00:00.000Z');
  });

  // Verifactu's cutover field is `inVfactuSystem`, distinct from sii's
  // `monitordate` and tbai's `tbaisystemdate` — pin the field mapping itself.
  it('reads the verifactu cutover from inVfactuSystem specifically (not monitordate/tbaisystemdate)', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        ...EMPTY,
        'verifactu-config': [{ id: 'vf-1', active: 'Y', inVfactuSystem: '2026-04-01T00:00:00.000Z' }],
      }),
    );
    const { result } = renderHook(() => useFiscalConfig('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestVerifactuCutoverDate).toBe('2026-04-01T00:00:00.000Z');
  });

  it('sets all three earliestXCutoverDate fields to null when orgId is null, without calling the API', async () => {
    mockApiFetch.mockClear();
    const { result } = renderHook(() => useFiscalConfig(null, '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.earliestSiiCutoverDate).toBeNull();
    expect(result.current.earliestTbaiCutoverDate).toBeNull();
    expect(result.current.earliestVerifactuCutoverDate).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

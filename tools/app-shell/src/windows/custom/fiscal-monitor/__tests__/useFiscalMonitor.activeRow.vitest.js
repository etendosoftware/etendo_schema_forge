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

  // fetchSiiParentId is not exported — exercised indirectly through the hook's
  // `siiParentId` state, which is populated straight from its return value
  // (see useFiscalMonitor.js load()).

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

// --- ETP-5229: fetchSiiParentId active-row preference ----------------------
//
// The sii-monitor spec's "organizations" entity (aeatsii_config) suffers from
// the same NO_ACTIVE_FILTER=true issue as the config entities above: an org can
// carry a deactivated ("Change SIF") trace row alongside its live one.
// fetchSiiParentId() is not exported, so these tests drive it indirectly via
// the hook's `siiParentId` state, which useFiscalMonitor.js assigns straight
// from fetchSiiMonitorData()'s resolved parentId.

const ACTIVE_SII_CONFIG = [{ id: 'sii-cfg-active', active: 'Y', taxtype: 'IVA' }];

function apiForSiiOrganizations(orgRows) {
  return (path) => {
    if (path.startsWith('/sii-config/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: { data: ACTIVE_SII_CONFIG, totalRows: 0 } }),
      });
    }
    if (path.startsWith('/tbai-config/') || path.startsWith('/verifactu-config/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: { data: [], totalRows: 0 } }),
      });
    }
    if (path.startsWith('/sii-monitor/organizations')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: { data: orgRows, totalRows: orgRows.length } }),
      });
    }
    // sii-monitor count entities (issuedInvoices, receivedInvoices, and their
    // (previousPeriod) siblings) — irrelevant to parentId resolution, return
    // an empty count envelope so they resolve harmlessly.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: { totalRows: 0 } }),
    });
  };
}

describe('useFiscalMonitor — fetchSiiParentId active-row preference (ETP-5229)', () => {
  it('resolves siiParentId from the ACTIVE organizations row, not index 0', async () => {
    mockApiFetch.mockImplementation(
      apiForSiiOrganizations([
        { id: 'org-cfg-old', active: 'N' },
        { id: 'org-cfg-active', active: 'Y' },
      ]),
    );
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toBe('sii');
    expect(result.current.siiParentId).toBe('org-cfg-active');
  });

  it('resolves siiParentId correctly when only a single active row is returned', async () => {
    mockApiFetch.mockImplementation(
      apiForSiiOrganizations([{ id: 'org-cfg-only', active: 'Y' }]),
    );
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiParentId).toBe('org-cfg-only');
  });

  it('falls back to the first row when every organizations row is inactive', async () => {
    mockApiFetch.mockImplementation(
      apiForSiiOrganizations([{ id: 'org-cfg-inactive-only', active: 'N' }]),
    );
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Same contract as fetchConfigRecord(): prefer active, else rows[0] — never null.
    expect(result.current.siiParentId).toBe('org-cfg-inactive-only');
  });

  it('resolves via the $ref field when the active row has no id', async () => {
    mockApiFetch.mockImplementation(
      apiForSiiOrganizations([
        { '$ref': 'aeatsii_config/ignored-inactive', active: 'N' },
        { '$ref': 'aeatsii_config/ref-active-uuid', active: 'Y' },
      ]),
    );
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiParentId).toBe('ref-active-uuid');
  });

  it('sets siiParentId to null when organizations returns no rows', async () => {
    mockApiFetch.mockImplementation(apiForSiiOrganizations([]));
    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.siiParentId).toBeNull();
    expect(result.current.monitorData.sii?.issued.totalCount).toBe(0);
  });
});

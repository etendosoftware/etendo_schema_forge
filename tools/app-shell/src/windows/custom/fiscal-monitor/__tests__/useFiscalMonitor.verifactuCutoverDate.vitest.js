// ETP-5229 #17 — earliest-cutover-date gate for the Verifactu monitor.
//
// Mirrors useFiscalMonitor.cutoverDate.vitest.js (TBAI, #13), adapted to
// Verifactu: useFiscalMonitor.js now fetches ALL verifactu-config rows
// (active + inactive "Change SIF" trace rows) instead of a single record via
// fetchConfigRecord, and derives earliestVerifactuCutoverDate = MIN(inVfactuSystem)
// across every row. That date is applied as an `invoiceDate >= earliestCutoverDate`
// lower bound on every Verifactu monitor count query
// (fetchVerifactuMonitorData → facturasAceptadas/facturasParcialmenteAceptadas/
// facturasRechazadas/facturasInválidas), so:
//   - an invoice sent under an OLD/deactivated Verifactu config still counts
//     (the gate uses the EARLIEST date across all rows, not the active row's own)
//   - an invoice genuinely predating the org's first-ever Verifactu enrollment
//     is excluded
//   - when there is no earliest date at all, the request must be byte-for-byte
//     identical to before this fix — no spurious empty `criteria` param.

import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

// computeKpis is orthogonal to the cutover-date gate — stub it to a no-op.
vi.mock('../fiscalMonitor.utils.js', () => ({
  computeKpis: () => ({}),
}));

import { useFiscalMonitor } from '../useFiscalMonitor.js';

const EMPTY_COUNT = { ok: true, status: 200, json: () => Promise.resolve({ response: { totalRows: 0 } }) };

// monitor-verifactu spec's 4 count entities, URL-encoded the same way the
// component builds them (encodeURIComponent on the entity name).
const VF_MONITOR_PATH_PREFIX = '/monitor-verifactu/';

/**
 * Builds a mock apiFetch that:
 *  - answers sii-config / tbai-config with no rows (irrelevant to this file)
 *  - answers verifactu-config with the given rows (active + inactive mixed)
 *  - answers every monitor-verifactu count query with 0
 * Every call is recorded so assertions can inspect the exact URL sent.
 */
function buildApiFetch(verifactuConfigRows) {
  return vi.fn((path) => {
    if (path.startsWith('/sii-config/') || path.startsWith('/tbai-config/')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: [], totalRows: 0 } }) });
    }
    if (path.startsWith('/verifactu-config/')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: verifactuConfigRows, totalRows: verifactuConfigRows.length } }) });
    }
    if (path.startsWith(VF_MONITOR_PATH_PREFIX)) {
      return Promise.resolve(EMPTY_COUNT);
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useFiscalMonitor — earliestVerifactuCutoverDate derivation (ETP-5229 #17a)', () => {
  it('is the MIN cutover date across ALL verifactu config rows, not the active row\'s own (later) date', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      // Active config, enrolled MORE RECENTLY (org changed SIF).
      { id: 'vf-active', active: 'Y', inVfactuSystem: '2026-06-01' },
      // Deactivated ("Change SIF") trace row — org's ORIGINAL, earlier enrollment.
      { id: 'vf-old', active: 'N', inVfactuSystem: '2025-01-15' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBe('verifactu');
    expect(result.current.earliestVerifactuCutoverDate).toBe(new Date('2025-01-15').toISOString());
  });

  it('falls back to null when no verifactu config row carries a cutover date', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'vf-active', active: 'Y' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBe('verifactu');
    expect(result.current.earliestVerifactuCutoverDate).toBeNull();
  });

  it('single active-only config: earliest equals that config\'s own date', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'vf-active', active: 'Y', inVfactuSystem: '2026-03-10' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.earliestVerifactuCutoverDate).toBe(new Date('2026-03-10').toISOString());
  });

  it('no verifactu config rows at all: earliest is null and profile is unconfigured', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBe('unconfigured');
    expect(result.current.earliestVerifactuCutoverDate).toBeNull();
  });
});

describe('useFiscalMonitor — Verifactu count queries apply the cutover-date gate (ETP-5229 #17b/c)', () => {
  it('sends an invoiceDate >= earliestCutoverDate criteria on every Verifactu monitor count request', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'vf-active', active: 'Y', inVfactuSystem: '2026-06-01' },
      { id: 'vf-old', active: 'N', inVfactuSystem: '2025-01-15' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const vfCalls = mockApiFetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url.startsWith(VF_MONITOR_PATH_PREFIX));

    expect(vfCalls.length).toBe(4); // accepted, partial, rejected, invalid
    for (const url of vfCalls) {
      expect(url).toContain('criteria=');
      const params = new URLSearchParams(url.split('?')[1]);
      const criteria = JSON.parse(params.get('criteria'));
      expect(criteria).toContainEqual({ fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-01-15' });
      // scoped by org via _org, same as before this fix
      expect(params.get('_org')).toBe('org-1');
    }
  });

  it('sends NO criteria param at all when earliestVerifactuCutoverDate is null (no regression)', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'vf-active', active: 'Y' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const vfCalls = mockApiFetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url.startsWith(VF_MONITOR_PATH_PREFIX));

    expect(vfCalls.length).toBe(4);
    for (const url of vfCalls) {
      expect(url).not.toContain('criteria=');
      const params = new URLSearchParams(url.split('?')[1]);
      expect(params.get('_org')).toBe('org-1');
    }
  });
});

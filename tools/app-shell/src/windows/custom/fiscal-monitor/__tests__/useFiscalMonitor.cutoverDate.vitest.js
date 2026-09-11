// ETP-5229 #13 — earliest-cutover-date gate for the TBAI monitor.
//
// useFiscalMonitor.js now fetches ALL tbai-config rows (active + inactive
// "Change SIF" trace rows) instead of just the active one, and derives
// earliestTbaiCutoverDate = MIN(tbaisystemdate) across every row. That date is
// then applied as an `invoiceDate >= earliestCutoverDate` lower bound on every
// TBAI monitor count query (fetchTbaiData), so:
//   - an invoice sent under an OLD/deactivated config still counts (the gate
//     uses the EARLIEST date across all rows, not the active row's own date)
//   - an invoice genuinely predating the org's first-ever TBAI enrollment is
//     excluded
//   - when there is no earliest date at all (org never had more than the
//     current config, or the field is missing), the request must be byte-for-
//     byte identical to before this fix — no spurious empty `criteria` param.
//
// Mirrors the real detectProfile/isActiveRecord (like
// useFiscalMonitor.activeRow.vitest.js) rather than mocking them, since the
// active-vs-inactive distinction is exactly what's under test here.

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

// TBAI_ENTITY ('sincronización') URL-encoded — distinguishes the count
// queries under test from the unrelated resultadoValidación (validation
// results) requests fetchTbaiValidationResults also sends to the same spec.
const SINCRONIZACION_PATH = `/tbai-facturas-enviadas/${encodeURIComponent('sincronización')}`;

/**
 * Builds a mock apiFetch that:
 *  - answers sii-config / verifactu-config with no rows (irrelevant to this file)
 *  - answers tbai-config with the given rows (active + inactive mixed)
 *  - answers every tbai-facturas-enviadas/sincronización count query with 0
 * Every call is recorded so assertions can inspect the exact URL sent.
 */
function buildApiFetch(tbaiConfigRows) {
  return vi.fn((path) => {
    if (path.startsWith('/sii-config/') || path.startsWith('/verifactu-config/')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: [], totalRows: 0 } }) });
    }
    if (path.startsWith('/tbai-config/')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: tbaiConfigRows, totalRows: tbaiConfigRows.length } }) });
    }
    if (path.startsWith('/tbai-facturas-enviadas/')) {
      return Promise.resolve(EMPTY_COUNT);
    }
    // resultadoValidación (TBAI_VALIDATION_ENTITY) — treat as not installed.
    return Promise.resolve({ ok: false, status: 404 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useFiscalMonitor — earliestTbaiCutoverDate derivation (ETP-5229 #13a)', () => {
  it('is the MIN cutover date across ALL tbai config rows, not the active row\'s own (later) date', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      // Active config, enrolled MORE RECENTLY (org changed SIF).
      { id: 'tbai-active', active: 'Y', tbaisystemdate: '2026-06-01' },
      // Deactivated ("Change SIF") trace row — org's ORIGINAL, earlier enrollment.
      { id: 'tbai-old', active: 'N', tbaisystemdate: '2025-01-15' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBe('tbai');
    expect(result.current.earliestTbaiCutoverDate).toBe(new Date('2025-01-15').toISOString());
  });

  it('falls back to null when no tbai config row carries a cutover date', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'tbai-active', active: 'Y' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile).toBe('tbai');
    expect(result.current.earliestTbaiCutoverDate).toBeNull();
  });
});

describe('useFiscalMonitor — TBAI count queries apply the cutover-date gate (ETP-5229 #13b/c)', () => {
  it('sends an invoiceDate >= earliestCutoverDate criteria on the TBAI count requests', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'tbai-active', active: 'Y', tbaisystemdate: '2026-06-01' },
      { id: 'tbai-old', active: 'N', tbaisystemdate: '2025-01-15' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const tbaiCalls = mockApiFetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url.startsWith(SINCRONIZACION_PATH));

    expect(tbaiCalls.length).toBe(5); // total + 4 status-filtered counts
    for (const url of tbaiCalls) {
      expect(url).toContain('criteria=');
      const params = new URLSearchParams(url.split('?')[1]);
      const criteria = JSON.parse(params.get('criteria'));
      expect(criteria).toContainEqual({ fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-01-15' });
    }
  });

  it('sends NO criteria param at all on the total-count request when earliestTbaiCutoverDate is null (no regression)', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'tbai-active', active: 'Y' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The plain total-count request (no status filter) must be free of a
    // criteria param entirely in this scenario — the pre-#13 request shape,
    // byte for byte. The 4 status-filtered counts still carry THEIR OWN
    // 'estado' criteria (pre-existing, unrelated to #13) but must not gain a
    // spurious invoiceDate criteria alongside it.
    const totalCountCall = mockApiFetch.mock.calls
      .map(([url]) => url)
      .find((url) => url.startsWith(SINCRONIZACION_PATH) && !url.includes('estado'));
    expect(totalCountCall).toBeDefined();
    expect(totalCountCall).not.toContain('criteria=');

    const statusCalls = mockApiFetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url.startsWith(SINCRONIZACION_PATH) && url.includes('estado'));
    expect(statusCalls.length).toBe(4);
    for (const url of statusCalls) {
      const params = new URLSearchParams(url.split('?')[1]);
      const criteria = JSON.parse(params.get('criteria'));
      expect(criteria).not.toContainEqual(expect.objectContaining({ fieldName: 'invoiceDate' }));
    }
  });

  it('the per-status count queries (Recibido/Rechazado/etc.) also carry the cutover criteria alongside the status filter', async () => {
    mockApiFetch.mockImplementation(buildApiFetch([
      { id: 'tbai-active', active: 'Y', tbaisystemdate: '2025-03-10' },
    ]));

    const { result } = renderHook(() => useFiscalMonitor('org-1', '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const statusCalls = mockApiFetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url.startsWith(SINCRONIZACION_PATH) && url.includes('estado'));

    expect(statusCalls.length).toBe(4); // Recibido, Rechazado, Error, Pendiente
    for (const url of statusCalls) {
      const params = new URLSearchParams(url.split('?')[1]);
      const criteria = JSON.parse(params.get('criteria'));
      expect(criteria).toContainEqual({ fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-03-10' });
      expect(criteria.some((c) => c.fieldName === 'estado')).toBe(true);
    }
  });
});

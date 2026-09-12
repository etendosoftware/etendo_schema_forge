// ETP-5248 — "[SIF] Las columnas SII y VERI-FACTU comparan cada factura contra
// la organización seleccionada, no la suya". A list grid can show invoices from
// MULTIPLE organizations at once (parent org, "*", multi-org role). Gating every
// row's SII/Verifactu eligibility against `useFiscalConfig(selectedOrg)`'s SINGLE
// cutover date compared each invoice against the WRONG org whenever the row's own
// org differed from the currently-selected one.
//
// `useFiscalConfigForOrgs` fixes this by fetching the earliest-cutover data for
// the FULL SET of distinct org ids present on a page, in parallel, reusing the
// SAME fetchAllRows/earliestCutoverDate primitives ETP-5229 introduced. These
// tests exercise the hook directly (not through either InvoiceHeaderTable), same
// pattern as useFiscalConfig.activeRow.vitest.js.

import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import { useFiscalConfigForOrgs, cutoverForRowOrg } from '../useFiscalConfig.js';

// Fetch impl keyed by BOTH spec name and the `organization` query param, so
// each org+system pair can be fed its own row set — this is what actually
// proves org A's rows never leak into org B's cutover computation.
function apiFor(rowsBySpecAndOrg) {
  return (path) => {
    const url = new URL(path, 'http://local');
    const spec = Object.keys(rowsBySpecAndOrg).find((s) => path.startsWith(`/${s}/`));
    const orgId = url.searchParams.get('organization');
    const rows = rowsBySpecAndOrg[spec]?.[orgId] ?? [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ response: { data: rows } }),
    });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useFiscalConfigForOrgs — per-org fetch (ETP-5248)', () => {
  it('fetches and resolves DISTINCT earliest cutover dates for two different orgs on the same page', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        'sii-config': {
          'org-A': [{ id: 'a1', active: 'Y', monitordate: '2026-06-01T00:00:00.000Z' }],
          'org-B': [{ id: 'b1', active: 'Y', monitordate: '2026-01-01T00:00:00.000Z' }],
        },
        'verifactu-config': { 'org-A': [], 'org-B': [] },
      }),
    );
    const { result } = renderHook(() => useFiscalConfigForOrgs(['org-A', 'org-B'], '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.byOrg['org-A'].earliestSiiCutoverDate).toBe('2026-06-01T00:00:00.000Z');
    expect(result.current.byOrg['org-B'].earliestSiiCutoverDate).toBe('2026-01-01T00:00:00.000Z');

    // The actual regression: an invoice dated 2026-03-15 must be treated as
    // ELIGIBLE against org B's earlier cutover (its own org) and INELIGIBLE
    // against org A's later cutover — proving each org keeps its own date.
    const invoiceDate = new Date('2026-03-15T00:00:00.000Z').getTime();
    const orgACutover = new Date(cutoverForRowOrg(result.current, 'org-A', 'sii')).getTime();
    const orgBCutover = new Date(cutoverForRowOrg(result.current, 'org-B', 'sii')).getTime();
    expect(invoiceDate < orgACutover).toBe(true);   // would show a dash against org A
    expect(invoiceDate >= orgBCutover).toBe(true);  // correctly eligible against its OWN org, B
  });

  it('dedupes org ids and issues ONE request per org+spec regardless of how many rows share an org', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        'sii-config': { 'org-A': [{ id: 'a1', active: 'Y', monitordate: '2026-01-01T00:00:00.000Z' }] },
        'verifactu-config': { 'org-A': [] },
      }),
    );
    // Same org id repeated (as a page of rows all from org A would produce).
    renderHook(() => useFiscalConfigForOrgs(['org-A', 'org-A', 'org-A'], '/api'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    // 2 specs (sii-config, verifactu-config) x 1 distinct org = 2 calls, not 6.
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('resolves independently for verifactu vs sii on the same org', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        'sii-config': { 'org-A': [{ id: 'a1', active: 'Y', monitordate: '2026-02-01T00:00:00.000Z' }] },
        'verifactu-config': { 'org-A': [{ id: 'v1', active: 'Y', inVfactuSystem: '2026-05-01T00:00:00.000Z' }] },
      }),
    );
    const { result } = renderHook(() => useFiscalConfigForOrgs(['org-A'], '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byOrg['org-A'].earliestSiiCutoverDate).toBe('2026-02-01T00:00:00.000Z');
    expect(result.current.byOrg['org-A'].earliestVerifactuCutoverDate).toBe('2026-05-01T00:00:00.000Z');
  });

  it('returns an empty byOrg without calling the API when no org ids are given (empty page)', async () => {
    const { result } = renderHook(() => useFiscalConfigForOrgs([], '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byOrg).toEqual({});
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('ignores null/undefined org ids mixed in with real ones (legacy record fallback edge case)', async () => {
    mockApiFetch.mockImplementation(
      apiFor({
        'sii-config': { 'org-A': [{ id: 'a1', active: 'Y', monitordate: '2026-01-01T00:00:00.000Z' }] },
        'verifactu-config': { 'org-A': [] },
      }),
    );
    const { result } = renderHook(() => useFiscalConfigForOrgs([null, 'org-A', undefined], '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.byOrg)).toEqual(['org-A']);
  });
});

describe('useFiscalConfigForOrgs — partial org fetch failure (ETP-5248 regression risk)', () => {
  // The hook now fans out to N orgs instead of always exactly 1. Each org's
  // fetch goes through the SAME outer `Promise.all(entries.map(...))`, and
  // `fetchAllRows` THROWS on a non-OK response. `Promise.all` rejects on the
  // FIRST rejected member, so if org-fail's request fails (transient 500,
  // timeout, etc.) while org-ok's request already succeeded, the whole batch
  // rejects and the catch block sets `byOrg` back to whatever it was BEFORE
  // this effect run (empty on first load) — org-ok's correctly-fetched data
  // never reaches state. Before this fix there was only ever one org, so a
  // failure could only ever cost that one org; now a single bad org can wipe
  // every other order's SII/VERI-FACTU columns on the same page.
  //
  // This test intentionally documents that risk. It currently FAILS, proving
  // the regression — see BUG-1 in the ETP-5248 QA report.
  it('keeps a successful org\'s cutover data when a DIFFERENT org\'s fetch fails', async () => {
    mockApiFetch.mockImplementation((path) => {
      const url = new URL(path, 'http://local');
      const orgId = url.searchParams.get('organization');
      if (path.startsWith('/sii-config/') && orgId === 'org-fail') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      const rowsBySpecAndOrg = {
        'sii-config': { 'org-ok': [{ id: 'a1', active: 'Y', monitordate: '2026-01-01T00:00:00.000Z' }] },
        'verifactu-config': { 'org-ok': [], 'org-fail': [] },
      };
      const spec = Object.keys(rowsBySpecAndOrg).find((s) => path.startsWith(`/${s}/`));
      const rows = rowsBySpecAndOrg[spec]?.[orgId] ?? [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: { data: rows } }),
      });
    });

    const { result } = renderHook(() => useFiscalConfigForOrgs(['org-ok', 'org-fail'], '/api'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // org-ok's fetch succeeded on its own and should still gate its rows
    // correctly, even though org-fail's request errored out.
    expect(result.current.byOrg['org-ok']?.earliestSiiCutoverDate).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('cutoverForRowOrg — per-row lookup helper (ETP-5248)', () => {
  const fiscalByOrg = {
    byOrg: {
      'org-A': { earliestSiiCutoverDate: '2026-06-01T00:00:00.000Z', earliestVerifactuCutoverDate: null },
      'org-B': { earliestSiiCutoverDate: '2026-01-01T00:00:00.000Z', earliestVerifactuCutoverDate: '2026-03-01T00:00:00.000Z' },
    },
  };

  it('reads the SII cutover for the row\'s own org', () => {
    expect(cutoverForRowOrg(fiscalByOrg, 'org-A', 'sii')).toBe('2026-06-01T00:00:00.000Z');
    expect(cutoverForRowOrg(fiscalByOrg, 'org-B', 'sii')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reads the verifactu cutover independently from sii for the same org', () => {
    expect(cutoverForRowOrg(fiscalByOrg, 'org-B', 'verifactu')).toBe('2026-03-01T00:00:00.000Z');
    expect(cutoverForRowOrg(fiscalByOrg, 'org-A', 'verifactu')).toBeNull();
  });

  it('returns null for an org that has not loaded yet (still fetching, or not in the current page)', () => {
    expect(cutoverForRowOrg(fiscalByOrg, 'org-unknown', 'sii')).toBeNull();
  });

  it('returns null when the row carries no resolvable org id', () => {
    expect(cutoverForRowOrg(fiscalByOrg, null, 'sii')).toBeNull();
    expect(cutoverForRowOrg(fiscalByOrg, undefined, 'sii')).toBeNull();
  });

  it('returns null when passed an empty/loading fiscalByOrg result', () => {
    expect(cutoverForRowOrg({ loading: true, error: null, byOrg: {} }, 'org-A', 'sii')).toBeNull();
  });
});

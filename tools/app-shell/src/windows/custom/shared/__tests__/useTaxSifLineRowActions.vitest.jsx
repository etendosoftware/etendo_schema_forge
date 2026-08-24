// Rewritten for ETP-4888's 3 post-original rounds of changes:
//   1. Selector-context bugfixes — the hook now fetches the invoice header record
//      (`recordId`) and builds proper selector context via `buildLineSelectorContext`
//      (needs `windowCategory` too).
//   2. Design-polish round (commit df238c9f3) — the hook returns `cellBadges.tax`
//      (an InlineLinesPanel-shaped `{ [columnKey]: (row) => ReactNode }` map),
//      NOT `rowActions` anymore. The trigger button uses the shared warning-color
//      token `text-status-warning-foreground`, not a neutral hover-strip style.
//   3. Pagination fix (commit 556d032c8) — `loadTaxCatalog()` now pages through the
//      FULL tax catalog via `offset`/`hasMore` instead of trusting a single request
//      (NeoSelectorService.MAX_LIMIT=100 silently clamps), capped by
//      `TAX_SELECTOR_MAX_PAGES` as a safety net against a misbehaving `hasMore`.

// Mocks must come before imports (Vitest hoisting)
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useFiscalConfigMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Capture the props TaxSifModal receives so tests can assert on them and drive
// its callbacks without depending on TaxSifModal's own internals (covered by
// TaxSifModal.vitest.jsx separately). Same pattern as useRowEmailModal.vitest.jsx's
// SendDocumentModal stub.
const taxSifModalProps = vi.fn();
vi.mock('../TaxSifModal.jsx', () => ({
  default: (props) => {
    taxSifModalProps(props);
    return (
      <div data-testid="tax-sif-modal-stub" data-tax-id={props.taxId}>
        <button type="button" data-testid="modal-close" onClick={props.onClose}>close</button>
        <button
          type="button"
          data-testid="modal-save"
          onClick={() => props.onSaved({ id: props.taxId, EM_Tbai_Claveregimeniva: '05' })}
        >
          save
        </button>
      </div>
    );
  },
}));

import { render, screen, renderHook, act, waitFor } from '@testing-library/react';
import { useTaxSifLineRowActions, isTaxSifMissing } from '../useTaxSifLineRowActions.jsx';

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/sales-invoice';
const RECORD_ID = 'inv-1';

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: async () => body });
}

function headerResponse(record) {
  return jsonResponse({ response: { data: [record] } });
}

function taxSelectorResponse(items, hasMore = false) {
  return jsonResponse({ items, hasMore });
}

// fetch is called twice per load: header GET, then the tax selector GET.
// Tests that don't care about the header content use this default.
function installDefaultFetch({ taxItems = [], hasMore = false } = {}) {
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes('/header/')) return headerResponse({ id: RECORD_ID });
    return taxSelectorResponse(taxItems, hasMore);
  });
}

// Tiny harness so the modal (returned as JSX) goes through a real render cycle,
// same convention as useRowEmailModal.vitest.jsx's Harness. Drives `cellBadges.tax`
// instead of the old `rowActions[0]`.
function Harness({ options }) {
  const { cellBadges, modal } = useTaxSifLineRowActions(options);
  const badge = cellBadges.tax?.({ tax: 'tax-1' });
  return (
    <div>
      {badge}
      {modal}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  installDefaultFetch();
  useAuthMock.mockReturnValue({ selectedOrg: { id: 'ORG-1' } });
  useFiscalConfigMock.mockReturnValue({ profile: 'tbai', verifactuRecord: null });
});

describe('isTaxSifMissing — pure completeness check', () => {
  const ctx = { profile: 'tbai', verifactuRecord: null, ui: (k) => k };

  it('returns false for a null/undefined taxRow', () => {
    expect(isTaxSifMissing(null, ctx)).toBe(false);
    expect(isTaxSifMissing(undefined, ctx)).toBe(false);
  });

  it('returns false when the profile has zero applicable fields (SII), regardless of column values', () => {
    expect(isTaxSifMissing({ EM_Tbai_Claveregimeniva: null }, { profile: 'sii', verifactuRecord: null, ui: (k) => k })).toBe(false);
  });

  it('TBAI régimen: true when the column is null, false when populated', () => {
    expect(isTaxSifMissing({ EM_Tbai_Claveregimeniva: null }, ctx)).toBe(true);
    expect(isTaxSifMissing({ EM_Tbai_Claveregimeniva: '' }, ctx)).toBe(true);
    expect(isTaxSifMissing({ EM_Tbai_Claveregimeniva: '05' }, ctx)).toBe(false);
  });

  it('TBAI exención: true when the exemption cause column is blank, false once set', () => {
    expect(isTaxSifMissing({ taxExempt: 'Y', EM_Tbai_Exemptioncause: null }, ctx)).toBe(true);
    expect(isTaxSifMissing({ taxExempt: 'Y', EM_Tbai_Exemptioncause: 'E1' }, ctx)).toBe(false);
  });

  it('TBAI no-sujeción: true when the non-subject cause column is blank, false once set', () => {
    expect(isTaxSifMissing({ notTaxable: 'Y', EM_Tbai_Nonsubjectcause: null }, ctx)).toBe(true);
    expect(isTaxSifMissing({ notTaxable: 'Y', EM_Tbai_Nonsubjectcause: 'IE' }, ctx)).toBe(false);
  });

  it('Verifactu: missing ONLY the no-sujeción field (régimen already set) still reports missing (ANY blank field counts)', () => {
    const verifactuCtx = { profile: 'verifactu', verifactuRecord: { tAXType: '01' }, ui: (k) => k };
    expect(isTaxSifMissing({
      notTaxable: 'Y',
      EM_Etvfac_Vat_Regime: '01',
      em_etvfac_cause_not_taxable: null,
    }, verifactuCtx)).toBe(true);
  });

  it('Verifactu: both fields populated → false', () => {
    const verifactuCtx = { profile: 'verifactu', verifactuRecord: { tAXType: '01' }, ui: (k) => k };
    expect(isTaxSifMissing({
      notTaxable: 'Y',
      EM_Etvfac_Vat_Regime: '01',
      em_etvfac_cause_not_taxable: 'N1',
    }, verifactuCtx)).toBe(false);
  });

  it('a fully-configured / SII-profile tax reports NOT missing (no trigger)', () => {
    const siiCtx = { profile: 'sii', verifactuRecord: null, ui: (k) => k };
    expect(isTaxSifMissing({ id: 'tax-sii' }, siiCtx)).toBe(false);
  });
});

describe('useTaxSifLineRowActions — fetch gating', () => {
  it('enabled=false: does not fetch, returns empty cellBadges and null modal', () => {
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: false, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.cellBadges).toEqual({});
    expect(result.current.modal).toBeNull();
  });

  it('does not fetch when apiBaseUrl, token, or recordId is missing', () => {
    renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: '', token: TOKEN, enabled: true, recordId: RECORD_ID }));
    renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: '', enabled: true, recordId: RECORD_ID }));
    renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: null }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('a failed header fetch (ok:false) is swallowed — no crash, cellBadges.tax stays absent for the row', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.cellBadges.tax({ tax: 'tax-1' })).toBeNull();
  });

  it('a network-level rejection is swallowed — no crash', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.cellBadges.tax({ tax: 'tax-1' })).toBeNull();
  });
});

describe('useTaxSifLineRowActions — header fetch + selector context wiring', () => {
  it('fetches the header record first, then the tax selector with the built context params', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) {
        return headerResponse({
          id: RECORD_ID,
          priceList: 'PL-1',
          invoiceDate: '2026-01-15',
          partnerAddress: 'ADDR-1',
          'currency$_identifier': 'EUR',
        });
      }
      return taxSelectorResponse([]);
    });

    renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/header/${RECORD_ID}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    ));

    await waitFor(() => {
      const selectorCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCall).toBeTruthy();
      const [url, init] = selectorCall;
      expect(url).toContain(`${API_BASE_URL}/lines/selectors/C_Tax_ID`);
      expect(url).toContain('limit=200');
      expect(url).toContain('offset=0');
      expect(url).toContain('parentId=inv-1');
      expect(url).toContain('isSOTrx=Y');
      expect(url).toContain('priceList=PL-1');
      expect(url).toContain('C_BPartner_Location_ID=ADDR-1');
      expect(url).toContain('currency=EUR');
      expect(init).toEqual({ headers: { Authorization: `Bearer ${TOKEN}` } });
    });
  });

  it('windowCategory: "purchases" derives isSOTrx=N via buildLineSelectorContext', async () => {
    renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'purchases',
    }));

    await waitFor(() => {
      const selectorCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCall).toBeTruthy();
      expect(selectorCall[0]).toContain('isSOTrx=N');
    });
  });

  it('unwraps the NEO envelope ({ response: { data: [...] } }) for the header GET, not the raw envelope', async () => {
    // If the hook read the envelope directly (instead of .response.data[0]),
    // headerRecord would carry none of the expected keys and priceList would
    // never make it into the selector URL.
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) return headerResponse({ id: RECORD_ID, priceList: 'PL-ENVELOPE-TEST' });
      return taxSelectorResponse([]);
    });
    renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => {
      const selectorCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCall?.[0]).toContain('priceList=PL-ENVELOPE-TEST');
    });
  });

  it('a header GET that fails (ok:false) skips the selector context, but the selector is still fetched (no context params)', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) return Promise.resolve({ ok: false });
      return taxSelectorResponse([{ id: 'tax-1', EM_Tbai_Claveregimeniva: null }]);
    });
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => expect(result.current.cellBadges.tax({ tax: 'tax-1' })).not.toBeNull());
  });
});

describe('useTaxSifLineRowActions — pagination (556d032c8)', () => {
  it('single-page catalog (hasMore: false): fetches exactly ONE selector page', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) return headerResponse({ id: RECORD_ID });
      return taxSelectorResponse([{ id: 'tax-1', EM_Tbai_Claveregimeniva: '05' }], false);
    });
    renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));

    await waitFor(() => {
      const selectorCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCalls).toHaveLength(1);
    });
  });

  // Confirmed live: an org with 179 taxes gets back only the first 100 from
  // NeoSelectorService.MAX_LIMIT clamping, silently hiding ~44% of the catalog
  // from the completeness check — loadTaxCatalog() must page through offset=0
  // (100 items, hasMore:true) then offset=100 (the remaining 79, hasMore:false).
  it('179-taxes/100-then-79 scenario (confirmed live): pages through BOTH requests and merges all 179 items', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `tax-${i}`, EM_Tbai_Claveregimeniva: '05' }));
    const page2 = Array.from({ length: 79 }, (_, i) => ({ id: `tax-${100 + i}`, EM_Tbai_Claveregimeniva: '05' }));
    // The tax the row actually cares about is missing its régimen, buried in page 2.
    page2[78] = { id: 'tax-179th', EM_Tbai_Claveregimeniva: null };

    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) return headerResponse({ id: RECORD_ID });
      const u = String(url);
      if (u.includes('offset=0')) return taxSelectorResponse(page1, true);
      if (u.includes('offset=100')) return taxSelectorResponse(page2, false);
      throw new Error(`Unexpected selector URL: ${u}`);
    });

    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));

    await waitFor(() => {
      const selectorCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCalls).toHaveLength(2);
    });
    // Without full pagination this tax (only on page 2) would never be found —
    // the row's completeness check would silently report "not missing" (false negative).
    expect(result.current.cellBadges.tax({ tax: 'tax-179th' })).not.toBeNull();
    // A tax present on either page but already configured stays "not missing".
    expect(result.current.cellBadges.tax({ tax: 'tax-1' })).toBeNull();
  });

  it('offset advances by the PAGE\'S OWN item count, not the requested limit', async () => {
    const page1 = Array.from({ length: 37 }, (_, i) => ({ id: `tax-${i}` }));
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) return headerResponse({ id: RECORD_ID });
      const u = String(url);
      if (u.includes('offset=0')) return taxSelectorResponse(page1, true);
      if (u.includes('offset=37')) return taxSelectorResponse([], false);
      throw new Error(`Unexpected selector URL: ${u}`);
    });
    renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => {
      const selectorCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCalls).toHaveLength(2);
    });
  });

  it('stops after an empty items page even if hasMore were somehow true (loop-termination safety)', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) return headerResponse({ id: RECORD_ID });
      return taxSelectorResponse([], true);
    });
    renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => {
      const selectorCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCalls).toHaveLength(1);
    });
  });

  // TAX_SELECTOR_MAX_PAGES = 20 — a pathological `hasMore: true` forever case
  // must stop, not hang the effect in an infinite fetch loop.
  it('a pathological hasMore:true forever case stops after TAX_SELECTOR_MAX_PAGES (20) pages, does not hang', async () => {
    let callCount = 0;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/header/')) return headerResponse({ id: RECORD_ID });
      callCount += 1;
      // Always returns exactly 1 item and hasMore:true, forever.
      return taxSelectorResponse([{ id: `tax-page-${callCount}` }], true);
    });

    renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));

    await waitFor(() => {
      const selectorCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCalls).toHaveLength(20);
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Tax catalog pagination stopped after 20 pages'));
    warnSpy.mockRestore();
  });

  // ETP-4888 QA finding (commit f6ca951e7): a failed/malformed page used to `return`
  // unconditionally, discarding whatever earlier pages had already collected — so a
  // page-2 blip erased page 1 too and NO badge rendered at all. The fix commits
  // whatever survived and `break`s instead. These two tests cover both edges of that
  // fix: total failure (nothing to keep) vs. partial failure (page 1 survives).
  it('page 1 itself fails (ok:false): commits an EMPTY taxById (no badge anywhere) and warns naming page 1', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/header/')) return headerResponse({ id: RECORD_ID });
      if (u.includes('offset=0')) return Promise.resolve({ ok: false });
      throw new Error(`Unexpected selector URL: ${u}`);
    });

    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));

    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pagination failed at page 1'));
    expect(result.current.cellBadges.tax({ tax: 'tax-1' })).toBeNull();
    warnSpy.mockRestore();
  });

  it('page 1 succeeds, page 2 fails: keeps page 1\'s items (badge still fires for a page-1 tax) and warns naming page 2 — partial catalog beats an empty one', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/header/')) return headerResponse({ id: RECORD_ID });
      if (u.includes('offset=0')) return taxSelectorResponse([{ id: 'tax-page1', EM_Tbai_Claveregimeniva: null }], true);
      if (u.includes('offset=1')) return Promise.resolve({ ok: false });
      throw new Error(`Unexpected selector URL: ${u}`);
    });

    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));

    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pagination failed at page 2'));
    // Page 1's tax survived the page-2 failure — distinguishes this from the
    // total-failure case above, where nothing survives.
    expect(result.current.cellBadges.tax({ tax: 'tax-page1' })).not.toBeNull();
    warnSpy.mockRestore();
  });
});

describe('useTaxSifLineRowActions — cancellation ordering (torn-down effect never warns about a result nobody reads)', () => {
  it('effect teardown between page 1 and page 2 resolving discards page 2 SILENTLY — no warn, even though page 2 resolves as the exact malformed shape that would normally trigger one', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let resolvePage2;
    const page2Promise = new Promise((resolve) => { resolvePage2 = resolve; });

    globalThis.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/header/')) return headerResponse({ id: RECORD_ID });
      if (u.includes('offset=0')) return taxSelectorResponse([{ id: 'tax-1', EM_Tbai_Claveregimeniva: null }], true);
      if (u.includes('offset=1')) return page2Promise;
      throw new Error(`Unexpected selector URL: ${u}`);
    });

    const { unmount } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));

    // Wait until page 2's request has actually been issued — proves teardown happens
    // strictly BETWEEN the two page resolutions, not before page 1 even starts.
    await waitFor(() => {
      const selectorCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/lines/selectors/C_Tax_ID'));
      expect(selectorCalls).toHaveLength(2);
    });

    act(() => { unmount(); }); // runs the effect cleanup -> cancelled = true

    // Resolve page 2 now, as a malformed/failed page — exactly the shape that drives
    // the "pagination failed" warn on the non-cancelled path.
    await act(async () => {
      resolvePage2({ ok: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The `if (cancelled) return;` check runs BEFORE `if (!data?.items)`, so a
    // torn-down effect never reaches the warn branch for a result nobody reads anymore.
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('useTaxSifLineRowActions — stale catalog reset on recordId change', () => {
  it('recordId change resets taxById to {} BEFORE the new fetch resolves — no stale badge leak from the previous invoice, even transiently', async () => {
    let resolveInv2Page1;
    const inv2Page1Promise = new Promise((resolve) => { resolveInv2Page1 = resolve; });

    globalThis.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/header/inv-1')) return headerResponse({ id: 'inv-1' });
      if (u.includes('/header/inv-2')) return headerResponse({ id: 'inv-2' });
      // Both invoices hit the same selector path — distinguish by the parentId param
      // (built from recordId via buildLineSelectorContext), not the URL path.
      if (u.includes('parentId=inv-1')) return taxSelectorResponse([{ id: 'tax-old', EM_Tbai_Claveregimeniva: null }], false);
      if (u.includes('parentId=inv-2')) return inv2Page1Promise; // held pending on purpose
      throw new Error(`Unexpected URL: ${u}`);
    });

    const { result, rerender } = renderHook(
      (props) => useTaxSifLineRowActions(props),
      {
        initialProps: {
          apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: 'inv-1', windowCategory: 'sales',
        },
      },
    );

    await waitFor(() => expect(result.current.cellBadges.tax({ tax: 'tax-old' })).not.toBeNull());

    rerender({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: 'inv-2', windowCategory: 'sales',
    });

    // Synchronous assertion, on purpose: inv-2's own fetch (inv2Page1Promise) is still
    // pending here, so this proves the reset happens up-front, not as a byproduct of
    // the new fetch resolving.
    expect(result.current.cellBadges.tax({ tax: 'tax-old' })).toBeNull();

    // Let inv-2's own fetch resolve, to close out the effect cleanly.
    await act(async () => {
      resolveInv2Page1({ ok: true, json: async () => ({ items: [], hasMore: false }) });
      await Promise.resolve();
    });
  });

  it('re-running the effect while taxById is already {} does not schedule an extra render (functional-form bailout: same reference in, same reference out)', async () => {
    installDefaultFetch({ taxItems: [], hasMore: false });
    const renderSpy = vi.fn();

    function RenderCountHarness({ options }) {
      renderSpy();
      useTaxSifLineRowActions(options);
      return null;
    }

    const { rerender } = render(
      <RenderCountHarness
        options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales' }}
      />,
    );
    await waitFor(() => {
      const selectorCalls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('isSOTrx=Y'));
      expect(selectorCalls.length).toBeGreaterThan(0);
    });
    // Let the initial mount's own fetch settle (taxById becomes its own fresh {} via
    // the final setTaxById(Object.fromEntries([]))) before taking the "before"
    // snapshot, so only the NEXT effect run is under test below.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const rendersBefore = renderSpy.mock.calls.length;

    // Hold the next effect's fetch pending forever so ONLY the top-of-effect
    // synchronous reset can fire during this assertion window — isolates its render
    // behavior from the separately-expected render the eventual fetch resolution
    // would also cause (Object.fromEntries always returns a fresh object, even an
    // empty one, so that later render is real and out of scope here).
    globalThis.fetch = vi.fn(() => new Promise(() => {}));

    // windowCategory is an effect dep — this re-runs the effect (a real deps change,
    // not a no-op re-render) while taxById is already {}.
    rerender(
      <RenderCountHarness
        options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'purchases' }}
      />,
    );

    // The effect DID re-run (proven by the pending fetch having been issued)…
    expect(globalThis.fetch).toHaveBeenCalled();
    // …but exactly ONE extra render happened — from the prop change itself. The
    // effect's own `setTaxById((prev) => prev)` top-of-effect bailout (same
    // reference in, same reference out) must NOT schedule a second one.
    expect(renderSpy.mock.calls.length).toBe(rendersBefore + 1);
  });
});

describe('useTaxSifLineRowActions — cellBadges.tax shape (InlineLinesPanel extension-point contract)', () => {
  it('exposes ONLY a "tax" key when enabled — the badge renderer function', async () => {
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(Object.keys(result.current.cellBadges)).toEqual(['tax']);
    expect(typeof result.current.cellBadges.tax).toBe('function');
  });

  it('renders null (no badge) for a row whose tax is not missing anything', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-1', EM_Tbai_Claveregimeniva: '05' }] });
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.cellBadges.tax({ tax: 'tax-1' })).toBeNull();
  });

  it('renders null for a row whose tax id has no entry in the fetched catalog', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-other', EM_Tbai_Claveregimeniva: null }] });
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.cellBadges.tax({ tax: 'tax-unknown' })).toBeNull();
  });

  it('reflects the SII edge case: a fully-configured / SII tax never renders the badge', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii', verifactuRecord: null });
    installDefaultFetch({ taxItems: [{ id: 'tax-1' }] });
    const { result } = renderHook(() => useTaxSifLineRowActions({
      apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
    }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.cellBadges.tax({ tax: 'tax-1' })).toBeNull();
  });

  it('renders a button with the AlertTriangle icon, aria-label/title from taxSif.trigger.tooltip, testId line-action-tax-sif, and the shared warning-color token', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-1', EM_Tbai_Claveregimeniva: null }] });
    render(<Harness options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales' }} />);

    const button = await screen.findByTestId('line-action-tax-sif');
    expect(button).toHaveAttribute('aria-label', 'taxSif.trigger.tooltip');
    expect(button).toHaveAttribute('title', 'taxSif.trigger.tooltip');
    expect(button.className).toContain('text-status-warning-foreground');
    expect(screen.getByTestId('AlertTriangleIcon__taxSifBadge')).toBeInTheDocument();
  });

  it('clicking the badge stops event propagation (so it does not also trigger a parent cell click-to-edit handler)', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-1', EM_Tbai_Claveregimeniva: null }] });
    const parentClick = vi.fn();

    function WrappedHarness() {
      const { cellBadges, modal } = useTaxSifLineRowActions({
        apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
      });
      return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div onClick={parentClick}>
          {cellBadges.tax({ tax: 'tax-1' })}
          {modal}
        </div>
      );
    }

    render(<WrappedHarness />);
    const button = await screen.findByTestId('line-action-tax-sif');
    await act(async () => { button.click(); });
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe('useTaxSifLineRowActions — modal wiring', () => {
  it('modal is null before the badge is clicked', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-1', EM_Tbai_Claveregimeniva: null }] });
    render(<Harness options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales' }} />);
    await screen.findByTestId('line-action-tax-sif');
    expect(screen.queryByTestId('tax-sif-modal-stub')).not.toBeInTheDocument();
  });

  it('clicking the badge opens the modal with taxId taken from the row (row.tax)', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-1', EM_Tbai_Claveregimeniva: null }] });
    render(<Harness options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales' }} />);
    const button = await screen.findByTestId('line-action-tax-sif');

    await act(async () => { button.click(); });

    const modal = screen.getByTestId('tax-sif-modal-stub');
    expect(modal).toHaveAttribute('data-tax-id', 'tax-1');
    expect(taxSifModalProps.mock.calls.at(-1)[0].apiBaseUrl).toBe(API_BASE_URL);
    expect(taxSifModalProps.mock.calls.at(-1)[0].token).toBe(TOKEN);
  });

  it('onClose from the modal clears modalTaxId — the modal unmounts', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-1', EM_Tbai_Claveregimeniva: null }] });
    render(<Harness options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales' }} />);
    const button = await screen.findByTestId('line-action-tax-sif');
    await act(async () => { button.click(); });
    expect(screen.getByTestId('tax-sif-modal-stub')).toBeInTheDocument();

    await act(async () => { screen.getByTestId('modal-close').click(); });
    expect(screen.queryByTestId('tax-sif-modal-stub')).not.toBeInTheDocument();
  });

  it('onSaved merges the updated tax into taxById (row re-evaluates as no-longer-missing) and closes the modal, WITHOUT a refetch', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-1', name: 'IVA 21%', EM_Tbai_Claveregimeniva: null }] });

    function FullHarness() {
      const { cellBadges, modal } = useTaxSifLineRowActions({
        apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
      });
      const badge = cellBadges.tax?.({ tax: 'tax-1' });
      return (
        <div>
          <div data-testid="still-missing">{String(badge !== null)}</div>
          {badge}
          {modal}
        </div>
      );
    }

    render(<FullHarness />);
    await waitFor(() => expect(screen.getByTestId('still-missing')).toHaveTextContent('true'));

    const button = screen.getByTestId('line-action-tax-sif');
    await act(async () => { button.click(); });
    expect(screen.getByTestId('tax-sif-modal-stub')).toBeInTheDocument();

    const fetchCallsBeforeSave = globalThis.fetch.mock.calls.length;

    // Stub's "save" button calls onSaved({ id: 'tax-1', EM_Tbai_Claveregimeniva: '05' }).
    await act(async () => { screen.getByTestId('modal-save').click(); });

    // Modal closes as part of onSaved (setModalTaxId(null)).
    expect(screen.queryByTestId('tax-sif-modal-stub')).not.toBeInTheDocument();
    // The row is no longer "missing" WITHOUT any refetch — completeness was
    // re-evaluated locally from the merged taxById entry.
    expect(screen.getByTestId('still-missing')).toHaveTextContent('false');
    expect(globalThis.fetch.mock.calls.length).toBe(fetchCallsBeforeSave);
  });

  // Realistic scenario: many invoice lines often share the SAME C_Tax_ID. taxById is
  // keyed by tax id (not by row/line), so a save triggered from ONE line's modal must
  // clear the "missing" trigger for EVERY OTHER line pointing at that same tax — with
  // no per-row bookkeeping and no second fetch. Regression guard for anyone who might
  // later key the completeness cache by row instead of by tax id.
  it('two DIFFERENT lines sharing the SAME tax id both flip to not-missing after ONE of them saves the modal', async () => {
    installDefaultFetch({ taxItems: [{ id: 'tax-shared', name: 'IVA 21%', EM_Tbai_Claveregimeniva: null }] });

    function TwoLinesHarness() {
      const { cellBadges, modal } = useTaxSifLineRowActions({
        apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true, recordId: RECORD_ID, windowCategory: 'sales',
      });
      const badge1 = cellBadges.tax?.({ tax: 'tax-shared' });
      const badge2 = cellBadges.tax?.({ tax: 'tax-shared' });
      return (
        <div>
          {/* Two distinct grid rows, both referencing tax-shared — mirrors two invoice
              lines that use the identical tax rate. */}
          <div data-testid="line1-missing">{String(badge1 !== null)}</div>
          <div data-testid="line2-missing">{String(badge2 !== null)}</div>
          {badge1}
          {modal}
        </div>
      );
    }

    render(<TwoLinesHarness />);
    await waitFor(() => expect(screen.getByTestId('line1-missing')).toHaveTextContent('true'));
    // Both lines start out "missing" — same tax, same enriched (blank) data.
    expect(screen.getByTestId('line2-missing')).toHaveTextContent('true');

    // Open and save the modal from LINE 1 only.
    await act(async () => { screen.getByTestId('line-action-tax-sif').click(); });
    await act(async () => { screen.getByTestId('modal-save').click(); });

    // LINE 2 was never clicked and never opened its own modal, yet it re-evaluates
    // as no-longer-missing too — both reads hit the SAME taxById['tax-shared'] entry.
    expect(screen.getByTestId('line1-missing')).toHaveTextContent('false');
    expect(screen.getByTestId('line2-missing')).toHaveTextContent('false');
  });
});

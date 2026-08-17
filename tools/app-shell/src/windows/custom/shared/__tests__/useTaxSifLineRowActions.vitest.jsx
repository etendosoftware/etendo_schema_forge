// FIXED SOURCE BUG (ETP-4888): `useTaxSifLineRowActions` used to live in a
// `.js` file while containing JSX (a `<TaxSifModal .../>` element), which
// broke esbuild, vitest's SSR transform, `vite build` (production), and the
// real running dev-server window load ("Failed to load window
// \"sales-invoice\": Unexpected token '<'"). Fixed by renaming the source
// file to `useTaxSifLineRowActions.jsx` and updating the two importers
// (sales-invoice/index.jsx, purchase-invoice/index.jsx). This test file was
// written against the pre-fix source and could not run at all until then —
// now verified green against the renamed module.

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
import { AlertTriangle } from 'lucide-react';
import { useTaxSifLineRowActions, isTaxSifMissing } from '../useTaxSifLineRowActions.jsx';

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/sales-invoice';

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: async () => body });
}

// Tiny harness so the modal (returned as JSX) goes through a real render cycle,
// same convention as useRowEmailModal.vitest.jsx's Harness.
function Harness({ options }) {
  const { rowActions, modal } = useTaxSifLineRowActions(options);
  const action = rowActions[0];
  return (
    <div>
      {action && (
        <button
          type="button"
          data-testid="trigger-action"
          onClick={() => action.onClick({ tax: 'tax-1' })}
        >
          trigger
        </button>
      )}
      {modal}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(() => jsonResponse({ items: [] }));
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
    const exemptCtx = ctx;
    expect(isTaxSifMissing({ taxExempt: 'Y', EM_Tbai_Exemptioncause: null }, exemptCtx)).toBe(true);
    expect(isTaxSifMissing({ taxExempt: 'Y', EM_Tbai_Exemptioncause: 'E1' }, exemptCtx)).toBe(false);
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

describe('useTaxSifLineRowActions — fetch wiring', () => {
  it('enabled=false: does not fetch, returns empty rowActions and null modal', () => {
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: false }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.rowActions).toEqual([]);
    expect(result.current.modal).toBeNull();
  });

  it('enabled=true: fetches the tax selector once with limit=200 and the Authorization header', async () => {
    renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/lines/selectors/C_Tax_ID?limit=200`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    ));
  });

  it('does not fetch when apiBaseUrl or token is missing', () => {
    renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: '', token: TOKEN, enabled: true }));
    renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: '', enabled: true }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('a failed fetch (ok:false) is swallowed — no crash, taxById stays empty', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.rowActions[0].show({ tax: 'tax-1' })).toBe(false);
  });

  it('a network-level rejection is swallowed — no crash, taxById stays empty', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.rowActions[0].show({ tax: 'tax-1' })).toBe(false);
  });
});

describe('useTaxSifLineRowActions — rowActions shape (InlineLinesPanel hover-action contract)', () => {
  it('exposes exactly one action: key, icon, tooltip, testId', () => {
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    const [action] = result.current.rowActions;
    expect(action.key).toBe('taxSifTrigger');
    expect(action.icon).toBe(AlertTriangle);
    expect(action.tooltip).toBe('taxSif.trigger.tooltip');
    expect(action.testId).toBe('line-action-tax-sif');
    expect(typeof action.show).toBe('function');
    expect(typeof action.onClick).toBe('function');
  });
});

describe('useTaxSifLineRowActions — show(row): recomputes via selectSifFields against the ENRICHED selector data, does not trust a pre-baked backend boolean', () => {
  it('true when the enriched tax data is missing its TBAI régimen column', async () => {
    globalThis.fetch = vi.fn(() => jsonResponse({
      items: [{ id: 'tax-1', name: 'IVA 21%', EM_Tbai_Claveregimeniva: null }],
    }));
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    await waitFor(() => expect(result.current.rowActions[0].show({ tax: 'tax-1' })).toBe(true));
  });

  it('false when the enriched tax data already carries its TBAI régimen column', async () => {
    globalThis.fetch = vi.fn(() => jsonResponse({
      items: [{ id: 'tax-1', name: 'IVA 21%', EM_Tbai_Claveregimeniva: '05' }],
    }));
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.rowActions[0].show({ tax: 'tax-1' })).toBe(false);
  });

  it('ignores any hypothetical pre-computed flag from the backend — still computes from the raw SIF columns', async () => {
    // Even if the enriched item carried an unrelated boolean like this, the hook must
    // still derive "missing" from the actual raw column, proving it never trusts a
    // server-sent verdict — it always recomputes via selectSifFields()/isTaxSifMissing().
    globalThis.fetch = vi.fn(() => jsonResponse({
      items: [{ id: 'tax-1', sifMissing: false, EM_Tbai_Claveregimeniva: null }],
    }));
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    await waitFor(() => expect(result.current.rowActions[0].show({ tax: 'tax-1' })).toBe(true));
  });

  it('false for a row whose tax id has no entry in the fetched catalog', async () => {
    globalThis.fetch = vi.fn(() => jsonResponse({ items: [{ id: 'tax-other', EM_Tbai_Claveregimeniva: null }] }));
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.rowActions[0].show({ tax: 'tax-unknown' })).toBe(false);
  });

  it('reflects the SII edge case: a fully-configured / SII tax never shows the trigger', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii', verifactuRecord: null });
    globalThis.fetch = vi.fn(() => jsonResponse({ items: [{ id: 'tax-1' }] }));
    const { result } = renderHook(() => useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(result.current.rowActions[0].show({ tax: 'tax-1' })).toBe(false);
  });
});

describe('useTaxSifLineRowActions — modal wiring', () => {
  it('modal is null before any row action is clicked', () => {
    render(<Harness options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }} />);
    expect(screen.queryByTestId('tax-sif-modal-stub')).not.toBeInTheDocument();
  });

  it('clicking the action opens the modal with taxId taken from the row (row.tax)', async () => {
    render(<Harness options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }} />);
    await waitFor(() => expect(screen.getByTestId('trigger-action')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('trigger-action').click(); });

    const modal = screen.getByTestId('tax-sif-modal-stub');
    expect(modal).toHaveAttribute('data-tax-id', 'tax-1');
    expect(taxSifModalProps.mock.calls.at(-1)[0].apiBaseUrl).toBe(API_BASE_URL);
    expect(taxSifModalProps.mock.calls.at(-1)[0].token).toBe(TOKEN);
  });

  it('onClose from the modal clears modalTaxId — the modal unmounts', async () => {
    render(<Harness options={{ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true }} />);
    await act(async () => { screen.getByTestId('trigger-action').click(); });
    expect(screen.getByTestId('tax-sif-modal-stub')).toBeInTheDocument();

    await act(async () => { screen.getByTestId('modal-close').click(); });
    expect(screen.queryByTestId('tax-sif-modal-stub')).not.toBeInTheDocument();
  });

  it('onSaved merges the updated tax into taxById (row re-evaluates as no-longer-missing) and closes the modal', async () => {
    globalThis.fetch = vi.fn(() => jsonResponse({
      items: [{ id: 'tax-1', name: 'IVA 21%', EM_Tbai_Claveregimeniva: null }],
    }));

    function FullHarness() {
      const { rowActions, modal } = useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true });
      const action = rowActions[0];
      return (
        <div>
          <div data-testid="still-missing">{String(action?.show({ tax: 'tax-1' }))}</div>
          <button type="button" data-testid="open" onClick={() => action.onClick({ tax: 'tax-1' })}>open</button>
          {modal}
        </div>
      );
    }

    render(<FullHarness />);
    await waitFor(() => expect(screen.getByTestId('still-missing')).toHaveTextContent('true'));

    await act(async () => { screen.getByTestId('open').click(); });
    expect(screen.getByTestId('tax-sif-modal-stub')).toBeInTheDocument();

    // Stub's "save" button calls onSaved({ id: 'tax-1', EM_Tbai_Claveregimeniva: '05' }).
    await act(async () => { screen.getByTestId('modal-save').click(); });

    // Modal closes as part of onSaved (setModalTaxId(null)).
    expect(screen.queryByTestId('tax-sif-modal-stub')).not.toBeInTheDocument();
    // The row is no longer "missing" WITHOUT any refetch — completeness was
    // re-evaluated locally from the merged taxById entry.
    expect(screen.getByTestId('still-missing')).toHaveTextContent('false');
  });
});

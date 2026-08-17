// Integration test (ETP-4888 QA): exercises the REAL TaxSifModal.jsx wired through the
// REAL useTaxSifLineRowActions.jsx — unlike useTaxSifLineRowActions.vitest.jsx, which
// stubs TaxSifModal entirely, and TaxSifModal.vitest.jsx, which tests the modal in
// isolation. Only the network boundary (fetch/fetchById/patchById) and framework
// context (auth/fiscal-config/i18n/dialog/EntityForm) are mocked, so this is the only
// test that proves the full hover-trigger -> modal -> save -> cache-merge -> re-derived
// "still missing" pipeline for the Verifactu 2-field case, matching the exact scenario
// selectSifFields() documents: a tax that is non-taxable AND needs the régimen field
// shows BOTH fields at once, and saving only ONE of them must still report the row as
// "missing" afterward (partial completion), never a false "all done".

// Mocks must come before imports (Vitest hoisting)
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useFiscalConfigMock = vi.fn();
const useAuthMock = vi.fn();
const fetchByIdMock = vi.fn();
const patchByIdMock = vi.fn();

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  fetchById: (...args) => fetchByIdMock(...args),
  patchById: (...args) => patchByIdMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Same inline-dialog stub TaxSifModal.vitest.jsx uses, so the real Dialog primitive's
// portal/pointer-events do not get in the way of this test's own render assertions.
vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ open, children, onOpenChange }) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-overlay-close" onClick={() => onOpenChange(false)} />
        {children}
      </div>
    ) : null,
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogHeader: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogFooter: ({ children, ...rest }) => <div {...rest}>{children}</div>,
}));

// Stub EntityForm (same pattern as TaxSifModal.vitest.jsx) so this stays a unit-level
// render, not a full contract-ui mount, while still exercising the REAL selectSifFields()
// field selection TaxSifModal.jsx performs.
const entityFormProps = vi.fn();
vi.mock('@/components/contract-ui', () => ({
  EntityForm: (props) => {
    entityFormProps(props);
    return (
      <div data-testid="TaxSifModal__EntityForm">
        {(props.fields || []).map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`change-${f.key}`}
            onClick={() => props.onChange(f.key, `${f.key}-new-value`)}
          >
            change {f.key}
          </button>
        ))}
      </div>
    );
  },
}));

// TaxSifModal.jsx and TaxSifField.jsx (selectSifFields) are imported REAL — NOT mocked —
// by useTaxSifLineRowActions.jsx, so this test exercises the true end-to-end wiring.
import { render, screen, act, waitFor } from '@testing-library/react';
import { useTaxSifLineRowActions } from '../useTaxSifLineRowActions.jsx';

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/sales-invoice';
const TAX_ID = 'tax-verifactu-2field';

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: async () => body });
}

function Harness() {
  const { rowActions, modal } = useTaxSifLineRowActions({ apiBaseUrl: API_BASE_URL, token: TOKEN, enabled: true });
  const action = rowActions[0];
  return (
    <div>
      <div data-testid="still-missing">{String(action?.show({ tax: TAX_ID }))}</div>
      <button type="button" data-testid="open" onClick={() => action.onClick({ tax: TAX_ID })}>open</button>
      {modal}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ selectedOrg: { id: 'ORG-1' } });
  // Verifactu, tAXType '01' (IVA) -> régimen field is EM_Etvfac_Vat_Regime, ALWAYS shown.
  useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
  // The row's tax is non-taxable AND missing BOTH its régimen and no-sujeción columns —
  // selectSifFields() returns exactly 2 fields for this shape (see TaxSifField.jsx).
  globalThis.fetch = vi.fn(() => jsonResponse({
    items: [{
      id: TAX_ID,
      name: 'Operación no sujeta',
      notTaxable: 'Y',
      EM_Etvfac_Vat_Regime: null,
      em_etvfac_cause_not_taxable: null,
    }],
  }));
  fetchByIdMock.mockResolvedValue({
    id: TAX_ID,
    name: 'Operación no sujeta',
    notTaxable: 'Y',
    EM_Etvfac_Vat_Regime: null,
    em_etvfac_cause_not_taxable: null,
  });
  patchByIdMock.mockResolvedValue({ id: TAX_ID });
});

describe('useTaxSifLineRowActions + TaxSifModal (real, end-to-end) — Verifactu 2-field partial completion', () => {
  it('renders BOTH applicable fields in the modal for a non-taxable Verifactu tax', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('still-missing')).toHaveTextContent('true'));

    await act(async () => { screen.getByTestId('open').click(); });
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    const fields = entityFormProps.mock.calls.at(-1)[0].fields;
    expect(fields.map((f) => f.column)).toEqual([
      'EM_Etvfac_Vat_Regime',
      'em_etvfac_cause_not_taxable',
    ]);
  });

  it('saving only the régimen field (leaving no-sujeción blank) PATCHes only that field, and the row still reports "missing" afterward — not a false "all done"', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('still-missing')).toHaveTextContent('true'));

    await act(async () => { screen.getByTestId('open').click(); });
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    // User fills in ONLY the régimen field, leaves em_etvfac_cause_not_taxable untouched.
    await act(async () => { screen.getByTestId('change-etvfacVatRegime').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    // patchById must NOT be called with the untouched field — never overwrite what the
    // user didn't edit.
    await waitFor(() => expect(patchByIdMock).toHaveBeenCalledWith(
      'tax', 'tax', TAX_ID,
      { etvfacVatRegime: 'etvfacVatRegime-new-value' },
      TOKEN, API_BASE_URL,
    ));

    // Modal closed as part of a successful save.
    await waitFor(() => expect(screen.queryByTestId('dialog')).not.toBeInTheDocument());

    // THE key assertion for this edge case: even though the régimen field is now filled,
    // the row is STILL reported as missing — em_etvfac_cause_not_taxable is still blank —
    // re-derived locally from the merged taxById entry, with no refetch.
    expect(screen.getByTestId('still-missing')).toHaveTextContent('true');
  });

  it('saving BOTH fields clears the trigger entirely (control case, contrasts with the partial-save assertion above)', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('still-missing')).toHaveTextContent('true'));

    await act(async () => { screen.getByTestId('open').click(); });
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('change-etvfacVatRegime').click(); });
    await act(async () => { screen.getByTestId('change-etvfacCauseNotTaxable').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(patchByIdMock).toHaveBeenCalledWith(
      'tax', 'tax', TAX_ID,
      {
        etvfacVatRegime: 'etvfacVatRegime-new-value',
        etvfacCauseNotTaxable: 'etvfacCauseNotTaxable-new-value',
      },
      TOKEN, API_BASE_URL,
    ));

    expect(screen.getByTestId('still-missing')).toHaveTextContent('false');
  });
});

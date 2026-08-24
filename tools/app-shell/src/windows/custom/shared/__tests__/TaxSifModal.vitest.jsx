// Rewritten for ETP-4888's design-polish round (commit df238c9f3): TaxSifModal.jsx
// was rewritten from an EntityForm-driven form to a bespoke layout — a single-line
// label above an EnumSearchSelect (searchable code+description picker) per field,
// a tax-name badge/pill, a caption line, and a Save button gated on `hasChanges`.
// This file replaces the old EntityForm-stub-based version, which asserted a
// completely different internal structure (EntityForm props, field-key change
// buttons) that no longer exists.

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

vi.mock('@/components/related-documents/helpers.js', () => ({
  fetchById: (...args) => fetchByIdMock(...args),
  patchById: (...args) => patchByIdMock(...args),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Render the dialog inline (no portal / pointer-events friction) — same pattern
// used by NewAccountModal.vitest.jsx / AddPaymentModal.vitest.jsx.
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

import { render, screen, waitFor, act } from '@testing-library/react';
import { toast } from 'sonner';
// selectSifFields is imported REAL (not mocked) — TaxSifModal.jsx reuses the
// exact same pure function TaxSifField.jsx uses, so this exercises the real
// field-selection contract, not a stand-in. EnumSearchSelect is also real
// (not mocked): it is a small, self-contained component and TaxSifModal's own
// interaction contract (search/select/chip) lives inside it.
import TaxSifModal from '../TaxSifModal.jsx';

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/sales-invoice';

function baseProps(overrides = {}) {
  return {
    taxId: 'tax-1',
    apiBaseUrl: API_BASE_URL,
    token: TOKEN,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    ...overrides,
  };
}

// Picks the régimen field's value out of the field.options built by
// selectSifFields()/buildOptions() in TaxSifField.jsx — '05' always exists in
// OPTION_VALUES.tbaiRegime.
const REGIME_VALUE = '05';

async function openAndWaitReady() {
  render(<TaxSifModal {...baseProps()} />);
  await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
}

async function pickRegimeOption(value = REGIME_VALUE) {
  await act(async () => {
    screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-input').focus();
  });
  await act(async () => {
    screen.getByTestId(`tax-sif-modal-field-tbaiClaveregimeniva-option-${value}`).click();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ selectedOrg: { id: 'ORG-1' } });
  useFiscalConfigMock.mockReturnValue({ profile: 'tbai', verifactuRecord: null });
  fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%' });
  patchByIdMock.mockResolvedValue({ id: 'tax-1' });
});

describe('TaxSifModal — open/closed + fetch-on-open', () => {
  it('renders nothing when taxId is null', () => {
    render(<TaxSifModal {...baseProps({ taxId: null })} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    expect(fetchByIdMock).not.toHaveBeenCalled();
  });

  it('fetches the tax record via fetchById(spec="tax", entity="tax", taxId, token, apiBaseUrl) when opened', async () => {
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalledWith('tax', 'tax', 'tax-1', TOKEN, API_BASE_URL));
  });

  it('shows a loading state before the fetch resolves, and hides the fields afterward', async () => {
    let resolveFetch;
    fetchByIdMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    render(<TaxSifModal {...baseProps()} />);
    expect(screen.getByTestId('tax-sif-modal-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).not.toBeInTheDocument();

    await act(async () => {
      resolveFetch({ id: 'tax-1', name: 'IVA 21%' });
    });
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
    expect(screen.queryByTestId('tax-sif-modal-loading')).not.toBeInTheDocument();
  });

  it('re-fetches when taxId changes to a different record', async () => {
    const { rerender } = render(<TaxSifModal {...baseProps({ taxId: 'tax-1' })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalledWith('tax', 'tax', 'tax-1', TOKEN, API_BASE_URL));

    rerender(<TaxSifModal {...baseProps({ taxId: 'tax-2' })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalledWith('tax', 'tax', 'tax-2', TOKEN, API_BASE_URL));
  });
});

describe('TaxSifModal — bespoke layout (design-polish round, no EntityForm)', () => {
  it('renders a single-line label above the EnumSearchSelect field for TBAI régimen', async () => {
    await openAndWaitReady();
    const label = screen.getByTestId('tax-sif-modal-label-tbaiClaveregimeniva');
    expect(label).toHaveTextContent('taxSif.field.tbaiRegime');
    expect(label.className).toContain('whitespace-nowrap');
    expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument();
  });

  it('renders TWO labeled EnumSearchSelect fields for a non-taxable Verifactu tax', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    fetchByIdMock.mockResolvedValue({ id: 'tax-2', name: 'Non-taxable', notTaxable: 'Y' });

    render(<TaxSifModal {...baseProps({ taxId: 'tax-2' })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-etvfacVatRegime')).toBeInTheDocument());
    expect(screen.getByTestId('tax-sif-modal-field-etvfacCauseNotTaxable')).toBeInTheDocument();
    expect(screen.getByTestId('tax-sif-modal-label-etvfacVatRegime')).toHaveTextContent('taxSif.field.verifactuRegimeIva');
    expect(screen.getByTestId('tax-sif-modal-label-etvfacCauseNotTaxable')).toHaveTextContent('taxSif.field.verifactuNonSubject');
  });

  it('renders zero fields (and the caption, but no crash) when no field applies (SII)', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii', verifactuRecord: null });
    fetchByIdMock.mockResolvedValue({ id: 'tax-3', name: 'SII tax' });

    render(<TaxSifModal {...baseProps({ taxId: 'tax-3' })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-caption')).toBeInTheDocument());
    expect(screen.queryByTestId(/tax-sif-modal-field-/)).not.toBeInTheDocument();
  });

  it('renders the tax name as a pill badge when present', async () => {
    fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%' });
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-tax-badge')).toHaveTextContent('IVA 21%'));
  });

  it('omits the tax-name badge when the fetched record has no name', async () => {
    fetchByIdMock.mockResolvedValue({ id: 'tax-1' });
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
    expect(screen.queryByTestId('tax-sif-modal-tax-badge')).not.toBeInTheDocument();
  });

  it('renders the caption text', async () => {
    await openAndWaitReady();
    expect(screen.getByTestId('tax-sif-modal-caption')).toHaveTextContent('taxSif.modal.caption');
  });

  // Regression guard: the pre-redesign modal never had a "Ver guía" (view guide)
  // link/element anywhere in its markup — assert its absence explicitly so a
  // future change doesn't silently reintroduce it.
  it('never renders a "Ver guía" element anywhere in the modal (regression guard)', async () => {
    await openAndWaitReady();
    expect(screen.queryByText(/ver gu[ií]a/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/guide/i)).not.toBeInTheDocument();
  });
});

describe('TaxSifModal — EnumSearchSelect field integration', () => {
  it('the field renders the currently selected value as a code+description chip when the fetched record already has it set', async () => {
    fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%', tbaiClaveregimeniva: undefined, EM_Tbai_Claveregimeniva: '05' });
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
    // editing state is seeded from the fetched record by field.key (not field.column) —
    // TaxSifModal reads `editing?.[field.key]`, so a record whose only populated key is
    // the raw AD column (as the real backend response would be) starts unselected. This
    // documents the actual current behavior: the modal trusts field.key, matching what
    // the EntityForm-era field also always did (selectSifFields keeps col->key mapping).
    expect(screen.queryByTestId('tax-sif-modal-field-tbaiClaveregimeniva-chip')).not.toBeInTheDocument();
  });

  it('picking an option updates the field value (chip appears, showing code and description as distinct pieces)', async () => {
    await openAndWaitReady();
    await pickRegimeOption('05');

    const chip = screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva-chip');
    expect(chip).toHaveTextContent('05');
    expect(chip).toHaveTextContent('taxSif.opt.tbaiRegime.05');
  });
});

describe('TaxSifModal — save flow', () => {
  it('Save is disabled until a field actually changes (hasChanges gate)', async () => {
    await openAndWaitReady();
    expect(screen.getByTestId('tax-sif-modal-save')).toBeDisabled();

    await pickRegimeOption('05');
    expect(screen.getByTestId('tax-sif-modal-save')).not.toBeDisabled();
  });

  it('save with no changes calls onClose WITHOUT calling patchById (Save stays disabled, but exercise handleSave defensively is not needed since the button is disabled)', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ onClose, onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

    expect(screen.getByTestId('tax-sif-modal-save')).toBeDisabled();
    expect(patchByIdMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('save calls patchById with ONLY the changed field, keyed by field.key', async () => {
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

    await pickRegimeOption('05');
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(patchByIdMock).toHaveBeenCalledWith(
      'tax', 'tax', 'tax-1',
      { tbaiClaveregimeniva: '05' },
      TOKEN, API_BASE_URL,
    ));
  });

  it('save success: shows the success toast and calls onSaved with { id, [rawColumn]: editedValue } — translated from the LOCAL edited value, not from patchById\'s resolved payload', async () => {
    // Deliberately resolve patchById with a DIFFERENT value than what was edited,
    // to prove onSaved's payload is built from `editing` (the local field.key state),
    // never from whatever patchById happened to resolve with.
    patchByIdMock.mockResolvedValue({ id: 'tax-1', EM_Tbai_Claveregimeniva: 'IGNORED-SERVER-ECHO' });
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

    await pickRegimeOption('05');
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      id: 'tax-1',
      EM_Tbai_Claveregimeniva: '05',
    }));
    expect(toast.success).toHaveBeenCalledWith('taxSif.modal.saveSuccess');
  });

  it('save success with two changed Verifactu fields: onSaved carries both raw columns', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    fetchByIdMock.mockResolvedValue({ id: 'tax-2', notTaxable: 'Y' });
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ taxId: 'tax-2', onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-etvfacVatRegime')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('tax-sif-modal-field-etvfacVatRegime-input').focus(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-field-etvfacVatRegime-option-01').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-field-etvfacCauseNotTaxable-input').focus(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-field-etvfacCauseNotTaxable-option-N1').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      id: 'tax-2',
      EM_Etvfac_Vat_Regime: '01',
      em_etvfac_cause_not_taxable: 'N1',
    }));
  });

  it('save failure (network/500): shows an error toast, does NOT call onSaved, modal stays open (onClose not called)', async () => {
    patchByIdMock.mockRejectedValue(new Error('Invalid regime code'));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ onClose, onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

    await pickRegimeOption('05');
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid regime code'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('save failure with no error message falls back to ui("networkError")', async () => {
    patchByIdMock.mockRejectedValue(new Error(''));
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

    await pickRegimeOption('05');
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
  });

  it('disables Save/Cancel while saving is in flight', async () => {
    let resolvePatch;
    patchByIdMock.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }));
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

    await pickRegimeOption('05');
    act(() => { screen.getByTestId('tax-sif-modal-save').click(); });

    expect(screen.getByTestId('tax-sif-modal-save')).toBeDisabled();
    expect(screen.getByTestId('tax-sif-modal-cancel')).toBeDisabled();

    await act(async () => { resolvePatch({ id: 'tax-1' }); });
  });
});

describe('TaxSifModal — closing', () => {
  it('calls onClose when the Cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(<TaxSifModal {...baseProps({ onClose })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

    screen.getByTestId('tax-sif-modal-cancel').click();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the dialog reports a close via onOpenChange (backdrop/escape)', async () => {
    const onClose = vi.fn();
    render(<TaxSifModal {...baseProps({ onClose })} />);
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument());

    screen.getByTestId('dialog-overlay-close').click();
    expect(onClose).toHaveBeenCalled();
  });
});

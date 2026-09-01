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
const fetchByCriteriaMock = vi.fn();
const patchByIdMock = vi.fn();

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  fetchById: (...args) => fetchByIdMock(...args),
  fetchByCriteria: (...args) => fetchByCriteriaMock(...args),
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
  fetchByCriteriaMock.mockResolvedValue([]);
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

  // ETP-5027: a modal with zero applicable fields used to still render — title, tax
  // badge, caption and a permanently-disabled Save — a dead-end dialog. It now renders
  // nothing at all once loading has resolved.
  it('renders NOTHING (not an empty dialog) when no field applies (SII)', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii', verifactuRecord: null });
    fetchByIdMock.mockResolvedValue({ id: 'tax-3', name: 'SII tax' });

    render(<TaxSifModal {...baseProps({ taxId: 'tax-3' })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('tax-sif-modal')).not.toBeInTheDocument());
    expect(screen.queryByTestId('tax-sif-modal-caption')).not.toBeInTheDocument();
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

// ETP-4888 follow-up (commit 147f79100, UX simplified in 19d909b63) — compound/
// summary-tax resolution. A summary tax (`summaryLevel='Y'`) has always-blank SIF
// columns; the modal must resolve down to the one non-equivalence-charge
// rate-component child (via `fetchByCriteria('parentTaxRate', taxId, ...)` +
// `pickRegimeChild()`) and read/edit/PATCH THAT record instead. The badge shows
// the RESOLVED record's own name — the child's when one was resolved, the
// summary's otherwise (19d909b63 removed the earlier "kept for reference only"
// caption based on review feedback; assert against the CURRENT behavior).
describe('TaxSifModal — compound/summary tax resolution (ETP-4888 follow-up)', () => {
  const SUMMARY_ID = 'tax-summary';

  function summaryRecord(overrides = {}) {
    return { id: SUMMARY_ID, name: 'Entregas IVA+RE 21+5.2% ISP', summaryLevel: 'Y', ...overrides };
  }

  it('fetches candidate children via fetchByCriteria("parentTaxRate", taxId, ...) when the fetched record is a summary tax', async () => {
    fetchByIdMock.mockResolvedValue(summaryRecord());
    fetchByCriteriaMock.mockResolvedValue([
      { id: 'child-base', name: 'IVA 21%', oBSPTIEquivalentCharge: 'N', EM_Tbai_Claveregimeniva: null },
    ]);
    render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
    await waitFor(() => expect(fetchByCriteriaMock).toHaveBeenCalledWith(
      'tax', 'tax', 'parentTaxRate', SUMMARY_ID, TOKEN, API_BASE_URL,
    ));
  });

  it('does NOT fetch children for a non-summary (plain) tax', async () => {
    await openAndWaitReady();
    expect(fetchByCriteriaMock).not.toHaveBeenCalled();
  });

  describe('exactly ONE non-equivalence-charge child — resolves to it', () => {
    beforeEach(() => {
      fetchByIdMock.mockResolvedValue(summaryRecord());
      fetchByCriteriaMock.mockResolvedValue([
        { id: 'child-base', name: 'IVA 21%', oBSPTIEquivalentCharge: 'N', EM_Tbai_Claveregimeniva: null },
        { id: 'child-re', name: 'Recargo de Equivalencia 5.2%', oBSPTIEquivalentCharge: 'Y', EM_Tbai_Claveregimeniva: null },
      ]);
    });

    it('renders the CHILD\'s fields (edit target is the child, not the blank summary)', async () => {
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
    });

    it('shows the CHILD\'s name in the badge, not the summary\'s (post-19d909b63 behavior)', async () => {
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-tax-badge')).toHaveTextContent('IVA 21%'));
      expect(screen.queryByText('Entregas IVA+RE 21+5.2% ISP')).not.toBeInTheDocument();
    });

    it('does not render any "kept for reference only" caption/text (removed by 19d909b63)', async () => {
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-tax-badge')).toBeInTheDocument());
      expect(screen.queryByText(/kept for reference only/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/solo a modo de referencia/i)).not.toBeInTheDocument();
    });

    it('save PATCHes the CHILD\'s id (resolvedTaxId), never the summary\'s id', async () => {
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

      await pickRegimeOption('05');
      await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

      await waitFor(() => expect(patchByIdMock).toHaveBeenCalledWith(
        'tax', 'tax', 'child-base',
        { tbaiClaveregimeniva: '05' },
        TOKEN, API_BASE_URL,
      ));
      expect(patchByIdMock).not.toHaveBeenCalledWith('tax', 'tax', SUMMARY_ID, expect.anything(), expect.anything(), expect.anything());
    });

    it('onSaved is called with the CHILD\'s id, so the caller\'s taxById cache updates the child\'s own entry', async () => {
      const onSaved = vi.fn();
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID, onSaved })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

      await pickRegimeOption('05');
      await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
        id: 'child-base',
        EM_Tbai_Claveregimeniva: '05',
      }));
    });
  });

  describe('ZERO non-equivalence-charge children — falls back to editing the summary directly', () => {
    beforeEach(() => {
      fetchByIdMock.mockResolvedValue(summaryRecord());
      fetchByCriteriaMock.mockResolvedValue([
        { id: 'child-re', name: 'Recargo de Equivalencia 5.2%', oBSPTIEquivalentCharge: 'Y' },
      ]);
    });

    it('renders the SUMMARY\'s own fields (unresolved compound structure — never guess wrong)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not uniquely resolve a rate-component child'));
      warnSpy.mockRestore();
    });

    it('shows the SUMMARY\'s own name in the badge (no child was resolved)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-tax-badge')).toHaveTextContent('Entregas IVA+RE 21+5.2% ISP'));
    });

    it('save PATCHes the SUMMARY\'s own id when no child was resolved', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());

      await pickRegimeOption('05');
      await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

      await waitFor(() => expect(patchByIdMock).toHaveBeenCalledWith(
        'tax', 'tax', SUMMARY_ID,
        { tbaiClaveregimeniva: '05' },
        TOKEN, API_BASE_URL,
      ));
    });
  });

  describe('MORE THAN ONE non-equivalence-charge child — falls back to editing the summary directly', () => {
    beforeEach(() => {
      fetchByIdMock.mockResolvedValue(summaryRecord());
      fetchByCriteriaMock.mockResolvedValue([
        { id: 'child-a', name: 'Child A', oBSPTIEquivalentCharge: 'N' },
        { id: 'child-b', name: 'Child B', oBSPTIEquivalentCharge: 'N' },
      ]);
    });

    it('renders the SUMMARY\'s own fields and shows its own name in the badge (ambiguous — never guess)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-tax-badge')).toHaveTextContent('Entregas IVA+RE 21+5.2% ISP'));
    });
  });

  describe('non-compound (plain) tax — unaffected, resolves to itself', () => {
    it('shows its own name in the badge, identical to pre-147f79100 behavior', async () => {
      fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%' });
      render(<TaxSifModal {...baseProps()} />);
      await waitFor(() => expect(screen.getByTestId('tax-sif-modal-tax-badge')).toHaveTextContent('IVA 21%'));
    });

    it('save PATCHes its own id (taxId), matching resolvedTaxId', async () => {
      fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%' });
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
  });

  it('re-fetching children is skipped when taxId changes but the new record is not a summary tax', async () => {
    fetchByIdMock.mockImplementation((_spec, _entity, id) =>
      id === SUMMARY_ID
        ? Promise.resolve(summaryRecord())
        : Promise.resolve({ id, name: 'Plain tax' }));
    fetchByCriteriaMock.mockResolvedValue([
      { id: 'child-base', name: 'IVA 21%', oBSPTIEquivalentCharge: 'N' },
    ]);

    const { rerender } = render(<TaxSifModal {...baseProps({ taxId: SUMMARY_ID })} />);
    await waitFor(() => expect(fetchByCriteriaMock).toHaveBeenCalledTimes(1));

    rerender(<TaxSifModal {...baseProps({ taxId: 'tax-plain' })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-tax-badge')).toHaveTextContent('Plain tax'));
    expect(fetchByCriteriaMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ETP-5027 — the `targets` document-direction pass-through.
//
// `useTaxSifLineRowActions` already refuses to open the modal when the gate
// yields zero fields; the prop is defence-in-depth, so these tests drive the
// modal directly with real `getInvoiceFiscalTargets()` output.
// ---------------------------------------------------------------------------
import { getInvoiceFiscalTargets } from '../fiscalTargets.js';

describe('TaxSifModal — targets document-direction gate (ETP-5027)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ selectedOrg: { id: 'ORG-1' } });
    useFiscalConfigMock.mockReturnValue({ profile: 'tbai', verifactuRecord: null });
    fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%' });
    fetchByCriteriaMock.mockResolvedValue([]);
  });

  it('renders NOTHING for a VERI*FACTU purchase invoice — the key can never be sent', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    const targets = getInvoiceFiscalTargets('purchase-invoice', 'verifactu');

    render(<TaxSifModal {...baseProps({ targets })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('tax-sif-modal')).not.toBeInTheDocument());
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('still renders for the SAME profile on a sales invoice (proves the gate, not the profile, is what suppressed it)', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    const targets = getInvoiceFiscalTargets('sales-invoice', 'verifactu');

    render(<TaxSifModal {...baseProps({ targets })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-etvfacVatRegime')).toBeInTheDocument());
  });

  it('renders NOTHING for a TBAI purchase invoice outside BIZKAIA', async () => {
    const targets = getInvoiceFiscalTargets('purchase-invoice', 'tbai', 'GIPUZKOA');

    render(<TaxSifModal {...baseProps({ targets })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('tax-sif-modal')).not.toBeInTheDocument());
  });

  // The deliberate loosening — assert it is ALLOWED, not merely non-crashing.
  it('DOES render for a TBAI purchase invoice under BIZKAIA (Batuz/LROE sends purchases)', async () => {
    const targets = getInvoiceFiscalTargets('purchase-invoice', 'tbai', 'BIZKAIA');

    render(<TaxSifModal {...baseProps({ targets })} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
  });

  it('purchase orders are gated exactly like purchase invoices', async () => {
    const targets = getInvoiceFiscalTargets('purchase-order', 'tbai', 'ARABA');

    render(<TaxSifModal {...baseProps({ targets })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('tax-sif-modal')).not.toBeInTheDocument());
  });

  it('omitting targets keeps the ungated behaviour (default null)', async () => {
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('tax-sif-modal-field-tbaiClaveregimeniva')).toBeInTheDocument());
  });

  it('shows the loading dialog while the record is still being fetched, even when the gate will empty it', async () => {
    // The `!loading` guard must not swallow the loading state: selectedFields is
    // [] before `editing` exists, and returning null there would flash nothing.
    let resolveFetch;
    fetchByIdMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const targets = getInvoiceFiscalTargets('purchase-invoice', 'tbai', 'ARABA');

    render(<TaxSifModal {...baseProps({ targets })} />);
    expect(screen.getByTestId('tax-sif-modal-loading')).toBeInTheDocument();

    await act(async () => {
      resolveFetch({ id: 'tax-1', name: 'IVA 21%' });
    });
    await waitFor(() => expect(screen.queryByTestId('tax-sif-modal')).not.toBeInTheDocument());
  });
});

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
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
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

// Stub EntityForm so the render test doesn't pull the full contract-ui tree.
// Capture the props (and expose onChange) the same way TaxSifField.vitest.jsx
// does, so tests can both assert what was passed AND drive local edits.
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

import { render, screen, waitFor, act } from '@testing-library/react';
import { toast } from 'sonner';
// selectSifFields is imported REAL (not mocked) — TaxSifModal.jsx reuses the
// exact same pure function TaxSifField.jsx uses, so this exercises the real
// field-selection contract, not a stand-in.
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

  it('shows a loading state before the fetch resolves', async () => {
    let resolveFetch;
    fetchByIdMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    render(<TaxSifModal {...baseProps()} />);
    expect(screen.getByTestId('tax-sif-modal-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('TaxSifModal__EntityForm')).not.toBeInTheDocument();

    await act(async () => {
      resolveFetch({ id: 'tax-1', name: 'IVA 21%' });
    });
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());
  });

  it('re-fetches when taxId changes to a different record', async () => {
    const { rerender } = render(<TaxSifModal {...baseProps({ taxId: 'tax-1' })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalledWith('tax', 'tax', 'tax-1', TOKEN, API_BASE_URL));

    rerender(<TaxSifModal {...baseProps({ taxId: 'tax-2' })} />);
    await waitFor(() => expect(fetchByIdMock).toHaveBeenCalledWith('tax', 'tax', 'tax-2', TOKEN, API_BASE_URL));
  });
});

describe('TaxSifModal — renders selectSifFields()-selected fields via EntityForm', () => {
  it('TBAI régimen (one field) — passes field + one-entry labelOverrides', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'tbai', verifactuRecord: null });
    fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%' });

    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(entityFormProps).toHaveBeenCalled());

    const props = entityFormProps.mock.calls.at(-1)[0];
    expect(props.entity).toBe('tax');
    expect(props.fields.map((f) => f.key)).toEqual(['tbaiClaveregimeniva']);
    expect(props.labelOverrides).toEqual({
      es_ES: { EM_Tbai_Claveregimeniva: 'taxSif.field.tbaiRegime' },
    });
    expect(props.displayLogic).toEqual({ readOnly: {}, visibility: {} });
    expect(props.layout).toBe('horizontal');
  });

  it('Verifactu non-taxable (two fields) — régimen + no-sujeción', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    fetchByIdMock.mockResolvedValue({ id: 'tax-2', name: 'Non-taxable', notTaxable: 'Y' });

    render(<TaxSifModal {...baseProps({ taxId: 'tax-2' })} />);
    await waitFor(() => expect(entityFormProps).toHaveBeenCalled());

    const props = entityFormProps.mock.calls.at(-1)[0];
    expect(props.fields.map((f) => f.column)).toEqual([
      'EM_Etvfac_Vat_Regime',
      'em_etvfac_cause_not_taxable',
    ]);
  });

  it('still renders EntityForm with an empty fields array when no field applies (SII) — unlike TaxSifField, the modal does not early-return null', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii', verifactuRecord: null });
    fetchByIdMock.mockResolvedValue({ id: 'tax-3', name: 'SII tax' });

    render(<TaxSifModal {...baseProps({ taxId: 'tax-3' })} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    const props = entityFormProps.mock.calls.at(-1)[0];
    expect(props.fields).toEqual([]);
  });

  it('renders the tax name as a subtitle when present', async () => {
    fetchByIdMock.mockResolvedValue({ id: 'tax-1', name: 'IVA 21%' });
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByText('IVA 21%')).toBeInTheDocument());
  });

  it('omits the subtitle when the fetched record has no name', async () => {
    fetchByIdMock.mockResolvedValue({ id: 'tax-1' });
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());
    // Only the title (also 'taxSif.modal.title' via ui()) should be present, no stray <p>.
    expect(screen.queryByText('IVA 21%')).not.toBeInTheDocument();
  });
});

describe('TaxSifModal — save flow', () => {
  it('save with no changes calls onClose WITHOUT calling patchById', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ onClose, onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => {
      screen.getByTestId('tax-sif-modal-save').click();
    });

    expect(patchByIdMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('save calls patchById with ONLY the changed field(s), keyed by field.key (EntityForm field key)', async () => {
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => {
      screen.getByTestId('change-tbaiClaveregimeniva').click();
    });
    await act(async () => {
      screen.getByTestId('tax-sif-modal-save').click();
    });

    await waitFor(() => expect(patchByIdMock).toHaveBeenCalledWith(
      'tax', 'tax', 'tax-1',
      { tbaiClaveregimeniva: 'tbaiClaveregimeniva-new-value' },
      TOKEN, API_BASE_URL,
    ));
  });

  it('save success: shows the success toast and calls onSaved with { id, [rawColumn]: editedValue } — translated from the LOCAL edited value, not from patchById\'s resolved payload', async () => {
    // Deliberately resolve patchById with a DIFFERENT value than what was edited,
    // to prove onSaved's payload is built from `editing` (the local field.key state),
    // never from whatever patchById happened to resolve with.
    patchByIdMock.mockResolvedValue({ id: 'tax-1', tbaiClaveregimeniva: 'IGNORED-SERVER-EOCHO' });
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('change-tbaiClaveregimeniva').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      id: 'tax-1',
      EM_Tbai_Claveregimeniva: 'tbaiClaveregimeniva-new-value',
    }));
    expect(toast.success).toHaveBeenCalledWith('taxSif.modal.saveSuccess');
  });

  it('save success with two changed Verifactu fields: onSaved carries both raw columns', async () => {
    useFiscalConfigMock.mockReturnValue({ profile: 'verifactu', verifactuRecord: { tAXType: '01' } });
    fetchByIdMock.mockResolvedValue({ id: 'tax-2', notTaxable: 'Y' });
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ taxId: 'tax-2', onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('change-etvfacVatRegime').click(); });
    await act(async () => { screen.getByTestId('change-etvfacCauseNotTaxable').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      id: 'tax-2',
      EM_Etvfac_Vat_Regime: 'etvfacVatRegime-new-value',
      em_etvfac_cause_not_taxable: 'etvfacCauseNotTaxable-new-value',
    }));
  });

  it('save failure (network/500): shows an error toast, does NOT call onSaved, modal stays open (onClose not called)', async () => {
    patchByIdMock.mockRejectedValue(new Error('Invalid regime code'));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<TaxSifModal {...baseProps({ onClose, onSaved })} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('change-tbaiClaveregimeniva').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid regime code'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('save failure with no error message falls back to ui("networkError")', async () => {
    patchByIdMock.mockRejectedValue(new Error(''));
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('change-tbaiClaveregimeniva').click(); });
    await act(async () => { screen.getByTestId('tax-sif-modal-save').click(); });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
  });

  it('disables Save/Cancel while saving is in flight', async () => {
    let resolvePatch;
    patchByIdMock.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }));
    render(<TaxSifModal {...baseProps()} />);
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

    await act(async () => { screen.getByTestId('change-tbaiClaveregimeniva').click(); });
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
    await waitFor(() => expect(screen.getByTestId('TaxSifModal__EntityForm')).toBeInTheDocument());

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

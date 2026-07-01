// Mocks must be declared before any imports that pull in the mocked modules.
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-001' } }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(),
}));

vi.mock('@/windows/custom/fiscal-config/fiscalConfig.utils.js', () => ({
  normalizeDateInputValue: (v) => v ?? '',
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} data-testid={`input-${props.id}`} />,
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ id, value, onChange, onBlur, disabled }) => (
    <input
      data-testid={`date-${id}`}
      id={id}
      type="date"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange && onChange(e.target.value)}
      onBlur={(e) => onBlur && onBlur(e)}
    />
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }) => (
    <div data-testid="select-wrapper" data-value={value} data-disabled={disabled}>
      {children}
    </div>
  ),
  SelectTrigger: ({ id, children }) => <div id={id}>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ value, children }) => <div data-value={value}>{children}</div>,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import SifTab from '../SifTab.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProps(overrides = {}) {
  return {
    recordId: 'inv-001',
    data: { documentStatus: 'DR' },
    token: 'tok',
    apiBaseUrl: '/sws/neo/sales-invoice',
    ...overrides,
  };
}

function mockFiscalConfig(profile) {
  useFiscalConfig.mockReturnValue({ profile });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SifTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── empty state ─────────────────────────────────────────────────────────────

  describe('empty state — no fiscal targets', () => {
    it('renders empty-state div when profile is unconfigured', () => {
      mockFiscalConfig('unconfigured');
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.sectionTitle')).toBeInTheDocument();
    });

    it('renders empty-state div when profile is null', () => {
      mockFiscalConfig(null);
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.sectionTitle')).toBeInTheDocument();
    });

    it('does not render the rail or panel when no target is active', () => {
      mockFiscalConfig('unconfigured');
      render(<SifTab {...makeProps()} />);
      expect(screen.queryByText('sifDataTabs.tab.sii')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.tab.tbai')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.tab.verifactu')).not.toBeInTheDocument();
    });
  });

  // ── SII panel ───────────────────────────────────────────────────────────────

  describe('SII panel (sii profile, sales-invoice)', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('renders the SII rail button', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.tab.sii')).toBeInTheDocument();
    });

    it('does not render TBAI or Verifactu rail buttons', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.queryByText('sifDataTabs.tab.tbai')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.tab.verifactu')).not.toBeInTheDocument();
    });

    it('renders the SII panel title', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.panel.sii.title')).toBeInTheDocument();
    });

    it('renders the date field enabled for draft invoices', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR' } })} />);
      const dateInput = screen.getByTestId('date-sif-etsgDateOperation');
      expect(dateInput).not.toBeDisabled();
    });

    it('renders the date field disabled for completed invoices', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO' } })} />);
      const dateInput = screen.getByTestId('date-sif-etsgDateOperation');
      expect(dateInput).toBeDisabled();
    });

    it('renders the SII description input', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiDescripcionSii: 'Test SII desc' } })} />);
      const input = screen.getByTestId('input-sif-siiDesc');
      expect(input).toBeInTheDocument();
    });

    it('renders CLAVE_TIPO sales options (not purchase options)', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('F1 — sifDataTabs.option.invoice')).toBeInTheDocument();
      expect(screen.queryByText('F6 — sifDataTabs.option.accountingDocument')).not.toBeInTheDocument();
    });

    it('shows the authorization checkbox', () => {
      render(<SifTab {...makeProps()} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('checkbox reflects unchecked state initially', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIsauthorization: false } })} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-checked', 'false');
    });

    it('checkbox reflects checked state when field is true', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIsauthorization: true } })} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    it('clicking checkbox fires a PATCH request', async () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIsauthorization: false } })} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sales-invoice/header/inv-001'),
        expect.objectContaining({ method: 'PATCH' }),
      ));
    });

    it('SII fields disabled when invoice has been sent to SII', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIssent: 'Y' } })} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });

    it('SII fields enabled when invoice has NOT been sent to SII', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIssent: false } })} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeDisabled();
    });

    it('shows SII status badge for the record estado', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO', aeatsiiEstado: 'CO' } })} />);
      expect(screen.getByText('sifDataTabs.status.sii.correct')).toBeInTheDocument();
    });

    it('shows default pending badge when estado is missing', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO' } })} />);
      expect(screen.getByText('sifDataTabs.status.sii.pending')).toBeInTheDocument();
    });
  });

  // ── purchase-invoice SII panel ──────────────────────────────────────────────

  describe('SII panel (sii profile, purchase-invoice)', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('renders purchase-specific CLAVE_TIPO_FC options', () => {
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/purchase-invoice' })} />);
      expect(screen.getByText('F6 — sifDataTabs.option.accountingDocument')).toBeInTheDocument();
      expect(screen.queryByText('F2 — sifDataTabs.option.simplifiedInvoice')).not.toBeInTheDocument();
    });

    it('derives specName purchase-invoice from apiBaseUrl last segment', () => {
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/purchase-invoice' })} />);
      expect(screen.getByText('sifDataTabs.tab.sii')).toBeInTheDocument();
    });
  });

  // ── TBAI panel ──────────────────────────────────────────────────────────────

  describe('TBAI panel (tbai profile, sales-invoice)', () => {
    beforeEach(() => {
      mockFiscalConfig('tbai');
    });

    it('renders TBAI rail button', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.tab.tbai')).toBeInTheDocument();
    });

    it('does not render SII or Verifactu rail buttons', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.queryByText('sifDataTabs.tab.sii')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.tab.verifactu')).not.toBeInTheDocument();
    });

    it('renders the TBAI panel title by default', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.panel.tbai.title')).toBeInTheDocument();
    });

    it('renders 3 read-only TBAI fields', () => {
      render(<SifTab {...makeProps({ data: { tbaiSequence: 'SEQ1', tbaiInvoicenum: 'SER1', tbaiInvoiceseq: 'INV1' } })} />);
      expect(screen.getByTestId('input-sif-tbaiSeq')).toBeInTheDocument();
      expect(screen.getByTestId('input-sif-tbaiSerie')).toBeInTheDocument();
      expect(screen.getByTestId('input-sif-tbaiInvSeq')).toBeInTheDocument();
    });

    it('renders TbaiBadge as not-sent when tbaiIssent is falsy', () => {
      render(<SifTab {...makeProps({ data: { tbaiIssent: false } })} />);
      expect(screen.getByText('sifDataTabs.status.tbai.notSent')).toBeInTheDocument();
    });

    it('renders TbaiBadge as sent when tbaiIssent is Y', () => {
      render(<SifTab {...makeProps({ data: { tbaiIssent: 'Y' } })} />);
      expect(screen.getByText('sifDataTabs.status.tbai.sent')).toBeInTheDocument();
    });

    it('does not show TBAI for purchase-invoice (tbai profile)', () => {
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/purchase-invoice' })} />);
      expect(screen.queryByText('sifDataTabs.tab.tbai')).not.toBeInTheDocument();
      // Falls through to empty state because no target is active for purchase-invoice + tbai
      expect(screen.getByText('sifDataTabs.sectionTitle')).toBeInTheDocument();
    });
  });

  // ── Verifactu panel ─────────────────────────────────────────────────────────

  describe('Verifactu panel (verifactu profile, sales-invoice)', () => {
    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it('renders Verifactu rail button', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.tab.verifactu')).toBeInTheDocument();
    });

    it('renders the Verifactu panel title', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.panel.verifactu.title')).toBeInTheDocument();
    });

    it('renders 5 read-only Verifactu fields', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByTestId('input-sif-vfDate')).toBeInTheDocument();
      expect(screen.getByTestId('input-sif-vfCsv')).toBeInTheDocument();
      expect(screen.getByTestId('input-sif-vfHash')).toBeInTheDocument();
      expect(screen.getByTestId('input-sif-vfQr')).toBeInTheDocument();
      expect(screen.getByTestId('input-sif-vfIssue')).toBeInTheDocument();
    });

    it('shows VerifactuBadge as not-sent when etvfacSentToVerifac is falsy', () => {
      render(<SifTab {...makeProps({ data: { etvfacSentToVerifac: false } })} />);
      expect(screen.getByText('sifDataTabs.status.verifactu.notSent')).toBeInTheDocument();
    });

    it('shows VerifactuBadge accepted when status is AC', () => {
      render(<SifTab {...makeProps({ data: { etvfacInvoiceStatus: 'AC' } })} />);
      expect(screen.getByText('sifDataTabs.status.verifactu.accepted')).toBeInTheDocument();
    });

    it('shows VerifactuBadge accepted when sent is Y and no status code', () => {
      render(<SifTab {...makeProps({ data: { etvfacSentToVerifac: 'Y' } })} />);
      expect(screen.getByText('sifDataTabs.status.verifactu.accepted')).toBeInTheDocument();
    });

    it('does not show Verifactu for purchase-invoice', () => {
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/purchase-invoice' })} />);
      expect(screen.getByText('sifDataTabs.sectionTitle')).toBeInTheDocument();
    });
  });

  // ── sii+tbai dual rail ──────────────────────────────────────────────────────

  describe('sii+tbai profile (sales-invoice)', () => {
    beforeEach(() => {
      mockFiscalConfig('sii+tbai');
    });

    it('renders both SII and TBAI rail buttons', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.tab.sii')).toBeInTheDocument();
      expect(screen.getByText('sifDataTabs.tab.tbai')).toBeInTheDocument();
    });

    it('defaults to the SII panel', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.panel.sii.title')).toBeInTheDocument();
    });

    it('switches to TBAI panel on rail click', async () => {
      render(<SifTab {...makeProps()} />);
      fireEvent.click(screen.getByText('sifDataTabs.tab.tbai'));
      await waitFor(() =>
        expect(screen.getByText('sifDataTabs.panel.tbai.title')).toBeInTheDocument(),
      );
    });

    it('switches back to SII panel on SII rail click', async () => {
      render(<SifTab {...makeProps()} />);
      fireEvent.click(screen.getByText('sifDataTabs.tab.tbai'));
      fireEvent.click(screen.getByText('sifDataTabs.tab.sii'));
      await waitFor(() =>
        expect(screen.getByText('sifDataTabs.panel.sii.title')).toBeInTheDocument(),
      );
    });

    it('does not render Verifactu rail button', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.queryByText('sifDataTabs.tab.verifactu')).not.toBeInTheDocument();
    });

    it('shows only SII rail for purchase-invoice (no TBAI)', () => {
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/purchase-invoice' })} />);
      expect(screen.getByText('sifDataTabs.tab.sii')).toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.tab.tbai')).not.toBeInTheDocument();
    });
  });

  // ── PATCH on blur ───────────────────────────────────────────────────────────

  describe('PATCH on blur', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('does NOT patch when blurred value equals original data value', async () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiDescripcionSii: 'unchanged' } })} />);
      const input = screen.getByTestId('input-sif-siiDesc');
      // Value is same as in data — no PATCH expected
      fireEvent.blur(input, { target: { value: 'unchanged' } });
      await new Promise(r => setTimeout(r, 50));
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('fires PATCH when blurred value differs from original data value', async () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiDescripcionSii: 'old' } })} />);
      const input = screen.getByTestId('input-sif-siiDesc');
      fireEvent.change(input, { target: { value: 'new value' } });
      fireEvent.blur(input, { target: { value: 'new value' } });
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        '/sws/neo/sales-invoice/header/inv-001',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('aeatsiiDescripcionSii'),
        }),
      ));
    });

    it('calls toast.error and resets form value on PATCH failure', async () => {
      const { toast } = await import('sonner');
      globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'Server error' }) });

      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiDescripcionSii: 'old' } })} />);
      const input = screen.getByTestId('input-sif-siiDesc');
      fireEvent.change(input, { target: { value: 'new value' } });
      fireEvent.blur(input, { target: { value: 'new value' } });

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
    });
  });

  // ── specName derivation ─────────────────────────────────────────────────────

  describe('specName derivation from apiBaseUrl', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('uses last URL segment as specName for PATCH URL', async () => {
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/sales-invoice', data: { documentStatus: 'DR', aeatsiiIsauthorization: false } })} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('sales-invoice/header/inv-001'),
        expect.anything(),
      ));
    });

    it('defaults specName to sales-invoice when apiBaseUrl is empty', () => {
      mockFiscalConfig('sii');
      // Should not throw — falls back gracefully
      expect(() => render(<SifTab {...makeProps({ apiBaseUrl: '' })} />)).not.toThrow();
    });
  });

  // ── edge cases ──────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders without crashing when data is null', () => {
      mockFiscalConfig('sii');
      expect(() => render(<SifTab {...makeProps({ data: null })} />)).not.toThrow();
    });

    it('renders without crashing when data is undefined', () => {
      mockFiscalConfig('sii');
      expect(() => render(<SifTab {...makeProps({ data: undefined })} />)).not.toThrow();
    });

    it('renders empty-state when recordId is missing', () => {
      mockFiscalConfig('unconfigured');
      render(<SifTab {...makeProps({ recordId: undefined })} />);
      expect(screen.getByText('sifDataTabs.sectionTitle')).toBeInTheDocument();
    });

    it('ReadOnlyValue shows em-dash placeholder when value is null/undefined', () => {
      mockFiscalConfig('verifactu');
      render(<SifTab {...makeProps({ data: { etvfacDateIssue: undefined } })} />);
      const dateInput = screen.getByTestId('input-sif-vfDate');
      expect(dateInput).toHaveValue('—');
    });
  });
});

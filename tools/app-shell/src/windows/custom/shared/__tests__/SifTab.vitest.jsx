// Mocks must be declared before any imports that pull in the mocked modules.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-001' } }),
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
  // Mirrors the real DateField contract: onChange is the only wire-up SifTab
  // relies on now (ETP-4463) — onBlur is left unused by SifTab itself, but the
  // mock still exposes it so any accidental future dependency on it would be
  // observable in a test rather than silently no-op-ing.
  DateField: ({ id, value, onChange, onBlur, disabled }) => (
    <input
      data-testid={`date-${id}`}
      id={id}
      type="date"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange && onChange(e.target.value)}
      onBlur={(e) => onBlur && onBlur(e.target.value)}
    />
  ),
}));

vi.mock('@/components/ui/select', () => {
  // SelectItem is the marker type used below to walk the (unrendered) children
  // tree and collect the set of option values for the current Select instance,
  // so tests can simulate picking an option without a real dropdown/portal.
  function SelectItem({ value, children }) {
    return <div data-value={value}>{children}</div>;
  }

  function collectSelectItemValues(node, acc) {
    if (
      node === null ||
      node === undefined ||
      typeof node === 'string' ||
      typeof node === 'number' ||
      typeof node === 'boolean'
    ) {
      return acc;
    }
    if (Array.isArray(node)) {
      node.forEach((n) => collectSelectItemValues(n, acc));
      return acc;
    }
    if (node.type === SelectItem) {
      acc.push(node.props.value);
      return acc;
    }
    if (node.props && node.props.children !== undefined) {
      collectSelectItemValues(node.props.children, acc);
    }
    return acc;
  }

  function Select({ value, onValueChange, disabled, children }) {
    const optionValues = collectSelectItemValues(children, []);
    return (
      <div data-testid="select-wrapper" data-value={value} data-disabled={disabled}>
        {optionValues.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`mock-select-option-${v}`}
            aria-hidden="true"
            style={{ display: 'none' }}
            onClick={() => onValueChange && onValueChange(v)}
          />
        ))}
        {children}
      </div>
    );
  }

  return {
    Select,
    SelectTrigger: ({ id, children }) => <div id={id}>{children}</div>,
    SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem,
  };
});

import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

// ETP-4463: SifTab no longer persists fields itself — it writes into the shared
// `editing` state via the `onChange` prop DetailView passes down (`hook.handleChange`),
// and `data` is DetailView's derived, pending-edit-aware view of that same state.
// To exercise "live" visibility reactivity the way it actually happens in production
// (an edit updates `data` on the very next render, with no fetch/round-trip in
// between), this harness holds real React state and feeds committed edits straight
// back into `data` — mirroring DetailView's `editing`/`data` relationship instead of
// requiring a manual `rerender()` call per assertion (the pattern used by
// EntityForm.deferredInput.vitest.jsx for its own editing-state reactivity tests,
// which doesn't fit here because clicking a mock select option must be observable
// synchronously within the same test, with no intermediate render step to hook into).
function ControlledSifTab({ initialData, onChangeSpy, ...rest }) {
  const [data, setData] = useState(initialData);
  function handleChange(field, value) {
    setData((prev) => ({ ...(prev || {}), [field]: value }));
    onChangeSpy?.(field, value);
  }
  return <SifTab {...rest} data={data} onChange={handleChange} />;
}

function renderControlled(overrides = {}, onChangeSpy) {
  const { data: initialData, ...rest } = makeProps(overrides);
  return render(<ControlledSifTab initialData={initialData} onChangeSpy={onChangeSpy} {...rest} />);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SifTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // ETP-4463: clicking the checkbox no longer PATCHes — it writes into the
    // shared `editing` state via `onChange`. Persistence now happens only when
    // the header "Guardar"/"Confirmar" button is clicked (covered by useEntity.js
    // tests via buildPatchPayload, not duplicated here).
    it('calls onChange with the toggled value when the checkbox is clicked', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIsauthorization: false }, onChange })} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(onChange).toHaveBeenCalledWith('aeatsiiIsauthorization', true);
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

    // ETP-4390 regression: RF Generation Date / CSV / Hash / QR URL / Detalle
    // incidencia were removed from the Verifactu panel — they were never in the
    // API contract (always rendered as empty em-dash placeholders) and the user
    // explicitly doesn't need them. decisions.json now marks them "discarded" so
    // a pipeline regen can't silently resurrect them; this test guards the JSX
    // side against the same regression via a careless manual edit.
    it('does not render the 5 removed read-only Verifactu fields (ETP-4390)', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.queryByTestId('input-sif-vfDate')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-sif-vfCsv')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-sif-vfHash')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-sif-vfQr')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-sif-vfIssue')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.field.rfGenerationDate')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.field.csv')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.field.hash')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.field.qrUrl')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.field.issueDetail')).not.toBeInTheDocument();
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
      await screen.findByText('sifDataTabs.panel.tbai.title');
    });

    it('switches back to SII panel on SII rail click', async () => {
      render(<SifTab {...makeProps()} />);
      fireEvent.click(screen.getByText('sifDataTabs.tab.tbai'));
      fireEvent.click(screen.getByText('sifDataTabs.tab.sii'));
      await screen.findByText('sifDataTabs.panel.sii.title');
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

  // ── onChange wiring for text/select inputs (no per-field PATCH) ────────────
  // ETP-4463: replaces the old "PATCH on blur" suite. SifTab fields now call
  // `onChange(field, value)` straight from their native onChange handler —
  // there is no onBlur-triggered save and no unchanged-value dedupe inside
  // SifTab itself anymore (the header save is what eventually persists it).

  describe('onChange wiring for text/select inputs (no per-field PATCH)', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('blur alone (without a prior change) does not call onChange', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiDescripcionSii: 'unchanged' }, onChange })} />);
      const input = screen.getByTestId('input-sif-siiDesc');
      fireEvent.blur(input, { target: { value: 'unchanged' } });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('calls onChange when the SII description input value changes', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiDescripcionSii: 'old' }, onChange })} />);
      const input = screen.getByTestId('input-sif-siiDesc');
      fireEvent.change(input, { target: { value: 'new value' } });
      expect(onChange).toHaveBeenCalledWith('aeatsiiDescripcionSii', 'new value');
    });
  });

  // ── specName derivation ─────────────────────────────────────────────────────

  describe('specName derivation from apiBaseUrl', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('checkbox click calls onChange with the field key regardless of apiBaseUrl-derived specName', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/sales-invoice', data: { documentStatus: 'DR', aeatsiiIsauthorization: false }, onChange })} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(onChange).toHaveBeenCalledWith('aeatsiiIsauthorization', true);
    });

    it('defaults specName to sales-invoice when apiBaseUrl is empty', () => {
      mockFiscalConfig('sii');
      // Should not throw — falls back gracefully
      expect(() => render(<SifTab {...makeProps({ apiBaseUrl: '' })} />)).not.toThrow();
    });
  });

  // ── OperationDateField shared component (ETP-4390 bug fix regression) ─────

  describe('OperationDateField shared component', () => {
    it('renders and is editable in the SII tab', () => {
      mockFiscalConfig('sii');
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR' } })} />);
      const dateInput = screen.getByTestId('date-sif-etsgDateOperation');
      expect(dateInput).toBeInTheDocument();
      expect(dateInput).not.toBeDisabled();
    });

    it('renders and is editable in the Verifactu tab (regression: previously read-only-by-omission)', () => {
      mockFiscalConfig('verifactu');
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR' } })} />);
      const dateInput = screen.getByTestId('date-sif-etsgDateOperation');
      expect(dateInput).toBeInTheDocument();
      expect(dateInput).not.toBeDisabled();
    });

    it('is disabled in the Verifactu tab for completed invoices', () => {
      mockFiscalConfig('verifactu');
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO' } })} />);
      const dateInput = screen.getByTestId('date-sif-etsgDateOperation');
      expect(dateInput).toBeDisabled();
    });

    // ETP-4463: DateField's `onChange` alone is what's wired now — there is no
    // separate onBlur commit to depend on.
    it('calls onChange for etsgDateOperation edited from the Verifactu tab, with no onBlur involved', () => {
      mockFiscalConfig('verifactu');
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etsgDateOperation: '2026-01-01', etvfacInvType: 'F1' }, onChange })} />);
      const dateInput = screen.getByTestId('date-sif-etsgDateOperation');
      fireEvent.change(dateInput, { target: { value: '2026-02-02' } });
      expect(onChange).toHaveBeenCalledWith('etsgDateOperation', '2026-02-02');
    });
  });

  // ── Verifactu-only fields: etvfacInvType, etvfacVerifacDesc ────────────────

  describe('Verifactu-only fields (etvfacInvType, etvfacVerifacDesc)', () => {
    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it('renders the invoice type select and the operation description input', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.field.vfInvoiceType')).toBeInTheDocument();
      expect(screen.getByTestId('input-sif-vfDesc')).toBeInTheDocument();
    });

    it('renders all 8 VERIFACTU_INV_TYPE_OPTIONS', () => {
      render(<SifTab {...makeProps()} />);
      ['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5'].forEach((v) => {
        expect(screen.getByText(`${v} — sifDataTabs.option.vf${v}`)).toBeInTheDocument();
      });
    });

    it('calls onChange with the new value when etvfacInvType is changed via the select', () => {
      // etvfacInvType is pre-set here so the ETP-4390 auto-default effect (which
      // calls onChange('etvfacInvType', 'F1') once for drafts with no existing
      // value) doesn't pollute this assertion — that effect has its own
      // dedicated test suite below.
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F1' }, onChange })} />);
      fireEvent.click(screen.getByTestId('mock-select-option-F2'));
      expect(onChange).toHaveBeenCalledWith('etvfacInvType', 'F2');
    });

    it('blur alone does not call onChange for etvfacVerifacDesc (no blur-based save exists)', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F2', etvfacVerifacDesc: 'same' }, onChange })} />);
      const input = screen.getByTestId('input-sif-vfDesc');
      fireEvent.blur(input, { target: { value: 'same' } });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('calls onChange for etvfacVerifacDesc when the input value changes', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F2', etvfacVerifacDesc: 'old' }, onChange })} />);
      const input = screen.getByTestId('input-sif-vfDesc');
      fireEvent.change(input, { target: { value: 'new desc' } });
      expect(onChange).toHaveBeenCalledWith('etvfacVerifacDesc', 'new desc');
    });

    it('etvfacInvType select is disabled for completed invoices (dateReadOnly gate)', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO' } })} />);
      const wrapper = document.querySelector('#sif-vfInvType').closest('[data-testid="select-wrapper"]');
      expect(wrapper).toHaveAttribute('data-disabled', 'true');
    });

    it('etvfacInvType select is enabled for draft invoices', () => {
      // etvfacInvType is pre-set here so the ETP-4390 auto-default effect doesn't
      // fire its own onChange call on mount — irrelevant to this assertion, which
      // is about the plain dateReadOnly-based enable/disable gate.
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F2' } })} />);
      const wrapper = document.querySelector('#sif-vfInvType').closest('[data-testid="select-wrapper"]');
      expect(wrapper).toHaveAttribute('data-disabled', 'false');
    });

    it('etvfacVerifacDesc input is disabled for completed invoices', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO' } })} />);
      expect(screen.getByTestId('input-sif-vfDesc')).toBeDisabled();
    });

    it('etvfacVerifacDesc input is enabled for draft invoices', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR' } })} />);
      expect(screen.getByTestId('input-sif-vfDesc')).not.toBeDisabled();
    });
  });

  // ── Visibility matrix for the 3 conditional Verifactu fields ───────────────
  // Mirrors Classic AD displayLogic verbatim (see comments above the
  // shouldShow* helpers in SifTab.jsx) — this is the highest-value test since
  // it's pure conditional logic easy to get subtly wrong.

  describe('Verifactu conditional fields visibility matrix', () => {
    const SIMPLIFIED_LABEL = 'sifDataTabs.field.simplifiedInvoiceArt7273';
    const NO_RECIPIENT_LABEL = 'sifDataTabs.field.noRecipientIdArt61d';
    const REVERSE_LABEL = 'sifDataTabs.field.correctiveInvoiceType';

    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it.each([
      // invType,   simplified(art7273), noRecipient(art61d), reverse(correctiveType)
      [undefined, true, false, false],
      ['F1', true, false, false],
      ['F2', false, true, false],
      ['F3', true, false, false],
      ['R1', true, false, true],
      ['R2', true, false, true],
      ['R3', true, false, true],
      ['R4', true, false, true],
      ['R5', false, true, true],
    ])('invType=%s → simplified=%s noRecipient=%s reverse=%s', (invType, simplified, noRecipient, reverse) => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: invType } })} />);
      expect(Boolean(screen.queryByText(SIMPLIFIED_LABEL))).toBe(simplified);
      expect(Boolean(screen.queryByText(NO_RECIPIENT_LABEL))).toBe(noRecipient);
      expect(Boolean(screen.queryByText(REVERSE_LABEL))).toBe(reverse);
    });

    it('simplified and noRecipient are mutually exclusive for every invType', () => {
      ['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5', undefined].forEach((invType) => {
        const { unmount } = render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: invType } })} />);
        const simplifiedShown = Boolean(screen.queryByText(SIMPLIFIED_LABEL));
        const noRecipientShown = Boolean(screen.queryByText(NO_RECIPIENT_LABEL));
        expect(simplifiedShown).toBe(!noRecipientShown);
        unmount();
      });
    });
  });

  // ── Live reactivity: data-driven visibility through the shared editing state ──
  // ETP-4463: `data` is DetailView's pending-edit-aware projection of the shared
  // `editing` state (`hook.editing || currentItem`). ControlledSifTab (defined at
  // the top of this file) reproduces that relationship with real React state, so
  // these assertions exercise the exact same "onChange now, re-render with updated
  // data next" cycle production code goes through — not a mocked stand-in for it.

  describe('Live reactivity of vfInvType-dependent fields', () => {
    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it('shows the corrective invoice type field immediately after selecting R2', () => {
      renderControlled({ data: { documentStatus: 'DR', etvfacInvType: 'F1' } });
      expect(screen.queryByText('sifDataTabs.field.correctiveInvoiceType')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mock-select-option-R2'));

      expect(screen.getByText('sifDataTabs.field.correctiveInvoiceType')).toBeInTheDocument();
    });

    it('hides the corrective invoice type field again after switching to F1', () => {
      renderControlled({ data: { documentStatus: 'DR', etvfacInvType: 'R2' } });
      expect(screen.getByText('sifDataTabs.field.correctiveInvoiceType')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mock-select-option-F1'));

      expect(screen.queryByText('sifDataTabs.field.correctiveInvoiceType')).not.toBeInTheDocument();
    });

    it('flips simplified/noRecipient live when switching from F1 to R5', () => {
      renderControlled({ data: { documentStatus: 'DR', etvfacInvType: 'F1' } });
      expect(screen.getByText('sifDataTabs.field.simplifiedInvoiceArt7273')).toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.field.noRecipientIdArt61d')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mock-select-option-R5'));

      expect(screen.queryByText('sifDataTabs.field.simplifiedInvoiceArt7273')).not.toBeInTheDocument();
      expect(screen.getByText('sifDataTabs.field.noRecipientIdArt61d')).toBeInTheDocument();
    });

    it('calls onChange with etvfacReverseinvtype when changed via its select', () => {
      const onChange = vi.fn();
      renderControlled({ data: { documentStatus: 'DR', etvfacInvType: 'R2' } }, onChange);
      fireEvent.click(screen.getByTestId('mock-select-option-S'));
      expect(onChange).toHaveBeenCalledWith('etvfacReverseinvtype', 'S');
    });
  });

  // ── onChange wiring for every editable SIF field (ETP-4463) ────────────────
  // One assertion per field — confirms each control's native event handler
  // forwards straight to the `onChange(field, value)` prop, with no PATCH and
  // no intermediate local form state involved.

  describe('onChange wiring for all editable SIF fields (ETP-4463)', () => {
    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it('etsgDateOperation calls onChange on date change', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F1' }, onChange })} />);
      fireEvent.change(screen.getByTestId('date-sif-etsgDateOperation'), { target: { value: '2026-03-03' } });
      expect(onChange).toHaveBeenCalledWith('etsgDateOperation', '2026-03-03');
    });

    it('etvfacInvType calls onChange when a select option is picked', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F1' }, onChange })} />);
      fireEvent.click(screen.getByTestId('mock-select-option-F3'));
      expect(onChange).toHaveBeenCalledWith('etvfacInvType', 'F3');
    });

    it('etvfacVerifacDesc calls onChange when the input value changes', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F1' }, onChange })} />);
      fireEvent.change(screen.getByTestId('input-sif-vfDesc'), { target: { value: 'desc' } });
      expect(onChange).toHaveBeenCalledWith('etvfacVerifacDesc', 'desc');
    });

    it('etvfacSimpinvart7273 calls onChange when the checkbox is toggled', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F1' }, onChange })} />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith('etvfacSimpinvart7273', true);
    });

    it('etvfacInvNoIDArt61d calls onChange when the checkbox is toggled', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'R5' }, onChange })} />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith('etvfacInvNoIDArt61d', true);
    });

    it('etvfacReverseinvtype calls onChange when a select option is picked', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'R2' }, onChange })} />);
      fireEvent.click(screen.getByTestId('mock-select-option-I'));
      expect(onChange).toHaveBeenCalledWith('etvfacReverseinvtype', 'I');
    });
  });

  // ── etvfacInvType auto-default effect (ETP-4390) ────────────────────────────

  describe('etvfacInvType auto-default effect (ETP-4390)', () => {
    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it('calls onChange with F1 exactly once for a draft record with no existing value, and does not re-fire on re-render', () => {
      const onChange = vi.fn();
      const { rerender } = render(<SifTab {...makeProps({ data: { documentStatus: 'DR' }, onChange })} />);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('etvfacInvType', 'F1');

      // Guard (`vfInvTypeDefaultedRef`) must not re-fire for the same record on
      // a re-render, even though data.etvfacInvType is still empty (onChange is
      // a no-op mock here, so it never actually gets written into `data`).
      rerender(<SifTab {...makeProps({ data: { documentStatus: 'DR' }, onChange })} />);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('does not default when etvfacInvType already has a value', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F2' }, onChange })} />);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not default for completed (non-draft) invoices', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO' }, onChange })} />);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ── dateReadOnly gates the 3 conditional Verifactu fields ──────────────────

  describe('dateReadOnly gates the conditional Verifactu fields (draft vs non-draft)', () => {
    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it('etvfacSimpinvart7273 checkbox is enabled for draft', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'F1' } })} />);
      expect(screen.getByRole('checkbox')).not.toBeDisabled();
    });

    it('etvfacSimpinvart7273 checkbox is disabled for completed', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO', etvfacInvType: 'F1' } })} />);
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('etvfacInvNoIDArt61d checkbox is disabled for completed (R5 branch)', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO', etvfacInvType: 'R5' } })} />);
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('etvfacInvNoIDArt61d checkbox is enabled for draft (R5 branch)', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'R5' } })} />);
      expect(screen.getByRole('checkbox')).not.toBeDisabled();
    });

    it('etvfacReverseinvtype select is disabled for completed (R2 branch)', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO', etvfacInvType: 'R2' } })} />);
      const wrapper = document.querySelector('#sif-vfReverseType').closest('[data-testid="select-wrapper"]');
      expect(wrapper).toHaveAttribute('data-disabled', 'true');
    });

    it('etvfacReverseinvtype select is enabled for draft (R2 branch)', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: 'R2' } })} />);
      const wrapper = document.querySelector('#sif-vfReverseType').closest('[data-testid="select-wrapper"]');
      expect(wrapper).toHaveAttribute('data-disabled', 'false');
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

    // ETP-4390: the field this test originally exercised (sif-vfDate /
    // etvfacDateIssue) was removed from the Verifactu panel. The em-dash
    // placeholder behavior it targets lives in the shared ReadOnlyValue helper
    // and is still exercised in production by the SII panel's read-only fields
    // (e.g. sif-siiYear), so repoint the test there instead of dropping the
    // coverage.
    it('ReadOnlyValue shows em-dash placeholder when value is null/undefined', () => {
      mockFiscalConfig('sii');
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiEjercicio: undefined } })} />);
      const yearInput = screen.getByTestId('input-sif-siiYear');
      expect(yearInput).toHaveValue('—');
    });
  });
});

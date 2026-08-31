// Mocks must be declared before any imports that pull in the mocked modules.

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

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

// ETP-4751 (Block B): the exemption cause is now an editable FK selector when the
// invoice hasn't been sent to SII. Stand-in for the real SelectorInput that exposes
// the props SifTab wires (entityName / selectorUrl / value / displayValue) as data
// attributes, plus a trigger button that fires the two-arg onChange(id, label) the
// FK pair relies on — so a test can assert the two resulting onChange calls.
// ETP-4888: the SII/Verifactu/TBAI panels each embed a reusable "Adjuntos" section that
// points the generic attachments endpoints at a fiscal sub-record id. SifTab's own tests
// only care about the WIRING (which tableName/recordId each panel passes down) — the
// section's internal list/download behavior is covered by SifAttachmentsSection's own
// test suite — so it's stubbed out here to a simple marker exposing its props as data
// attributes.
vi.mock('@/windows/custom/shared/SifAttachmentsSection.jsx', () => ({
  default: ({ tableName, recordId }) => (
    <div
      data-testid="mock-sif-attachments-section"
      data-table-name={tableName}
      data-record-id={recordId ?? ''}
    />
  ),
}));

vi.mock('@/components/contract-ui/SelectorInput.jsx', () => ({
  SelectorInput: ({ entityName, selectorUrl, value, displayValue, onChange }) => (
    <div
      data-testid="mock-selector-input"
      data-entity-name={entityName}
      data-selector-url={selectorUrl ?? ''}
      data-value={value ?? ''}
      data-display-value={displayValue ?? ''}
    >
      <button
        type="button"
        data-testid="mock-selector-pick"
        onClick={() => onChange && onChange('CAUSE_ID', 'Cause label')}
      />
    </div>
  ),
}));

import { useState } from 'react';
import { toast } from 'sonner';
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
      const checkbox = screen.getByRole('checkbox', { name: 'sifDataTabs.field.authorization' });
      expect(checkbox).toBeInTheDocument();
    });

    it('checkbox reflects unchecked state initially', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIsauthorization: false } })} />);
      const checkbox = screen.getByRole('checkbox', { name: 'sifDataTabs.field.authorization' });
      expect(checkbox).toHaveAttribute('aria-checked', 'false');
    });

    it('checkbox reflects checked state when field is true', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIsauthorization: true } })} />);
      const checkbox = screen.getByRole('checkbox', { name: 'sifDataTabs.field.authorization' });
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
    });

    // ETP-4463: clicking the checkbox no longer PATCHes — it writes into the
    // shared `editing` state via `onChange`. Persistence now happens only when
    // the header "Guardar"/"Confirmar" button is clicked (covered by useEntity.js
    // tests via buildPatchPayload, not duplicated here).
    it('calls onChange with the toggled value when the checkbox is clicked', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIsauthorization: false }, onChange })} />);
      const checkbox = screen.getByRole('checkbox', { name: 'sifDataTabs.field.authorization' });
      fireEvent.click(checkbox);
      expect(onChange).toHaveBeenCalledWith('aeatsiiIsauthorization', true);
    });

    it('SII fields disabled when invoice has been sent to SII', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIssent: 'Y' } })} />);
      const checkbox = screen.getByRole('checkbox', { name: 'sifDataTabs.field.authorization' });
      expect(checkbox).toBeDisabled();
    });

    it('SII fields enabled when invoice has NOT been sent to SII', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', aeatsiiIssent: false } })} />);
      const checkbox = screen.getByRole('checkbox', { name: 'sifDataTabs.field.authorization' });
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

    // ETP-4888: the SII panel's Adjuntos section is wired to the invoice's
    // aeatsii_facturas sub-record id, stamped on the header by the backend NeoHandler.
    it('renders the Adjuntos section wired to aeatsii_facturas / aeatsiiFacturaId', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'CO', aeatsiiFacturaId: 'sii-sub-001' } })} />);
      const section = screen.getByTestId('mock-sif-attachments-section');
      expect(section).toHaveAttribute('data-table-name', 'aeatsii_facturas');
      expect(section).toHaveAttribute('data-record-id', 'sii-sub-001');
    });

    it('renders the Adjuntos section with an empty recordId when aeatsiiFacturaId is absent', () => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR' } })} />);
      const section = screen.getByTestId('mock-sif-attachments-section');
      expect(section).toHaveAttribute('data-table-name', 'aeatsii_facturas');
      expect(section).toHaveAttribute('data-record-id', '');
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

  // ── SII exemption cause: editable FK selector + Classic gating (ETP-4751 Block B) ──
  // Previously the exemption cause always rendered read-only. It is now editable via a
  // SelectorInput (backed by /header/selectors/aeatsiiCauseExemption) ONLY when the
  // invoice actually carries an exempt tax (`hasExemptTaxes`, served by the backend
  // NeoHandler), is still a draft, and has not been sent to SII (`aeatsiiIssent`). With
  // no exempt taxes it renders READ-ONLY but stays visible (Classic parity). Both
  // sales-invoice and purchase-invoice share this component.

  describe('SII exemption cause — editable selector + gating (ETP-4751)', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('renders the SelectorInput when editable (draft, has exempt taxes, not sent to SII)', () => {
      render(<SifTab {...makeProps({
        data: {
          documentStatus: 'DR',
          hasExemptTaxes: true,
          aeatsiiCauseExemption: 'E1',
          'aeatsiiCauseExemption$_identifier': 'Exempt reason 1',
        },
      })} />);
      const selector = screen.getByTestId('mock-selector-input');
      expect(selector).toBeInTheDocument();
      expect(selector).toHaveAttribute('data-entity-name', 'header');
      expect(selector).toHaveAttribute(
        'data-selector-url',
        '/sws/neo/sales-invoice/header/selectors/aeatsiiCauseExemption',
      );
      expect(selector).toHaveAttribute('data-value', 'E1');
      expect(selector).toHaveAttribute('data-display-value', 'Exempt reason 1');
    });

    it('fires onChange twice (id + $_identifier) when an exemption cause is selected', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({
        data: { documentStatus: 'DR', hasExemptTaxes: true, aeatsiiCauseExemption: 'E1' },
        onChange,
      })} />);
      fireEvent.click(screen.getByTestId('mock-selector-pick'));
      expect(onChange).toHaveBeenCalledWith('aeatsiiCauseExemption', 'CAUSE_ID');
      expect(onChange).toHaveBeenCalledWith('aeatsiiCauseExemption$_identifier', 'Cause label');
    });

    it('renders read-only (no SelectorInput) when the invoice has NO exempt taxes, even as a draft', () => {
      render(<SifTab {...makeProps({
        data: {
          documentStatus: 'DR',
          hasExemptTaxes: false,
          'aeatsiiCauseExemption$_identifier': 'Exempt reason 1',
        },
      })} />);
      expect(screen.queryByTestId('mock-selector-input')).not.toBeInTheDocument();
      const readOnly = screen.getByTestId('input-sif-exemption');
      expect(readOnly).toBeInTheDocument();
      expect(readOnly).toBeDisabled();
    });

    it('renders READ-ONLY (no SelectorInput) when there are no exempt taxes, even as a draft with no cause', () => {
      // ETP-4751 Block F: read-only gating must apply whenever the invoice carries no exempt
      // tax — `hasExemptTaxes` is refreshed from the header GET after every line change, so an
      // invoice with only non-exempt lines keeps the field locked.
      render(<SifTab {...makeProps({
        data: { documentStatus: 'DR', hasExemptTaxes: false },
      })} />);
      expect(screen.queryByTestId('mock-selector-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('input-sif-exemption')).toBeDisabled();
    });

    it('no longer renders an inline missing-cause warning (moved to a line-save toast)', () => {
      render(<SifTab {...makeProps({
        data: { documentStatus: 'DR', hasExemptTaxes: true },
      })} />);
      expect(screen.queryByTestId('sif-exemption-missing-warning')).not.toBeInTheDocument();
    });

    it('renders the exemption cause read-only (no SelectorInput) once sent to SII', () => {
      render(<SifTab {...makeProps({
        data: {
          documentStatus: 'CO',
          hasExemptTaxes: true,
          aeatsiiIssent: 'Y',
          aeatsiiCauseExemption: 'E1',
          'aeatsiiCauseExemption$_identifier': 'Exempt reason 1',
        },
      })} />);
      expect(screen.queryByTestId('mock-selector-input')).not.toBeInTheDocument();
      const readOnly = screen.getByTestId('input-sif-exemption');
      expect(readOnly).toHaveValue('Exempt reason 1');
      expect(readOnly).toBeDisabled();
    });

    it('is editable for purchase-invoice too, with the purchase-invoice selector URL', () => {
      const onChange = vi.fn();
      render(<SifTab {...makeProps({
        apiBaseUrl: '/sws/neo/purchase-invoice',
        data: {
          documentStatus: 'DR',
          hasExemptTaxes: true,
          aeatsiiCauseExemption: 'E2',
          'aeatsiiCauseExemption$_identifier': 'Exempt reason 2',
        },
        onChange,
      })} />);
      const selector = screen.getByTestId('mock-selector-input');
      expect(selector).toHaveAttribute(
        'data-selector-url',
        '/sws/neo/purchase-invoice/header/selectors/aeatsiiCauseExemption',
      );
      expect(selector).toHaveAttribute('data-value', 'E2');
      fireEvent.click(screen.getByTestId('mock-selector-pick'));
      expect(onChange).toHaveBeenCalledWith('aeatsiiCauseExemption', 'CAUSE_ID');
      expect(onChange).toHaveBeenCalledWith('aeatsiiCauseExemption$_identifier', 'Cause label');
    });

    it('read-only exemption cause holds for purchase-invoice sent to SII', () => {
      render(<SifTab {...makeProps({
        apiBaseUrl: '/sws/neo/purchase-invoice',
        data: {
          documentStatus: 'CO',
          hasExemptTaxes: true,
          aeatsiiIssent: true,
          'aeatsiiCauseExemption$_identifier': 'Exempt reason 2',
        },
      })} />);
      expect(screen.queryByTestId('mock-selector-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('input-sif-exemption')).toHaveValue('Exempt reason 2');
    });
  });

  // ── SII exemption cause line-save toasts (ETP-4751 Block B/F) ────────────────
  // The invoice-line backend handler (InvoiceLineHandler) stamps at most ONE mutually
  // exclusive signal on the line-save response, mirrored onto the header `data` by
  // useEntity#applyExemptionCauseSignals:
  //   • exemptionCauseAutoFilled → info toast ("Causa de exención modificada").
  //     Dormant in production (no default cause is seeded) but fully implemented + tested.
  //   • exemptionCauseWarning → warning toast ("Debería indicarse una causa de exención"),
  //     the Block-F replacement for the removed inline missing-cause banner.

  describe('SII exemption cause line-save toasts (ETP-4751)', () => {
    beforeEach(() => {
      mockFiscalConfig('sii');
    });

    it('fires the info toast exactly once when the backend reports the cause was auto-filled', () => {
      render(<SifTab {...makeProps({
        data: { documentStatus: 'DR', hasExemptTaxes: true, exemptionCauseAutoFilled: true },
      })} />);
      expect(toast.info).toHaveBeenCalledTimes(1);
      expect(toast.info).toHaveBeenCalledWith(
        'sifDataTabs.toast.exemptionCauseModified.title',
        expect.objectContaining({
          description: 'sifDataTabs.toast.exemptionCauseModified.description',
        }),
      );
    });

    it('does NOT fire the info toast when the backend does not report an auto-fill', () => {
      render(<SifTab {...makeProps({
        data: { documentStatus: 'DR', hasExemptTaxes: true },
      })} />);
      expect(toast.info).not.toHaveBeenCalled();
    });

    it('fires the warning toast exactly once when the backend reports exemptionCauseWarning', () => {
      render(<SifTab {...makeProps({
        data: { documentStatus: 'DR', hasExemptTaxes: true, exemptionCauseWarning: true },
      })} />);
      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.warning).toHaveBeenCalledWith(
        'sifDataTabs.toast.exemptionCauseRequired.title',
        expect.objectContaining({
          description: 'sifDataTabs.toast.exemptionCauseRequired.description',
        }),
      );
    });

    it('does NOT fire the warning toast when the backend does not report a warning', () => {
      render(<SifTab {...makeProps({
        data: { documentStatus: 'DR', hasExemptTaxes: true },
      })} />);
      expect(toast.warning).not.toHaveBeenCalled();
    });

    // ETP-4751 W2 regression guard (observable-toast layer): the one-shot guard must
    // RE-ARM when the signal flips back to false between saves. This is the whole reason
    // useEntity#applyExemptionCauseSignals always writes the resolved boolean (false when
    // absent) on every line update/delete — including plain non-exemption object-form line
    // edits (W2). A stale-true flag that never resets would leave the guard latched and the
    // warning would silently fail to re-fire on the next qualifying save. Simulate the
    // true → false → true transition the backend/handler produce across successive saves.
    it('re-fires the warning toast after the flag resets to false then true again (ETP-4751 W2)', () => {
      const base = { documentStatus: 'DR', hasExemptTaxes: true };
      const { rerender } = render(<SifTab {...makeProps({ data: { ...base, exemptionCauseWarning: true } })} />);
      expect(toast.warning).toHaveBeenCalledTimes(1);

      // A subsequent line save (or a plain object-form line edit — the W2 path) resets the
      // signal to false; no toast fires on the reset, and the guard re-arms.
      rerender(<SifTab {...makeProps({ data: { ...base, exemptionCauseWarning: false } })} />);
      expect(toast.warning).toHaveBeenCalledTimes(1);

      // Next qualifying save stamps it true again → the toast fires a SECOND time.
      rerender(<SifTab {...makeProps({ data: { ...base, exemptionCauseWarning: true } })} />);
      expect(toast.warning).toHaveBeenCalledTimes(2);
    });
  });

  // ETP-5027: the two toasts above are SII-only. The exemption cause they point at lives on
  // the invoice HEADER and its selector is rendered exclusively inside the SII panel, so on a
  // VERI*FACTU-only or TicketBAI-only org the toast would tell the user to fill in a field
  // this UI never renders. The backend flag is fiscal-system-agnostic and fires on every
  // exempt-line save, so the guard has to live here.

  describe('exemption cause toasts are SII-only (ETP-5027)', () => {
    const withWarning = { documentStatus: 'DR', hasExemptTaxes: true, exemptionCauseWarning: true };
    const withAutoFill = { documentStatus: 'DR', hasExemptTaxes: true, exemptionCauseAutoFilled: true };

    it('does NOT fire the warning toast for a verifactu-only profile', () => {
      mockFiscalConfig('verifactu');
      render(<SifTab {...makeProps({ data: withWarning })} />);
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it('does NOT fire the info toast for a verifactu-only profile', () => {
      mockFiscalConfig('verifactu');
      render(<SifTab {...makeProps({ data: withAutoFill })} />);
      expect(toast.info).not.toHaveBeenCalled();
    });

    it('does NOT fire either toast for a tbai-only profile', () => {
      mockFiscalConfig('tbai');
      render(<SifTab {...makeProps({ data: { ...withWarning, ...withAutoFill } })} />);
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
    });

    it('still fires both toasts for an SII profile', () => {
      mockFiscalConfig('sii');
      render(<SifTab {...makeProps({ data: { ...withWarning, ...withAutoFill } })} />);
      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.info).toHaveBeenCalledTimes(1);
    });

    it('still fires for a combined sii+tbai profile', () => {
      mockFiscalConfig('sii+tbai');
      render(<SifTab {...makeProps({ data: withWarning })} />);
      expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    // Suppressing a toast must NOT latch the one-shot ref: if the fiscal profile resolves
    // late (useFiscalConfig starts unconfigured and settles on SII) the warning must still
    // fire on the render where showSii finally becomes true, with the flag unchanged.
    it('fires when showSii flips false -> true while the flag stays set', () => {
      mockFiscalConfig('verifactu');
      const { rerender } = render(<SifTab {...makeProps({ data: withWarning })} />);
      expect(toast.warning).not.toHaveBeenCalled();

      mockFiscalConfig('sii');
      rerender(<SifTab {...makeProps({ data: withWarning })} />);
      expect(toast.warning).toHaveBeenCalledTimes(1);
    });
  });

  // ── TBAI: minimal Adjuntos-only rail (ETP-4888) ─────────────────────────────
  // ETP-4401 removed the full TBAI field panel (Chain Sequence, Invoice Series, Invoice
  // Sequence) from SifTab because chaining sequences are now generated automatically per
  // fiscal configuration — that removal still holds, and this suite guards it never comes
  // back. ETP-4888 reintroduces a DIFFERENT, much smaller TBAI rail whose only content is
  // the "Adjuntos" section for the invoice's tbai_syncinvoice sub-record (the XML/response
  // attachments the classic Attachments tab can never reach, since they hang off that
  // sub-record rather than off C_Invoice). SII and Verifactu are unaffected either way.

  describe('TBAI: minimal Adjuntos-only rail (tbai profile, sales-invoice) — ETP-4888', () => {
    beforeEach(() => {
      mockFiscalConfig('tbai');
    });

    it('renders a TBAI rail button', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.tab.tbai')).toBeInTheDocument();
    });

    it('renders the TBAI panel title and defaults to it as the only active target', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.panel.tbai.title')).toBeInTheDocument();
    });

    it('renders the Adjuntos section wired to tbai_syncinvoice / tbaiSyncInvoiceId', () => {
      render(<SifTab {...makeProps({ data: { tbaiSyncInvoiceId: 'tbai-sub-001' } })} />);
      const section = screen.getByTestId('mock-sif-attachments-section');
      expect(section).toHaveAttribute('data-table-name', 'tbai_syncinvoice');
      expect(section).toHaveAttribute('data-record-id', 'tbai-sub-001');
    });

    // ETP-4401 regression guard: the full per-invoice TBAI field panel (Chain Sequence,
    // Invoice Series, Invoice Sequence) must NOT come back — only the Adjuntos section.
    it('never renders the removed TBAI read-only fields (ETP-4401)', () => {
      render(<SifTab {...makeProps({ data: { tbaiSequence: 'SEQ1', tbaiInvoicenum: 'SER1', tbaiInvoiceseq: 'INV1' } })} />);
      expect(screen.queryByTestId('input-sif-tbaiSeq')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-sif-tbaiSerie')).not.toBeInTheDocument();
      expect(screen.queryByTestId('input-sif-tbaiInvSeq')).not.toBeInTheDocument();
    });

    it('never renders a TBAI status badge (ETP-4401 — no per-invoice status field exists here)', () => {
      render(<SifTab {...makeProps({ data: { tbaiIssent: 'Y' } })} />);
      expect(screen.queryByText('sifDataTabs.status.tbai.sent')).not.toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.status.tbai.notSent')).not.toBeInTheDocument();
    });

    it('does not show TBAI for purchase-invoice (TBAI is a sales-invoice-only target)', () => {
      render(<SifTab {...makeProps({ apiBaseUrl: '/sws/neo/purchase-invoice' })} />);
      expect(screen.queryByText('sifDataTabs.tab.tbai')).not.toBeInTheDocument();
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

    // ETP-4888: the Verifactu panel's Adjuntos section covers only the AEAT-response
    // leg — the outbound-send leg already attaches directly to C_Invoice via the
    // standard Attachments tab, so this is deliberately a DIFFERENT sub-record/id
    // than the SII one above.
    it('renders the Adjuntos section wired to etvfac_c_invoice_verifactu / invoiceVerifactuId', () => {
      render(<SifTab {...makeProps({ data: { invoiceVerifactuId: 'vf-sub-001' } })} />);
      const section = screen.getByTestId('mock-sif-attachments-section');
      expect(section).toHaveAttribute('data-table-name', 'etvfac_c_invoice_verifactu');
      expect(section).toHaveAttribute('data-record-id', 'vf-sub-001');
    });
  });

  // ── sii+tbai profile ─────────────────────────────────────────────────────────
  // ETP-4888: the combined profile now shows BOTH rails for a sales invoice — SII with
  // its full field panel, and TBAI with its minimal Adjuntos-only panel. Purchase invoices
  // never get TBAI (fiscalTargets.js gates it to sales only), so they still show SII alone.

  describe('sii+tbai profile (sales-invoice)', () => {
    beforeEach(() => {
      mockFiscalConfig('sii+tbai');
    });

    it('renders both the SII and TBAI rail buttons', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.tab.sii')).toBeInTheDocument();
      expect(screen.getByText('sifDataTabs.tab.tbai')).toBeInTheDocument();
    });

    it('defaults to the SII panel', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.getByText('sifDataTabs.panel.sii.title')).toBeInTheDocument();
    });

    it('does not render Verifactu rail button', () => {
      render(<SifTab {...makeProps()} />);
      expect(screen.queryByText('sifDataTabs.tab.verifactu')).not.toBeInTheDocument();
    });

    it('shows only the SII rail for purchase-invoice (TBAI is sales-invoice-only)', () => {
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
      const checkbox = screen.getByRole('checkbox', { name: 'sifDataTabs.field.authorization' });
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
    // ETP-4783: correctiveInvoiceType (etvfacReverseinvtype) is no longer shown in
    // the UI — it is always saved as 'I' automatically via useSifFieldPatcher.

    beforeEach(() => {
      mockFiscalConfig('verifactu');
    });

    it.each([
      // invType,   simplified(art7273), noRecipient(art61d)
      [undefined, true, false],
      ['F1', true, false],
      ['F2', false, true],
      ['F3', true, false],
      ['R1', true, false],
      ['R2', true, false],
      ['R3', true, false],
      ['R4', true, false],
      ['R5', false, true],
    ])('invType=%s → simplified=%s noRecipient=%s', (invType, simplified, noRecipient) => {
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR', etvfacInvType: invType } })} />);
      expect(Boolean(screen.queryByText(SIMPLIFIED_LABEL))).toBe(simplified);
      expect(Boolean(screen.queryByText(NO_RECIPIENT_LABEL))).toBe(noRecipient);
      // correctiveInvoiceType is always hidden from the UI (ETP-4783)
      expect(screen.queryByText('sifDataTabs.field.correctiveInvoiceType')).not.toBeInTheDocument();
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

    // ETP-4783: correctiveInvoiceType is no longer shown in the UI — it is
    // always saved as 'I' automatically. See useSifFieldPatcher auto-set tests.

    it('flips simplified/noRecipient live when switching from F1 to R5', () => {
      renderControlled({ data: { documentStatus: 'DR', etvfacInvType: 'F1' } });
      expect(screen.getByText('sifDataTabs.field.simplifiedInvoiceArt7273')).toBeInTheDocument();
      expect(screen.queryByText('sifDataTabs.field.noRecipientIdArt61d')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mock-select-option-R5'));

      expect(screen.queryByText('sifDataTabs.field.simplifiedInvoiceArt7273')).not.toBeInTheDocument();
      expect(screen.getByText('sifDataTabs.field.noRecipientIdArt61d')).toBeInTheDocument();
    });

    // ETP-4783: etvfacReverseinvtype is auto-set to 'I' via useSifFieldPatcher
    // when invType is R1-R5 — no UI select needed. Tested in useSifFieldPatcher tests.
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

    // ETP-4783: etvfacReverseinvtype has no UI select — it is auto-set to 'I'
    // via useSifFieldPatcher when invType is R1-R5.
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

    // ETP-4783: etvfacReverseinvtype select removed from UI — no disabled/enabled
    // check needed. The field is always saved as 'I' via useSifFieldPatcher.
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
    // and is exercised via the ExemptionCauseField when rendered as read-only
    // (aeatsiiCauseExemption$_identifier undefined → '—' placeholder).
    // ETP-4783: redirected again from sif-siiYear (removed from SII panel)
    // to sif-exemption (visible when hasExemptTaxes is falsy — always read-only).
    it('ReadOnlyValue shows em-dash placeholder when value is null/undefined', () => {
      mockFiscalConfig('sii');
      render(<SifTab {...makeProps({ data: { documentStatus: 'DR' } })} />);
      const exemptionInput = screen.getByTestId('input-sif-exemption');
      expect(exemptionInput).toHaveValue('—');
    });
  });

  // ── onVisibilityChange callback (ETP-4401 follow-up: hide the SIF tab itself) ──
  // DetailView's `customTabs` (placement: 'tab') mechanism mounts SifTab regardless of
  // whether it has anything to show, and relies on this callback to decide whether the
  // tab button itself should stay in the tab bar. See DetailView.jsx customTabVisibility.

  describe('onVisibilityChange callback', () => {
    it('calls onVisibilityChange(false) when no fiscal target applies (unconfigured)', () => {
      mockFiscalConfig('unconfigured');
      const onVisibilityChange = vi.fn();
      render(<SifTab {...makeProps({ onVisibilityChange })} />);
      expect(onVisibilityChange).toHaveBeenCalledWith(false);
      expect(onVisibilityChange).not.toHaveBeenCalledWith(true);
    });

    // ETP-4888: a TBAI-only profile now HAS something to show — the minimal
    // Adjuntos-only rail — so the tab must stay visible instead of collapsing.
    it('calls onVisibilityChange(true) for a TBAI-only profile (ETP-4888 minimal rail)', () => {
      mockFiscalConfig('tbai');
      const onVisibilityChange = vi.fn();
      render(<SifTab {...makeProps({ onVisibilityChange })} />);
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
      expect(onVisibilityChange).not.toHaveBeenCalledWith(false);
    });

    it('calls onVisibilityChange(true) when SII applies', () => {
      mockFiscalConfig('sii');
      const onVisibilityChange = vi.fn();
      render(<SifTab {...makeProps({ onVisibilityChange })} />);
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
      expect(onVisibilityChange).not.toHaveBeenCalledWith(false);
    });

    it('calls onVisibilityChange(true) when Verifactu applies', () => {
      mockFiscalConfig('verifactu');
      const onVisibilityChange = vi.fn();
      render(<SifTab {...makeProps({ onVisibilityChange })} />);
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
      expect(onVisibilityChange).not.toHaveBeenCalledWith(false);
    });

    it('calls onVisibilityChange(true) when sii+tbai profile applies (SII half still active)', () => {
      mockFiscalConfig('sii+tbai');
      const onVisibilityChange = vi.fn();
      render(<SifTab {...makeProps({ onVisibilityChange })} />);
      expect(onVisibilityChange).toHaveBeenCalledWith(true);
    });

    it('is safe to omit onVisibilityChange — no crash regardless of profile', () => {
      mockFiscalConfig('unconfigured');
      expect(() => render(<SifTab {...makeProps()} />)).not.toThrow();
      mockFiscalConfig('sii');
      expect(() => render(<SifTab {...makeProps()} />)).not.toThrow();
    });
  });
});

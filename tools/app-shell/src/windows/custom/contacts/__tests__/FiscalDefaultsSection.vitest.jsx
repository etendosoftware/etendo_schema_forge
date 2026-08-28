/**
 * Tests for FiscalDefaultsSection — the grouped SII/TicketBAI fiscal-defaults
 * block (ETP-4784). Faithful to Classic: no "SII/TBAI active" gating — the
 * SII block (`aeatsiiDefaultsiikey` + `aeatsiiSiikeylist`) shows only when
 * `data.customer` is true (same gate as `BillingPreferencesForm.jsx`'s
 * Cliente block), and the TicketBAI block (`tbaiIssimplifiedinv`) always
 * renders.
 */
import { render, screen } from '@testing-library/react';
import FiscalDefaultsSection from '../FiscalDefaultsSection';
import { EntityForm } from '@/components/contract-ui';
// Real (non-mocked) generated module + contract: the SII key-list options must
// be DERIVED from these, never hand-written in the custom component. See the
// "options are contract-derived" block below.
import CustomerForm from '@generated/contacts/generated/web/contacts/CustomerForm';
import contract from '@generated/contacts/contract.json';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
  useLabel: () => (column) => `label:${column}`,
}));
vi.mock('@/components/contract-ui', () => ({
  EntityForm: vi.fn(({ fields }) => (
    <div data-testid="entity-form">{fields?.map(f => <span key={f.key}>{f.key}</span>)}</div>
  )),
}));

function findFieldsCall(fieldKey) {
  return EntityForm.mock.calls.find(([props]) =>
    props?.fields?.some((f) => f.key === fieldKey),
  );
}

/** Renders with the customer gate on and returns the aeatsiiSiikeylist field descriptor. */
function getSiiKeyListField() {
  render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);
  const call = findFieldsCall('aeatsiiSiikeylist');
  return call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
}

/** The same field as emitted by the generator into the contract-backed form. */
function generatedSiiKeyListField() {
  return CustomerForm.fields.find((f) => f.key === 'aeatsiiSiikeylist');
}

/**
 * The aeatsiiSiikeylist enumValues as declared by AD, read from the contract.
 * Only the `customer` entity carries the translated list — other entities hold a
 * `system`-visibility copy without labelled enumValues, so select it explicitly.
 */
function contractEnumValues() {
  const customer = contract.frontendContract.entities.customer;
  const field = customer.fields.find((f) => f.name === 'aeatsiiSiikeylist');
  return field.enumValues;
}

describe('FiscalDefaultsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always renders the section title and description', () => {
    render(<FiscalDefaultsSection data={{}} onChange={vi.fn()} />);
    expect(screen.getByText('fiscalDefaults')).toBeInTheDocument();
    expect(screen.getByText('fiscalDefaultsDescription')).toBeInTheDocument();
  });

  describe('SII block — shown only when data.customer is true', () => {
    it('renders the SII block title and fields when customer is true', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsSiiBlock')).toBeInTheDocument();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeTruthy();
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
    });

    it('does not render the SII block when customer is false', () => {
      render(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);

      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeUndefined();
      expect(screen.queryByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).not.toBeInTheDocument();
    });

    it('does not render the SII block when customer is undefined', () => {
      render(<FiscalDefaultsSection data={{}} onChange={vi.fn()} />);

      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
    });

    it('wires the aeatsiiDefaultsiikey toggle to onChange with the AD column name', () => {
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ customer: true, aeatsiiDefaultsiikey: false }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' }).click();
      expect(onChange).toHaveBeenCalledWith('aeatsiiDefaultsiikey', true, 'EM_Aeatsii_Defaultsiikey');
    });

    it('exposes the aeatsiiSiikeylist select with exactly the four AEAT invoice-type codes', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(field.column).toBe('EM_Aeatsii_Siikeylist');
      expect(field.type).toBe('select');
      const codes = field.options.map((o) => o.value).sort();
      expect(codes).toEqual(['F1', 'F2', 'F4', 'R'].sort());
    });

    it('the aeatsiiSiikeylist displayLogic mirrors @EM_Aeatsii_Defaultsiikey@=\'Y\' (visible only when the toggle is on)', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(field.displayLogic({ aeatsiiDefaultsiikey: false })).toBe(false);
      expect(field.displayLogic({ aeatsiiDefaultsiikey: true })).toBe(true);
    });
  });

  // ── i18n regression guard (ETP-4784) ────────────────────────────────────
  // The aeatsiiSiikeylist options were once hand-written in this component with
  // hardcoded English labels and a partial per-locale map — 'F1' had no Spanish
  // translation at all, so Spanish users saw "Invoice". The options are now
  // derived from the generated, contract-backed form (the single source of
  // truth for AD_Ref_List text). These tests lock that in.
  describe('aeatsiiSiikeylist options are contract-derived, not hardcoded', () => {
    it('reuses the options emitted by the generated CustomerForm verbatim', () => {
      const field = getSiiKeyListField();

      expect(field.options).toEqual(generatedSiiKeyListField().options);
    });

    it('gives every option a non-empty Spanish label', () => {
      const field = getSiiKeyListField();

      expect(field.options.length).toBeGreaterThan(0);
      for (const option of field.options) {
        const es = option.labels?.es_ES;
        expect(
          typeof es === 'string' && es.trim().length > 0,
          `option ${option.value} has no es_ES label`,
        ).toBe(true);
      }
    });

    it('covers exactly the enumValues declared by the contract (no drift from AD)', () => {
      const field = getSiiKeyListField();

      const optionValues = field.options.map((o) => o.value).sort();
      const contractValues = contractEnumValues().map((e) => e.value).sort();
      expect(optionValues).toEqual(contractValues);
    });

    it('matches the contract text of every enumValue in both locales', () => {
      const field = getSiiKeyListField();

      for (const enumValue of contractEnumValues()) {
        const option = field.options.find((o) => o.value === enumValue.value);
        expect(option, `no option for contract value ${enumValue.value}`).toBeTruthy();
        expect(option.label).toBe(enumValue.name);
        expect(option.labels.es_ES).toBe(enumValue.labels.es_ES);
      }
    });
  });

  // Only `options` is contract-derived; the rest of the descriptor stays this
  // panel's own. These tests pin that boundary in both directions.
  describe('aeatsiiSiikeylist descriptor is this panel\'s own, apart from the options', () => {
    it('declares the AD column and select type that the generated field also uses', () => {
      const field = getSiiKeyListField();
      const generated = generatedSiiKeyListField();

      expect(field.column).toBe('EM_Aeatsii_Siikeylist');
      expect(field.type).toBe('select');
      expect(field.column).toBe(generated.column);
      expect(field.type).toBe(generated.type);
    });

    it('renders the field in the principal section', () => {
      const field = getSiiKeyListField();

      expect(field.section).toBe('principal');
    });

    it('does not inherit the generated defaultValue', () => {
      const field = getSiiKeyListField();

      // The generated field defaults to 'F1'; this panel deliberately applies
      // no default, so pulling in the whole descriptor would be a behavior change.
      expect(generatedSiiKeyListField().defaultValue).toBe('F1');
      expect(field.defaultValue).toBeUndefined();
    });

    it('carries its own displayLogic, which the generated field does not have', () => {
      const field = getSiiKeyListField();

      expect(typeof field.displayLogic).toBe('function');
      expect(generatedSiiKeyListField().displayLogic).toBeUndefined();
    });
  });

  describe('TicketBAI block — always shown', () => {
    it('renders the TicketBAI block title and toggle regardless of customer', () => {
      render(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).toBeInTheDocument();
    });

    it('wires the tbaiIssimplifiedinv toggle to onChange with the AD column name', () => {
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ tbaiIssimplifiedinv: false }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' }).click();
      expect(onChange).toHaveBeenCalledWith('tbaiIssimplifiedinv', true, 'EM_Tbai_Issimplifiedinv');
    });
  });

  describe('both blocks visible', () => {
    it('renders both blocks simultaneously when customer is true', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsSiiBlock')).toBeInTheDocument();
      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('does not crash when data is undefined', () => {
      expect(() => render(<FiscalDefaultsSection data={undefined} onChange={vi.fn()} />)).not.toThrow();
      expect(screen.getByText('fiscalDefaults')).toBeInTheDocument();
      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
    });

    it('does not crash when onChange is not provided (toggles are inert, no throw on click)', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} />);

      expect(() => {
        screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' }).click();
        screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' }).click();
      }).not.toThrow();
    });

    it('re-renders correctly when customer flips from true to false (SII block unmounts cleanly)', () => {
      const { rerender } = render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);
      expect(screen.getByText('fiscalDefaultsSiiBlock')).toBeInTheDocument();

      rerender(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);
      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
    });

    it('toggling tbaiIssimplifiedinv off sends false to onChange (not just the "turn on" path)', () => {
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ tbaiIssimplifiedinv: true }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' }).click();
      expect(onChange).toHaveBeenCalledWith('tbaiIssimplifiedinv', false, 'EM_Tbai_Issimplifiedinv');
    });
  });
});

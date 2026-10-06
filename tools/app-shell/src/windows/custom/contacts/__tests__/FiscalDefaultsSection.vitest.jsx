// @covers tools/app-shell/src/windows/custom/contacts/FiscalDefaultsSection.jsx
/**
 * Tests for FiscalDefaultsSection — the grouped SII/TicketBAI fiscal-defaults
 * block (ETP-4784). Faithful to Classic: no "SII/TBAI active" gating — the
 * SII block (`aeatsiiDefaultsiikey` + `aeatsiiSiikeylist`) shows only when
 * `data.customer` is true (same gate as `BillingPreferencesForm.jsx`'s
 * Cliente block), and the TicketBAI block (`tbaiIssimplifiedinv`) always
 * renders.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FiscalDefaultsSection from '../FiscalDefaultsSection';
import { EntityForm } from '@/components/contract-ui';
// Real (non-mocked) generated module + contract: the SII key-list options must
// be DERIVED from these, never hand-written in the custom component. See the
// "options are contract-derived" block below.
import CustomerForm from '@generated/contacts/generated/web/contacts/CustomerForm';
import contract from '@generated/contacts/contract.json';

// `useRealEntityForm` switches the EntityForm stub to the real component, for the one
// behavior that only the real form can show: the key list's displayLogic gating.
const formMode = vi.hoisted(() => ({ useRealEntityForm: false }));

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
  useLabel: () => (column) => `label:${column}`,
  useMenuLabel: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
}));
vi.mock('@/components/contract-ui', async () => {
  const { EntityForm: RealEntityForm } = await vi.importActual('@/components/contract-ui/EntityForm');
  return {
    EntityForm: vi.fn((props) => (formMode.useRealEntityForm
      ? <RealEntityForm {...props} />
      : <div data-testid="entity-form">{props.fields?.map(f => <span key={f.key}>{f.key}</span>)}</div>)),
  };
});

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
    formMode.useRealEntityForm = false;
  });

  it('always renders the section title and description', () => {
    render(<FiscalDefaultsSection data={{}} onChange={vi.fn()} />);
    expect(screen.getByText('fiscalDefaults')).toBeInTheDocument();
    expect(screen.getByText('fiscalDefaultsDescription')).toBeInTheDocument();
  });

  describe('SII block — shown only when data.customer is true', () => {
    it('renders the SII caption and fields when customer is true', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      expect(screen.getByTestId('FiscalToggle__aeatsii-default-caption')).toHaveTextContent('fiscalDefaultsSiiBlock');
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeTruthy();
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
    });

    it('does not render the SII block when customer is false', () => {
      render(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);

      expect(screen.queryByTestId('FiscalToggle__aeatsii-default-caption')).not.toBeInTheDocument();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeUndefined();
      expect(screen.queryByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('FiscalDefaultsSection__sii-block')).not.toBeInTheDocument();
      expect(screen.getByTestId('FiscalDefaultsSection__tbai-block')).toBeInTheDocument();
    });

    it('does not render the SII block when customer is undefined', () => {
      render(<FiscalDefaultsSection data={{}} onChange={vi.fn()} />);

      expect(screen.queryByTestId('FiscalToggle__aeatsii-default-caption')).not.toBeInTheDocument();
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
    it('renders the TicketBAI caption and toggle regardless of customer', () => {
      render(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);

      expect(screen.getByTestId('FiscalToggle__tbai-simplified-caption')).toHaveTextContent('fiscalDefaultsTbaiBlock');
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

      expect(screen.getByTestId('FiscalToggle__aeatsii-default-caption')).toHaveTextContent('fiscalDefaultsSiiBlock');
      expect(screen.getByTestId('FiscalToggle__tbai-simplified-caption')).toHaveTextContent('fiscalDefaultsTbaiBlock');
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).toBeInTheDocument();
    });
  });

  // ETP-5519: SII and TicketBAI sit side by side in one 2-column grid row, and each switch has
  // its label right next to it (switch first), as in EntityForm's own `toggle` field.
  describe('layout — both blocks in one row, label beside each switch', () => {
    const SWITCHES = [
      { testId: 'FiscalToggle__aeatsii-default', caption: 'fiscalDefaultsSiiBlock', label: 'label:EM_Aeatsii_Defaultsiikey', key: 'aeatsiiDefaultsiikey', column: 'EM_Aeatsii_Defaultsiikey' },
      { testId: 'FiscalToggle__tbai-simplified', caption: 'fiscalDefaultsTbaiBlock', label: 'label:EM_Tbai_Issimplifiedinv', key: 'tbaiIssimplifiedinv', column: 'EM_Tbai_Issimplifiedinv' },
    ];

    it('places the SII and TicketBAI blocks as cells of the same 2-column grid', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);
      const sii = screen.getByTestId('FiscalDefaultsSection__sii-block');
      const tbai = screen.getByTestId('FiscalDefaultsSection__tbai-block');
      const grid = sii.parentElement;
      expect(tbai.parentElement).toBe(grid);
      expect(grid.className.split(/\s+/)).toEqual(expect.arrayContaining(['grid', 'grid-cols-2']));
      expect(Array.from(grid.children)).toEqual([sii, tbai]);
    });

    it.each(SWITCHES)('renders the $key label right after its switch, bound to it', ({ testId, label }) => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);
      const sw = screen.getByTestId(testId);
      expect(sw.id).toBeTruthy();
      // The label lives in the wrapper that follows the switch (label + caption).
      const wrapper = sw.nextElementSibling;
      const lbl = wrapper.querySelector(`label[for="${sw.id}"]`);
      expect(lbl).not.toBeNull();
      expect(lbl).toHaveTextContent(label);
      expect(lbl.htmlFor).toBe(sw.id);
      // Switch first, label after it in document order.
      expect(sw.compareDocumentPosition(lbl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Same row: the switch and its label wrapper share one flex container.
      expect(sw.parentElement.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'items-center']));
    });

    it.each(SWITCHES)('puts the $key caption under its label, in the same wrapper', ({ testId, caption }) => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);
      const sw = screen.getByTestId(testId);
      const cap = screen.getByTestId(`${testId}-caption`);
      expect(cap).toHaveTextContent(caption);
      const lbl = sw.nextElementSibling.querySelector('label');
      expect(cap.parentElement).toBe(lbl.parentElement);
      expect(lbl.nextElementSibling).toBe(cap);
    });

    it('renders no uppercase heading in either block', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);
      for (const id of ['FiscalDefaultsSection__sii-block', 'FiscalDefaultsSection__tbai-block']) {
        expect(screen.getByTestId(id).querySelector('.uppercase')).toBeNull();
      }
    });

    it.each(SWITCHES)('clicking the $key label toggles the switch', async ({ key, column, label }) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ customer: true, [key]: false }} onChange={onChange} />);
      await user.click(screen.getByText(label, { selector: 'label' }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(key, true, column);
    });

    it('gives the two switches distinct ids so each label targets its own switch', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);
      expect(screen.getByTestId(SWITCHES[0].testId).id).not.toBe(screen.getByTestId(SWITCHES[1].testId).id);
    });
  });

  // Rendered through the REAL EntityForm: "Clave tipo factura" appears only while the
  // "Clave por defecto" switch is on.
  describe('key list visibility (real EntityForm)', () => {
    const KEY_LIST_LABEL = 'label:EM_Aeatsii_Siikeylist';

    it('hides the key list while "Clave por defecto" is off', () => {
      formMode.useRealEntityForm = true;
      render(<FiscalDefaultsSection data={{ customer: true, aeatsiiDefaultsiikey: false }} onChange={vi.fn()} />);
      const sii = screen.getByTestId('FiscalDefaultsSection__sii-block');
      expect(within(sii).queryByText(KEY_LIST_LABEL)).toBeNull();
    });

    it('shows the key list once "Clave por defecto" is on', () => {
      formMode.useRealEntityForm = true;
      render(<FiscalDefaultsSection data={{ customer: true, aeatsiiDefaultsiikey: true }} onChange={vi.fn()} />);
      const sii = screen.getByTestId('FiscalDefaultsSection__sii-block');
      expect(within(sii).getByText(KEY_LIST_LABEL)).toBeInTheDocument();
    });

    it('reveals the key list when the switch flips on', () => {
      formMode.useRealEntityForm = true;
      const { rerender } = render(<FiscalDefaultsSection data={{ customer: true, aeatsiiDefaultsiikey: false }} onChange={vi.fn()} />);
      expect(screen.queryByText(KEY_LIST_LABEL)).toBeNull();
      rerender(<FiscalDefaultsSection data={{ customer: true, aeatsiiDefaultsiikey: true }} onChange={vi.fn()} />);
      expect(screen.getByText(KEY_LIST_LABEL)).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('does not crash when data is undefined', () => {
      expect(() => render(<FiscalDefaultsSection data={undefined} onChange={vi.fn()} />)).not.toThrow();
      expect(screen.getByText('fiscalDefaults')).toBeInTheDocument();
      expect(screen.queryByTestId('FiscalToggle__aeatsii-default-caption')).not.toBeInTheDocument();
      expect(screen.getByTestId('FiscalToggle__tbai-simplified-caption')).toHaveTextContent('fiscalDefaultsTbaiBlock');
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
      expect(screen.getByTestId('FiscalToggle__aeatsii-default-caption')).toHaveTextContent('fiscalDefaultsSiiBlock');

      rerender(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);
      expect(screen.queryByTestId('FiscalToggle__aeatsii-default-caption')).not.toBeInTheDocument();
      expect(screen.getByTestId('FiscalToggle__tbai-simplified-caption')).toHaveTextContent('fiscalDefaultsTbaiBlock');
    });

    it('toggling tbaiIssimplifiedinv off sends false to onChange (not just the "turn on" path)', () => {
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ tbaiIssimplifiedinv: true }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' }).click();
      expect(onChange).toHaveBeenCalledWith('tbaiIssimplifiedinv', false, 'EM_Tbai_Issimplifiedinv');
    });
  });
});

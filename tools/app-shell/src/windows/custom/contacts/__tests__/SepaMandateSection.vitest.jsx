// @covers tools/app-shell/src/windows/custom/contacts/SepaMandateSection.jsx
/**
 * The SEPA direct-debit mandate block of a contact (ETP-6148): customers only, behind the
 * sepaRemittances capability. Its two OBSEPAD fields ride the panel's onChange, so they are saved
 * with the record. The real EntityForm renders them: labels, placeholder, help, max length and the
 * read-only state are what the user sees, not props the section merely forwards.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const caps = vi.hoisted(() => ({ current: { sepaRemittances: true } }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({ useCapabilitiesSafe: () => caps.current }));

// Echo the key so a hardcoded string would show up as itself, prefixed for the labels so the
// test can tell "came through ui()" from "the raw key leaked".
vi.mock('@/i18n', () => ({
  useUI: () => (k) => `ui:${k}`,
  useLabel: () => (column) => `label:${column}`,
  useMenuLabel: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: () => {} }),
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token', selectedOrg: { id: 'org-1' } }),
}));

import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';
import SepaMandateSection, {
  MANDATE_ID_MAX_LENGTH,
  buildSepaMandateFields,
  shouldShowSepaMandate,
} from '../SepaMandateSection';

const CUSTOMER = { id: 'bp-1', customer: true, vendor: false };
const renderSection = (props = {}) => render(
  <SepaMandateSection data={CUSTOMER} onChange={vi.fn()} readOnly={false} {...props} />,
);

describe('SepaMandateSection', () => {
  beforeEach(() => {
    caps.current = { sepaRemittances: true };
  });

  describe('visibility', () => {
    it('shows for a customer with the capability', () => {
      renderSection();
      expect(screen.getByTestId('SepaMandateSection')).toBeInTheDocument();
    });

    it('hides for a vendor that is not a customer', () => {
      const { container } = renderSection({ data: { id: 'bp-2', customer: false, vendor: true } });
      expect(container).toBeEmptyDOMElement();
    });

    it('hides without the capability', () => {
      caps.current = { sepaRemittances: false };
      const { container } = renderSection();
      expect(container).toBeEmptyDOMElement();
    });

    it('hides while the capability map is not loaded yet', () => {
      caps.current = null;
      const { container } = renderSection();
      expect(container).toBeEmptyDOMElement();
    });

    it('hides when there is no record', () => {
      const { container } = renderSection({ data: undefined });
      expect(container).toBeEmptyDOMElement();
    });

    it.each([
      [{ capabilities: { sepaRemittances: true }, isCustomer: true }, true],
      [{ capabilities: { sepaRemittances: true }, isCustomer: false }, false],
      [{ capabilities: { sepaRemittances: true }, isCustomer: undefined }, false],
      [{ capabilities: {}, isCustomer: true }, false],
      [{ capabilities: null, isCustomer: true }, false],
      [{ capabilities: { isAdminOrClientAdmin: true }, isCustomer: true }, false],
    ])('shouldShowSepaMandate(%j) is %s', (input, expected) => {
      expect(shouldShowSepaMandate(input)).toBe(expected);
    });
  });

  describe('texts come from i18n', () => {
    it('renders the title and description through ui()', () => {
      renderSection();
      const section = screen.getByTestId('SepaMandateSection');
      expect(section).toHaveTextContent('ui:sepaMandate');
      expect(section).toHaveTextContent('ui:sepaMandateDescription');
    });

    it('labels both fields with the translated UI labels, not the OBSEPAD AD labels', () => {
      renderSection();
      expect(screen.getByText('ui:sepaMandateId')).toBeInTheDocument();
      expect(screen.getByText('ui:sepaMandateSignedOn')).toBeInTheDocument();
      expect(screen.queryByText('label:EM_Obsepad_Mandate_Identifier')).not.toBeInTheDocument();
      expect(screen.queryByText('label:EM_Obsepad_Mandate_Date')).not.toBeInTheDocument();
    });

    // ETP-6148: the backend stores the mandate on create, so the fields hold real values: no
    // «left blank, …» placeholder any more, one neutral help line on the mandate ID.
    it('explains the autofill once, as one line under the fields, with no placeholder in the inputs', () => {
      renderSection();
      expect(screen.getByTestId('field-obsepadMandateIdentifier')).not.toHaveAttribute('placeholder', expect.stringMatching(/\S/));
      expect(screen.getByTestId('SepaMandateSection-autofill-hint')).toHaveTextContent('ui:sepaMandateAutofillHint');
      expect(screen.getAllByText('ui:sepaMandateAutofillHint')).toHaveLength(1);
      // Under the fields, not in the left description column.
      const hint = screen.getByTestId('SepaMandateSection-autofill-hint');
      expect(screen.getByText('ui:sepaMandateDescription').parentElement).not.toContainElement(hint);
      expect(screen.getByTestId('field-obsepadMandateIdentifier').compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('builds the descriptors with no placeholder and no per-field help', () => {
      const ui = vi.fn((k) => `t(${k})`);
      const [id, date] = buildSepaMandateFields(ui);
      expect(id).toMatchObject({
        key: 'obsepadMandateIdentifier',
        column: 'EM_Obsepad_Mandate_Identifier',
        type: 'string',
        maxLength: 35,
        labels: { en_US: 't(sepaMandateId)' },
      });
      expect(id).not.toHaveProperty('placeholderKey');
      expect(id).not.toHaveProperty('help');
      expect(date).not.toHaveProperty('help');
      expect(date).toMatchObject({
        key: 'obsepadMandateDate',
        column: 'EM_Obsepad_Mandate_Date',
        type: 'date',
        labels: { en_US: 't(sepaMandateSignedOn)' },
      });
    });
  });

  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('every key the section reads exists in %s', (_loc, json) => {
    const keys = ['sepaMandate', 'sepaMandateDescription', 'sepaMandateId', 'sepaMandateAutofillHint',
      'sepaMandateSignedOn'];
    for (const key of keys) expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
  });

  describe('editing', () => {
    it('shows the stored mandate values', () => {
      renderSection({ data: { ...CUSTOMER, obsepadMandateIdentifier: 'MANDATE-001' } });
      expect(screen.getByTestId('field-obsepadMandateIdentifier')).toHaveValue('MANDATE-001');
    });

    it('calls onChange with the key, value and column of the mandate id', () => {
      const onChange = vi.fn();
      renderSection({ onChange });
      const input = screen.getByTestId('field-obsepadMandateIdentifier');
      fireEvent.change(input, { target: { value: 'MANDATE-002' } });
      fireEvent.blur(input);
      expect(onChange).toHaveBeenCalledWith('obsepadMandateIdentifier', 'MANDATE-002', 'EM_Obsepad_Mandate_Identifier');
    });

    it('caps the mandate id at 35 characters', () => {
      renderSection();
      expect(MANDATE_ID_MAX_LENGTH).toBe(35);
      expect(screen.getByTestId('field-obsepadMandateIdentifier')).toHaveAttribute('maxLength', '35');
    });

    it('is read-only when the panel is not editing', async () => {
      // userEvent, not fireEvent: fireEvent dispatches on a disabled input, a user cannot.
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderSection({ readOnly: true, onChange, data: { ...CUSTOMER, obsepadMandateIdentifier: 'MANDATE-001' } });
      const input = screen.getByTestId('field-obsepadMandateIdentifier');
      expect(input).toBeDisabled();
      await user.type(input, 'X');
      await user.tab();
      expect(input).toHaveValue('MANDATE-001');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('is editable while the panel is editing', () => {
      renderSection({ readOnly: false });
      expect(screen.getByTestId('field-obsepadMandateIdentifier')).toBeEnabled();
    });
  });
});

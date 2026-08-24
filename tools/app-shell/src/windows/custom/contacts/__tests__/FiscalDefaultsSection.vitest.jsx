/**
 * Tests for FiscalDefaultsSection — the grouped SII/TicketBAI fiscal-defaults
 * block (ETP-4784 part 2 UX fix). Field-wiring tests for `aeatsiiDefaultsiikey`
 * / `aeatsiiSiikeylist` were migrated verbatim from `BillingPreferencesForm`,
 * where these two fields used to live before being grouped with
 * `tbaiIssimplifiedinv` into this dedicated section.
 */
import { render, screen } from '@testing-library/react';
import FiscalDefaultsSection from '../FiscalDefaultsSection';
import { EntityForm } from '@/components/contract-ui';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
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

describe('FiscalDefaultsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('title and description', () => {
    it('renders the section title and description', () => {
      render(<FiscalDefaultsSection data={{}} onChange={vi.fn()} />);
      expect(screen.getByText('fiscalDefaults')).toBeInTheDocument();
      expect(screen.getByText('fiscalDefaultsDescription')).toBeInTheDocument();
    });
  });

  describe('tbaiIssimplifiedinv — always rendered', () => {
    it('wires the tbaiIssimplifiedinv checkbox regardless of the customer flag', () => {
      render(<FiscalDefaultsSection data={{ id: 'BP1', customer: false }} onChange={vi.fn()} />);
      const call = findFieldsCall('tbaiIssimplifiedinv');
      expect(call).toBeTruthy();
      const field = call[0].fields.find((f) => f.key === 'tbaiIssimplifiedinv');
      expect(field).toMatchObject({
        key: 'tbaiIssimplifiedinv',
        column: 'EM_Tbai_Issimplifiedinv',
        type: 'checkbox',
        section: 'principal',
      });
    });

    it('still renders tbaiIssimplifiedinv when customer is enabled', () => {
      render(<FiscalDefaultsSection data={{ id: 'BP1', customer: true }} onChange={vi.fn()} />);
      expect(findFieldsCall('tbaiIssimplifiedinv')).toBeTruthy();
    });
  });

  describe('SII (AEAT) invoicing default fields — gated on data.customer', () => {
    it('wires the aeatsiiDefaultsiikey checkbox into an EntityForm fields prop when customer is enabled', () => {
      render(
        <FiscalDefaultsSection
          data={{ id: 'BP1', customer: true }}
          onChange={vi.fn()}
        />,
      );

      const call = findFieldsCall('aeatsiiDefaultsiikey');
      expect(call).toBeTruthy();
      const field = call[0].fields.find((f) => f.key === 'aeatsiiDefaultsiikey');
      expect(field).toMatchObject({
        key: 'aeatsiiDefaultsiikey',
        column: 'EM_Aeatsii_Defaultsiikey',
        type: 'checkbox',
        section: 'principal',
      });
    });

    it('does not render any SII field when data.customer is falsy', () => {
      render(
        <FiscalDefaultsSection
          data={{ id: 'BP1', customer: false }}
          onChange={vi.fn()}
        />,
      );

      expect(findFieldsCall('aeatsiiDefaultsiikey')).toBeUndefined();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeUndefined();
    });

    it('exposes the aeatsiiSiikeylist select with exactly the four AEAT invoice-type codes', () => {
      render(
        <FiscalDefaultsSection
          data={{ id: 'BP1', customer: true }}
          onChange={vi.fn()}
        />,
      );

      const call = findFieldsCall('aeatsiiSiikeylist');
      expect(call).toBeTruthy();
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(field.column).toBe('EM_Aeatsii_Siikeylist');
      expect(field.type).toBe('select');
      const codes = field.options.map((o) => o.value).sort();
      expect(codes).toEqual(['F1', 'F2', 'F4', 'R'].sort());

      // Exact label/translation contract per option — must mirror the
      // AD_Ref_List enumValues in artifacts/contacts/contract.json verbatim,
      // so a typo'd translation regresses this test instead of shipping silently.
      expect(field.options).toEqual([
        { value: 'R', label: 'Corrective invoice', labels: { es_ES: 'Factura rectificativa' } },
        { value: 'F1', label: 'Invoice' },
        { value: 'F2', label: 'Simplified invoice', labels: { es_ES: 'Factura simplificada' } },
        {
          value: 'F4',
          label: 'Simplified invoices summary',
          labels: { es_ES: 'Asiento resumen facturas simplificadas' },
        },
      ]);
    });

    it('the aeatsiiSiikeylist displayLogic mirrors @EM_Aeatsii_Defaultsiikey@=\'Y\' (visible only when the checkbox is on)', () => {
      render(
        <FiscalDefaultsSection
          data={{ id: 'BP1', customer: true }}
          onChange={vi.fn()}
        />,
      );

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(typeof field.displayLogic).toBe('function');

      expect(field.displayLogic(undefined)).toBe(false);
      expect(field.displayLogic({})).toBe(false);
      expect(field.displayLogic({ aeatsiiDefaultsiikey: undefined })).toBe(false);
      expect(field.displayLogic({ aeatsiiDefaultsiikey: false })).toBe(false);
      expect(field.displayLogic({ aeatsiiDefaultsiikey: null })).toBe(false);

      expect(field.displayLogic({ aeatsiiDefaultsiikey: true })).toBe(true);
      expect(field.displayLogic({ aeatsiiDefaultsiikey: 'Y' })).toBe(true);
    });

    it('does not clear aeatsiiSiikeylist when the default-key checkbox is off — the field is only hidden, the stored value persists', () => {
      const onChange = vi.fn();
      // Simulate the "checkbox toggled off after a value was already set" state:
      // aeatsiiSiikeylist still carries 'F2' even though aeatsiiDefaultsiikey is false.
      render(
        <FiscalDefaultsSection
          data={{ id: 'BP1', customer: true, aeatsiiDefaultsiikey: false, aeatsiiSiikeylist: 'F2' }}
          onChange={onChange}
        />,
      );

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      // The field is visually hidden by displayLogic (delegated to the generic
      // EntityForm, tested there) …
      expect(field.displayLogic({ aeatsiiDefaultsiikey: false })).toBe(false);
      // … but FiscalDefaultsSection wires no clear-on-hide side effect: the
      // EntityForm instance receives the untouched `onChange` from props, so
      // toggling the checkbox off never mutates or drops aeatsiiSiikeylist itself.
      expect(call[0].onChange).toBe(onChange);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});

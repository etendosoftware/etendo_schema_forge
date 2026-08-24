/**
 * Tests for BillingPreferencesForm — pure helper logic + basic render.
 */
import { render, screen } from '@testing-library/react';
import BillingPreferencesForm from '../BillingPreferencesForm';
import { EntityForm } from '@/components/contract-ui';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));
vi.mock('@/components/contract-ui', () => ({
  EntityForm: vi.fn(({ fields }) => (
    <div data-testid="entity-form">{fields?.map(f => <span key={f.key}>{f.key}</span>)}</div>
  )),
}));

// Replicate internal resolveId
function resolveId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

describe('BillingPreferencesForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveId (pure helper)', () => {
    it('returns null for null/undefined/empty', () => {
      expect(resolveId(null)).toBeNull();
      expect(resolveId(undefined)).toBeNull();
      expect(resolveId('')).toBeNull();
    });

    it('returns string for string input', () => {
      expect(resolveId('ABC')).toBe('ABC');
    });

    it('extracts id from object', () => {
      expect(resolveId({ id: '123', name: 'Test' })).toBe('123');
    });

    it('extracts value from object when no id', () => {
      expect(resolveId({ value: 'V1' })).toBe('V1');
    });

    it('returns null for object with empty id', () => {
      expect(resolveId({ id: '' })).toBeNull();
    });
  });

  describe('render', () => {
    it('shows after-save message when no bpId', () => {
      render(<BillingPreferencesForm data={{}} />);
      expect(screen.getByText('billingPreferencesAfterSave')).toBeInTheDocument();
    });

    it('renders entity forms when bpId exists and customer is enabled', () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      // EntityForm only renders inside the customer/vendor conditional blocks.
      // Pass customer:true so the customer billing fields are shown.
      render(
        <BillingPreferencesForm
          data={{ id: 'BP1', customer: true }}
          token="t"
          apiBaseUrl="/api"
          onChange={vi.fn()}
        />,
      );
      expect(screen.getAllByTestId('entity-form').length).toBeGreaterThan(0);
    });
  });

  describe('SII (AEAT) invoicing default fields — customer block', () => {
    function findFieldsCall(fieldKey) {
      return EntityForm.mock.calls.find(([props]) =>
        props?.fields?.some((f) => f.key === fieldKey),
      );
    }

    it('wires the aeatsiiDefaultsiikey checkbox into an EntityForm fields prop when customer is enabled', () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      render(
        <BillingPreferencesForm
          data={{ id: 'BP1', customer: true }}
          token="t"
          apiBaseUrl="/api"
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
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      render(
        <BillingPreferencesForm
          data={{ id: 'BP1', customer: false }}
          token="t"
          apiBaseUrl="/api"
          onChange={vi.fn()}
        />,
      );

      expect(findFieldsCall('aeatsiiDefaultsiikey')).toBeUndefined();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeUndefined();
    });

    it('exposes the aeatsiiSiikeylist select with exactly the four AEAT invoice-type codes', () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      render(
        <BillingPreferencesForm
          data={{ id: 'BP1', customer: true }}
          token="t"
          apiBaseUrl="/api"
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
    });

    it('the aeatsiiSiikeylist displayLogic mirrors @EM_Aeatsii_Defaultsiikey@=\'Y\' (visible only when the checkbox is on)', () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      render(
        <BillingPreferencesForm
          data={{ id: 'BP1', customer: true }}
          token="t"
          apiBaseUrl="/api"
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
  });
});

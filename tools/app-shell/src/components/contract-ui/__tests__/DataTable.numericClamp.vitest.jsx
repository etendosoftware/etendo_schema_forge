// ETP-4277 — DataTable renderInputCell onBlur numeric clamp (max/min autocorrection).
//
// When a numeric field declares `max` (or `min`), blurring the input with an
// out-of-range value must autocorrect it to the boundary value via
// handleFieldChange. Blurring with an in-range value must leave it untouched.

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  statusLabel: (raw) => raw,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({ Tag: ({ label }) => <span>{label}</span> }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (col) => col.label ?? col.key }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../InternalConsumptionProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '../DataTable.jsx';

/**
 * Render a DataTable inline-add row with a single numeric field.
 * Returns a spy for handleFieldChange calls triggered through addRow.onAdd / internal state.
 *
 * Because DataTable manages the inline-add values internally, we capture the
 * value after onBlur by inspecting the rendered input directly.
 */
function renderNumericAddRow(fieldExtra = {}) {
  const fields = [{
    key: 'discount',
    label: 'Discount',
    type: 'number',
    ...fieldExtra,
  }];
  const columns = fields.map((f) => ({ key: f.key, label: f.label, type: f.type }));
  render(
    <DataTable
      columns={columns}
      data={[]}
      addRow={{ active: true, fields, onAdd: vi.fn(() => Promise.resolve(true)), onCancel: vi.fn(), catalogs: {} }}
      selectable={false}
    />,
  );
  return screen.getByTestId('inline-add-field-discount');
}

describe('DataTable renderInputCell — onBlur numeric clamp (ETP-4277)', () => {
  describe('max constraint', () => {
    it('autocorrects input value to max when the entered value exceeds max', () => {
      const input = renderNumericAddRow({ max: 100 });
      fireEvent.change(input, { target: { value: '150' } });
      fireEvent.blur(input);
      expect(input.value).toBe('100');
    });

    it('leaves the value unchanged when it equals max exactly', () => {
      const input = renderNumericAddRow({ max: 100 });
      fireEvent.change(input, { target: { value: '100' } });
      fireEvent.blur(input);
      expect(input.value).toBe('100');
    });

    it('leaves the value unchanged when it is below max', () => {
      const input = renderNumericAddRow({ max: 100 });
      fireEvent.change(input, { target: { value: '50' } });
      fireEvent.blur(input);
      expect(input.value).toBe('50');
    });

    it('autocorrects a negative value exceeding max (e.g., max is 0, value is 5)', () => {
      const input = renderNumericAddRow({ max: 0 });
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);
      expect(input.value).toBe('0');
    });
  });

  describe('min constraint', () => {
    it('autocorrects input value to min when the entered value is below min', () => {
      const input = renderNumericAddRow({ min: 1 });
      fireEvent.change(input, { target: { value: '0' } });
      fireEvent.blur(input);
      expect(input.value).toBe('1');
    });

    it('leaves the value unchanged when it equals min exactly', () => {
      const input = renderNumericAddRow({ min: 1 });
      fireEvent.change(input, { target: { value: '1' } });
      fireEvent.blur(input);
      expect(input.value).toBe('1');
    });

    it('leaves the value unchanged when it is above min', () => {
      const input = renderNumericAddRow({ min: 1 });
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);
      expect(input.value).toBe('5');
    });
  });

  describe('no constraint declared', () => {
    it('does not alter any value on blur when neither min nor max are declared', () => {
      const input = renderNumericAddRow({});
      fireEvent.change(input, { target: { value: '9999' } });
      fireEvent.blur(input);
      expect(input.value).toBe('9999');
    });
  });

  describe('empty-field normalization (ETP-4277)', () => {
    it('leaves value empty on blur when the field has no defaultValue and no min', () => {
      // Only max declared — nothing to substitute for an empty field.
      const input = renderNumericAddRow({ max: 100 });
      fireEvent.blur(input);
      expect(input.value).toBe('');
    });

    it('autocorrects empty to defaultValue on blur when defaultValue is declared', () => {
      // discount field pattern: { min: 0, max: 100, defaultValue: 0 }
      const input = renderNumericAddRow({ max: 100, min: 0, defaultValue: 0 });
      fireEvent.blur(input);
      expect(input.value).toBe('0');
    });

    it('autocorrects empty to min on blur when only min is declared (no defaultValue)', () => {
      const input = renderNumericAddRow({ min: 1, max: 100 });
      fireEvent.blur(input);
      expect(input.value).toBe('1');
    });
  });
});

import { render, screen, fireEvent } from '@testing-library/react';

// Mock i18n hooks. useUI resolves a tiny dictionary and interpolates `{param}`
// placeholders exactly like the real hook, so the tests assert the interpolated
// text and prove the `{min}` value flows through the component's call site.
// The dictionary is inlined here because vi.mock factories are hoisted above
// module-level declarations.
vi.mock('@/i18n', () => {
  const dict = {
    fieldMinValueError: 'Value must be at least {min}',
    fieldIntegerError: 'Value must be a whole number',
  };
  return {
    useLabel: () => (key) => key,
    useMenuLabel: () => (key) => key,
    useUI: () => (key, params = {}) => {
      let text = dict[key] ?? key;
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
      return text;
    },
    useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Heavy children stubbed (same convention as the other EntityForm specs).
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => <div /> }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div /> }));
vi.mock('../CreatableSearchSelect.jsx', () => ({ CreatableSearchSelect: () => <div /> }));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { toast } from 'sonner';
import { EntityForm } from '../EntityForm.jsx';
import { numericFieldToastId } from '@/lib/numericValidation.js';

/**
 * ETP-4542 — generic, declarative on-blur numeric validation (min / integer).
 * The behaviour is driven purely by field config, so it must work for ANY window,
 * not just Assets. It must also be backwards-compatible: a field that declares
 * neither `min` nor `integer` keeps the pre-existing behaviour (decimals allowed,
 * no validation toast).
 */
describe('EntityForm — generic numeric blur validation (ETP-4542)', () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  const minIntField = { key: 'qty', label: 'Qty', type: 'number', column: 'Qty', min: 1, integer: true };
  const minOnlyField = { key: 'rate', label: 'Rate', type: 'number', column: 'Rate', min: 0 };
  const plainField = { key: 'weight', label: 'Weight', type: 'number', column: 'Weight' };

  it('toasts the min error with the interpolated {min} when a min+integer field is below min', () => {
    // min:1 → "Value must be at least 1" (0 is NOT negative — the point of ETP-4542).
    render(<EntityForm fields={[minIntField]} data={{ qty: 0 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).toHaveBeenCalledWith('Value must be at least 1', { id: numericFieldToastId('qty') });
  });

  it('interpolates a different min value (min:0 → "at least 0")', () => {
    const minZeroInt = { key: 'qty', label: 'Qty', type: 'number', column: 'Qty', min: 0, integer: true };
    render(<EntityForm fields={[minZeroInt]} data={{ qty: -1 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).toHaveBeenCalledWith('Value must be at least 0', { id: numericFieldToastId('qty') });
  });

  it('toasts the integer error (no interpolation) when a min+integer field is a decimal', () => {
    render(<EntityForm fields={[minIntField]} data={{ qty: 2.5 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).toHaveBeenCalledWith('Value must be a whole number', { id: numericFieldToastId('qty') });
  });

  it('uses a stable per-field toast id (ETP-4542 dedup) — matches the save-gate id for the same key', () => {
    // Same field key must produce the exact id both call sites (EntityForm blur
    // and useEntity's save gate) pass to toast.error, so sonner can dedupe a
    // near-simultaneous blur+click into a single visible toast.
    render(<EntityForm fields={[minIntField]} data={{ qty: 0 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    const [, options] = toast.error.mock.calls[0];
    expect(options.id).toBe(numericFieldToastId('qty'));
    expect(options.id).toBe('numeric-field-qty');
  });

  it('does NOT toast when a min+integer field holds a valid whole number', () => {
    render(<EntityForm fields={[minIntField]} data={{ qty: 3 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('DEFAULT: a min-only field (no integer flag) accepts a decimal — no toast', () => {
    render(<EntityForm fields={[minOnlyField]} data={{ rate: 2.5 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-rate'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a field with neither min nor integer never validates on blur (backwards-compatible)', () => {
    render(<EntityForm fields={[plainField]} data={{ weight: -99.9 }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-weight'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does NOT toast on an empty value (required mechanism owns emptiness)', () => {
    render(<EntityForm fields={[minIntField]} data={{ qty: '' }} onChange={vi.fn()} />);
    fireEvent.blur(screen.getByTestId('field-qty'));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

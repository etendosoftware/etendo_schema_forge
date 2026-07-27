/**
 * ETP-4542 — on-blur numeric validation for the Assets Usable Life (Months/Years)
 * fields. The fields declare `min: 1, integer: true`; the GENERIC numeric validation
 * inside the real EntityForm (getNumericFieldError) surfaces a toast on blur when the
 * value is below the minimum or not a whole number. The old window-specific
 * `isInvalidUsableLife` / `handleUsableLifeBlur` hack was removed — this spec proves
 * the generic mechanism covers the same UX via the REAL EntityForm (not a stub).
 */
import { render, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Transitive deps of the real EntityForm — stubbed the same way the wiring spec does.
vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('@/components/contract-ui/ImageField.jsx', () => ({ ImageField: () => null }));
vi.mock('@/components/contract-ui/PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => null }));
vi.mock('@/components/contract-ui/SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('@/components/contract-ui/SelectorChip.jsx', () => ({ SelectorChip: ({ label }) => <span>{label}</span> }));
vi.mock('@/components/contract-ui/CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { toast } from 'sonner';
import AssetsDetailPanel from '../AssetsDetailPanel.jsx';

const BASE_PROPS = {
  token: 'tok',
  apiBaseUrl: 'http://host/neo/assets',
  api: { labelOverrides: {} },
  catalogs: {},
  editing: true,
  onChange: vi.fn(),
  registerFields: vi.fn(),
  fieldErrors: {},
};

// Depreciate on + calculateType 'TI' makes the Usable Life fields visible;
// amortize 'MO' shows usableLifeMonths, amortize 'YE' shows usableLifeYears.
function renderPanel(extraData) {
  return render(
    <AssetsDetailPanel
      {...BASE_PROPS}
      data={{ id: 'a1', depreciate: 'Y', calculateType: 'TI', ...extraData }}
    />,
  );
}

describe('AssetsDetailPanel — Usable Life on-blur validation (ETP-4542, generic mechanism)', () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  it('toasts fieldMinValueError on blur when usableLifeMonths is negative', () => {
    const { getByTestId } = renderPanel({ amortize: 'MO', usableLifeMonths: -3 });
    fireEvent.blur(getByTestId('field-usableLifeMonths'));
    // Second arg is the ETP-4542 dedup id, shared with the save-gate toast for
    // this same field — see EntityForm.numericBlur.vitest.jsx for the id contract.
    expect(toast.error).toHaveBeenCalledWith('fieldMinValueError', { id: 'numeric-field-usableLifeMonths' });
  });

  it('toasts fieldMinValueError on blur when usableLifeMonths is zero', () => {
    const { getByTestId } = renderPanel({ amortize: 'MO', usableLifeMonths: 0 });
    fireEvent.blur(getByTestId('field-usableLifeMonths'));
    expect(toast.error).toHaveBeenCalledWith('fieldMinValueError', { id: 'numeric-field-usableLifeMonths' });
  });

  it('toasts fieldIntegerError on blur when usableLifeMonths is decimal', () => {
    const { getByTestId } = renderPanel({ amortize: 'MO', usableLifeMonths: 5.5 });
    fireEvent.blur(getByTestId('field-usableLifeMonths'));
    expect(toast.error).toHaveBeenCalledWith('fieldIntegerError', { id: 'numeric-field-usableLifeMonths' });
  });

  it('does NOT toast when usableLifeMonths is a valid positive integer', () => {
    const { getByTestId } = renderPanel({ amortize: 'MO', usableLifeMonths: 12 });
    fireEvent.blur(getByTestId('field-usableLifeMonths'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does NOT toast on an empty value (required mechanism owns emptiness)', () => {
    const { getByTestId } = renderPanel({ amortize: 'MO', usableLifeMonths: '' });
    fireEvent.blur(getByTestId('field-usableLifeMonths'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('validates the years field when it is the visible one', () => {
    const { getByTestId } = renderPanel({ amortize: 'YE', usableLifeYears: 0 });
    fireEvent.blur(getByTestId('field-usableLifeYears'));
    expect(toast.error).toHaveBeenCalledWith('fieldMinValueError', { id: 'numeric-field-usableLifeYears' });
  });
});

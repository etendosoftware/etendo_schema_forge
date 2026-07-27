/**
 * ETP-4542 — on-blur numeric validation for the Assets "Annual Depreciation %"
 * field (annualDepreciation / Amortizationpercentage). The field declares only
 * `min: 1` — NOT `integer: true`, because it is a percentage and decimals are
 * valid (e.g. 12.5%). The GENERIC numeric validation inside the real EntityForm
 * (getNumericFieldError) surfaces a toast on blur when the value is below the
 * minimum, but must NOT toast for decimal values. Mirrors
 * AssetsDetailPanel.usableLifeValidation.vitest.jsx, which covers the sibling
 * `integer: true` fields.
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

// Depreciate on + calculateType 'PE' (Percentage) makes annualDepreciation visible.
function renderPanel(extraData) {
  return render(
    <AssetsDetailPanel
      {...BASE_PROPS}
      data={{ id: 'a1', depreciate: 'Y', calculateType: 'PE', ...extraData }}
    />,
  );
}

describe('AssetsDetailPanel — Annual Depreciation % on-blur validation (ETP-4542, generic mechanism)', () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  it('toasts fieldMinValueError on blur when annualDepreciation is negative', () => {
    const { getByTestId } = renderPanel({ annualDepreciation: -5 });
    fireEvent.blur(getByTestId('field-annualDepreciation'));
    expect(toast.error).toHaveBeenCalledWith('fieldMinValueError', { id: 'numeric-field-annualDepreciation' });
  });

  it('toasts fieldMinValueError on blur when annualDepreciation is zero', () => {
    const { getByTestId } = renderPanel({ annualDepreciation: 0 });
    fireEvent.blur(getByTestId('field-annualDepreciation'));
    expect(toast.error).toHaveBeenCalledWith('fieldMinValueError', { id: 'numeric-field-annualDepreciation' });
  });

  it('does NOT toast when annualDepreciation is a valid decimal percentage (12.5)', () => {
    const { getByTestId } = renderPanel({ annualDepreciation: 12.5 });
    fireEvent.blur(getByTestId('field-annualDepreciation'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does NOT toast when annualDepreciation is a valid positive integer', () => {
    const { getByTestId } = renderPanel({ annualDepreciation: 20 });
    fireEvent.blur(getByTestId('field-annualDepreciation'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does NOT toast on an empty value (required mechanism owns emptiness)', () => {
    const { getByTestId } = renderPanel({ annualDepreciation: '' });
    fireEvent.blur(getByTestId('field-annualDepreciation'));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

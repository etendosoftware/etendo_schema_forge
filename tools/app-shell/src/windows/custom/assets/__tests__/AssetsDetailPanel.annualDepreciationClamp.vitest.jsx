/**
 * ETP-4887 — silent clamp of the Assets "Annual Depreciation %" field
 * (annualDepreciation / Amortizationpercentage) to its declared `max: 100`.
 * Unlike the existing `min`/`integer` validation (ETP-4542), this is NOT a
 * blocking validation — no toast, no fieldError. On blur, an over-100 value is
 * silently corrected to 100 in the input. Mirrors
 * AssetsDetailPanel.annualDepreciationValidation.vitest.jsx for the mock setup.
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

describe('AssetsDetailPanel — Annual Depreciation % max clamp (ETP-4887, generic mechanism)', () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  it('clamps 150 down to 100 on blur, silently (no toast)', () => {
    const { getByTestId } = renderPanel({ annualDepreciation: 20 });
    const input = getByTestId('field-annualDepreciation');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.blur(input);
    expect(input.value).toBe('100');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('leaves 25 unchanged on blur', () => {
    const { getByTestId } = renderPanel({ annualDepreciation: 20 });
    const input = getByTestId('field-annualDepreciation');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);
    expect(input.value).toBe('25');
    expect(toast.error).not.toHaveBeenCalled();
  });
});

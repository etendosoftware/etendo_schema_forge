import { render, screen } from '@testing-library/react';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({
  PartnerAddressPicker: () => <div data-testid="partner-address-picker" />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: ({ field }) => <div data-testid={`selector-input-${field.key}`} />,
}));
vi.mock('../CreatableSearchSelect.jsx', () => ({
  CreatableSearchSelect: ({ field }) => <div data-testid={`creatable-search-select-${field.key}`} />,
}));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { EntityForm } from '../EntityForm.jsx';

// Regression coverage for the explicit `searchSelect: false` opt-out (ETP-4600 follow-up).
// This carve-out routes a `type:'selector'` field back to the OLD plain SelectorInput —
// used today only by Assets' `assetCategory` (see AssetsDetailPanel.jsx) to sidestep a
// DetailView save→refetch/callout race exposed by the unified CreatableSearchSelect.
describe('EntityForm renderSelectorField searchSelect opt-out', () => {
  it('renders the old SelectorInput when a field explicitly declares searchSelect: false', () => {
    const fields = [
      { key: 'assetCategory', label: 'Asset Category', type: 'selector', column: 'A_Asset_Group_ID', searchSelect: false },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);

    expect(screen.getByTestId('selector-input-assetCategory')).toBeInTheDocument();
    expect(screen.queryByTestId('creatable-search-select-assetCategory')).not.toBeInTheDocument();
  });

  it('still renders the unified CreatableSearchSelect when searchSelect is absent', () => {
    const fields = [
      { key: 'businessPartner', label: 'Business Partner', type: 'selector', column: 'C_BPartner_ID' },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);

    expect(screen.getByTestId('creatable-search-select-businessPartner')).toBeInTheDocument();
    expect(screen.queryByTestId('selector-input-businessPartner')).not.toBeInTheDocument();
  });

  it('still renders the unified CreatableSearchSelect when searchSelect is explicitly true', () => {
    const fields = [
      { key: 'transactionType', label: 'Transaction Type', type: 'selector', column: 'C_TxnType_ID', searchSelect: true },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);

    expect(screen.getByTestId('creatable-search-select-transactionType')).toBeInTheDocument();
    expect(screen.queryByTestId('selector-input-transactionType')).not.toBeInTheDocument();
  });
});

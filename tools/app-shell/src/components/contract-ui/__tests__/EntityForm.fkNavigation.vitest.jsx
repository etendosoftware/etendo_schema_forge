/**
 * ETP-5075 — click-through navigation on read-only FK fields (EntityForm).
 *
 * Covers renderReadOnlyFk()'s three-way fail-closed behavior:
 *   1. Registry hit + navigate prop passed → renders the `fk-link-*` button, click calls navigate.
 *   2. Column NOT in the registry → plain disabled `<Input>`, no link, regardless of navigate.
 *   3. Registry hit but no `navigate` prop → plain disabled `<Input>` (fails closed).
 *
 * This is the non-regression surface: EntityForm renders in every window, so these three
 * cases must hold for every existing read-only FK field that has nothing to do with ETP-5075.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => <div data-testid="partner-address-picker" /> }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('../CreatableSearchSelect.jsx', () => ({ CreatableSearchSelect: () => <div data-testid="creatable-search-select" /> }));
vi.mock('../SelectorChip.jsx', () => ({ SelectorChip: (props) => <span data-testid="chip">{props.label}</span> }));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { EntityForm } from '../EntityForm.jsx';

// C_InvoiceLine_ID is a real registry entry (see fkNavigation.js): idField 'invoiceHeaderId' →
// target window 'purchase-invoice'.
const REGISTERED_FIELD = {
  key: 'invoiceLine',
  label: 'Invoice Line',
  type: 'search',
  column: 'C_InvoiceLine_ID',
  readOnly: true,
};

// Ordinary read-only FK column with no fkNavigation entry — the non-regression case.
const UNREGISTERED_FIELD = {
  key: 'businessPartner',
  label: 'Business Partner',
  type: 'search',
  column: 'C_BPartner_ID',
  readOnly: true,
};

describe('EntityForm — ETP-5075 FK click-through navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the fk-link button and calls navigate with the resolved route on click', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(
      <EntityForm
        fields={[REGISTERED_FIELD]}
        data={{ invoiceLine: 'line-1', 'invoiceLine$_identifier': 'INV-001', invoiceHeaderId: 'HDR-123' }}
        onChange={vi.fn()}
        navigate={navigate}
      />,
    );

    const link = screen.getByTestId('fk-link-invoiceLine');
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('BUTTON');
    // Wrapper div always carries field-<key>; the plain-input path is what's absent.
    expect(within(screen.getByTestId('field-invoiceLine')).queryByTestId('Input__a8d626')).not.toBeInTheDocument();

    await user.click(link);
    expect(navigate).toHaveBeenCalledWith('/purchase-invoice/HDR-123');
  });

  it('renders a plain disabled input (no link) when the column is not in the registry, even with navigate passed', () => {
    const navigate = vi.fn();
    render(
      <EntityForm
        fields={[UNREGISTERED_FIELD]}
        data={{ businessPartner: 'BP-1', 'businessPartner$_identifier': 'Acme Corp' }}
        onChange={vi.fn()}
        navigate={navigate}
      />,
    );

    expect(screen.queryByTestId('fk-link-businessPartner')).not.toBeInTheDocument();
    const wrapper = screen.getByTestId('field-businessPartner');
    const input = within(wrapper).getByTestId('Input__a8d626');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('Acme Corp');
  });

  it('renders a plain disabled input (fails closed) when the registry resolves but no navigate prop is passed', () => {
    render(
      <EntityForm
        fields={[REGISTERED_FIELD]}
        data={{ invoiceLine: 'line-1', 'invoiceLine$_identifier': 'INV-001', invoiceHeaderId: 'HDR-123' }}
        onChange={vi.fn()}
        // no navigate prop — mirrors EntityForm rendered outside a Router in unit tests
      />,
    );

    expect(screen.queryByTestId('fk-link-invoiceLine')).not.toBeInTheDocument();
    const wrapper = screen.getByTestId('field-invoiceLine');
    const input = within(wrapper).getByTestId('Input__a8d626');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('INV-001');
  });

  it('renders a plain disabled input when the registry column resolves but the injected id is missing (fails closed)', () => {
    const navigate = vi.fn();
    render(
      <EntityForm
        fields={[REGISTERED_FIELD]}
        // no invoiceHeaderId on the record at all — mirrors the handler not being deployed yet
        data={{ invoiceLine: 'line-1', 'invoiceLine$_identifier': 'INV-001' }}
        onChange={vi.fn()}
        navigate={navigate}
      />,
    );

    expect(screen.queryByTestId('fk-link-invoiceLine')).not.toBeInTheDocument();
    expect(screen.getByTestId('field-invoiceLine')).toBeInTheDocument();
  });
});

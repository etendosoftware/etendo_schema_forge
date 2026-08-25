import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let searchState = { items: [], loading: false };
const useClickOutside = vi.fn();
const useEntitySearch = vi.fn((args) => {
  useEntitySearch.lastArgs = args;
  return searchState;
});
const deriveEntityEndpoint = vi.fn(() => '/sws/neo/business-partner');

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../entityLookup', () => ({
  deriveEntityEndpoint: (...args) => deriveEntityEndpoint(...args),
  useClickOutside: (...args) => useClickOutside(...args),
  useEntitySearch: (...args) => useEntitySearch(...args),
}));

import EntityField from '../EntityField.jsx';

const baseField = {
  id: 'vendor',
  key: 'vendor',
  entitySpec: 'contacts/business-partner',
  extractFrom: ['vendorName', 'fallbackVendor'],
  extracted: { vendorName: 'Acme Raw' },
  filter: 'active = true',
  createLabel: 'createVendor',
  createDocumentType: 'business-partner',
  createPrefilledFrom: { name: 'vendorName', taxId: 'taxId' },
};

function renderField(props = {}) {
  const onChange = vi.fn();
  render(
    <EntityField
      field={baseField}
      value={null}
      token="tok"
      contactsBase="/contacts"
      apiBaseUrl="/api/purchase-invoice"
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
}

describe('EntityField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchState = { items: [], loading: false };
    deriveEntityEndpoint.mockReturnValue('/sws/neo/business-partner');
  });

  it('seeds the search query from extracted text and opens the dropdown with no matches', () => {
    renderField();

    const input = screen.getByDisplayValue('Acme Raw');
    expect(input).toBeInTheDocument();
    expect(screen.getByText('ocrReviewVendorNoMatches')).toBeInTheDocument();
    expect(deriveEntityEndpoint).toHaveBeenCalledWith({
      entitySpec: 'contacts/business-partner',
      apiBaseUrl: '/api/purchase-invoice',
      contactsBase: '/contacts',
    });
    expect(useEntitySearch.lastArgs).toMatchObject({
      open: true,
      endpoint: '/sws/neo/business-partner',
      query: 'Acme Raw',
      filter: 'active = true',
      limit: 20,
    });
  });

  it('renders loading and lets the user pick a searched entity', async () => {
    const user = userEvent.setup();
    searchState = {
      loading: true,
      items: [
        { id: 'bp-1', name: 'Acme Corp' },
        { id: 'bp-2', _identifier: 'Fallback Corp' },
      ],
    };
    const { onChange } = renderField();

    expect(screen.getByTestId('Loader2__vendor')).toBeInTheDocument();
    await user.click(screen.getByText('Fallback Corp'));

    expect(onChange).toHaveBeenCalledWith({
      id: 'bp-2',
      label: 'Fallback Corp',
      bpId: 'bp-2',
      bpCreate: null,
      locationCreate: null,
    });
    expect(screen.queryByText('Fallback Corp')).not.toBeInTheDocument();
  });

  it('opens on focus/change when there is no initial hint and uses the value label as placeholder', async () => {
    const user = userEvent.setup();
    renderField({
      field: { ...baseField, extracted: {}, extractFrom: 'missing' },
      value: { id: 'bp-0', label: 'Current Vendor' },
    });

    const input = screen.getByPlaceholderText('Current Vendor');
    fireEvent.focus(input);
    await user.type(input, 'new query');

    expect(input).toHaveValue('new query');
    expect(screen.getByText('ocrReviewVendorNoMatches')).toBeInTheDocument();
  });

  it('opens and closes the create component, then forwards created records', async () => {
    const user = userEvent.setup();
    const CreateComponent = ({ item, onCancel, onSubmit }) => (
      <div data-testid="create-form">
        <span>{item.payload.prefilled.name}</span>
        <span>{item.payload.documentType}</span>
        <button type="button" onClick={onCancel}>cancel create</button>
        <button type="button" onClick={() => onSubmit({})}>submit empty</button>
        <button type="button" onClick={() => onSubmit({ created: { id: 'bp-3', name: 'Created Vendor' } })}>
          submit created
        </button>
      </div>
    );
    const { onChange } = renderField({ createComponent: CreateComponent });

    await user.click(screen.getByText('createVendor'));
    expect(screen.getByTestId('create-form')).toHaveTextContent('Acme Raw');
    expect(screen.getByTestId('create-form')).toHaveTextContent('business-partner');

    await user.click(screen.getByText('submit empty'));
    expect(screen.queryByTestId('create-form')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByDisplayValue('Acme Raw'));
    await user.click(screen.getByText('createVendor'));
    await user.click(screen.getByText('submit created'));

    expect(onChange).toHaveBeenCalledWith({
      id: 'bp-3',
      label: 'Created Vendor',
      bpId: 'bp-3',
      bpCreate: null,
      locationCreate: null,
    });
  });
});

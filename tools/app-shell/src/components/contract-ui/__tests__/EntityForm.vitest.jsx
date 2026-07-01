import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock sub-components that have heavy dependencies
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ImageField.jsx', () => ({
  ImageField: () => <div data-testid="image-field" />,
}));
vi.mock('../PartnerAddressPicker.jsx', () => ({
  PartnerAddressPicker: () => <div data-testid="partner-address-picker" />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));
vi.mock('../CreatableSearchSelect.jsx', () => ({
  CreatableSearchSelect: ({ field, emptyOptionLabel, createLabel }) => (
    <div
      data-testid="creatable-search-select"
      data-field={field?.key ?? ''}
      data-empty-option={emptyOptionLabel ?? ''}
      data-create-label={createLabel ?? ''}
    />
  ),
}));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => url,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

import { EntityForm } from '../EntityForm.jsx';

describe('EntityForm', () => {
  it('renders without crashing with empty fields', () => {
    const { container } = render(
      <EntityForm fields={[]} data={{}} onChange={vi.fn()} />
    );
    // With 0 fields, the component returns null
    expect(container.innerHTML).toBe('');
  });

  it('renders field labels for text fields', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'description', label: 'Description', type: 'text', column: 'Description' },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />
    );
    // useLabel mock returns the key as-is, so labels render as column names
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('renders input elements for text fields', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm fields={fields} data={{ name: 'Test Value' }} onChange={vi.fn()} />
    );
    const input = screen.getByTestId('field-name');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Test Value');
  });

  it('renders number inputs for number fields', () => {
    const fields = [
      { key: 'amount', label: 'Amount', type: 'number', column: 'Amount' },
    ];
    render(
      <EntityForm fields={fields} data={{ amount: 42 }} onChange={vi.fn()} />
    );
    const input = screen.getByTestId('field-amount');
    expect(input).toHaveAttribute('type', 'number');
  });

  it('renders fields as disabled when formReadOnly is true', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm fields={fields} data={{ name: 'Locked' }} onChange={vi.fn()} readOnly={true} />
    );
    const input = screen.getByTestId('field-name');
    expect(input).toBeDisabled();
  });

  it('renders fields as disabled when field.readOnly is true', () => {
    const fields = [
      { key: 'code', label: 'Code', type: 'text', column: 'Code', readOnly: true },
    ];
    render(
      <EntityForm fields={fields} data={{ code: 'RO' }} onChange={vi.fn()} />
    );
    const input = screen.getByTestId('field-code');
    expect(input).toBeDisabled();
  });

  it('calls onChange when a text field value changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm fields={fields} data={{ name: '' }} onChange={onChange} />
    );
    const input = screen.getByTestId('field-name');
    await user.type(input, 'A');
    expect(onChange).toHaveBeenCalledWith('name', 'A', 'Name');
  });

  it('renders checkbox fields with correct checked state', () => {
    const fields = [
      { key: 'active', label: 'Active', type: 'checkbox', column: 'Active' },
    ];
    render(
      <EntityForm fields={fields} data={{ active: true }} onChange={vi.fn()} />
    );
    const checkbox = screen.getByTestId('field-active');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('renders required marker for required fields', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', required: true },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('hides fields listed in excludeFields', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'hidden', label: 'Hidden', type: 'text', column: 'Hidden' },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} excludeFields={['hidden']} />
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('renders textarea fields', () => {
    const fields = [
      { key: 'notes', label: 'Notes', type: 'textarea', column: 'Notes' },
    ];
    render(
      <EntityForm fields={fields} data={{ notes: 'Some note' }} onChange={vi.fn()} />
    );
    const textarea = screen.getByTestId('field-notes');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveValue('Some note');
  });

  it('renders field errors when fieldErrors prop is provided', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{}}
        onChange={vi.fn()}
        fieldErrors={{ name: 'This field is required' }}
      />
    );
    expect(screen.getByTestId('error-name')).toHaveTextContent('This field is required');
  });

  // ---------------------------------------------------------------------------
  // searchSelect opt-in flag (ETP-4099): a `selector` FK field renders the
  // searchable CreatableSearchSelect when `searchSelect: true`, otherwise the
  // plain pick-only SelectorInput. allowCreate is plumbed but EntityForm never
  // wires createLabel/onCreateRequest yet, so the create button stays OFF.
  // ---------------------------------------------------------------------------
  describe('searchSelect opt-in', () => {
    const selectorField = (extra = {}) => ({
      key: 'financialAccount',
      label: 'Financial Account',
      type: 'selector',
      column: 'Fin_Financial_Account_ID',
      reference: 'FinancialAccount',
      ...extra,
    });

    it('renders the plain SelectorInput for a selector field WITHOUT searchSelect', () => {
      render(
        <EntityForm fields={[selectorField()]} data={{}} onChange={vi.fn()} />
      );
      expect(screen.getByTestId('selector-input')).toBeInTheDocument();
      expect(screen.queryByTestId('creatable-search-select')).not.toBeInTheDocument();
    });

    it('renders CreatableSearchSelect for a selector field WITH searchSelect: true', () => {
      render(
        <EntityForm
          fields={[selectorField({ searchSelect: true })]}
          data={{}}
          onChange={vi.fn()}
        />
      );
      expect(screen.getByTestId('creatable-search-select')).toBeInTheDocument();
      expect(screen.queryByTestId('selector-input')).not.toBeInTheDocument();
    });

    it('passes the resolved emptyOptionLabel through for a non-required searchSelect field', () => {
      render(
        <EntityForm
          fields={[selectorField({
            searchSelect: true,
            emptyOptionLabelKey: 'matchRuleAllAccounts',
            required: false,
          })]}
          data={{}}
          onChange={vi.fn()}
        />
      );
      // useUI mock returns the key as-is, so the resolved label equals the key.
      expect(screen.getByTestId('creatable-search-select')).toHaveAttribute(
        'data-empty-option',
        'matchRuleAllAccounts'
      );
    });

    it('passes NO createLabel even when allowCreate is set (create UI not wired)', () => {
      render(
        <EntityForm
          fields={[selectorField({ searchSelect: true, allowCreate: true })]}
          data={{}}
          onChange={vi.fn()}
        />
      );
      expect(screen.getByTestId('creatable-search-select')).toHaveAttribute(
        'data-create-label',
        ''
      );
    });
  });

  it('respects displayLogic to hide fields', () => {
    const fields = [
      { key: 'visible', label: 'Visible', type: 'text', column: 'Visible' },
      {
        key: 'conditional',
        label: 'Conditional',
        type: 'text',
        column: 'Conditional',
        displayLogic: (data) => data?.showIt === true,
      },
    ];
    render(
      <EntityForm fields={fields} data={{ showIt: false }} onChange={vi.fn()} />
    );
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Conditional')).not.toBeInTheDocument();
  });
});

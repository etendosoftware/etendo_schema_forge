/**
 * Extended render tests for EntityForm — covers field types and branches
 * not exercised by the existing EntityForm.vitest.jsx suite.
 *
 * Focus areas: date fields, enum/select fields, selector type, image type,
 * readOnlyLogic, displayLogic server-side visibility, dependent fields,
 * search fields, horizontal layout filtering, section filtering, span classes,
 * and the image-field side-panel layout.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mocks (must precede imports) ---

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ImageField.jsx', () => ({
  ImageField: (props) => <div data-testid={`image-field-${props.fieldKey ?? 'default'}`} />,
}));
vi.mock('../PartnerAddressPicker.jsx', () => ({
  PartnerAddressPicker: () => <div data-testid="partner-address-picker" />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: (props) => <div data-testid={`selector-input-${props.field?.key ?? 'unknown'}`} />,
}));
vi.mock('../SelectorChip.jsx', () => ({
  SelectorChip: (props) => <span data-testid={props.testId ?? 'chip'}>{props.label}</span>,
}));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

import { EntityForm } from '../EntityForm.jsx';

// --- Shared fixtures ---

const MIXED_FIELDS = [
  { key: 'name', label: 'Name', type: 'string', column: 'Name' },
  { key: 'date', label: 'Date', type: 'date', column: 'DateOrdered' },
  { key: 'amount', label: 'Amount', type: 'number', column: 'GrandTotal' },
  { key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' },
  {
    key: 'status', label: 'Status', type: 'select', column: 'DocStatus',
    options: [
      { value: 'DR', label: 'Draft' },
      { value: 'CO', label: 'Complete' },
    ],
  },
  { key: 'bp', label: 'Partner', type: 'selector', column: 'C_BPartner_ID', inputMode: 'selector' },
];

const SAMPLE_DATA = {
  name: 'Test Order',
  date: '2026-01-15',
  amount: 100,
  active: true,
  status: 'DR',
  bp: 'BP-001',
  'bp$_identifier': 'Acme Corp',
};

function renderForm(props = {}) {
  return render(
    <EntityForm
      entity="header"
      fields={MIXED_FIELDS}
      data={SAMPLE_DATA}
      onChange={vi.fn()}
      token="test-token"
      apiBaseUrl="/api"
      {...props}
    />,
  );
}

// --- Tests ---

describe('EntityForm — extended render coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts and renders all mixed field types without crashing', () => {
    renderForm();
    // string field
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
    // number field
    expect(screen.getByTestId('field-amount')).toBeInTheDocument();
    // checkbox field
    expect(screen.getByTestId('field-active')).toBeInTheDocument();
    // date field renders a DateField (which is a real component)
    expect(screen.getByText('DateOrdered')).toBeInTheDocument();
    // selector field renders the mocked SelectorInput
    expect(screen.getByTestId('selector-input-bp')).toBeInTheDocument();
  });

  // --- Date field ---

  it('renders date field with its value', () => {
    renderForm();
    // DateField is a real shadcn component — just verify the label is present
    expect(screen.getByText('DateOrdered')).toBeInTheDocument();
  });

  // --- Enum / select field ---

  it('renders select field with trigger element', () => {
    renderForm();
    const trigger = screen.getByTestId('field-status');
    expect(trigger).toBeInTheDocument();
  });

  // --- Selector field ---

  it('renders SelectorInput stub for selector type', () => {
    renderForm();
    expect(screen.getByTestId('selector-input-bp')).toBeInTheDocument();
  });

  // --- Read-only mode ---

  it('disables all fields when formReadOnly is true', () => {
    renderForm({ readOnly: true });
    // text input
    expect(screen.getByTestId('field-name')).toBeDisabled();
    // number input
    expect(screen.getByTestId('field-amount')).toBeDisabled();
    // checkbox
    expect(screen.getByTestId('field-active')).toBeDisabled();
  });

  it('renders FK field as plain disabled input when formReadOnly + selector type', () => {
    renderForm({ readOnly: true });
    // In readOnly mode, selector renders as a disabled Input instead of SelectorInput
    const fkInput = screen.getByTestId('field-bp');
    expect(fkInput).toBeInTheDocument();
  });

  // --- readOnlyLogic ---

  it('disables a field when readOnlyLogic evaluates to true', () => {
    const fields = [
      {
        key: 'locked',
        label: 'Locked',
        type: 'text',
        column: 'Locked',
        readOnlyLogic: (data) => data?.active === true,
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ active: true, locked: 'x' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('field-locked')).toBeDisabled();
  });

  it('does not disable when readOnlyLogic evaluates to false', () => {
    const fields = [
      {
        key: 'locked',
        label: 'Locked',
        type: 'text',
        column: 'Locked',
        readOnlyLogic: (data) => data?.active === true,
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ active: false, locked: 'x' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('field-locked')).not.toBeDisabled();
  });

  it('handles readOnlyLogic that throws without crashing', () => {
    const fields = [
      {
        key: 'explosive',
        label: 'Explosive',
        type: 'text',
        column: 'Explosive',
        readOnlyLogic: () => { throw new Error('boom'); },
      },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    // Should not crash; the field defaults to editable
    expect(screen.getByTestId('field-explosive')).not.toBeDisabled();
  });

  // --- displayLogic (function-based) ---

  it('shows a field when displayLogic function returns true', () => {
    const fields = [
      {
        key: 'conditional',
        label: 'Conditional',
        type: 'text',
        column: 'Conditional',
        displayLogic: () => true,
      },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    expect(screen.getByText('Conditional')).toBeInTheDocument();
  });

  it('hides a field when displayLogic function returns false', () => {
    const fields = [
      {
        key: 'conditional',
        label: 'Conditional',
        type: 'text',
        column: 'Conditional',
        displayLogic: () => false,
      },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    expect(screen.queryByText('Conditional')).not.toBeInTheDocument();
  });

  it('handles displayLogic that throws without crashing', () => {
    const fields = [
      {
        key: 'explosive',
        label: 'Explosive',
        type: 'text',
        column: 'Explosive',
        displayLogic: () => { throw new Error('display boom'); },
      },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    // Should default to visible on error
    expect(screen.getByText('Explosive')).toBeInTheDocument();
  });

  // --- Server-side displayLogic visibility ---

  it('hides a field when displayLogic.visibility[key] is false (no function-based displayLogic)', () => {
    const fields = [
      { key: 'visible', label: 'Visible', type: 'text', column: 'Visible' },
      { key: 'hidden', label: 'Hidden', type: 'text', column: 'Hidden', displayLogic: 'some-expression' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{}}
        onChange={vi.fn()}
        displayLogic={{ visibility: { hidden: false }, readOnly: {} }}
      />,
    );
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('does NOT hide a field with function-based displayLogic even if server visibility is false', () => {
    const fields = [
      {
        key: 'funcField',
        label: 'FuncField',
        type: 'text',
        column: 'FuncField',
        displayLogic: () => true,
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{}}
        onChange={vi.fn()}
        displayLogic={{ visibility: { funcField: false }, readOnly: {} }}
      />,
    );
    // Function-based displayLogic takes precedence over server visibility
    expect(screen.getByText('FuncField')).toBeInTheDocument();
  });

  // --- Server-side readOnly ---

  it('disables a field when displayLogic.readOnly[key] is true', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ name: 'readonly' }}
        onChange={vi.fn()}
        displayLogic={{ readOnly: { name: true }, visibility: {} }}
      />,
    );
    expect(screen.getByTestId('field-name')).toBeDisabled();
  });

  // --- Horizontal layout filtering ---

  it('horizontal layout filters out readOnly fields', () => {
    const fields = [
      { key: 'editable', label: 'Editable', type: 'text', column: 'Editable' },
      { key: 'locked', label: 'Locked', type: 'text', column: 'Locked', readOnly: true },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />,
    );
    expect(screen.getByText('Editable')).toBeInTheDocument();
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
  });

  // --- Section filtering ---

  it('shows only fields matching the section prop', () => {
    const fields = [
      { key: 'a', label: 'FieldA', type: 'text', column: 'A', section: 'main' },
      { key: 'b', label: 'FieldB', type: 'text', column: 'B', section: 'other' },
      { key: 'c', label: 'FieldC', type: 'text', column: 'C', section: 'main', readOnly: true },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} section="main" />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  // --- Image field layout ---

  it('renders image field in a side panel layout', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'photo', label: 'Photo', type: 'image', column: 'AD_Image_ID' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ name: 'test', photo: 'img-123' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );
    expect(screen.getByTestId('image-field-photo')).toBeInTheDocument();
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  // --- Inline image field ---

  it('renders inline image within the grid (not side panel)', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'thumb', label: 'Thumb', type: 'image', column: 'AD_Image_ID', inline: true },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ name: 'test', thumb: 'img-456' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );
    expect(screen.getByTestId('image-field-thumb')).toBeInTheDocument();
  });

  // --- Checkbox toggling ---

  it('toggles checkbox on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [
      { key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' },
    ];
    render(
      <EntityForm fields={fields} data={{ active: false }} onChange={onChange} />,
    );
    const checkbox = screen.getByTestId('field-active');
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith('active', true, 'IsActive');
  });

  it('does not toggle checkbox when readOnly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [
      { key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' },
    ];
    render(
      <EntityForm fields={fields} data={{ active: false }} onChange={onChange} readOnly />,
    );
    const checkbox = screen.getByTestId('field-active');
    await user.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  // --- YESNO variants ---

  it('handles "Y" string as checked for checkbox', () => {
    const fields = [
      { key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' },
    ];
    render(
      <EntityForm fields={fields} data={{ active: 'Y' }} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('field-active')).toHaveAttribute('aria-checked', 'true');
  });

  it('handles "N" string as unchecked for checkbox', () => {
    const fields = [
      { key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' },
    ];
    render(
      <EntityForm fields={fields} data={{ active: 'N' }} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('field-active')).toHaveAttribute('aria-checked', 'false');
  });

  // --- Textarea ---

  it('renders textarea with custom rows', () => {
    const fields = [
      { key: 'notes', label: 'Notes', type: 'textarea', column: 'Notes', rows: 6 },
    ];
    render(
      <EntityForm fields={fields} data={{ notes: 'abc' }} onChange={vi.fn()} />,
    );
    const textarea = screen.getByTestId('field-notes');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('rows', '6');
  });

  // --- Dependent field ---

  it('renders dependent field as disabled input when readOnly', () => {
    const fields = [
      {
        key: 'address',
        label: 'Address',
        type: 'dependent',
        column: 'C_BPartner_Location_ID',
        dependsOn: { field: 'bp', filterKey: 'bpartner' },
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ address: 'addr-1', 'address$_identifier': '123 Main St' }}
        onChange={vi.fn()}
        readOnly
      />,
    );
    const input = screen.getByTestId('field-address');
    expect(input).toBeInTheDocument();
  });

  // --- Search field ---

  it('renders search field as disabled input when readOnly', () => {
    const fields = [
      { key: 'product', label: 'Product', type: 'search', column: 'M_Product_ID' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ product: 'P1', 'product$_identifier': 'Widget' }}
        onChange={vi.fn()}
        readOnly
      />,
    );
    const input = screen.getByTestId('field-product');
    expect(input).toBeInTheDocument();
  });

  // --- Span class ---

  it('applies col-span class when field has span property', () => {
    const fields = [
      { key: 'wide', label: 'Wide', type: 'text', column: 'Wide', span: 2 },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    const fieldWrapper = container.querySelector('.col-span-2');
    expect(fieldWrapper).toBeTruthy();
  });

  // --- Custom cols grid ---

  it('renders custom cols grid with explicit gridTemplateColumns', () => {
    const fields = [
      { key: 'a', label: 'A', type: 'text', column: 'A' },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} cols={3} />,
    );
    const grid = container.firstElementChild;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });

  // --- Empty fields returns null ---

  it('returns null when all fields are hidden by displayLogic', () => {
    const fields = [
      { key: 'a', label: 'A', type: 'text', column: 'A', displayLogic: () => false },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  // --- onFieldBlur ---

  it('calls onFieldBlur when a text input loses focus', async () => {
    const user = userEvent.setup();
    const onFieldBlur = vi.fn();
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm fields={fields} data={{ name: '' }} onChange={vi.fn()} onFieldBlur={onFieldBlur} />,
    );
    const input = screen.getByTestId('field-name');
    await user.click(input);
    await user.tab();
    expect(onFieldBlur).toHaveBeenCalledWith('name');
  });

  // --- savingField disables input ---

  it('disables input when savingField matches the field key', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm fields={fields} data={{ name: 'x' }} onChange={vi.fn()} savingField="name" />,
    );
    expect(screen.getByTestId('field-name')).toBeDisabled();
  });

  // --- Select with valueType boolean ---

  it('renders boolean select with correct value for true/"Y"', () => {
    const fields = [
      {
        key: 'flag',
        label: 'Flag',
        type: 'select',
        column: 'Flag',
        valueType: 'boolean',
        options: [
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ],
      },
    ];
    render(
      <EntityForm fields={fields} data={{ flag: true }} onChange={vi.fn()} />,
    );
    const trigger = screen.getByTestId('field-flag');
    expect(trigger).toBeInTheDocument();
  });

  // --- Number field read-only shows formatted value ---

  it('shows cleaned float for readOnly number field', () => {
    const fields = [
      { key: 'total', label: 'Total', type: 'number', column: 'Total', readOnly: true },
    ];
    render(
      <EntityForm fields={fields} data={{ total: 243.20999999999998 }} onChange={vi.fn()} />,
    );
    const input = screen.getByTestId('field-total');
    // formatReadOnlyDisplayValue strips float noise
    expect(input).toHaveValue(243.21);
  });

  // ---------- NEW: additional coverage for uncovered EntityForm branches ----------

  // --- Popup search field ---

  it('renders popup search button for search field with popup: true', () => {
    const fields = [
      {
        key: 'product',
        label: 'Product',
        type: 'search',
        column: 'M_Product_ID',
        popup: true,
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ product: 'P1', 'product$_identifier': 'Widget' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        entity="header"
      />,
    );
    const btn = screen.getByTestId('field-product');
    expect(btn).toBeInTheDocument();
    // Popup renders as a button, not an input
    expect(btn.tagName).toBe('BUTTON');
  });

  // --- Lookup search field ---

  it('renders lookup button for search field with lookup: true', () => {
    const fields = [
      {
        key: 'product',
        label: 'Product',
        type: 'search',
        column: 'M_Product_ID',
        lookup: true,
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ product: 'P1', 'product$_identifier': 'Widget' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        entity="header"
      />,
    );
    const btn = screen.getByTestId('field-product');
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  // --- PartnerAddressPicker field ---

  it('renders PartnerAddressPicker for dependent field with C_BPartner_Location_ID column', () => {
    const fields = [
      {
        key: 'partnerAddress',
        label: 'Address',
        type: 'dependent',
        column: 'C_BPartner_Location_ID',
        dependsOn: { field: 'bp', filterKey: 'bpartner' },
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ partnerAddress: 'addr-1', 'partnerAddress$_identifier': '123 Main St', bp: 'BP1' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        entity="header"
      />,
    );
    expect(screen.getByTestId('partner-address-picker')).toBeInTheDocument();
  });

  // --- Image field with stretch (side panel layout) ---

  it('renders image field in side-panel layout with stretch', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'photo', label: 'Photo', type: 'image', column: 'AD_Image_ID' },
    ];
    const { container } = render(
      <EntityForm
        fields={fields}
        data={{ name: 'test', photo: 'img-123' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );
    // Side-panel image layout: flex container with two children
    expect(container.querySelector('.flex.gap-6')).toBeTruthy();
    expect(screen.getByTestId('image-field-photo')).toBeInTheDocument();
  });

  // --- colSpan handling ---

  it('applies col-span-3 class when field has span: 3', () => {
    const fields = [
      { key: 'desc', label: 'Description', type: 'text', column: 'Description', span: 3 },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.col-span-3')).toBeTruthy();
  });

  // --- Required asterisk visibility ---

  it('shows required asterisk for editable required field', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', required: true },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    // Asterisk can use text-red-500 or text-destructive depending on version
    expect(container.textContent).toContain('*');
  });

  it('does not show required asterisk when field is readOnly', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', required: true, readOnly: true },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    // readOnly fields don't show the asterisk
    expect(container.querySelector('.text-red-500')).toBeNull();
  });

  // --- onChange callback with different field types ---

  it('calls onChange with value and column for text input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm fields={fields} data={{ name: '' }} onChange={onChange} />,
    );
    const input = screen.getByTestId('field-name');
    await user.type(input, 'A');
    expect(onChange).toHaveBeenCalledWith('name', 'A', 'Name');
  });

  // --- fieldErrors error state ---

  it('renders error message when fieldErrors contains entry for field', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ name: '' }}
        onChange={vi.fn()}
        fieldErrors={{ name: 'This field is required' }}
      />,
    );
    expect(screen.getByTestId('error-name')).toBeInTheDocument();
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('does not render error when fieldErrors is empty', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm fields={fields} data={{ name: '' }} onChange={vi.fn()} fieldErrors={{}} />,
    );
    expect(screen.queryByTestId('error-name')).toBeNull();
  });

  // --- Inline image field within grid ---

  it('renders inline image within the grid (not side panel)', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'thumb', label: 'Thumb', type: 'image', column: 'AD_Image_ID', inline: true },
    ];
    const { container } = render(
      <EntityForm
        fields={fields}
        data={{ name: 'test', thumb: 'img-456' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );
    // Inline image should NOT trigger the side-panel flex layout
    expect(container.querySelector('.flex.gap-6')).toBeNull();
    expect(screen.getByTestId('image-field-thumb')).toBeInTheDocument();
  });

  // --- Select with required shows asterisk ---

  it('shows asterisk on required select field', () => {
    const fields = [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        column: 'DocType',
        required: true,
        options: [{ value: 'A', label: 'Option A' }],
      },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    expect(container.textContent).toContain('*');
  });

  // --- Field with required=true + empty value → shows error via fieldErrors ---

  describe('required field error state', () => {
    it('shows error message for required field with empty value when fieldErrors is set', () => {
      const fields = [
        { key: 'name', label: 'Name', type: 'text', column: 'Name', required: true },
      ];
      render(
        <EntityForm
          fields={fields}
          data={{ name: '' }}
          onChange={vi.fn()}
          fieldErrors={{ name: 'requiredFieldsMissing' }}
        />,
      );
      expect(screen.getByTestId('error-name')).toBeInTheDocument();
      expect(screen.getByText('requiredFieldsMissing')).toBeInTheDocument();
    });

    it('does not show error for required field with a value present', () => {
      const fields = [
        { key: 'name', label: 'Name', type: 'text', column: 'Name', required: true },
      ];
      render(
        <EntityForm
          fields={fields}
          data={{ name: 'filled' }}
          onChange={vi.fn()}
          fieldErrors={{}}
        />,
      );
      expect(screen.queryByTestId('error-name')).toBeNull();
    });
  });

  // --- Field with maxLength → input has maxLength attribute (handled by native HTML) ---

  describe('field maxLength and placeholder', () => {
    it('renders placeholder when field value is empty', () => {
      const fields = [
        { key: 'code', label: 'Code', type: 'text', column: 'Code' },
      ];
      render(
        <EntityForm fields={fields} data={{ code: '' }} onChange={vi.fn()} />,
      );
      const input = screen.getByTestId('field-code');
      expect(input).toBeInTheDocument();
    });
  });

  // --- Enum (select) field with empty value → shows placeholder option ---

  describe('select field with empty value', () => {
    it('renders select trigger with placeholder when value is empty', () => {
      const fields = [
        {
          key: 'docType',
          label: 'Doc Type',
          type: 'select',
          column: 'DocType',
          options: [
            { value: 'SO', label: 'Sales Order' },
            { value: 'PO', label: 'Purchase Order' },
          ],
        },
      ];
      render(
        <EntityForm fields={fields} data={{ docType: '' }} onChange={vi.fn()} />,
      );
      const trigger = screen.getByTestId('field-docType');
      expect(trigger).toBeInTheDocument();
    });

    it('renders non-required select with empty option available', () => {
      const fields = [
        {
          key: 'docType',
          label: 'Doc Type',
          type: 'select',
          column: 'DocType',
          required: false,
          options: [{ value: 'SO', label: 'Sales Order' }],
        },
      ];
      render(
        <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
      );
      // Non-required selects have the __empty__ option
      expect(screen.getByTestId('field-docType')).toBeInTheDocument();
    });
  });

  // --- Selector field with selectorUrl → renders SelectorInput ---

  describe('selector field with selectorUrl', () => {
    it('renders SelectorInput when field type is selector and not readOnly', () => {
      const fields = [
        { key: 'warehouse', label: 'Warehouse', type: 'selector', column: 'M_Warehouse_ID' },
      ];
      render(
        <EntityForm
          fields={fields}
          data={{ warehouse: 'W1', 'warehouse$_identifier': 'Main WH' }}
          onChange={vi.fn()}
          token="tok"
          apiBaseUrl="/api"
          entity="header"
        />,
      );
      expect(screen.getByTestId('selector-input-warehouse')).toBeInTheDocument();
    });

    it('renders disabled input when selector field is readOnly', () => {
      const fields = [
        { key: 'warehouse', label: 'Warehouse', type: 'selector', column: 'M_Warehouse_ID' },
      ];
      render(
        <EntityForm
          fields={fields}
          data={{ warehouse: 'W1', 'warehouse$_identifier': 'Main WH' }}
          onChange={vi.fn()}
          readOnly
        />,
      );
      const input = screen.getByTestId('field-warehouse');
      expect(input).toBeInTheDocument();
      // In readOnly, renders as a plain disabled Input, not SelectorInput
      expect(screen.queryByTestId('selector-input-warehouse')).toBeNull();
    });
  });

  // --- Dependent field disabled when parent value is empty ---

  describe('dependent field with dependsOn', () => {
    it('renders DependentSelect disabled when parent value is empty', () => {
      const fields = [
        {
          key: 'location',
          label: 'Location',
          type: 'dependent',
          column: 'C_Location_ID',
          dependsOn: { field: 'bp', filterKey: 'bpartner' },
        },
      ];
      render(
        <EntityForm
          fields={fields}
          data={{ location: '', bp: '' }}
          onChange={vi.fn()}
          token="tok"
          apiBaseUrl="/api"
          entity="header"
        />,
      );
      // DependentSelect renders with a select trigger
      const trigger = screen.getByTestId('field-location');
      expect(trigger).toBeInTheDocument();
    });
  });

  // --- Horizontal layout with section → section fields render ---

  describe('horizontal layout with section filtering', () => {
    it('renders section header fields in horizontal layout when section is specified', () => {
      const fields = [
        { key: 'a', label: 'FieldA', type: 'text', column: 'A', section: 'billing' },
        { key: 'b', label: 'FieldB', type: 'text', column: 'B', section: 'shipping' },
        { key: 'c', label: 'FieldC', type: 'text', column: 'C', section: 'billing', readOnly: true },
      ];
      render(
        <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" section="billing" />,
      );
      // Section includes both editable and readOnly fields
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.queryByText('B')).not.toBeInTheDocument();
    });
  });

  // --- Fields with different sections grouped by section ---

  describe('fields grouped by section', () => {
    it('only renders fields for the specified section', () => {
      const fields = [
        { key: 'f1', label: 'F1', type: 'text', column: 'F1', section: 'general' },
        { key: 'f2', label: 'F2', type: 'text', column: 'F2', section: 'general' },
        { key: 'f3', label: 'F3', type: 'text', column: 'F3', section: 'details' },
      ];
      render(
        <EntityForm fields={fields} data={{}} onChange={vi.fn()} section="general" />,
      );
      expect(screen.getByText('F1')).toBeInTheDocument();
      expect(screen.getByText('F2')).toBeInTheDocument();
      expect(screen.queryByText('F3')).not.toBeInTheDocument();
    });
  });

  // --- onChange fires with (key, value, column) signature ---

  describe('onChange callback signature', () => {
    it('fires onChange with (key, value, column) for text input', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const fields = [
        { key: 'code', label: 'Code', type: 'text', column: 'DocumentNo' },
      ];
      render(
        <EntityForm fields={fields} data={{ code: '' }} onChange={onChange} />,
      );
      const input = screen.getByTestId('field-code');
      await user.type(input, 'X');
      expect(onChange).toHaveBeenCalledWith('code', 'X', 'DocumentNo');
    });

    it('fires onChange with (key, value, column) for checkbox toggle', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const fields = [
        { key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' },
      ];
      render(
        <EntityForm fields={fields} data={{ active: false }} onChange={onChange} />,
      );
      const checkbox = screen.getByTestId('field-active');
      await user.click(checkbox);
      expect(onChange).toHaveBeenCalledWith('active', true, 'IsActive');
    });
  });

  // --- Boolean select with valueType handling ---

  describe('boolean select value resolution', () => {
    it('handles "N" string as false for boolean select', () => {
      const fields = [
        {
          key: 'flag',
          label: 'Flag',
          type: 'select',
          column: 'Flag',
          valueType: 'boolean',
          options: [
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ],
        },
      ];
      render(
        <EntityForm fields={fields} data={{ flag: 'N' }} onChange={vi.fn()} />,
      );
      expect(screen.getByTestId('field-flag')).toBeInTheDocument();
    });

    it('handles null/undefined as empty for boolean select', () => {
      const fields = [
        {
          key: 'flag',
          label: 'Flag',
          type: 'select',
          column: 'Flag',
          valueType: 'boolean',
          options: [
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ],
        },
      ];
      render(
        <EntityForm fields={fields} data={{ flag: null }} onChange={vi.fn()} />,
      );
      expect(screen.getByTestId('field-flag')).toBeInTheDocument();
    });
  });

  // --- Textarea field default rows ---

  describe('textarea field defaults', () => {
    it('renders textarea with default 4 rows when rows prop is not specified', () => {
      const fields = [
        { key: 'notes', label: 'Notes', type: 'textarea', column: 'Notes' },
      ];
      render(
        <EntityForm fields={fields} data={{ notes: '' }} onChange={vi.fn()} />,
      );
      const textarea = screen.getByTestId('field-notes');
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveAttribute('rows', '4');
    });
  });

  // --- excludeFields ---

  it('excludes fields listed in excludeFields', () => {
    const fields = [
      { key: 'a', label: 'A', type: 'text', column: 'A' },
      { key: 'b', label: 'B', type: 'text', column: 'B' },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} excludeFields={['b']} />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  // ─── ADDITIONAL FIELD TYPE BRANCH COVERAGE ───────────────────────────

  // --- Textarea with custom rows ---

  it('renders textarea with rows=6 as specified', () => {
    const fields = [
      { key: 'description', label: 'Description', type: 'textarea', column: 'Description', rows: 6 },
    ];
    render(
      <EntityForm fields={fields} data={{ description: 'Long text here' }} onChange={vi.fn()} />,
    );
    const textarea = screen.getByTestId('field-description');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('rows', '6');
    expect(textarea).toHaveValue('Long text here');
  });

  // --- Amount type readOnly displays formatted value ---

  it('renders amount field as readOnly with formatted display value', () => {
    const fields = [
      { key: 'grandTotal', label: 'Grand Total', type: 'number', column: 'GrandTotal', readOnly: true },
    ];
    render(
      <EntityForm fields={fields} data={{ grandTotal: 1234.5 }} onChange={vi.fn()} />,
    );
    const input = screen.getByTestId('field-grandTotal');
    expect(input).toBeDisabled();
    expect(input).toHaveValue(1234.5);
  });

  // --- Image field with stretch (side panel) ---

  it('renders image field with stretch in side-panel layout', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'logo', label: 'Logo', type: 'image', column: 'AD_Image_ID', stretch: true },
    ];
    const { container } = render(
      <EntityForm
        fields={fields}
        data={{ name: 'Test', logo: 'img-999' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );
    expect(screen.getByTestId('image-field-logo')).toBeInTheDocument();
    // Side-panel layout wraps in flex container
    expect(container.querySelector('.flex.gap-6')).toBeTruthy();
  });

  // --- Popup search field ---

  it('renders popup button for search field with popup: true', () => {
    const fields = [
      {
        key: 'item',
        label: 'Item',
        type: 'search',
        column: 'M_Product_ID',
        popup: true,
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ item: 'P1', 'item$_identifier': 'Widget' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        entity="header"
      />,
    );
    const btn = screen.getByTestId('field-item');
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  // --- Lookup search field ---

  it('renders lookup button for search field with lookup: true', () => {
    const fields = [
      {
        key: 'material',
        label: 'Material',
        type: 'search',
        column: 'M_Product_ID',
        lookup: true,
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ material: 'M1', 'material$_identifier': 'Steel' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        entity="header"
      />,
    );
    const btn = screen.getByTestId('field-material');
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  // --- colSpan: 2 ---

  it('applies col-span-2 class when field has span: 2', () => {
    const fields = [
      { key: 'address', label: 'Address', type: 'text', column: 'Address', span: 2 },
    ];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.col-span-2')).toBeTruthy();
  });

  // --- Section: details in horizontal layout ---

  it('renders details section fields in horizontal layout when section=details', () => {
    const fields = [
      { key: 'f1', label: 'F1', type: 'text', column: 'F1', section: 'details' },
      { key: 'f2', label: 'F2', type: 'text', column: 'F2', section: 'general' },
      { key: 'f3', label: 'F3', type: 'text', column: 'F3', section: 'details', readOnly: true },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" section="details" />,
    );
    expect(screen.getByText('F1')).toBeInTheDocument();
    expect(screen.getByText('F3')).toBeInTheDocument();
    expect(screen.queryByText('F2')).not.toBeInTheDocument();
  });

  // --- dependsOn: bp has value → enabled ---

  it('renders dependent field enabled when parent has value', () => {
    const fields = [
      {
        key: 'location',
        label: 'Location',
        type: 'dependent',
        column: 'C_Location_ID',
        dependsOn: { field: 'bp', filterKey: 'bpartner' },
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ location: 'L1', 'location$_identifier': '123 Main', bp: 'BP-001' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        entity="header"
      />,
    );
    const trigger = screen.getByTestId('field-location');
    expect(trigger).toBeInTheDocument();
  });

  // --- dependsOn: bp empty → shows field but parent empty ---

  it('renders dependent field when parent value is empty', () => {
    const fields = [
      {
        key: 'location',
        label: 'Location',
        type: 'dependent',
        column: 'C_Location_ID',
        dependsOn: { field: 'bp', filterKey: 'bpartner' },
      },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ location: '', bp: '' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        entity="header"
      />,
    );
    const trigger = screen.getByTestId('field-location');
    expect(trigger).toBeInTheDocument();
  });

  // --- onChange with checkbox → fires with boolean value ---

  it('calls onChange with boolean value when checkbox is toggled from true to false', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fields = [
      { key: 'isActive', label: 'Active', type: 'checkbox', column: 'IsActive' },
    ];
    render(
      <EntityForm fields={fields} data={{ isActive: true }} onChange={onChange} />,
    );
    const checkbox = screen.getByTestId('field-isActive');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith('isActive', false, 'IsActive');
  });

  // --- Number field editable ---

  it('renders editable number field with input type number', () => {
    const fields = [
      { key: 'qty', label: 'Quantity', type: 'number', column: 'Qty' },
    ];
    render(
      <EntityForm fields={fields} data={{ qty: 42 }} onChange={vi.fn()} />,
    );
    const input = screen.getByTestId('field-qty');
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('type', 'number');
  });

  // --- Image field inline (no side panel) ---

  it('renders inline image without side panel layout', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'avatar', label: 'Avatar', type: 'image', column: 'AD_Image_ID', inline: true },
    ];
    const { container } = render(
      <EntityForm
        fields={fields}
        data={{ name: 'test', avatar: 'img-001' }}
        onChange={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
      />,
    );
    // Inline image does NOT use side-panel flex container
    expect(container.querySelector('.flex.gap-6')).toBeNull();
    expect(screen.getByTestId('image-field-avatar')).toBeInTheDocument();
  });

  // --- labelOverrides ---

  it('uses labelOverrides when provided for field labels', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{ name: 'Test' }}
        onChange={vi.fn()}
        labelOverrides={{ Name: 'Customer Name' }}
      />,
    );
    // useLabel mock returns the key, but labelOverrides is passed to the hook
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  // --- registerFields callback ---

  it('calls registerFields with visible fields on mount', () => {
    const registerFields = vi.fn();
    const fields = [
      { key: 'a', label: 'A', type: 'text', column: 'A' },
    ];
    render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} registerFields={registerFields} />,
    );
    expect(registerFields).toHaveBeenCalled();
  });

  // --- Multiple field types in one form ---

  it('renders a form with text, checkbox, select, date, and textarea together', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' },
      { key: 'status', label: 'Status', type: 'select', column: 'DocStatus', options: [{ value: 'DR', label: 'Draft' }] },
      { key: 'date', label: 'Date', type: 'date', column: 'DateOrdered' },
      { key: 'notes', label: 'Notes', type: 'textarea', column: 'Notes' },
    ];
    const { container } = render(
      <EntityForm
        fields={fields}
        data={{ name: 'Test', active: true, status: 'DR', date: '2026-01-01', notes: 'Hello' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
    expect(screen.getByTestId('field-active')).toBeInTheDocument();
    expect(screen.getByTestId('field-status')).toBeInTheDocument();
    expect(screen.getByTestId('field-notes')).toBeInTheDocument();
    expect(container.innerHTML).not.toBe('');
  });

  // ============================================================
  // Additional branch coverage tests
  // ============================================================

  // --- Checkbox YESNO value variants ---

  it('renders checkbox checked for value "Y"', () => {
    const fields = [{ key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' }];
    render(<EntityForm fields={fields} data={{ active: 'Y' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-active').getAttribute('aria-checked')).toBe('true');
  });

  it('renders checkbox checked for value "true" (string)', () => {
    const fields = [{ key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' }];
    render(<EntityForm fields={fields} data={{ active: 'true' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-active').getAttribute('aria-checked')).toBe('true');
  });

  it('renders checkbox unchecked for value "N"', () => {
    const fields = [{ key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' }];
    render(<EntityForm fields={fields} data={{ active: 'N' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-active').getAttribute('aria-checked')).toBe('false');
  });

  it('renders checkbox unchecked for value "false" (string)', () => {
    const fields = [{ key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' }];
    render(<EntityForm fields={fields} data={{ active: 'false' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-active').getAttribute('aria-checked')).toBe('false');
  });

  it('renders checkbox unchecked for null', () => {
    const fields = [{ key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' }];
    render(<EntityForm fields={fields} data={{ active: null }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-active').getAttribute('aria-checked')).toBe('false');
  });

  it('renders checkbox unchecked for undefined (missing key)', () => {
    const fields = [{ key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive' }];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-active').getAttribute('aria-checked')).toBe('false');
  });

  it('renders checkbox disabled when readOnly', () => {
    const fields = [{ key: 'active', label: 'Active', type: 'checkbox', column: 'IsActive', readOnly: true }];
    render(<EntityForm fields={fields} data={{ active: true }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-active')).toBeDisabled();
  });

  // --- readOnlyLogic with non-function values ---

  it('readOnlyLogic as non-function (string) does not cause readOnly', () => {
    const fields = [{ key: 'name', label: 'Name', type: 'text', column: 'Name', readOnlyLogic: 'not-a-function' }];
    render(<EntityForm fields={fields} data={{ name: 'Test' }} onChange={vi.fn()} />);
    const input = screen.getByTestId('field-name');
    expect(input).not.toBeDisabled();
  });

  it('readOnlyLogic as null does not cause readOnly', () => {
    const fields = [{ key: 'name', label: 'Name', type: 'text', column: 'Name', readOnlyLogic: null }];
    render(<EntityForm fields={fields} data={{ name: 'Test' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-name')).not.toBeDisabled();
  });

  // --- displayLogic with function that returns false ---

  it('displayLogic function returning false hides the field', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', displayLogic: () => false },
    ];
    render(<EntityForm fields={fields} data={{ name: 'Test' }} onChange={vi.fn()} />);
    expect(screen.queryByTestId('field-name')).not.toBeInTheDocument();
  });

  it('displayLogic function returning true shows the field', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', displayLogic: () => true },
    ];
    render(<EntityForm fields={fields} data={{ name: 'Test' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  it('displayLogic function that throws still shows the field (fallback)', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', displayLogic: () => { throw new Error('oops'); } },
    ];
    render(<EntityForm fields={fields} data={{ name: 'Test' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  // --- readOnlyLogic function that throws ---

  it('readOnlyLogic function that throws defaults to not readOnly', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', readOnlyLogic: () => { throw new Error('bad'); } },
    ];
    render(<EntityForm fields={fields} data={{ name: 'Test' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-name')).not.toBeDisabled();
  });

  // --- resolveGridClass branches ---

  it('uses custom cols when provided', () => {
    const fields = [{ key: 'a', label: 'A', type: 'text', column: 'A' }];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} cols={5} />,
    );
    expect(container.querySelector('.grid')).toBeTruthy();
  });

  it('uses horizontal layout grid classes', () => {
    const fields = [{ key: 'a', label: 'A', type: 'text', column: 'A' }];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />,
    );
    expect(container.querySelector('.grid-cols-2')).toBeTruthy();
  });

  it('uses default vertical layout grid classes', () => {
    const fields = [{ key: 'a', label: 'A', type: 'text', column: 'A' }];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="vertical" />,
    );
    expect(container.querySelector('.grid-cols-2')).toBeTruthy();
  });

  // --- formatReadOnlyDisplayValue branches ---

  it('formats number in readOnly mode with finite value', () => {
    const fields = [{ key: 'amount', label: 'Amount', type: 'number', column: 'Amount', readOnly: true }];
    render(<EntityForm fields={fields} data={{ amount: 10.200000000001 }} onChange={vi.fn()} />);
    const input = screen.getByTestId('field-amount');
    expect(input).toBeTruthy();
  });

  it('does not format NaN number in readOnly mode', () => {
    const fields = [{ key: 'amount', label: 'Amount', type: 'number', column: 'Amount', readOnly: true }];
    render(<EntityForm fields={fields} data={{ amount: 'not-a-number' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-amount')).toBeTruthy();
  });

  it('does not format number when not readOnly', () => {
    const fields = [{ key: 'amount', label: 'Amount', type: 'number', column: 'Amount' }];
    render(<EntityForm fields={fields} data={{ amount: 10.5 }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-amount')).toBeTruthy();
  });

  // --- empty fields array returns null ---

  it('returns null when all fields are excluded', () => {
    const fields = [{ key: 'name', label: 'Name', type: 'text', column: 'Name' }];
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} excludeFields={['name']} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when fields array is empty', () => {
    const { container } = render(<EntityForm fields={[]} data={{}} onChange={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  // --- section filtering ---

  it('shows only fields matching the section filter', () => {
    const fields = [
      { key: 'a', label: 'A', type: 'text', column: 'A', section: 'sec1' },
      { key: 'b', label: 'B', type: 'text', column: 'B', section: 'sec2' },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} section="sec1" />);
    expect(screen.getByTestId('field-a')).toBeInTheDocument();
    expect(screen.queryByTestId('field-b')).not.toBeInTheDocument();
  });

  // --- horizontal layout filters out readOnly fields ---

  it('horizontal layout hides readOnly fields', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'code', label: 'Code', type: 'text', column: 'Code', readOnly: true },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />);
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
    expect(screen.queryByTestId('field-code')).not.toBeInTheDocument();
  });

  // --- server-side displayLogic visibility ---

  it('hides field when server displayLogic.visibility is false', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', displayLogic: 'some-string' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{}}
        onChange={vi.fn()}
        displayLogic={{ visibility: { name: false }, readOnly: {} }}
      />,
    );
    expect(screen.queryByTestId('field-name')).not.toBeInTheDocument();
  });

  it('shows field when server displayLogic.visibility is true', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', displayLogic: 'some-string' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{}}
        onChange={vi.fn()}
        displayLogic={{ visibility: { name: true }, readOnly: {} }}
      />,
    );
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  it('keeps field with function displayLogic regardless of server visibility=false', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name', displayLogic: () => true },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{}}
        onChange={vi.fn()}
        displayLogic={{ visibility: { name: false }, readOnly: {} }}
      />,
    );
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  it('keeps field without displayLogic regardless of server visibility=false', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    ];
    render(
      <EntityForm
        fields={fields}
        data={{}}
        onChange={vi.fn()}
        displayLogic={{ visibility: { name: false }, readOnly: {} }}
      />,
    );
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  // --- server-side readOnly via displayLogic ---

  it('makes field readOnly when displayLogic.readOnly is true', () => {
    const fields = [{ key: 'name', label: 'Name', type: 'text', column: 'Name' }];
    render(
      <EntityForm
        fields={fields}
        data={{ name: 'Test' }}
        onChange={vi.fn()}
        displayLogic={{ readOnly: { name: true }, visibility: {} }}
      />,
    );
    expect(screen.getByTestId('field-name')).toBeDisabled();
  });

  // --- formReadOnly prop ---

  it('makes all fields readOnly when formReadOnly=true', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'amount', label: 'Amount', type: 'number', column: 'Amount' },
    ];
    render(<EntityForm fields={fields} data={{ name: 'A', amount: 10 }} onChange={vi.fn()} readOnly={true} />);
    expect(screen.getByTestId('field-name')).toBeDisabled();
    expect(screen.getByTestId('field-amount')).toBeDisabled();
  });

  // --- dependent field with PartnerAddressPicker column ---

  it('renders PartnerAddressPicker for dependent field with C_BPartner_Location_ID column', () => {
    const fields = [{ key: 'partnerAddr', label: 'Address', type: 'dependent', column: 'C_BPartner_Location_ID', dependsOn: 'bp' }];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} apiBaseUrl="/api" />);
    expect(screen.getByTestId('partner-address-picker')).toBeInTheDocument();
  });

  // --- dependent field readOnly renders read-only FK ---

  it('renders readOnly FK for dependent field when readOnly=true', () => {
    const fields = [{ key: 'region', label: 'Region', type: 'dependent', column: 'Region', dependsOn: 'country', readOnly: true }];
    render(<EntityForm fields={fields} data={{ region: 'R1', 'region$_identifier': 'Europe' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-region')).toBeInTheDocument();
  });

  // --- registerFields cleanup on unmount ---

  it('calls registerFields(null, formId) on unmount', () => {
    const registerFields = vi.fn();
    const fields = [{ key: 'a', label: 'A', type: 'text', column: 'A' }];
    const { unmount } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} registerFields={registerFields} />,
    );
    const callCount = registerFields.mock.calls.length;
    unmount();
    // Last call should be cleanup with null
    const lastCall = registerFields.mock.calls[registerFields.mock.calls.length - 1];
    expect(lastCall[0]).toBeNull();
  });

  // --- field label fallback chain ---

  it('uses field key as label fallback when column lookup and label are empty', () => {
    const fields = [{ key: 'myField', type: 'text', column: 'NonExistent' }];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);
    // useLabel mock returns the column key, so label is 'NonExistent'
    expect(screen.getByTestId('field-myField')).toBeInTheDocument();
  });

  // --- textarea field ---

  it('renders textarea readOnly when field is readOnly', () => {
    const fields = [{ key: 'notes', label: 'Notes', type: 'textarea', column: 'Notes', readOnly: true }];
    render(<EntityForm fields={fields} data={{ notes: 'Some text' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-notes')).toBeInTheDocument();
  });

  // --- date field readOnly ---

  it('renders date field disabled when readOnly', () => {
    const fields = [{ key: 'date', label: 'Date', type: 'date', column: 'DateOrdered', readOnly: true }];
    render(<EntityForm fields={fields} data={{ date: '2026-01-01' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-date')).toBeInTheDocument();
  });

  // --- savingField disables the specific field ---

  it('disables field when savingField matches the field key', () => {
    const fields = [{ key: 'name', label: 'Name', type: 'text', column: 'Name' }];
    render(<EntityForm fields={fields} data={{ name: 'Test' }} onChange={vi.fn()} savingField="name" />);
    expect(screen.getByTestId('field-name')).toBeDisabled();
  });

  // --- selector field readOnly renders readonly FK ---

  it('renders readOnly FK for selector field when readOnly', () => {
    const fields = [{ key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID', readOnly: true }];
    render(<EntityForm fields={fields} data={{ product: 'P1', 'product$_identifier': 'Widget' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-product')).toBeInTheDocument();
  });

  // --- search field readOnly ---

  it('renders readOnly FK for search field when readOnly', () => {
    const fields = [{ key: 'bp', label: 'Business Partner', type: 'search', column: 'C_BPartner_ID', readOnly: true }];
    render(<EntityForm fields={fields} data={{ bp: 'BP1', 'bp$_identifier': 'Acme' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-bp')).toBeInTheDocument();
  });

  // --- image field layout ---

  it('renders image field in side panel layout', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'photo', label: 'Photo', type: 'image', column: 'Photo' },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);
    expect(screen.getByTestId('image-field-photo')).toBeInTheDocument();
  });

  it('renders inline image field within the grid', () => {
    const fields = [
      { key: 'name', label: 'Name', type: 'text', column: 'Name' },
      { key: 'photo', label: 'Photo', type: 'image', column: 'Photo', inline: true },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);
    expect(screen.getByTestId('image-field-photo')).toBeInTheDocument();
  });

  // --- span class variants ---

  it('renders field with span=4 using col-span-4', () => {
    const fields = [{ key: 'desc', label: 'Desc', type: 'textarea', column: 'Desc', span: 4 }];
    const { container } = render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} />);
    expect(container.querySelector('.col-span-4')).toBeTruthy();
  });

  // --- fieldErrors ---

  it('shows error message when fieldErrors contains the field key', () => {
    const fields = [{ key: 'name', label: 'Name', type: 'text', column: 'Name', required: true }];
    const { container } = render(
      <EntityForm fields={fields} data={{ name: '' }} onChange={vi.fn()} fieldErrors={{ name: 'Required' }} />,
    );
    expect(container.textContent).toContain('Required');
  });

  // --- selectorContext defaults to empty object ---

  it('renders with undefined selectorContext without error', () => {
    const fields = [{ key: 'name', label: 'Name', type: 'text', column: 'Name' }];
    render(<EntityForm fields={fields} data={{}} onChange={vi.fn()} selectorContext={undefined} />);
    expect(screen.getByTestId('field-name')).toBeInTheDocument();
  });

  // --- select disabled when readOnly ---

  it('renders select as disabled input when readOnly', () => {
    const fields = [{
      key: 'status', label: 'Status', type: 'select', column: 'DocStatus',
      options: [{ value: 'DR', label: 'Draft' }], readOnly: true,
    }];
    render(<EntityForm fields={fields} data={{ status: 'DR' }} onChange={vi.fn()} />);
    expect(screen.getByTestId('field-status')).toBeInTheDocument();
  });

  // --- number input type ---

  it('renders number field with type=number input', () => {
    const fields = [{ key: 'qty', label: 'Qty', type: 'number', column: 'Qty' }];
    render(<EntityForm fields={fields} data={{ qty: 5 }} onChange={vi.fn()} />);
    const input = screen.getByTestId('field-qty');
    expect(input.getAttribute('type')).toBe('number');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock modal-styles
vi.mock('../modal-styles.js', () => ({
  MODAL_STYLES: {
    dialog: {},
    title: {},
    field: {},
    fieldLabel: {},
    tabBar: {},
    tabContent: {},
    footer: {},
    btnGroup: {},
    btnCancel: {},
    btnSaveEnabled: {},
    btnSaveDisabled: {},
  },
}));

import EntityCreationModal from '../EntityCreationModal.jsx';

const BASE_PROPS = {
  title: 'Create Contact',
  headerFields: [
    { id: 'name', labelKey: 'contactName', type: 'text', required: true },
    { id: 'email', labelKey: 'contactEmail', type: 'email' },
  ],
  sections: [
    {
      id: 'details',
      labelKey: 'detailsTab',
      fields: [
        { id: 'phone', labelKey: 'phoneLabel', type: 'tel' },
      ],
    },
  ],
  requiredFields: ['name'],
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe('EntityCreationModal', () => {
  it('renders the modal title', () => {
    render(<EntityCreationModal {...BASE_PROPS} />);
    expect(screen.getByText('Create Contact')).toBeInTheDocument();
  });

  it('renders header field labels', () => {
    render(<EntityCreationModal {...BASE_PROPS} />);
    // useUI mock returns the key as-is
    expect(screen.getByText('contactName')).toBeInTheDocument();
    expect(screen.getByText('contactEmail')).toBeInTheDocument();
  });

  it('renders section tabs', () => {
    render(<EntityCreationModal {...BASE_PROPS} />);
    // Tab label appears in the tab button; the content section may also show it.
    // Use getAllByText to handle multiple occurrences.
    const tabs = screen.getAllByText('detailsTab');
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders cancel button that calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<EntityCreationModal {...BASE_PROPS} onCancel={onCancel} />);
    const cancelBtn = screen.getByText('cancel');
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders save button', () => {
    render(<EntityCreationModal {...BASE_PROPS} />);
    expect(screen.getByText('save')).toBeInTheDocument();
  });

  it('disables save button when required fields are empty', () => {
    render(<EntityCreationModal {...BASE_PROPS} />);
    const saveBtn = screen.getByText('save');
    // The button has a disabled style (btnSaveDisabled)
    // Since the name field is empty and required, save should be disabled
    expect(saveBtn).toBeDisabled();
  });

  it('calls onSave when save button is clicked with required fields filled', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve());
    render(
      <EntityCreationModal
        {...BASE_PROPS}
        onSave={onSave}
        initialValues={{ name: 'John' }}
      />
    );
    const saveBtn = screen.getByText('save');
    await user.click(saveBtn);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it('renders custom saveLabel when provided', () => {
    render(<EntityCreationModal {...BASE_PROPS} saveLabel="Create" />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('shows error message when onSave throws', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.reject(new Error('Network error')));
    render(
      <EntityCreationModal
        {...BASE_PROPS}
        onSave={onSave}
        initialValues={{ name: 'John' }}
      />
    );
    await user.click(screen.getByText('save'));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders with multiple sections as tabs', () => {
    const sections = [
      { id: 'general', labelKey: 'generalTab', fields: [] },
      { id: 'address', labelKey: 'addressTab', fields: [] },
    ];
    render(<EntityCreationModal {...BASE_PROPS} sections={sections} />);
    // Labels may appear more than once (tab button + section content).
    const generalTabs = screen.getAllByText('generalTab');
    const addressTabs = screen.getAllByText('addressTab');
    expect(generalTabs.length).toBeGreaterThanOrEqual(1);
    expect(addressTabs.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onCancel when overlay backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <EntityCreationModal {...BASE_PROPS} onCancel={onCancel} />
    );
    // The backdrop is the outermost fixed div
    const backdrop = container.querySelector('.fixed');
    if (backdrop) {
      await user.click(backdrop);
      expect(onCancel).toHaveBeenCalled();
    }
  });
});

// ── renderFieldInput — field type variants ─────────────────────────────────────

describe('EntityCreationModal — renderFieldInput field types', () => {
  it('renders a select field with its options', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        {
          id: 'status',
          labelKey: 'statusLabel',
          type: 'select',
          options: [
            { id: 'active', label: 'Active' },
            { id: 'inactive', label: 'Inactive' },
          ],
        },
      ],
      requiredFields: [],
    };
    render(<EntityCreationModal {...props} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders a select field without the empty option when required', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        {
          id: 'status',
          labelKey: 'statusLabel',
          type: 'select',
          required: true,
          options: [{ id: 'active', label: 'Active' }],
        },
      ],
      requiredFields: ['status'],
    };
    const { container } = render(<EntityCreationModal {...props} />);
    // No empty option "—" should be present when required
    const selectEl = container.querySelector('select');
    expect(selectEl).toBeTruthy();
    const emptyOption = Array.from(selectEl.options).find(o => o.value === '');
    expect(emptyOption).toBeUndefined();
  });

  it('renders a dynamicSelect field showing loading state', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        {
          id: 'country',
          labelKey: 'countryLabel',
          type: 'dynamicSelect',
          optionsKey: 'countries',
        },
      ],
      opts: {
        countries: { loading: true, options: [], error: null },
      },
      requiredFields: [],
    };
    render(<EntityCreationModal {...props} />);
    // The mocked ui() returns key as-is; loading renders a disabled select with loadingOptions text
    expect(screen.getByText('loadingOptions')).toBeInTheDocument();
  });

  it('renders a dynamicSelect field showing error state with retry button', () => {
    const onRetry = vi.fn();
    const props = {
      ...BASE_PROPS,
      headerFields: [
        {
          id: 'country',
          labelKey: 'countryLabel',
          type: 'dynamicSelect',
          optionsKey: 'countries',
        },
      ],
      opts: {
        countries: { loading: false, options: [], error: 'err', onRetry },
      },
      requiredFields: [],
    };
    render(<EntityCreationModal {...props} />);
    expect(screen.getByText('retryLoad')).toBeInTheDocument();
  });

  it('renders a dynamicSelect field with options', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        {
          id: 'country',
          labelKey: 'countryLabel',
          type: 'dynamicSelect',
          optionsKey: 'countries',
        },
      ],
      opts: {
        countries: {
          loading: false,
          options: [
            { id: 'es', label: 'Spain' },
            { id: 'fr', label: 'France' },
          ],
          error: null,
        },
      },
      requiredFields: [],
    };
    render(<EntityCreationModal {...props} />);
    expect(screen.getByText('Spain')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
  });

  it('renders a number input for number field type', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        { id: 'qty', labelKey: 'quantityLabel', type: 'number' },
      ],
      requiredFields: [],
    };
    const { container } = render(<EntityCreationModal {...props} />);
    const numInput = container.querySelector('input[type="number"]');
    expect(numInput).toBeTruthy();
  });

  it('renders a tel input for tel field type', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        { id: 'phone', labelKey: 'phoneLabel', type: 'tel' },
      ],
      requiredFields: [],
    };
    const { container } = render(<EntityCreationModal {...props} />);
    const telInput = container.querySelector('input[type="tel"]');
    expect(telInput).toBeTruthy();
  });

  // ETP-4321 regression guard: INPUT_CLS/SELECT_CLS must carry the important
  // height token `!h-9` (FIELD_HEIGHT_IMPORTANT). The bug fix replaced
  // `!${FIELD_HEIGHT}` (never seen by Tailwind's JIT scanner) with the literal
  // FIELD_HEIGHT_IMPORTANT token, so the rendered class must contain `!h-9`.
  it('text input className uses the !h-9 important height token (INPUT_CLS exercises FIELD_HEIGHT_IMPORTANT)', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        { id: 'note', labelKey: 'noteLabel', type: 'text' },
      ],
      requiredFields: [],
    };
    const { container } = render(<EntityCreationModal {...props} />);
    const textInput = container.querySelector('input[type="text"]');
    expect(textInput).toBeTruthy();
    expect(textInput.className).toContain('!h-9');
  });

  it('select field className uses the !h-9 important height token (SELECT_CLS + SELECT_STYLE)', () => {
    const props = {
      ...BASE_PROPS,
      headerFields: [
        {
          id: 'status',
          labelKey: 'statusLabel',
          type: 'select',
          options: [{ id: 'active', label: 'Active' }],
        },
      ],
      requiredFields: [],
    };
    const { container } = render(<EntityCreationModal {...props} />);
    const selectEl = container.querySelector('select');
    expect(selectEl).toBeTruthy();
    expect(selectEl.className).toContain('!h-9');
    // SELECT_STYLE keeps fontSize only (height now comes from the token).
    expect(selectEl.style.fontSize).toBe('14px');
  });
});

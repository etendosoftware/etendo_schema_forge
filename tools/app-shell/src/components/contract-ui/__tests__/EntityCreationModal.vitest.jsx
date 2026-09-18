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

  /**
   * ETP-5103 — whitespace is not content.
   *
   * A lone space in a mandatory field used to satisfy the gate, so the asterisk
   * promised something the button did not enforce and a blank address could be
   * saved. Only strings are trimmed: a required field holding 0 or false carries
   * a legitimate value and must still pass.
   */
  describe('save gating treats whitespace as empty', () => {
    /** Render with a single required field preloaded with `value`. */
    const renderWithName = (value) =>
      render(<EntityCreationModal {...BASE_PROPS} initialValues={{ name: value }} />);

    it('keeps save disabled for a whitespace-only value', () => {
      renderWithName('   ');
      expect(screen.getByText('save')).toBeDisabled();
    });

    it('enables save as soon as there is a real character', () => {
      renderWithName(' J ');
      expect(screen.getByText('save')).toBeEnabled();
    });

    it('still accepts a numeric zero', () => {
      renderWithName(0);
      expect(screen.getByText('save')).toBeEnabled();
    });

    it('still accepts a false', () => {
      renderWithName(false);
      expect(screen.getByText('save')).toBeEnabled();
    });

    it('keeps save disabled for a missing value', () => {
      render(<EntityCreationModal {...BASE_PROPS} initialValues={{}} />);
      expect(screen.getByText('save')).toBeDisabled();
    });
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

/**
 * `initialValues` is snapshotted by useState on mount, so anything resolved
 * later (ETP-4855: an OCR country label matched against selector options that
 * are still loading) has to arrive through `patchValues`.
 */
describe('EntityCreationModal — patchValues', () => {
  const PROPS = { ...BASE_PROPS, initialValues: { name: '', email: '' } };

  it('fills a field that is still empty', async () => {
    const { container } = render(
      <EntityCreationModal {...PROPS} patchValues={{ name: 'Laura Morat' }} />
    );
    await waitFor(() => {
      expect(container.querySelector('input[type="text"]').value).toBe('Laura Morat');
    });
  });

  it('never overwrites a value the user already typed', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <EntityCreationModal {...PROPS} patchValues={null} />
    );
    const nameInput = container.querySelector('input[type="text"]');
    await user.type(nameInput, 'Typed By User');

    rerender(<EntityCreationModal {...PROPS} patchValues={{ name: 'From OCR' }} />);

    await waitFor(() => {
      expect(nameInput.value).toBe('Typed By User');
    });
  });

  it('applies a later patch without undoing an earlier one', async () => {
    const { container, rerender } = render(
      <EntityCreationModal {...PROPS} patchValues={{ name: 'Laura Morat' }} />
    );
    await waitFor(() => {
      expect(container.querySelector('input[type="text"]').value).toBe('Laura Morat');
    });

    rerender(
      <EntityCreationModal {...PROPS} patchValues={{ name: 'Laura Morat', email: 'a@b.es' }} />
    );

    await waitFor(() => {
      expect(container.querySelector('input[type="email"]').value).toBe('a@b.es');
    });
    expect(container.querySelector('input[type="text"]').value).toBe('Laura Morat');
  });

  it('ignores blank patch entries', async () => {
    const { container } = render(
      <EntityCreationModal {...PROPS} patchValues={{ name: '', email: null }} />
    );
    await waitFor(() => {
      expect(container.querySelector('input[type="text"]').value).toBe('');
    });
    expect(container.querySelector('input[type="email"]').value).toBe('');
  });
});

/**
 * ETP-5031 follow-up — EntityCreationModal.getFormatError runs the same generic
 * email/website/phone format checks EntityForm.jsx uses elsewhere (recipientEdits.js),
 * against every headerField/plain-section field.
 *
 * getPhoneFieldError/isPhoneField and getWebsiteFieldError/isWebsiteField key off
 * `field.key`/`field.column` by name (unlike getEmailFieldError/isEmailField, which
 * shortcuts on `field.type === 'email'` alone) — but EntityCreationModal's field
 * configs only ever carry `id`, never `key`/`column` (see OrganizationPage.jsx's
 * `{ key: 'phone' }` / `{ key: 'web', inputPrefix: 'https://' }` descriptors for the
 * shape those two actually expect). getFormatError aliases `key: f.key ?? f.id`
 * before calling all three getters so the name-based checks resolve against `id`
 * too — without it, phone/website format errors silently never fire here.
 */
describe('EntityCreationModal — ETP-5031 format validation blocks save', () => {
  const FORMAT_PROPS = {
    title: 'Create Contact',
    headerFields: [
      { id: 'name', labelKey: 'contactName', type: 'text', required: true },
    ],
    sections: [
      {
        id: 'more',
        labelKey: 'masTab',
        plain: true,
        fields: [
          { id: 'etgoEmail', labelKey: 'contactEmail', type: 'email' },
          { id: 'etgoPhone', labelKey: 'contactPhone', type: 'tel', maxLength: 15 },
          { id: 'etgoWeb', labelKey: 'websiteField', type: 'text', inputPrefix: 'https://' },
        ],
      },
    ],
    requiredFields: ['name'],
    onCancel: vi.fn(),
  };

  const renderWithValues = (values, onSave = vi.fn(() => Promise.resolve())) => {
    const utils = render(
      <EntityCreationModal
        {...FORMAT_PROPS}
        onSave={onSave}
        initialValues={{ name: 'Acme', ...values }}
      />
    );
    return { ...utils, onSave };
  };

  it('blocks save on an invalid email address', async () => {
    const user = userEvent.setup();
    const { onSave } = renderWithValues({ etgoEmail: 'a@' });
    await user.click(screen.getByText('save'));
    await waitFor(() => {
      expect(screen.getByText('sendModalInvalidEmail')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks save on a phone value with letters (id-only field descriptor)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderWithValues({ etgoPhone: 'not-a-phone' });
    await user.click(screen.getByText('save'));
    await waitFor(() => {
      expect(screen.getByText('phoneInvalidChars')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks save on a prefixed website field with a non-domain-shaped value', async () => {
    const user = userEvent.setup();
    const { onSave } = renderWithValues({ etgoWeb: 'asda' });
    await user.click(screen.getByText('save'));
    await waitFor(() => {
      expect(screen.getByText('websiteInsecureUrl')).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('proceeds to onSave when all three format-checked fields are valid', async () => {
    const user = userEvent.setup();
    const { onSave } = renderWithValues({
      etgoEmail: 'contact@acme.com',
      etgoPhone: '+34 600 123 456',
      etgoWeb: 'acme.com',
    });
    await user.click(screen.getByText('save'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });

  it('proceeds to onSave when the format-checked fields are left empty', async () => {
    const user = userEvent.setup();
    const { onSave } = renderWithValues({});
    await user.click(screen.getByText('save'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });
});

/**
 * ETP-5031 follow-up — a field declaring `inputPrefix` renders a fixed,
 * non-editable chip (via PrefixedInput) before its input, and `maxLength`
 * reaches the underlying <input> unconditionally (not just for prefixed
 * fields — contactModalConfig's plain `etgoPhone` needs it too).
 */
describe('EntityCreationModal — inputPrefix chip and maxLength passthrough', () => {
  it('renders the prefix chip wrapper and text before a prefixed field', () => {
    const props = {
      title: 'Create Contact',
      headerFields: [
        { id: 'etgoWeb', labelKey: 'websiteField', type: 'text', inputPrefix: 'https://' },
      ],
      sections: [],
      requiredFields: [],
      onSave: vi.fn(),
      onCancel: vi.fn(),
    };
    render(<EntityCreationModal {...props} />);
    const wrapper = screen.getByTestId('field-etgoWeb-prefix-wrapper');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveTextContent('https://');
  });

  it('does not render a prefix wrapper for a field with no inputPrefix', () => {
    const props = {
      title: 'Create Contact',
      headerFields: [
        { id: 'name', labelKey: 'contactName', type: 'text' },
      ],
      sections: [],
      requiredFields: [],
      onSave: vi.fn(),
      onCancel: vi.fn(),
    };
    render(<EntityCreationModal {...props} />);
    expect(screen.queryByTestId('field-name-prefix-wrapper')).not.toBeInTheDocument();
  });

  it('passes maxLength through to the underlying input', () => {
    const props = {
      title: 'Create Contact',
      headerFields: [
        { id: 'etgoPhone', labelKey: 'phoneLabel', type: 'tel', maxLength: 15 },
      ],
      sections: [],
      requiredFields: [],
      onSave: vi.fn(),
      onCancel: vi.fn(),
    };
    const { container } = render(<EntityCreationModal {...props} />);
    const input = container.querySelector('input[type="tel"]');
    expect(input).toBeTruthy();
    expect(input).toHaveAttribute('maxlength', '15');
  });

  it('strips letters from a tel-typed field as the user types (same charset guard as Contacts)', async () => {
    const user = userEvent.setup();
    const props = {
      title: 'Create Contact',
      headerFields: [
        { id: 'etgoPhone', labelKey: 'phoneLabel', type: 'tel' },
      ],
      sections: [],
      requiredFields: [],
      onSave: vi.fn(),
      onCancel: vi.fn(),
    };
    const { container } = render(<EntityCreationModal {...props} />);
    const input = container.querySelector('input[type="tel"]');
    await user.type(input, 'ab+34 91c000d001');
    expect(input.value).toBe('+34 91000001');
  });

  it('passes maxLength through even for a prefixed field', () => {
    const props = {
      title: 'Create Contact',
      headerFields: [
        { id: 'etgoWeb', labelKey: 'websiteField', type: 'text', inputPrefix: 'https://', maxLength: 100 },
      ],
      sections: [],
      requiredFields: [],
      onSave: vi.fn(),
      onCancel: vi.fn(),
    };
    const { container } = render(<EntityCreationModal {...props} />);
    const input = container.querySelector('input[type="text"]');
    expect(input).toHaveAttribute('maxlength', '100');
  });
});

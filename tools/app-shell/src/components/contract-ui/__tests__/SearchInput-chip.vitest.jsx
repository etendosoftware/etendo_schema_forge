import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks — return the key as-is (no hardcoded strings)
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Stub heavy sub-components
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

// SearchInput is rendered indirectly via fields[].type === 'search'.
// A bare search field (no popup, no lookup) yields the inline SearchInput we want to exercise.
const SEARCH_FIELD = {
  key: 'partner',
  label: 'Partner',
  type: 'search',
  column: 'C_BPartner_ID',
  reference: 'C_BPartner',
};

/**
 * Wrapper that mirrors what DetailView does: maintains the form data so
 * onChange('', '') properly removes the value from the next render. This is
 * required to verify the "click X → cleared" scenario without leaking state.
 */
function Harness({ initialData = {}, onChangeSpy }) {
  const [data, setData] = React.useState(initialData);
  const handleChange = (key, value /*, column */) => {
    onChangeSpy?.(key, value);
    setData((d) => ({ ...d, [key]: value }));
  };
  return (
    <EntityForm
      fields={[SEARCH_FIELD]}
      data={data}
      onChange={handleChange}
    />
  );
}

// Pull React in for the harness's useState
import React from 'react';

describe('SearchInput chip mode (ETP-4000)', () => {
  beforeEach(() => {
    // Prevent the auto-fetch effect from firing into undefined-land when value exists
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the chip (and hides the input) when an initial selection is present', () => {
    render(
      <Harness initialData={{ partner: 'BP-123', 'partner$_identifier': 'Acme Corp' }} />
    );
    const chip = screen.getByTestId('field-partner-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('Acme Corp');
    // Input should not be in the DOM while the chip is shown
    expect(screen.queryByTestId('field-partner')).not.toBeInTheDocument();
  });

  it('renders the input (and hides the chip) when no value is selected', () => {
    render(<Harness initialData={{}} />);
    expect(screen.queryByTestId('field-partner-chip')).not.toBeInTheDocument();
    const input = screen.getByTestId('field-partner');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder');
    // Placeholder includes the i18n key prefix that maps to "search..."
    expect(input.getAttribute('placeholder')).toMatch(/searchLabelPrefix/);
  });

  it('clicking the chip body switches to typing mode and focuses the input', async () => {
    const user = userEvent.setup();
    render(
      <Harness initialData={{ partner: 'BP-123', 'partner$_identifier': 'Acme Corp' }} />
    );
    const chip = screen.getByTestId('field-partner-chip');
    await user.click(chip);

    // Input should now render and chip should be gone
    const input = await screen.findByTestId('field-partner');
    expect(input).toBeInTheDocument();
    expect(screen.queryByTestId('field-partner-chip')).not.toBeInTheDocument();

    // requestAnimationFrame schedules the focus — wait for it.
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it('clicking the X inside the chip clears the selection (onChange("", ""))', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initialData={{ partner: 'BP-123', 'partner$_identifier': 'Acme Corp' }}
        onChangeSpy={onChangeSpy}
      />
    );
    const chip = screen.getByTestId('field-partner-chip');
    // The X is rendered inside a role="button" with aria-label="clear" (i18n key).
    const clearBtn = chip.querySelector('[aria-label="clear"]');
    expect(clearBtn).not.toBeNull();

    // The handler is bound to onMouseDown (preventDefault would otherwise swallow blur first).
    // userEvent.click triggers pointerdown → mousedown → mouseup → click.
    await user.click(clearBtn);

    expect(onChangeSpy).toHaveBeenCalledWith('partner', '');
  });

  it('renders the ChevronDown icon (right-anchored) when no selection and not fetching', () => {
    const { container } = render(<Harness initialData={{}} />);
    const chevron = container.querySelector('svg.lucide-chevron-down');
    expect(chevron).not.toBeNull();
    // Regression: chevron button must keep ml-auto so chip vs input share the same right anchor.
    expect(chevron.parentElement.getAttribute('class')).toMatch(/(^|\s)ml-auto(\s|$)/);
    // It must not render the loader at the same time.
    expect(container.querySelector('svg.lucide-loader')).toBeNull();
  });

  it('renders the ChevronDown icon (right-anchored) when the chip is visible', () => {
    const { container } = render(
      <Harness initialData={{ partner: 'BP-123', 'partner$_identifier': 'Acme Corp' }} />
    );
    const chevron = container.querySelector('svg.lucide-chevron-down');
    expect(chevron).not.toBeNull();
    expect(chevron.parentElement.getAttribute('class')).toMatch(/(^|\s)ml-auto(\s|$)/);
  });
});

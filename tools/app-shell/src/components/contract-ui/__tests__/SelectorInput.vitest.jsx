/**
 * Render tests for SelectorInput — the Radix Select wrapper for FK fields.
 * Covers: initial render, placeholder, compact mode, value display, required field.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('lucide-react', () => ({
  Loader2: () => <span data-testid="loader" />,
  ChevronDown: () => <span data-testid="icon-chevron" />,
}));

// Mock Radix Select to avoid the full UI tree.
// Renders a button trigger with data-testid and placeholder/value text.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange, required }) => (
    <div data-select-value={value ?? ''} data-required={required ? 'true' : 'false'}>
      {children}
    </div>
  ),
  SelectTrigger: React.forwardRef(({ children, className, ...rest }, ref) => (
    <button ref={ref} className={className} {...rest}>{children}</button>
  )),
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: React.forwardRef(({ children }, ref) => <div ref={ref}>{children}</div>),
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
}));

import { SelectorInput } from '../SelectorInput.jsx';

const defaultField = {
  key: 'bp',
  label: 'Partner',
  column: 'C_BPartner_ID',
  required: false,
};

function renderSelector(props = {}) {
  return render(
    <SelectorInput
      entityName="header"
      field={defaultField}
      value=""
      displayValue=""
      onChange={vi.fn()}
      catalogs={{}}
      resolvedLabel="Partner"
      selectorUrl={null}
      selectorContext={{}}
      token="test-token"
      {...props}
    />,
  );
}

describe('SelectorInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    renderSelector();
    const trigger = screen.getByTestId('field-bp');
    expect(trigger).toBeInTheDocument();
  });

  it('shows placeholder text in default (non-compact) mode', () => {
    renderSelector();
    expect(screen.getByText('selectLabelPrefix Partner...')).toBeInTheDocument();
  });

  it('shows plain label as placeholder in compact mode', () => {
    renderSelector({ compact: true });
    expect(screen.getByText('Partner')).toBeInTheDocument();
  });

  it('renders the trigger with the field key as data-testid', () => {
    renderSelector();
    expect(screen.getByTestId('field-bp')).toBeInTheDocument();
  });

  it('renders with custom triggerClassName when provided', () => {
    renderSelector({ triggerClassName: 'custom-class' });
    const trigger = screen.getByTestId('field-bp');
    expect(trigger.className).toContain('custom-class');
  });

  it('uses different trigger class for compact mode', () => {
    renderSelector({ compact: true });
    const trigger = screen.getByTestId('field-bp');
    expect(trigger.className).toContain('h-8');
  });

  it('renders empty-option item when field is not required', () => {
    const { container } = renderSelector({ field: { ...defaultField, required: false } });
    // The empty "__empty__" option should be rendered
    const emptyOption = container.querySelector('[data-value="__empty__"]');
    expect(emptyOption).toBeTruthy();
  });

  it('does NOT render empty-option when field is required', () => {
    const { container } = renderSelector({ field: { ...defaultField, required: true } });
    const emptyOption = container.querySelector('[data-value="__empty__"]');
    expect(emptyOption).toBeNull();
  });

  it('handles required field without crashing', () => {
    renderSelector({ field: { ...defaultField, required: true } });
    expect(screen.getByTestId('field-bp')).toBeInTheDocument();
  });

  it('falls back to field.label when resolvedLabel is not provided', () => {
    renderSelector({ resolvedLabel: undefined });
    expect(screen.getByText('selectLabelPrefix Partner...')).toBeInTheDocument();
  });

  it('falls back to field.key when no label is available', () => {
    renderSelector({
      resolvedLabel: undefined,
      field: { ...defaultField, label: undefined },
    });
    expect(screen.getByText('selectLabelPrefix bp...')).toBeInTheDocument();
  });

  it('renders without selectorUrl (catalog-only mode)', () => {
    renderSelector({ selectorUrl: null, token: null });
    expect(screen.getByTestId('field-bp')).toBeInTheDocument();
  });

  it('shows "loading" indicator when selectorUrl is configured and hasMore', () => {
    renderSelector({ selectorUrl: '/api/header/selectors/C_BPartner_ID' });
    // The loading indicator text should render (ui('loading') = 'loading')
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('does not show "loading" indicator without selectorUrl', () => {
    renderSelector({ selectorUrl: null });
    expect(screen.queryByText('loading')).toBeNull();
  });
});

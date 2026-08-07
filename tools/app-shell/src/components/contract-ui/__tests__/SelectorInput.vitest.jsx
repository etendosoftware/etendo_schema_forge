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
    <div
      data-select-value={value ?? ''}
      data-select-value-type={value === undefined ? 'undefined' : 'string'}
      data-required={required ? 'true' : 'false'}>
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

  // Regression for the "clearing an FK needs two clicks" bug (ETP-4751 Bug B).
  // @radix-ui/react-select derives isControlled from `value !== undefined`. Passing
  // `undefined` for the empty state flips the Select controlled→uncontrolled, and
  // Radix's controllable-state hook swaps to a fresh internal store during that flip,
  // swallowing the onValueChange of the selection that triggered it (the dropped first
  // clear). The empty state MUST be a constant-typed '' so the Select stays controlled
  // for its whole lifetime while still showing the placeholder.
  it('passes a string (not undefined) as the Select value when empty, to keep it controlled', () => {
    const { container } = renderSelector({ value: '', displayValue: '' });
    const select = container.querySelector('[data-select-value-type]');
    expect(select.getAttribute('data-select-value-type')).toBe('string');
    expect(select.getAttribute('data-select-value')).toBe('');
  });

  it('passes the id as the Select value when a value is set', () => {
    const { container } = renderSelector({ value: 'CAUSE_X', displayValue: 'Cause X' });
    const select = container.querySelector('[data-select-value-type]');
    expect(select.getAttribute('data-select-value-type')).toBe('string');
    expect(select.getAttribute('data-select-value')).toBe('CAUSE_X');
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

  // Regression for the "Cargando..." infinite-fetch bug: DetailView/EntityForm
  // recreate `selectorContext` as a brand-new object on every render even when its
  // content is unchanged. fetchPage — and the SelectContent ref callback that
  // depends on it — must compare selectorContext by content, not by reference.
  // Otherwise every parent re-render re-identifies the ref callback, which React
  // detaches and reattaches (calling it again with the DOM node), re-running its
  // "fetch + attach scroll listener" body on every render. In production this
  // flooded the selector endpoint (1700+ requests in 15s) and left the dropdown
  // stuck on "Cargando..." forever.
  it('does not reattach the SelectContent ref when selectorContext is a new reference with the same content', () => {
    const addEventListenerSpy = vi.spyOn(Element.prototype, 'addEventListener');

    const { rerender } = renderSelector({ selectorUrl: '/api/header/selectors/C_BPartner_ID', selectorContext: {} });
    // The mocked fetch resolves within the initial act() flush, so the ref
    // callback legitimately reattaches once more when serverOptions settles from
    // null to the loaded (empty) list — that transition is expected, not the bug.
    const scrollAttachCountAfterMount = addEventListenerSpy.mock.calls.filter(([type]) => type === 'scroll').length;
    expect(scrollAttachCountAfterMount).toBeGreaterThan(0);

    // Re-render several times with a NEW object literal each time (same content:
    // empty). A stable ref callback must NOT be detached/reattached by this.
    for (let i = 0; i < 5; i++) {
      rerender(
        <SelectorInput
          entityName="header"
          field={defaultField}
          value=""
          displayValue=""
          onChange={vi.fn()}
          catalogs={{}}
          resolvedLabel="Partner"
          selectorUrl="/api/header/selectors/C_BPartner_ID"
          selectorContext={{}}
          token="test-token"
        />,
      );
    }

    const scrollAttachCountAfterRerenders = addEventListenerSpy.mock.calls.filter(([type]) => type === 'scroll').length;
    expect(scrollAttachCountAfterRerenders).toBe(scrollAttachCountAfterMount);

    addEventListenerSpy.mockRestore();
  });
});

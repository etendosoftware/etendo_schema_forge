/**
 * Render tests for DimensionsPanel's `DimensionGrid` — the expanded
 * "Dimensiones contables" sub-row shared by `InlineLinesPanel.jsx` (generic
 * pipeline windows) and `AmortizationLinesTable.jsx` (hand-built window).
 *
 * ETP-4610 follow-up: the expand panel rendered visibly LARGER than the grid
 * row it's attached to (bigger label, taller selector). These tests lock the
 * exact compact-density class values so a regression can't silently creep back
 * in — see `docs/generated-custom-windows` screenshots + the `InlineLinesPanel`
 * row density (`h-7`/`text-sm` edit cells, `SelectorInput`'s own `compact`
 * convention of `h-8`/`text-sm`) that this panel must visually match.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (column) => column,
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
  Plus: () => <span data-testid="icon-plus" />,
}));

// Mock Radix Select the same way SelectorInput.vitest.jsx does, so
// DimensionGrid's real SelectorInput renders (not a stub) and we can assert
// on the actual trigger className it receives.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectTrigger: React.forwardRef(({ children, className, ...rest }, ref) => (
    <button ref={ref} className={className} {...rest}>{children}</button>
  )),
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: React.forwardRef(({ children }, ref) => <div ref={ref}>{children}</div>),
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
}));

import { DimensionGrid } from '../DimensionsPanel.jsx';

const fields = [
  { key: 'project', column: 'M_Project_ID', label: 'Project' },
];

// DimensionGrid renders SelectorInput with a real selectorUrl (built from
// apiBaseUrl), and the mocked SelectContent above (unlike real Radix) mounts
// unconditionally on every render, so SelectorInput's fetchPage(0) effect
// fires in every test. Without this mock, that hits the real global fetch
// against a non-existent host: the rejection is normally fast enough to
// settle before jsdom teardown under plain `vitest run`, but coverage
// instrumentation's overhead pushes it past teardown, producing an unhandled
// rejection ("window is not defined" from the .catch()'s setFetching(false)
// running against a torn-down environment). Mocking fetch to resolve
// immediately — same pattern as SelectorInput.vitest.jsx — keeps it settling
// within the initial act() flush, well before the test (and jsdom) end.
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [] }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderGrid(props = {}) {
  return render(
    <DimensionGrid
      fields={fields}
      data={{}}
      onChange={vi.fn()}
      onFieldSave={vi.fn()}
      apiBaseUrl="https://example.test/api"
      token="test-token"
      readOnly={false}
      isCompleted={false}
      {...props}
    />,
  );
}

describe('DimensionGrid density (ETP-4610)', () => {
  beforeEach(() => {
    // SelectorInput mounts with a selector URL and lazily fetches its first page
    // through the mocked SelectContent ref. Keep that request deterministic so a
    // real network rejection cannot fire after RTL has torn down jsdom in CI.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the field label at the compact (text-xs) size, matching the grid row density', () => {
    renderGrid();
    const label = screen.getByText('M_Project_ID');
    expect(label.tagName).toBe('LABEL');
    expect(label.className).toBe('text-xs font-medium text-muted-foreground block');
  });

  it('does NOT render the label at the larger text-sm/foreground size used previously', () => {
    renderGrid();
    const label = screen.getByText('M_Project_ID');
    expect(label.className).not.toContain('text-sm');
    expect(label.className).not.toContain('text-foreground');
  });

  it('renders the editable SelectorInput trigger at the compact h-8 height', () => {
    renderGrid();
    const trigger = screen.getByTestId('field-project');
    expect(trigger.className).toBe('w-full h-8 text-sm bg-card focus:ring-2 focus:ring-primary');
  });

  it('renders the read-only input at the compact h-8 height', () => {
    renderGrid({ readOnly: true, isCompleted: true, data: { project: 'Alpha' } });
    const input = screen.getByDisplayValue('Alpha');
    expect(input.className).toBe(
      'flex h-8 w-full rounded-lg border border-[hsl(var(--border-control))] bg-card p-2 text-sm disabled:cursor-not-allowed disabled:opacity-50',
    );
    expect(input).toBeDisabled();
  });
});

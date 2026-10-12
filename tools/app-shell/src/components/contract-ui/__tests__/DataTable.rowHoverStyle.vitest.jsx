// @covers tools/app-shell/src/components/contract-ui/DataTable.jsx
/**
 * DataTable — row hover style and the row selection colours (getRowClassName) plus the
 * scroll wrapper's room for the lifted row's shadow.
 *
 * Contract: a clickable row LIFTS on hover by default (opaque white + Shadows/lg + the
 * redrawn top separator, no colour transition). `'elevated'` (the former name) and any
 * unknown value lift too; `'tint'` is the only opt-out. A non-clickable row never lifts.
 * Every row sets `--row-hover-bg` to its own hovered background so the quick-actions fade
 * ends on it. Assertions read the RENDERED <tr> (after TableRow's own base classes are
 * merged in), so they describe what the browser actually gets.
 */
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hoverBackgroundUtilities } from '@/test/rowShading.js';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'dot',
  getStatusTone: () => 'neutral',
  statusLabel: (raw) => `lbl-${raw}`,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('../InlineSearchCombo.jsx', () => ({ InlineSearchCombo: () => null }));
vi.mock('../RowQuickActions.jsx', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

const COLUMNS = [{ key: 'name', label: 'Name', type: 'string' }];
const DATA = [{ id: 'r1', name: 'BBVA' }, { id: 'r2', name: 'Caja' }];

// Expected tokens, spelled out literally (the Figma "Fila" values), not imported.
const LIFT = [
  'relative', 'transition-none', 'hover:z-10',
  'hover:shadow-[0_4px_6px_-2px_rgba(18,18,23,0.05),0_10px_15px_-3px_rgba(18,18,23,0.08)]',
  '[&:hover>td]:shadow-[inset_0_1px_0_hsl(var(--border-subtle))]',
];
const LIFT_REST = ['hover:bg-card', '[--row-hover-bg:hsl(var(--card))]'];
const CHECKED = [
  'bg-[hsl(var(--field-hover))]', 'hover:bg-[hsl(var(--field-hover))]',
  '[--row-hover-bg:hsl(var(--field-hover))]',
];
const ACTIVE = [
  'bg-primary/10', 'hover:bg-primary/10',
  '[--row-hover-bg:color-mix(in_srgb,hsl(var(--primary))_10%,hsl(var(--card)))]',
];
const SELECTED_LINE = ['bg-muted', 'ring-1', 'ring-focus-ring', 'hover:bg-muted', '[--row-hover-bg:hsl(var(--muted))]'];
const TINT_VAR = '[--row-hover-bg:color-mix(in_srgb,hsl(var(--muted))_50%,hsl(var(--card)))]';
const TINT = ['transition-colors', 'hover:bg-muted/50', TINT_VAR];

/**
 * Renders the grid, optionally ticks the row's checkbox, and returns the rendered row,
 * its class tokens and the scroll wrapper's class tokens.
 */
async function renderRow({ rowId = 'r1', clickable = true, check = false, ...props } = {}) {
  const view = render(
    <DataTable
      columns={COLUMNS}
      data={DATA}
      {...(clickable ? { onNavigate: () => {} } : {})}
      {...props}
    />,
  );
  if (check) {
    await act(async () => {
      await userEvent.click(within(screen.getByTestId(`row-${rowId}`)).getByRole('checkbox'));
    });
  }
  const row = screen.getByTestId(`row-${rowId}`);
  const wrapper = document.querySelector('[data-testid="Table__eb5261"]').parentElement.parentElement;
  const result = {
    row,
    tokens: row.className.split(/\s+/).filter(Boolean),
    wrapper: wrapper.className.split(/\s+/).filter(Boolean),
  };
  view.unmount();
  return result;
}

describe('DataTable — clickable row hover (lift by default)', () => {
  it.each([
    ['unset (default)', {}],
    ['"elevated" (former name)', { rowHoverStyle: 'elevated' }],
    ['an unknown value', { rowHoverStyle: 'shadow' }],
  ])('%s lifts an unselected row with an opaque white background', async (_label, props) => {
    const { row, tokens } = await renderRow(props);

    expect(tokens).toEqual(expect.arrayContaining(['cursor-pointer', ...LIFT, ...LIFT_REST]));
    expect(tokens).not.toContain('hover:bg-muted/50');
    expect(tokens).not.toContain('transition-colors');
    expect(hoverBackgroundUtilities(row)).toEqual(['hover:bg-card']);
  });

  it.each([
    ['checked', { check: true }, CHECKED],
    ['active (selectedId)', { selectedId: 'r1' }, ACTIVE],
  ])('keeps the %s colour on hover and still lifts', async (_label, props, selection) => {
    const { row, tokens } = await renderRow(props);

    expect(tokens).toEqual(expect.arrayContaining([...selection, ...LIFT]));
    expect(tokens).not.toContain('hover:bg-card');
    expect(hoverBackgroundUtilities(row)).toHaveLength(1);
  });

  it('paints the focused inline line muted with the focus ring, without the lift', async () => {
    const { row, tokens } = await renderRow({ selectedRowId: 'r1' });

    expect(tokens).toEqual(expect.arrayContaining(SELECTED_LINE));
    expect(tokens).not.toContain('hover:z-10');
    expect(tokens.some((t) => t.includes('shadow'))).toBe(false);
    expect(hoverBackgroundUtilities(row)).toEqual(['hover:bg-muted']);
  });

  it.each([false, true])('paints a checked row with --field-hover (hoverRowActions=%s)', async (hoverRowActions) => {
    const { tokens } = await renderRow({ check: true, hoverRowActions });

    expect(tokens).toEqual(expect.arrayContaining(CHECKED));
    expect(tokens).not.toContain('bg-primary/5');
    expect(tokens).not.toContain('bg-[hsl(var(--muted))]');
  });
});

describe('DataTable — rowHoverStyle="tint" opt-out', () => {
  it('tints the hovered row and adds none of the lift classes', async () => {
    const { row, tokens } = await renderRow({ rowHoverStyle: 'tint' });

    expect(tokens).toEqual(expect.arrayContaining(['cursor-pointer', ...TINT]));
    for (const cls of [...LIFT, ...LIFT_REST]) expect(tokens).not.toContain(cls);
    expect(hoverBackgroundUtilities(row)).toEqual(['hover:bg-muted/50']);
  });
});

describe('DataTable — non-clickable rows never lift', () => {
  it.each([
    ['unset', {}],
    ['"tint"', { rowHoverStyle: 'tint' }],
    ['"elevated"', { rowHoverStyle: 'elevated' }],
  ])('keeps the plain tint on an unselected row with rowHoverStyle %s', async (_label, props) => {
    const { row, tokens } = await renderRow({ clickable: false, ...props });

    expect(tokens).toEqual(expect.arrayContaining(['cursor-default', 'transition-colors', TINT_VAR]));
    for (const cls of [...LIFT, ...LIFT_REST]) expect(tokens).not.toContain(cls);
    // Only TableRow's own base tint — getRowClassName adds no hover background of its own.
    expect(hoverBackgroundUtilities(row)).toEqual(['hover:bg-muted/50']);
  });

  it('carries only the selection classes on a checked row', async () => {
    const { tokens } = await renderRow({ clickable: false, check: true });

    expect(tokens).toEqual(expect.arrayContaining(['cursor-default', ...CHECKED]));
    for (const cls of [...LIFT, ...LIFT_REST, TINT_VAR]) expect(tokens).not.toContain(cls);
  });
});

describe('DataTable — scroll wrapper room for the lifted shadow', () => {
  it.each([
    ['a clickable lifted grid', {}, true],
    ['a clickable "elevated" grid', { rowHoverStyle: 'elevated' }, true],
    ['a clickable "tint" grid', { rowHoverStyle: 'tint' }, false],
    ['a non-clickable grid', { clickable: false }, false],
    ['an inlineEditable grid', { linesLayout: 'inlineEditable' }, false],
  ])('pads the inner box only for %s', async (_label, props, padded) => {
    const { wrapper } = await renderRow(props);

    expect(wrapper.includes('[&>div]:pb-6')).toBe(padded);
    expect(wrapper).not.toContain('pb-6');
  });
});

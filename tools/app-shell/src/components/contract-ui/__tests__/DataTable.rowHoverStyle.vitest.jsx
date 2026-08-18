/**
 * DataTable — `rowHoverStyle` ('tint' | 'elevated'), ETP-4658.
 *
 * Card-like lists read the row as a raised surface, so the hovered row must LIFT (opaque
 * background + drop shadow + z-10) instead of tinting. The Cuentas list had that behaviour
 * hardcoded on the retired `AccountRow`'s <tr>; moving onto the generic DataTable lost it,
 * so it became an opt-in prop.
 *
 * Two things here are regression guards rather than new-feature coverage:
 *
 *  - `'tint'` is the default and must stay byte-compatible, because ~40 other windows ride
 *    on it. Every case below asserts the elevated classes are ABSENT in tint mode.
 *  - `'elevated'` adds `pb-6` to the scroll wrapper. `overflow-x-auto overflow-y-visible`
 *    is computed as `auto` on BOTH axes per the CSS spec, so the wrapper clips vertically
 *    and the LAST row's `shadow-lg` (~22px of reach) was cut off — which read as "hover
 *    doesn't work on the last row". Overflow clips at the padding box, so the padding is
 *    what makes the shadow visible.
 *
 * These are className assertions, not behavioural ones: jsdom neither computes Tailwind nor
 * paints, so there is no observable "the row is elevated" state to assert on. The emitted
 * class list IS the contract here.
 */
import { render, screen } from '@testing-library/react';

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

/**
 * Renders the table and returns the class TOKENS of a row plus the scroll wrapper's ones.
 * Tokens, not the raw string: `hover:bg-card` contains `bg-card` as a substring, and the
 * whole point of the selection cases below is that the unprefixed `bg-card` is the one that
 * must go. `clickable` defaults to true (via `onNavigate`) because a row with no click
 * handler gets no hover class at all, in either style.
 */
function classTokens({ rowId = 'r1', clickable = true, ...props } = {}) {
  const { unmount } = render(
    <DataTable
      columns={COLUMNS}
      data={DATA}
      {...(clickable ? { onNavigate: () => {} } : {})}
      {...props}
    />,
  );
  const row = screen.getByTestId(`row-${rowId}`);
  // <Table> wraps the <table> in its own `relative w-full overflow-auto` div, so the
  // DataTable-owned scroll wrapper is one level further up.
  const wrapper = document.querySelector('table').parentElement.parentElement;
  const tokens = {
    row: row.className.split(/\s+/).filter(Boolean),
    wrapper: wrapper.className.split(/\s+/).filter(Boolean),
  };
  unmount();
  return tokens;
}

describe('DataTable — rowHoverStyle default (tint)', () => {
  it('tints the hovered row', () => {
    const { row } = classTokens();

    expect(row).toContain('hover:bg-muted/50');
    expect(row).toContain('transition-colors');
  });

  // The regression guard for every other window: opting one list into `elevated` must not
  // leak the lift into the ~40 grids that never asked for it.
  it('adds none of the elevated classes', () => {
    const { row } = classTokens();

    expect(row).not.toContain('hover:shadow-lg');
    expect(row).not.toContain('hover:z-10');
    expect(row).not.toContain('hover:bg-card');
    expect(row).not.toContain('bg-card');
    expect(row).not.toContain('transition-shadow');
  });

  it('is what an unset rowHoverStyle resolves to', () => {
    const unset = classTokens();
    const explicit = classTokens({ rowHoverStyle: 'tint' });

    expect(explicit.row).toEqual(unset.row);
    expect(explicit.wrapper).toEqual(unset.wrapper);
  });

  it('leaves the scroll wrapper without the shadow padding', () => {
    const { wrapper } = classTokens();

    expect(wrapper).toContain('overflow-x-auto');
    expect(wrapper).toContain('overflow-y-visible');
    expect(wrapper).not.toContain('pb-6');
  });
});

describe('DataTable — rowHoverStyle="elevated"', () => {
  it('lifts the hovered row with a shadow and stacking context', () => {
    const { row } = classTokens({ rowHoverStyle: 'elevated' });

    expect(row).toContain('hover:shadow-lg');
    expect(row).toContain('hover:z-10');
    expect(row).toContain('hover:bg-card');
  });

  it('makes the row a positioned, shadow-transitioning surface', () => {
    const { row } = classTokens({ rowHoverStyle: 'elevated' });

    // `relative` is what lets `hover:z-10` actually stack the row over its neighbours.
    expect(row).toContain('relative');
    expect(row).toContain('transition-shadow');
    expect(row).not.toContain('transition-colors');
  });

  it('paints the row opaque so the neighbours\' shadow does not bleed through', () => {
    const { row } = classTokens({ rowHoverStyle: 'elevated' });

    expect(row).toContain('bg-card');
  });

  it('drops the tint hover', () => {
    const { row } = classTokens({ rowHoverStyle: 'elevated' });

    expect(row).not.toContain('hover:bg-muted/50');
  });

  // Overflow clips at the PADDING box, so the 24px of bottom padding is what keeps the
  // last row's ~22px of shadow reach inside the visible area.
  it('reserves room under the last row for the shadow', () => {
    const { wrapper } = classTokens({ rowHoverStyle: 'elevated' });

    expect(wrapper).toContain('pb-6');
    expect(wrapper).toContain('overflow-x-auto');
  });
});

describe('DataTable — rowHoverStyle="elevated" vs selection', () => {
  // `bg-card` and the selection backgrounds compete on the same CSS property, and Tailwind
  // resolves that by stylesheet order rather than class order — so the opaque base has to
  // be withheld from a row a selection state is already painting, or the selection is lost.
  it('withholds the opaque base from the row matching selectedId', () => {
    const selected = classTokens({ rowHoverStyle: 'elevated', selectedId: 'r1', rowId: 'r1' });

    expect(selected.row).toContain('bg-primary/10');
    expect(selected.row).not.toContain('bg-card');
    // The hover lift itself survives — only the always-on background is dropped.
    expect(selected.row).toContain('hover:shadow-lg');
  });

  it('still paints the unselected rows opaque', () => {
    const other = classTokens({ rowHoverStyle: 'elevated', selectedId: 'r1', rowId: 'r2' });

    expect(other.row).toContain('bg-card');
    expect(other.row).not.toContain('bg-primary/10');
  });

  it('withholds the opaque base from the selected LINE row', () => {
    const line = classTokens({ rowHoverStyle: 'elevated', selectedRowId: 'r1', rowId: 'r1' });

    expect(line.row).toContain('bg-muted');
    expect(line.row).not.toContain('bg-card');
    // A selected line keeps its own hover, in both styles.
    expect(line.row).toContain('hover:bg-muted');
    expect(line.row).not.toContain('hover:shadow-lg');
  });
});

describe('DataTable — rowHoverStyle on non-clickable rows', () => {
  // Neither style adds a hover of its own to a row that cannot be clicked. The residual
  // `hover:bg-muted/50` on those rows comes from the shared `TableRow` base class, not from
  // getRowClassName — tailwind-merge only drops it when we emit a conflicting hover
  // background, which is exactly what `elevated` does for clickable rows.
  it('adds no hover of its own to a non-clickable row, in either style', () => {
    const tint = classTokens({ clickable: false });
    const elevated = classTokens({ clickable: false, rowHoverStyle: 'elevated' });

    for (const row of [tint.row, elevated.row]) {
      expect(row).toContain('cursor-default');
      expect(row).not.toContain('hover:shadow-lg');
      expect(row).not.toContain('hover:z-10');
      expect(row).not.toContain('hover:bg-card');
    }
  });

  it('keeps the named row group in both styles', () => {
    // `group/row` is what the reveal-on-hover cell affordances hang off (see
    // AccountsTable/__tests__/accountColumns.vitest.jsx), so neither style may drop it.
    expect(classTokens().row).toContain('group/row');
    expect(classTokens({ rowHoverStyle: 'elevated' }).row).toContain('group/row');
  });
});

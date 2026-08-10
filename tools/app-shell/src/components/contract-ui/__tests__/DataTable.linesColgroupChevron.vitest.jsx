/**
 * ETP-4735 — the add-row-only companion <table> DataTable renders under
 * InlineLinesPanel (hideHeader=true, when addRow.active) must reserve the
 * same leading columns InlineLinesPanel's own rows reserve, or the add-row's
 * inputs (e.g. movementQuantity/"Cantidad Movida") drift left of the header.
 *
 * Two compounding causes, both fixed here:
 *  1. renderLinesColgroup() didn't reserve a leading CHEVRON_COLUMN_WIDTH
 *     slot for the dimensions-panel expand chevron InlineLinesPanel renders
 *     whenever a `dimensionsPanel` column is present.
 *  2. DataTable's visibleColumns never excluded the `dimensionsPanel` column
 *     itself, so it rendered as a real ~120px placeholder cell/col — feeding
 *     growColumnWidth()'s fixedColsTotalPx and narrowing the grow column
 *     ahead of it, compounding the chevron gap.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DataTable, renderLinesColgroup } from '../DataTable.jsx';
import { CHEVRON_COLUMN_WIDTH } from '../InlineLinesPanel.jsx';

// Mock the heavy dependencies — same set DataTable.helpers.vitest.jsx already
// proved sufficient to import DataTable.jsx's module graph cleanly.
vi.mock('react-dom', () => ({ createPortal: (c) => c }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (k) => k,
  useLocale: () => 'en_US',
  useMenuLabel: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (u) => u }));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, field) => catalogs?.[field.key] || [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusTone: () => 'neutral',
  statusLabel: (s) => s,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (d, f) => d?.[f] }));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (c) => c.label }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({ applyCalloutUpdates: vi.fn() }));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 100,
  columnFlex: () => '1 0 100px',
}));

// Flattens renderLinesColgroup's returned <colgroup> children into an array of
// { width } for the <col> elements that actually render (filters out the
// `false`/`null` entries left by && short-circuits).
function renderedColWidths(colgroupEl) {
  const children = React.Children.toArray(colgroupEl.props.children).flat(Infinity);
  return children
    .filter(Boolean)
    .filter(el => el.type === 'col')
    .map(el => el.props.style.width);
}

const baseProps = {
  hideHeader: true,
  selectable: true,
  visibleColumns: [{ key: 'product', type: 'string' }],
  colFlexSpecs: [{ grow: 1, basis: 224 }],
  fixedColsTotalPx: 40,
  growCount: 1,
  ilpTrailing: true,
  hoverRowActions: false,
  onDeleteRow: undefined,
  legacyDeleteEnabled: false,
  onCloneRow: undefined,
  quickActionsEnabled: false,
  ilpHasNoAmountCol: true,
};

describe('renderLinesColgroup — ETP-4735 dimensions-panel chevron alignment', () => {
  it('reserves a leading CHEVRON_COLUMN_WIDTH col before the selectable col when hasDimensionsPanel', () => {
    const colgroup = renderLinesColgroup({ ...baseProps, hasDimensionsPanel: true });
    const widths = renderedColWidths(colgroup);
    // First entry must be the chevron slot, second the selectable checkbox.
    expect(widths[0]).toBe(CHEVRON_COLUMN_WIDTH);
    expect(widths[1]).toBe(40);
  });

  it('does NOT reserve a chevron col when hasDimensionsPanel is false', () => {
    const colgroup = renderLinesColgroup({ ...baseProps, hasDimensionsPanel: false });
    const widths = renderedColWidths(colgroup);
    expect(widths).not.toContain(CHEVRON_COLUMN_WIDTH);
    // First rendered col should be the 40px selectable checkbox directly.
    expect(widths[0]).toBe(40);
  });
});

// A <colgroup><col> entry with no matching cell in any actual <tr> does NOT
// reserve visual space — column count/width in a real <table> is driven by
// the cells present in its rows, not by unmatched <col> hints. The suite
// above only asserted on renderLinesColgroup()'s returned markup and missed
// exactly this: it stayed green while the add-row was still visibly
// misaligned in the real app, because DataTable's row-rendering paths
// (InlineAddRow, TableDataRow, the header row, the footer row) never grew a
// matching leading cell to go with the new <col>. This suite renders the
// real DataTable component and inspects the actual DOM to catch that class
// of gap — a passing renderLinesColgroup() test alone is not sufficient
// evidence the fix works.
describe('DataTable (real render) — ETP-4735 add-row leading chevron cell', () => {
  function renderAddRowWithDimensionsPanel() {
    const columns = [
      { key: 'product', label: 'Product', type: 'string' },
      {
        key: 'dimensions', type: 'dimensionsPanel', label: 'Dimensions',
        dimensionFields: [{ key: 'project', label: 'Project', type: 'string' }],
      },
    ];
    const fields = [{ key: 'product', label: 'Product', type: 'string' }];
    return render(
      <DataTable
        columns={columns}
        data={[]}
        addRow={{ active: true, fields, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
        selectable
        hideHeader
        hideDataRows
        linesLayout="inlineEditable"
      />,
    );
  }

  it('renders an actual leading <td> reserving CHEVRON_COLUMN_WIDTH in the add-row — not just a <col> hint', () => {
    renderAddRowWithDimensionsPanel();
    const row = screen.getByTestId('inline-add-row');
    const cells = row.querySelectorAll('td');
    expect(cells.length).toBeGreaterThan(0);
    // First real cell must be the aria-hidden chevron placeholder, sized
    // CHEVRON_COLUMN_WIDTH — everything after it (the checkbox spinner cell,
    // then product) must land in its own correct column, not shifted left.
    expect(cells[0]).toHaveAttribute('aria-hidden', 'true');
    expect(cells[0].style.width).toBe(`${CHEVRON_COLUMN_WIDTH}px`);
  });

  it('does NOT render a leading chevron <td> when there is no dimensionsPanel column', () => {
    const columns = [{ key: 'product', label: 'Product', type: 'string' }];
    const fields = [{ key: 'product', label: 'Product', type: 'string' }];
    render(
      <DataTable
        columns={columns}
        data={[]}
        addRow={{ active: true, fields, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
        selectable
        hideHeader
        hideDataRows
        linesLayout="inlineEditable"
      />,
    );
    const row = screen.getByTestId('inline-add-row');
    const cells = row.querySelectorAll('td');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0].style.width).not.toBe(`${CHEVRON_COLUMN_WIDTH}px`);
  });
});

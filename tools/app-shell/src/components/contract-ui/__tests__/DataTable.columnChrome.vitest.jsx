// @covers tools/app-shell/src/components/contract-ui/DataTable.jsx
// @covers tools/app-shell/src/hooks/useGridView.js
/**
 * DataTable — opt-in per-column chrome (`col.headClass` / `col.cellClass`), ETP-4658 Fase 0.
 *
 * List windows whose design pins column widths (financial-account's Figma layout aligns the
 * "Cuenta" header with the row avatar) could not express that through `columns` before. Both
 * classes are additive and optional: absent means the auto layout every existing window
 * relies on stays byte-identical, which the "no chrome" cases below lock in by comparing the
 * emitted class string against the chromeless baseline.
 *
 * Note on indices: DataTable always emits a leading gutter/selection cell, so the column
 * under test is cell index 1 in both the header row and the body row.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockApiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

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
vi.mock('@/lib/linesColumnWidth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: (col) => (col?.gridUserWidthPx != null ? Number(col.gridUserWidthPx) : 100),
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('../InlineSearchCombo.jsx', () => ({ InlineSearchCombo: () => null }));
vi.mock('../RowQuickActions.jsx', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';
import { useGridView } from '@/hooks/useGridView.js';

const DATA = [{ id: 'r1', name: 'BBVA', total: 10 }];

/**
 * Renders a single-column table and returns the emitted class strings for that column's
 * header and body cell. Unmounts so successive calls in one test stay isolated.
 */
function classesFor(col) {
  const { unmount } = render(<DataTable columns={[col]} data={DATA} />);
  const th = document.querySelectorAll('thead th')[1].className;
  const td = screen.getByTestId('row-r1').querySelectorAll('td')[1].className;
  unmount();
  return { th, td };
}

const STRING_COL = { key: 'name', label: 'Name', type: 'string' };
const AMOUNT_COL = { key: 'total', label: 'Total', type: 'amount' };

describe('DataTable — col.headClass', () => {
  it('appends headClass to the column header cell', () => {
    const { th } = classesFor({ ...STRING_COL, headClass: 'w-[480px] pl-[84px]' });

    expect(th).toContain('w-[480px]');
    expect(th).toContain('pl-[84px]');
  });

  it('appends it — the base header classes survive', () => {
    const { th } = classesFor({ ...STRING_COL, headClass: 'sf-head-chrome' });
    const baseline = classesFor(STRING_COL).th;

    expect(th).toBe(`${baseline} sf-head-chrome`);
  });

  it('composes headClass with the numeric right-alignment instead of replacing it', () => {
    const { th } = classesFor({ ...AMOUNT_COL, headClass: 'w-[200px]' });

    expect(th).toContain('text-right');
    expect(th).toContain('w-[200px]');
  });

  it('leaves the header class list untouched when no headClass is given', () => {
    const withEmpty = classesFor({ ...STRING_COL, headClass: '' }).th;
    const withUndefined = classesFor(STRING_COL).th;

    expect(withEmpty).toBe(withUndefined);
    expect(withUndefined).toContain('align-middle');
  });
});

describe('DataTable — col.cellClass', () => {
  it('appends cellClass to the body cell', () => {
    const { td } = classesFor({ ...STRING_COL, cellClass: 'w-[480px]' });

    expect(td).toContain('w-[480px]');
  });

  it('appends it — the base body classes survive', () => {
    const { td } = classesFor({ ...STRING_COL, cellClass: 'sf-cell-chrome' });
    const baseline = classesFor(STRING_COL).td;

    expect(td).toBe(`${baseline} sf-cell-chrome`);
  });

  it('composes cellClass with the numeric right-alignment instead of replacing it', () => {
    const { td } = classesFor({ ...AMOUNT_COL, cellClass: 'w-[200px]' });

    expect(td).toContain('tabular-nums');
    expect(td).toContain('text-right');
    expect(td).toContain('w-[200px]');
  });

  it('leaves the body class list untouched when no cellClass is given', () => {
    const withEmpty = classesFor({ ...STRING_COL, cellClass: '' }).td;
    const withUndefined = classesFor(STRING_COL).td;

    expect(withEmpty).toBe(withUndefined);
    expect(withUndefined).toContain('text-sm');
  });

  it('is independent of headClass on the same column', () => {
    const { th, td } = classesFor({ ...STRING_COL, headClass: 'sf-head-only' });

    expect(th).toContain('sf-head-only');
    expect(td).not.toContain('sf-head-only');
  });
});

describe('DataTable — per-column isolation', () => {
  it('applies each column\'s chrome only to that column', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'Name', type: 'string', headClass: 'sf-head-a', cellClass: 'sf-cell-a' },
          { key: 'total', label: 'Total', type: 'string', headClass: 'sf-head-b', cellClass: 'sf-cell-b' },
        ]}
        data={DATA}
      />,
    );

    const [, nameTh, totalTh] = document.querySelectorAll('thead th');
    expect(nameTh.className).toContain('sf-head-a');
    expect(nameTh.className).not.toContain('sf-head-b');
    expect(totalTh.className).toContain('sf-head-b');

    const [, nameTd, totalTd] = screen.getByTestId('row-r1').querySelectorAll('td');
    expect(nameTd.className).toContain('sf-cell-a');
    expect(nameTd.className).not.toContain('sf-cell-b');
    expect(totalTd.className).toContain('sf-cell-b');
  });

  it('wraps a custom col.render body inside the styled cell', () => {
    render(
      <DataTable
        columns={[{
          ...STRING_COL,
          cellClass: 'sf-cell-custom',
          render: (row) => <span data-testid={`custom-${row.id}`}>{row.name}</span>,
        }]}
        data={DATA}
      />,
    );

    const td = screen.getByTestId('row-r1').querySelectorAll('td')[1];
    expect(td.className).toContain('sf-cell-custom');
    expect(td).toContainElement(screen.getByTestId('custom-r1'));
  });
});

describe('DataTable — headless grid-view interaction and presentation order', () => {
  const viewId = (key) => `list:ad:${key}:field:${key.toLowerCase()}`;

  function createGridView(overrides = {}) {
    return {
      active: true,
      columns: [
        { ...AMOUNT_COL, gridViewId: viewId('Total'), gridUserWidthPx: 180, grow: false },
        { ...STRING_COL, gridViewId: viewId('Name'), gridUserWidthPx: 240, grow: false },
      ],
      availableKeys: ['total', 'name'],
      columnSizing: { [viewId('Total')]: 180, [viewId('Name')]: 240 },
      reorderable: vi.fn(() => true),
      moveColumn: vi.fn(),
      moveByKeyboard: vi.fn(),
      isResizable: vi.fn(() => true),
      widthBounds: vi.fn(() => ({ min: 100, max: 1200 })),
      resizeHandler: vi.fn(() => vi.fn()),
      resizeBy: vi.fn(),
      ...overrides,
    };
  }

  it('keeps header, body and total cells in the same personalized order, including the row-selection slot', () => {
    const gridView = createGridView();
    render(
      <DataTable
        columns={[STRING_COL, AMOUNT_COL]}
        data={[{ id: 'r1', name: 'BBVA', total: 10 }]}
        gridView={gridView}
        showFooterTotals
      />,
    );

    expect(screen.getByTestId('column-header-total')).toBeInTheDocument();
    const headers = Array.from(document.querySelectorAll('thead th')).map((cell) => cell.textContent.trim());
    expect(headers.slice(1)).toEqual(['Total', 'Name']);
    const body = Array.from(screen.getByTestId('row-r1').querySelectorAll('td')).map((cell) => cell.textContent.trim());
    expect(body.slice(1)).toEqual(['10', 'BBVA']);
    const footer = Array.from(document.querySelectorAll('tfoot td')).map((cell) => cell.textContent.trim());
    expect(footer).toHaveLength(3);
    expect(footer[1]).not.toBe('');
    expect(footer[2]).toBe('');
  });

  it('exposes accessible keyboard reorder and resize controls and forwards their actions to the headless model', () => {
    const gridView = createGridView({
      reorderable: (id) => id === viewId('Name'),
      isResizable: (id) => id === viewId('Name'),
    });
    render(<DataTable columns={[STRING_COL, AMOUNT_COL]} data={DATA} gridView={gridView} />);

    const moveHandle = screen.getByRole('button', { name: 'moveGridColumn' });
    expect(moveHandle).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(moveHandle, { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(gridView.moveByKeyboard).toHaveBeenCalledWith(viewId('Name'), 1);

    const resizeHandle = screen.getByRole('separator', { name: 'resizeGridColumn' });
    expect(resizeHandle).toHaveAttribute('aria-valuemin', '100');
    expect(resizeHandle).toHaveAttribute('aria-valuemax', '1200');
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '240');
    expect(resizeHandle).toHaveClass('w-4', 'cursor-col-resize');
    expect(resizeHandle.querySelector('[aria-hidden="true"]')).toHaveClass('bg-border', 'group-hover:bg-muted-foreground', 'group-focus-visible:bg-primary');
    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' });
    expect(gridView.resizeBy).toHaveBeenCalledWith(viewId('Name'), -10);
  });

  it('cancels native header dragging while forwarding the resize mouse gesture', () => {
    const resize = vi.fn();
    const gridView = createGridView({ resizeHandler: vi.fn(() => resize) });
    render(<DataTable columns={[STRING_COL, AMOUNT_COL]} data={DATA} gridView={gridView} />);

    const resizeHandle = screen.getAllByRole('separator', { name: 'resizeGridColumn' })[0];
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 100 });
    resizeHandle.dispatchEvent(mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(resize).toHaveBeenCalled();
  });

  it('resizes with the mouse and applies one width to header, body and colgroup', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 204 });
    const columns = [
      { ...STRING_COL, gridDefaultWidthPx: 180 },
      { ...AMOUNT_COL, gridDefaultWidthPx: 260 },
    ];

    function ResizableList() {
      const gridView = useGridView({
        spec: 'tax',
        entity: 'Tax',
        columns,
        data: DATA,
        enabled: true,
        apiBaseUrl: '/sws',
      });
      return <DataTable columns={columns} data={DATA} gridView={gridView} />;
    }

    render(<ResizableList />);
    const resizeHandles = await screen.findAllByRole('separator', { name: 'resizeGridColumn' });
    expect(resizeHandles).toHaveLength(2);
    const resizeHandle = resizeHandles.find((handle) => handle.getAttribute('aria-valuenow') === '260');
    expect(resizeHandle).toBeTruthy();

    fireEvent.mouseDown(resizeHandle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 140 });
    fireEvent.mouseUp(document, { clientX: 140 });

    await waitFor(() => expect(resizeHandle).toHaveAttribute('aria-valuenow', '300'));
    const header = screen.getByTestId('column-header-total');
    const row = screen.getByTestId('row-r1');
    const cells = Array.from(row.querySelectorAll('td'));
    const headerIndex = Array.from(header.parentElement.children).indexOf(header);
    const bodyCell = cells[headerIndex];
    const bodyTable = row.closest('table');
    const col = bodyTable.querySelectorAll('colgroup col')[headerIndex];

    expect(header.style.width).toBe('300px');
    expect(bodyCell.style.minWidth).toBe('300px');
    expect(col.style.width).toBe('300px');
  });

  it('keeps locked and structural columns out of reorder handles while preserving custom renderers', () => {
    const gridView = createGridView({
      columns: [
        { ...STRING_COL, gridViewId: viewId('Name'), render: (row) => <span data-testid="grid-custom-cell">{row.name}</span> },
      ],
      availableKeys: ['name'],
      reorderable: () => false,
      isResizable: () => false,
    });
    render(
      <DataTable
        columns={[STRING_COL, { key: 'actions', label: 'Actions', headClass: 'locked-slot' }]}
        data={DATA}
        gridView={gridView}
      />,
    );

    expect(screen.getByTestId('grid-custom-cell')).toHaveTextContent('BBVA');
    expect(screen.queryByRole('button', { name: 'moveGridColumn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'resizeGridColumn' })).not.toBeInTheDocument();
    expect(screen.getByTestId('column-header-actions')).toBeInTheDocument();
  });
});

/**
 * ETP-5281, follow-up ETP-5268 — the generic `columnMinWidthPx(col, colIdx)`
 * floor applied to both the header (`renderColumnHeaderCell`) and body
 * (`TableDataRow`) cells, and its skip when the column opts into
 * `headClass`/`cellClass` pinning. `columnMinWidthPx` is mocked (above) to a
 * constant 100. The header cell uses `style.width` (a real `width`, not
 * `minWidth` — `table-layout: fixed` ignores `minWidth` entirely, verified
 * live: every column rendered at an identical equal share of the container
 * regardless of it), since table-layout:fixed only reads a column's width
 * off the FIRST row (the header); the body cell keeps `style.minWidth`,
 * which is inert for column sizing under fixed layout but harmless to leave.
 */
describe('DataTable — generic minWidth floor', () => {
  it('applies the width floor to the header cell and the minWidth floor to the body cell when no headClass/cellClass is set', () => {
    // ETP-5510 — a lone column would become the implicit width-less `grow` column, so the
    // floor is asserted on the other one. ETP-5833: the absorber is the first DESCRIPTIVE
    // column (the string), so the floor is asserted on the leading amount.
    render(<DataTable columns={[AMOUNT_COL, STRING_COL]} data={DATA} />);

    const th = screen.getByTestId('column-header-total');
    const td = screen.getByTestId('row-r1').querySelectorAll('td')[1];

    expect(th.style.width).toBe('100px');
    expect(td.style.minWidth).toBe('100px');
  });

  it('skips the width/minWidth floor on both header and body cell when headClass/cellClass is set', () => {
    render(
      <DataTable
        columns={[{ ...STRING_COL, headClass: 'w-[200px]', cellClass: 'w-[200px]' }]}
        data={DATA}
      />,
    );

    const th = screen.getByTestId('column-header-name');
    const td = screen.getByTestId('row-r1').querySelectorAll('td')[1];

    expect(th.style.width).toBe('');
    expect(td.style.minWidth).toBe('');
  });

  // ETP follow-up (Tax window) — `col.grow` is the sanctioned way to let one
  // column absorb 100% of a sparse window's leftover space: omitting `width`
  // entirely on the header cell (not a calc()/percentage, which the doc
  // comment above already found resolves to 0px — see getTableContainerStyle
  // in DataTable.jsx) is a plain, non-circular case table-layout: fixed
  // handles natively.
  it('also skips the header width floor when col.grow is set, independent of headClass', () => {
    render(<DataTable columns={[{ ...STRING_COL, grow: true }]} data={DATA} />);

    const th = screen.getByTestId('column-header-name');
    expect(th.style.width).toBe('');
  });
});

/**
 * ETP-5281 — `renderHeaderLabelContent` wraps the column label in a
 * `<span className="min-w-0 truncate" title={colLabel}>`, so a label that overflows
 * its header cell clips with an ellipsis instead of pushing into the next column, and
 * the full text stays available via the native title tooltip on hover. The prior guard
 * (`DataTable.numericHeaderAlignment.test.js`) only regexes the DataTable.jsx source —
 * it never renders the label, so a change that dropped these classes from the actual
 * DOM (e.g. an unrelated JSX refactor of renderHeaderLabelContent) would not be caught.
 */
describe('DataTable — header label truncation', () => {
  const LONG_LABEL = 'A very long column header label that would otherwise overflow the cell';
  const LONG_LABEL_COL = { key: 'name', label: LONG_LABEL, type: 'string' };

  it('renders the label span with truncation classes', () => {
    render(<DataTable columns={[LONG_LABEL_COL]} data={DATA} />);

    const th = screen.getByTestId('column-header-name');
    const labelSpan = th.querySelector('span.truncate');

    expect(labelSpan).toBeTruthy();
    expect(labelSpan.className).toContain('min-w-0');
    expect(labelSpan.className).toContain('truncate');
  });

  it('sets the title attribute to the full untruncated label text', () => {
    render(<DataTable columns={[LONG_LABEL_COL]} data={DATA} />);

    const th = screen.getByTestId('column-header-name');
    const labelSpan = th.querySelector('span.truncate');

    expect(labelSpan).toHaveAttribute('title', LONG_LABEL);
    expect(labelSpan).toHaveTextContent(LONG_LABEL);
  });
});

/**
 * Covers row-selection interactions in InlineLinesPanel — toggleRow,
 * toggleAll, and the "prune deleted IDs from selection" effect — none of
 * which are exercised by the base InlineLinesPanel.vitest.jsx suite (which
 * only asserts `clearSelection` via the imperative ref, never the checkboxes
 * themselves).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import React, { createRef } from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => {
    const idKey = `${key}$_identifier`;
    return row[idKey] || row[key] || '';
  },
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label || col.key,
}));

vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field, displayLabel }) => (
    <span data-testid={`inline-combo-${field.key}`}>{displayLabel}</span>
  ),
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => <div data-testid="dimension-field" />,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('./quickActionsStyle.js', () => ({
  QUICK_ACTIONS_PILL_CLASS: 'pill',
}));

const COLUMNS = [
  { key: 'product', label: 'Product', type: 'string', column: 'M_Product_ID' },
  { key: 'quantity', label: 'Qty', type: 'number' },
];

const ROWS = [
  { id: 'L1', product: 'P1', 'product$_identifier': 'Widget', quantity: 10 },
  { id: 'L2', product: 'P2', 'product$_identifier': 'Gadget', quantity: 3 },
  { id: 'L3', product: 'P3', 'product$_identifier': 'Gizmo', quantity: 7 },
];

function renderPanel(props = {}) {
  const ref = createRef();
  const result = render(
    <InlineLinesPanel
      ref={ref}
      columns={COLUMNS}
      data={ROWS}
      entity="lines"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
      {...props}
    />,
  );
  return { ...result, ref };
}

function getRowCheckbox(rowId) {
  return screen.getByTestId(`line-row-${rowId}`).querySelector('[data-testid="Checkbox__3b7ec2"]');
}

function getHeaderCheckbox() {
  // The header checkbox is the only Checkbox__3b7ec2 NOT nested under a line-row-* testid.
  const all = screen.getAllByTestId('Checkbox__3b7ec2');
  return all.find(el => !el.closest('[data-testid^="line-row-"]'));
}

describe('InlineLinesPanel row selection (toggleRow / toggleAll)', () => {
  it('selecting a single row calls onSelectionChange with just that row', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSelectionChange });

    await user.click(getRowCheckbox('L1'));

    expect(onSelectionChange).toHaveBeenCalledWith([ROWS[0]]);
  });

  it('selecting a second row accumulates the selection', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSelectionChange });

    await user.click(getRowCheckbox('L1'));
    await user.click(getRowCheckbox('L2'));

    expect(onSelectionChange).toHaveBeenLastCalledWith([ROWS[0], ROWS[1]]);
  });

  it('unchecking a selected row removes it from the selection', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSelectionChange });

    await user.click(getRowCheckbox('L1'));
    await user.click(getRowCheckbox('L1'));

    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('the header "select all" checkbox selects every row', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSelectionChange });

    await user.click(getHeaderCheckbox());

    expect(onSelectionChange).toHaveBeenCalledWith(ROWS);
  });

  it('clicking "select all" again (all already selected) clears the selection', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSelectionChange });

    await user.click(getHeaderCheckbox());
    await user.click(getHeaderCheckbox());

    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('row checkboxes are disabled (cursor-not-allowed, no toggle) when isDocumentReadOnly', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ isDocumentReadOnly: true, onSelectionChange });

    expect(getRowCheckbox('L1').className).toContain('cursor-not-allowed');
    expect(getHeaderCheckbox().className).toContain('cursor-not-allowed');

    await user.click(getRowCheckbox('L1'));
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('prunes a selected row from the selection Set when it disappears from data (deleted externally)', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderPanel({ onSelectionChange, data: ROWS });

    await user.click(getRowCheckbox('L2'));
    onSelectionChange.mockClear();

    // Simulate the row being removed from the parent's data (e.g. a bulk
    // delete elsewhere) without ever calling clearSelection — the
    // "prune deleted IDs" effect should drop L2 from selectedRows on its own.
    rerender(
      <InlineLinesPanel
        columns={COLUMNS}
        data={ROWS.filter(r => r.id !== 'L2')}
        entity="lines"
        token="test"
        apiBaseUrl="/api"
        selectorContext={{}}
        onSelectionChange={onSelectionChange}
        onUpdateRow={vi.fn().mockResolvedValue()}
        onDeleteRow={vi.fn().mockResolvedValue()}
      />,
    );

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('does not fire onSelectionChange again when the pruned data still contains every selected row', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderPanel({ onSelectionChange, data: ROWS });

    await user.click(getRowCheckbox('L1'));
    onSelectionChange.mockClear();

    // Re-render with the exact same data (no rows removed) — the prune
    // effect's `!changed` early-return means onSelectionChange should NOT
    // be invoked again just from this re-render.
    rerender(
      <InlineLinesPanel
        columns={COLUMNS}
        data={[...ROWS]}
        entity="lines"
        token="test"
        apiBaseUrl="/api"
        selectorContext={{}}
        onSelectionChange={onSelectionChange}
        onUpdateRow={vi.fn().mockResolvedValue()}
        onDeleteRow={vi.fn().mockResolvedValue()}
      />,
    );

    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});

/**
 * ETP-5030 — ticking a row checkbox in a secondary-tab grid produced no visual
 * change: `isSelected` was computed for the <Checkbox checked> prop only and
 * never reached the row's className, so the selected row rendered
 * byte-identically to an unselected one.
 *
 * The reference behaviour lives in DataTable: `selectedRowBg` (DataTable.jsx,
 * `bg-primary/5` for the non-hoverRowActions grids) applied inside
 * `getRowClassName`, guarded by `selectionPainted` so the row's own hardcoded
 * base background is dropped while a selection is painting the row (Tailwind
 * resolves two competing `background-color` utilities by stylesheet order, not
 * by class order). InlineLinesPanel must mirror both halves of that contract so
 * the tab grid and the main list grid shade a selected row the same way.
 */
const SELECTED_ROW_BG = 'bg-primary/5';
const BASE_ROW_BG = 'bg-card';

function getRow(rowId) {
  return screen.getByTestId(`line-row-${rowId}`);
}

function isRowShaded(rowId) {
  return getRow(rowId).classList.contains(SELECTED_ROW_BG);
}

describe('InlineLinesPanel row selection shading (ETP-5030)', () => {
  it('shades only the row whose checkbox was ticked', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(isRowShaded('L1')).toBe(false);

    await user.click(getRowCheckbox('L1'));

    expect(isRowShaded('L1')).toBe(true);
    expect(isRowShaded('L2')).toBe(false);
    expect(isRowShaded('L3')).toBe(false);
  });

  it('shades every selected row when several are ticked, leaving the rest untouched', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(getRowCheckbox('L1'));
    await user.click(getRowCheckbox('L3'));

    expect(isRowShaded('L1')).toBe(true);
    expect(isRowShaded('L3')).toBe(true);
    expect(isRowShaded('L2')).toBe(false);
  });

  it('shades every row when the header "select all" checkbox is ticked', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(getHeaderCheckbox());

    expect(isRowShaded('L1')).toBe(true);
    expect(isRowShaded('L2')).toBe(true);
    expect(isRowShaded('L3')).toBe(true);
  });

  it('restores the unselected appearance when a selected row is unticked', async () => {
    const user = userEvent.setup();
    renderPanel();

    const before = getRow('L1').className;

    await user.click(getRowCheckbox('L1'));
    expect(isRowShaded('L1')).toBe(true);

    await user.click(getRowCheckbox('L1'));

    expect(isRowShaded('L1')).toBe(false);
    // Round-trips back to exactly the pre-selection appearance, so the fix
    // cannot leave residual selection styling behind on deselect.
    expect(getRow('L1').className).toBe(before);
  });

  it('drops the row base background while the selection background is painting (DataTable selectionPainted guard)', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(getRow('L1').classList.contains(BASE_ROW_BG)).toBe(true);

    await user.click(getRowCheckbox('L1'));

    // Both utilities set `background-color`; keeping `bg-card` would let it win
    // by stylesheet order and the shading would never be visible to the user.
    expect(getRow('L1').classList.contains(BASE_ROW_BG)).toBe(false);
    expect(getRow('L2').classList.contains(BASE_ROW_BG)).toBe(true);
  });
});

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

const HIGHLIGHT_ROW_BG = 'bg-muted/40';
const HIGHLIGHT_RING = ['ring-1', 'ring-focus-ring'];
const BACKGROUND_UTILITIES = [BASE_ROW_BG, HIGHLIGHT_ROW_BG, SELECTED_ROW_BG];

function backgroundUtilitiesOn(rowId) {
  const { classList } = getRow(rowId);
  return BACKGROUND_UTILITIES.filter(cls => classList.contains(cls));
}

function hasHighlightRing(rowId) {
  const { classList } = getRow(rowId);
  return HIGHLIGHT_RING.every(cls => classList.contains(cls));
}

/**
 * `selectedRowId` marks "the line whose detail form is currently open" — it is
 * the `isHighlighted` input of computeRowClassName. These cases pin the two
 * branches the ETP-5030 restructure changed: which single background utility
 * wins per state, and that the highlight ring survives a checkbox tick (an
 * earlier iteration of the fix suppressed the ring, erasing the only cue that a
 * line's form was open).
 */
describe('InlineLinesPanel row highlight vs selection (ETP-5030)', () => {
  it('paints a highlighted-but-unselected row with the muted tint and the focus ring', () => {
    renderPanel({ selectedRowId: 'L1' });

    expect(getRow('L1').classList.contains(HIGHLIGHT_ROW_BG)).toBe(true);
    expect(hasHighlightRing('L1')).toBe(true);
    expect(getRow('L1').classList.contains(SELECTED_ROW_BG)).toBe(false);
    expect(getRow('L1').classList.contains(BASE_ROW_BG)).toBe(false);
  });

  it('leaves every row other than the highlighted one on the base background with no ring', () => {
    renderPanel({ selectedRowId: 'L1' });

    for (const rowId of ['L2', 'L3']) {
      expect(getRow(rowId).classList.contains(BASE_ROW_BG)).toBe(true);
      expect(getRow(rowId).classList.contains(HIGHLIGHT_ROW_BG)).toBe(false);
      expect(hasHighlightRing(rowId)).toBe(false);
    }
  });

  it('keeps the focus ring on a highlighted row once its checkbox is ticked, swapping the tint for the selected shade', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedRowId: 'L1' });

    await user.click(getRowCheckbox('L1'));

    expect(getRow('L1').classList.contains(SELECTED_ROW_BG)).toBe(true);
    expect(hasHighlightRing('L1')).toBe(true);
    expect(getRow('L1').classList.contains(HIGHLIGHT_ROW_BG)).toBe(false);
    expect(getRow('L1').classList.contains(BASE_ROW_BG)).toBe(false);
  });

  it('gives a selected-but-unhighlighted row the selection tint and no ring', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedRowId: 'L1' });

    await user.click(getRowCheckbox('L2'));

    expect(getRow('L2').classList.contains(SELECTED_ROW_BG)).toBe(true);
    expect(hasHighlightRing('L2')).toBe(false);
  });

  it('emits exactly one background utility in each of the four selection/highlight states', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedRowId: 'L1' });

    // highlighted only (L1) and neither (L2)
    expect(backgroundUtilitiesOn('L1')).toEqual([HIGHLIGHT_ROW_BG]);
    expect(backgroundUtilitiesOn('L2')).toEqual([BASE_ROW_BG]);

    await user.click(getRowCheckbox('L1'));
    await user.click(getRowCheckbox('L2'));

    // highlighted + selected (L1) and selected only (L2)
    expect(backgroundUtilitiesOn('L1')).toEqual([SELECTED_ROW_BG]);
    expect(backgroundUtilitiesOn('L2')).toEqual([SELECTED_ROW_BG]);
  });

  it('returns a highlighted row to the muted tint plus the ring when its checkbox is unticked', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedRowId: 'L1' });

    await user.click(getRowCheckbox('L1'));
    expect(getRow('L1').classList.contains(SELECTED_ROW_BG)).toBe(true);

    await user.click(getRowCheckbox('L1'));

    expect(backgroundUtilitiesOn('L1')).toEqual([HIGHLIGHT_ROW_BG]);
    expect(hasHighlightRing('L1')).toBe(true);
  });

  it('stacks the editing elevation on top of the selection tint instead of replacing it', async () => {
    renderPanel();

    // The direct (non-`setup`) userEvent API is used deliberately: each call
    // starts from a fresh pointer position, so hovering the row after clicking
    // its checkbox re-fires the mouseenter that reveals the action strip.
    await userEvent.click(getRowCheckbox('L1'));
    const row = getRow('L1');
    await userEvent.hover(row);
    await userEvent.click(row.querySelector('[data-testid="Pencil__3b7ec2"]').closest('button'));

    const edited = getRow('L1');
    expect(edited.querySelector('[data-testid="field-quantity"]')).not.toBeNull();
    expect(backgroundUtilitiesOn('L1')).toEqual([SELECTED_ROW_BG]);
    expect(edited.classList.contains('relative')).toBe(true);
    expect(edited.classList.contains('z-20')).toBe(true);
  });
});

/**
 * Behavioural counterpart to the source-text assertion in
 * InlineLinesPanel.test.js ("lifts the row with a shadow on hover"). That
 * regex-over-source check was previously satisfied by a stale prose comment
 * (`hover:z-10`) while the emitted class was `hover:z-20`, so it could not have
 * caught a drift. These assert the classes actually present on the rendered row.
 */
describe('InlineLinesPanel row hover elevation', () => {
  it('gives every row the hover lift utilities so the shadow is not clipped by its neighbors', () => {
    renderPanel();

    for (const rowId of ['L1', 'L2', 'L3']) {
      const { classList } = getRow(rowId);
      expect(classList.contains('hover:relative')).toBe(true);
      expect(classList.contains('hover:z-20')).toBe(true);
      expect(classList.contains('hover:z-10')).toBe(false);
      expect(classList.contains('transition-shadow')).toBe(true);
    }
  });

  it('keeps the hover lift utilities on selected and highlighted rows', async () => {
    const user = userEvent.setup();
    renderPanel({ selectedRowId: 'L1' });

    await user.click(getRowCheckbox('L2'));

    for (const rowId of ['L1', 'L2']) {
      expect(getRow(rowId).classList.contains('hover:z-20')).toBe(true);
    }
  });
});

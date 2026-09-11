/**
 * InlineLinesPanel — the hover "action strip" may only take over the LAST column.
 *
 * ETP-5245 (regression) — `trailingColumn` used to scan backwards for the last
 * column of type `amount` and suppress THAT cell while the row's hover/edit action
 * strip is showing (the strip is always appended at the END of the flex row). That
 * is only invisible when the amount column actually IS the last visible column.
 *
 * On Product > Costo (`cost` amount, `startingDate`, `endingDate`) the amount is the
 * FIRST column, so hovering a row deleted the leading cell while the strip appeared
 * on the far right: every remaining cell slid one slot to the left, the amount
 * vanished, and the body no longer lined up with the (never-suppressed) header.
 * Same shape on every other lines/secondary tab whose amount column is not last —
 * e.g. purchase-invoice > PaymentDetailsTable (`amount`, `invoicePaid`).
 *
 * Invariant under test: hovering a row NEVER changes how many cells it renders, nor
 * their order, and the body always renders exactly as many grid cells as the header
 * renders column headers. The deliberate swap (amount genuinely last) is asserted
 * too, so the fix cannot be "just stop suppressing".
 *
 * Same mocks/harness convention as InlineLinesPanel.cellBadges.vitest.jsx.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import React from 'react';

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
  default: () => null,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('./quickActionsStyle.js', () => ({
  QUICK_ACTIONS_PILL_CLASS: 'pill',
}));

// The real Product > Costo tab column set (artifacts/product/generated/web/product/CostingTable.jsx).
const COSTING_COLUMNS = [
  { key: 'cost', label: 'Cost', type: 'amount', column: 'Cost', required: true },
  { key: 'startingDate', label: 'Starting Date', type: 'date', column: 'DateFrom', required: true },
  { key: 'endingDate', label: 'Ending Date', type: 'date', column: 'DateTo' },
];

const COSTING_ROWS = [
  { id: 'C1', cost: 98.47, startingDate: '2026-04-16', endingDate: '9999-12-31', manual: 'N' },
  { id: 'C2', cost: 100.0, startingDate: '2026-04-16', endingDate: '2026-04-16', manual: 'N' },
];

// A document-lines shape where the amount IS the last column — the case the
// suppress-and-swap behavior was designed for and must keep.
const TRAILING_AMOUNT_COLUMNS = [
  { key: 'product', label: 'Product', type: 'string', column: 'M_Product_ID' },
  { key: 'quantity', label: 'Quantity', type: 'quantity' },
  { key: 'lineNetAmount', label: 'Net Amount', type: 'amount' },
];

const TRAILING_AMOUNT_ROWS = [
  { id: 'L1', product: 'P1', 'product$_identifier': 'Widget', quantity: 2, lineNetAmount: 50 },
];

function renderPanel(columns, data, props = {}) {
  return render(
    <InlineLinesPanel
      columns={columns}
      data={data}
      entity="costing"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
      {...props}
    />,
  );
}

const cellKeys = (rowEl) =>
  Array.from(rowEl.querySelectorAll('[data-cell-key]')).map((el) => el.getAttribute('data-cell-key'));

const headerKeys = () =>
  Array.from(document.querySelectorAll('[data-testid^="column-header-"]'))
    .map((el) => el.getAttribute('data-testid').replace('column-header-', ''));

describe('InlineLinesPanel — hover action strip vs. a non-trailing amount column (ETP-5245)', () => {
  it('keeps every cell of the hovered row when the amount column is not last', async () => {
    const user = userEvent.setup();
    renderPanel(COSTING_COLUMNS, COSTING_ROWS);

    const row = screen.getByTestId('line-row-C1');
    const before = cellKeys(row);
    expect(before).toEqual(['cost', 'startingDate', 'endingDate']);

    await user.hover(row);
    // The hover strip is showing...
    expect(screen.getByTestId('Pencil__3b7ec2')).toBeTruthy();
    // ...and the row still renders the exact same cells, in the same order.
    expect(cellKeys(row)).toEqual(before);
    expect(row.querySelector('[data-cell-key="cost"]')).not.toBeNull();
  });

  it('keeps the body aligned with the header while hovering', async () => {
    const user = userEvent.setup();
    renderPanel(COSTING_COLUMNS, COSTING_ROWS);

    const row = screen.getByTestId('line-row-C1');
    expect(cellKeys(row)).toEqual(headerKeys());

    await user.hover(row);
    expect(cellKeys(row)).toEqual(headerKeys());
  });

  it('leaves the non-hovered rows untouched', async () => {
    const user = userEvent.setup();
    renderPanel(COSTING_COLUMNS, COSTING_ROWS);

    const hovered = screen.getByTestId('line-row-C1');
    const other = screen.getByTestId('line-row-C2');
    const otherBefore = cellKeys(other);

    await user.hover(hovered);
    expect(cellKeys(other)).toEqual(otherBefore);
  });

  it('reserves the action-strip slot on every row so nothing reflows on hover', () => {
    renderPanel(COSTING_COLUMNS, COSTING_ROWS);
    // One reserved slot per row, rendered even when the row is not hovered.
    expect(screen.getAllByTestId('line-actions')).toHaveLength(COSTING_ROWS.length);
  });

  it('still hands its slot to the action strip when the amount column IS last', async () => {
    const user = userEvent.setup();
    renderPanel(TRAILING_AMOUNT_COLUMNS, TRAILING_AMOUNT_ROWS);

    const row = screen.getByTestId('line-row-L1');
    expect(cellKeys(row)).toEqual(['product', 'quantity', 'lineNetAmount']);

    await user.hover(row);
    // Deliberate: the trailing amount steps aside so the icons take its space.
    expect(cellKeys(row)).toEqual(['product', 'quantity']);
  });

  // The delete affordance is a red herring: Product > Costo shows pencil AND trash while its
  // sibling Contabilidad tab (hideDelete: true) shows only the pencil and renders correctly,
  // which invites the theory that the second action cell is what unbalances the row. It is not
  // — the strip is ONE flex child either way (`renderRowActionStrip`), and dropping
  // `onDeleteRow` (i.e. Contabilidad's exact action shape) on the Costo columns still
  // reproduced the shift before the fix. What differs between the two tabs is the amount
  // column, not the trash icon.
  it('is unaffected by whether the row has a delete action', async () => {
    const user = userEvent.setup();
    renderPanel(COSTING_COLUMNS, COSTING_ROWS, { onDeleteRow: undefined });

    const row = screen.getByTestId('line-row-C1');
    const before = cellKeys(row);
    await user.hover(row);

    expect(screen.getByTestId('Pencil__3b7ec2')).toBeTruthy();
    expect(screen.queryByTestId('Trash2__3b7ec2')).toBeNull();
    expect(cellKeys(row)).toEqual(before);
  });

  // Control case: the Product > Contabilidad tab, which renders correctly today. No amount
  // column at all, so `reserveActionSlot` was already true and no cell was ever suppressed.
  it('leaves a tab with no amount column alone (Contabilidad control case)', async () => {
    const user = userEvent.setup();
    const columns = [
      { key: 'accountingSchema', label: 'Accounting Schema', type: 'string' },
      { key: 'costType', label: 'Cost Type', type: 'string' },
      { key: 'costingAlgorithm', label: 'Costing Algorithm', type: 'string' },
      { key: 'warehouse', label: 'Warehouse', type: 'string' },
    ];
    const rows = [{ id: 'A1', accountingSchema: 'S', costType: 'T', costingAlgorithm: 'AVG', warehouse: 'W' }];
    renderPanel(columns, rows, { onDeleteRow: undefined });

    const row = screen.getByTestId('line-row-A1');
    const before = cellKeys(row);
    await user.hover(row);
    expect(cellKeys(row)).toEqual(before);
    expect(cellKeys(row)).toEqual(headerKeys());
  });

  it('does not suppress a cell on hover when the row is read-only', async () => {
    const user = userEvent.setup();
    renderPanel(COSTING_COLUMNS, COSTING_ROWS, { isDocumentReadOnly: true });

    const row = screen.getByTestId('line-row-C1');
    const before = cellKeys(row);
    await user.hover(row);
    expect(cellKeys(row)).toEqual(before);
  });
});

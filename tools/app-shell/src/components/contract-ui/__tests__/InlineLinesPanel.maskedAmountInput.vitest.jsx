// ETP-5107 — integration coverage for the InlineLinesPanel `EditCell` numeric
// wiring point (existing-line price editing). See
// docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §6.3.2/§6.4.
//
// Covers, end to end through the real component (not the source-shape checks in
// InlineLinesPanel.minValue.test.js / InlineLinesPanel.helpers.test.js):
//   - Bug 1: a comma-decimal price commits as the correctly parsed Number via
//     onUpdateRow (used to reach NEO Headless as the literal broken string).
//   - Bug 2: letters typed into the price cell are filtered live, never reach
//     the DOM value.
//   - isValueBelowMin comma-awareness: a comma-decimal value below `col.min`
//     is correctly recognized as below-min (old bare parseFloat('0,5') => NaN
//     would have silently skipped the guard) and blocks the commit.
//   - clampToMax comma-awareness: a comma-decimal value above `col.max` is
//     clamped to col.max before onUpdateRow is called.

import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import { createRef } from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row[`${key}$_identifier`] || row[key] || '',
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
  InlineSearchCombo: () => <span data-testid="inline-combo" />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => <div data-testid="dimension-field" />,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('./quickActionsStyle.js', () => ({ QUICK_ACTIONS_PILL_CLASS: 'pill' }));

// ETP-5107 test note: InlineLinesPanel hides the TRAILING column entirely while
// the hover/edit action strip shows (`renderLineCell`'s `isTrailing && showActions`
// guard) — mirrors every real window's layout (Sales/Purchase Order etc. always
// have a computed total AFTER the price column), so `unitPrice` must not be the
// last column here or its EditCell would never be reachable in this test.
const COLUMNS = [
  { key: 'product', label: 'Product', type: 'string', column: 'M_Product_ID' },
  { key: 'unitPrice', label: 'Price', type: 'amount', min: 1, max: 1000 },
  { key: 'lineNetAmount', label: 'Total', type: 'amount' },
];

const ROWS = [
  { id: 'L1', product: 'P1', 'product$_identifier': 'Widget', unitPrice: 5.0, lineNetAmount: 50 },
];

function renderPanel(props = {}) {
  const ref = createRef();
  const { onUpdateRow: onUpdateRowOverride, ...rest } = props;
  const onUpdateRow = onUpdateRowOverride ?? vi.fn().mockResolvedValue();
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
      onDeleteRow={vi.fn().mockResolvedValue()}
      {...rest}
      onUpdateRow={onUpdateRow}
    />,
  );
  return { ...result, ref, onUpdateRow };
}

async function openEditOnRow(rowId) {
  const row = screen.getByTestId(`line-row-${rowId}`);
  await act(async () => { await userEvent.hover(row); });
  const actions = within(row).getByTestId('line-actions');
  const editBtn = within(actions).getAllByRole('button')[0];
  await act(async () => { await userEvent.click(editBtn); });
  return row;
}

describe('InlineLinesPanel EditCell — MaskedAmountInput numeric wiring (ETP-5107)', () => {
  it('Bug 1: a comma-decimal price on an existing line commits as the correctly parsed Number', async () => {
    const user = userEvent.setup();
    const { onUpdateRow } = renderPanel();
    const row = await openEditOnRow('L1');

    const priceInput = within(row).getByTestId('field-unitPrice');
    await user.clear(priceInput);
    await user.type(priceInput, '25,50');
    expect(priceInput).toHaveValue('25,50');
    await user.tab();

    expect(onUpdateRow).toHaveBeenCalledWith(
      ROWS[0],
      'unitPrice',
      // Clean, locale-independent string (comma -> period, no other change) —
      // never "25,50" (the grouped display) and never NaN/garbage.
      '25.50',
      expect.objectContaining({}),
    );
  });

  it('Bug 2: letters are filtered out live — the DOM value never contains them', async () => {
    const user = userEvent.setup();
    renderPanel();
    const row = await openEditOnRow('L1');

    const priceInput = within(row).getByTestId('field-unitPrice');
    await user.clear(priceInput);
    // Exact live-reproduced probe string from the plan (§5, §5.2).
    await user.type(priceInput, '20,0rrwetwrtwrt2');
    expect(priceInput).toHaveValue('20,02');
  });

  it('isValueBelowMin comma-awareness: a comma-decimal value below col.min blocks the commit and toasts', async () => {
    const user = userEvent.setup();
    const { toast } = await import('sonner');
    const { onUpdateRow } = renderPanel();
    const row = await openEditOnRow('L1');

    const priceInput = within(row).getByTestId('field-unitPrice');
    await user.clear(priceInput);
    // col.min is 1 — "0,5" (0.5) is below it. The OLD bare parseFloat('0,5')
    // would have produced NaN, silently skipping this guard entirely.
    await user.type(priceInput, '0,5');
    await user.tab();

    expect(onUpdateRow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('fieldMinValueError'));
  });

  it('clampToMax comma-awareness: a comma-decimal value above col.max is clamped before commit', async () => {
    const user = userEvent.setup();
    const { onUpdateRow } = renderPanel();
    const row = await openEditOnRow('L1');

    const priceInput = within(row).getByTestId('field-unitPrice');
    await user.clear(priceInput);
    // col.max is 1000 — "1500,00" (1500) is above it, must clamp to "1000".
    // Typed as a comma-decimal to prove clampToMax itself is comma-aware, not
    // just the upstream mask.
    await user.type(priceInput, '1500,00');
    await user.tab();

    expect(onUpdateRow).toHaveBeenCalledWith(
      ROWS[0],
      'unitPrice',
      '1000',
      expect.objectContaining({}),
    );
  });

  it('a plain period-decimal value still commits correctly (no regression for the pre-existing convention)', async () => {
    const user = userEvent.setup();
    const { onUpdateRow } = renderPanel();
    const row = await openEditOnRow('L1');

    const priceInput = within(row).getByTestId('field-unitPrice');
    await user.clear(priceInput);
    await user.type(priceInput, '30');
    await user.tab();

    expect(onUpdateRow).toHaveBeenCalledWith(
      ROWS[0],
      'unitPrice',
      '30',
      expect.objectContaining({}),
    );
  });
});

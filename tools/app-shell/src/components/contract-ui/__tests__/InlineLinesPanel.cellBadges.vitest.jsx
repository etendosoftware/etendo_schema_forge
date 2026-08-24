/**
 * InlineLinesPanel — `cellBadges` extension point (ETP-4888 design-polish round).
 *
 * `cellBadges` is a generic `{ [columnKey]: (row) => ReactNode | null }` map, sibling
 * to the existing `rowActions` hover-strip slot: any caller can render a small
 * icon/badge right next to a specific column's own value, in BOTH read and edit mode
 * (see `renderLineCell`'s `badge` computation in InlineLinesPanel.jsx). First (and so
 * far only) consumer: `useTaxSifLineRowActions.jsx`'s `cellBadges.tax`, the invoice-line
 * "tax needs SIF configuration" trigger — but this file tests the GENERIC mechanism,
 * with a synthetic badge, independent of that specific feature.
 *
 * Same mocks/harness convention as InlineLinesPanel.vitest.jsx (the file that already
 * covers this component's ~100 other behaviors) — kept in its own file since this is a
 * new, self-contained slot, not a modification of existing behavior.
 */
import { render, screen, within, act } from '@testing-library/react';
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

const COLUMNS = [
  { key: 'product', label: 'Product', type: 'string', column: 'M_Product_ID' },
  // 'search' mirrors the real invoice-line tax column's type (renders via
  // InlineSearchCombo in edit mode — see EditCell's `col.type === 'selector' ||
  // col.type === 'search'` branch), the same column useTaxSifLineRowActions.jsx's
  // real cellBadges.tax targets.
  { key: 'tax', label: 'Tax', type: 'search', column: 'C_Tax_ID' },
  { key: 'unitPrice', label: 'Price', type: 'amount' },
];

const ROWS = [
  { id: 'L1', product: 'P1', 'product$_identifier': 'Widget', tax: 'T1', 'tax$_identifier': 'IVA 21%', unitPrice: 5.0 },
  { id: 'L2', product: 'P2', 'product$_identifier': 'Gadget', tax: 'T2', 'tax$_identifier': 'IVA 10%', unitPrice: 20.0 },
];

function renderPanel(props = {}) {
  return render(
    <InlineLinesPanel
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
}

// Synthetic badge, mirroring useTaxSifLineRowActions.jsx's cellBadges.tax shape: only
// renders for a specific row (id L1), stops propagation so its click never bubbles into
// the cell's own click-to-edit handler.
function makeTaxBadgeMap(onBadgeClick) {
  return {
    tax: (row) => {
      if (row.id !== 'L1') return null;
      return (
        <button
          type="button"
          data-testid="tax-badge"
          onClick={(e) => { e.stopPropagation(); onBadgeClick?.(row); }}
        >
          !
        </button>
      );
    },
  };
}

describe('InlineLinesPanel — cellBadges backwards compatibility (no regressions for existing callers)', () => {
  it('renders nothing extra when cellBadges is omitted entirely', () => {
    renderPanel();
    const row = screen.getByTestId('line-row-L1');
    const taxCell = row.querySelector('[data-cell-key="tax"]');
    expect(taxCell).toBeInTheDocument();
    expect(within(taxCell).queryByTestId('tax-badge')).not.toBeInTheDocument();
    // The read-mode cell renders its plain identifier text directly (no extra
    // wrapping flex row) when there is no badge for this column/row.
    expect(taxCell).toHaveTextContent('IVA 21%');
  });

  it('renders nothing extra for columns/rows the badge map returns null for', () => {
    renderPanel({ cellBadges: makeTaxBadgeMap() });
    const row2 = screen.getByTestId('line-row-L2');
    const taxCell = row2.querySelector('[data-cell-key="tax"]');
    expect(within(taxCell).queryByTestId('tax-badge')).not.toBeInTheDocument();
    expect(taxCell).toHaveTextContent('IVA 10%');
  });

  it('does not affect columns that have no entry in the cellBadges map at all', () => {
    renderPanel({ cellBadges: makeTaxBadgeMap() });
    const row = screen.getByTestId('line-row-L1');
    const productCell = row.querySelector('[data-cell-key="product"]');
    expect(productCell).toHaveTextContent('Widget');
    expect(within(productCell).queryByTestId('tax-badge')).not.toBeInTheDocument();
  });
});

describe('InlineLinesPanel — cellBadges renders the badge next to the column value', () => {
  it('renders the badge alongside the read-mode cell value for the matching row', () => {
    renderPanel({ cellBadges: makeTaxBadgeMap() });
    const row = screen.getByTestId('line-row-L1');
    const taxCell = row.querySelector('[data-cell-key="tax"]');
    expect(taxCell).toHaveTextContent('IVA 21%');
    expect(within(taxCell).getByTestId('tax-badge')).toBeInTheDocument();
  });

  it('renders the badge alongside the edit-mode cell (input) for the matching row', async () => {
    renderPanel({ cellBadges: makeTaxBadgeMap() });
    const row = screen.getByTestId('line-row-L1');
    await act(async () => {
      await userEvent.hover(row);
    });
    const actions = within(row).getByTestId('line-actions');
    const editBtn = within(actions).getAllByRole('button').find((b) => b.getAttribute('data-testid') !== 'tax-badge');
    await act(async () => {
      await userEvent.click(editBtn);
    });

    const taxCell = row.querySelector('[data-cell-key="tax"]');
    // Now in edit mode — the tax field is a search/string editable cell (InlineSearchCombo
    // stub for a `column`-bearing string field), and the badge still renders alongside it.
    expect(within(taxCell).getByTestId('tax-badge')).toBeInTheDocument();
  });
});

describe('InlineLinesPanel — cellBadges click does not interfere with cell editing', () => {
  it('clicking the badge does NOT enter edit mode on the cell (stopPropagation)', async () => {
    const onBadgeClick = vi.fn();
    renderPanel({ cellBadges: makeTaxBadgeMap(onBadgeClick) });
    const row = screen.getByTestId('line-row-L1');

    await act(async () => {
      await userEvent.click(screen.getByTestId('tax-badge'));
    });

    expect(onBadgeClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'L1' }));
    // No editable inputs should have appeared in the row from this click.
    expect(within(row).queryAllByRole('textbox').length).toBe(0);
    expect(within(row).queryByTestId('inline-combo-tax')).not.toBeInTheDocument();
  });

  it('clicking elsewhere in the SAME cell (not the badge) still enters edit mode normally', async () => {
    renderPanel({ cellBadges: makeTaxBadgeMap() });
    const row = screen.getByTestId('line-row-L1');
    const taxCell = row.querySelector('[data-cell-key="tax"]');

    await act(async () => {
      await userEvent.click(taxCell);
    });

    // Clicking the cell (outside the badge) toggles the row into edit mode —
    // the tax column (a `column`-bearing string field) renders through
    // InlineSearchCombo in edit mode.
    expect(within(row).getByTestId('inline-combo-tax')).toBeInTheDocument();
  });
});

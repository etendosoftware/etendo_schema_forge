/**
 * ETP-5133 (QA point #4) — per-column ellipsis policy. `product` opts out of
 * truncation (`noTruncate: true`, see
 * artifacts/{window}/generated/web/{window}/LinesTable.jsx) so its full value
 * is always visible — the cell scrolls horizontally instead of clipping the
 * text, since the product name is the primary way to tell two similar line
 * items apart at a glance. `description` keeps the default truncate + hover
 * tooltip behavior — QA explicitly wants that one unchanged.
 *
 * `renderLineCell`, `ReadCell` and `LookupTrigger` in InlineLinesPanel.jsx all
 * read `col.noTruncate` independently, so this file exercises BOTH the
 * ReadCell path (view mode, before the user clicks to edit) and the
 * LookupTrigger path (edit mode, product's selector-style lookup render) —
 * two genuinely different code paths per the developer's report.
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

const LONG_PRODUCT = 'Extremely Long Product Name That Would Otherwise Overflow The Column Width';
const LONG_DESCRIPTION = 'An equally long line description that must still ellipsize with a tooltip';

const COLUMNS = [
  { key: 'product', label: 'Product', type: 'search', column: 'M_Product_ID', lookup: true, noTruncate: true },
  { key: 'description', label: 'Description', type: 'string', column: 'Description' },
];

const ROWS = [
  {
    id: 'L1',
    product: 'P1',
    'product$_identifier': LONG_PRODUCT,
    description: LONG_DESCRIPTION,
  },
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

async function enterEditMode(row) {
  await act(async () => { await userEvent.hover(row); });
  const actions = within(row).getByTestId('line-actions');
  const editBtn = within(actions).getAllByRole('button')[0];
  await act(async () => { await userEvent.click(editBtn); });
}

describe('InlineLinesPanel — noTruncate column policy, view mode / ReadCell (ETP-5133)', () => {
  it('does NOT truncate the product cell (noTruncate: true) and gives it horizontal scroll instead', () => {
    renderPanel();
    const row = screen.getByTestId('line-row-L1');
    const cell = row.querySelector('[data-cell-key="product"]');
    expect(cell).not.toBeNull();
    expect(cell.style.overflowX).toBe('auto');
    const span = cell.querySelector('span');
    expect(span.className).not.toContain('truncate');
    expect(span.className).toContain('whitespace-nowrap');
    expect(span).not.toHaveAttribute('title');
    expect(span.textContent).toBe(LONG_PRODUCT);
  });

  it('still truncates the description cell (default policy, must NOT regress) and keeps a title with the full text', () => {
    renderPanel();
    const row = screen.getByTestId('line-row-L1');
    const cell = row.querySelector('[data-cell-key="description"]');
    expect(cell).not.toBeNull();
    // No noTruncate → no overflow-x override on the cell wrapper.
    expect(cell.style.overflowX).toBe('');
    const span = cell.querySelector('span');
    expect(span.className).toContain('truncate');
    expect(span).toHaveAttribute('title', LONG_DESCRIPTION);
    expect(span.textContent).toBe(LONG_DESCRIPTION);
  });
});

describe('InlineLinesPanel — noTruncate column policy, edit mode / LookupTrigger (ETP-5133)', () => {
  it('renders the product LookupTrigger without a truncate class and with horizontal-scroll capability', async () => {
    renderPanel();
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);
    const lookupBtn = within(row).getByTestId('field-product');
    expect(lookupBtn.className).not.toContain('truncate');
    expect(lookupBtn.className).toContain('overflow-x-auto');
    const label = within(lookupBtn).getByText(LONG_PRODUCT);
    expect(label.className).not.toContain('truncate');
    expect(label.className).toContain('whitespace-nowrap');
  });

  it('still truncates a lookup column that does NOT opt out of truncation (default policy unchanged)', async () => {
    const columns = [
      { key: 'warehouse', label: 'Warehouse', type: 'search', column: 'M_Warehouse_ID', lookup: true },
    ];
    const rows = [{ id: 'L2', warehouse: 'W1', 'warehouse$_identifier': 'A Fairly Long Warehouse Name' }];
    renderPanel({ columns, data: rows });
    const row = screen.getByTestId('line-row-L2');
    await enterEditMode(row);
    const lookupBtn = within(row).getByTestId('field-warehouse');
    expect(lookupBtn.className).not.toContain('overflow-x-auto');
    const label = within(lookupBtn).getByText('A Fairly Long Warehouse Name');
    expect(label.className).toContain('truncate');
    expect(label.className).not.toContain('whitespace-nowrap');
  });
});

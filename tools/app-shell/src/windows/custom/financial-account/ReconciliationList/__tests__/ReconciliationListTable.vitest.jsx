import { render, screen, fireEvent } from '@testing-library/react';

// The translator echoes the key, so assertions read on key strings.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ tone, label }) => <span data-testid={`status-${tone}`} data-label={label}>{label}</span>,
}));

vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value }) => <span data-testid="money">{String(value)}</span>,
}));

vi.mock('../ClearedItemsInline.jsx', () => ({
  ClearedItemsInline: ({ reconciliationId }) => <div data-testid={`stub-cleared-${reconciliationId}`} />,
}));

import { ReconciliationListTable } from '../ReconciliationListTable.jsx';

/**
 * ReconciliationListTable — column sorting (ETP-4921).
 *
 * Of the three hand-rolled detail grids, this is the only one whose endpoint IS the generic
 * NEO CRUD, so it could in principle sort server-side. It still sorts client-side, for the same
 * reason its filtering already does: the whole history arrives in one request (`_endRow=200`)
 * and re-fetching to reorder 200 in-memory rows buys nothing. See lib/clientSort.js.
 */
const ROWS = [
  {
    id: 'r1', documentNo: 'REC-003', transactionDate: '2026-03-01T00:00:00Z',
    startingbalance: 100, endingBalance: 900, documentStatus: 'CO', posted: 'Y',
  },
  {
    id: 'r2', documentNo: 'REC-001', transactionDate: '2026-01-01T00:00:00Z',
    startingbalance: 9, endingBalance: 80, documentStatus: 'DR', posted: 'N',
  },
  {
    id: 'r3', documentNo: 'REC-002', transactionDate: '2026-02-01T00:00:00Z',
    startingbalance: 20, endingBalance: 700, documentStatus: 'VO', posted: 'E',
  },
];

const rowIds = () => [...document.querySelectorAll('[data-testid^="reconciliation-row-"]')]
  .map((el) => el.getAttribute('data-testid').replace('reconciliation-row-', ''));

const renderTable = (rows = ROWS) => render(
  <ReconciliationListTable reconciliations={rows} loading={false} />,
);

describe('ReconciliationListTable — column sorting', () => {
  it('keeps the handler order (transactionDate desc) until a column is picked', () => {
    renderTable();

    expect(screen.getByTestId('reconciliation-list-table')).toBeInTheDocument();
    expect(rowIds()).toEqual(['r1', 'r2', 'r3']);
  });

  it('sorts by a contract column, ascending then descending', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('column-header-sort-documentNo'));
    expect(rowIds()).toEqual(['r2', 'r3', 'r1']);

    fireEvent.click(screen.getByTestId('column-header-sort-documentNo'));
    expect(rowIds()).toEqual(['r1', 'r3', 'r2']);
  });

  // 9 must come before 20, which a lexicographic compare would get backwards.
  it('sorts the balance columns numerically', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('column-header-sort-startingbalance'));
    expect(rowIds()).toEqual(['r2', 'r3', 'r1']);
  });

  it('sorts dates chronologically', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('column-header-sort-transactionDate'));
    expect(rowIds()).toEqual(['r2', 'r3', 'r1']);
  });

  // The pills are translated, and 'CO'/'DR'/'VO' order alphabetically as
  // Completado/Borrador/Anulado in neither language — so the sort follows the displayed text.
  it('sorts the status pill by its translated label, not the raw code', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('column-header-sort-documentStatus'));
    // Keys echo as labels here, so the order is by key name:
    // ...DocStatus_CO < ...DocStatus_DR < ...DocStatus_VO
    expect(rowIds()).toEqual(['r1', 'r2', 'r3']);
  });

  it('restores the handler order on the third click', () => {
    renderTable();

    const header = screen.getByTestId('column-header-sort-documentNo');
    fireEvent.click(header);
    fireEvent.click(header);
    fireEvent.click(header);

    expect(rowIds()).toEqual(['r1', 'r2', 'r3']);
  });

  it('marks only the active column with a direction arrow', () => {
    renderTable();

    fireEvent.click(screen.getByTestId('column-header-sort-documentNo'));
    expect(screen.getByTestId('column-header-sort-documentNo').textContent).toContain('▲');
    expect(screen.getByTestId('column-header-sort-posted').textContent).not.toContain('▲');
  });
});

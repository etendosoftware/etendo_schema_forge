// @covers tools/app-shell/src/windows/custom/financial-account/ReconciliationList/ReconciliationListTable.jsx
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

import * as React from 'react';
import { useClientSort } from '@/hooks/useClientSort';
import {
  ReconciliationListTable,
  buildReconciliationSortAccessors,
  reconciliationPostedLabel,
} from '../ReconciliationListTable.jsx';

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

// The table is CONTROLLED since the sort state moved up to the tab (whose toolbar hosts the
// "Ordenar por" popover). This harness supplies that state so the header clicks are still
// exercised end to end, using the same hook the tab uses.
function Harness({ rows }) {
  const accessors = React.useMemo(
    () => buildReconciliationSortAccessors({
      ui: (k) => k,
      postedLabel: (posted) => `financeAccountReconciliationsPosted_${posted}`,
    }),
    [],
  );
  const { sorted, sortKey, sortDirection, toggleSort } = useClientSort(rows, { accessors });
  return (
    <ReconciliationListTable
      reconciliations={sorted}
      loading={false}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />
  );
}

const renderTable = (rows = ROWS) => render(<Harness rows={rows} />);

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

/**
 * The accounting-status pill takes its colour from the shared posting-status registry
 * (ETP-5647): "not posted" is the yellow warning everywhere, and every failed posting — period
 * closed included — is red. It used to be grey for N and yellow for every failure.
 */
describe('ReconciliationListTable — posting status pill', () => {
  it('colours each code from the shared registry', () => {
    const codes = ['Y', 'N', 'E', 'p', 'D'];
    render(
      <ReconciliationListTable
        reconciliations={codes.map((posted, i) => ({ ...ROWS[0], id: `p${i}`, posted }))}
        loading={false}
      />,
    );
    // The echoing translator leaves the window keys untranslated, so the labels are the
    // shared fallbacks; the document-status pills share the mock, hence `toContain`.
    const labels = (tone) => screen.queryAllByTestId(`status-${tone}`).map((el) => el.dataset.label);
    expect(labels('success')).toContain('postedStatus');
    expect(labels('warning')).toContain('notPostedStatus');
    expect(labels('destructive')).toEqual(expect.arrayContaining(['postedStatusError', 'postedStatusPeriodClosed']));
    expect(labels('neutral')).toContain('postedStatusDocumentDisabled');
  });
});

describe('reconciliationPostedLabel', () => {
  const dictionary = {
    financeAccountReconciliationsPosted_N: 'Pendiente',
    postedStatus: 'Contabilizado',
    postedStatusInvalidAccount: 'Cuenta no válida',
  };
  // Like the real useUI(): a missing key is echoed back verbatim.
  const ui = (key) => dictionary[key] ?? key;

  it("prefers the window's own wording when the key is translated", () => {
    expect(reconciliationPostedLabel('N', ui)).toBe('Pendiente');
  });

  it('falls back to the shared posting label instead of printing a raw key', () => {
    expect(reconciliationPostedLabel('i', ui)).toBe('Cuenta no válida');
    expect(reconciliationPostedLabel('Y', ui)).toBe('Contabilizado');
  });

  it('shows a dash for an empty value', () => {
    expect(reconciliationPostedLabel('', ui)).toBe('—');
    expect(reconciliationPostedLabel(undefined, ui)).toBe('—');
  });
});

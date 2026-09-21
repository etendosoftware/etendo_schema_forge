import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayCalendarISO } from '@/lib/dateOnly.js';

/**
 * ETP-4954 — the statement list's DEFAULT ORDER.
 *
 * The handler returns the statements in no particular order, so a freshly created statement
 * (manual or imported) landed wherever it happened to fall and the user had to hunt for the row
 * they had just made. The tab now opens newest-first, keyed on `documentNo` — the only strictly
 * increasing key the list has (the transaction date is the bank's, not the creation order).
 *
 * Kept in its own file rather than bolted onto ImportedStatementsTab.vitest.jsx: that suite's
 * fixtures are shaped for the filter/row-action state machine and are already in documentNo
 * order, so an ordering assertion there could not tell a real sort from a no-op.
 */

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/useStatementActions', () => ({
  useStatementActions: () => ({
    processStatement: vi.fn(), reactivateStatement: vi.fn(), deleteStatement: vi.fn(),
    updateStatement: vi.fn(), busy: false, error: null,
  }),
}));

vi.mock('@/hooks/useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({ sync: vi.fn() }),
}));

const statementsRef = { value: [] };
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: () => ({ statements: statementsRef.value, loading: false, reload: vi.fn() }),
}));

vi.mock('../StatementsToolbar', () => ({
  StatementsToolbar: ({ onSearchChange, onDateRangeChange }) => (
    <div data-testid="stub-toolbar">
      <button type="button" data-testid="toolbar-search" onClick={() => onSearchChange('BS-')} />
      <button
        type="button"
        data-testid="toolbar-alldates"
        onClick={() => onDateRangeChange({ presetId: 'all' })}
      />
    </div>
  ),
}));

// The real sort-accessor builder is kept (only the rendering half is stubbed) so the test
// exercises the same accessor map production uses — `documentNo` declares no `sortValue`, so
// it must fall through to `row.documentNo`, and this would catch that changing.
vi.mock('../StatementsTable', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    buildStatementSortAccessors: actual.buildStatementSortAccessors,
    buildStatementSortColumns: actual.buildStatementSortColumns,
    StatementsTable: ({ statements, sortKey, sortDirection, onSort }) => (
      <div
        data-testid="stub-table"
        data-order={statements.map((s) => s.documentNo ?? '').join('|')}
        data-sort-key={sortKey ?? ''}
        data-sort-direction={sortDirection ?? ''}
      >
        <button type="button" data-testid="sort-documentNo" onClick={() => onSort('documentNo')} />
        {statements.map((s) => (
          <span key={s.id} data-testid="stmt-row">{s.documentNo ?? ''}</span>
        ))}
      </div>
    ),
  };
});

vi.mock('../StatementLinesView', () => ({ StatementLinesView: () => <div /> }));
vi.mock('../ImportStatementModal', () => ({ ImportStatementModal: () => <div /> }));
vi.mock('../ManualStatementModal', () => ({ ManualStatementModal: () => <div /> }));
vi.mock('../StatementConfirmDialog', () => ({ StatementConfirmDialog: () => null }));

import { ImportedStatementsTab } from '../ImportedStatementsTab.jsx';

const ACCOUNT = { id: 'acc-1', currencyIso: 'EUR' };

/**
 * Recent enough to stay inside the tab's default last-30-days window. Returns a
 * date-only `yyyy-MM-dd` string — the shape NEO actually sends for `importDate`
 * (see ImportedStatementsTab.tz-bug.vitest.jsx) — built from LOCAL calendar
 * getters, not `toISOString()`: that UTC-converts the instant first, which
 * rolls the date to the next day for any host west of UTC (e.g.
 * America/Argentina/Buenos_Aires) once local time is late enough in the day.
 */
function recentIso(daysAgo = 1) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return todayCalendarISO(d);
}

function statement(id, documentNo, daysAgo = 1) {
  return {
    id,
    documentNo,
    name: `Extracto ${id}`,
    fileName: `${id}.c43`,
    importDate: recentIso(daysAgo),
    status: 'DRAFT',
  };
}

/** The documentNo of every rendered row, in DOM order. */
function renderedOrder() {
  return screen.getAllByTestId('stmt-row').map((el) => el.textContent);
}

describe('ImportedStatementsTab — default order (newest statement first)', () => {
  it('renders the highest documentNo first even though the handler returned them shuffled', () => {
    statementsRef.value = [
      statement('s2', 'BS-002'),
      statement('s5', 'BS-005'),
      statement('s1', 'BS-001'),
      statement('s4', 'BS-004'),
      statement('s3', 'BS-003'),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['BS-005', 'BS-004', 'BS-003', 'BS-002', 'BS-001']);
  });

  it('puts a freshly created statement at the top of the list without the user sorting anything', () => {
    // The whole point of the change: the row the user just made is the first one they see.
    statementsRef.value = [
      statement('s1', 'BS-001'),
      statement('s2', 'BS-002'),
      statement('brand-new', 'BS-999', 0),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()[0]).toBe('BS-999');
  });

  it('orders document numbers NUMERICALLY, not lexicographically', () => {
    // `compareCellValues` uses localeCompare(..., { numeric: true }), so BS-1000100 is newer
    // than BS-999. A naive string compare would put BS-999 first ('9' > '1') and bury the
    // newest statement at the bottom — the exact failure this sort exists to prevent, and one
    // that only appears once an instance passes its 1000th statement.
    statementsRef.value = [
      statement('a', 'BS-999'),
      statement('b', 'BS-1000100'),
      statement('c', 'BS-1000099'),
      statement('d', 'BS-1000'),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['BS-1000100', 'BS-1000099', 'BS-1000', 'BS-999']);
  });

  it('orders bare numeric document numbers numerically too', () => {
    statementsRef.value = [
      statement('a', '999'),
      statement('b', '1000100'),
      statement('c', '80'),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['1000100', '999', '80']);
  });

  it('sorts statements with no document number LAST, despite the descending direction', () => {
    // Blank handling in `sortRows` is direction-invariant: a blank carries no ordering
    // information, and flipping blanks to the top on a desc sort would bury the newest rows.
    statementsRef.value = [
      statement('a', 'BS-001'),
      statement('blank', null),
      statement('b', 'BS-003'),
      statement('empty', ''),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    const order = renderedOrder();
    expect(order.slice(0, 2)).toEqual(['BS-003', 'BS-001']);
    expect(order.slice(2)).toEqual(['', '']);
  });

  it('keeps the newest-first order after a filter narrows the list', () => {
    statementsRef.value = [
      statement('s1', 'BS-001'),
      statement('s3', 'BS-003'),
      statement('s2', 'BS-002'),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    // Re-filtering rebuilds the array from `statements`; the order must be re-applied, not
    // inherited from whatever the filter happened to emit.
    expect(renderedOrder()).toEqual(['BS-003', 'BS-002', 'BS-001']);
  });
});

describe('ImportedStatementsTab — the header indicator agrees with the rendered order', () => {
  it('shows documentNo / desc on first paint, matching what is actually on screen', () => {
    // `initialSort` seeds the indicator; the pre-sort puts the rows in that order. If the two
    // ever disagreed the header arrow would describe an order the rows are not in.
    statementsRef.value = [statement('s1', 'BS-001'), statement('s2', 'BS-002')];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    const table = screen.getByTestId('stub-table');
    expect(table).toHaveAttribute('data-sort-key', 'documentNo');
    expect(table).toHaveAttribute('data-sort-direction', 'desc');
    expect(table).toHaveAttribute('data-order', 'BS-002|BS-001');
  });

  it('flips to ascending on the first click of the seeded column, and the rows follow', async () => {
    // `useClientSort`'s one-shot seed override: clicking the already-sorted column must produce
    // a visible reorder rather than cycling through "none", which would leave the rows exactly
    // as they were and read as a dead click.
    const user = userEvent.setup();
    statementsRef.value = [
      statement('s1', 'BS-001'),
      statement('s3', 'BS-003'),
      statement('s2', 'BS-002'),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['BS-003', 'BS-002', 'BS-001']);
    await user.click(screen.getByTestId('sort-documentNo'));
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-sort-direction', 'asc');
    expect(renderedOrder()).toEqual(['BS-001', 'BS-002', 'BS-003']);
  });
});

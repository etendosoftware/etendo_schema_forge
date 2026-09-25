import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayCalendarISO } from '@/lib/dateOnly.js';

/**
 * ETP-5447 — the statement list's DEFAULT ORDER.
 *
 * ETP-4954 made the tab open newest-first keyed on `documentNo`, on the assumption that the
 * document number grows with creation order. It does not reliably: two statements for the same
 * bank day could come back in a different order on every refresh, and a statement numbered from
 * a different sequence landed far from where the user expected it. The default is now:
 *
 *   1. `transactionDate` DESC — the bank day the statement is for;
 *   2. `created` DESC — the full creation instant the handler now sends on every row, so two
 *      statements of the same day are deterministic and the one just made is on top;
 *   3. the backend's own order as the last resort (the sort is stable).
 *
 * `documentNo` is NOT a sort key any more, and the fixtures below are built so that a documentNo
 * sort would produce a visibly different order.
 *
 * Kept in its own file rather than bolted onto ImportedStatementsTab.vitest.jsx: that suite's
 * fixtures are shaped for the filter/row-action state machine, so an ordering assertion there
 * could not tell a real sort from a no-op.
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
  StatementsToolbar: () => <div data-testid="stub-toolbar" />,
}));

// The real sort-accessor builder is kept (only the rendering half is stubbed) so the test
// exercises the same accessor map production uses.
vi.mock('../StatementsTable', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    buildStatementSortAccessors: actual.buildStatementSortAccessors,
    buildStatementSortColumns: actual.buildStatementSortColumns,
    StatementsTable: ({ statements, sortKey, sortDirection, onSort }) => (
      <div
        data-testid="stub-table"
        data-order={statements.map((s) => s.id).join('|')}
        data-sort-key={sortKey ?? ''}
        data-sort-direction={sortDirection ?? ''}
      >
        <button type="button" data-testid="sort-transactionDate" onClick={() => onSort('transactionDate')} />
        {statements.map((s) => (
          <span key={s.id} data-testid="stmt-row">{s.id}</span>
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
 * A `yyyy-MM-dd` for `daysAgo` days back, built from LOCAL calendar getters (not
 * `toISOString()`, which UTC-converts first and rolls the day west of UTC). Recent enough to
 * keep `importDate` inside the tab's default last-30-days window.
 */
function recentDay(daysAgo = 1) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return todayCalendarISO(d);
}

/**
 * A statement row in the shape the handler sends: `transactionDate` is NEO's zone-less wire
 * datetime, `created` a full ISO instant.
 */
function statement(id, { documentNo, trxDaysAgo = 1, created }) {
  return {
    id,
    documentNo,
    name: `Extracto ${id}`,
    fileName: `${id}.c43`,
    importDate: recentDay(1),
    transactionDate: `${recentDay(trxDaysAgo)}T00:00:00`,
    created,
    status: 'DRAFT',
  };
}

/** The id of every rendered row, in DOM order. */
function renderedOrder() {
  return screen.getAllByTestId('stmt-row').map((el) => el.textContent);
}

// Same bank day for all three; creation instants differ by minutes and milliseconds, and the
// documentNo order is the REVERSE of the creation order.
const SAME_DAY = [
  statement('oldest', { documentNo: 'BS-003', trxDaysAgo: 2, created: '2026-09-24T09:00:00.000Z' }),
  statement('middle', { documentNo: 'BS-002', trxDaysAgo: 2, created: '2026-09-24T13:05:12.345Z' }),
  statement('newest', { documentNo: 'BS-001', trxDaysAgo: 2, created: '2026-09-24T13:05:12.346Z' }),
];

describe('ImportedStatementsTab — default order: transactionDate desc, then created desc', () => {
  it('TC1: on the same transaction day, the most recently created statement comes first', () => {
    statementsRef.value = [...SAME_DAY];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['newest', 'middle', 'oldest']);
  });

  it('TC1: the same-day order does not depend on the order the rows arrive in', () => {
    const [a, b, c] = SAME_DAY;
    const permutations = [
      [a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a],
    ];
    for (const rows of permutations) {
      statementsRef.value = rows;
      const { unmount } = render(<ImportedStatementsTab account={ACCOUNT} />);
      expect(renderedOrder()).toEqual(['newest', 'middle', 'oldest']);
      unmount();
    }
  });

  it('TC1: the order stays put when the same rows come back reshuffled on a rerender', () => {
    statementsRef.value = [...SAME_DAY];
    const { rerender } = render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['newest', 'middle', 'oldest']);

    // A refresh hands back the same statements in a different order (new array identity).
    statementsRef.value = [SAME_DAY[1], SAME_DAY[2], SAME_DAY[0]];
    rerender(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['newest', 'middle', 'oldest']);

    statementsRef.value = [SAME_DAY[2], SAME_DAY[0], SAME_DAY[1]];
    rerender(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['newest', 'middle', 'oldest']);
  });

  it('TC2: different transaction days sort newest day first', () => {
    statementsRef.value = [
      statement('day-5', { documentNo: 'BS-010', trxDaysAgo: 5, created: '2026-09-20T10:00:00.000Z' }),
      statement('day-1', { documentNo: 'BS-011', trxDaysAgo: 1, created: '2026-09-20T10:00:00.000Z' }),
      statement('day-3', { documentNo: 'BS-012', trxDaysAgo: 3, created: '2026-09-20T10:00:00.000Z' }),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['day-1', 'day-3', 'day-5']);
  });

  it('TC2: the transaction day outranks the creation instant', () => {
    // A statement for an OLDER bank day created LATER must still sit below a newer bank day.
    statementsRef.value = [
      statement('old-day-created-late', { documentNo: 'BS-100', trxDaysAgo: 6, created: '2026-09-24T18:00:00.000Z' }),
      statement('new-day-created-early', { documentNo: 'BS-001', trxDaysAgo: 1, created: '2026-09-01T08:00:00.000Z' }),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['new-day-created-early', 'old-day-created-late']);
  });

  it('does not order by documentNo', () => {
    // documentNo DESC would give BS-900, BS-500, BS-100; the date order is the exact reverse.
    statementsRef.value = [
      statement('doc-900', { documentNo: 'BS-900', trxDaysAgo: 9, created: '2026-09-15T10:00:00.000Z' }),
      statement('doc-100', { documentNo: 'BS-100', trxDaysAgo: 1, created: '2026-09-23T10:00:00.000Z' }),
      statement('doc-500', { documentNo: 'BS-500', trxDaysAgo: 4, created: '2026-09-20T10:00:00.000Z' }),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['doc-100', 'doc-500', 'doc-900']);
    expect(renderedOrder()).not.toEqual(['doc-900', 'doc-500', 'doc-100']);
  });

  it('falls back to the backend order when transaction day and created instant are equal', () => {
    const created = '2026-09-22T11:11:11.111Z';
    statementsRef.value = [
      statement('first', { documentNo: 'BS-001', trxDaysAgo: 2, created }),
      statement('second', { documentNo: 'BS-003', trxDaysAgo: 2, created }),
      statement('third', { documentNo: 'BS-002', trxDaysAgo: 2, created }),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['first', 'second', 'third']);
  });
});

describe('ImportedStatementsTab — the header indicator agrees with the rendered order', () => {
  it('shows transactionDate / desc on first paint, matching what is actually on screen', () => {
    statementsRef.value = [
      statement('older', { documentNo: 'BS-002', trxDaysAgo: 3, created: '2026-09-20T10:00:00.000Z' }),
      statement('newer', { documentNo: 'BS-001', trxDaysAgo: 1, created: '2026-09-20T10:00:00.000Z' }),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    const table = screen.getByTestId('stub-table');
    expect(table).toHaveAttribute('data-sort-key', 'transactionDate');
    expect(table).toHaveAttribute('data-sort-direction', 'desc');
    expect(table).toHaveAttribute('data-order', 'newer|older');
  });

  it('flips to ascending on the first click of the seeded column, and the rows follow', async () => {
    // `useClientSort`'s one-shot seed override: clicking the already-sorted column must produce
    // a visible reorder rather than cycling through "none".
    const user = userEvent.setup();
    statementsRef.value = [
      statement('day-3', { documentNo: 'BS-001', trxDaysAgo: 3, created: '2026-09-20T10:00:00.000Z' }),
      statement('day-1', { documentNo: 'BS-002', trxDaysAgo: 1, created: '2026-09-20T10:00:00.000Z' }),
      statement('day-2', { documentNo: 'BS-003', trxDaysAgo: 2, created: '2026-09-20T10:00:00.000Z' }),
    ];
    render(<ImportedStatementsTab account={ACCOUNT} />);
    expect(renderedOrder()).toEqual(['day-1', 'day-2', 'day-3']);
    await user.click(screen.getByTestId('sort-transactionDate'));
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-sort-direction', 'asc');
    expect(renderedOrder()).toEqual(['day-3', 'day-2', 'day-1']);
  });
});

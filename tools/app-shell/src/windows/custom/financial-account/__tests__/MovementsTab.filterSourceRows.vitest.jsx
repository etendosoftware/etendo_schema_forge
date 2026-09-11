// ETP-4956 — the rows MovementsTab hands to the toolbar's advanced-filter
// builder must carry the SAME derived fields the filter columns expose.
//
// `statusFamily` (the status filter column) exists only inside the evaluator's
// `withDerivedFields` projection, so the builder's enum picker used to seed its
// in-memory option list from a field no row had, leaving the Status dropdown
// with nothing but its declared enumLabels. The tab now passes
// `movements.map(withDerivedFields)`.
//
// Deliberately a separate file from MovementsTab.vitest.jsx: that suite's
// toolbar stub does not surface the `rows` prop, and this one has to capture
// the array identity across renders.
import { render, screen, act } from '@testing-library/react';

// Captures every `rows` array the toolbar received, in render order, so the
// test can assert both its content and its reference stability.
const receivedRows = [];

vi.mock('../MovementsToolbar/index.jsx', () => ({
  MovementsToolbar: ({ rows, onFiltersChange }) => {
    receivedRows.push(rows);
    return (
      <div data-testid="toolbar">
        <span data-testid="toolbar-rows">{JSON.stringify(rows)}</span>
        <button data-testid="set-search" onClick={() => onFiltersChange('search')('acme')}>
          search
        </button>
      </div>
    );
  },
}));

vi.mock('../AccountSummaryStrip.jsx', () => ({
  AccountSummaryStrip: () => <div data-testid="summary-strip" />,
}));

vi.mock('../MovementsTable.jsx', () => ({
  MovementsTable: ({ movements }) => (
    <div data-testid="table">
      <span data-testid="row-ids">{movements.map((m) => m.id).join(',')}</span>
    </div>
  ),
  useTrxTypeLabel: () => (m) => m.trxType,
  buildMovementSortCtx: () => ({}),
  buildMovementSortAccessors: () => ({}),
  buildMovementSortColumns: () => [],
}));

vi.mock('../NewTransactionModal.jsx', () => ({
  NewTransactionModal: () => <div data-testid="new-transaction-modal" />,
}));

vi.mock('../FundsTransferModal.jsx', () => ({
  FundsTransferModal: () => <div data-testid="funds-transfer-modal" />,
}));

vi.mock('@/hooks/useCreateMovement', () => ({
  useDeleteMovement: () => ({ deleteMovement: vi.fn(), deleting: false, error: null }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { MovementsTab } from '../MovementsTab.jsx';
import { movementStatusLabelKey } from '../movementAdvancedFilter';
import { todayCalendarISO } from '@/lib/dateOnly';

// One movement per status family, plus one old enough to fall outside the
// default "last 30 days" quick filter — the builder must still see it, because
// its family would otherwise be missing from the dropdown.
function daysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const MOVEMENTS = [
  { id: 'a', date: daysAgo(1), amount: 100, paymentStatus: 'RPPC', trxType: 'BPD', documentNo: 'DOC-001', contact: 'ACME', description: 'compra' },
  { id: 'b', date: daysAgo(2), amount: -200, paymentStatus: 'RPR', trxType: 'BPW', documentNo: 'DOC-002', contact: 'Globex', description: 'pago' },
  { id: 'old', date: daysAgo(120), amount: 50, paymentStatus: 'RPAP', trxType: 'BPD', documentNo: 'DOC-OLD', contact: 'OldCo', description: 'antiguo' },
];

function renderTab(props = {}) {
  return render(
    <MovementsTab
      account={{ id: 'acc-1', currencyIso: 'EUR' }}
      totals={{ balance: 0, inflows: 0, outflows: 0, currency: 'EUR' }}
      movements={MOVEMENTS}
      loading={false}
      {...props}
    />,
  );
}

const lastRows = () => receivedRows[receivedRows.length - 1];

describe('MovementsTab — rows handed to the advanced-filter builder', () => {
  beforeEach(() => {
    receivedRows.length = 0;
  });

  it('passes a rows array to the toolbar', () => {
    renderTab();
    expect(Array.isArray(lastRows())).toBe(true);
    expect(lastRows()).toHaveLength(MOVEMENTS.length);
  });

  it('decorates every row with the derived statusFamily field', () => {
    renderTab();
    for (const row of lastRows()) {
      const source = MOVEMENTS.find((m) => m.id === row.id);
      expect(row.statusFamily).toBe(movementStatusLabelKey(source.paymentStatus));
      expect(row.statusFamily).toBeTruthy();
    }
  });

  it('exposes every distinct status family present in the data', () => {
    renderTab();
    const families = new Set(lastRows().map((r) => r.statusFamily));
    expect([...families].sort()).toEqual([
      'financeAccountMovementsStatusDraft',
      'financeAccountMovementsStatusReconciled',
      'financeAccountMovementsStatusUnreconciled',
    ]);
  });

  it('keeps the untouched movement fields alongside the derived one', () => {
    renderTab();
    const row = lastRows().find((r) => r.id === 'a');
    expect(row.documentNo).toBe('DOC-001');
    expect(row.contact).toBe('ACME');
    expect(row.amount).toBe(100);
  });

  it('seeds the builder from ALL movements, not the quick-filtered subset', () => {
    renderTab();
    // The 120-day-old row is hidden by the default last30 range in the grid…
    expect(screen.getByTestId('row-ids').textContent).not.toContain('old');
    // …but its status family must still be offered by the filter builder.
    expect(lastRows().map((r) => r.id)).toContain('old');
  });

  it('keeps the same array reference across an unrelated re-render (memoized)', () => {
    renderTab();
    const before = lastRows();
    act(() => {
      screen.getByTestId('set-search').click();
    });
    expect(receivedRows.length).toBeGreaterThan(1);
    // A new array on every render would reset the builder's option list — and
    // any consumer memo keyed on it — on each keystroke.
    expect(lastRows()).toBe(before);
  });

  it('rebuilds the rows when the movements prop changes', () => {
    const { rerender } = renderTab();
    const before = lastRows();
    rerender(
      <MovementsTab
        account={{ id: 'acc-1', currencyIso: 'EUR' }}
        totals={{ balance: 0, inflows: 0, outflows: 0, currency: 'EUR' }}
        movements={[{ id: 'z', date: `${todayCalendarISO()}T00:00:00Z`, amount: 1, paymentStatus: 'RPPC' }]}
        loading={false}
      />,
    );
    expect(lastRows()).not.toBe(before);
    expect(lastRows()).toHaveLength(1);
    expect(lastRows()[0].statusFamily).toBe('financeAccountMovementsStatusReconciled');
  });

  it('does not mutate the movements it was given', () => {
    renderTab();
    for (const movement of MOVEMENTS) {
      expect(movement).not.toHaveProperty('statusFamily');
    }
  });

  it('handles an empty movements list', () => {
    renderTab({ movements: [] });
    expect(lastRows()).toEqual([]);
  });
});

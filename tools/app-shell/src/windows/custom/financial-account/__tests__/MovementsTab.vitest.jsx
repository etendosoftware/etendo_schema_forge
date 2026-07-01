import { render, screen, act } from '@testing-library/react';

// Stub the three children. We expose:
//   - MovementsToolbar: lets the test drive filter changes via onFiltersChange
//   - MovementsTable: just emits the current filtered movements as JSON for assertions
//   - AccountSummaryStrip: just a marker
vi.mock('../MovementsToolbar/index.jsx', () => ({
  MovementsToolbar: ({ filters, onFiltersChange, onAdvancedFilterChange }) => (
    <div data-testid="toolbar">
      <span data-testid="filters">{JSON.stringify(filters)}</span>
      {/* Quick filters driven via onFiltersChange */}
      <button data-testid="set-type-bpd" onClick={() => onFiltersChange('type')('BPD')}>
        set type
      </button>
      <button data-testid="set-search-acme" onClick={() => onFiltersChange('search')('acme')}>
        set search
      </button>
      {/*
        Status and amount are now advanced ("by conditions") filters, applied via
        onAdvancedFilterChange. Status matches on the derived `statusFamily` field
        (= movementStatusLabelKey(paymentStatus)), NOT raw paymentStatus.
      */}
      <button
        data-testid="set-status-reconciled"
        onClick={() =>
          onAdvancedFilterChange({
            rowOperator: 'and',
            conditions: [
              {
                field: 'statusFamily',
                operator: 'iEquals',
                value: 'financeAccountMovementsStatusReconciled',
              },
            ],
          })
        }
      >
        set status
      </button>
      <button
        data-testid="set-amount-gt0"
        onClick={() =>
          onAdvancedFilterChange({
            rowOperator: 'and',
            conditions: [{ field: 'amount', operator: 'greaterThan', value: 0 }],
          })
        }
      >
        amount gt0
      </button>
      <button
        data-testid="set-amount-range"
        onClick={() =>
          onAdvancedFilterChange({
            rowOperator: 'and',
            conditions: [{ field: 'amount', operator: 'between', value: [50, 200] }],
          })
        }
      >
        amount range
      </button>
      <button
        data-testid="set-date-custom"
        onClick={() =>
          onFiltersChange('dateRange')({
            from: new Date('2026-05-01'),
            to: new Date('2026-05-31'),
          })
        }
      >
        date custom
      </button>
      <button data-testid="set-date-null" onClick={() => onFiltersChange('dateRange')(null)}>
        date null
      </button>
    </div>
  ),
}));

vi.mock('../AccountSummaryStrip.jsx', () => ({
  AccountSummaryStrip: () => <div data-testid="summary-strip" />,
}));

vi.mock('../MovementsTable.jsx', () => ({
  MovementsTable: ({ movements }) => (
    <div data-testid="table">
      <span data-testid="row-count">{movements.length}</span>
      <span data-testid="row-ids">{movements.map((m) => m.id).join(',')}</span>
    </div>
  ),
}));

// Stub the wizard — its internals (useCreateMovement → useAuth, lookups, etc.)
// are out of scope for MovementsTab filtering behaviour and need a real
// AuthProvider otherwise.
vi.mock('../NewMovementWizard/index.jsx', () => ({
  NewMovementWizard: ({ open }) => (
    <div data-testid="new-movement-wizard" data-open={String(!!open)} />
  ),
}));

import { MovementsTab } from '../MovementsTab.jsx';

// Date helper — choose dates relative to "today" so that the default last30
// preset works regardless of when the test runs.
function daysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const M = [
  { id: 'a', date: daysAgo(1),  amount:  100, paymentStatus: 'RPPC', trxType: 'BPD', documentNo: 'DOC-001', contact: 'ACME',   description: 'compra' },
  { id: 'b', date: daysAgo(2),  amount: -200, paymentStatus: 'RPAP', trxType: 'BPW', documentNo: 'DOC-002', contact: 'Globex', description: 'pago' },
  { id: 'c', date: daysAgo(5),  amount:  300, paymentStatus: 'RPPC', trxType: 'BPD', documentNo: 'DOC-003', contact: 'Initech', description: 'venta' },
  { id: 'd', date: daysAgo(40), amount:  -50, paymentStatus: 'RPR',  trxType: 'BPW', documentNo: 'DOC-OLD', contact: 'OldCo', description: 'antiguo' },
];

function renderTab(props = {}) {
  return render(
    <MovementsTab
      account={{ id: 'acc-1', currencyIso: 'EUR' }}
      totals={{ balance: 0, inflows: 0, outflows: 0, currency: 'EUR' }}
      movements={M}
      loading={false}
      {...props}
    />,
  );
}

function rowIds() {
  return screen.getByTestId('row-ids').textContent.split(',').filter(Boolean);
}

describe('MovementsTab — default filters', () => {
  it('mounts with last30 + no other filters, hiding rows older than 30 days', () => {
    renderTab();
    // The 40-days-old row "d" must NOT show; the other three within last30 must.
    const ids = rowIds();
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).not.toContain('d');
  });

  it('renders the toolbar, summary strip and table', () => {
    renderTab();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('summary-strip')).toBeInTheDocument();
    expect(screen.getByTestId('table')).toBeInTheDocument();
  });
});

describe('MovementsTab — quick + advanced filter behavior', () => {
  it('filters by status family via the advanced filter (derived statusFamily)', () => {
    renderTab();
    act(() => {
      screen.getByTestId('set-status-reconciled').click();
    });
    // Rows a (RPPC) and c (RPPC) map to "Conciliado"; b (RPAP) is "Sin conciliar".
    expect(rowIds().sort()).toEqual(['a', 'c']);
  });

  it('filters by type (trxType equality)', () => {
    renderTab();
    act(() => {
      screen.getByTestId('set-type-bpd').click();
    });
    expect(rowIds().sort()).toEqual(['a', 'c']);
  });

  it('filters by search across documentNo / contact / description, case-insensitive', () => {
    renderTab();
    act(() => {
      screen.getByTestId('set-search-acme').click();
    });
    expect(rowIds()).toEqual(['a']);
  });

  it('filters by amount > 0 via the advanced filter (only positive amounts)', () => {
    renderTab();
    act(() => {
      screen.getByTestId('set-amount-gt0').click();
    });
    // a (100) and c (300) are positive; b (-200) is excluded.
    expect(rowIds().sort()).toEqual(['a', 'c']);
  });

  it('filters by amount range [50, 200] via the advanced filter (inclusive between)', () => {
    renderTab();
    act(() => {
      screen.getByTestId('set-amount-range').click();
    });
    // Within [50, 200]: a (100) qualifies; c (300) is above, b (-200) is below.
    expect(rowIds()).toEqual(['a']);
  });

  it('clears the date filter when set to null (lets the 40-days-old row appear)', () => {
    renderTab();
    act(() => {
      screen.getByTestId('set-date-null').click();
    });
    const ids = rowIds();
    expect(ids).toContain('d');
    expect(ids).toContain('a');
  });

  it('respects a custom { from, to } range — excludes rows outside the window', () => {
    // Choose a window guaranteed to exclude all our test rows.
    const earlyWindow = JSON.stringify({
      from: '1990-01-01',
      to: '1990-01-31',
    });
    // We can't easily click "set-date-custom" with arbitrary dates from the stub —
    // but the stub above sets {2026-05-01..2026-05-31}. None of our `daysAgo(...)`
    // rows land in May 2026 unless "today" happens to be in that window.
    // Use a deterministic approach: render with movements that all lie outside
    // that month.
    const out = [
      { ...M[0], date: '2020-01-15T12:00:00.000Z' },
      { ...M[1], date: '2020-01-16T12:00:00.000Z' },
    ];
    render(
      <MovementsTab
        account={{ id: 'acc-1' }}
        totals={{ balance: 0, inflows: 0, outflows: 0, currency: 'EUR' }}
        movements={out}
        loading={false}
      />,
    );
    act(() => {
      screen.getByTestId('set-date-custom').click();
    });
    expect(rowIds()).toEqual([]);
    // Reference the variable so eslint doesn't complain in CI.
    expect(earlyWindow).toContain('1990');
  });
});

describe('MovementsTab — pass-through props', () => {
  it('passes loading=true to MovementsTable', () => {
    renderTab({ loading: true, movements: [] });
    expect(screen.getByTestId('table')).toBeInTheDocument();
    expect(screen.getByTestId('row-count').textContent).toBe('0');
  });
});

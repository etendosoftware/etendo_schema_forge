import { render, screen, act, waitFor } from '@testing-library/react';
import { createRef } from 'react';

// Stub the three children. We expose:
//   - MovementsToolbar: lets the test drive filter changes via onFiltersChange
//   - MovementsTable: just emits the current filtered movements as JSON for assertions
//   - AccountSummaryStrip: just a marker
vi.mock('../MovementsToolbar/index.jsx', () => ({
  MovementsToolbar: ({ filters, onFiltersChange, onAdvancedFilterChange, onTransfer }) => (
    <div data-testid="toolbar">
      <span data-testid="filters">{JSON.stringify(filters)}</span>
      {/* Quick filters driven via onFiltersChange */}
      <button data-testid="set-type-bpd" onClick={() => onFiltersChange('type')('BPD')}>
        set type
      </button>
      <button data-testid="set-search-acme" onClick={() => onFiltersChange('search')('acme')}>
        set search
      </button>
      {/* Triggers the parent's onTransfer callback (opens FundsTransferModal). */}
      <button data-testid="trigger-transfer" onClick={() => onTransfer?.()}>
        transfer
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
      {/*
        A dateRange shape with neither `presetId` nor `from`/`to` — exercises the
        final `return null;` branch of kpiWindowSuffix().
      */}
      <button data-testid="set-date-weird" onClick={() => onFiltersChange('dateRange')({})}>
        date weird
      </button>
    </div>
  ),
}));

vi.mock('../AccountSummaryStrip.jsx', () => ({
  // Surface totals.windowSuffix so tests can assert on kpiWindowSuffix()'s output.
  AccountSummaryStrip: ({ totals }) => (
    <div data-testid="summary-strip">
      <span data-testid="window-suffix">{JSON.stringify(totals?.windowSuffix ?? null)}</span>
    </div>
  ),
}));

vi.mock('../MovementsTable.jsx', () => ({
  MovementsTable: ({ movements, selectedIds, onSelectionChange }) => (
    <div data-testid="table">
      <span data-testid="row-count">{movements.length}</span>
      <span data-testid="row-ids">{movements.map((m) => m.id).join(',')}</span>
      <span data-testid="selected-ids">{[...(selectedIds ?? [])].join(',')}</span>
      {/* Toggles selection of movement "a" — exercises both the select and
          deselect branches of handleSelectionChange. */}
      <button data-testid="toggle-select-a" onClick={() => onSelectionChange('a')}>
        toggle a
      </button>
      <button data-testid="toggle-select-b" onClick={() => onSelectionChange('b')}>
        toggle b
      </button>
    </div>
  ),
  // The tab builds these from the table module (the sort state lives in the tab since
  // ETP-4921, so its toolbar can host the "Ordenar por" popover).
  useTrxTypeLabel: () => (m) => m.trxType,
  buildMovementSortCtx: () => ({}),
  buildMovementSortAccessors: () => ({}),
  buildMovementSortColumns: () => [],
}));

// Stub the new-transaction modal — its internals (useCreateMovement → useAuth,
// lookups, etc.) are out of scope for MovementsTab filtering behaviour and need a
// real AuthProvider otherwise. onClose/onSuccess are surfaced so tests can trigger
// the callbacks MovementsTab wires up (setNewMovementOpen(false) / onReload).
vi.mock('../NewTransactionModal.jsx', () => ({
  NewTransactionModal: ({ open, onClose, onSuccess }) => (
    <div data-testid="new-transaction-modal" data-open={String(!!open)}>
      <button data-testid="modal-close" onClick={() => onClose?.()}>close</button>
      <button data-testid="modal-success" onClick={() => onSuccess?.()}>success</button>
    </div>
  ),
}));

// Stub the transfer modal similarly — its internals (useFundsTransfer, account
// lookups) are out of scope here. onClose/onSuccess are surfaced so tests can
// trigger MovementsTab's setTransferOpen(false) / onReload callbacks.
vi.mock('../FundsTransferModal.jsx', () => ({
  FundsTransferModal: ({ onClose, onSuccess }) => (
    <div data-testid="funds-transfer-modal">
      <button data-testid="transfer-close" onClick={() => onClose?.()}>close</button>
      <button data-testid="transfer-success" onClick={() => onSuccess?.()}>success</button>
    </div>
  ),
}));

// ETP-4656 — MovementsTab now also calls useDeleteMovement() directly (bulk
// "Delete selected" over the existing checkbox selection), which calls
// useAuth() internally; stub it like the other auth-touching hooks above (no
// AuthProvider needed).
// `mockDeleteMovement` is hoisted to module scope (not re-created per render,
// unlike the original inline `vi.fn()`) so the bulk-delete describe block
// below can configure per-id resolve/reject behavior across renders.
const mockDeleteMovement = vi.fn();
vi.mock('@/hooks/useCreateMovement', () => ({
  useDeleteMovement: () => ({ deleteMovement: (...args) => mockDeleteMovement(...args), deleting: false, error: null }),
}));

// The wiring itself (requestBatchDelete → confirm → onOutcome) is exercised
// against the real `useBatchDeleteDialog` + `BulkDeleteSelectionBar` below —
// only their downstream toast side effect needs a spy.
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    warning: (...a) => toastWarning(...a),
    error: (...a) => toastError(...a),
    info: vi.fn(),
  },
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

describe('MovementsTab — selection toggle', () => {
  it('selects then deselects the same id (both branches of handleSelectionChange)', () => {
    renderTab();
    expect(screen.getByTestId('selected-ids').textContent).toBe('');

    act(() => {
      screen.getByTestId('toggle-select-a').click();
    });
    expect(screen.getByTestId('selected-ids').textContent).toBe('a');

    act(() => {
      screen.getByTestId('toggle-select-a').click();
    });
    expect(screen.getByTestId('selected-ids').textContent).toBe('');
  });
});

// ETP-4656 (Gap 2) — bulk "Delete selected" over the existing checkbox
// selection, via BulkDeleteSelectionBar + useBatchDeleteDialog (neither
// mocked here — the real components render, matching ImportedStatementsTab's
// equivalent suite).
describe('MovementsTab — bulk delete selection bar', () => {
  beforeEach(() => {
    mockDeleteMovement.mockReset();
    toastSuccess.mockReset();
    toastWarning.mockReset();
    toastError.mockReset();
  });

  it('is hidden with no selection, and appears once a row is selected', () => {
    renderTab();
    expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();

    act(() => screen.getByTestId('toggle-select-a').click());

    expect(screen.getByTestId('bulk-delete-selection-bar')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete-selection-trigger')).toHaveTextContent('(1)');
  });

  it('Cancel clears the selection and hides the bar', () => {
    renderTab();
    act(() => screen.getByTestId('toggle-select-a').click());
    expect(screen.getByTestId('bulk-delete-selection-bar')).toBeInTheDocument();

    act(() => screen.getByTestId('bulk-delete-selection-cancel').click());

    expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('selected-ids').textContent).toBe('');
  });

  it('all succeed: calls deleteMovement per selected id, reloads, fires a success toast, and clears the selection', async () => {
    mockDeleteMovement.mockResolvedValue(undefined);
    const onReload = vi.fn();
    renderTab({ onReload });

    act(() => screen.getByTestId('toggle-select-a').click());
    act(() => screen.getByTestId('toggle-select-b').click());
    act(() => screen.getByTestId('bulk-delete-selection-trigger').click());
    act(() => screen.getByTestId('batch-delete-confirm').click());

    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    expect(mockDeleteMovement).toHaveBeenCalledWith({ id: 'a' });
    expect(mockDeleteMovement).toHaveBeenCalledWith({ id: 'b' });
    expect(toastSuccess).toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();
  });

  it('partial failure (e.g. a payment-linked movement): reloads, fires ONE warning toast, and keeps only the failed movement selected', async () => {
    mockDeleteMovement.mockImplementation(({ id }) =>
      id === 'a' ? Promise.resolve() : Promise.reject(new Error('cannot delete linked movement')),
    );
    const onReload = vi.fn();
    renderTab({ onReload });

    act(() => screen.getByTestId('toggle-select-a').click());
    act(() => screen.getByTestId('toggle-select-b').click());
    act(() => screen.getByTestId('bulk-delete-selection-trigger').click());
    act(() => screen.getByTestId('batch-delete-confirm').click());

    await waitFor(() => expect(toastWarning).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(onReload).toHaveBeenCalledTimes(1);
    // 'a' succeeded and was dropped; 'b' failed and remains selected.
    expect(screen.getByTestId('selected-ids').textContent).toBe('b');
  });

  it('all fail: does not reload, fires an error toast, and leaves the selection untouched', async () => {
    mockDeleteMovement.mockRejectedValue(new Error('cannot delete linked movement'));
    const onReload = vi.fn();
    renderTab({ onReload });

    act(() => screen.getByTestId('toggle-select-a').click());
    act(() => screen.getByTestId('bulk-delete-selection-trigger').click());
    act(() => screen.getByTestId('batch-delete-confirm').click());

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByTestId('selected-ids').textContent).toBe('a');
    expect(screen.getByTestId('bulk-delete-selection-bar')).toBeInTheDocument();
  });
});

describe('MovementsTab — kpi window suffix', () => {
  it('returns null when dateRange has neither presetId nor from/to', () => {
    renderTab();
    act(() => {
      screen.getByTestId('set-date-weird').click();
    });
    expect(screen.getByTestId('window-suffix').textContent).toBe('null');
  });
});

describe('MovementsTab — imperative handle', () => {
  it('exposes getFilteredMovements() via ref, reflecting the current filters', () => {
    const ref = createRef();
    render(
      <MovementsTab
        ref={ref}
        account={{ id: 'acc-1', currencyIso: 'EUR' }}
        totals={{ balance: 0, inflows: 0, outflows: 0, currency: 'EUR' }}
        movements={M}
        loading={false}
      />,
    );
    const filtered = ref.current.getFilteredMovements();
    expect(filtered.map((m) => m.id).sort()).toEqual(['a', 'b', 'c']);

    // Filter narrows further — the ref must reflect the latest filtered list.
    act(() => {
      screen.getByTestId('set-type-bpd').click();
    });
    expect(ref.current.getFilteredMovements().map((m) => m.id).sort()).toEqual(['a', 'c']);
  });
});

describe('MovementsTab — transfer flow', () => {
  it('opens FundsTransferModal via onTransfer, and its onSuccess/onClose callbacks work', () => {
    const onReload = vi.fn();
    renderTab({ onReload });

    // Not rendered until the toolbar's transfer action fires.
    expect(screen.queryByTestId('funds-transfer-modal')).not.toBeInTheDocument();

    act(() => {
      screen.getByTestId('trigger-transfer').click();
    });
    expect(screen.getByTestId('funds-transfer-modal')).toBeInTheDocument();

    act(() => {
      screen.getByTestId('transfer-success').click();
    });
    expect(onReload).toHaveBeenCalledTimes(1);

    act(() => {
      screen.getByTestId('transfer-close').click();
    });
    expect(screen.queryByTestId('funds-transfer-modal')).not.toBeInTheDocument();
  });

  it('does not throw when onSuccess fires without an onReload prop', () => {
    renderTab({ onReload: undefined });
    act(() => {
      screen.getByTestId('trigger-transfer').click();
    });
    expect(() => {
      act(() => {
        screen.getByTestId('transfer-success').click();
      });
    }).not.toThrow();
  });
});

describe('MovementsTab — new transaction modal callbacks', () => {
  it('invokes onReload on modal success, and onClose does not throw', () => {
    const onReload = vi.fn();
    renderTab({ onReload });

    act(() => {
      screen.getByTestId('modal-success').click();
    });
    expect(onReload).toHaveBeenCalledTimes(1);

    expect(() => {
      act(() => {
        screen.getByTestId('modal-close').click();
      });
    }).not.toThrow();
  });
});

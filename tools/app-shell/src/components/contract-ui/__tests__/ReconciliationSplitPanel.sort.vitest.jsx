// @covers tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx
const personalGrid = vi.hoisted(() => ({ enabled: false, apiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => personalGrid.apiFetch }));
vi.mock('@/lib/flags', () => ({ GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => personalGrid.enabled }));

// ETP-5242 — client-side column sorting on both tables of the reconciliation split panel, plus the
// Información partner-name tooltip on the right panel.
//
// Contract under test:
//   - Every data column header of both panels is a `SortableHeaderLabel` button
//     (`column-header-sort-<key>`); left keys date/description/progress/amount, right keys
//     date/info/pendingBalance/amount. Both panels have a `date` and an `amount` key, so every
//     lookup is scoped to its own <table>.
//   - Clicks cycle asc → desc → none; only one column per panel is active (shows the arrow).
//   - Sorting is purely in memory: it never re-invokes the data hooks with new arguments, and it
//     leaves the selection and the action-bar totals untouched.
//   - Right panel: with no sort, the selected-then-suggested pin decides the order; with a sort
//     active the column order wins, so ticking a checkbox does not move the row.
//
// Mocks BEFORE imports — same mock set as ReconciliationSplitPanel.selectionResolution.vitest.jsx.

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

// Echoes the key back, so no assertion below hardcodes Spanish/English copy.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    if (vars) return key.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    return key;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

vi.mock('@/components/ui/distinct-values-filter', () => ({
  DistinctValuesFilter: ({ value, onChange, codes, allLabel }) => {
    const kind = codes.includes('pending') ? 'status' : 'source';
    return (
      <div data-testid={`recon-${kind}-filter-stub`}>
        <span data-testid={`recon-${kind}-filter-value`}>{value ?? ''}</span>
        <button type="button" data-testid={`recon-${kind}-option-all`} onClick={() => onChange(null)}>
          {allLabel}
        </button>
        {codes.map((code) => (
          <button key={code} type="button" data-testid={`recon-${kind}-option-${code}`} onClick={() => onChange(code)}>
            {code}
          </button>
        ))}
      </div>
    );
  },
}));

const linesState = {
  lines: [], total: 0, counts: {}, loading: false, reload: vi.fn(), draftReconciliationCount: 0,
};
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn(), loading: false };
const removeState = { removeOperation: vi.fn(), loading: false };
const reactivateSelectedState = { reactivateSelected: vi.fn(), loading: false };
const reconcileDifferenceState = { reconcileDifference: vi.fn(), loading: false };

// Every call's arguments, so a test can prove a sort click did not trigger a refetch: the data
// hooks refetch when their arguments change, and a sort must never change them.
const linesHookCalls = [];
const candidatesHookCalls = [];

vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: (...args) => {
    linesHookCalls.push(args);
    return linesState;
  },
  useCandidateOperations: (...args) => {
    candidatesHookCalls.push(args);
    const [, lineId] = args;
    return {
      candidates: lineId ? [...candidatesState.candidates] : [],
      loading: candidatesState.loading,
    };
  },
  useReconcileGroup: () => reconcileState,
  useRemoveOperation: () => removeState,
  useReactivateSelected: () => reactivateSelectedState,
  useReconcileDifference: () => reconcileDifferenceState,
}));

import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { ReconciliationSplitPanel, resolveReconciliationCandidateScope } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';
import userEvent from '@testing-library/user-event';
import { formatSigned } from '@/lib/formatSigned';

// ── Fixtures ───────────────────────────────────────────────────────────────────

// Backend order is L1, L2, L3 — deliberately NOT sorted on any column, so every sort visibly
// reorders and "none" visibly restores.
const LINES = [
  {
    id: 'L1', date: '2026-05-10T00:00:00Z', description: 'Transferencia ACME',
    status: 'pending', state: 'pending', amount: 100, reconciledPct: 0,
  },
  {
    id: 'L2', date: '2026-05-11T00:00:00Z', description: 'Nomina',
    status: 'pending', state: 'pending', amount: 42, reconciledPct: 0,
  },
  {
    id: 'L3', date: '2026-05-09T00:00:00Z', description: 'Comision',
    status: 'pending', state: 'pending', amount: -15, reconciledPct: 0,
  },
];

// Backend order C1, C2, C3. C2 is the algorithm's suggestion, so it is pre-selected when the
// line is picked — the pin therefore shows C2 first.
const CANDIDATES = [
  {
    id: 'C1', date: '2026-06-12T00:00:00Z', documentNo: 'MOV-3', partnerName: 'ACME',
    amount: 10, pendingBalance: 10, status: 'pending', suggested: false,
  },
  {
    id: 'C2', date: '2026-06-10T00:00:00Z', documentNo: 'MOV-1', partnerName: 'Beta',
    amount: 30, pendingBalance: 30, status: 'pending', suggested: true,
  },
  {
    id: 'C3', date: '2026-06-11T00:00:00Z', documentNo: 'MOV-2', partnerName: 'Gamma',
    amount: 20, pendingBalance: 20, status: 'pending', suggested: false,
  },
];

const PANEL_PROPS = { accountId: 'ACC-1', currency: 'EUR' };

function renderPanel(props = {}) {
  return render(<ReconciliationSplitPanel {...PANEL_PROPS} onReconcileSuccess={vi.fn()} {...props} />);
}

const leftTable = () => screen.getByTestId('recon-line-row-L1').closest('table');
// Anchored on whichever candidate row is present (a search can filter any given id out); the
// right panel is the only place `recon-cand-row-*` rows render.
const rightTable = () => screen.getAllByTestId(/^recon-cand-row-/)[0].closest('table');

const leftHeader = (key) => within(leftTable()).getByTestId(`column-header-sort-${key}`);
const rightHeader = (key) => within(rightTable()).getByTestId(`column-header-sort-${key}`);

const lineOrder = () => within(leftTable()).getAllByTestId(/^recon-line-row-/)
  .map((el) => el.dataset.testid.replace('recon-line-row-', ''));
const candOrder = () => within(rightTable()).getAllByTestId(/^recon-cand-row-/)
  .map((el) => el.dataset.testid.replace('recon-cand-row-', ''));

/** The aria-hidden ▲/▼ spans inside a table's sort buttons. */
const arrowsIn = (table) =>
  Array.from(table.querySelectorAll('button[data-testid^="column-header-sort-"] span[aria-hidden="true"]'));

const candCheckbox = (id) => within(screen.getByTestId(`recon-cand-check-${id}`)).getByRole('checkbox');

const selectedTotal = () => screen.getByText('financeReconcileBarSelected').nextElementSibling.textContent;
const remainingTotal = () => screen.getByText('financeReconcileBarRemaining').nextElementSibling.textContent;

function selectLine(id = 'L1') {
  fireEvent.click(screen.getByTestId(`recon-line-radio-${id}`));
}

const setMetrics = (el, scrollWidth, clientWidth) => {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
};

beforeEach(() => {
  linesHookCalls.length = 0;
  candidatesHookCalls.length = 0;
  linesState.lines = [...LINES];
  linesState.total = LINES.length;
  linesState.counts = {};
  linesState.loading = false;
  linesState.reload = vi.fn();
  linesState.draftReconciliationCount = 0;
  candidatesState.candidates = [...CANDIDATES];
  candidatesState.loading = false;
  reconcileState.reconcile = vi.fn().mockResolvedValue({ reconciliationId: 'R1' });
  reconcileState.loading = false;
  removeState.removeOperation = vi.fn().mockResolvedValue({ removed: true });
  removeState.loading = false;
  reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({ reactivated: true });
  reactivateSelectedState.loading = false;
  reconcileDifferenceState.reconcileDifference = vi.fn().mockResolvedValue({ transactionId: 'T' });
  reconcileDifferenceState.loading = false;
});

// ── 1. Header affordance ──────────────────────────────────────────────────────

describe('sortable headers', () => {
  it('renders the left panel headers as buttons carrying the translated label', () => {
    renderPanel();

    const expected = {
      date: 'financeReconcileColDate',
      description: 'financeReconcileColDescription',
      progress: 'financeReconcileColProgress',
      amount: 'financeReconcileColAmount',
    };
    for (const [key, label] of Object.entries(expected)) {
      const btn = leftHeader(key);
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).toHaveTextContent(label);
    }
  });

  it('renders the right panel headers as buttons carrying the translated label', () => {
    renderPanel();
    selectLine();

    const expected = {
      date: 'financeReconcileColDate',
      info: 'financeReconcileColInfo',
      pendingBalance: 'financeReconcileColPendingBalance',
      amount: 'financeReconcileColAmount',
    };
    for (const [key, label] of Object.entries(expected)) {
      const btn = rightHeader(key);
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).toHaveTextContent(label);
    }
  });

  it('keeps each panel\'s sort controls inside its own table', () => {
    renderPanel();
    selectLine();

    expect(within(leftTable()).queryByTestId('column-header-sort-info')).toBeNull();
    expect(within(leftTable()).queryByTestId('column-header-sort-pendingBalance')).toBeNull();
    expect(within(rightTable()).queryByTestId('column-header-sort-description')).toBeNull();
    expect(within(rightTable()).queryByTestId('column-header-sort-progress')).toBeNull();
  });

  it('shows no arrow on either panel before any click', () => {
    renderPanel();
    selectLine();

    expect(arrowsIn(leftTable())).toHaveLength(0);
    expect(arrowsIn(rightTable())).toHaveLength(0);
  });
});

// ── 2. Left panel ─────────────────────────────────────────────────────────────

describe('left panel sorting', () => {
  it('starts in backend order', () => {
    renderPanel();

    expect(lineOrder()).toEqual(['L1', 'L2', 'L3']);
  });

  it('cycles the amount column asc → desc → none', () => {
    renderPanel();

    fireEvent.click(leftHeader('amount'));
    expect(lineOrder()).toEqual(['L3', 'L2', 'L1']);
    expect(leftHeader('amount')).toHaveTextContent('▲');

    fireEvent.click(leftHeader('amount'));
    expect(lineOrder()).toEqual(['L1', 'L2', 'L3']);
    expect(leftHeader('amount')).toHaveTextContent('▼');

    fireEvent.click(leftHeader('amount'));
    expect(lineOrder()).toEqual(['L1', 'L2', 'L3']);
    expect(arrowsIn(leftTable())).toHaveLength(0);
  });

  it('sorts by calendar date', () => {
    renderPanel();

    fireEvent.click(leftHeader('date'));
    expect(lineOrder()).toEqual(['L3', 'L1', 'L2']);

    fireEvent.click(leftHeader('date'));
    expect(lineOrder()).toEqual(['L2', 'L1', 'L3']);
  });

  it('sorts by description text', () => {
    renderPanel();

    fireEvent.click(leftHeader('description'));
    // Comision, Nomina, Transferencia ACME
    expect(lineOrder()).toEqual(['L3', 'L2', 'L1']);
  });

  it('keeps only one active column: switching columns moves the arrow', () => {
    renderPanel();

    fireEvent.click(leftHeader('date'));
    fireEvent.click(leftHeader('amount'));

    const arrows = arrowsIn(leftTable());
    expect(arrows).toHaveLength(1);
    expect(leftHeader('amount')).toContainElement(arrows[0]);
    expect(leftHeader('date')).not.toHaveTextContent(/[▲▼]/);
    // A newly chosen column always starts ascending.
    expect(lineOrder()).toEqual(['L3', 'L2', 'L1']);
  });

  it('keeps the selected line selected while reordering', () => {
    renderPanel();
    selectLine('L1');

    fireEvent.click(leftHeader('amount'));

    expect(screen.getByTestId('recon-line-radio-L1')).toBeChecked();
    expect(screen.getByTestId('recon-cand-row-C1')).toBeInTheDocument();
  });
});

// ── 3. Right panel ────────────────────────────────────────────────────────────

describe('right panel sorting', () => {
  it('shows the selected-then-suggested pin when no column is chosen', () => {
    renderPanel();
    selectLine();

    // C2 is suggested → pre-selected → pinned on top; the rest keep backend order.
    expect(candCheckbox('C2')).toBeChecked();
    expect(candOrder()).toEqual(['C2', 'C1', 'C3']);
  });

  it('lets a ticked row float up under the pin when no column is chosen', () => {
    renderPanel();
    selectLine();

    fireEvent.click(screen.getByTestId('recon-cand-check-C3'));

    expect(candOrder()).toEqual(['C2', 'C3', 'C1']);
  });

  it('cycles the amount column asc → desc → none, the column order beating the pin', () => {
    renderPanel();
    selectLine();

    fireEvent.click(rightHeader('amount'));
    expect(candOrder()).toEqual(['C1', 'C3', 'C2']);
    expect(rightHeader('amount')).toHaveTextContent('▲');

    fireEvent.click(rightHeader('amount'));
    expect(candOrder()).toEqual(['C2', 'C3', 'C1']);
    expect(rightHeader('amount')).toHaveTextContent('▼');

    // Third click: back to the pinned order.
    fireEvent.click(rightHeader('amount'));
    expect(candOrder()).toEqual(['C2', 'C1', 'C3']);
    expect(arrowsIn(rightTable())).toHaveLength(0);
  });

  it('sorts by date, info and pending balance', () => {
    renderPanel();
    selectLine();

    fireEvent.click(rightHeader('date'));
    expect(candOrder()).toEqual(['C2', 'C3', 'C1']);

    fireEvent.click(rightHeader('info'));
    // MOV-1, MOV-2, MOV-3
    expect(candOrder()).toEqual(['C2', 'C3', 'C1']);
    fireEvent.click(rightHeader('info'));
    expect(candOrder()).toEqual(['C1', 'C3', 'C2']);

    fireEvent.click(rightHeader('pendingBalance'));
    expect(candOrder()).toEqual(['C1', 'C3', 'C2']);
  });

  it('does not move a row when its checkbox is toggled while a sort is active', () => {
    renderPanel();
    selectLine();
    fireEvent.click(rightHeader('amount'));
    const sorted = candOrder();

    fireEvent.click(screen.getByTestId('recon-cand-check-C3'));
    expect(candCheckbox('C3')).toBeChecked();
    expect(candOrder()).toEqual(sorted);

    fireEvent.click(screen.getByTestId('recon-cand-check-C2'));
    expect(candCheckbox('C2')).not.toBeChecked();
    expect(candOrder()).toEqual(sorted);
  });

  it('keeps only one active column per panel, independently of the other panel', () => {
    renderPanel();
    selectLine();

    fireEvent.click(leftHeader('amount'));
    fireEvent.click(rightHeader('date'));
    fireEvent.click(rightHeader('pendingBalance'));

    const rightArrows = arrowsIn(rightTable());
    expect(rightArrows).toHaveLength(1);
    expect(rightHeader('pendingBalance')).toContainElement(rightArrows[0]);

    // The right panel's clicks did not touch the left panel's sort.
    const leftArrows = arrowsIn(leftTable());
    expect(leftArrows).toHaveLength(1);
    expect(leftHeader('amount')).toContainElement(leftArrows[0]);
    // …and the right panel's `amount` (same key) is not lit by the left one.
    expect(rightHeader('amount')).not.toHaveTextContent(/[▲▼]/);
  });

  it('still applies the text search while a sort is active', () => {
    renderPanel();
    selectLine();
    fireEvent.click(rightHeader('amount'));

    fireEvent.change(screen.getByTestId('recon-right-search'), { target: { value: 'gamma' } });

    expect(candOrder()).toEqual(['C3']);
  });
});

// ── 4. Sorting is presentational only ─────────────────────────────────────────

describe('sorting side effects', () => {
  it('never re-invokes the data hooks with different arguments', () => {
    renderPanel();
    selectLine();
    const lastLinesArgs = JSON.stringify(linesHookCalls.at(-1));
    const lastCandArgs = JSON.stringify(candidatesHookCalls.at(-1));
    const linesCallsBefore = linesHookCalls.length;
    const candCallsBefore = candidatesHookCalls.length;

    fireEvent.click(leftHeader('amount'));
    fireEvent.click(leftHeader('amount'));
    fireEvent.click(rightHeader('date'));
    fireEvent.click(rightHeader('pendingBalance'));

    const newLinesArgs = linesHookCalls.slice(linesCallsBefore).map((a) => JSON.stringify(a));
    const newCandArgs = candidatesHookCalls.slice(candCallsBefore).map((a) => JSON.stringify(a));
    expect(new Set(newLinesArgs)).toEqual(new Set([lastLinesArgs]));
    expect(new Set(newCandArgs)).toEqual(new Set([lastCandArgs]));
    expect(linesState.reload).not.toHaveBeenCalled();
  });

  it('leaves the checked candidates and the action-bar totals untouched', () => {
    renderPanel();
    selectLine();
    fireEvent.click(screen.getByTestId('recon-cand-check-C3'));

    // C2 (suggested, 30) + C3 (20) of a 100 line.
    expect(selectedTotal()).toBe(formatSigned(50, 'EUR'));
    expect(remainingTotal()).toBe(formatSigned(50, 'EUR'));
    const before = { selected: selectedTotal(), remaining: remainingTotal() };

    fireEvent.click(rightHeader('amount'));
    fireEvent.click(rightHeader('amount'));
    fireEvent.click(leftHeader('date'));

    expect(candCheckbox('C1')).not.toBeChecked();
    expect(candCheckbox('C2')).toBeChecked();
    expect(candCheckbox('C3')).toBeChecked();
    expect({ selected: selectedTotal(), remaining: remainingTotal() }).toEqual(before);
  });
});

// ── 5. Información partner-name tooltip ───────────────────────────────────────

describe('Información partner name', () => {
  const LONG_PARTNER = 'Distribuciones Industriales del Norte de la Peninsula S.L.';

  it('renders the partner name through TruncatedText with a row-scoped test id', () => {
    renderPanel();
    selectLine();

    const partner = screen.getByTestId('recon-cand-partner-C1');
    expect(partner).toHaveTextContent('ACME');
    expect(partner).toHaveClass('truncate', 'min-w-0');
  });

  it('renders nothing for a candidate with no partner', () => {
    candidatesState.candidates = [{ ...CANDIDATES[0], partnerName: '' }, CANDIDATES[1]];
    renderPanel();
    selectLine();

    expect(screen.queryByTestId('recon-cand-partner-C1')).toBeNull();
    expect(screen.getByTestId('recon-cand-partner-C2')).toBeInTheDocument();
  });

  it('reveals the full partner name on hover only when it is clipped', () => {
    candidatesState.candidates = [{ ...CANDIDATES[0], partnerName: LONG_PARTNER }, CANDIDATES[1]];
    renderPanel();
    selectLine();

    const clipped = screen.getByTestId('recon-cand-partner-C1');
    setMetrics(clipped, 480, 160);
    fireEvent.focus(clipped);

    expect(screen.getByTestId('recon-cand-partner-C1-tooltip')).toHaveTextContent(LONG_PARTNER);
  });

  it('stays silent when the partner name fits', () => {
    renderPanel();
    selectLine();

    const fitting = screen.getByTestId('recon-cand-partner-C2');
    setMetrics(fitting, 40, 160);
    fireEvent.focus(fitting);

    expect(screen.queryByTestId('recon-cand-partner-C2-tooltip')).toBeNull();
  });
});

describe('reconciliation personal column views', () => {
  beforeEach(() => {
    personalGrid.enabled = true;
    personalGrid.apiFetch.mockReset().mockResolvedValue({ ok: true, status: 204 });
  });
  afterEach(() => { personalGrid.enabled = false; });

  it('keeps the original tables and selection behavior with the feature flag off', () => {
    personalGrid.enabled = false;
    renderPanel();
    selectLine();
    expect(personalGrid.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('grid-view-controls')).toBeNull();
    expect(leftTable().querySelector('thead tr').children).toHaveLength(5);
    expect(rightTable().querySelector('thead tr').children).toHaveLength(5);
    fireEvent.click(rightHeader('amount'));
    expect(candOrder()).toEqual(['C1', 'C3', 'C2']);
    expect(candCheckbox('C2')).toBeChecked();
    expect(screen.getByTestId('recon-line-radio-L1')).toBeChecked();
  });
});

describe('reconciliation candidate view identity', () => {
  it.each([
    [true, 'sales-invoice'],
    [false, 'purchase-invoice'],
  ])('uses the installment identity for invoice rows in direction %s', (isReceipt, spec) => {
    const candidates = [{ id: 'schedule-1', scheduleId: 'schedule-1', invoiceId: 'invoice-header-1', kind: 'invoice', isReceipt }];
    expect(resolveReconciliationCandidateScope(candidates, null)).toEqual({ spec, entity: 'paymentPlan' });
  });

  it('uses movement identity for transaction candidates and linked operations', () => {
    expect(resolveReconciliationCandidateScope([{ id: 'movement-1' }], null)).toEqual({ spec: 'financial-account', entity: 'transaction' });
    expect(resolveReconciliationCandidateScope([{ id: 'movement-1', linked: true }], null, true)).toEqual({ spec: 'financial-account', entity: 'transaction' });
  });

  it.each([
    [{ id: 'schedule-1', kind: 'invoice', scheduleId: 'different-id', isReceipt: true }],
    [{ id: 'schedule-1', kind: 'invoice', scheduleId: 'schedule-1' }],
    [{ id: 'movement-1', kind: 'unrecognized' }],
    [{ id: '' }],
    [{ id: 'movement-1' }, { id: 'schedule-1', kind: 'invoice', scheduleId: 'schedule-1', isReceipt: true }],
    [{ id: 'schedule-1', kind: 'invoice', scheduleId: 'schedule-1', isReceipt: true }, { id: 'schedule-2', kind: 'invoice', scheduleId: 'schedule-2', isReceipt: false }],
  ])('declines personal views for rows without one valid common contract: %j', (...candidates) => {
    expect(resolveReconciliationCandidateScope(candidates, null)).toBeNull();
  });

  it.each([
    ['salesInvoices', { spec: 'sales-invoice', entity: 'paymentPlan' }],
    ['purchaseInvoices', { spec: 'purchase-invoice', entity: 'paymentPlan' }],
    ['receipts', { spec: 'financial-account', entity: 'transaction' }],
    ['payments', { spec: 'financial-account', entity: 'transaction' }],
    [null, null],
  ])('scopes an empty list only from its declared source: %s', (source, expected) => {
    expect(resolveReconciliationCandidateScope([], source)).toEqual(expected);
  });
});

const gridResponse = (body, status = 200) => ({ ok: true, status, json: async () => body });
const leftGridControls = () => screen.getByTestId('recon-grid-view-financial-account-bankStatementLines');
const transactionGridControls = () => screen.getByTestId('recon-grid-view-financial-account-transaction');
const personalView = (columns) => ({ version: 1, surface: 'list', columns });

describe('reconciliation scoped column layouts', () => {
  beforeEach(() => {
    personalGrid.enabled = true;
    personalGrid.apiFetch.mockReset().mockImplementation((url) => Promise.resolve(gridResponse(personalView(url.endsWith('/bankStatementLines') ? [
      { id: 'list:field:selection', visible: false, order: 30, width: 999 },
      { id: 'list:ad:Description:field:description', visible: false, order: 1 },
      { id: 'list:field:amount', order: 0 },
      { id: 'list:field:reconciliationProgress', order: 2 },
      { id: 'list:ad:Datetrx:field:transactionDate', order: 3 },
    ] : [
      { id: 'list:field:selection', visible: false, order: 30, width: 999 },
      { id: 'list:field:reconciliationDocumentInfo', visible: false },
      { id: 'list:field:amount', order: 0 },
    ]))));
  });
  afterEach(() => { personalGrid.enabled = false; });

  it('loads each real scope and preserves sorting, selection and totals under saved layouts', async () => {
    renderPanel();
    await waitFor(() => expect(within(leftGridControls()).getByTestId('grid-view-columns-trigger')).toBeEnabled());
    selectLine();
    await waitFor(() => expect(within(transactionGridControls()).getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(personalGrid.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/financial-account/bankStatementLines', { baseUrl: '' });
    expect(personalGrid.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/financial-account/transaction', { baseUrl: '' });
    expect(leftTable().querySelector('thead tr').children).toHaveLength(4);
    expect(leftTable().querySelector('thead tr').children[1]).toContainElement(leftHeader('amount'));
    expect(screen.queryByTestId('recon-line-desc-L1')).toBeNull();
    expect(within(rightTable()).queryByTestId('column-header-sort-info')).toBeNull();
    expect(rightTable().querySelector('thead tr').firstElementChild).not.toHaveAttribute('draggable', 'true');
    expect(screen.getByTestId('recon-line-radio-L1')).toBeChecked();
    expect(candCheckbox('C2')).toBeChecked();
    const totalBefore = selectedTotal();
    const remainingBefore = remainingTotal();
    fireEvent.click(rightHeader('amount'));
    expect(candOrder()).toEqual(['C1', 'C3', 'C2']);
    expect(selectedTotal()).toBe(totalBefore);
    expect(remainingTotal()).toBe(remainingBefore);
    fireEvent.click(leftHeader('amount'));
    expect(lineOrder()).toEqual(['L3', 'L2', 'L1']);
    expect(screen.getByTestId('recon-line-radio-L1')).toBeChecked();
  });

  it.each([[true, 'sales-invoice'], [false, 'purchase-invoice']])('loads invoice installment preferences for direction %s', async (isReceipt, spec) => {
    candidatesState.candidates = CANDIDATES.map((candidate) => ({ ...candidate, kind: 'invoice', scheduleId: candidate.id, invoiceId: `invoice-${candidate.id}`, isReceipt }));
    renderPanel();
    selectLine();
    const controls = await screen.findByTestId(`recon-grid-view-${spec}-paymentPlan`);
    await waitFor(() => expect(within(controls).getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(personalGrid.apiFetch).toHaveBeenCalledWith(`/sws/neo/grid-views/${spec}/paymentPlan`, { baseUrl: '' });
    expect(personalGrid.apiFetch.mock.calls.some(([url]) => /\/header(?:$|\/)/.test(url))).toBe(false);
    expect(screen.getByTestId('recon-cand-row-C1')).toBeInTheDocument();
  });

  it('leaves a mixed candidate table intact without mounting right-side view controls or making up a scope', async () => {
    candidatesState.candidates = [CANDIDATES[0], { ...CANDIDATES[1], kind: 'invoice', scheduleId: 'C2', invoiceId: 'invoice-C2', isReceipt: true }];
    renderPanel();
    selectLine();
    await waitFor(() => expect(within(leftGridControls()).getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(screen.getAllByTestId('grid-view-controls')).toHaveLength(1);
    expect(personalGrid.apiFetch.mock.calls.map(([url]) => url)).toEqual(['/sws/neo/grid-views/financial-account/bankStatementLines']);
    expect(rightTable().querySelector('thead tr').children).toHaveLength(5);
    expect(rightHeader('info')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-cand-check-C1'));
    expect(candCheckbox('C1')).toBeChecked();
  });

  it('saves personal visibility explicitly without changing reconciliation mutations or selection', async () => {
    personalGrid.apiFetch.mockResolvedValue(gridResponse(null, 204));
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(within(leftGridControls()).getByTestId('grid-view-columns-trigger')).toBeEnabled());
    selectLine();
    const controls = leftGridControls();
    await user.click(within(controls).getByTestId('grid-view-columns-trigger'));
    expect(screen.getByTestId('grid-view-column-selection')).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByTestId('grid-view-column-transactionDate'));
    expect(within(leftTable()).queryByTestId('column-header-sort-date')).toBeNull();
    expect(screen.getByTestId('recon-line-radio-L1')).toBeChecked();
    await user.click(within(controls).getByTestId('grid-view-save'));
    await waitFor(() => expect(personalGrid.apiFetch.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(true));
    const [url, request] = personalGrid.apiFetch.mock.calls.find(([, options]) => options.method === 'PUT');
    expect(url).toBe('/sws/neo/grid-views/financial-account/bankStatementLines');
    expect(JSON.parse(request.body).columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'list:ad:Datetrx:field:transactionDate', visible: false }),
      expect.objectContaining({ id: 'list:field:selection', visible: true }),
    ]));
    expect(reconcileState.reconcile).not.toHaveBeenCalled();
    expect(removeState.removeOperation).not.toHaveBeenCalled();
  });

  it('locks reconciled unlink cells and keeps window read-only behavior when views are active', async () => {
    linesState.lines = [{ ...LINES[0], status: 'reconciled', state: 'reconciled', reconcileStatus: 'RECONCILED' }];
    candidatesState.candidates = CANDIDATES.map((candidate) => ({ ...candidate, linked: true }));
    personalGrid.apiFetch.mockImplementation(() => Promise.resolve(gridResponse(personalView([
      { id: 'list:field:amount', visible: false, order: -1 },
      { id: 'list:field:selection', visible: false, order: 30 },
    ]))));
    const { rerender } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-status-option-all'));
    selectLine();
    await waitFor(() => expect(within(transactionGridControls()).getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(screen.getByTestId('recon-unlink-C1')).toBeInTheDocument();
    expect(candCheckbox('C1')).toBeChecked();
    rerender(<ReconciliationSplitPanel {...PANEL_PROPS} windowReadOnly />);
    expect(screen.queryByTestId('recon-unlink-C1')).toBeNull();
    expect(screen.getByTestId('recon-action-reconcile')).toBeDisabled();
    expect(candCheckbox('C1')).toBeInTheDocument();
    expect(removeState.removeOperation).not.toHaveBeenCalled();
  });
});

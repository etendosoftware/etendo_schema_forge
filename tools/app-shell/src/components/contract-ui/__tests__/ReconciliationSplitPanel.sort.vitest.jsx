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

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';
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

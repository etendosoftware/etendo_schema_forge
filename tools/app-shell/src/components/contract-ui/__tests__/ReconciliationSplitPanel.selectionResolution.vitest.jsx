// ETP-4965 follow-up — how the split panel resolves the SELECTED statement line, and when it must
// let that selection go.
//
// The panel stores only the selection's identity (`id` + `matchGroupId`) and re-resolves the live
// row on every render. The left table, however, does not render `lines` — it renders the
// CLIENT-SIDE filtered `visibleLines`. So a line can be perfectly present in `lines` and still be
// invisible to the user, and that is the bug this file is built around:
//
//   un-reconciling sends a line from "Conciliadas" back to "Pendiente". It vanishes from the table
//   (the filter still says `reconciled`) but stays in `lines` — so the lookup kept finding it and
//   the right panel went on rendering that line's candidates AND its action bar ("Restante por
//   conciliar +27,00 €"). A selection the user could neither see nor clear.
//
// Three branches now decide the outcome, and each has an opposite failure mode to guard against:
//
//   1. not found in `lines`  → `linesLoading ? stored : null`. Holding it forever leaves a ghost
//      selection; dropping it always breaks the head-id shift after a split, which legitimately
//      misses for as long as the reload is in flight.
//   2. found, but its `state` no longer matches `leftStatus` → null. This is the reported bug.
//      The mirror must include the table's own null/empty = "Todos" case, or the panel blanks for
//      every user browsing "Todos".
//   3. otherwise → the live row (never the stored copy).
//
// Search is deliberately NOT mirrored — typing to look something up is a transient view change,
// not the line moving — so there is a guard for that over-correction too.
//
// Mocks BEFORE imports.

// The action bar's split button uses a Radix <DropdownMenu>, and the panel mounts three Radix
// <Dialog>s; both rely on Pointer Capture + scrollIntoView, neither implemented by jsdom (same
// polyfill block as ReconciliationSplitPanel.vitest.jsx).
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

// The status filter is a Radix <Popover>, and driving it open in jsdom is incidental to everything
// under test here — stub it down to one button per code. TWO instances are mounted (left = status,
// right = transaction source), so the stub keys its test ids off the code set rather than the
// generated `data-testid` the call sites happen to pass.
vi.mock('@/components/ui/distinct-values-filter', () => ({
  DistinctValuesFilter: ({ value, onChange, codes, allLabel }) => {
    const kind = codes.includes('pending') ? 'status' : 'source';
    return (
      <div data-testid={`recon-${kind}-filter-stub`}>
        <span data-testid={`recon-${kind}-filter-value`}>{value ?? ''}</span>
        <button
          type="button"
          data-testid={`recon-${kind}-option-all`}
          onClick={() => onChange(null)}
        >
          {allLabel}
        </button>
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            data-testid={`recon-${kind}-option-${code}`}
            onClick={() => onChange(code)}
          >
            {code}
          </button>
        ))}
      </div>
    );
  },
}));

// Mutable hook state. `linesState` is deliberately a single object the mock returns by reference:
// a test mutates `lines` / `loading` on it and re-renders, which is exactly the shape of a reload
// settling (or still being in flight) as far as the component can tell.
const linesState = {
  lines: [], total: 0, counts: {}, loading: false, reload: vi.fn(), draftReconciliationCount: 0,
};
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn(), loading: false };
const removeState = { removeOperation: vi.fn(), loading: false };
const reactivateSelectedState = { reactivateSelected: vi.fn(), loading: false };
const reconcileDifferenceState = { reconcileDifference: vi.fn(), loading: false };

vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: () => linesState,
  // Mirrors the real hook: candidates only resolve once a line is selected. That makes the
  // candidate rows a faithful proxy for "the right panel thinks something is selected".
  useCandidateOperations: (accountId, lineId) => ({
    candidates: lineId ? [...candidatesState.candidates] : [],
    loading: candidatesState.loading,
  }),
  useReconcileGroup: () => reconcileState,
  useRemoveOperation: () => removeState,
  useReactivateSelected: () => reactivateSelectedState,
  useReconcileDifference: () => reconcileDifferenceState,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';
// The canonical formatter the action bar itself uses — asserting against its real output keeps the
// amount assertions about WHICH row was resolved, without hardcoding a separator convention.
import { formatSigned } from '@/lib/formatSigned';

// ── Fixtures ───────────────────────────────────────────────────────────────────

// The selected line, in the panel's default filter state ("Pendiente"). `matchGroupId` is what
// lets it survive a head-id shift (see the "found" describe).
const LINE = {
  id: 'L1', date: '2026-05-10T00:00:00Z', description: 'Transferencia ACME',
  status: 'pending', state: 'pending', amount: 100, matchGroupId: 'G1',
};

// The same line as the backend reports it BEFORE the un-reconcile: engine state `reconciled`, so it
// only shows under the "Conciliadas" filter.
const LINE_RECONCILED = {
  ...LINE, status: 'reconciled', state: 'reconciled', reconcileStatus: 'RECONCILED',
};

// A second, unrelated line kept in the list throughout: the left panel is therefore never EMPTY,
// only missing the selected row — which is the actual reported situation, not a blank list that
// would make the assertions ambiguous.
const OTHER_LINE = {
  id: 'L2', date: '2026-05-11T00:00:00Z', description: 'Nomina',
  status: 'pending', state: 'pending', amount: 42,
};

// Deliberately NOT `suggested`: nothing gets pre-selected, so `selectedSum` stays 0 and the action
// bar's "Restante por conciliar" is exactly the resolved line's own amount.
const CAND = {
  id: 'C1', date: '2026-06-10T00:00:00Z', documentNo: 'MOV-1', partnerName: 'ACME',
  amount: 40, pendingBalance: 40, status: 'pending', suggested: false,
};

const PANEL_PROPS = { accountId: 'ACC-1', currency: 'EUR' };

function renderPanel(props = {}) {
  const merged = { ...PANEL_PROPS, onReconcileSuccess: vi.fn(), ...props };
  const utils = render(<ReconciliationSplitPanel {...merged} />);
  return {
    ...utils,
    /**
     * Simulates a `lines` reload landing: swaps the list the hook reports and re-renders with the
     * component's own selection/filter state untouched. `loading: true` models the same swap while
     * the request is still in flight.
     */
    reload: (lines, { loading = false } = {}) => {
      linesState.lines = lines;
      linesState.total = lines.length;
      linesState.loading = loading;
      utils.rerender(<ReconciliationSplitPanel {...merged} />);
    },
  };
}

/** Clicks the left-panel radio, which is the only way a line gets selected. */
function selectLine(id = LINE.id) {
  fireEvent.click(screen.getByTestId(`recon-line-radio-${id}`));
}

/** Moves the left status filter, exactly as the user's dropdown does. `null` = "Todos". */
function setStatusFilter(code) {
  fireEvent.click(screen.getByTestId(code ? `recon-status-option-${code}` : 'recon-status-option-all'));
}

/** Types into the left panel's search box. */
function searchLeft(text) {
  fireEvent.change(screen.getByTestId('recon-left-search'), { target: { value: text } });
}

/** The right panel's "Selecciona un movimiento" empty state, or null when a line is selected. */
const rightPanelEmptyState = () => screen.queryByTestId('recon-right-empty');

/** The bottom action bar is only rendered while a line is selected — its cancel button proxies it. */
const actionBar = () => screen.queryByTestId('recon-action-cancel');

/** The amount cell sitting next to the "Restante por conciliar" label. */
const remainingAmount = () =>
  screen.getByText('financeReconcileBarRemaining').nextElementSibling.textContent;

beforeEach(() => {
  linesState.lines = [LINE, OTHER_LINE];
  linesState.total = 2;
  linesState.counts = {};
  linesState.loading = false;
  linesState.reload = vi.fn();
  linesState.draftReconciliationCount = 0;
  candidatesState.candidates = [CAND];
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

// ── 1. THE REPORTED BUG: still in `lines`, but no longer in the filtered table ──

describe('selected line filtered out of the table after its state changed', () => {
  /**
   * Reproduces the un-reconcile exactly: browse "Conciliadas", pick the reconciled line, then let
   * the reload land with that same line flipped to `pending`. It never leaves `lines` — only the
   * table's client-side status filter stops showing it.
   */
  function selectReconciledLineThenUnreconcile() {
    linesState.lines = [LINE_RECONCILED, OTHER_LINE];
    const { reload } = renderPanel();
    setStatusFilter('reconciled');
    selectLine(LINE_RECONCILED.id);
    return reload;
  }

  it('clears the right panel when the line drops out of the active status filter', () => {
    const reload = selectReconciledLineThenUnreconcile();

    // Precondition: the right panel is live — candidates and action bar both rendered.
    expect(rightPanelEmptyState()).toBeNull();
    expect(screen.getByTestId(`recon-cand-row-${CAND.id}`)).toBeInTheDocument();
    expect(actionBar()).toBeInTheDocument();

    // The un-reconcile landed. Same id, STILL in `lines`, now `pending` — so the "Conciliadas"
    // table no longer lists it.
    reload([{ ...LINE_RECONCILED, status: 'pending', state: 'pending' }, OTHER_LINE]);

    // What the user must see: the right panel back to "select a movement"…
    expect(rightPanelEmptyState()).toBeInTheDocument();
    // …with no candidates of a line that is no longer on screen…
    expect(screen.queryByTestId(`recon-cand-row-${CAND.id}`)).toBeNull();
    // …and no action bar quoting a "Restante por conciliar" for it.
    expect(actionBar()).toBeNull();
    expect(screen.queryByTestId('recon-action-reconcile')).toBeNull();
  });

  it('leaves both panels agreeing that nothing is selected', () => {
    const reload = selectReconciledLineThenUnreconcile();

    reload([{ ...LINE_RECONCILED, status: 'pending', state: 'pending' }, OTHER_LINE]);

    // The left table renders no rows at all under "Conciliadas" now — which is precisely why the
    // right panel must not claim a selection.
    expect(screen.queryByTestId(`recon-line-radio-${LINE_RECONCILED.id}`)).toBeNull();
    expect(screen.getByTestId('recon-rows-empty')).toBeInTheDocument();
    expect(rightPanelEmptyState()).toBeInTheDocument();
  });

  it('drops the selection when the USER moves the filter away from the line', () => {
    // Same predicate, reached from the other side: nothing changed server-side, the user simply
    // switched filters. The line leaves the table, so the selection goes with it.
    renderPanel();
    selectLine();
    expect(actionBar()).toBeInTheDocument();

    setStatusFilter('reconciled');

    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(actionBar()).toBeNull();
  });

  it('keeps the selection while the line still matches the active filter', () => {
    // The state changed but stayed inside the filter (`pending` → `pending`): nothing moved on
    // screen, so nothing should be dropped either.
    const { reload } = renderPanel();
    selectLine();

    reload([{ ...LINE, description: 'Transferencia ACME (touched)' }, OTHER_LINE]);

    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();
  });
});

// ── 2. the "Todos" case the status mirror must not swallow ────────────────────

describe('status filter cleared to "Todos"', () => {
  it('keeps a selected line whatever its state, because the table shows every state', () => {
    linesState.lines = [LINE_RECONCILED, OTHER_LINE];
    const { reload } = renderPanel();
    setStatusFilter(null); // "Todos"
    selectLine(LINE_RECONCILED.id);

    expect(rightPanelEmptyState()).toBeNull();

    // A state change is irrelevant here: under "Todos" the row never leaves the table.
    reload([{ ...LINE_RECONCILED, status: 'pending', state: 'pending' }, OTHER_LINE]);

    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();
    expect(screen.getByTestId(`recon-line-radio-${LINE_RECONCILED.id}`)).toBeChecked();
  });

  it('keeps a line whose state is absent entirely under "Todos"', () => {
    // `state` undefined defaults to 'pending' in the table's predicate; with no filter active that
    // default must not be compared against anything.
    linesState.lines = [{ ...LINE, state: undefined }, OTHER_LINE];
    renderPanel();
    setStatusFilter(null);
    selectLine();

    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();
  });

  it('keeps the selection when the user switches from a status to "Todos"', () => {
    renderPanel();
    selectLine();

    setStatusFilter(null);

    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();
  });
});

// ── 3. the over-correction guard: search is NOT mirrored ──────────────────────

describe('left panel search', () => {
  it('keeps the selection even when the search hides the row', () => {
    renderPanel();
    selectLine();

    searchLeft('zzz-nothing-matches');

    // The table is empty — but the line has not moved anywhere, the user is just looking something
    // up. Dropping the selection here would make the search box destructive.
    expect(screen.getByTestId('recon-rows-empty')).toBeInTheDocument();
    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();
  });

  it('still shows the selection after the search is cleared again', () => {
    renderPanel();
    selectLine();

    searchLeft('zzz-nothing-matches');
    searchLeft('');

    expect(screen.getByTestId(`recon-line-radio-${LINE.id}`)).toBeChecked();
    expect(actionBar()).toBeInTheDocument();
  });
});

// ── 4. absent from a SETTLED reload ──────────────────────────────────────────

describe('selected line absent from a SETTLED lines reload', () => {
  it('drops the selection instead of leaving an invisible one behind', () => {
    const { reload } = renderPanel();
    selectLine();

    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();

    // Gone from `lines` altogether (a date-range change, a backend-side filter): with the load
    // settled, the absence is an answer.
    reload([OTHER_LINE]);

    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(screen.queryByTestId(`recon-cand-row-${CAND.id}`)).toBeNull();
    expect(actionBar()).toBeNull();
  });

  it('drops it even when the settled reload comes back empty', () => {
    const { reload } = renderPanel();
    selectLine();

    reload([]);

    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(actionBar()).toBeNull();
  });
});

// ── 5. the case the not-found fallback exists for: reload still in flight ─────

describe('selected line absent while a lines reload is STILL IN FLIGHT', () => {
  it('keeps the selection, because `lines` is only momentarily stale', () => {
    const { reload } = renderPanel();
    selectLine();

    // A split/unlink just fired: `reloadLines()` is pending, and the list the hook still reports
    // says nothing about whether the line exists.
    reload([OTHER_LINE], { loading: true });

    expect(rightPanelEmptyState()).toBeNull();
    expect(screen.getByTestId(`recon-cand-row-${CAND.id}`)).toBeInTheDocument();
    expect(actionBar()).toBeInTheDocument();
  });

  it('keeps it across an in-flight reload that reports no lines at all', () => {
    const { reload } = renderPanel();
    selectLine();

    reload([], { loading: true });

    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();
  });

  it('still renders the stored line amounts while the reload is in flight', () => {
    const { reload } = renderPanel();
    selectLine();

    reload([], { loading: true });

    // Nothing fresher exists yet, so the stored copy's own amount is the honest one to show.
    expect(remainingAmount()).toBe(formatSigned(LINE.amount, 'EUR'));
  });

  it('drops the selection as soon as that same reload settles without the line', () => {
    const { reload } = renderPanel();
    selectLine();

    reload([OTHER_LINE], { loading: true });
    expect(actionBar()).toBeInTheDocument();

    // Same list, `loading` now false: the absence has become an answer.
    reload([OTHER_LINE]);
    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(actionBar()).toBeNull();
  });
});

// ── 6. the hit paths: the LIVE row always wins ───────────────────────────────

describe('selected line found in the reloaded lines', () => {
  it('renders the live row by id, with its fresh amount, not the stored copy', () => {
    const { reload } = renderPanel();
    selectLine();
    expect(remainingAmount()).toBe(formatSigned(100, 'EUR'));

    // Same id, new amount (a partial match freed part of it server-side).
    reload([{ ...LINE, amount: 250 }, OTHER_LINE]);

    expect(rightPanelEmptyState()).toBeNull();
    expect(remainingAmount()).toBe(formatSigned(250, 'EUR'));
    expect(remainingAmount()).not.toBe(formatSigned(100, 'EUR'));
  });

  it('re-resolves by matchGroupId after the group head id changed', () => {
    const { reload } = renderPanel();
    selectLine();

    // A split moved the group head onto a new statement line id; only the group id still matches.
    const SHIFTED = {
      ...LINE, id: 'L1-shifted', description: 'Transferencia ACME (head shifted)', amount: 180,
    };
    reload([SHIFTED, OTHER_LINE]);

    // Selection survives…
    expect(rightPanelEmptyState()).toBeNull();
    expect(actionBar()).toBeInTheDocument();
    // …and it is the LIVE row that is selected on the left and driving the right panel.
    expect(screen.getByTestId(`recon-line-radio-${SHIFTED.id}`)).toBeChecked();
    expect(remainingAmount()).toBe(formatSigned(180, 'EUR'));
  });

  it('does not re-resolve onto an unrelated line of a different group', () => {
    const { reload } = renderPanel();
    selectLine();

    // The line is gone and nothing shares its group, so a sloppy match must not latch onto the
    // only row left.
    reload([{ ...OTHER_LINE, matchGroupId: 'G9' }]);

    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(screen.getByTestId(`recon-line-radio-${OTHER_LINE.id}`)).not.toBeChecked();
  });
});

// ── 7. baseline: nothing selected ────────────────────────────────────────────

describe('no line selected', () => {
  it('shows the right-panel empty state and no action bar', () => {
    renderPanel();

    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(actionBar()).toBeNull();
    expect(screen.queryByTestId(`recon-cand-row-${CAND.id}`)).toBeNull();
  });

  it('stays empty while the lines list is loading', () => {
    linesState.loading = true;
    renderPanel();

    // The `linesLoading` branch only ever HOLDS an existing selection; it must not invent one.
    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(actionBar()).toBeNull();
  });

  it('goes back to the empty state after the selection is cancelled', () => {
    renderPanel();
    selectLine();
    expect(actionBar()).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('recon-action-cancel'));

    expect(rightPanelEmptyState()).toBeInTheDocument();
    expect(actionBar()).toBeNull();
  });
});

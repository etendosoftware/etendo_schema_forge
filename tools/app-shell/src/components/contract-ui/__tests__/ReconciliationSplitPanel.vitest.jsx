// Mocks BEFORE imports
// The action bar's "Desconciliar / Reactivar" split button uses a Radix <DropdownMenu>, which
// relies on Pointer Capture + scrollIntoView — neither implemented by jsdom. Polyfill them so the
// menu can open (same pattern as EditAccountModal.vitest.jsx).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

// Records every (key, vars) pair passed to the i18n `ui(...)` function, so tests can verify the
// exact interpolation values (e.g. removed/total/failed counts) a call site passed — the mock
// below only echoes back the raw key for keys with no literal `{placeholder}` in their own name
// (true for all real keys here), so this capture is the only way to assert on `vars`.
const uiCalls = [];
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    uiCalls.push({ key, vars });
    if (vars) return key.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    return key;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

// Hook mocks — overridable per test via the mutable state objects below.
// `draftReconciliationCount` = how many reconciliations of the account are already in draft
// (server-computed, NOT derived from `lines`, which are date/status filtered). Drives the up-front
// "another draft will be confirmed" warning in the Reactivar confirm dialog. Default 0.
const linesState = {
  lines: [], total: 0, counts: {}, loading: false, reload: vi.fn(), draftReconciliationCount: 0,
};
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn().mockResolvedValue({ reconciliationId: 'R1' }), loading: false };
const removeState = { removeOperation: vi.fn().mockResolvedValue({ removed: true }), loading: false };
// "Reactivar" — the lighter un-reconcile (keeps the reconciliation as a draft with its
// transactions still linked) exposed via the action bar's split-button dropdown.
const reactivateSelectedState = {
  reactivateSelected: vi.fn().mockResolvedValue({ reactivated: true }), loading: false,
};
// "Posting the remainder to a G/L item" — closes a PARTIALLY reconciled line by writing its
// leftover amount off against an accounting concept.
const reconcileDifferenceState = {
  reconcileDifference: vi.fn().mockResolvedValue({ transactionId: 'TRX-DIFF' }), loading: false,
};
// Records the last (accountId, lineId, docType, kind) the component passed to
// useCandidateOperations, so tests can assert the kind toggle flows through.
const candidateCallArgs = { accountId: null, lineId: null, docType: null, kind: null };

// Mirrors the real hook: candidates only resolve once a line is selected, and
// each (re)load yields a FRESH array reference — which is what drives the
// pre-select `useEffect([candidates])` in the component.
vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: () => linesState,
  useCandidateOperations: (accountId, lineId, docType = null, kind = null) => {
    candidateCallArgs.accountId = accountId;
    candidateCallArgs.lineId = lineId;
    candidateCallArgs.docType = docType;
    candidateCallArgs.kind = kind;
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

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';
// The left panel's footer total goes through the shared signed-money formatter. Importing it here
// (instead of hardcoding '1.191,69 €') keeps the expectation on the same canonical formatting path
// the component uses, so the instance-wide separators cannot make the assertion lie.
import { formatSigned } from '@/lib/formatSigned';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const LINE_A = { id: 'L1', date: '2026-05-10T00:00:00Z', description: 'Transfer ACME', status: 'pending', amount: -8.31 };
const LINE_B = { id: 'L2', date: '2026-05-11T00:00:00Z', description: 'Payroll', status: 'pending', amount: 1200 };
const LINE_RECONCILED = { id: 'L3', date: '2026-05-12T00:00:00Z', description: 'Done line', status: 'reconciled', amount: 50 };

// ETP-4502 iteration 5 — a partially reconciled line: still `status: 'pending'` (backend only
// flips status to 'reconciled' at 100%), carries `reconcileStatus: 'PARTIAL'`, the amount already
// reconciled (`reconciledAmount`/`reconciledPct`), the still-pending remainder (`pendingAmount`)
// and the pending sub-line id to reconcile the rest against (`remainderLineId`), plus the matched
// documents (`txns`).
const LINE_PARTIAL = {
  id: 'LP1', date: '2026-05-13T00:00:00Z', description: 'Partial line',
  status: 'pending', reconcileStatus: 'PARTIAL', amount: 100,
  pendingAmount: 46.76, reconciledAmount: 53.24, reconciledPct: 53,
  matchGroupId: 'G1', remainderLineId: 'LP1-rem', partial: true,
  txns: [{ transactionId: 'T1', documentNo: '1000034', contact: 'ACME', amount: 53.24, autoCreated: true }],
};

// A fully reconciled line (status 'reconciled') that also carries the matched-documents block —
// the "conciliado" section renders here too, but with a NOT auto-created txn.
const LINE_RECONCILED_TXNS = {
  id: 'LR1', date: '2026-05-14T00:00:00Z', description: 'Fully reconciled',
  status: 'reconciled', reconcileStatus: 'RECONCILED', amount: 50,
  pendingAmount: 0, reconciledAmount: 50, reconciledPct: 100, matchGroupId: 'G2',
  txns: [{ transactionId: 'T2', documentNo: '1000099', contact: 'Globex', amount: 50, autoCreated: false }],
};

// A fully reconciled line matched to TWO documents (bulk "Desconciliar" mode) — one auto-created,
// one pre-existing. All checked by default → "Desconciliar (2)".
const LINE_RECONCILED_MULTI = {
  id: 'LR2', date: '2026-05-15T00:00:00Z', description: 'Fully reconciled (2 docs)',
  status: 'reconciled', reconcileStatus: 'RECONCILED', amount: 90,
  pendingAmount: 0, reconciledAmount: 90, reconciledPct: 100, matchGroupId: 'G3',
  txns: [
    { transactionId: 'T3', documentNo: '2000001', contact: 'ACME', amount: 50, autoCreated: true },
    { transactionId: 'T4', documentNo: '2000002', contact: 'Globex', amount: 40, autoCreated: false },
  ],
};

// Linked documents of a fully reconciled line, shaped as CANDIDATES (the new layout renders the
// already-reconciled docs in the bottom candidate list, each candidate id === its transaction id,
// `status: 'reconciled'`, `linked: true`). These pair with LINE_RECONCILED_TXNS / _MULTI's `txns`.
const RECON_CAND_T2 = {
  id: 'T2', date: '2026-06-01T00:00:00Z', documentNo: '1000099', partnerName: 'Globex',
  amount: 50, pendingBalance: 50, status: 'reconciled', linked: true,
};
const RECON_CAND_T3 = {
  id: 'T3', date: '2026-06-02T00:00:00Z', documentNo: '2000001', partnerName: 'ACME',
  amount: 50, pendingBalance: 50, status: 'reconciled', linked: true,
};
const RECON_CAND_T4 = {
  id: 'T4', date: '2026-06-03T00:00:00Z', documentNo: '2000002', partnerName: 'Globex',
  amount: 40, pendingBalance: 40, status: 'reconciled', linked: true,
};

const CAND_MATCH = {
  id: 'C1', date: '2026-06-10T00:00:00Z', documentNo: 'INV-1', partnerName: 'ACME',
  amount: -8.31, pendingBalance: -8.31, status: 'pending', suggested: true,
};
const CAND_OTHER = {
  id: 'C2', date: '2026-06-09T00:00:00Z', documentNo: 'INV-2', partnerName: 'Globex',
  amount: -100, pendingBalance: -100, status: 'pending', suggested: false,
};

function setLines(lines) {
  linesState.lines = lines;
  linesState.total = lines.length;
}

function setCandidates(candidates) {
  candidatesState.candidates = candidates;
}

function renderPanel(props = {}) {
  const merged = { accountId: 'ACC-1', currency: 'EUR', onReconcileSuccess: vi.fn(), ...props };
  return { ...render(<ReconciliationSplitPanel {...merged} />), props: merged };
}

// The shared Checkbox (app-shell-core, Semantic Theme Contract) renders a
// <label data-testid="recon-cand-check-...">  wrapping a nested
// <input type="checkbox">. The checked state (and `.toBeChecked()`) only
// applies to that nested input, not the label, so drill into it here.
// (`recon-line-radio-*` is a plain native <input type="radio"> and is
// unaffected — it keeps asserting directly on the testid element.)
function candidateCheckbox(candidateId) {
  return within(screen.getByTestId(`recon-cand-check-${candidateId}`)).getByRole('checkbox');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReconciliationSplitPanel', () => {
  beforeEach(() => {
    linesState.lines = [];
    linesState.total = 0;
    linesState.counts = {};
    linesState.loading = false;
    linesState.reload = vi.fn();
    linesState.draftReconciliationCount = 0;
    candidatesState.candidates = [];
    candidatesState.loading = false;
    reconcileState.reconcile = vi.fn().mockResolvedValue({ reconciliationId: 'R1' });
    reconcileState.loading = false;
    removeState.removeOperation = vi.fn().mockResolvedValue({ removed: true });
    removeState.loading = false;
    reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({ reactivated: true });
    reactivateSelectedState.loading = false;
    candidateCallArgs.accountId = null;
    candidateCallArgs.lineId = null;
    candidateCallArgs.docType = null;
    candidateCallArgs.kind = null;
    uiCalls.length = 0;
    toast.success.mockClear();
    toast.error.mockClear();
    toast.warning.mockClear();
  });

  it('renders the left panel with the pending statement lines', () => {
    setLines([LINE_A, LINE_B]);
    renderPanel();
    expect(screen.getByTestId('recon-line-row-L1')).toBeInTheDocument();
    expect(screen.getByTestId('recon-line-row-L2')).toBeInTheDocument();
    expect(screen.getByText('Transfer ACME')).toBeInTheDocument();
  });

  // ETP-4921 — this panel never goes through ListView, so it never inherited ListView's
  // refresh progress bar. It renders the extracted ListProgressBar above the split, under the
  // same gate ListView uses: only once lines are already on screen, because on the true first
  // fetch the panel's own skeleton is the indicator.
  describe('refresh progress bar', () => {
    it('shows the bar while refreshing over lines already on screen', () => {
      setLines([LINE_A, LINE_B]);
      linesState.loading = true;
      renderPanel();
      expect(screen.getByTestId('reconciliation-progress-bar')).toBeInTheDocument();
    });

    it('keeps the lines mounted underneath the bar (smooth refresh, not a remount)', () => {
      setLines([LINE_A, LINE_B]);
      linesState.loading = true;
      renderPanel();
      expect(screen.getByTestId('reconciliation-progress-bar')).toBeInTheDocument();
      expect(screen.getByTestId('recon-line-row-L1')).toBeInTheDocument();
      expect(screen.getByTestId('recon-line-row-L2')).toBeInTheDocument();
    });

    it('hides the bar on the very first fetch, where the skeleton is the indicator', () => {
      setLines([]);
      linesState.loading = true;
      renderPanel();
      expect(screen.queryByTestId('reconciliation-progress-bar')).not.toBeInTheDocument();
    });

    it('hides the bar once the fetch settles', () => {
      setLines([LINE_A, LINE_B]);
      linesState.loading = false;
      renderPanel();
      expect(screen.queryByTestId('reconciliation-progress-bar')).not.toBeInTheDocument();
    });

    it('uses its own testid, not the default ListView one', () => {
      setLines([LINE_A]);
      linesState.loading = true;
      renderPanel();
      expect(screen.queryByTestId('list-progress-bar')).not.toBeInTheDocument();
    });
  });

  it('shows the empty state on the right until a line is selected', () => {
    setLines([LINE_A]);
    renderPanel();
    expect(screen.getByTestId('recon-right-empty')).toBeInTheDocument();
    expect(screen.getByText('financeReconcileRightEmptyTitle')).toBeInTheDocument();
  });

  // The left panel's empty state used to be one line of centered text in a full-height table,
  // which read as a rendering failure rather than an intentional state. It now mirrors the right
  // panel's own: circled icon, title, hint.
  it('gives the rows empty state an icon and a hint, like the right panel', () => {
    setLines([]);
    renderPanel();

    const empty = screen.getByTestId('recon-rows-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toContainElement(screen.getByTestId('SearchX__d0f4d5'));
    expect(empty.textContent).toContain('financeReconcileEmpty');
    // The hint points at the filters — the list here is always a filter result, so there is
    // nothing for the user to create.
    expect(empty.textContent).toContain('financeReconcileEmptyHint');
  });

  it('renders a back button and movement-style filter controls on the left toolbar', () => {
    const onBack = vi.fn();
    setLines([LINE_A]);
    renderPanel({ onBack });
    fireEvent.click(screen.getByTestId('recon-toolbar-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/financeReconcileFilterStatusPending/)).toBeInTheDocument();
    // ETP-4921 — the default period is the last 12 months, not 30 days: a statement line is
    // often matched against an invoice or payment months older than itself, and the 30-day
    // window hid those candidates by default. It also makes the picker's own placeholder
    // honest, which already read "Últimos 12 meses".
    expect(screen.getAllByText('dateRangeLast12Months').length).toBeGreaterThan(0);
  });

  it('passes the selected source filter to the candidates hook', () => {
    setLines([LINE_B]); // inflow line → default source 'receipts'
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    // Open the source selector (trigger shows the current label) then pick "Pagos".
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourcePayments/));
    // payments → (kind null, docType 'payments').
    expect(candidateCallArgs.kind).toBeNull();
    expect(candidateCallArgs.docType).toBe('payments');
  });

  it('populates the right panel after selecting a line', () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH, CAND_OTHER]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    expect(screen.queryByTestId('recon-right-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('recon-cand-row-C1')).toBeInTheDocument();
    expect(screen.getByTestId('recon-cand-row-C2')).toBeInTheDocument();
  });

  it('renders the "Suggested" badge on the suggested candidate only', () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH, CAND_OTHER]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    // CAND_MATCH suggested → suggested badge; CAND_OTHER not → pending badge.
    const suggested = screen.getAllByText('financeReconcileBadgeSuggested');
    expect(suggested).toHaveLength(1);
  });

  it('keeps Reconcile disabled while the amounts do not balance', () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH, CAND_OTHER]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    // Select the non-matching candidate (-100 vs line -8.31).
    fireEvent.click(screen.getByTestId('recon-cand-check-C2'));
    expect(screen.getByTestId('recon-action-reconcile')).toBeDisabled();
  });

  it('enables Reconcile when the selected operations balance the line', () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH, CAND_OTHER]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    // CAND_MATCH is suggested → pre-checked automatically; no manual click needed.
    expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
  });

  it('calls reconcile and onReconcileSuccess on a balanced reconcile', async () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH]);
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    // CAND_MATCH is suggested → pre-checked automatically; go straight to reconcile.
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));
    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
    expect(reconcileState.reconcile).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1',
      statementLineId: 'L1',
      operationIds: ['C1'],
    });
    await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
    expect(linesState.reload).toHaveBeenCalled();
  });

  it('clears both left and right selections when cancel selection is clicked', () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH, CAND_OTHER]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    fireEvent.click(screen.getByTestId('recon-cand-check-C1'));

    expect(screen.getByTestId('recon-line-radio-L1')).toBeChecked();
    expect(screen.getByTestId('recon-action-cancel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('recon-action-cancel'));

    expect(screen.getByTestId('recon-line-radio-L1')).not.toBeChecked();
    expect(screen.queryByTestId('recon-action-cancel')).not.toBeInTheDocument();
    expect(screen.getByTestId('recon-right-empty')).toBeInTheDocument();
  });

  it('shows the "Desconciliar (N)" bulk label and no source filter for a reconciled line', () => {
    setLines([LINE_RECONCILED_TXNS]); // linked doc T2 → pre-checked by default → count 1
    setCandidates([RECON_CAND_T2]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
    const btn = screen.getByTestId('recon-action-reconcile');
    // Bulk un-reconcile: "Desconciliar (N)", enabled while at least one linked doc is checked.
    expect(btn).toHaveTextContent('financeReconcileActionRemoveCount');
    expect(btn).not.toBeDisabled();
    // The linked document renders in the candidate list WITH a (pre-checked) selection checkbox.
    expect(screen.getByTestId('recon-cand-row-T2')).toBeInTheDocument();
    expect(candidateCheckbox('T2')).toBeChecked();
    // The top "conciliado" block is not used for a fully reconciled line.
    expect(screen.queryByTestId('recon-matched-block')).not.toBeInTheDocument();
    // Read-only: the source (transaction-type) filter stays hidden.
    expect(screen.queryByText(/financeReconcileSourceReceipts/)).not.toBeInTheDocument();
  });

  // ── Suggested-candidate behavior (ETP-4100 / T6) ──────────────────────────────

  it('floats suggested candidates to the top of the right panel', () => {
    setLines([LINE_A]);
    // Backend returns the suggested candidate AFTER a non-suggested one; the
    // component must reorder so the suggested row renders first.
    setCandidates([CAND_OTHER, CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));

    const rows = screen
      .getAllByTestId(/^recon-cand-row-/)
      .map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['recon-cand-row-C1', 'recon-cand-row-C2']);
    // The suggested id (C1) precedes the non-suggested id (C2).
    expect(rows.indexOf('recon-cand-row-C1')).toBeLessThan(rows.indexOf('recon-cand-row-C2'));
  });

  it('pre-checks suggested candidates and leaves non-suggested unchecked on load', () => {
    setLines([LINE_A]);
    setCandidates([CAND_OTHER, CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));

    // No user interaction with the checkboxes — pre-selection comes from `suggested`.
    expect(candidateCheckbox('C1')).toBeChecked();
    expect(candidateCheckbox('C2')).not.toBeChecked();
  });

  it('reflects the pre-selected suggested count in the reconcile button without any click', () => {
    setLines([LINE_A]);
    // Two suggested candidates whose amounts sum to the line amount (-8.31).
    const CAND_SUGGESTED_A = { ...CAND_MATCH, id: 'C1', amount: -5, pendingBalance: -5, suggested: true };
    const CAND_SUGGESTED_B = { ...CAND_MATCH, id: 'C3', amount: -3.31, pendingBalance: -3.31, suggested: true };
    setCandidates([CAND_OTHER, CAND_SUGGESTED_A, CAND_SUGGESTED_B]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));

    // No checkbox clicked — the two suggested candidates are pre-checked, the
    // non-suggested one is not. This drives reconcileCount = 2.
    expect(candidateCheckbox('C1')).toBeChecked();
    expect(candidateCheckbox('C3')).toBeChecked();
    expect(candidateCheckbox('C2')).not.toBeChecked();

    // The reconcile button uses the count-bearing label and, since the pre-selected
    // amounts balance the line (-5 + -3.31 == -8.31), it is immediately enabled.
    const btn = screen.getByTestId('recon-action-reconcile');
    expect(btn).toHaveTextContent('financeReconcileActionReconcileCount');
    expect(btn).not.toBeDisabled();
  });

  it('reconciles the pre-selected suggested candidates without manual checkbox clicks', async () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH]); // single suggested candidate balancing the line
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));

    // Straight to reconcile — the suggested candidate is already pre-checked.
    expect(candidateCheckbox('C1')).toBeChecked();
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
    expect(reconcileState.reconcile).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1',
      statementLineId: 'L1',
      operationIds: ['C1'],
    });
    await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
  });

  // ── Selected-first ordering (ETP-4100 / T6) ───────────────────────────────────

  it('floats a checked candidate to the very top, above the rest', () => {
    setLines([LINE_A]);
    // No suggested candidates — pure user-driven selection. C2 is rendered last
    // initially; checking it must lift it above C1 (and the others).
    const C1 = { ...CAND_OTHER, id: 'C1', suggested: false };
    const C2 = { ...CAND_OTHER, id: 'C2', suggested: false };
    const C3 = { ...CAND_OTHER, id: 'C3', suggested: false };
    setCandidates([C1, C2, C3]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));

    // Initial order mirrors the backend (no suggested → stable).
    let rows = screen.getAllByTestId(/^recon-cand-row-/).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['recon-cand-row-C1', 'recon-cand-row-C2', 'recon-cand-row-C3']);

    // Check C3 (last row) → it jumps to the top.
    fireEvent.click(screen.getByTestId('recon-cand-check-C3'));
    rows = screen.getAllByTestId(/^recon-cand-row-/).map((el) => el.getAttribute('data-testid'));
    expect(rows[0]).toBe('recon-cand-row-C3');
  });

  it('gathers multiple checked candidates at the top, above the unchecked ones', () => {
    setLines([LINE_A]);
    const C1 = { ...CAND_OTHER, id: 'C1', suggested: false };
    const C2 = { ...CAND_OTHER, id: 'C2', suggested: false };
    const C3 = { ...CAND_OTHER, id: 'C3', suggested: false };
    setCandidates([C1, C2, C3]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));

    // Select C3 then C2 — both selected rows gather at the top; C1 stays last.
    fireEvent.click(screen.getByTestId('recon-cand-check-C3'));
    fireEvent.click(screen.getByTestId('recon-cand-check-C2'));

    const rows = screen.getAllByTestId(/^recon-cand-row-/).map((el) => el.getAttribute('data-testid'));
    // The two selected ids occupy the first two slots (sort is stable within the
    // selected group, so their relative order is the original C2-before-C3);
    // the unchecked C1 is pushed to the bottom.
    expect(rows.slice(0, 2).sort()).toEqual(['recon-cand-row-C2', 'recon-cand-row-C3']);
    expect(rows[2]).toBe('recon-cand-row-C1');
  });

  // ── Client-side state filter (T7 / ETP-5033) ─────────────────────────────────
  //
  // The backend assigns each statement line exactly ONE `state`: pending | suggested | byRule |
  // difference | reconciled. The filter codes are therefore NOT all mutually exclusive: 'pending'
  // — which is also the DEFAULT filter — means "everything not reconciled", so suggested, byRule
  // and difference lines are on screen when the panel opens (ETP-5033: strict equality used to
  // hide exactly the lines the user has to act on). 'suggested' / 'byRule' / 'difference' /
  // 'reconciled' stay strict subsets, and the "Todos" entry (null) shows everything.
  // Membership itself is unit-tested in reconciliationStatusFilter.test.js.

  // One line per engine-computed state, so a single fixture set can drive the whole matrix.
  const LINE_ST_PENDING = { id: 'SP', date: '2026-05-10T00:00:00Z', description: 'Plain pending line', state: 'pending', status: 'pending', amount: -10 };
  const LINE_ST_SUGGESTED = { id: 'SS', date: '2026-05-11T00:00:00Z', description: 'Suggested line', state: 'suggested', status: 'pending', amount: -100 };
  const LINE_ST_BYRULE = { id: 'SB', date: '2026-05-12T00:00:00Z', description: 'By-rule line', state: 'byRule', status: 'pending', amount: -50 };
  const LINE_ST_DIFFERENCE = { id: 'SD', date: '2026-05-13T00:00:00Z', description: 'Difference line', state: 'difference', status: 'pending', amount: -5 };
  const LINE_ST_RECONCILED = { id: 'SR', date: '2026-05-14T00:00:00Z', description: 'Reconciled line', state: 'reconciled', status: 'reconciled', amount: 500 };
  const ALL_STATE_LINES = [
    LINE_ST_PENDING, LINE_ST_SUGGESTED, LINE_ST_BYRULE, LINE_ST_DIFFERENCE, LINE_ST_RECONCILED,
  ];
  const ALL_STATE_COUNTS = { all: 5, pending: 1, suggested: 1, byRule: 1, difference: 1, reconciled: 1 };

  /**
   * Drives the status dropdown the same way the source-filter tests drive theirs: the
   * DistinctValuesFilter trigger renders the ACTIVE label, and the open popover renders one
   * button per code (plus the "Todos" row). Both are matched by their i18n key, which the mock
   * echoes back verbatim.
   */
  function selectStatus(activeLabelKey, nextLabelKey) {
    fireEvent.click(screen.getByText(new RegExp(activeLabelKey)));
    fireEvent.click(screen.getByText(new RegExp(nextLabelKey)));
  }

  /** The ids of every statement row currently rendered in the left panel. */
  function visibleLineIds() {
    return screen
      .queryAllByTestId(/^recon-line-row-/)
      .map((el) => el.getAttribute('data-testid').replace('recon-line-row-', ''));
  }

  it('treats the default pending filter as "not reconciled", keeping suggested and by-rule lines visible', () => {
    // Four lines: two plain pending, one suggested, one byRule — all four are non-reconciled, so
    // all four must be on screen under the default filter.
    const LINE_SUGGESTED = { id: 'LS', date: '2026-05-10T00:00:00Z', description: 'Suggested line', state: 'suggested', status: 'pending', amount: -100 };
    const LINE_BYRULE = { id: 'LR', date: '2026-05-11T00:00:00Z', description: 'By-rule line', state: 'byRule', status: 'pending', amount: -50 };
    setLines([LINE_A, LINE_B, LINE_SUGGESTED, LINE_BYRULE]);
    linesState.counts = { all: 4, pending: 2, suggested: 1, byRule: 1, difference: 0, reconciled: 0 };
    renderPanel();

    // Default leftStatus is 'pending' = "not reconciled" — nothing here is reconciled, so the
    // list is complete. Before ETP-5033 the last two assertions were the opposite (the suggested
    // and by-rule rows were filtered out by the DEFAULT filter, which is the bug).
    expect(screen.getByTestId('recon-line-row-L1')).toBeInTheDocument();
    expect(screen.getByTestId('recon-line-row-L2')).toBeInTheDocument();
    expect(screen.getByTestId('recon-line-row-LS')).toBeInTheDocument();
    expect(screen.getByTestId('recon-line-row-LR')).toBeInTheDocument();
  });

  it('passes counts from the hook to the status filter component', () => {
    setLines([LINE_A, LINE_B]);
    linesState.counts = { all: 5, pending: 3, suggested: 1, byRule: 0, difference: 1, reconciled: 0 };
    renderPanel();

    // ReconciliationStatusFilter renders labelFor(code) = `${ui(key)} (${countFor(code)})`.
    // With our i18n mock returning the key, the label includes the count.
    // The active label (pending) is visible in the trigger button; the others are in the popover.
    // The pending count is the SUM of its members — 3 pending + 1 suggested + 0 byRule +
    // 1 difference = 5 — because the filter itself shows all four (ETP-5033); a chip reading 3
    // would contradict the 5 rows below it.
    // Use a text-content function matcher to handle elements that split text across children.
    expect(screen.getByText((content) => content.includes('financeReconcileFilterStatusPending') && content.includes('5'))).toBeInTheDocument();
  });

  it('visibleTotal reflects filtered lines, not all lines', () => {
    // Three lines: two non-reconciled (amounts -8.31 and 1200) and one RECONCILED (500). Under
    // the default 'pending' filter only the first two are visible, so only they may count toward
    // the footer total. (A suggested line would no longer work as the excluded one — it is now
    // visible under the default filter, and its amount legitimately joins the total.)
    setLines([LINE_A, LINE_B, LINE_ST_RECONCILED]);
    linesState.counts = { all: 3, pending: 2, suggested: 0, byRule: 0, difference: 0, reconciled: 1 };
    renderPanel();

    // The reconciled row is filtered out, so its amount is nowhere in the list.
    expect(visibleLineIds()).toEqual(['L1', 'L2']);
    expect(screen.queryByTestId('recon-line-row-SR')).not.toBeInTheDocument();

    // The footer renders ui('financeReconcileFooterTotal', { amount: formatSigned(total, cur) }).
    // The i18n mock has no `{amount}` placeholder in the key itself, so the interpolated string
    // never reaches the DOM — read it off the captured call instead. Expected: -8.31 + 1200 =
    // 1191.69, i.e. the visible subset only (1691.69 would mean the reconciled line leaked in).
    const footerCalls = uiCalls.filter((c) => c.key === 'financeReconcileFooterTotal');
    expect(footerCalls.length).toBeGreaterThan(0);
    expect(footerCalls.at(-1).vars.amount).toBe(formatSigned(1191.69, 'EUR'));
  });

  it('shows the four non-reconciled states and hides the reconciled one under the default filter', () => {
    setLines(ALL_STATE_LINES);
    linesState.counts = ALL_STATE_COUNTS;
    renderPanel();

    expect(visibleLineIds()).toEqual(['SP', 'SS', 'SB', 'SD']);
    expect(screen.queryByTestId('recon-line-row-SR')).not.toBeInTheDocument();
  });

  it('narrows to only the suggested line when the filter switches to suggested', () => {
    setLines(ALL_STATE_LINES);
    linesState.counts = ALL_STATE_COUNTS;
    renderPanel();

    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusSuggested');

    expect(visibleLineIds()).toEqual(['SS']);
  });

  it('narrows to only the difference line when the filter switches to difference', () => {
    setLines(ALL_STATE_LINES);
    linesState.counts = ALL_STATE_COUNTS;
    renderPanel();

    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusDifference');

    expect(visibleLineIds()).toEqual(['SD']);
  });

  it('narrows to only the by-rule line when the filter switches to byRule', () => {
    setLines(ALL_STATE_LINES);
    linesState.counts = ALL_STATE_COUNTS;
    renderPanel();

    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusByRule');

    expect(visibleLineIds()).toEqual(['SB']);
  });

  it('shows only the reconciled line under the reconciled filter', () => {
    setLines(ALL_STATE_LINES);
    linesState.counts = ALL_STATE_COUNTS;
    renderPanel();

    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusReconciled');

    expect(visibleLineIds()).toEqual(['SR']);
  });

  it('shows every line under the "Todos" entry', () => {
    setLines(ALL_STATE_LINES);
    linesState.counts = ALL_STATE_COUNTS;
    renderPanel();

    // The "Todos" row calls onChange(null) — the only way to clear the status filter.
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusAll');

    expect(visibleLineIds()).toEqual(['SP', 'SS', 'SB', 'SD', 'SR']);
  });

  // ── Source filter visibility (single "Tipo de transacción" selector) ──────────

  it('renders the source filter only after selecting a non-reconciled line', () => {
    setLines([LINE_A]); // outflow → default source 'payments'
    renderPanel();
    // No line selected yet → right panel is empty, so the source selector is absent.
    // The selector trigger surfaces the current source label (the i18n mock returns the key).
    expect(screen.queryByText('financeReconcileSourcePayments')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    // The single "Tipo de transacción" selector is now present (trigger shows the default label).
    expect(screen.getByText(/financeReconcileSourcePayments/)).toBeInTheDocument();
  });

  it('hides the source filter for a reconciled (read-only) line', () => {
    setLines([LINE_RECONCILED]); // inflow (amount 50) → would default to 'receipts'
    setCandidates([CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L3'));
    // Read-only line: no source selector → none of the source labels are rendered.
    expect(screen.queryByText('financeReconcileSourceReceipts')).not.toBeInTheDocument();
    expect(screen.queryByText('financeReconcileSourcePayments')).not.toBeInTheDocument();
    expect(screen.queryByText('financeReconcileSourceSalesInvoices')).not.toBeInTheDocument();
  });

  // ── Default source by line sign ───────────────────────────────────────────────

  it('defaults the source to receipts for an inflow line (amount > 0)', () => {
    setLines([LINE_B]); // amount 1200 → inflow → receipts
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    // receipts → (kind null, docType 'receipts').
    expect(candidateCallArgs.kind).toBeNull();
    expect(candidateCallArgs.docType).toBe('receipts');
  });

  it('defaults the source to payments for an outflow line (amount < 0)', () => {
    setLines([LINE_A]); // amount -8.31 → outflow → payments
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    // payments → (kind null, docType 'payments').
    expect(candidateCallArgs.kind).toBeNull();
    expect(candidateCallArgs.docType).toBe('payments');
  });

  // ── Source → (kind, docType) mapping ──────────────────────────────────────────

  it('maps "Facturas de venta" to (kind invoices, docType receipts)', () => {
    setLines([LINE_B]); // inflow → default source receipts
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    // Open the selector (trigger shows the current 'receipts' label) and pick sales invoices.
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    expect(candidateCallArgs.kind).toBe('invoices');
    expect(candidateCallArgs.docType).toBe('receipts');
  });

  it('maps "Cobros" to (kind null, docType receipts)', () => {
    setLines([LINE_A]); // outflow → default source payments
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    // Open the selector (trigger shows the current 'payments' label) and pick receipts.
    fireEvent.click(screen.getByText(/financeReconcileSourcePayments/));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    expect(candidateCallArgs.kind).toBeNull();
    expect(candidateCallArgs.docType).toBe('receipts');
  });

  // ── "Tipo" (source) filter dropdown — no fake "all" row (bug fix regression) ──
  // The Tipo filter always has a concrete value (SOURCE_CODES has no genuine "all" state,
  // unlike the sibling status filter). Previously `allLabel={ui('financeReconcileSourceLabel')}`
  // was passed to DistinctValuesFilter, which made DistinctValuesList render the field's own
  // header/placeholder text as a clickable — but functionally inert — row. That prop was removed.

  it('does not offer the field label as a selectable "Tipo" option, only the four real source values', () => {
    setLines([LINE_B]); // inflow → default source 'receipts'
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    // Open the "Tipo" dropdown via its trigger (shows the current source label).
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));

    const popover = screen.getByTestId('PopoverContent__cd3aa9');
    // Regression: the field's own label/placeholder key must never render as a selectable
    // row — it is not a real filter value and selecting it used to do nothing.
    expect(within(popover).queryByText('financeReconcileSourceLabel')).not.toBeInTheDocument();
    expect(
      within(popover).queryByRole('button', { name: /financeReconcileSourceLabel/ }),
    ).not.toBeInTheDocument();

    // All four real source options are present as selectable rows.
    expect(within(popover).getByText(/financeReconcileSourceSalesInvoices/)).toBeInTheDocument();
    expect(within(popover).getByText(/financeReconcileSourcePurchaseInvoices/)).toBeInTheDocument();
    expect(within(popover).getByText(/financeReconcileSourceReceipts/)).toBeInTheDocument();
    expect(within(popover).getByText(/financeReconcileSourcePayments/)).toBeInTheDocument();
  });

  it('selects each real "Tipo" option and flows the mapped (kind, docType) through to the candidates hook', () => {
    setLines([LINE_B]); // inflow → default source 'receipts'
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));

    // receipts (default) → payments: (kind null, docType 'payments').
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourcePayments/));
    expect(candidateCallArgs.kind).toBeNull();
    expect(candidateCallArgs.docType).toBe('payments');
    expect(screen.getByText(/financeReconcileSourcePayments/)).toBeInTheDocument();

    // payments → salesInvoices: (kind 'invoices', docType 'receipts').
    fireEvent.click(screen.getByText(/financeReconcileSourcePayments/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    expect(candidateCallArgs.kind).toBe('invoices');
    expect(candidateCallArgs.docType).toBe('receipts');

    // salesInvoices → purchaseInvoices: (kind 'invoices', docType 'payments').
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    fireEvent.click(screen.getByText(/financeReconcileSourcePurchaseInvoices/));
    expect(candidateCallArgs.kind).toBe('invoices');
    expect(candidateCallArgs.docType).toBe('payments');

    // purchaseInvoices → receipts: back to (kind null, docType 'receipts').
    fireEvent.click(screen.getByText(/financeReconcileSourcePurchaseInvoices/));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    expect(candidateCallArgs.kind).toBeNull();
    expect(candidateCallArgs.docType).toBe('receipts');
  });

  // ── Invoice candidate badge ───────────────────────────────────────────────────

  it('renders the "Factura" badge on an invoice-kind candidate', () => {
    setLines([LINE_B]); // inflow → default receipts
    const INV = { id: 'INV9', date: '2026-06-01T00:00:00Z', documentNo: 'F-9', partnerName: 'ACME',
      amount: 8.31, pendingBalance: 8.31, kind: 'invoice', invoiceId: 'INV-ID-9', scheduleId: 'SCH-9', suggested: false };
    setCandidates([INV]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    // Switch the source to an invoice option so the invoice candidate is the active mode.
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));

    // The i18n mock returns the key; badge kind 'invoice' → financeReconcileBadgeInvoice.
    expect(screen.getByText('financeReconcileBadgeInvoice')).toBeInTheDocument();
  });

  // ── Invoice-mode reconcile guard ──────────────────────────────────────────────

  it('enables Conciliar with an invoice source when the selection COVERS the line', () => {
    setLines([LINE_B]); // line amount 1200 (inflow → default receipts)
    // A single invoice whose outstanding (1200) exactly covers the line (|1200| == |1200|).
    const INV = { id: 'INV9', date: '2026-06-01T00:00:00Z', documentNo: 'F-9', partnerName: 'ACME',
      amount: 1200, pendingBalance: 1200, kind: 'invoice', invoiceId: 'INV-ID-9', scheduleId: 'SCH-9', suggested: false };
    setCandidates([INV]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    // Select the covering invoice.
    fireEvent.click(screen.getByTestId('recon-cand-check-INV9'));

    expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
  });

  it('enables Conciliar with an invoice source when the selection EXCEEDS the line (invoice bigger than the line)', () => {
    setLines([LINE_B]); // line amount 1200 (inflow → default receipts)
    // A single invoice whose outstanding (1500) is GREATER than the line (1200). Unlike
    // transactions (fixed-amount, can't be partially "used"), invoices are flexible — the backend
    // simply pays this invoice only partially with whatever the line has (uses the full line, the
    // invoice itself ends up partially paid). invoiceMode's `balanced` check has no upper bound.
    const INV = { id: 'INV10', date: '2026-06-01T00:00:00Z', documentNo: 'F-10', partnerName: 'ACME',
      amount: 1500, pendingBalance: 1500, kind: 'invoice', invoiceId: 'INV-ID-10', scheduleId: 'SCH-10', suggested: false };
    setCandidates([INV]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    fireEvent.click(screen.getByTestId('recon-cand-check-INV10'));

    expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
  });

  it('enables Conciliar with an invoice source when the selection under-covers the line (partial match)', () => {
    setLines([LINE_B]); // line amount 1200 (inflow → default receipts)
    // A single invoice whose outstanding (500) is LESS than the line (|500| < |1200|). Since
    // ETP-4502 iteration 2, this is no longer rejected: invoices may settle less than the line,
    // leaving the remainder (700) to be split into a new pending sub-line by the backend
    // (matchBankStatementLine/splitBankStatementLine) — same rule as the transaction-mode path
    // (sameDirection && withinLine), no invoice-specific "must cover" special case anymore.
    const INV = { id: 'INV9', date: '2026-06-01T00:00:00Z', documentNo: 'F-9', partnerName: 'ACME',
      amount: 500, pendingBalance: 500, kind: 'invoice', invoiceId: 'INV-ID-9', scheduleId: 'SCH-9', suggested: false };
    setCandidates([INV]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    fireEvent.click(screen.getByTestId('recon-cand-check-INV9'));

    expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
  });

  // ── Invoice reconcile payload ─────────────────────────────────────────────────

  it('reconciles with an invoice source using an invoices[] payload (no operationIds)', async () => {
    setLines([LINE_B]); // line amount 1200 (inflow → default receipts)
    const INV_A = { id: 'INVA', date: '2026-06-01T00:00:00Z', documentNo: 'F-A', partnerName: 'ACME',
      amount: 800, pendingBalance: 800, kind: 'invoice', invoiceId: 'INV-ID-A', scheduleId: 'SCH-A', suggested: false };
    const INV_B = { id: 'INVB', date: '2026-06-02T00:00:00Z', documentNo: 'F-B', partnerName: 'ACME',
      amount: 400, pendingBalance: 400, kind: 'invoice', invoiceId: 'INV-ID-B', scheduleId: 'SCH-B', suggested: false };
    setCandidates([INV_A, INV_B]);
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    // Select both invoices (combined 1200 exactly matches the line).
    fireEvent.click(screen.getByTestId('recon-cand-check-INVA'));
    fireEvent.click(screen.getByTestId('recon-cand-check-INVB'));

    fireEvent.click(screen.getByTestId('recon-action-reconcile'));
    await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));

    const payload = reconcileState.reconcile.mock.calls[0][0];
    expect(payload.financialAccountId).toBe('ACC-1');
    expect(payload.statementLineId).toBe('L2');
    expect(payload.operationIds).toBeUndefined();
    // Payload carries invoiceId/scheduleId pairs only; order follows the candidates array.
    expect(payload.invoices).toEqual([
      { invoiceId: 'INV-ID-A', scheduleId: 'SCH-A' },
      { invoiceId: 'INV-ID-B', scheduleId: 'SCH-B' },
    ]);
    await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
  });

  // ── Bulk un-reconcile ("Desconciliar N") on a fully reconciled line — ETP-4502 ─
  // The linked documents now render in the bottom CANDIDATE list (each candidate id === its
  // transaction id, pre-checked by default); the top "conciliado" block is no longer used here.

  it('shows "Desconciliar (N)" on a reconciled line (all linked docs pre-checked by default)', () => {
    setLines([LINE_RECONCILED_MULTI]); // 2 linked docs → count 2
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    const btn = screen.getByTestId('recon-action-reconcile');
    expect(btn).toHaveTextContent('financeReconcileActionRemoveCount');
    expect(btn).not.toHaveTextContent('financeReconcileActionReactivate');
    expect(btn).not.toBeDisabled();
    // Both linked docs pre-checked in the candidate list.
    expect(candidateCheckbox('T3')).toBeChecked();
    expect(candidateCheckbox('T4')).toBeChecked();
    // No top "conciliado" block for a fully reconciled line.
    expect(screen.queryByTestId('recon-matched-block')).not.toBeInTheDocument();
  });

  it('does not show the un-reconcile ("Desconciliar") action for a pending line', () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    const btn = screen.getByTestId('recon-action-reconcile');
    // A pending line shows the "Conciliar" (count) label, never the un-reconcile one.
    expect(btn).toHaveTextContent('financeReconcileActionReconcileCount');
    expect(btn).not.toHaveTextContent('financeReconcileActionRemoveCount');
  });

  it('opens the confirm dialog when "Desconciliar" is clicked, without calling the endpoint', () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

    expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    // Dialog opens; the endpoint is NOT called yet (it requires confirmation).
    expect(screen.getByTestId('recon-remove-modal')).toBeInTheDocument();
    expect(removeState.removeOperation).not.toHaveBeenCalled();
  });

  it('bulk-un-reconciles ALL linked docs (transactionIds[]) on confirm and reloads', async () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));
    fireEvent.click(screen.getByTestId('recon-remove-accept'));

    await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
    const payload = removeState.removeOperation.mock.calls[0][0];
    expect(payload.financialAccountId).toBe('ACC-1');
    expect(payload.statementLineId).toBe('LR2');
    // All linked docs were checked by default → both ids in the array (order-independent).
    expect([...payload.transactionIds].sort()).toEqual(['T3', 'T4']);
    expect(payload.transactionId).toBeUndefined();
    await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
    expect(linesState.reload).toHaveBeenCalled();
  });

  it('does not call removeOperation when the confirm dialog is cancelled', async () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    expect(screen.getByTestId('recon-remove-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-remove-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
    expect(removeState.removeOperation).not.toHaveBeenCalled();
    // The reconciled line stays selected.
    expect(screen.getByTestId('recon-line-radio-LR2')).toBeChecked();
  });

  it('renders a candidate checkbox + per-row unlink for each linked doc (all pre-checked)', () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    // The linked docs render directly in the candidate list — no block to expand.
    expect(candidateCheckbox('T3')).toBeChecked();
    expect(candidateCheckbox('T4')).toBeChecked();
    // Each row exposes an individual unlink ("−") whose id is the transaction id.
    expect(screen.getByTestId('recon-unlink-T3')).toBeInTheDocument();
    expect(screen.getByTestId('recon-unlink-T4')).toBeInTheDocument();
  });

  it('unchecking one linked doc drops the count to N-1 and narrows the payload', async () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    // Uncheck T3 → only T4 stays selected.
    fireEvent.click(screen.getByTestId('recon-cand-check-T3'));
    expect(candidateCheckbox('T3')).not.toBeChecked();
    expect(candidateCheckbox('T4')).toBeChecked();

    fireEvent.click(screen.getByTestId('recon-action-reconcile'));
    fireEvent.click(screen.getByTestId('recon-remove-accept'));
    await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
    expect(removeState.removeOperation.mock.calls[0][0].transactionIds).toEqual(['T4']);
  });

  it('per-row unlink un-reconciles just that doc (transactionIds:[thatId])', async () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    fireEvent.click(screen.getByTestId('recon-unlink-T3'));
    expect(screen.getByTestId('recon-remove-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-remove-accept'));
    await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
    expect(removeState.removeOperation.mock.calls[0][0].transactionIds).toEqual(['T3']);
  });

  it('disables the "Desconciliar" button when every linked doc is unchecked', () => {
    setLines([LINE_RECONCILED_TXNS]); // single linked doc T2
    setCandidates([RECON_CAND_T2]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
    // Enabled with the default all-checked selection.
    expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
    // Uncheck the only doc → count 0 → disabled.
    fireEvent.click(screen.getByTestId('recon-cand-check-T2'));
    expect(screen.getByTestId('recon-action-reconcile')).toBeDisabled();
  });

  it('a PARTIAL line keeps the top "conciliado" block (per-row unlink, no bulk checkbox)', () => {
    setLines([LINE_PARTIAL]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
    // The top block still renders for a PARTIAL line — expand it to see the matched rows.
    expect(screen.getByTestId('recon-matched-block')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-matched-toggle'));
    // Only the per-row "−" button, no bulk checkbox; bottom stays "Conciliar".
    expect(screen.queryByTestId('recon-matched-check-T1')).not.toBeInTheDocument();
    expect(screen.getByTestId('recon-unlink-T1')).toBeInTheDocument();
    expect(screen.getByTestId('recon-action-reconcile'))
      .toHaveTextContent('financeReconcileActionReconcileCount');
  });

  // ── Left-panel PROGRESO column (ProgressCell) — ETP-4502 iteration 5 ───────────

  describe('ProgressCell (left-panel progress column)', () => {
    it('renders the progress bar + tooltip for a partially reconciled line', () => {
      setLines([LINE_PARTIAL]);
      renderPanel();
      expect(screen.getByTestId('recon-progress-LP1')).toBeInTheDocument();
      const tip = screen.getByTestId('recon-progress-tip-LP1');
      expect(tip).toBeInTheDocument();
      // Tooltip text is the "X por conciliar" label (i18n mock returns the key).
      expect(tip).toHaveTextContent('financeReconcilePendingLabel');
    });

    it('renders no progress bar/tooltip for a plain pending line (reconciledAmount == 0)', () => {
      setLines([LINE_A]); // no reconciledAmount → cell is empty
      renderPanel();
      expect(screen.queryByTestId('recon-progress-L1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-progress-tip-L1')).not.toBeInTheDocument();
    });

    it('renders the "Progreso" column header', () => {
      setLines([LINE_A]);
      renderPanel();
      expect(screen.getByText('financeReconcileColProgress')).toBeInTheDocument();
    });
  });

  // ── Left-panel "Parcial" status badge (second badge next to the primary one) ──

  describe('left-panel "Parcial" status badge', () => {
    // StatusBadge doesn't forward `data-testid` to the DOM (it only destructures `{ kind }`), so —
    // matching how every other StatusBadge assertion in this file works — query by its rendered
    // text (the i18n mock echoes the raw key), scoped to the row to disambiguate the two badges.
    it('renders BOTH the primary badge and the "Parcial" badge for a line with partial: true', () => {
      setLines([LINE_PARTIAL]); // status: 'pending', no `state` → primary badge is "pending"
      renderPanel();
      const row = within(screen.getByTestId('recon-line-row-LP1'));
      expect(row.getByText('financeReconcileBadgePending')).toBeInTheDocument();
      expect(row.getByText('financeReconcileBadgePartial')).toBeInTheDocument();
    });

    it('does not render the "Parcial" badge for a non-partial line', () => {
      setLines([LINE_A]); // plain pending line, no `partial` flag
      renderPanel();
      const row = within(screen.getByTestId('recon-line-row-L1'));
      expect(row.getByText('financeReconcileBadgePending')).toBeInTheDocument();
      expect(row.queryByText('financeReconcileBadgePartial')).not.toBeInTheDocument();
    });
  });

  // ── Right-panel "conciliado" block (ReconciledOperationsSection) — it.5 ────────

  describe('ReconciledOperationsSection (right "conciliado" block)', () => {
    it('is hidden for a selected line with nothing reconciled (reconciledAmount == 0)', () => {
      setLines([LINE_A]);
      setCandidates([CAND_MATCH]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
      expect(screen.queryByTestId('recon-matched-block')).not.toBeInTheDocument();
    });

    it('renders nothing when the line claims a reconciled amount but carries no txns', () => {
      // The outer condition (PARTIAL + a non-zero reconciledAmount) holds, so the section IS
      // mounted — but a payload without the matched-documents array has nothing to list, so the
      // section renders null rather than an empty pct header with no rows behind it.
      setLines([{ ...LINE_PARTIAL, txns: [] }]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      expect(screen.queryByTestId('recon-matched-block')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-matched-toggle')).not.toBeInTheDocument();
      // The rest of the right panel still renders (only the conciliado block is skipped).
      expect(screen.getByTestId('recon-right-search')).toBeInTheDocument();
    });

    it('renders COLLAPSED by default: pct header visible, matched rows hidden until expanded', () => {
      setLines([LINE_PARTIAL]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      // The block + its always-visible header (pct text) render immediately...
      expect(screen.getByTestId('recon-matched-block')).toBeInTheDocument();
      expect(screen.getByTestId('recon-matched-toggle')).toHaveTextContent('financeReconcilePctConciliated');
      // ...but the list/rows/unlink buttons stay out of the DOM while collapsed.
      expect(screen.queryByTestId('recon-matched-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-matched-row-T1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-unlink-T1')).not.toBeInTheDocument();
    });

    it('shows one row per txn (with its unlink button) once the header toggle expands the block', () => {
      setLines([LINE_PARTIAL]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      // Expand.
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      expect(screen.getByTestId('recon-matched-list')).toBeInTheDocument();
      expect(screen.getByTestId('recon-matched-row-T1')).toBeInTheDocument();
      // Each matched row exposes its unlink ("desconciliar") button.
      expect(screen.getByTestId('recon-unlink-T1')).toBeInTheDocument();
    });

    it('expands then re-collapses the matched list on successive header toggle clicks', () => {
      setLines([LINE_PARTIAL]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      // Starts collapsed.
      expect(screen.queryByTestId('recon-matched-list')).not.toBeInTheDocument();
      // First click expands.
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      expect(screen.getByTestId('recon-matched-list')).toBeInTheDocument();
      // Second click collapses again.
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      expect(screen.queryByTestId('recon-matched-list')).not.toBeInTheDocument();
    });

    it('is NOT rendered for a fully RECONCILED line (its docs go in the candidate list instead)', () => {
      setLines([LINE_RECONCILED_TXNS]);
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
      // The top "conciliado" block is only for PARTIAL lines now.
      expect(screen.queryByTestId('recon-matched-block')).not.toBeInTheDocument();
      // The linked doc appears in the candidate list, pre-checked, with a per-row unlink.
      expect(screen.getByTestId('recon-cand-row-T2')).toBeInTheDocument();
      expect(candidateCheckbox('T2')).toBeChecked();
      expect(screen.getByTestId('recon-unlink-T2')).toBeInTheDocument();
    });
  });

  // ── Candidate freeze while the "conciliado" block is expanded (Holded parity) ──

  describe('candidate selection freeze while the conciliado block is expanded', () => {
    it('lets candidates be selected while collapsed, freezes them while expanded, thaws on collapse', () => {
      // A PARTIAL line that has BOTH matched txns (the conciliado block) AND available
      // candidates. The candidate is non-suggested so nothing is pre-selected on load.
      const CAND = { ...CAND_OTHER, id: 'C2', suggested: false };
      setLines([LINE_PARTIAL]);
      setCandidates([CAND]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));

      // Block collapsed by default → the candidate is selectable.
      expect(candidateCheckbox('C2')).not.toBeDisabled();
      expect(candidateCheckbox('C2')).not.toBeChecked();
      fireEvent.click(screen.getByTestId('recon-cand-check-C2'));
      expect(candidateCheckbox('C2')).toBeChecked();

      // Expand the conciliado block → the candidate list is frozen: the checkbox is disabled
      // and the guarded onChange leaves the selection unchanged.
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      expect(candidateCheckbox('C2')).toBeDisabled();
      fireEvent.click(screen.getByTestId('recon-cand-check-C2'));
      expect(candidateCheckbox('C2')).toBeChecked(); // still checked — the click was ignored

      // Collapse again → selectable once more (the frozen click can now toggle it off).
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      expect(candidateCheckbox('C2')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('recon-cand-check-C2'));
      expect(candidateCheckbox('C2')).not.toBeChecked();
    });
  });

  // ── Unlink a single operation (removeOperation) — ETP-4502 iteration 5 ─────────

  describe('Unlink single operation (removeOperation)', () => {
    it('opens the confirm dialog on unlink click, without hitting the endpoint', () => {
      setLines([LINE_PARTIAL]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      // The "conciliado" block starts collapsed — expand it to reach the unlink button.
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      expect(screen.getByTestId('recon-remove-modal')).toBeInTheDocument();
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    it('ignores the unlink click for a matched doc that carries no transactionId', () => {
      // A matched doc is keyed by `transactionId || documentNo`, i.e. the block deliberately
      // renders documents whose transaction id is missing from the payload. Unlinking is
      // meaningless without that id (there is nothing to send to removeOperation), so the click
      // must be a no-op: no confirm dialog, no request.
      setLines([{
        ...LINE_PARTIAL,
        txns: [{ documentNo: '1000034', contact: 'ACME', amount: 53.24, autoCreated: true }],
      }]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      // The row still renders (keyed by documentNo), just without a usable transaction id.
      expect(screen.getByText('1000034')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('recon-unlink-undefined'));

      expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument();
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    // The auto-created effect is no longer a sentence appended to the body — it is its own
    // consequence bullet ("Cobro creado: el pago generado se elimina…") in the shared cartel.
    it('shows the created-payment bullet when the txn is auto-created', () => {
      setLines([LINE_PARTIAL]); // T1 autoCreated: true
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      const modal = screen.getByTestId('recon-remove-modal');
      expect(modal).toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      expect(modal).toHaveTextContent('financeReconcileConfirmItemPaymentDesc');
    });

    it('omits the created-payment bullet when the txn is not auto-created', () => {
      setLines([LINE_RECONCILED_TXNS]); // T2 autoCreated: false (candidate-list per-row unlink)
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
      fireEvent.click(screen.getByTestId('recon-unlink-T2'));
      const modal = screen.getByTestId('recon-remove-modal');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemPaymentDesc');
    });

    it('calls removeOperation with the right payload on confirm, then reloads and notifies', async () => {
      setLines([LINE_PARTIAL]);
      const { props } = renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      fireEvent.click(screen.getByTestId('recon-remove-accept'));

      await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
      // The per-row "−" now sends a single-element transactionIds[] array (not transactionId).
      expect(removeState.removeOperation).toHaveBeenCalledWith({
        financialAccountId: 'ACC-1',
        statementLineId: 'LP1',
        transactionIds: ['T1'],
      });
      await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
      expect(linesState.reload).toHaveBeenCalled();
      // Dialog closes on success.
      await waitFor(() => expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
    });

    it('does not call removeOperation when the dialog is cancelled', async () => {
      setLines([LINE_PARTIAL]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      expect(screen.getByTestId('recon-remove-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('recon-remove-cancel'));
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    it('uses the "one" body for a single-row unlink', () => {
      setLines([LINE_RECONCILED_TXNS]); // per-row unlink of T2 → count 1
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
      fireEvent.click(screen.getByTestId('recon-unlink-T2'));
      const dialog = screen.getByTestId('recon-remove-modal');
      expect(dialog).toHaveTextContent('financeReconcileConfirmRemoveOneBody');
      expect(dialog).not.toHaveTextContent('financeReconcileConfirmRemoveManyBody');
    });

    it('uses the "many" body + created-payment bullet for a bulk selection with an auto-created doc', () => {
      setLines([LINE_RECONCILED_MULTI]); // 2 docs, T3 autoCreated → bulk "Desconciliar (2)"
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));
      const dialog = screen.getByTestId('recon-remove-modal');
      expect(dialog).toHaveTextContent('financeReconcileConfirmRemoveManyBody');
      expect(dialog).toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
    });
  });

  // ── confirmRemove outcome reporting (partial-commit fix, ETP-4502) ─────────────
  // Core's own removal utilities commit mid-flow, so a batch can genuinely partially succeed; the
  // backend now reports the real per-transaction outcome via `transactionIds` (removed) /
  // `failedTransactionIds` (still reconciled) instead of an implicit all-or-nothing success. These
  // tests drive confirmRemove through the per-row unlink of a PARTIAL line (T1) — the toast branch
  // and the reload/selection-clear side effects depend only on the MOCKED RESOLVED VALUE of
  // `removeOperation`, not on what was actually requested.
  describe('confirmRemove outcome reporting (partial-commit fix)', () => {
    // A non-suggested remainder candidate — pre-checking it (independent of the matched-block
    // unlink) gives an observable proxy for `setSelectedOpIds(new Set())`: if it gets cleared after
    // confirming, the "always reset the selection" side effect ran.
    function setUpPartialLineWithCandidate() {
      setLines([LINE_PARTIAL]);
      setCandidates([CAND_OTHER]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C2'));
      expect(candidateCheckbox('C2')).toBeChecked();
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      fireEvent.click(screen.getByTestId('recon-remove-accept'));
    }

    it('full success: toast.success + reload/selection-clear when nothing failed', async () => {
      removeState.removeOperation = vi.fn().mockResolvedValue({
        transactionIds: ['T1'], failedTransactionIds: [],
      });
      setUpPartialLineWithCandidate();

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('financeReconcileToastOperationRemoved'));
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
      await waitFor(() => expect(candidateCheckbox('C2')).not.toBeChecked());
      await waitFor(() => expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
    });

    it('partial: toast.warning with the exact removed/total/failed counts, reload/selection-clear STILL run', async () => {
      removeState.removeOperation = vi.fn().mockResolvedValue({
        transactionIds: ['A'], failedTransactionIds: ['B'],
      });
      setUpPartialLineWithCandidate();

      // No `failureReason` in this response, so the toast carries no description at all
      // (`undefined`, never an empty options object that would render a blank description row).
      await waitFor(() => expect(toast.warning)
        .toHaveBeenCalledWith('financeReconcileToastOperationPartiallyRemoved', undefined));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      // Verify the EXACT interpolation values the component computed from the resolved result.
      const call = uiCalls.find((c) => c.key === 'financeReconcileToastOperationPartiallyRemoved');
      expect(call).toBeTruthy();
      expect(call.vars).toEqual({ removed: 1, total: 2, failed: 1 });
      // The critical fix: reload + selection-clear still happen on a partial outcome.
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
      await waitFor(() => expect(candidateCheckbox('C2')).not.toBeChecked());
    });

    it('total failure (successful HTTP, everything failed): the UN-RECONCILE error copy, reload/selection-clear STILL run', async () => {
      removeState.removeOperation = vi.fn().mockResolvedValue({
        transactionIds: [], failedTransactionIds: ['A', 'B'],
      });
      setUpPartialLineWithCandidate();

      // The action-specific key. This branch used to fall back to `financeReconcileToastError`,
      // whose copy reads "Error al conciliar" — the wrong action entirely for an un-reconcile.
      await waitFor(() => expect(toast.error)
        .toHaveBeenCalledWith('financeReconcileToastOperationRemoveError', undefined));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      // Still no exception, still a "resolved" flow — reload + selection-clear still happen.
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
      await waitFor(() => expect(candidateCheckbox('C2')).not.toBeChecked());
      await waitFor(() => expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
    });

    // ── the backend-supplied CAUSE ────────────────────────────────────────────
    // The un-reconcile helpers swallow their exceptions so one failure does not abort the batch, so
    // the response has always been able to say WHICH ids failed. What it could not say is WHY — the
    // reason stayed in the server log. It now travels as `failureReason` on the same 200, and the
    // panel shows it verbatim as the sonner description under the action-specific title.
    const CLOSED_PERIOD = 'The accounting period is closed and the document cannot be unposted';

    it('total failure: shows the backend failureReason as the toast description', async () => {
      removeState.removeOperation = vi.fn().mockResolvedValue({
        transactionIds: [], failedTransactionIds: ['A', 'B'], failureReason: CLOSED_PERIOD,
      });
      setUpPartialLineWithCandidate();

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
        'financeReconcileToastOperationRemoveError', { description: CLOSED_PERIOD }));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
    });

    it('total failure: never falls back to the generic "Error al conciliar" key', async () => {
      removeState.removeOperation = vi.fn().mockResolvedValue({
        transactionIds: [], failedTransactionIds: ['A'], failureReason: CLOSED_PERIOD,
      });
      setUpPartialLineWithCandidate();

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      // Regression guard: the generic reconcile-error copy is not merely un-toasted, it is never
      // even requested from i18n on this (resolved-response) path. It stays reserved for the catch
      // branch, where the request itself failed and no action can be named.
      expect(toast.error).not.toHaveBeenCalledWith('financeReconcileToastError');
      expect(toast.error).not.toHaveBeenCalledWith('financeReconcileToastError', undefined);
      expect(uiCalls.some((c) => c.key === 'financeReconcileToastError')).toBe(false);
    });

    it('partial failure: keeps the partial key and adds the reason as the description', async () => {
      removeState.removeOperation = vi.fn().mockResolvedValue({
        transactionIds: ['A'], failedTransactionIds: ['B'], failureReason: CLOSED_PERIOD,
      });
      setUpPartialLineWithCandidate();

      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
        'financeReconcileToastOperationPartiallyRemoved', { description: CLOSED_PERIOD }));
      expect(toast.error).not.toHaveBeenCalled();
      // The counts are unchanged by the added description.
      const call = uiCalls.find((c) => c.key === 'financeReconcileToastOperationPartiallyRemoved');
      expect(call.vars).toEqual({ removed: 1, total: 2, failed: 1 });
    });

    it('full success: never attaches a description, even if the backend echoes a reason', async () => {
      // Defensive: `failureReason` is only meaningful alongside failed ids. With none, the success
      // branch runs and the toast keeps its single-argument shape.
      removeState.removeOperation = vi.fn().mockResolvedValue({
        transactionIds: ['T1'], failedTransactionIds: [], failureReason: CLOSED_PERIOD,
      });
      setUpPartialLineWithCandidate();

      await waitFor(() => expect(toast.success)
        .toHaveBeenCalledWith('financeReconcileToastOperationRemoved'));
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it('network/HTTP error (rejected promise): toast.error, but NO reload — nothing was attempted', async () => {
      removeState.removeOperation = vi.fn().mockRejectedValue(new Error('Network error'));
      setUpPartialLineWithCandidate();

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Network error'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      // Unlike the three resolved cases above, a rejected promise never reaches the reload/
      // selection-clear code — nothing was attempted, so nothing should be assumed to have changed.
      expect(linesState.reload).not.toHaveBeenCalled();
      // The dialog also stays open (setRemoveRequest(null) only runs on the success path), and the
      // candidate selection behind it is untouched.
      expect(screen.getByTestId('recon-remove-modal')).toBeInTheDocument();
      expect(candidateCheckbox('C2')).toBeChecked();
    });
  });

  // ── "Reactivar" split-button action (lighter un-reconcile, keeps a draft) ──────
  // Same checked selection as "Desconciliar (N)", but the reconciliation is REACTIVATED to draft
  // (its pre-existing transactions stay linked and come back pre-selected) instead of deleted.
  // Exposed as the dropdown item behind a chevron on the primary button.
  describe('"Reactivar" split-button action', () => {
    /** Opens the split button's dropdown menu (Radix — needs real pointer events). */
    async function openMoreMenu() {
      const user = userEvent.setup();
      await user.click(screen.getByTestId('recon-action-reconcile-more'));
      return user;
    }

    it('renders the chevron trigger only on a fully reconciled line', () => {
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
      expect(screen.getByTestId('recon-action-reconcile-more')).toBeInTheDocument();
    });

    it('does NOT render the chevron trigger for a pending line (plain "Conciliar")', () => {
      setLines([LINE_A]);
      setCandidates([CAND_MATCH]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
      expect(screen.queryByTestId('recon-action-reconcile-more')).not.toBeInTheDocument();
      expect(screen.getByTestId('recon-action-reconcile'))
        .toHaveTextContent('financeReconcileActionReconcileCount');
    });

    it('does NOT render the chevron trigger for a PARTIAL line (still reconciling the remainder)', () => {
      setLines([LINE_PARTIAL]);
      setCandidates([CAND_MATCH]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      expect(screen.queryByTestId('recon-action-reconcile-more')).not.toBeInTheDocument();
    });

    it('disables the chevron trigger when nothing is checked (removeCount === 0)', () => {
      setLines([LINE_RECONCILED_TXNS]); // single linked doc T2, pre-checked by default
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
      expect(screen.getByTestId('recon-action-reconcile-more')).not.toBeDisabled();
      // Uncheck the only linked doc → count 0 → both the primary and the chevron go disabled.
      fireEvent.click(screen.getByTestId('recon-cand-check-T2'));
      expect(screen.getByTestId('recon-action-reconcile-more')).toBeDisabled();
      expect(screen.getByTestId('recon-action-reconcile')).toBeDisabled();
    });

    it('opens the confirm dialog with the REACTIVATE copy (distinct from Desconciliar)', async () => {
      setLines([LINE_RECONCILED_MULTI]); // 2 docs → "many" body
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));

      const dialog = screen.getByTestId('recon-remove-modal');
      expect(dialog).toHaveTextContent('financeReconcileConfirmReactivateTitle');
      expect(dialog).toHaveTextContent('financeReconcileConfirmReactivateManyBody');
      // The Desconciliar copy must NOT leak into the reactivate dialog.
      expect(dialog).not.toHaveTextContent('financeReconcileConfirmRemoveOneTitle');
      expect(dialog).not.toHaveTextContent('financeReconcileConfirmRemoveManyBody');
      // Confirm button carries the Reactivar label, not the Desconciliar one.
      expect(screen.getByTestId('recon-remove-accept'))
        .toHaveTextContent('financeReconcileActionReactivateSelected');
      // Nothing hits the backend until confirmation.
      expect(reactivateSelectedState.reactivateSelected).not.toHaveBeenCalled();
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    it('uses the "one" reactivate body for a single checked doc', async () => {
      setLines([LINE_RECONCILED_TXNS]); // single linked doc → count 1
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));

      const dialog = screen.getByTestId('recon-remove-modal');
      expect(dialog).toHaveTextContent('financeReconcileConfirmReactivateOneBody');
      expect(dialog).not.toHaveTextContent('financeReconcileConfirmReactivateManyBody');
    });

    it('still shows the created-payment bullet when the selection contains an auto-created txn', async () => {
      setLines([LINE_RECONCILED_MULTI]); // T3 autoCreated: true → the payment IS still deleted
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));

      const modal = screen.getByTestId('recon-remove-modal');
      expect(modal).toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      expect(modal).toHaveTextContent('financeReconcileConfirmItemPaymentDesc');
    });

    it('omits the created-payment bullet when no checked doc is auto-created', async () => {
      setLines([LINE_RECONCILED_TXNS]); // T2 autoCreated: false
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));

      const modal = screen.getByTestId('recon-remove-modal');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemPaymentDesc');
    });

    it('confirming calls reactivateSelected (NOT removeOperation) with the checked ids', async () => {
      reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({
        transactionIds: ['T3', 'T4'], failedTransactionIds: [],
      });
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      const { props } = renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));
      await user.click(screen.getByTestId('recon-remove-accept'));

      await waitFor(() =>
        expect(reactivateSelectedState.reactivateSelected).toHaveBeenCalledTimes(1));
      // The lighter endpoint is used — the destructive one is never touched.
      expect(removeState.removeOperation).not.toHaveBeenCalled();
      const payload = reactivateSelectedState.reactivateSelected.mock.calls[0][0];
      expect(payload.financialAccountId).toBe('ACC-1');
      expect(payload.statementLineId).toBe('LR2');
      expect([...payload.transactionIds].sort()).toEqual(['T3', 'T4']);
      // Reactivate-specific success toast, and the shared reload/selection-clear still run.
      await waitFor(() => expect(toast.success)
        .toHaveBeenCalledWith('financeReconcileToastOperationReactivated'));
      expect(toast.success).not.toHaveBeenCalledWith('financeReconcileToastOperationRemoved');
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
      await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
    });

    it('reuses the shared partial-outcome handling on the reactivate path', async () => {
      // One reactivated, one still linked (e.g. Core refused: a draft already exists on the account).
      reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({
        transactionIds: ['T3'], failedTransactionIds: ['T4'],
      });
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));
      await user.click(screen.getByTestId('recon-remove-accept'));

      await waitFor(() => expect(toast.warning)
        .toHaveBeenCalledWith('financeReconcileToastOperationPartiallyRemoved', undefined));
      expect(toast.success).not.toHaveBeenCalled();
      const call = uiCalls.find((c) => c.key === 'financeReconcileToastOperationPartiallyRemoved');
      expect(call.vars).toEqual({ removed: 1, total: 2, failed: 1 });
      // Always reload, even on a partial outcome.
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
    });

    // ── total failure on the REACTIVATE path ──────────────────────────────────
    // Same accumulator and same 200 envelope as the un-reconcile path, but the title must name the
    // action the user actually chose: `...ReactivateError`, not `...RemoveError` — and least of all
    // the old generic `financeReconcileToastError` ("Reconciliation error").
    const REACTIVATE_BLOCKED = 'The accounting period is closed and cannot be reactivated';

    /** Selects the 2-doc reconciled line and confirms the Reactivar cartel. */
    async function confirmReactivate() {
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));
      await user.click(screen.getByTestId('recon-remove-accept'));
    }

    it('total failure: the REACTIVATE error copy with the backend reason as description', async () => {
      reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({
        transactionIds: [], failedTransactionIds: ['T3', 'T4'],
        failureReason: REACTIVATE_BLOCKED,
      });
      await confirmReactivate();

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
        'financeReconcileToastOperationReactivateError', { description: REACTIVATE_BLOCKED }));
      // Not the un-reconcile copy, and not the generic reconcile copy either.
      expect(toast.error).not.toHaveBeenCalledWith(
        'financeReconcileToastOperationRemoveError', { description: REACTIVATE_BLOCKED });
      expect(uiCalls.some((c) => c.key === 'financeReconcileToastError')).toBe(false);
      expect(uiCalls.some((c) => c.key === 'financeReconcileToastOperationRemoveError')).toBe(false);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
    });

    it('total failure with no failureReason: same key, and NO description object at all', async () => {
      reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({
        transactionIds: [], failedTransactionIds: ['T3', 'T4'],
      });
      await confirmReactivate();

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
        'financeReconcileToastOperationReactivateError', undefined));
      // Explicitly `undefined`, not `{}` / `{ description: undefined }` — sonner renders an empty
      // description row for the latter, which reads as a truncated message.
      const [, options] = toast.error.mock.calls[0];
      expect(options).toBeUndefined();
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
    });

    // The "another draft will be confirmed" warning moved OUT of the result toast and INTO the
    // confirm dialog (shown up front, before the user commits). The backend still returns
    // `autoConfirmedDrafts`, but the frontend no longer reacts to it on the success path.
    it('ignores autoConfirmedDrafts on the success path (the warning moved into the dialog)', async () => {
      reactivateSelectedState.reactivateSelected = vi.fn().mockResolvedValue({
        reactivated: true, transactionIds: ['T3', 'T4'], failedTransactionIds: [],
        autoConfirmedDrafts: 2,
      });
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));
      await user.click(screen.getByTestId('recon-remove-accept'));

      // Plain success even though autoConfirmedDrafts > 0 — no result-toast warning any more.
      await waitFor(() => expect(toast.success)
        .toHaveBeenCalledWith('financeReconcileToastOperationReactivated'));
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      await waitFor(() => expect(linesState.reload).toHaveBeenCalled());
      await waitFor(() => expect(candidateCheckbox('T3')).not.toBeChecked());
    });

    // ── Up-front dialog warning (driven by draftReconciliationCount from the lines hook) ──

    // The warning has no testid of its own — it is the shared cartel's single yellow warning box,
    // whose copy SWITCHES to the "otro borrador" variant (and gains a matching bullet) when another
    // draft exists. So assert on the copy, not on a dedicated element.
    it('warns in the Reactivar dialog when another reconciliation is already in draft', async () => {
      linesState.draftReconciliationCount = 1;
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));

      const modal = screen.getByTestId('recon-remove-modal');
      expect(modal).toHaveTextContent('financeReconcileReactivateOtherDraftWarning');
      // ...and the extra consequence bullet spelling out that the other draft gets confirmed.
      expect(modal).toHaveTextContent('financeReconcileConfirmItemOtherDraftTitle');
      expect(modal).toHaveTextContent('financeReconcileConfirmItemOtherDraftDesc');
      // Shown BEFORE committing — nothing has been sent yet.
      expect(reactivateSelectedState.reactivateSelected).not.toHaveBeenCalled();
    });

    it('does not warn in the Reactivar dialog when no other reconciliation is in draft', async () => {
      linesState.draftReconciliationCount = 0;
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      const user = await openMoreMenu();
      await user.click(screen.getByTestId('recon-action-reactivate'));

      const modal = screen.getByTestId('recon-remove-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).not.toHaveTextContent('financeReconcileReactivateOtherDraftWarning');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemOtherDraftTitle');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemOtherDraftDesc');
      // The plain reactivate caveat takes the warning box instead.
      expect(modal).toHaveTextContent('financeReconcileConfirmReactivateWarning');
    });

    it('does not warn in the Desconciliar dialog even when another draft exists', async () => {
      // The warning is gated on `reactivate` too: deleting the reconciliation never confirms the
      // other draft, so the caveat does not apply to that action.
      linesState.draftReconciliationCount = 3;
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));

      // Primary button = Desconciliar (not the dropdown's Reactivar).
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      const modal = screen.getByTestId('recon-remove-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).not.toHaveTextContent('financeReconcileReactivateOtherDraftWarning');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemOtherDraftTitle');
      expect(modal).not.toHaveTextContent('financeReconcileConfirmItemOtherDraftDesc');
      // Desconciliar keeps its own warning copy.
      expect(modal).toHaveTextContent('financeReconcileConfirmRemoveWarning');
    });
  });

  // ── The un-reconcile confirm cartel (shared LifecycleConfirmModal) ─────────────
  // Both Desconciliar and Reactivar now render the SAME cartel Movimientos and Cobros/Pagos use
  // (`recon-remove-*` testids come from its `testIdPrefix`): red title + sub, one consequence bullet
  // per effect that actually applies, a single yellow warning box, then Cancelar + the destructive
  // confirm. These tests pin the content matrix (which bullet / which warning / which confirm label)
  // for each combination of action × auto-created payment × another-draft-open.
  describe('un-reconcile confirm cartel (shared LifecycleConfirmModal)', () => {
    /** Selects the given reconciled line and opens the DESCONCILIAR cartel (primary button). */
    function openRemoveDialog(line, candidates) {
      setLines([line]);
      setCandidates(candidates);
      const rendered = renderPanel();
      fireEvent.click(screen.getByTestId(`recon-line-radio-${line.id}`));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));
      return rendered;
    }

    /** Same, but opens the REACTIVAR cartel through the split button's dropdown item. */
    async function openReactivateDialog(line, candidates) {
      setLines([line]);
      setCandidates(candidates);
      const rendered = renderPanel();
      fireEvent.click(screen.getByTestId(`recon-line-radio-${line.id}`));
      const user = userEvent.setup();
      await user.click(screen.getByTestId('recon-action-reconcile-more'));
      await user.click(screen.getByTestId('recon-action-reactivate'));
      return { ...rendered, user };
    }

    const modal = () => screen.getByTestId('recon-remove-modal');

    it('renders nothing at all until an un-reconcile is requested', () => {
      setLines([LINE_RECONCILED_MULTI]);
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
      // The component returns null while closed — not even the buttons exist in the DOM.
      expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-remove-accept')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-remove-cancel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-remove-close')).not.toBeInTheDocument();
    });

    // ── Desconciliar content ────────────────────────────────────────────────────
    it('Desconciliar: remove title/bullet/warning/confirm label, and no reactivate copy', () => {
      openRemoveDialog(LINE_RECONCILED_TXNS, [RECON_CAND_T2]); // 1 doc, not auto-created
      const m = modal();
      // Title + sub.
      expect(m).toHaveTextContent('financeReconcileConfirmRemoveOneTitle');
      expect(m).toHaveTextContent('financeReconcileConfirmRemoveOneBody');
      // Bullet 1 — the reconciliation itself, worded for the destructive action.
      expect(m).toHaveTextContent('reactivarItem1Title');
      expect(m).toHaveTextContent('financeReconcileConfirmItemRemoveDesc');
      expect(m).not.toHaveTextContent('financeReconcileConfirmItemReactivateDesc');
      // Warning box + confirm/cancel labels.
      expect(m).toHaveTextContent('financeReconcileConfirmRemoveWarning');
      expect(m).not.toHaveTextContent('financeReconcileConfirmReactivateWarning');
      expect(screen.getByTestId('recon-remove-accept'))
        .toHaveTextContent('financeReconcileActionRemoveOne');
      expect(screen.getByTestId('recon-remove-cancel')).toHaveTextContent('cancel');
      // No reactivate title leaks in.
      expect(m).not.toHaveTextContent('financeReconcileConfirmReactivateTitle');
    });

    // ── Reactivar content ───────────────────────────────────────────────────────
    it('Reactivar: reactivate title/bullet/warning/confirm label, and no remove copy', async () => {
      linesState.draftReconciliationCount = 0;
      await openReactivateDialog(LINE_RECONCILED_TXNS, [RECON_CAND_T2]);
      const m = modal();
      expect(m).toHaveTextContent('financeReconcileConfirmReactivateTitle');
      expect(m).toHaveTextContent('financeReconcileConfirmReactivateOneBody');
      // Bullet 1 — same title, draft-preserving description.
      expect(m).toHaveTextContent('reactivarItem1Title');
      expect(m).toHaveTextContent('financeReconcileConfirmItemReactivateDesc');
      expect(m).not.toHaveTextContent('financeReconcileConfirmItemRemoveDesc');
      // With no other draft open, the plain reactivate caveat fills the warning box.
      expect(m).toHaveTextContent('financeReconcileConfirmReactivateWarning');
      expect(m).not.toHaveTextContent('financeReconcileReactivateOtherDraftWarning');
      expect(m).not.toHaveTextContent('financeReconcileConfirmRemoveWarning');
      expect(screen.getByTestId('recon-remove-accept'))
        .toHaveTextContent('financeReconcileActionReactivateSelected');
      expect(screen.getByTestId('recon-remove-accept'))
        .not.toHaveTextContent('financeReconcileActionRemoveOne');
    });

    // ── Another-draft-open bullet + warning switch (draftReconciliationCount) ───
    it('Reactivar with another draft open: extra bullet AND the switched warning copy', async () => {
      linesState.draftReconciliationCount = 1;
      await openReactivateDialog(LINE_RECONCILED_TXNS, [RECON_CAND_T2]);
      const m = modal();
      expect(m).toHaveTextContent('financeReconcileConfirmItemOtherDraftTitle');
      expect(m).toHaveTextContent('financeReconcileConfirmItemOtherDraftDesc');
      // The warning box copy SWITCHES (it is not additive — there is only one box).
      expect(m).toHaveTextContent('financeReconcileReactivateOtherDraftWarning');
      expect(m).not.toHaveTextContent('financeReconcileConfirmReactivateWarning');
    });

    it('Desconciliar with another draft open: no extra bullet, warning unchanged', () => {
      // Gated on `reactivate` too — deleting the reconciliation never confirms the other draft.
      linesState.draftReconciliationCount = 1;
      openRemoveDialog(LINE_RECONCILED_TXNS, [RECON_CAND_T2]);
      const m = modal();
      expect(m).not.toHaveTextContent('financeReconcileConfirmItemOtherDraftTitle');
      expect(m).not.toHaveTextContent('financeReconcileConfirmItemOtherDraftDesc');
      expect(m).not.toHaveTextContent('financeReconcileReactivateOtherDraftWarning');
      expect(m).toHaveTextContent('financeReconcileConfirmRemoveWarning');
    });

    // ── Created-payment bullet (hasAuto), both actions ──────────────────────────
    it('shows the created-payment bullet on BOTH actions when the selection has an auto-created txn', async () => {
      // Desconciliar first (LINE_RECONCILED_MULTI: T3 autoCreated, T4 not — both pre-checked).
      openRemoveDialog(LINE_RECONCILED_MULTI, [RECON_CAND_T3, RECON_CAND_T4]);
      expect(modal()).toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      expect(modal()).toHaveTextContent('financeReconcileConfirmItemPaymentDesc');
      // Then the same selection through Reactivar — the payment is deleted in both cases.
      fireEvent.click(screen.getByTestId('recon-remove-cancel'));
      const user = userEvent.setup();
      await user.click(screen.getByTestId('recon-action-reconcile-more'));
      await user.click(screen.getByTestId('recon-action-reactivate'));
      expect(modal()).toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      expect(modal()).toHaveTextContent('financeReconcileConfirmItemPaymentDesc');
    });

    it('omits the created-payment bullet on BOTH actions when nothing was auto-created', async () => {
      openRemoveDialog(LINE_RECONCILED_TXNS, [RECON_CAND_T2]); // T2 autoCreated: false
      expect(modal()).not.toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      fireEvent.click(screen.getByTestId('recon-remove-cancel'));
      const user = userEvent.setup();
      await user.click(screen.getByTestId('recon-action-reconcile-more'));
      await user.click(screen.getByTestId('recon-action-reactivate'));
      expect(modal()).not.toHaveTextContent('financeReconcileConfirmItemPaymentTitle');
      expect(modal()).not.toHaveTextContent('financeReconcileConfirmItemPaymentDesc');
    });

    it('orders the bullets: reconciliation, then created payment, then other draft', async () => {
      linesState.draftReconciliationCount = 2;
      // T3 is auto-created → all three bullets apply at once on the reactivate path.
      await openReactivateDialog(LINE_RECONCILED_MULTI, [RECON_CAND_T3, RECON_CAND_T4]);
      const text = modal().textContent;
      const first = text.indexOf('reactivarItem1Title');
      const payment = text.indexOf('financeReconcileConfirmItemPaymentTitle');
      const otherDraft = text.indexOf('financeReconcileConfirmItemOtherDraftTitle');
      expect(first).toBeGreaterThan(-1);
      expect(payment).toBeGreaterThan(first);
      expect(otherDraft).toBeGreaterThan(payment);
    });

    // ── Dismissal (cancel / ×) never touches the backend ───────────────────────
    it('Cancelar closes the Desconciliar cartel without calling either endpoint', async () => {
      openRemoveDialog(LINE_RECONCILED_MULTI, [RECON_CAND_T3, RECON_CAND_T4]);
      fireEvent.click(screen.getByTestId('recon-remove-cancel'));
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
      expect(removeState.removeOperation).not.toHaveBeenCalled();
      expect(reactivateSelectedState.reactivateSelected).not.toHaveBeenCalled();
      // The line stays selected, so the action bar is still usable.
      expect(screen.getByTestId('recon-line-radio-LR2')).toBeChecked();
    });

    it('the × button closes the Desconciliar cartel without calling either endpoint', async () => {
      openRemoveDialog(LINE_RECONCILED_MULTI, [RECON_CAND_T3, RECON_CAND_T4]);
      fireEvent.click(screen.getByTestId('recon-remove-close'));
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
      expect(removeState.removeOperation).not.toHaveBeenCalled();
      expect(reactivateSelectedState.reactivateSelected).not.toHaveBeenCalled();
    });

    it('the × button closes the Reactivar cartel without calling either endpoint', async () => {
      await openReactivateDialog(LINE_RECONCILED_MULTI, [RECON_CAND_T3, RECON_CAND_T4]);
      fireEvent.click(screen.getByTestId('recon-remove-close'));
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
      expect(reactivateSelectedState.reactivateSelected).not.toHaveBeenCalled();
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    it('Cancelar closes the Reactivar cartel without calling either endpoint', async () => {
      await openReactivateDialog(LINE_RECONCILED_MULTI, [RECON_CAND_T3, RECON_CAND_T4]);
      fireEvent.click(screen.getByTestId('recon-remove-cancel'));
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
      expect(reactivateSelectedState.reactivateSelected).not.toHaveBeenCalled();
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    // ── Confirm is a no-op while a request is already in flight (busy) ──────────
    it('does not fire a second request when the cartel is confirmed twice', async () => {
      // The cartel disables its own confirm while awaiting onConfirm, and the panel additionally
      // passes a no-op onConfirm while `removing` — so a double click can never double-post.
      let resolveRemove;
      removeState.removeOperation = vi.fn(() => new Promise((res) => { resolveRemove = res; }));
      openRemoveDialog(LINE_RECONCILED_MULTI, [RECON_CAND_T3, RECON_CAND_T4]);
      const accept = screen.getByTestId('recon-remove-accept');
      fireEvent.click(accept);
      await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
      expect(accept).toBeDisabled();
      fireEvent.click(accept);
      expect(removeState.removeOperation).toHaveBeenCalledTimes(1);
      resolveRemove({ transactionIds: ['T3', 'T4'], failedTransactionIds: [] });
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-modal')).not.toBeInTheDocument());
    });
  });

  // ── PARTIAL line reconcile behavior — ETP-4502 iteration 5 ─────────────────────

  describe('PARTIAL line reconcile behavior', () => {
    it('is NOT read-only: shows candidate checkboxes and the Conciliar (count) action', () => {
      setLines([LINE_PARTIAL]);
      setCandidates([CAND_MATCH]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      expect(screen.getByTestId('recon-cand-check-C1')).toBeInTheDocument();
      const btn = screen.getByTestId('recon-action-reconcile');
      expect(btn).not.toHaveTextContent('financeReconcileActionReactivate');
      expect(btn).toHaveTextContent('financeReconcileActionReconcileCount');
    });

    it('calls the candidate hook with the remainderLineId (not the merged line id)', () => {
      setLines([LINE_PARTIAL]);
      setCandidates([CAND_MATCH]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      // The candidate list must target the pending remainder sub-line.
      expect(candidateCallArgs.lineId).toBe('LP1-rem');
    });

    it('reconciles against the remainder sub-line (statementLineId === remainderLineId, not the head)', async () => {
      setLines([LINE_PARTIAL]); // head id 'LP1', remainderLineId 'LP1-rem'
      const INV = {
        id: 'INVR', date: '2026-06-01T00:00:00Z', documentNo: 'F-R', partnerName: 'ACME',
        amount: 46.76, pendingBalance: 46.76, kind: 'invoice', invoiceId: 'INV-ID-R',
        scheduleId: 'SCH-R', suggested: false,
      };
      setCandidates([INV]);
      renderPanel(); // no paymentMethods → the method modal does not open
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      // The candidate hook already targets the remainder sub-line.
      expect(candidateCallArgs.lineId).toBe('LP1-rem');
      // Switch to an invoice source, pick the covering invoice, reconcile.
      fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
      fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
      fireEvent.click(screen.getByTestId('recon-cand-check-INVR'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
      const payload = reconcileState.reconcile.mock.calls[0][0];
      // Posts the pending remainder sub-line, NOT the already-reconciled group head ('LP1').
      expect(payload.statementLineId).toBe('LP1-rem');
      expect(payload.invoices).toEqual([{ invoiceId: 'INV-ID-R', scheduleId: 'SCH-R' }]);
    });

    it('bases the action-bar balance on the pending remainder, not the full line amount', () => {
      setLines([LINE_PARTIAL]); // amount 100, pendingAmount 46.76
      // A candidate that balances the REMAINDER (46.76) — not the full 100.
      const CAND_REM = { ...CAND_OTHER, id: 'CR', amount: 46.76, pendingBalance: 46.76, suggested: false };
      setCandidates([CAND_REM]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-cand-check-CR'));
      // 46.76 balances the pending remainder → reconcile enabled.
      expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
    });

    it('a fully RECONCILED line switches to the bulk "Desconciliar (N)" action', () => {
      setLines([LINE_RECONCILED_TXNS]);
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
      const btn = screen.getByTestId('recon-action-reconcile');
      expect(btn).toHaveTextContent('financeReconcileActionRemoveCount');
      expect(btn).not.toHaveTextContent('financeReconcileActionReconcileCount');
    });
  });


  // ETP-4921 QA — "la vista de conciliación se ve cortada; si cambio el zoom se ve bien".
  // A long statement description stretched the auto-layout table past the panel, so Progreso and
  // Importe ended up behind a horizontal scrollbar. The fix is structural (fixed table layout +
  // an ellipsised description), which is why these assert on the layout contract rather than on
  // pixels: jsdom does no layout, so nothing here can measure the overflow itself.
  describe('column layout — Progreso and Importe stay in view', () => {
    const LONG_DESC = 'TRANSFERENCIA INMEDIATA A FAVOR DE Galder Romo CONCEPTO Factura Nº : 10001754 1000896';

    it('lays both tables out with fixed columns, so the free column absorbs the overflow', () => {
      setLines([LINE_A]);
      renderPanel();

      const tables = screen.getAllByTestId('Table__d0f4d5');
      expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(table.className).toContain('table-fixed');
      }
    });

    // Every column but the description declares a width; under `table-fixed` those widths are
    // what the browser honours, so Progreso (90px) and Importe (139px) can no longer be pushed out.
    it('keeps a declared width on the Progreso and Importe columns', () => {
      setLines([LINE_A]);
      renderPanel();

      const heads = screen.getAllByTestId('TableHead__d0f4d5');
      const classes = heads.map((h) => h.className);
      expect(classes.some((c) => c.includes('w-[90px]'))).toBe(true);
      expect(classes.some((c) => c.includes('w-[139px]'))).toBe(true);
    });

    it('ellipsises the statement description instead of widening the row', () => {
      setLines([{ ...LINE_A, description: LONG_DESC }]);
      renderPanel();

      const desc = screen.getByTestId('recon-line-desc-L1');
      expect(desc).toHaveTextContent(LONG_DESC);
      expect(desc.className).toContain('truncate');
    });

    // The full text is not lost — it comes back on hover, which is the whole point of clipping it.
    it('offers the full description in a tooltip once it is clipped', () => {
      setLines([{ ...LINE_A, description: LONG_DESC }]);
      renderPanel();

      const desc = screen.getByTestId('recon-line-desc-L1');
      // jsdom reports 0 for both metrics, so the overflow has to be stated explicitly.
      Object.defineProperty(desc, 'scrollWidth', { configurable: true, value: 640 });
      Object.defineProperty(desc, 'clientWidth', { configurable: true, value: 300 });

      fireEvent.focus(desc);

      expect(screen.getByTestId('recon-line-desc-L1-tooltip')).toHaveTextContent(LONG_DESC);
    });

    // The row still falls back through partnerName / referenceNo when there is no description.
    /**
     * ETP-4921 — the money headers carried an explicit `text-left` while every MoneyCell under
     * them is `text-right`, so "Importe" / "Saldo pendiente" labelled the opposite edge of their
     * own column. The generic DataTable right-aligns a numeric column's header; these two
     * hand-rolled panels never inherited that.
     */
    it('right-aligns the money headers over their own figures', () => {
      setLines([LINE_A]);
      renderPanel();

      const heads = screen.getAllByTestId('TableHead__d0f4d5');
      const moneyHeads = heads.filter((h) => /financeReconcileCol(Amount|PendingBalance)/
        .test(h.textContent));
      // Left panel Importe + right panel Saldo pendiente & Importe.
      expect(moneyHeads.length).toBeGreaterThan(0);
      for (const h of moneyHeads) {
        expect(h.className, h.textContent).toContain('text-right');
        expect(h.className, h.textContent).not.toContain('text-left');
      }
    });

    // Fecha / Descripción / Progreso name text or a bar, not a figure — they stay left.
    it('leaves the non-money headers alone', () => {
      setLines([LINE_A]);
      renderPanel();

      const heads = screen.getAllByTestId('TableHead__d0f4d5');
      const textHeads = heads.filter((h) => /financeReconcileCol(Date|Description|Progress)/
        .test(h.textContent));
      expect(textHeads.length).toBeGreaterThan(0);
      for (const h of textHeads) {
        expect(h.className, h.textContent).not.toContain('text-right');
      }
    });

    it('keeps the description fallback chain', () => {
      setLines([{ id: 'L9', date: '2026-05-10T00:00:00Z', status: 'pending', amount: 5, partnerName: 'ACME' }]);
      renderPanel();

      expect(screen.getByTestId('recon-line-desc-L9')).toHaveTextContent('ACME');
    });
  });

  // ETP-4956 — "Todo el tiempo" is encoded as `value === null`, which is indistinguishable
  // from "nothing has been chosen", so computeTriggerLabel falls through to the placeholder.
  // The placeholder used to be `financeReconcileFilterDate`, whose literal Spanish value is
  // "Últimos 12 meses" — so the button kept advertising a 12-month window after the user had
  // widened the filter to every date. It is now the generic `dateRangeAnyTime`.
  describe('date range trigger after picking "all time"', () => {
    it('reads the last-12-months preset on mount (the default period)', () => {
      setLines([LINE_A]);
      renderPanel();
      expect(screen.getAllByText('dateRangeLast12Months').length).toBeGreaterThan(0);
    });

    it('stops advertising a 12-month window once "all time" is picked', async () => {
      const user = userEvent.setup();
      setLines([LINE_A]);
      renderPanel();

      // Open the picker from its trigger (which currently shows the default preset).
      await user.click(screen.getAllByText('dateRangeLast12Months')[0]);

      // The popover's "all time" preset emits `null` and closes the popover.
      await user.click(await screen.findByText('dateRangeAllTime'));

      // The trigger must no longer claim a bounded period…
      expect(screen.queryByText('dateRangeLast12Months')).not.toBeInTheDocument();
      // …nor fall back to the window-specific label that reads as one.
      expect(screen.queryByText('financeReconcileFilterDate')).not.toBeInTheDocument();
      // …and instead says "any date".
      expect(screen.getAllByText('dateRangeAnyTime').length).toBeGreaterThan(0);
    });
  });

});

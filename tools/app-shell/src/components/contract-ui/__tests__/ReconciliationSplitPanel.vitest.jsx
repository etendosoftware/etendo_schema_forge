// Mocks BEFORE imports
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    if (vars) return key.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    return key;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// Hook mocks — overridable per test via the mutable state objects below.
const linesState = { lines: [], total: 0, counts: {}, loading: false, reload: vi.fn() };
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn().mockResolvedValue({ reconciliationId: 'R1' }), loading: false };
const removeState = { removeOperation: vi.fn().mockResolvedValue({ removed: true }), loading: false };
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
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';

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
  matchGroupId: 'G1', remainderLineId: 'LP1-rem',
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
    candidatesState.candidates = [];
    candidatesState.loading = false;
    reconcileState.reconcile = vi.fn().mockResolvedValue({ reconciliationId: 'R1' });
    reconcileState.loading = false;
    removeState.removeOperation = vi.fn().mockResolvedValue({ removed: true });
    removeState.loading = false;
    candidateCallArgs.accountId = null;
    candidateCallArgs.lineId = null;
    candidateCallArgs.docType = null;
    candidateCallArgs.kind = null;
  });

  it('renders the left panel with the pending statement lines', () => {
    setLines([LINE_A, LINE_B]);
    renderPanel();
    expect(screen.getByTestId('recon-line-row-L1')).toBeInTheDocument();
    expect(screen.getByTestId('recon-line-row-L2')).toBeInTheDocument();
    expect(screen.getByText('Transfer ACME')).toBeInTheDocument();
  });

  it('shows the empty state on the right until a line is selected', () => {
    setLines([LINE_A]);
    renderPanel();
    expect(screen.getByTestId('recon-right-empty')).toBeInTheDocument();
    expect(screen.getByText('financeReconcileRightEmptyTitle')).toBeInTheDocument();
  });

  it('renders a back button and movement-style filter controls on the left toolbar', () => {
    const onBack = vi.fn();
    setLines([LINE_A]);
    renderPanel({ onBack });
    fireEvent.click(screen.getByTestId('recon-toolbar-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/financeReconcileFilterStatusPending/)).toBeInTheDocument();
    expect(screen.getAllByText('dateRangeLast30Days').length).toBeGreaterThan(0);
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

  // ── Client-side state filter (T7) ─────────────────────────────────────────────

  it('shows only lines matching the active leftStatus filter', () => {
    // Four lines: two pending, one suggested, one byRule.
    const LINE_SUGGESTED = { id: 'LS', date: '2026-05-10T00:00:00Z', description: 'Suggested line', state: 'suggested', status: 'pending', amount: -100 };
    const LINE_BYRULE = { id: 'LR', date: '2026-05-11T00:00:00Z', description: 'By-rule line', state: 'byRule', status: 'pending', amount: -50 };
    setLines([LINE_A, LINE_B, LINE_SUGGESTED, LINE_BYRULE]);
    linesState.counts = { all: 4, pending: 2, suggested: 1, byRule: 1, difference: 0, reconciled: 0 };
    renderPanel();

    // Default leftStatus is 'pending' — only LINE_A and LINE_B (state: 'pending') visible.
    expect(screen.getByTestId('recon-line-row-L1')).toBeInTheDocument();
    expect(screen.getByTestId('recon-line-row-L2')).toBeInTheDocument();
    expect(screen.queryByTestId('recon-line-row-LS')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recon-line-row-LR')).not.toBeInTheDocument();
  });

  it('passes counts from the hook to the status filter component', () => {
    setLines([LINE_A, LINE_B]);
    linesState.counts = { all: 5, pending: 3, suggested: 1, byRule: 0, difference: 1, reconciled: 0 };
    renderPanel();

    // ReconciliationStatusFilter renders labelFor(code) = `${ui(key)} (${countFor(code)})`.
    // With our i18n mock returning the key, the label includes the count.
    // The active label (pending) is visible in the trigger button; the others are in the popover.
    // Use a text-content function matcher to handle elements that split text across children.
    expect(screen.getByText((content) => content.includes('financeReconcileFilterStatusPending') && content.includes('3'))).toBeInTheDocument();
  });

  it('visibleTotal reflects filtered lines, not all lines', () => {
    // Three lines: two pending (amounts -8.31 and 1200), one suggested (-100).
    const LINE_SUGGESTED2 = { id: 'LS2', date: '2026-05-12T00:00:00Z', description: 'S line', state: 'suggested', status: 'pending', amount: -100 };
    setLines([LINE_A, LINE_B, LINE_SUGGESTED2]);
    // Default leftStatus is 'pending' — only LINE_A (-8.31) and LINE_B (1200) are visible.
    renderPanel();

    // The footer total must show the sum of only visible (pending) lines: -8.31 + 1200 = 1191.69.
    // The panel renders visibleTotal with MoneyAmount; in our mock MoneyAmount renders the value.
    // We check the total footer row which renders formatSigned(visibleTotal, currency).
    // Since formatSigned is internal, we verify the footer does NOT show -100 (the suggested line).
    expect(screen.queryByText(/-100/)).not.toBeInTheDocument();
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

    expect(screen.queryByTestId('recon-remove-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    // Dialog opens; the endpoint is NOT called yet (it requires confirmation).
    expect(screen.getByTestId('recon-remove-dialog')).toBeInTheDocument();
    expect(removeState.removeOperation).not.toHaveBeenCalled();
  });

  it('bulk-un-reconciles ALL linked docs (transactionIds[]) on confirm and reloads', async () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));
    fireEvent.click(screen.getByTestId('recon-remove-confirm'));

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

    expect(screen.getByTestId('recon-remove-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-remove-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('recon-remove-dialog')).not.toBeInTheDocument());
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
    fireEvent.click(screen.getByTestId('recon-remove-confirm'));
    await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
    expect(removeState.removeOperation.mock.calls[0][0].transactionIds).toEqual(['T4']);
  });

  it('per-row unlink un-reconciles just that doc (transactionIds:[thatId])', async () => {
    setLines([LINE_RECONCILED_MULTI]);
    setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
    fireEvent.click(screen.getByTestId('recon-unlink-T3'));
    expect(screen.getByTestId('recon-remove-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-remove-confirm'));
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

  // ── Right-panel "conciliado" block (ReconciledOperationsSection) — it.5 ────────

  describe('ReconciledOperationsSection (right "conciliado" block)', () => {
    it('is hidden for a selected line with nothing reconciled (reconciledAmount == 0)', () => {
      setLines([LINE_A]);
      setCandidates([CAND_MATCH]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
      expect(screen.queryByTestId('recon-matched-block')).not.toBeInTheDocument();
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
      // Each matched row exposes its unlink ("desvincular") button.
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
      expect(screen.queryByTestId('recon-remove-dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      expect(screen.getByTestId('recon-remove-dialog')).toBeInTheDocument();
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    it('appends the auto-created hint in the dialog body when the txn is auto-created', () => {
      setLines([LINE_PARTIAL]); // T1 autoCreated: true
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      expect(screen.getByTestId('recon-remove-dialog')).toHaveTextContent('financeReconcileRemoveOneAutoHint');
    });

    it('omits the auto-created hint when the txn is not auto-created', () => {
      setLines([LINE_RECONCILED_TXNS]); // T2 autoCreated: false (candidate-list per-row unlink)
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
      fireEvent.click(screen.getByTestId('recon-unlink-T2'));
      expect(screen.getByTestId('recon-remove-dialog')).not.toHaveTextContent('financeReconcileRemoveOneAutoHint');
    });

    it('calls removeOperation with the right payload on confirm, then reloads and notifies', async () => {
      setLines([LINE_PARTIAL]);
      const { props } = renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      fireEvent.click(screen.getByTestId('recon-remove-confirm'));

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
      await waitFor(() => expect(screen.queryByTestId('recon-remove-dialog')).not.toBeInTheDocument());
    });

    it('does not call removeOperation when the dialog is cancelled', async () => {
      setLines([LINE_PARTIAL]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LP1'));
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
      fireEvent.click(screen.getByTestId('recon-unlink-T1'));
      expect(screen.getByTestId('recon-remove-dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('recon-remove-cancel'));
      await waitFor(() =>
        expect(screen.queryByTestId('recon-remove-dialog')).not.toBeInTheDocument());
      expect(removeState.removeOperation).not.toHaveBeenCalled();
    });

    it('uses the "one" body for a single-row unlink', () => {
      setLines([LINE_RECONCILED_TXNS]); // per-row unlink of T2 → count 1
      setCandidates([RECON_CAND_T2]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR1'));
      fireEvent.click(screen.getByTestId('recon-unlink-T2'));
      const dialog = screen.getByTestId('recon-remove-dialog');
      expect(dialog).toHaveTextContent('financeReconcileConfirmRemoveOneBody');
      expect(dialog).not.toHaveTextContent('financeReconcileConfirmRemoveManyBody');
    });

    it('uses the "many" body + auto hint for a bulk selection with an auto-created doc', () => {
      setLines([LINE_RECONCILED_MULTI]); // 2 docs, T3 autoCreated → bulk "Desconciliar (2)"
      setCandidates([RECON_CAND_T3, RECON_CAND_T4]);
      renderPanel();
      fireEvent.click(screen.getByTestId('recon-line-radio-LR2'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));
      const dialog = screen.getByTestId('recon-remove-dialog');
      expect(dialog).toHaveTextContent('financeReconcileConfirmRemoveManyBody');
      expect(dialog).toHaveTextContent('financeReconcileRemoveOneAutoHint');
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

});

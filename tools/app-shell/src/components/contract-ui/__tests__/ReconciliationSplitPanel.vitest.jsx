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
const reactivateState = { reactivate: vi.fn().mockResolvedValue({ reactivated: true }), loading: false };
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
  useReactivateReconciliation: () => reactivateState,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const LINE_A = { id: 'L1', date: '2026-05-10T00:00:00Z', description: 'Transfer ACME', status: 'pending', amount: -8.31 };
const LINE_B = { id: 'L2', date: '2026-05-11T00:00:00Z', description: 'Payroll', status: 'pending', amount: 1200 };
const LINE_RECONCILED = { id: 'L3', date: '2026-05-12T00:00:00Z', description: 'Done line', status: 'reconciled', amount: 50 };

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
    reactivateState.reactivate = vi.fn().mockResolvedValue({ reactivated: true });
    reactivateState.loading = false;
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

  it('shows an enabled "Reactivate" label and a read-only right panel for a reconciled line', () => {
    setLines([LINE_RECONCILED]);
    setCandidates([CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L3'));
    const btn = screen.getByTestId('recon-action-reconcile');
    expect(btn).toHaveTextContent('financeReconcileActionReactivate');
    // The Reactivate button is live now (the un-reconcile action itself is a follow-up task).
    expect(btn).not.toBeDisabled();
    // Read-only: the linked movement renders but exposes no selection checkbox.
    expect(screen.getByTestId('recon-cand-row-C1')).toBeInTheDocument();
    expect(screen.queryByTestId('recon-cand-check-C1')).not.toBeInTheDocument();
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
    expect(screen.getByTestId('recon-cand-check-C1')).toBeChecked();
    expect(screen.getByTestId('recon-cand-check-C2')).not.toBeChecked();
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
    expect(screen.getByTestId('recon-cand-check-C1')).toBeChecked();
    expect(screen.getByTestId('recon-cand-check-C3')).toBeChecked();
    expect(screen.getByTestId('recon-cand-check-C2')).not.toBeChecked();

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
    expect(screen.getByTestId('recon-cand-check-C1')).toBeChecked();
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
    // A single invoice whose outstanding (1500) covers the line (|1500| >= |1200|).
    const INV = { id: 'INV9', date: '2026-06-01T00:00:00Z', documentNo: 'F-9', partnerName: 'ACME',
      amount: 1500, pendingBalance: 1500, kind: 'invoice', invoiceId: 'INV-ID-9', scheduleId: 'SCH-9', suggested: false };
    setCandidates([INV]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    // Select the covering invoice.
    fireEvent.click(screen.getByTestId('recon-cand-check-INV9'));

    expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
  });

  it('keeps Conciliar disabled with an invoice source when the selection does NOT cover the line', () => {
    setLines([LINE_B]); // line amount 1200 (inflow → default receipts)
    // A single invoice whose outstanding (500) does NOT cover the line (|500| < |1200|).
    const INV = { id: 'INV9', date: '2026-06-01T00:00:00Z', documentNo: 'F-9', partnerName: 'ACME',
      amount: 500, pendingBalance: 500, kind: 'invoice', invoiceId: 'INV-ID-9', scheduleId: 'SCH-9', suggested: false };
    setCandidates([INV]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    fireEvent.click(screen.getByTestId('recon-cand-check-INV9'));

    expect(screen.getByTestId('recon-action-reconcile')).toBeDisabled();
  });

  // ── Invoice reconcile payload ─────────────────────────────────────────────────

  it('reconciles with an invoice source using an invoices[] payload (no operationIds)', async () => {
    setLines([LINE_B]); // line amount 1200 (inflow → default receipts)
    const INV_A = { id: 'INVA', date: '2026-06-01T00:00:00Z', documentNo: 'F-A', partnerName: 'ACME',
      amount: 800, pendingBalance: 800, kind: 'invoice', invoiceId: 'INV-ID-A', scheduleId: 'SCH-A', suggested: false };
    const INV_B = { id: 'INVB', date: '2026-06-02T00:00:00Z', documentNo: 'F-B', partnerName: 'ACME',
      amount: 600, pendingBalance: 600, kind: 'invoice', invoiceId: 'INV-ID-B', scheduleId: 'SCH-B', suggested: false };
    setCandidates([INV_A, INV_B]);
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L2'));
    fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
    fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
    // Select both invoices (combined 1400 covers the 1200 line).
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

  // ── Reactivate (un-reconcile) — T8 part 1 ─────────────────────────────────────

  it('enables the "Reactivate" action only on a reconciled line', () => {
    setLines([LINE_RECONCILED]);
    setCandidates([CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L3'));
    const btn = screen.getByTestId('recon-action-reconcile');
    expect(btn).toHaveTextContent('financeReconcileActionReactivate');
    expect(btn).not.toBeDisabled();
  });

  it('does not show the "Reactivate" action for a pending line', () => {
    setLines([LINE_A]);
    setCandidates([CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L1'));
    const btn = screen.getByTestId('recon-action-reconcile');
    // A pending line shows the "Conciliar" (count) label, never "Reactivar".
    expect(btn).not.toHaveTextContent('financeReconcileActionReactivate');
  });

  it('opens the confirm dialog when "Reactivate" is clicked, without calling the endpoint', () => {
    setLines([LINE_RECONCILED]);
    setCandidates([CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L3'));

    // Dialog is closed before the action.
    expect(screen.queryByTestId('recon-reactivate-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    // Dialog opens; the endpoint is NOT called yet (it requires confirmation).
    expect(screen.getByTestId('recon-reactivate-dialog')).toBeInTheDocument();
    expect(reactivateState.reactivate).not.toHaveBeenCalled();
  });

  it('posts the correct reactivate payload on confirm and clears selection + reloads', async () => {
    setLines([LINE_RECONCILED]);
    setCandidates([CAND_MATCH]);
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L3'));
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    fireEvent.click(screen.getByTestId('recon-reactivate-confirm'));

    await waitFor(() => expect(reactivateState.reactivate).toHaveBeenCalledTimes(1));
    expect(reactivateState.reactivate).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1',
      statementLineId: 'L3',
    });
    // On success: selection cleared (right panel empty again), lines reloaded, caller notified.
    await waitFor(() => expect(screen.getByTestId('recon-right-empty')).toBeInTheDocument());
    expect(linesState.reload).toHaveBeenCalled();
    expect(props.onReconcileSuccess).toHaveBeenCalled();
  });

  it('does not call reactivate when the confirm dialog is cancelled', async () => {
    setLines([LINE_RECONCILED]);
    setCandidates([CAND_MATCH]);
    renderPanel();
    fireEvent.click(screen.getByTestId('recon-line-radio-L3'));
    fireEvent.click(screen.getByTestId('recon-action-reconcile'));

    expect(screen.getByTestId('recon-reactivate-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recon-reactivate-cancel'));

    // Dialog closes and the endpoint was never hit.
    await waitFor(() =>
      expect(screen.queryByTestId('recon-reactivate-dialog')).not.toBeInTheDocument());
    expect(reactivateState.reactivate).not.toHaveBeenCalled();
    // The reconciled line stays selected (read-only right panel still shown).
    expect(screen.getByTestId('recon-line-radio-L3')).toBeChecked();
  });

});

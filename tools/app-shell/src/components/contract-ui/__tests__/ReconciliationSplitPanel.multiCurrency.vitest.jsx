// ETP-4502 iteration 2 — multi-currency (foreign-invoice) reconciliation behavior of
// ReconciliationSplitPanel. Focused companion to ReconciliationSplitPanel.vitest.jsx.
//
// Covers the changes made in this iteration:
//   - Selecting a foreign-currency invoice is a plain toggle now — it no longer collapses the
//     selection, so one statement line can match MULTIPLE invoices of different currencies.
//   - CurrencyBadge shown ONLY for a candidate whose currency differs from the account's
//     (testid unchanged from iteration 1).
//   - A foreign candidate's account-currency (EUR) equivalent renders as a secondary line under
//     both money cells (`recon-cand-amount-base`) when the candidate carries `amountBase`.
//   - selectedSum/action-bar totals: same-currency candidates contribute their plain `amount`;
//     foreign candidates contribute `amountBase` (or are excluded from the sum — stay in
//     "remaining" — when `amountBase` is missing).
//   - The payment-method modal opens only in invoice mode, only when the account has payment
//     methods configured for the line's direction, and threads the chosen method id into the
//     reconcile payload.

// Mocks BEFORE imports.
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

// ChipSelect (the payment-method picker, same component as "Concepto contable" in the New
// Movement modal) → lightweight stub exposing the REAL options from useLookup('') as buttons, so
// a test can pick a SPECIFIC method by id (mirrors the stub style already used for ChipSelect in
// NewTransactionModal.vitest.jsx, minus its synthetic-id shortcut — here the id matters).
vi.mock('@/components/forms/fields', () => ({
  ChipSelect: ({ value, onChange, useLookup, testId }) => {
    const { results } = useLookup('');
    return (
      <div>
        <span data-testid={`${testId}-value`}>{value?.id ?? ''}</span>
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            data-testid={`${testId}-option-${r.id}`}
            onClick={() => onChange(r)}
          >
            {r.name}
          </button>
        ))}
      </div>
    );
  },
}));

const linesState = { lines: [], total: 0, counts: {}, loading: false, reload: vi.fn() };
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn().mockResolvedValue({ reconciliationId: 'R1' }), loading: false };
const reactivateState = { reactivate: vi.fn().mockResolvedValue({ reactivated: true }), loading: false };
const removeState = { removeOperation: vi.fn().mockResolvedValue({ removed: true }), loading: false };

vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: () => linesState,
  useCandidateOperations: (accountId, lineId) => ({
    candidates: lineId ? [...candidatesState.candidates] : [],
    loading: candidatesState.loading,
  }),
  useReconcileGroup: () => reconcileState,
  useReactivateReconciliation: () => reactivateState,
  useRemoveOperation: () => removeState,
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';

// ── Fixtures ────────────────────────────────────────────────────────────────
// The panel's account currency is EUR (see renderPanel).

const LINE_EUR = {
  id: 'L27', date: '2026-05-10T00:00:00Z', description: 'Wire ACME',
  status: 'pending', amount: 27,
};

// A line whose amount matches the sum of a EUR invoice (20) + a USD invoice's EUR-equivalent (27).
const LINE_MULTI = {
  id: 'LM', date: '2026-05-11T00:00:00Z', description: 'Multi-invoice wire',
  status: 'pending', amount: 47,
};

const LINE_POS = {
  id: 'LP', date: '2026-05-12T00:00:00Z', description: 'Big receipt',
  status: 'pending', amount: 100,
};

const CAND_FOREIGN_USD = {
  id: 'C-USD', date: '2026-06-10T00:00:00Z', documentNo: 'INV-USD', partnerName: 'ACME',
  amount: 30, pendingBalance: 30, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-1', scheduleId: 'sch-1', currency: 'USD',
  amountBase: 27, baseCurrency: 'EUR',
};

const CAND_FOREIGN_GBP = {
  id: 'C-GBP', date: '2026-06-11T00:00:00Z', documentNo: 'INV-GBP', partnerName: 'Wayne Corp',
  amount: 10, pendingBalance: 10, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-4', scheduleId: 'sch-4', currency: 'GBP',
  amountBase: 12, baseCurrency: 'EUR',
};

const CAND_SAME = {
  id: 'C-EUR', date: '2026-06-09T00:00:00Z', documentNo: 'INV-EUR', partnerName: 'Globex',
  amount: 20, pendingBalance: 20, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-2', scheduleId: 'sch-2', currency: 'EUR',
};

// Foreign candidate with NO amountBase — must be excluded from the selected sum ("remaining").
const CAND_FOREIGN_NO_BASE = {
  id: 'C-NOBASE', date: '2026-06-12T00:00:00Z', documentNo: 'INV-NOBASE', partnerName: 'Initech',
  amount: 5, pendingBalance: 5, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-5', scheduleId: 'sch-5', currency: 'USD',
};

const CAND_NO_CURRENCY = {
  id: 'C-NONE', date: '2026-06-08T00:00:00Z', documentNo: 'INV-NONE', partnerName: 'Initech',
  amount: 15, pendingBalance: 15, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-3', scheduleId: 'sch-3',
};

// A covering same-currency invoice for the payment-method-modal tests (no FX involved there).
// Matches LINE_POS (100) exactly — these tests exercise the modal itself, not the coverage
// boundary (that's covered separately in ReconciliationSplitPanel.vitest.jsx, including the
// invoice-exceeds-the-line case, which invoiceMode's `balanced` check has no upper bound for).
const CAND_INVOICE_COVERING = {
  id: 'CI', date: '2026-06-01T00:00:00Z', documentNo: 'F-9', partnerName: 'ACME',
  amount: 100, pendingBalance: 100, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-9', scheduleId: 'sch-9', currency: 'EUR',
};

// A plain existing-transaction candidate (no `kind: 'invoice'`) balancing LINE_POS exactly.
const CAND_TRANSACTION = {
  id: 'TX1', date: '2026-06-01T00:00:00Z', documentNo: 'TX-1', partnerName: 'ACME',
  amount: 100, pendingBalance: 100, status: 'pending', suggested: false,
};

const PM_RECEIPT_DEFAULT = { id: 'pm-1', name: 'Wire', isDefault: true, payinAllow: true, payoutAllow: false };
const PM_RECEIPT_OTHER = { id: 'pm-2', name: 'Cash', isDefault: false, payinAllow: true, payoutAllow: false };
const PM_PAYOUT_ONLY = { id: 'pm-3', name: 'Check', isDefault: false, payinAllow: false, payoutAllow: true };

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

/** Selects the given statement line (its candidates then resolve via the hook mock). */
function selectLine(id) {
  fireEvent.click(screen.getByTestId(`recon-line-radio-${id}`));
}

/**
 * Switches the right-panel source to "sales invoices" — the only way to enter invoiceMode, which
 * the foreign-invoice branch requires. Opens the source selector (trigger shows the current
 * "receipts" label) then picks the sales-invoices option.
 */
function switchToSalesInvoices() {
  fireEvent.click(screen.getByText(/financeReconcileSourceReceipts/));
  fireEvent.click(screen.getByText(/financeReconcileSourceSalesInvoices/));
}

// The shared Checkbox (app-shell-core, Semantic Theme Contract) renders a
// <label data-testid="recon-cand-check-...">  wrapping a nested
// <input type="checkbox">. The checked state (and `.toBeChecked()`) only
// applies to that nested input, not the label, so drill into it here.
function candidateCheckbox(candidateId) {
  return within(screen.getByTestId(`recon-cand-check-${candidateId}`)).getByRole('checkbox');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReconciliationSplitPanel — multi-currency (ETP-4502 iteration 2)', () => {
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
    removeState.removeOperation = vi.fn().mockResolvedValue({ removed: true });
    removeState.loading = false;
  });

  describe('CurrencyBadge', () => {
    it('renders the badge with the invoice currency for a foreign candidate', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN_USD]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      const row = screen.getByTestId('recon-cand-row-C-USD');
      const badge = screen.getByTestId('recon-cand-currency-badge');
      expect(row).toContainElement(badge);
      expect(badge).toHaveTextContent('USD');
    });

    it('does NOT render the badge for a same-currency candidate', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      expect(screen.getByTestId('recon-cand-row-C-EUR')).toBeInTheDocument();
      expect(screen.queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
    });

    it('does NOT render the badge for a candidate with no currency', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_NO_CURRENCY]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      expect(screen.getByTestId('recon-cand-row-C-NONE')).toBeInTheDocument();
      expect(screen.queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
    });

    it('shows a badge on each foreign row when multiple foreign candidates coexist with a local one', () => {
      setLines([LINE_MULTI]);
      setCandidates([CAND_FOREIGN_USD, CAND_FOREIGN_GBP, CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('LM');

      expect(screen.getAllByTestId('recon-cand-currency-badge')).toHaveLength(2);
      expect(within(screen.getByTestId('recon-cand-row-C-USD')).getByTestId('recon-cand-currency-badge')).toBeInTheDocument();
      expect(within(screen.getByTestId('recon-cand-row-C-GBP')).getByTestId('recon-cand-currency-badge')).toBeInTheDocument();
      expect(within(screen.getByTestId('recon-cand-row-C-EUR')).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
    });
  });

  // MoneyCell wraps its secondary <MoneyAmount> in a <span data-testid="recon-cand-amount-base">
  // (MoneyAmount itself doesn't forward extra props like data-testid, so the testid lives on the
  // wrapping span instead — see ReconciliationSplitPanel.jsx's MoneyCell).
  describe('EUR-equivalent secondary line (account-currency equivalent under the money cells)', () => {
    it('renders the account-currency equivalent under both money cells for a foreign candidate with amountBase', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN_USD]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      const row = screen.getByTestId('recon-cand-row-C-USD');
      // One per MoneyCell (pending balance + amount).
      const secondaryLines = within(row).getAllByTestId('recon-cand-amount-base');
      expect(secondaryLines).toHaveLength(2);
      expect(secondaryLines[0].textContent).toMatch(/27[.,]00\s?€/);
    });

    it('does NOT render a secondary line for a same-currency candidate', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      const row = screen.getByTestId('recon-cand-row-C-EUR');
      expect(within(row).queryByTestId('recon-cand-amount-base')).not.toBeInTheDocument();
    });

    it('does NOT render a secondary line for a foreign candidate missing amountBase', () => {
      setLines([LINE_MULTI]);
      setCandidates([CAND_FOREIGN_NO_BASE]);
      renderPanel({ currency: 'EUR' });
      selectLine('LM');

      const row = screen.getByTestId('recon-cand-row-C-NOBASE');
      // Still gets the currency badge (it IS foreign) but no base-amount secondary line.
      expect(within(row).getByTestId('recon-cand-currency-badge')).toBeInTheDocument();
      expect(within(row).queryByTestId('recon-cand-amount-base')).not.toBeInTheDocument();
    });
  });

  describe('multi-select across currencies', () => {
    it('keeps both a foreign and a local candidate selected simultaneously (no collapse)', () => {
      setLines([LINE_MULTI]);
      setCandidates([CAND_SAME, CAND_FOREIGN_USD]);
      renderPanel({ currency: 'EUR' });
      selectLine('LM');
      switchToSalesInvoices();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));
      expect(candidateCheckbox('C-EUR')).toBeChecked();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));
      // Both stay selected — the old single-foreign-invoice collapse is gone.
      expect(candidateCheckbox('C-USD')).toBeChecked();
      expect(candidateCheckbox('C-EUR')).toBeChecked();
    });

    it('keeps two foreign candidates of DIFFERENT currencies selected simultaneously', () => {
      setLines([LINE_MULTI]);
      setCandidates([CAND_FOREIGN_USD, CAND_FOREIGN_GBP]);
      renderPanel({ currency: 'EUR' });
      selectLine('LM');
      switchToSalesInvoices();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C-GBP'));

      expect(candidateCheckbox('C-USD')).toBeChecked();
      expect(candidateCheckbox('C-GBP')).toBeChecked();
    });

    it('toggling a foreign candidate off only deselects that one row', () => {
      setLines([LINE_MULTI]);
      setCandidates([CAND_FOREIGN_USD, CAND_FOREIGN_GBP]);
      renderPanel({ currency: 'EUR' });
      selectLine('LM');
      switchToSalesInvoices();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C-GBP'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD')); // toggle off

      expect(candidateCheckbox('C-USD')).not.toBeChecked();
      expect(candidateCheckbox('C-GBP')).toBeChecked();
    });
  });

  describe('selectedSum / action bar totals across mixed currencies', () => {
    it('sums the plain amount for a same-currency candidate and the amountBase for a foreign one', () => {
      setLines([LINE_MULTI]); // amount 47 = 20 (EUR) + 27 (USD invoice's EUR-equivalent)
      setCandidates([CAND_SAME, CAND_FOREIGN_USD]);
      renderPanel({ currency: 'EUR' });
      selectLine('LM');
      switchToSalesInvoices();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));

      // Selected = 20 + 27 = 47; Remaining = 47 - 47 = 0 -> balanced -> reconcile enabled.
      expect(screen.getByText('financeReconcileBarSelected')).toBeInTheDocument();
      const selectedRow = screen.getByText('financeReconcileBarSelected').closest('div');
      expect(selectedRow.textContent).toContain('47');
      expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
    });

    it('excludes a foreign candidate with no amountBase from the selected sum (stays in remaining)', () => {
      setLines([LINE_MULTI]); // amount 47
      setCandidates([CAND_SAME, CAND_FOREIGN_USD, CAND_FOREIGN_NO_BASE]);
      renderPanel({ currency: 'EUR' });
      selectLine('LM');
      switchToSalesInvoices();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C-NOBASE'));

      // Selected sum must still be 47 (20 + 27), NOT 47 + 5 — the no-base candidate is excluded.
      const selectedRow = screen.getByText('financeReconcileBarSelected').closest('div');
      expect(selectedRow.textContent).toContain('47');
      expect(selectedRow.textContent).not.toContain('52');
    });

    it('sums a EUR invoice and a GBP invoice (via amountBase) and reports the correct remaining', () => {
      const LINE_THREE = { id: 'L3X', status: 'pending', amount: 39 };
      setLines([LINE_THREE]);
      setCandidates([CAND_SAME, CAND_FOREIGN_GBP]); // 20 (EUR) + 12 (GBP base) = 32
      renderPanel({ currency: 'EUR' });
      selectLine('L3X');
      switchToSalesInvoices();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));
      fireEvent.click(screen.getByTestId('recon-cand-check-C-GBP'));

      const selectedRow = screen.getByText('financeReconcileBarSelected').closest('div');
      expect(selectedRow.textContent).toContain('32');
      const remainingRow = screen.getByText('financeReconcileBarRemaining').closest('div');
      expect(remainingRow.textContent).toContain('7'); // 39 - 32 = 7
    });
  });

  describe('same-currency behavior unchanged', () => {
    it('shows the selected/remaining totals for a same-currency invoice, no currency badge', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));

      expect(screen.getByText('financeReconcileBarSelected')).toBeInTheDocument();
      expect(screen.getByText('financeReconcileBarRemaining')).toBeInTheDocument();
      expect(screen.queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
    });
  });

  describe('payment method modal', () => {
    it('opens the modal instead of reconciling immediately when invoice mode has direction-matching methods', () => {
      setLines([LINE_POS]);
      setCandidates([CAND_INVOICE_COVERING]);
      renderPanel({ currency: 'EUR', paymentMethods: [PM_RECEIPT_DEFAULT, PM_RECEIPT_OTHER, PM_PAYOUT_ONLY] });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));

      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      expect(screen.getByTestId('recon-payment-method-dialog')).toBeInTheDocument();
      expect(reconcileState.reconcile).not.toHaveBeenCalled();
    });

    it('preselects the isDefault method among the direction-filtered list', () => {
      setLines([LINE_POS]);
      setCandidates([CAND_INVOICE_COVERING]);
      renderPanel({ currency: 'EUR', paymentMethods: [PM_RECEIPT_OTHER, PM_RECEIPT_DEFAULT, PM_PAYOUT_ONLY] });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      // The selector preselects the default ("Wire", pm-1).
      expect(screen.getByTestId('recon-payment-method-value')).toHaveTextContent('pm-1');
      // Only the direction-matching methods are offered — the payout-only one (wrong direction
      // for a receipt) is excluded from the options entirely.
      expect(screen.getByTestId('recon-payment-method-option-pm-2')).toBeInTheDocument();
      expect(screen.queryByTestId('recon-payment-method-option-pm-3')).not.toBeInTheDocument();
    });

    it('preselects the first direction-matching method when none is isDefault', () => {
      setLines([LINE_POS]);
      setCandidates([CAND_INVOICE_COVERING]);
      const nonDefaultA = { id: 'pm-4', name: 'Transfer', isDefault: false, payinAllow: true, payoutAllow: false };
      const nonDefaultB = { id: 'pm-5', name: 'Card', isDefault: false, payinAllow: true, payoutAllow: false };
      renderPanel({ currency: 'EUR', paymentMethods: [nonDefaultA, nonDefaultB] });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      expect(screen.getByTestId('recon-payment-method-value')).toHaveTextContent('pm-4');
    });

    it('confirming the modal calls reconcile with the chosen paymentMethodId in the payload', async () => {
      setLines([LINE_POS]);
      setCandidates([CAND_INVOICE_COVERING]);
      const { props } = renderPanel({
        currency: 'EUR', paymentMethods: [PM_RECEIPT_DEFAULT, PM_RECEIPT_OTHER],
      });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      // Switch the selection to the non-default method (pm-2, "Cash") before confirming.
      fireEvent.click(screen.getByTestId('recon-payment-method-option-pm-2'));
      fireEvent.click(screen.getByTestId('recon-payment-method-confirm'));

      await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
      const payload = reconcileState.reconcile.mock.calls[0][0];
      expect(payload.paymentMethodId).toBe('pm-2');
      expect(payload.invoices).toEqual([{ invoiceId: 'inv-9', scheduleId: 'sch-9' }]);
      await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
      // Modal closes on success.
      expect(screen.queryByTestId('recon-payment-method-dialog')).not.toBeInTheDocument();
    });

    it('cancelling the modal closes it without calling reconcile', () => {
      setLines([LINE_POS]);
      setCandidates([CAND_INVOICE_COVERING]);
      renderPanel({ currency: 'EUR', paymentMethods: [PM_RECEIPT_DEFAULT] });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      expect(screen.getByTestId('recon-payment-method-dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('recon-payment-method-cancel'));

      expect(screen.queryByTestId('recon-payment-method-dialog')).not.toBeInTheDocument();
      expect(reconcileState.reconcile).not.toHaveBeenCalled();
    });

    it('reconciles immediately WITHOUT opening the modal when no payment methods are configured', async () => {
      setLines([LINE_POS]);
      setCandidates([CAND_INVOICE_COVERING]);
      const { props } = renderPanel({ currency: 'EUR', paymentMethods: [] });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));

      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      expect(screen.queryByTestId('recon-payment-method-dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
      const payload = reconcileState.reconcile.mock.calls[0][0];
      expect(payload.paymentMethodId).toBeUndefined();
      await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
    });

    it('reconciles immediately WITHOUT opening the modal when no configured method matches the line direction', async () => {
      setLines([LINE_POS]); // receipt (positive) line
      setCandidates([CAND_INVOICE_COVERING]);
      // Only a payout method is configured — none match a receipt direction.
      renderPanel({ currency: 'EUR', paymentMethods: [PM_PAYOUT_ONLY] });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));

      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      expect(screen.queryByTestId('recon-payment-method-dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
    });

    it('never opens the modal for a pure existing-transaction selection (not invoice mode), even with methods configured', async () => {
      setLines([LINE_POS]);
      setCandidates([CAND_TRANSACTION]);
      const { props } = renderPanel({ currency: 'EUR', paymentMethods: [PM_RECEIPT_DEFAULT, PM_RECEIPT_OTHER] });
      selectLine('LP');
      // LINE_POS is positive -> default source is already 'receipts' (transactions), not invoices.
      fireEvent.click(screen.getByTestId('recon-cand-check-TX1'));

      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      expect(screen.queryByTestId('recon-payment-method-dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(reconcileState.reconcile).toHaveBeenCalledTimes(1));
      const payload = reconcileState.reconcile.mock.calls[0][0];
      expect(payload.operationIds).toEqual(['TX1']);
      expect(payload.paymentMethodId).toBeUndefined();
      await waitFor(() => expect(props.onReconcileSuccess).toHaveBeenCalled());
    });
  });
});

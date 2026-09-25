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
// The stub also mirrors the real ChipSelect's typeahead: the query it holds is threaded into
// useLookup, so a test can exercise the hook's filtering branch (not just its unfiltered list).
// The initial query is '' — exactly what the previous stub passed — so every other test that only
// reads the options is unaffected.
vi.mock('@/components/forms/fields', async () => {
  const { useState } = await import('react');
  return {
    ChipSelect: ({ value, onChange, useLookup, testId }) => {
      const [query, setQuery] = useState('');
      const { results } = useLookup(query);
      return (
        <div>
          <span data-testid={`${testId}-value`}>{value?.id ?? ''}</span>
          <input
            data-testid={`${testId}-search`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
  };
});

const linesState = { lines: [], total: 0, counts: {}, loading: false, reload: vi.fn() };
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn().mockResolvedValue({ reconciliationId: 'R1' }), loading: false };
const removeState = { removeOperation: vi.fn().mockResolvedValue({ removed: true }), loading: false };
// "Posting the remainder to a G/L item" — closes a PARTIALLY reconciled line by writing its
// leftover amount off against an accounting concept.
const reconcileDifferenceState = {
  reconcileDifference: vi.fn().mockResolvedValue({ transactionId: 'TRX-DIFF' }), loading: false,
};

vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: () => linesState,
  useCandidateOperations: (accountId, lineId) => ({
    candidates: lineId ? [...candidatesState.candidates] : [],
    loading: candidatesState.loading,
  }),
  useReconcileGroup: () => reconcileState,
  useRemoveOperation: () => removeState,
  useReconcileDifference: () => reconcileDifferenceState,
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';
// Expected amounts go through the same canonical formatter MoneyAmount uses, so the assertions
// follow the instance-wide separators instead of hardcoding '29,03 €'.
import { formatCurrency } from '@/lib/formatCurrency';

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

    it('filters the offered methods as the user types, and restores them on a blank query', () => {
      setLines([LINE_POS]);
      setCandidates([CAND_INVOICE_COVERING]);
      renderPanel({
        currency: 'EUR', paymentMethods: [PM_RECEIPT_DEFAULT, PM_RECEIPT_OTHER, PM_PAYOUT_ONLY],
      });
      selectLine('LP');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-CI'));
      fireEvent.click(screen.getByTestId('recon-action-reconcile'));

      const search = screen.getByTestId('recon-payment-method-search');
      // Both direction-matching methods are offered up front ("Wire" pm-1, "Cash" pm-2).
      expect(screen.getByTestId('recon-payment-method-option-pm-1')).toBeInTheDocument();
      expect(screen.getByTestId('recon-payment-method-option-pm-2')).toBeInTheDocument();

      // Typing narrows the list by name, case-insensitively ("cAs" → "Cash").
      fireEvent.change(search, { target: { value: 'cAs' } });
      expect(screen.queryByTestId('recon-payment-method-option-pm-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('recon-payment-method-option-pm-2')).toBeInTheDocument();

      // A query matching nothing empties the list (and never reaches the excluded payout method).
      fireEvent.change(search, { target: { value: 'zzz' } });
      expect(screen.queryByTestId('recon-payment-method-option-pm-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-payment-method-option-pm-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recon-payment-method-option-pm-3')).not.toBeInTheDocument();

      // A whitespace-only query is treated as empty → the full direction-filtered list is back.
      fireEvent.change(search, { target: { value: '   ' } });
      expect(screen.getByTestId('recon-payment-method-option-pm-1')).toBeInTheDocument();
      expect(screen.getByTestId('recon-payment-method-option-pm-2')).toBeInTheDocument();
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

  // ── ETP-5450: dual-currency display of RECONCILED documents ─────────────────
  //
  // After reconciling, a foreign-currency document keeps showing its original amount plus the
  // final account-currency (EUR) equivalent, in the same EUR-on-top / original-below layout the
  // pending candidate rows use:
  //   - fully reconciled line → its linked documents are candidates (`linked: true`) carrying the
  //     pending-invoice keys (currency/amountBase/baseCurrency) — see CandidatesSupport.
  //   - PARTIAL line → the "conciliado" block's txns carry foreignAmount/foreignCurrency, while
  //     `amount` stays in EUR — see BankStatementsSupport.buildLineTxns.
  describe('ETP-5450 — reconciled documents keep their original currency', () => {
    const EUR_29 = () => formatCurrency('EUR', 29.03);
    const USD_42 = () => formatCurrency('USD', 42.67);

    const LINE_RECONCILED_FOREIGN = {
      id: 'LRF', date: '2026-05-20T00:00:00Z', description: 'USD wire reconciled',
      status: 'reconciled', reconcileStatus: 'RECONCILED', amount: 29.03,
      pendingAmount: 0, reconciledAmount: 29.03, reconciledPct: 100, matchGroupId: 'GF',
      txns: [{
        transactionId: 'TF', documentNo: 'PAY-USD', contact: 'ACME', amount: 29.03,
        foreignAmount: 42.67, foreignCurrency: 'USD', currency: 'EUR', foreignRate: 0.6803,
        autoCreated: false,
      }],
    };

    // Linked candidate as CandidatesSupport.buildLinkedTransactions emits it for a USD document.
    const RECON_CAND_FOREIGN = {
      id: 'TF', date: '2026-06-01T00:00:00Z', documentNo: 'PAY-USD', partnerName: 'ACME',
      amount: 42.67, pendingBalance: 42.67, status: 'reconciled', linked: true, suggested: false,
      currency: 'USD', currencyId: 'cur-usd', amountBase: 29.03, baseCurrency: 'EUR', rate: 0.6803,
    };

    const LINE_RECONCILED_SAME = {
      id: 'LRS', date: '2026-05-21T00:00:00Z', description: 'EUR wire reconciled',
      status: 'reconciled', reconcileStatus: 'RECONCILED', amount: 50,
      pendingAmount: 0, reconciledAmount: 50, reconciledPct: 100, matchGroupId: 'GS',
      txns: [{ transactionId: 'TS', documentNo: 'PAY-EUR', contact: 'Globex', amount: 50, autoCreated: false }],
    };

    const RECON_CAND_SAME = {
      id: 'TS', date: '2026-06-02T00:00:00Z', documentNo: 'PAY-EUR', partnerName: 'Globex',
      amount: 50, pendingBalance: 50, status: 'reconciled', linked: true, suggested: false,
    };

    /** A PARTIAL line whose matched documents are `txns` (conciliado block). */
    const partialLine = (txns, reconciledAmount = 29.03) => ({
      id: 'LPF', date: '2026-05-22T00:00:00Z', description: 'Partial USD',
      status: 'pending', reconcileStatus: 'PARTIAL', amount: 100,
      pendingAmount: Number((100 - reconciledAmount).toFixed(2)), reconciledAmount, reconciledPct: 29,
      matchGroupId: 'GP', remainderLineId: 'LPF-rem', partial: true, txns,
    });

    const TXN_FOREIGN = {
      transactionId: 'TXF', documentNo: 'PAY-USD', contact: 'ACME', amount: 29.03,
      foreignAmount: 42.67, foreignCurrency: 'USD', currency: 'EUR', foreignRate: 0.6803,
      autoCreated: true,
    };

    /**
     * The DualAmount stack under `baseEl` must be EUR (the base testid span) FIRST and the original
     * foreign amount right below it.
     */
    function expectEurOnTopForeignBelow(baseEl, eurText, foreignText) {
      expect(baseEl.textContent).toBe(eurText);
      expect(baseEl.parentElement.firstElementChild).toBe(baseEl);
      expect(baseEl.nextElementSibling).not.toBeNull();
      expect(baseEl.nextElementSibling.textContent).toBe(foreignText);
    }

    function expandMatchedBlock() {
      fireEvent.click(screen.getByTestId('recon-matched-toggle'));
    }

    describe('fully reconciled line (linked candidates)', () => {
      it('shows the currency badge and EUR-on-top / USD-below in both money cells', () => {
        setLines([LINE_RECONCILED_FOREIGN]);
        setCandidates([RECON_CAND_FOREIGN]);
        renderPanel({ currency: 'EUR' });
        selectLine('LRF');

        const row = screen.getByTestId('recon-cand-row-TF');
        expect(within(row).getByTestId('recon-cand-currency-badge')).toHaveTextContent('USD');

        // One stack in "Saldo pendiente" (MoneyCell) and one in the reconciled "Importe" cell
        // (DualAmount next to the unlink button).
        const bases = within(row).getAllByTestId('recon-cand-amount-base');
        expect(bases).toHaveLength(2);
        bases.forEach((base) => expectEurOnTopForeignBelow(base, EUR_29(), USD_42()));

        // The Importe stack is the one sharing a cell with the per-row unlink.
        const unlink = within(row).getByTestId('recon-unlink-TF');
        const importeCell = unlink.closest('td');
        expect(within(importeCell).getByTestId('recon-cand-amount-base')).toBe(bases[1]);
      });

      it('per-row unlink of a foreign reconciled document un-reconciles that transaction', async () => {
        setLines([LINE_RECONCILED_FOREIGN]);
        setCandidates([RECON_CAND_FOREIGN]);
        renderPanel({ currency: 'EUR' });
        selectLine('LRF');

        fireEvent.click(screen.getByTestId('recon-unlink-TF'));
        expect(screen.getByTestId('recon-remove-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('recon-remove-accept'));

        await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
        const payload = removeState.removeOperation.mock.calls[0][0];
        expect(payload.transactionIds).toEqual(['TF']);
        expect(payload.statementLineId).toBe('LRF');
      });

      it('keeps the sign on both lines of a foreign payment (negative amounts)', () => {
        setLines([{ ...LINE_RECONCILED_FOREIGN, amount: -29.03, reconciledAmount: -29.03 }]);
        setCandidates([{
          ...RECON_CAND_FOREIGN, amount: -42.67, pendingBalance: -42.67, amountBase: -29.03,
        }]);
        renderPanel({ currency: 'EUR' });
        selectLine('LRF');

        const row = screen.getByTestId('recon-cand-row-TF');
        within(row).getAllByTestId('recon-cand-amount-base').forEach((base) =>
          expectEurOnTopForeignBelow(base, `-${EUR_29()}`, `-${USD_42()}`));
      });

      it('renders a same-currency reconciled document as a single amount (no badge, no base line)', () => {
        setLines([LINE_RECONCILED_SAME]);
        setCandidates([RECON_CAND_SAME]);
        renderPanel({ currency: 'EUR' });
        selectLine('LRS');

        const row = screen.getByTestId('recon-cand-row-TS');
        expect(within(row).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
        expect(within(row).queryByTestId('recon-cand-amount-base')).not.toBeInTheDocument();
        const importeCell = within(row).getByTestId('recon-unlink-TS').closest('td');
        expect(importeCell.textContent).toContain(formatCurrency('EUR', 50));
        expect(within(row).getByTestId('recon-unlink-TS')).toBeInTheDocument();
      });

      it('"Desconciliar (N)" counts the foreign document and shows no selected/remaining totals', () => {
        // The reconciled-line action bar has no amount at all (only the count), so there is no EUR
        // total to assert — just that the foreign row is counted like any other.
        setLines([LINE_RECONCILED_FOREIGN]);
        setCandidates([RECON_CAND_FOREIGN]);
        renderPanel({ currency: 'EUR' });
        selectLine('LRF');

        const btn = screen.getByTestId('recon-action-reconcile');
        expect(btn).toHaveTextContent('financeReconcileActionRemoveCount');
        expect(btn).not.toBeDisabled();
        expect(candidateCheckbox('TF')).toBeChecked();
        expect(screen.queryByText('financeReconcileBarSelected')).not.toBeInTheDocument();
        expect(screen.queryByText('financeReconcileBarRemaining')).not.toBeInTheDocument();
      });
    });

    describe('PARTIAL line ("conciliado" block)', () => {
      it('shows the badge and EUR-on-top / USD-below for a foreign matched document; header stays EUR', () => {
        setLines([partialLine([TXN_FOREIGN])]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');

        // Header total is the reconciled amount, in the account currency.
        const toggle = screen.getByTestId('recon-matched-toggle');
        expect(toggle.textContent).toContain(EUR_29());
        expect(toggle.textContent).not.toContain(USD_42());

        expandMatchedBlock();
        const row = screen.getByTestId('recon-matched-row-TXF');
        expect(within(row).getByTestId('recon-cand-currency-badge')).toHaveTextContent('USD');
        expectEurOnTopForeignBelow(
          within(row).getByTestId('recon-matched-amount-base-TXF'), EUR_29(), USD_42());
        expect(within(row).getByTestId('recon-unlink-TXF')).toBeInTheDocument();
      });

      it('shows magnitudes only for a foreign matched payment (the block is unsigned)', () => {
        setLines([{
          ...partialLine([{ ...TXN_FOREIGN, amount: -29.03, foreignAmount: -42.67 }], -29.03),
          amount: -100, pendingAmount: -70.97,
        }]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');
        expandMatchedBlock();

        const row = screen.getByTestId('recon-matched-row-TXF');
        expectEurOnTopForeignBelow(
          within(row).getByTestId('recon-matched-amount-base-TXF'), EUR_29(), USD_42());
      });

      it('keeps the single EUR amount for a same-currency matched document', () => {
        setLines([partialLine([
          { transactionId: 'TXE', documentNo: 'PAY-EUR', contact: 'Globex', amount: 29.03, autoCreated: false },
        ])]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');
        expandMatchedBlock();

        const row = screen.getByTestId('recon-matched-row-TXE');
        expect(within(row).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
        expect(within(row).queryByTestId('recon-matched-amount-base-TXE')).not.toBeInTheDocument();
        expect(row.textContent).toContain(EUR_29());
        expect(row.textContent).not.toContain('USD');
      });

      it('treats a txn whose foreignCurrency equals the account currency as same-currency', () => {
        setLines([partialLine([
          { ...TXN_FOREIGN, transactionId: 'TXQ', foreignCurrency: 'EUR', foreignAmount: 29.03 },
        ])]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');
        expandMatchedBlock();

        const row = screen.getByTestId('recon-matched-row-TXQ');
        expect(within(row).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
        expect(within(row).queryByTestId('recon-matched-amount-base-TXQ')).not.toBeInTheDocument();
        expect(row.textContent).toContain(EUR_29());
      });

      it('treats a txn with a foreignCurrency but no foreignAmount as same-currency', () => {
        setLines([partialLine([
          { ...TXN_FOREIGN, transactionId: 'TXN', foreignAmount: undefined },
        ])]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');
        expandMatchedBlock();

        const row = screen.getByTestId('recon-matched-row-TXN');
        expect(within(row).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
        expect(within(row).queryByTestId('recon-matched-amount-base-TXN')).not.toBeInTheDocument();
        expect(row.textContent).toContain(EUR_29());
      });

      it('mixes a foreign and a same-currency matched document in the same block', () => {
        setLines([partialLine([
          TXN_FOREIGN,
          { transactionId: 'TXE', documentNo: 'PAY-EUR', contact: 'Globex', amount: 10, autoCreated: false },
        ], 39.03)]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');
        expandMatchedBlock();

        expect(within(screen.getByTestId('recon-matched-row-TXF'))
          .getByTestId('recon-matched-amount-base-TXF')).toBeInTheDocument();
        const sameRow = screen.getByTestId('recon-matched-row-TXE');
        expect(within(sameRow).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
        expect(sameRow.textContent).toContain(formatCurrency('EUR', 10));
        expect(screen.getAllByTestId('recon-cand-currency-badge')).toHaveLength(1);
      });
    });

    // ── QA edge cases (Sentinel) ──────────────────────────────────────────────
    describe('QA edge cases', () => {
      // A 1:N match group whose linked documents mix a USD receipt, a EUR bank fee (no foreign
      // data, as CandidatesSupport emits a payment-less movement) and a GBP payment.
      const RECON_CAND_FEE_EUR = {
        id: 'TE', date: '2026-06-03T00:00:00Z', documentNo: '', partnerName: '',
        amount: -2.5, pendingBalance: -2.5, status: 'reconciled', linked: true, suggested: false,
      };
      const RECON_CAND_GBP_PAYMENT = {
        id: 'TG', date: '2026-06-04T00:00:00Z', documentNo: 'PAY-GBP', partnerName: 'Wayne Corp',
        amount: -10, pendingBalance: -10, status: 'reconciled', linked: true, suggested: false,
        currency: 'GBP', currencyId: 'cur-gbp', amountBase: -12, baseCurrency: 'EUR', rate: 1.2,
      };
      const LINE_RECONCILED_MIXED = {
        ...LINE_RECONCILED_FOREIGN, id: 'LRM', amount: 14.53, reconciledAmount: 14.53,
      };

      it('1:N group mixing USD, EUR and GBP documents: badge + base line only on the foreign rows', () => {
        setLines([LINE_RECONCILED_MIXED]);
        setCandidates([RECON_CAND_FOREIGN, RECON_CAND_FEE_EUR, RECON_CAND_GBP_PAYMENT]);
        renderPanel({ currency: 'EUR' });
        selectLine('LRM');

        const usdRow = screen.getByTestId('recon-cand-row-TF');
        expect(within(usdRow).getByTestId('recon-cand-currency-badge')).toHaveTextContent('USD');
        within(usdRow).getAllByTestId('recon-cand-amount-base').forEach((base) =>
          expectEurOnTopForeignBelow(base, EUR_29(), USD_42()));

        const gbpRow = screen.getByTestId('recon-cand-row-TG');
        expect(within(gbpRow).getByTestId('recon-cand-currency-badge')).toHaveTextContent('GBP');
        within(gbpRow).getAllByTestId('recon-cand-amount-base').forEach((base) =>
          expectEurOnTopForeignBelow(base, `-${formatCurrency('EUR', 12)}`, `-${formatCurrency('GBP', 10)}`));

        const feeRow = screen.getByTestId('recon-cand-row-TE');
        expect(within(feeRow).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
        expect(within(feeRow).queryByTestId('recon-cand-amount-base')).not.toBeInTheDocument();
        const feeImporte = within(feeRow).getByTestId('recon-unlink-TE').closest('td');
        expect(feeImporte.textContent).toContain(formatCurrency('EUR', 2.5));

        expect(screen.getAllByTestId('recon-cand-currency-badge')).toHaveLength(2);
      });

      it('"Desconciliar (N)" on a mixed-currency group sends every transaction id, no amounts', async () => {
        setLines([LINE_RECONCILED_MIXED]);
        setCandidates([RECON_CAND_FOREIGN, RECON_CAND_FEE_EUR, RECON_CAND_GBP_PAYMENT]);
        renderPanel({ currency: 'EUR' });
        selectLine('LRM');

        // All linked documents are pre-checked on a reconciled line.
        ['TF', 'TE', 'TG'].forEach((id) => expect(candidateCheckbox(id)).toBeChecked());
        fireEvent.click(screen.getByTestId('recon-action-reconcile'));
        fireEvent.click(screen.getByTestId('recon-remove-accept'));

        await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
        const payload = removeState.removeOperation.mock.calls[0][0];
        expect([...payload.transactionIds].sort()).toEqual(['TE', 'TF', 'TG']);
        expect(payload.statementLineId).toBe('LRM');
        expect(Object.keys(payload).sort()).toEqual(
          ['financialAccountId', 'statementLineId', 'transactionIds']);
      });

      it('non-EUR account (USD) with a EUR document: nothing is EUR-hardcoded', () => {
        // Mirrors a real Core row: USD account, EUR payment of 500 at rate 2.5 -> 1250 USD.
        setLines([{
          ...LINE_RECONCILED_FOREIGN, id: 'LUSD', amount: 1250, reconciledAmount: 1250,
        }]);
        setCandidates([{
          ...RECON_CAND_FOREIGN, id: 'TU', amount: 500, pendingBalance: 500,
          currency: 'EUR', currencyId: 'cur-eur', amountBase: 1250, baseCurrency: 'USD', rate: 2.5,
        }]);
        renderPanel({ currency: 'USD' });
        selectLine('LUSD');

        const row = screen.getByTestId('recon-cand-row-TU');
        expect(within(row).getByTestId('recon-cand-currency-badge')).toHaveTextContent('EUR');
        const bases = within(row).getAllByTestId('recon-cand-amount-base');
        expect(bases).toHaveLength(2);
        bases.forEach((base) => expectEurOnTopForeignBelow(
          base, formatCurrency('USD', 1250), formatCurrency('EUR', 500)));
      });

      it('non-EUR account (USD): a same-currency USD document gets no badge', () => {
        setLines([{ ...LINE_RECONCILED_SAME, id: 'LUS', amount: 50, reconciledAmount: 50 }]);
        setCandidates([{ ...RECON_CAND_SAME, id: 'TUS' }]);
        renderPanel({ currency: 'USD' });
        selectLine('LUS');

        const row = screen.getByTestId('recon-cand-row-TUS');
        expect(within(row).queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
        expect(within(row).queryByTestId('recon-cand-amount-base')).not.toBeInTheDocument();
        expect(row.textContent).toContain(formatCurrency('USD', 50));
      });

      it('PARTIAL line on a USD account: a EUR matched document shows USD on top, EUR below', () => {
        setLines([partialLine([{
          ...TXN_FOREIGN, transactionId: 'TXU', amount: 29.03, currency: 'USD',
          foreignAmount: 11.61, foreignCurrency: 'EUR', foreignRate: 2.5,
        }])]);
        renderPanel({ currency: 'USD' });
        selectLine('LPF');

        const toggle = screen.getByTestId('recon-matched-toggle');
        expect(toggle.textContent).toContain(formatCurrency('USD', 29.03));
        expandMatchedBlock();
        const row = screen.getByTestId('recon-matched-row-TXU');
        expect(within(row).getByTestId('recon-cand-currency-badge')).toHaveTextContent('EUR');
        expectEurOnTopForeignBelow(
          within(row).getByTestId('recon-matched-amount-base-TXU'),
          formatCurrency('USD', 29.03), formatCurrency('EUR', 11.61));
      });

      it('PARTIAL line: two foreign documents of different currencies each keep their own badge', () => {
        setLines([partialLine([
          TXN_FOREIGN,
          {
            transactionId: 'TXG', documentNo: 'PAY-GBP', contact: 'Wayne Corp', amount: 12,
            foreignAmount: 10, foreignCurrency: 'GBP', currency: 'EUR', foreignRate: 1.2,
            autoCreated: true,
          },
        ], 41.03)]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');
        expandMatchedBlock();

        expect(within(screen.getByTestId('recon-matched-row-TXF'))
          .getByTestId('recon-cand-currency-badge')).toHaveTextContent('USD');
        const gbpRow = screen.getByTestId('recon-matched-row-TXG');
        expect(within(gbpRow).getByTestId('recon-cand-currency-badge')).toHaveTextContent('GBP');
        expectEurOnTopForeignBelow(
          within(gbpRow).getByTestId('recon-matched-amount-base-TXG'),
          formatCurrency('EUR', 12), formatCurrency('GBP', 10));
      });

      it('PARTIAL line: per-row unlink of a foreign matched document sends only its transaction id', async () => {
        setLines([partialLine([TXN_FOREIGN])]);
        renderPanel({ currency: 'EUR' });
        selectLine('LPF');
        expandMatchedBlock();

        fireEvent.click(screen.getByTestId('recon-unlink-TXF'));
        fireEvent.click(screen.getByTestId('recon-remove-accept'));

        await waitFor(() => expect(removeState.removeOperation).toHaveBeenCalledTimes(1));
        expect(removeState.removeOperation.mock.calls[0][0].transactionIds).toEqual(['TXF']);
      });
    });
  });
});

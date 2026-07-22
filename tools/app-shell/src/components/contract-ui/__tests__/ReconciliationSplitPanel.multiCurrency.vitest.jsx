// ETP-4502 — multi-currency (foreign-invoice) reconciliation behavior of
// ReconciliationSplitPanel. Focused companion to ReconciliationSplitPanel.vitest.jsx.
//
// Covers:
//   - CurrencyBadge shown ONLY for a candidate whose currency differs from the account's.
//   - Foreign candidate amounts render in the invoice currency (not the account currency).
//   - Selecting a foreign invoice is exclusive (collapses the selection to just that row).
//   - Foreign case: the action bar shows a derived-rate preview (invoice amount / bank amount /
//     rate) instead of the selected/remaining totals; rate = |line| / |invoice| (27/30 = 0.9).
//   - Same-currency invoice selection is unchanged (no badge, selected/remaining totals shown).

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

const linesState = { lines: [], total: 0, counts: {}, loading: false, reload: vi.fn() };
const candidatesState = { candidates: [], loading: false };
const reconcileState = { reconcile: vi.fn().mockResolvedValue({ reconciliationId: 'R1' }), loading: false };
const reactivateState = { reactivate: vi.fn().mockResolvedValue({ reactivated: true }), loading: false };

vi.mock('@/hooks/useReconciliation', () => ({
  usePendingStatementLines: () => linesState,
  useCandidateOperations: (accountId, lineId) => ({
    candidates: lineId ? [...candidatesState.candidates] : [],
    loading: candidatesState.loading,
  }),
  useReconcileGroup: () => reconcileState,
  useReactivateReconciliation: () => reactivateState,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';

// ── Fixtures ────────────────────────────────────────────────────────────────
// The panel's account currency is EUR (see renderPanel). A line of +27 EUR fully settled by a
// 30 USD invoice yields a derived rate of 27 / 30 = 0.9.

const LINE_EUR = {
  id: 'L27', date: '2026-05-10T00:00:00Z', description: 'Wire ACME',
  status: 'pending', amount: 27,
};

const CAND_FOREIGN = {
  id: 'C-USD', date: '2026-06-10T00:00:00Z', documentNo: 'INV-USD', partnerName: 'ACME',
  amount: 30, pendingBalance: 30, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-1', scheduleId: 'sch-1', currency: 'USD', currencyId: 'usd-id',
};

const CAND_SAME = {
  id: 'C-EUR', date: '2026-06-09T00:00:00Z', documentNo: 'INV-EUR', partnerName: 'Globex',
  amount: 20, pendingBalance: 20, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-2', scheduleId: 'sch-2', currency: 'EUR', currencyId: 'eur-id',
};

const CAND_NO_CURRENCY = {
  id: 'C-NONE', date: '2026-06-08T00:00:00Z', documentNo: 'INV-NONE', partnerName: 'Initech',
  amount: 15, pendingBalance: 15, status: 'pending', suggested: false,
  kind: 'invoice', invoiceId: 'inv-3', scheduleId: 'sch-3',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReconciliationSplitPanel — multi-currency (ETP-4502)', () => {
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
  });

  describe('CurrencyBadge', () => {
    it('renders the badge with the invoice currency for a foreign candidate', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN]);
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

    it('shows the badge only on the foreign row when foreign and local candidates coexist', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN, CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      expect(screen.getAllByTestId('recon-cand-currency-badge')).toHaveLength(1);
      const foreignRow = screen.getByTestId('recon-cand-row-C-USD');
      expect(foreignRow).toContainElement(screen.getByTestId('recon-cand-currency-badge'));
    });
  });

  describe('foreign candidate amounts', () => {
    it('renders the foreign candidate amounts in the invoice currency (not the account currency)', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      const row = screen.getByTestId('recon-cand-row-C-USD');
      // USD is rendered with a "$" marker and "30.00"; the account currency (€) must not appear.
      expect(row.textContent).toMatch(/\$/);
      expect(row.textContent).toContain('30.00');
      expect(row.textContent).not.toMatch(/€/);
    });

    it('renders a same-currency candidate amount in the account currency (€)', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');

      const row = screen.getByTestId('recon-cand-row-C-EUR');
      expect(row.textContent).toMatch(/€/);
    });
  });

  describe('single-foreign selection constraint', () => {
    it('collapses the selection to just the foreign invoice when it is added to a local selection', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_SAME, CAND_FOREIGN]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');
      switchToSalesInvoices();

      // Select the local invoice first, then the foreign one.
      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));
      expect(screen.getByTestId('recon-cand-check-C-EUR')).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));
      // The foreign selection is exclusive: the local invoice is dropped.
      expect(screen.getByTestId('recon-cand-check-C-USD')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('recon-cand-check-C-EUR')).toHaveAttribute('aria-checked', 'false');
    });

    it('drops the foreign invoice when a local invoice is selected afterwards', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN, CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');
      switchToSalesInvoices();

      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));
      expect(screen.getByTestId('recon-cand-check-C-USD')).toHaveAttribute('aria-checked', 'true');

      // Adding a local invoice while a foreign one is selected also collapses to just the new row.
      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));
      expect(screen.getByTestId('recon-cand-check-C-EUR')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('recon-cand-check-C-USD')).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('derived-rate preview in the action bar', () => {
    it('shows the derived-rate preview with the correct rate for a foreign invoice (27/30 = 0.9)', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));

      expect(screen.getByTestId('recon-derived-rate')).toHaveTextContent('0.9');
      // Preview rows replace the selected/remaining totals.
      expect(screen.getByText('financeReconcileBarInvoiceAmount')).toBeInTheDocument();
      expect(screen.getByText('financeReconcileBarBankAmount')).toBeInTheDocument();
      expect(screen.getByText('financeReconcileBarRate')).toBeInTheDocument();
      expect(screen.queryByText('financeReconcileBarSelected')).not.toBeInTheDocument();
      expect(screen.queryByText('financeReconcileBarRemaining')).not.toBeInTheDocument();
    });

    it('renders the invoice amount in the invoice currency and the bank amount in the account currency', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));

      // Invoice (settled) amount = 30 USD, bank (booked) amount = 27 EUR.
      const invoiceRow = screen.getByText('financeReconcileBarInvoiceAmount').closest('div');
      const bankRow = screen.getByText('financeReconcileBarBankAmount').closest('div');
      expect(invoiceRow.textContent).toContain('30');
      expect(invoiceRow.textContent).toMatch(/\$/);
      expect(bankRow.textContent).toContain('27');
      expect(bankRow.textContent).toMatch(/€/);
    });

    it('enables the reconcile action for a single foreign invoice on a positive line', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_FOREIGN]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-C-USD'));

      expect(screen.getByTestId('recon-action-reconcile')).not.toBeDisabled();
    });
  });

  describe('same-currency behavior unchanged', () => {
    it('shows the selected/remaining totals and no rate preview for a same-currency invoice', () => {
      setLines([LINE_EUR]);
      setCandidates([CAND_SAME]);
      renderPanel({ currency: 'EUR' });
      selectLine('L27');
      switchToSalesInvoices();
      fireEvent.click(screen.getByTestId('recon-cand-check-C-EUR'));

      expect(screen.queryByTestId('recon-derived-rate')).not.toBeInTheDocument();
      expect(screen.getByText('financeReconcileBarSelected')).toBeInTheDocument();
      expect(screen.getByText('financeReconcileBarRemaining')).toBeInTheDocument();
      expect(screen.queryByTestId('recon-cand-currency-badge')).not.toBeInTheDocument();
    });
  });
});

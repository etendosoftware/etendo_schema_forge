// Mocks must be hoisted before imports (Vitest hoisting)
// NOTE (ETP-4314): the mock now interpolates params (rather than swallowing them)
// so the delete-confirm message's fmtAmount() output actually reaches the DOM —
// needed for the thousands-grouping regression below. Calls made with no params
// still return the bare key, so every other `getByText('someKey')` exact-match
// assertion in this file is unaffected.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ChevronRight: () => <span data-testid="chevron" /> };
});

vi.mock('../NewPaymentEntryModal.jsx', () => ({
  default: ({ onClose, onSaved }) => (
    <div data-testid="new-payment-entry-modal" onClick={e => e.stopPropagation()}>
      <button onClick={onClose}>Close entry</button>
      <button onClick={() => onSaved({}, 'deposited')}>Save entry</button>
    </div>
  ),
}));

// Render createPortal children inline to test portal content
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApiFetch } from '@/auth/useApiFetch.js';
import InvoicePaymentHistoryModal from '../InvoicePaymentHistoryModal.jsx';

const INVOICE_DATA = {
  documentNo: 'INV-001',
  'businessPartner$_identifier': 'Test Partner',
  grandTotalAmount: '1000.00',
  outstandingAmount: '500.00',
  documentStatus: 'CO',
  'currency$_identifier': 'EUR',
};

function makeApiFetch(payments = []) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ response: { data: payments } }),
  });
}

/**
 * Builds an apiFetch mock that distinguishes the three endpoints the modal
 * hits (invoicePayments, paymentPlan, deletePayment) so delete-draft flows
 * can be exercised end to end without racing on a single shared counter.
 */
function makeDeleteFlowFetch({ initialPayments, refreshedPayments, deleteResult }) {
  let invoicePaymentsCalls = 0;
  return vi.fn((url) => {
    if (url.includes('/paymentPlan')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    }
    if (url.includes('action/deletePayment')) {
      return Promise.resolve(deleteResult);
    }
    const data = invoicePaymentsCalls === 0 ? initialPayments : (refreshedPayments ?? initialPayments);
    invoicePaymentsCalls += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
  });
}

describe('InvoicePaymentHistoryModal', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = makeApiFetch();
    useApiFetch.mockReturnValue(mockFetch);
    mockNavigate.mockClear();
  });

  it('shows the panel with the invoice partner and docNo', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Test Partner/)).toBeInTheDocument();
    expect(screen.getByText(/INV-001/)).toBeInTheDocument();
  });

  it('shows empty state when fetch returns no payments', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
  });

  it('renders payment rows when fetch returns payments', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '500', status: 'RPR' },
      { id: 'p2', documentNo: 'PAY-002', paymentDate: '2026-01-05', amount: '250', status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('InvoicePaymentHistoryModal__row')).toHaveLength(2),
    );
    expect(screen.getByText('PAY-001')).toBeInTheDocument();
    expect(screen.getByText('PAY-002')).toBeInTheDocument();
  });

  it('shows deposited tag for status RPR', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '500', status: 'RPR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('PaymentStateTag__deposited')).toBeInTheDocument(),
    );
  });

  it('never renders a "vía banco" badge, regardless of viaPis', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '500', status: 'RPR', viaPis: true },
      { id: 'p2', documentNo: 'PAY-002', paymentDate: '2026-01-05', amount: '250', status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('InvoicePaymentHistoryModal__row')).toHaveLength(2),
    );
    expect(screen.queryByTestId('InvoicePaymentHistoryModal__viaPis')).toBeNull();
    expect(screen.queryByText('cpPisViaLabel')).toBeNull();
  });

  it('shows draft tag for status DR', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '500', status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('PaymentStateTag__draft')).toBeInTheDocument(),
    );
  });

  it('shows add-btn when outstandingAmt > 0 and documentStatus is CO', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('InvoicePaymentHistoryModal__add-btn')).toBeInTheDocument();
  });

  it('hides add-btn when outstandingAmt is 0', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, outstandingAmount: '0.00' }}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('InvoicePaymentHistoryModal__add-btn')).toBeNull();
  });

  it('hides add-btn when document is not completed', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, documentStatus: 'DR' }}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('InvoicePaymentHistoryModal__add-btn')).toBeNull();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close × button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens NewPaymentEntryModal when add-btn is clicked', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__add-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__add-btn'));
    expect(screen.getByTestId('new-payment-entry-modal')).toBeInTheDocument();
  });

  it('formats amounts > 999 with a thousands separator in payment rows', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-999', paymentDate: '2026-03-01', amount: '1500.50', status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="purchase-invoice"
        apiBaseUrl="http://host/sws/neo/purchase-invoice"
        onClose={vi.fn()}
      />,
    );
    // es-ES narrowSymbol formatting via the shared formatCurrency util: EUR renders
    // the symbol after the amount, comma decimal, period thousands → "1.500,50 €".
    await waitFor(() =>
      expect(screen.getByText(/1\.500,50/)).toBeInTheDocument(),
    );
  });

  it('formats the grand total header with a thousands separator', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, grandTotalAmount: '2345.00' }}
        specName="purchase-invoice"
        apiBaseUrl="http://host/sws/neo/purchase-invoice"
        onClose={vi.fn()}
      />,
    );
    // EUR grand total → "2.345,00 €" (es-ES digits, comma decimal, symbol-after).
    expect(screen.getByText(/2\.345,00/)).toBeInTheDocument();
  });

  it('calls onPaymentAdded when payment is saved and modal is closed', async () => {
    const onClose = vi.fn();
    const onPaymentAdded = vi.fn();
    // Return payments after re-fetch
    useApiFetch.mockReturnValue(makeApiFetch([]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={onClose}
        onPaymentAdded={onPaymentAdded}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__add-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__add-btn'));
    // Save a payment from the entry modal
    fireEvent.click(screen.getByText('Save entry'));
    // Now close the history modal
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__cerrar-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__cerrar-btn'));
    expect(onPaymentAdded).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows an em-dash for a payment row whose paymentDate does not match the YYYY-MM-DD format and is unparseable (fmtDate fallback branches)', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: 'not-a-date', amount: '500', status: 'RPR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    let row;
    await waitFor(() => {
      row = screen.getByTestId('InvoicePaymentHistoryModal__row');
      expect(row).toBeInTheDocument();
    });
    const dateCell = row.children[1];
    expect(dateCell).toHaveTextContent('—');
  });

  it('shows an em-dash for a payment row with no paymentDate', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', amount: '500', status: 'RPR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    let row;
    await waitFor(() => {
      row = screen.getByTestId('InvoicePaymentHistoryModal__row');
      expect(row).toBeInTheDocument();
    });
    // The date cell is the row's 2nd grid child (Nº documento, Fecha, ...).
    const dateCell = row.children[1];
    expect(dateCell).toHaveTextContent('—');
  });

  it('calls onClose and navigates to /payment-in/{id} when a row is clicked (sales-invoice)', async () => {
    const onClose = vi.fn();
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'pay-77', documentNo: 'PAY-077', paymentDate: '2026-01-01', amount: '500', status: 'RPR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={onClose}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__row')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__row'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/payment-in/pay-77');
  });

  it('calls onClose and navigates to /payment-out/{id} when a row is clicked (purchase-invoice)', async () => {
    const onClose = vi.fn();
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'pay-88', documentNo: 'PAY-088', paymentDate: '2026-01-01', amount: '500', status: 'RPR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, documentStatus: 'DR' }}
        specName="purchase-invoice"
        apiBaseUrl="http://host/sws/neo/purchase-invoice"
        onClose={onClose}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__row')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__row'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/payment-out/pay-88');
  });

  it('does not call apiFetch and resolves to no payments when invoiceId is falsy', async () => {
    const localFetch = makeApiFetch([{ id: 'should-not-load' }]);
    useApiFetch.mockReturnValue(localFetch);
    render(
      <InvoicePaymentHistoryModal
        invoiceId={null}
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
    expect(localFetch).not.toHaveBeenCalled();
  });

  it('does not call apiFetch and resolves to no payments when apiBaseUrl is falsy', async () => {
    const localFetch = makeApiFetch([{ id: 'should-not-load' }]);
    useApiFetch.mockReturnValue(localFetch);
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl=""
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
    expect(localFetch).not.toHaveBeenCalled();
  });

  it('shows an em-dash for the business partner widget when businessPartner is missing', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, 'businessPartner$_identifier': undefined, businessPartner: undefined }}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows deposited tag when processed=true even without a whitelisted status', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '500', status: 'XX', processed: true },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('PaymentStateTag__deposited')).toBeInTheDocument(),
    );
  });

  it('opens NewPaymentEntryModal with dir "out" for purchase-invoice', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="purchase-invoice"
        apiBaseUrl="http://host/sws/neo/purchase-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__add-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__add-btn'));
    expect(screen.getByTestId('new-payment-entry-modal')).toBeInTheDocument();
  });

  it('recomputes "Saldo pendiente" from the payment plan after a payment is registered (regression: stale outstanding amount)', async () => {
    const onClose = vi.fn();
    // First fetchData() call (initial mount): 3 existing payments + a pending
    // installment of 136.10 — matches the bug report's "3 cobros registrados"
    // / 136,10 € starting point.
    const initialPayments = [
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '300', status: 'RPR' },
      { id: 'p2', documentNo: 'PAY-002', paymentDate: '2026-01-02', amount: '300', status: 'RPR' },
      { id: 'p3', documentNo: 'PAY-003', paymentDate: '2026-01-03', amount: '263.90', status: 'RPR' },
    ];
    const initialInstallments = [
      { id: 'inst-1', outstandingAmount: '136.10' },
    ];
    // Second fetchData() call (after handlePaymentRegistered → fetchData re-run):
    // 4 payments + a pending installment of 116.10 — the correct post-payment state.
    const refreshedPayments = [
      ...initialPayments,
      { id: 'p4', documentNo: 'PAY-004', paymentDate: '2026-01-10', amount: '20', status: 'RPR' },
    ];
    const refreshedInstallments = [
      { id: 'inst-1', outstandingAmount: '116.10' },
    ];

    // Independent call counters per endpoint — paymentPlan and invoicePayments
    // are fired together inside the same Promise.all() on every fetchData()
    // round, so each needs its own "which round is this" tracking rather than
    // a single shared counter (which would race depending on resolution order).
    let paymentPlanCalls = 0;
    let invoicePaymentsCalls = 0;
    const mockedFetch = vi.fn((url) => {
      if (url.includes('/paymentPlan')) {
        const data = paymentPlanCalls === 0 ? initialInstallments : refreshedInstallments;
        paymentPlanCalls += 1;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      const data = invoicePaymentsCalls === 0 ? initialPayments : refreshedPayments;
      invoicePaymentsCalls += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
    });
    useApiFetch.mockReturnValue(mockedFetch);

    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, outstandingAmount: '136.10' }}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={onClose}
      />,
    );

    // Initial state: 3 cobros registrados, Saldo pendiente = 136,10 € (es-ES
    // narrowSymbol format from the shared formatCurrency util).
    await waitFor(() =>
      expect(screen.getAllByTestId('InvoicePaymentHistoryModal__row')).toHaveLength(3),
    );
    expect(screen.getByText(/136,10/)).toBeInTheDocument();
    expect(screen.getByText((_, el) => el.tagName === 'SPAN' && /3\s*cobrosRegistrados/.test(el.textContent))).toBeInTheDocument();

    // Simulate registering a payment via the nested NewPaymentEntryModal.
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__add-btn'));
    expect(screen.getByTestId('new-payment-entry-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Save entry'));

    // After handlePaymentRegistered → fetchData() re-run: 4 cobros registrados,
    // and — the actual regression — Saldo pendiente must update to 116,10 €,
    // not remain stuck at the stale 136,10 € snapshot.
    await waitFor(() =>
      expect(screen.getAllByTestId('InvoicePaymentHistoryModal__row')).toHaveLength(4),
    );
    await waitFor(() => expect(screen.getByText(/116,10/)).toBeInTheDocument());
    expect(screen.queryByText(/136,10/)).toBeNull();
    expect(screen.getByText((_, el) => el.tagName === 'SPAN' && /4\s*cobrosRegistrados/.test(el.textContent))).toBeInTheDocument();

    // The nested entry modal closed itself but the history modal is still mounted
    // (no unmount/remount, no navigation) — the update came purely from fetchData().
    expect(screen.queryByTestId('new-payment-entry-modal')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('InvoicePaymentHistoryModal__panel')).toBeInTheDocument();
  });

  it('unmounts the nested NewPaymentEntryModal on its own close while the history modal stays open', async () => {
    const onClose = vi.fn();
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={onClose}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__add-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__add-btn'));
    expect(screen.getByTestId('new-payment-entry-modal')).toBeInTheDocument();

    // Close the nested modal (its own close button, not the history modal's).
    fireEvent.click(screen.getByText('Close entry'));

    expect(screen.queryByTestId('new-payment-entry-modal')).toBeNull();
    // The history modal itself must remain open — its onClose was not invoked.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('InvoicePaymentHistoryModal__panel')).toBeInTheDocument();
  });

  it('opens the edit modal (not navigate) when clicking a draft/non-processed row', async () => {
    const onClose = vi.fn();
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '100', status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={onClose}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__row')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__row'));
    expect(screen.getByTestId('new-payment-entry-modal')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders the delete-confirm message with a numeric (non-string) payment.amount (fmtAmount numeric branch)', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: 500, status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    expect(screen.getByText(/^cpDeleteDraftConfirm/)).toBeInTheDocument();
  });

  // ETP-4314 regression: fmtAmount() in the delete-confirm dialog used a hand-rolled
  // Intl.NumberFormat('es-ES', ...) call missing `useGrouping: true`, so a draft
  // payment >= 1000 rendered its confirm-dialog amount WITHOUT the thousands
  // separator (e.g. "1500,75 €" instead of "1.500,75 €"). Now delegates to the
  // shared formatCurrency(), which sets useGrouping explicitly.
  it('groups thousands in the delete-confirm dialog amount for a draft payment >= 1000', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '1500.75', status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    const message = screen.getByText(/^cpDeleteDraftConfirm/);
    expect(message).toHaveTextContent(/1\.500,75/);
    expect(message).toHaveTextContent('€');
  });

  it('renders the purchase-invoice delete-confirm title and falls back to payment.id/status when documentNo/status/amount are missing', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      // No documentNo, no status, no amount — exercises the id/status/amount fallbacks
      // in the row and in the delete-confirm dialog for a purchase (non-sales) flow.
      { id: 'p-no-doc', paymentDate: '2026-01-01' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, 'currency$_identifier': undefined }}
        specName="purchase-invoice"
        apiBaseUrl="http://host/sws/neo/purchase-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    expect(screen.getByText('p-no-doc')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    expect(screen.getByText(/^cpDeleteDraftConfirm/)).toBeInTheDocument();
  });

  it('falls back to defaults when invoiceData lacks currency, grandTotalAmount, documentNo, and outstandingAmount', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ documentStatus: 'CO' }}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
    // No docNo badge renders when documentNo is missing.
    expect(screen.queryByText('INV-001')).toBeNull();
  });

  it('handles a rejecting res.json() when confirming a delete (falls back to the generic failure message)', async () => {
    const draftPayments = [
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '100', status: 'DR' },
    ];
    const fetchMock = makeDeleteFlowFetch({
      initialPayments: draftPayments,
      deleteResult: { ok: false, json: () => Promise.reject(new Error('bad json')) },
    });
    useApiFetch.mockReturnValue(fetchMock);
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-btn'));
    await waitFor(() =>
      expect(screen.getByText('cpDeleteDraftFailed')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeInTheDocument();
  });

  it('renders the delete-confirm message without crashing when payment.amount is a string (fmtAmount string branch)', async () => {
    useApiFetch.mockReturnValue(makeApiFetch([
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '499.99', status: 'DR' },
    ]));
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    // The mocked ui() returns the key literally; reaching this assertion without
    // throwing proves fmtAmount(payment.amount, currency) handled the string amount.
    expect(screen.getByText(/^cpDeleteDraftConfirm/)).toBeInTheDocument();
    expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeInTheDocument();
  });

  it('cancels the delete-draft confirmation without calling the delete backend', async () => {
    const draftPayments = [
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '100', status: 'DR' },
    ];
    const fetchMock = makeDeleteFlowFetch({
      initialPayments: draftPayments,
      deleteResult: { ok: true, json: () => Promise.resolve({ response: {} }) },
    });
    useApiFetch.mockReturnValue(fetchMock);
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-cancel-btn'));
    expect(screen.queryByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('action/deletePayment'),
      expect.anything(),
    );
  });

  it('confirms delete-draft, calls the deletePayment action, and refreshes the list', async () => {
    const draftPayments = [
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '100', status: 'DR' },
    ];
    const fetchMock = makeDeleteFlowFetch({
      initialPayments: draftPayments,
      refreshedPayments: [],
      deleteResult: { ok: true, json: () => Promise.resolve({ response: {} }) },
    });
    useApiFetch.mockReturnValue(fetchMock);
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-btn'));
    await waitFor(() =>
      expect(screen.queryByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/sales-invoice/header/42/action/deletePayment',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ paymentId: 'p1' }) }),
    );
    // fetchData() ran again after a successful delete — the list refreshes to empty.
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__empty')).toBeInTheDocument(),
    );
  });

  it('shows a delete error message and keeps the confirmation dialog open on failure', async () => {
    const draftPayments = [
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '100', status: 'DR' },
    ];
    const fetchMock = makeDeleteFlowFetch({
      initialPayments: draftPayments,
      deleteResult: {
        ok: false,
        json: () => Promise.resolve({ response: { error: { message: 'No se pudo eliminar' } } }),
      },
    });
    useApiFetch.mockReturnValue(fetchMock);
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-btn'));
    await waitFor(() =>
      expect(screen.getByText('No se pudo eliminar')).toBeInTheDocument(),
    );
    // The dialog stays open on failure so the user can retry or cancel.
    expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-cancel-btn'));
    expect(screen.queryByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeNull();
  });

  it('disables the confirm/cancel buttons and shows a loading label while deleting', async () => {
    const draftPayments = [
      { id: 'p1', documentNo: 'PAY-001', paymentDate: '2026-01-01', amount: '100', status: 'DR' },
    ];
    let resolveDelete;
    const deletePromise = new Promise((resolve) => { resolveDelete = resolve; });
    let invoicePaymentsCalls = 0;
    const fetchMock = vi.fn((url) => {
      if (url.includes('/paymentPlan')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      if (url.includes('action/deletePayment')) {
        return deletePromise;
      }
      const data = invoicePaymentsCalls === 0 ? draftPayments : [];
      invoicePaymentsCalls += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
    });
    useApiFetch.mockReturnValue(fetchMock);
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={INVOICE_DATA}
        specName="sales-invoice"
        apiBaseUrl="http://host/sws/neo/sales-invoice"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-btn'));
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-btn'));

    // While the delete request is in flight, both buttons are disabled and the
    // confirm button shows the loading label instead of "cpDeleteDraft".
    const confirmBtn = screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-btn');
    const cancelBtn = screen.getByTestId('InvoicePaymentHistoryModal__delete-cancel-btn');
    await waitFor(() => expect(confirmBtn).toBeDisabled());
    expect(cancelBtn).toBeDisabled();
    expect(confirmBtn).toHaveTextContent('loading');

    // Clicking the backdrop while deleting is in flight must be a no-op — the
    // `if (isDeleting) return;` guard in handleDeleteCancel keeps the dialog open
    // (unlike the cancel button, the backdrop itself carries no `disabled` state).
    fireEvent.click(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-backdrop'));
    expect(screen.getByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeInTheDocument();

    // Resolve the pending request and let the dialog close.
    resolveDelete({ ok: true, json: () => Promise.resolve({ response: {} }) });
    await waitFor(() =>
      expect(screen.queryByTestId('InvoicePaymentHistoryModal__delete-confirm-panel')).toBeNull(),
    );
  });
});

// Mocks must be hoisted before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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

describe('InvoicePaymentHistoryModal', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = makeApiFetch();
    useApiFetch.mockReturnValue(mockFetch);
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

  it('formats amounts > 999 with thousand dots in payment rows', async () => {
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
    await waitFor(() =>
      expect(screen.getByText(/1\.500,50/)).toBeInTheDocument(),
    );
  });

  it('formats the grand total header with thousand dots', async () => {
    render(
      <InvoicePaymentHistoryModal
        invoiceId="42"
        invoiceData={{ ...INVOICE_DATA, grandTotalAmount: '2345.00' }}
        specName="purchase-invoice"
        apiBaseUrl="http://host/sws/neo/purchase-invoice"
        onClose={vi.fn()}
      />,
    );
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
});

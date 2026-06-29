import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (_curr, val) => `$${Number(val || 0).toFixed(2)}`,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div data-testid="select">{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }) => (
    <input type="date" value={value || ''} onChange={(e) => onChange?.(e.target.value)} data-testid="date-field" />
  ),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (baseUrl = '') => (path, options) => fetch(`${baseUrl}${path}`, options),
}));

// Step 2 modal is exercised by its own spec; stub it so step-1 tests stay focused.
vi.mock('../NewPaymentEntryModal.jsx', () => ({
  default: () => <div data-testid="new-payment-modal">new-payment</div>,
}));

// --- Import under test ----------------------------------------------------

import InvoicePaymentModal from '../InvoicePaymentModal.jsx';

// --- Helpers --------------------------------------------------------------

const sampleInvoice = {
  id: 'inv-1',
  documentNo: 'INV-001',
  documentStatus: 'CO',
  grandTotalAmount: 1000,
  'currency$_identifier': 'USD',
  'businessPartner$_identifier': 'NCA Group',
  businessPartner: 'bp-1',
};

const sampleInstallments = [
  { id: 'inst-1', finPaymentScheduleID: 'sched-1', amount: '1000', paidAmount: '0', outstandingAmount: '1000', dueDate: '2024-06-15' },
];

function mockFetch({ payments = [], installments = sampleInstallments } = {}) {
  global.fetch = vi.fn((url) => {
    if (url.includes('paymentPlan')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: installments } }) });
    }
    if (url.includes('invoicePayments')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: payments } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

function renderModal(overrides = {}) {
  const defaults = {
    invoiceId: 'inv-1',
    invoiceData: sampleInvoice,
    specName: 'sales-invoice',
    apiBaseUrl: '/api/sales-invoice',
    onClose: vi.fn(),
  };
  return { ...render(<InvoicePaymentModal {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// --- Tests ----------------------------------------------------------------

describe('InvoicePaymentModal (step 1 — Cobros/Pagos de la factura)', () => {
  beforeEach(() => mockFetch());
  afterEach(() => vi.restoreAllMocks());

  it('renders the collections title for sales invoices', () => {
    renderModal();
    expect(screen.getByText('cpCollectionsOfInvoice')).toBeInTheDocument();
  });

  it('renders the payments title for purchase invoices', () => {
    renderModal({ specName: 'purchase-invoice' });
    expect(screen.getByText('cpPaymentsOfInvoice')).toBeInTheDocument();
  });

  it('shows total and pending-balance stats', () => {
    renderModal();
    expect(screen.getByText('cpTotalAmount')).toBeInTheDocument();
    expect(screen.getByText('pendingBalanceLabel')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderModal();
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows the empty state when there are no movements', async () => {
    renderModal();
    expect(await screen.findByText('cpNoCollectionsYet')).toBeInTheDocument();
  });

  it('shows the registered-count footer', async () => {
    renderModal();
    expect(await screen.findByText('cpCollectionsRegisteredCount')).toBeInTheDocument();
  });

  it('shows the "+ Añadir cobro" button for a completed invoice with outstanding balance', async () => {
    renderModal();
    expect(await screen.findByText('cpAddCollection')).toBeInTheDocument();
  });

  it('uses "+ Añadir pago" label for purchase invoices', async () => {
    renderModal({ specName: 'purchase-invoice' });
    expect(await screen.findByText('cpAddPayment')).toBeInTheDocument();
  });

  it('hides the add button when the invoice is fully paid', async () => {
    mockFetch({ installments: [{ ...sampleInstallments[0], paidAmount: '1000', outstandingAmount: '0' }] });
    renderModal();
    await screen.findByText('cpCollectionsRegisteredCount');
    expect(screen.queryByText('cpAddCollection')).not.toBeInTheDocument();
  });

  it('opens the step-2 modal when the add button is clicked', async () => {
    renderModal();
    const addBtn = await screen.findByText('cpAddCollection');
    fireEvent.click(addBtn);
    expect(await screen.findByTestId('new-payment-modal')).toBeInTheDocument();
  });

  it('calls onClose when the Cerrar button is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('close'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const { props, container } = renderModal();
    fireEvent.click(container.firstChild);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('accepts an optional onPaymentAdded prop without error', () => {
    expect(() => renderModal({ onPaymentAdded: vi.fn() })).not.toThrow();
  });

  it('renders registered movements with a deposited badge', async () => {
    mockFetch({ payments: [{ id: 'p1', documentNo: 'PAY-1', amount: '1000', paymentDate: '2024-06-20', processed: true }] });
    renderModal();
    await waitFor(() => expect(screen.getByText('cpStatusDeposited')).toBeInTheDocument());
  });
});

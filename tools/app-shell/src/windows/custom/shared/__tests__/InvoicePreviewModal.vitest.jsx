import { render, screen, fireEvent, act } from '@testing-library/react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (val) => val || '-',
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => Number(val || 0).toFixed(2),
}));

vi.mock('@/lib/invoiceDueDate', () => ({
  getLatestInstallmentDueDate: () => '2024-06-15',
}));

vi.mock('@/lib/statusBadge.js', () => ({
  getStatusBadgeProps: () => ({ variant: 'default' }),
  statusLabel: (status) => status || 'Unknown',
}));

vi.mock('@/windows/custom/shared/InvoicePaymentModal.jsx', () => ({
  default: () => <div data-testid="payment-modal">Payment Modal</div>,
}));

vi.mock('@/windows/custom/shared/useInvoicePdf.js', () => ({
  useInvoicePdf: () => ({ pdfUrl: null, loading: false, error: null }),
}));

vi.mock('@/windows/custom/shared/PdfViewer.jsx', () => ({
  default: ({ url }) => <div data-testid="pdf-viewer">{url}</div>,
}));

vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
  default: () => <div data-testid="send-modal">Send Modal</div>,
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: () => ({ profile: 'tbai' }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG_1' } }),
}));

vi.mock('@/components/ui/badge.jsx', () => ({
  Badge: ({ children, ...props }) => <span data-testid="badge" {...props}>{children}</span>,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  Upload: () => <span />,
  Edit2: () => <span />,
  FileText: () => <span />,
  Image: () => <span />,
  Plus: () => <span />,
  Check: () => <span />,
  Trash2: () => <span />,
  Loader2: () => <span />,
  AlertCircle: () => <span />,
  Mail: () => <span />,
  Download: () => <span />,
  Ban: () => <span />,
  Wallet: () => <span />,
  MoreVertical: () => <span />,
}));

// --- Import under test ----------------------------------------------------

import InvoicePreviewModal from '../InvoicePreviewModal.jsx';

// --- Helpers --------------------------------------------------------------

const sampleInvoice = {
  id: 'inv-1',
  documentNo: 'INV-001',
  documentStatus: 'CO',
  grandTotalAmount: 1500,
  'businessPartner$_identifier': 'Acme Corp',
  businessPartner: 'bp-1',
  invoiceDate: '2024-05-01',
  'currency$_identifier': 'USD',
};

function renderPreview(overrides = {}) {
  const defaults = {
    invoice: sampleInvoice,
    token: 'tok',
    apiBaseUrl: '/api/purchase-invoice',
    windowName: 'purchase-invoice',
    specName: 'purchase-invoice',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return { ...render(<InvoicePreviewModal {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// --- Tests ----------------------------------------------------------------

describe('InvoicePreviewModal', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      }),
    );
    // Mock requestAnimationFrame for animation state
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders null when invoice is null', () => {
    const { container } = render(
      <InvoicePreviewModal
        invoice={null}
        token="tok"
        apiBaseUrl="/api"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal with invoice document number', () => {
    renderPreview();
    expect(screen.getByText(/INV-001/)).toBeInTheDocument();
  });

  it('shows the client name', () => {
    renderPreview();
    const matches = screen.getAllByText(/Acme Corp/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders tab switcher with General, Messages, History', () => {
    renderPreview();
    expect(screen.getByText('invoicePreviewGeneral')).toBeInTheDocument();
    expect(screen.getByText('invoicePreviewMessages')).toBeInTheDocument();
    expect(screen.getByText('invoicePreviewHistory')).toBeInTheDocument();
  });

  it('shows the total section', () => {
    renderPreview();
    expect(screen.getByText('invoicePreviewTotal')).toBeInTheDocument();
  });

  it('renders action buttons (send, payment, edit)', () => {
    renderPreview();
    expect(screen.getAllByText('invoicePreviewSend').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('invoicePreviewAddPayment').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('invoicePreviewEdit')).toBeInTheDocument();
  });

  it('shows Send to SIF in the preview actions when the fiscal profile enables it', () => {
    renderPreview();
    expect(screen.getByText('sendToSif')).toBeInTheDocument();
  });

  it('opens the SIF confirmation modal from the preview action', () => {
    renderPreview();
    fireEvent.click(screen.getByText('sendToSif'));
    expect(screen.getByText('sendToSifTitle')).toBeInTheDocument();
    expect(screen.getByText('sendToSifBodyTbai')).toBeInTheDocument();
  });

  it('keeps current invoice data when preview refetch returns a non-record payload', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    global.fetch = vi
      .fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      }))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ foo: 'bar' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      });

    renderPreview();
    fireEvent.click(screen.getByText('sendToSif'));
    fireEvent.click(screen.getByText('sendToSifConfirm'));

    await screen.findByRole('button', { name: 'close' });

    expect(screen.getByText(/Purchase Invoice INV-001/i)).toBeInTheDocument();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'purchase-invoice:invoice-updated' }));
  });

  it('shows empty messages panel when messages tab is clicked', () => {
    renderPreview();
    fireEvent.click(screen.getByText('invoicePreviewMessages'));
    expect(screen.getByText('invoicePreviewNoMessagesYet')).toBeInTheDocument();
  });

  it('shows empty history panel when history tab is clicked', () => {
    renderPreview();
    fireEvent.click(screen.getByText('invoicePreviewHistory'));
    expect(screen.getByText('invoicePreviewNoActivityRecorded')).toBeInTheDocument();
  });

  it('renders drop zone for purchase invoice', () => {
    renderPreview({ specName: 'purchase-invoice' });
    expect(screen.getByText('invoicePreviewUploadYourDocument')).toBeInTheDocument();
  });
});

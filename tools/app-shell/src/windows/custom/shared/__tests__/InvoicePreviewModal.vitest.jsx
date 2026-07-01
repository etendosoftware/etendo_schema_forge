import { render, screen, fireEvent, act } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

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

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/windows/custom/shared/InvoicePaymentModal.jsx', () => ({
  default: (props) => (
    <div
      data-testid="payment-modal"
      data-has-token={Object.prototype.hasOwnProperty.call(props, 'token') ? 'true' : 'false'}
    >
      Payment Modal
    </div>
  ),
}));

vi.mock('@/windows/custom/shared/NewPaymentEntryModal.jsx', () => ({
  default: (props) => (
    <div
      data-testid="new-payment-entry-modal"
      data-has-token={Object.prototype.hasOwnProperty.call(props, 'token') ? 'true' : 'false'}
    >
      New Payment Entry Modal
    </div>
  ),
}));

vi.mock('@/windows/custom/shared/useInvoicePdf.js', () => ({
  useInvoicePdf: () => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null }),
}));

vi.mock('@/windows/custom/shared/usePreviewAttachment.js', () => ({
  usePreviewAttachment: () => ({
    storedFile: null,
    isBusy: false,
    storeFailed: false,
    storeFile: vi.fn(),
    storeBlob: vi.fn(),
    storeUrl: vi.fn(),
    deleteFile: vi.fn(),
  }),
  ACCEPTED_TYPES: { 'application/pdf': 'pdf', 'image/png': 'image' },
  ACCEPT_ATTR: 'application/pdf,image/png',
}));

vi.mock('@/windows/custom/shared/PdfViewer.jsx', () => ({
  default: ({ url }) => <div data-testid="pdf-viewer">{url}</div>,
}));

vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
  default: () => <div data-testid="send-modal">Send Modal</div>,
}));

const capturedRelatedSpecs = { current: null };
vi.mock('@/windows/custom/shared/preview-cards/RelatedDocumentsCard.jsx', () => ({
  default: ({ documentId, specs }) => {
    capturedRelatedSpecs.current = specs;
    return <div data-testid="related-docs-card" data-doc-id={documentId} />;
  },
}));

vi.mock('@/components/related-documents', () => ({
  fetchById: vi.fn(),
  fetchByCriteria: vi.fn(),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));

vi.mock('@/components/ui/tooltip.jsx', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: () => ({ profile: 'tbai' }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG_1' } }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
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

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
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
  };
});

// --- Import under test ----------------------------------------------------

import InvoicePreviewModal from '../InvoicePreviewModal.jsx';
import { fetchById, fetchByCriteria } from '@/components/related-documents';

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
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = setTimeout(() => cb(0), 0);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id));
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
    expect(screen.getByText('previewCardTotal')).toBeInTheDocument();
  });

  it('does NOT render send button for purchase-invoice', () => {
    // Purchase invoices are received from suppliers — sending them makes no sense.
    renderPreview({ specName: 'purchase-invoice' });
    expect(screen.queryByText('invoicePreviewSend')).not.toBeInTheDocument();
  });

  it('renders send button for sales-invoice', () => {
    renderPreview({ specName: 'sales-invoice' });
    expect(screen.getAllByText('invoicePreviewSend').length).toBeGreaterThanOrEqual(1);
  });

  it('renders payment and edit action buttons', () => {
    renderPreview();
    expect(screen.getAllByText('invoicePreviewAddPayment').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('invoicePreviewEdit')).toBeInTheDocument();
  });

  it('opens the payment modal without passing a token prop', () => {
    renderPreview();
    fireEvent.click(screen.getAllByText('invoicePreviewAddPayment')[0]);
    expect(screen.getByTestId('new-payment-entry-modal')).toHaveAttribute('data-has-token', 'false');
  });

  it('shows Send to SIF in the preview actions when the fiscal profile enables it', () => {
    renderPreview({ specName: 'sales-invoice' });
    expect(screen.getByText('sendToSif')).toBeInTheDocument();
  });

  it('opens the SIF confirmation modal from the preview action', () => {
    renderPreview({ specName: 'sales-invoice' });
    fireEvent.click(screen.getByText('sendToSif'));
    expect(screen.getByText('sendToSifTitle')).toBeInTheDocument();
    expect(screen.getByText('sendToSifBodyTbai')).toBeInTheDocument();
  });

  it('shows a progress indicator while the SIF request is in flight', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/action/')) {
        return new Promise(resolve =>
          setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({}) }), 80));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    });

    renderPreview({ specName: 'sales-invoice' });
    fireEvent.click(screen.getByText('sendToSif'));
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    // SifSendingModal renders a '%' percentage during the sending phase
    // The old inline dialog never rendered one — this assertion distinguishes them
    expect(await screen.findByText(/^\d+%$/)).toBeInTheDocument();
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

    renderPreview({ specName: 'sales-invoice' });
    fireEvent.click(screen.getByText('sendToSif'));
    fireEvent.click(screen.getByText('sendToSifConfirm'));

    await screen.findByRole('button', { name: 'close' });

    expect(screen.getByText(/Sales Invoice INV-001/i)).toBeInTheDocument();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'sales-invoice:invoice-updated' }));
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
    expect(screen.getByTestId('preview-drop-zone')).toBeInTheDocument();
  });

  describe('invoiceRelatedSpecs — salesOrder branch', () => {
    const invoiceWithOrder = {
      ...sampleInvoice,
      salesOrder: 'so-42',
    };

    beforeEach(() => {
      capturedRelatedSpecs.current = null;
      fetchById.mockReset();
      fetchByCriteria.mockReset();
    });

    it('renders RelatedDocumentsCard when invoice has a salesOrder', () => {
      renderPreview({ invoice: invoiceWithOrder });
      expect(screen.getByTestId('related-docs-card')).toBeInTheDocument();
    });

    it('passes 2 specs when invoice has a salesOrder', () => {
      renderPreview({ invoice: invoiceWithOrder });
      expect(capturedRelatedSpecs.current).toHaveLength(2);
    });

    it('spec keys are sales-order and shipment', () => {
      renderPreview({ invoice: invoiceWithOrder });
      const specs = capturedRelatedSpecs.current;
      expect(specs[0].key).toBe('sales-order');
      expect(specs[0].type).toBe('sales-order');
      expect(specs[1].key).toBe('shipment');
      expect(specs[1].type).toBe('shipment');
    });

    it('passes empty specs array when invoice has no salesOrder', () => {
      renderPreview({ invoice: sampleInvoice });
      expect(capturedRelatedSpecs.current).toEqual([]);
    });

    it('sales-order spec calls fetchById and resolves to a 1-item array', async () => {
      const orderRecord = { id: 'so-42', documentNo: 'SO-042' };
      fetchById.mockResolvedValue(orderRecord);
      renderPreview({ invoice: invoiceWithOrder });
      const specs = capturedRelatedSpecs.current;
      const result = await specs[0].fetch('inv-1', 'tok', '/api/sales-invoice');
      expect(fetchById).toHaveBeenCalledWith('sales-order', 'header', 'so-42', 'tok', '/api/sales-invoice');
      expect(result).toEqual([orderRecord]);
    });

    it('sales-order spec resolves to empty array when fetchById returns null', async () => {
      fetchById.mockResolvedValue(null);
      renderPreview({ invoice: invoiceWithOrder });
      const specs = capturedRelatedSpecs.current;
      const result = await specs[0].fetch('inv-1', 'tok', '/api/sales-invoice');
      expect(result).toEqual([]);
    });

    it('shipment spec calls fetchByCriteria with the correct arguments', async () => {
      const shipmentRows = [{ id: 'ship-1' }, { id: 'ship-2' }];
      fetchByCriteria.mockResolvedValue(shipmentRows);
      renderPreview({ invoice: invoiceWithOrder });
      const specs = capturedRelatedSpecs.current;
      const result = await specs[1].fetch('inv-1', 'tok', '/api/sales-invoice');
      expect(fetchByCriteria).toHaveBeenCalledWith(
        'goods-shipment', 'goodsShipment', 'salesOrder', 'so-42', 'tok', '/api/sales-invoice',
      );
      expect(result).toEqual(shipmentRows);
    });
  });
});

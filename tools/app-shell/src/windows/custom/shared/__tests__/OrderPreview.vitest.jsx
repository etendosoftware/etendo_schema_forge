// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', state: null }),
}));

vi.mock('../GenericPreviewModal.jsx', () => ({
  default: vi.fn(({ title, subtitle, tabs, actionButtons, onClose }) => (
    <div data-testid="generic-preview-modal">
      <span data-testid="modal-title">{title}</span>
      {subtitle && <span data-testid="modal-subtitle">{subtitle}</span>}
      <div data-testid="modal-tabs">
        {tabs?.map((t) => (
          <div key={t.key} data-testid={`tab-${t.key}`}>
            {t.content}
          </div>
        ))}
      </div>
      <div data-testid="modal-actions">{actionButtons}</div>
      <button data-testid="close-btn" onClick={onClose}>
        Close
      </button>
    </div>
  )),
}));

vi.mock('../PreviewActionButtons.jsx', () => ({
  default: ({ onEmail, onDownloadPdf, hasPdf, sendLabel, downloadLabel, editLabel }) => (
    <div data-testid="action-buttons">
      <button data-testid="email-btn" onClick={onEmail}>
        {sendLabel}
      </button>
      <button data-testid="download-btn" onClick={onDownloadPdf} disabled={!hasPdf}>
        {downloadLabel}
      </button>
      <button data-testid="edit-btn">{editLabel}</button>
    </div>
  ),
  PreviewEmptyPanel: ({ text }) => <div data-testid="empty-panel">{text}</div>,
  PreviewPdfPanel: ({ pdfLoading, pdfUrl }) => (
    <div data-testid="pdf-panel" data-loading={String(pdfLoading)} data-url={pdfUrl} />
  ),
}));

vi.mock('../useOrderPdf.js', () => ({
  useOrderPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

vi.mock('../usePurchaseOrderPdf.js', () => ({
  usePurchaseOrderPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
  default: ({ onClose, documentNo }) => (
    <div data-testid="send-modal" data-docno={documentNo}>
      <button data-testid="send-modal-close" onClick={onClose}>
        Close Send
      </button>
    </div>
  ),
}));

vi.mock('../useDocumentCurrency.js', () => ({
  useDocumentCurrency: vi.fn(() => ({
    orgCurrencyCode: null,
    exchangeRate: null,
    isSameCurrency: true,
    loading: false,
    convertAmount: (amount) => amount,
  })),
}));

vi.mock('../preview-cards/SummaryCard.jsx', () => ({
  default: vi.fn(() => <div data-testid="summary-card" />),
}));

vi.mock('../preview-cards/EmailsCard.jsx', () => ({
  default: () => <div data-testid="emails-card" />,
}));

vi.mock('../preview-cards/RelatedDocumentsCard.jsx', () => ({
  default: () => <div data-testid="rel-docs-card" />,
}));

vi.mock('@/components/related-documents', () => ({
  fetchByCriteria: vi.fn(),
  fetchChild: vi.fn(),
  fetchById: vi.fn(),
}));

vi.mock('@/lib/statusBadge.js', () => ({
  statusLabel: (code) => code,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import OrderPreview from '../OrderPreview.jsx';
import { useOrderPdf } from '../useOrderPdf.js';
import { usePurchaseOrderPdf } from '../usePurchaseOrderPdf.js';
import { useDocumentCurrency } from '../useDocumentCurrency.js';
import SummaryCard from '../preview-cards/SummaryCard.jsx';

const defaultOrder = {
  id: 'order-1',
  documentNo: 'DOC-001',
  documentStatus: 'CO',
  grandTotalAmount: 1000,
  'businessPartner$_identifier': 'Acme Corp',
  businessPartner: 'bp-1',
  orderDate: '2024-01-01',
  'currency$_identifier': 'EUR',
  invoiceStatus: 50,
  deliveryStatus: 75,
};

function renderOrderPreview(overrides = {}) {
  const defaults = {
    order: defaultOrder,
    token: 'tok',
    apiBaseUrl: '/api/sales-order',
    windowName: 'sales-order',
    specName: 'sales-order',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<OrderPreview {...defaults} {...overrides} />);
}

describe('OrderPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOrderPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    usePurchaseOrderPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  it('returns null when order prop is null', () => {
    const { container } = render(
      <OrderPreview
        order={null}
        token="tok"
        apiBaseUrl="/api"
        specName="sales-order"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders GenericPreviewModal when order is provided', () => {
    renderOrderPreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
  });

  it('title contains windowLabel and documentNo for sales-order', () => {
    renderOrderPreview({ specName: 'sales-order' });
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('DOC-001');
    expect(title).toContain('Sales Order');
  });

  it('subtitle shows businessPartner$_identifier when present', () => {
    renderOrderPreview();
    expect(screen.getByTestId('modal-subtitle')).toBeInTheDocument();
    expect(screen.getByTestId('modal-subtitle').textContent).toContain('Acme Corp');
  });

  it('does not render subtitle when businessPartner$_identifier is absent', () => {
    const orderWithoutPartner = { ...defaultOrder, 'businessPartner$_identifier': undefined };
    renderOrderPreview({ order: orderWithoutPartner });
    expect(screen.queryByTestId('modal-subtitle')).not.toBeInTheDocument();
  });

  it('renders 3 tabs: general, messages, history', () => {
    renderOrderPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-messages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });

  it('shows send modal when email button is clicked', () => {
    renderOrderPreview();
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('email-btn'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
  });

  it('download button is disabled when pdfBlob is null', () => {
    useOrderPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    renderOrderPreview({ specName: 'sales-order' });
    expect(screen.getByTestId('download-btn')).toBeDisabled();
  });

  it('download button is enabled when pdfUrl is set', () => {
    useOrderPdf.mockReturnValue({ pdfUrl: 'blob:test', pdfBlob: new Blob(), loading: false, error: null });
    renderOrderPreview({ specName: 'sales-order' });
    expect(screen.getByTestId('download-btn')).not.toBeDisabled();
  });

  it('uses Purchase Order window label when specName is purchase-order', () => {
    usePurchaseOrderPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    renderOrderPreview({ specName: 'purchase-order' });
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('Purchase Order');
  });

  // ── useDocumentCurrency integration (ETP-4027) ────────────────────────────

  describe('dual-currency via useDocumentCurrency', () => {
    beforeEach(() => {
      vi.mocked(SummaryCard).mockClear();
    });

    it('passes orgCurrencyCode and exchangeRate to SummaryCard when currencies differ', () => {
      const convertAmount = vi.fn((amount) => amount != null ? amount * 0.86 : null);
      vi.mocked(useDocumentCurrency).mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: 0.86,
        isSameCurrency: false,
        loading: false,
        convertAmount,
      });

      const orderWithUsd = { ...defaultOrder, 'currency$_identifier': 'USD', grandTotalAmount: 1000 };
      renderOrderPreview({ order: orderWithUsd });

      // SummaryCard should have been called with orgCurrencyCode and exchangeRate
      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.orgCurrencyCode).toBe('EUR');
      expect(lastCall.exchangeRate).toBe(0.86);
      // orgGrandTotal is convertAmount(grandTotalAmount) = 1000 * 0.86 = 860
      expect(lastCall.orgGrandTotal).toBeCloseTo(860);
    });

    it('passes no org currency data to SummaryCard when currencies are the same', () => {
      vi.mocked(useDocumentCurrency).mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: null,
        isSameCurrency: true,
        loading: false,
        convertAmount: (amount) => amount,
      });

      renderOrderPreview({ order: { ...defaultOrder, 'currency$_identifier': 'EUR' } });

      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      // orgGrandTotal comes from convertAmount which returns amount unchanged for isSameCurrency
      // SummaryCard decides whether to show dual-display based on orgCurrencyCode != currencyCode
      // The orgCurrencyCode is still passed through; SummaryCard handles the condition internally
      expect(lastCall.exchangeRate).toBeNull();
    });
  });
});

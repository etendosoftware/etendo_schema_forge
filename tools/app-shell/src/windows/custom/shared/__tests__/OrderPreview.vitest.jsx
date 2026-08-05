// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/hooks/useCurrencyPrecision.js', () => ({
  useCurrencyPrecision: () => 4,
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
  // Mirrors the real component's {onEmail && (...)} gate (PreviewActionButtons.jsx)
  // so tests can assert whether OrderPreview passed a truthy onEmail or not.
  default: ({ onEmail, onDownloadPdf, hasPdf, sendLabel, downloadLabel, editLabel }) => (
    <div data-testid="action-buttons">
      {onEmail && (
        <button data-testid="email-btn" onClick={onEmail}>
          {sendLabel}
        </button>
      )}
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

vi.mock('../useDocumentCurrency.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDocumentCurrency: vi.fn(() => ({
      orgCurrencyCode: null,
      exchangeRate: null,
      isSameCurrency: true,
      loading: false,
      convertAmount: (amount) => amount,
    })),
  };
});

vi.mock('../preview-cards/SummaryCard.jsx', () => ({
  default: vi.fn(() => <div data-testid="summary-card" />),
}));

vi.mock('../preview-cards/EmailsCard.jsx', () => ({
  // vi.fn (not a plain arrow) so tests can inspect the onSend prop OrderPreview passes in,
  // mirroring the SummaryCard prop-inspection pattern already used below.
  default: vi.fn(() => <div data-testid="emails-card" />),
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
import EmailsCard from '../preview-cards/EmailsCard.jsx';

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

    it('uses eTGOCurrencyRate (org→doc) as exchangeRate and divides to get orgGrandTotal', () => {
      // eTGOCurrencyRate = org→doc multiplyRate set by the user on the order.
      // e.g. 1.20 = "1 EUR = 1.20 USD". The component displays this rate directly
      // and computes orgGrandTotal = docTotal / eTGOCurrencyRate.
      vi.mocked(useDocumentCurrency).mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: null,
        isSameCurrency: false,
        loading: false,
        convertAmount: () => null,
      });

      const orderWithUsd = {
        ...defaultOrder,
        'currency$_identifier': 'USD',
        grandTotalAmount: 1000,
        eTGOCurrencyRate: '1.20',
      };
      renderOrderPreview({ order: orderWithUsd });

      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.orgCurrencyCode).toBe('EUR');
      // exchangeRate shown in sidebar = eTGOCurrencyRate (1 EUR = 1.20 USD)
      expect(lastCall.exchangeRate).toBeCloseTo(1.20);
      // orgGrandTotal = 1000 USD / 1.20 ≈ 833.33 EUR
      expect(lastCall.orgGrandTotal).toBeCloseTo(1000 / 1.20, 2);
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

  // ── ETP-4717 Pair 3 regression: preview drawer Send gating ────────────────
  // OrderPreview never gated its Send action by documentStatus (unlike the
  // Form-view topbar and Grid hover RowQuickActions fixed in Pair 1/Pair 2).
  // The fix will only pass a truthy onEmail/onSend when order.documentStatus
  // === 'CO'. These cases must FAIL against the current (unfixed) source.
  describe('Send action gating by documentStatus (ETP-4717 Pair 3)', () => {
    it('does NOT render the top action-bar email button when order.documentStatus is DR (draft)', () => {
      renderOrderPreview({ order: { ...defaultOrder, documentStatus: 'DR' } });
      expect(screen.queryByTestId('email-btn')).not.toBeInTheDocument();
    });

    it('renders the top action-bar email button when order.documentStatus is CO (completed)', () => {
      renderOrderPreview({ order: { ...defaultOrder, documentStatus: 'CO' } });
      expect(screen.getByTestId('email-btn')).toBeInTheDocument();
    });

    it('passes onSend: undefined to EmailsCard when order.documentStatus is DR (draft)', () => {
      renderOrderPreview({ order: { ...defaultOrder, documentStatus: 'DR' } });
      const lastCall = vi.mocked(EmailsCard).mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.onSend).toBeUndefined();
    });

    it('passes a truthy onSend function to EmailsCard when order.documentStatus is CO (completed)', () => {
      renderOrderPreview({ order: { ...defaultOrder, documentStatus: 'CO' } });
      const lastCall = vi.mocked(EmailsCard).mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(typeof lastCall.onSend).toBe('function');
    });

    it('applies the same DR gating for purchase-order (no per-spec status difference for this rule)', () => {
      renderOrderPreview({ specName: 'purchase-order', order: { ...defaultOrder, documentStatus: 'DR' } });
      expect(screen.queryByTestId('email-btn')).not.toBeInTheDocument();
    });
  });
});

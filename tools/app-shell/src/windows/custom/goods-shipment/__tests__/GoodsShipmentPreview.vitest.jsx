// Mocks must come before imports (Vitest hoisting)
import { TEST_BEARER_TOKEN, declareBearerSession } from '@/test/sessionContract.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (date) => date || '—',
}));

vi.mock('../useShipmentPdf.js', () => ({
  useShipmentPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
}));

const capturedSpecs = { current: null };
vi.mock('../../shared/preview-cards/RelatedDocumentsCard.jsx', () => ({
  default: ({ documentId, specs }) => {
    capturedSpecs.current = specs;
    return <div data-testid="related-docs-card" data-doc-id={documentId} />;
  },
}));

vi.mock('../../shared/GenericPreviewModal.jsx', () => ({
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
      {onClose && (
        <button data-testid="close-btn" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  )),
}));

vi.mock('../../shared/PreviewActionButtons.jsx', () => ({
  PreviewPdfPanel: ({ pdfUrl }) => <div data-testid="pdf-panel" data-url={pdfUrl} />,
}));

vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
  default: ({ onClose }) => (
    <div data-testid="send-modal">
      <button data-testid="send-modal-close" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Download: () => <span data-testid="icon-download" />,
  Edit2: () => <span data-testid="icon-edit2" />,
  Mail: () => <span data-testid="icon-mail" />,
}));

vi.mock('../../shared/preview-cards/SummaryCard.jsx', () => ({
  InfoRow: ({ label, value, children }) => (
    <div data-testid="info-row">
      {label}: {value ?? children}
    </div>
  ),
  CardShell: ({ children }) => <div data-testid="card-shell">{children}</div>,
  PercentBar: ({ value }) => <div data-testid="percent-bar">{value}</div>,
}));

vi.mock('@/components/related-documents/constants.jsx', () => ({
  STATUS_BADGE: {},
  STATUS_KEYS: {},
}));

import { render, screen, fireEvent } from '@testing-library/react';
import GoodsShipmentPreview from '../GoodsShipmentPreview.jsx';
import GenericPreviewModal from '../../shared/GenericPreviewModal.jsx';
import { useShipmentPdf } from '../useShipmentPdf.js';
import {
  expectPresenceGatedByStatus,
  expectDisabledGatedByStatus,
} from '../../shared/__tests__/testUtils/sendActionGatingCases.js';

const defaultShipment = {
  id: 'ship-1',
  documentNo: 'ALB-001',
  documentStatus: 'CO',
  movementDate: '2024-01-10',
  'businessPartner$_identifier': 'Client B',
  businessPartner: 'bp-3',
  'warehouse$_identifier': 'Main Warehouse',
  salesOrder: 'so-1',
  'salesOrder$_identifier': 'SO-001 (01/01/2024)',
  invoiceStatus: 0,
};

function renderGSPreview(overrides = {}) {
  const defaults = {
    shipment: defaultShipment,
    token: 'tok',
    apiBaseUrl: '/api/goods-shipment',
    windowName: 'goods-shipment',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<GoodsShipmentPreview {...defaults} {...overrides} />);
}

describe('GoodsShipmentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShipmentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  it('returns null when shipment prop is null', () => {
    const { container } = render(
      <GoodsShipmentPreview
        shipment={null}
        token="tok"
        apiBaseUrl="/api"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders GenericPreviewModal when shipment is provided', () => {
    renderGSPreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
  });

  it('title contains Goods Shipment and the documentNo', () => {
    renderGSPreview();
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('Goods Shipment');
    expect(title).toContain('ALB-001');
  });

  // ETP-4855 — Messages and History were empty placeholders and were removed
  // from every preview. Only the general tab is left.
  it('renders the general tab alone: no messages, history or documents tab', () => {
    renderGSPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-messages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-history')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-documents')).not.toBeInTheDocument();
  });

  it('renders RelatedDocumentsCard inside the general tab with the shipment id', () => {
    renderGSPreview();
    const card = screen.getByTestId('related-docs-card');
    expect(card).toBeInTheDocument();
    expect(card.closest('[data-testid="tab-general"]')).toBeInTheDocument();
    expect(card.getAttribute('data-doc-id')).toBe('ship-1');
  });

  it('shows send modal when email button is clicked', () => {
    renderGSPreview();
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('icon-mail').closest('button'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
  });

  // ── ETP-4372 regression ──────────────────────────────────────────────────
  // GoodsShipmentPreview previously did not render EmailsCard at all. The fix
  // renders <EmailsCard onSend={openEmailModal} /> in the general tab. The real
  // (un-mocked) EmailsCard exposes a "previewCardSendEmail" link.
  it('ETP-4372: renders the EMAILS section with a send link in the general tab', () => {
    renderGSPreview();
    const link = screen.getByText('previewCardSendEmail');
    expect(link).toBeInTheDocument();
    expect(link.closest('[data-testid="tab-general"]')).toBeInTheDocument();
  });

  it('ETP-4372: clicking the EMAILS-section send link opens the SendDocumentModal', () => {
    renderGSPreview();
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('previewCardSendEmail'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
  });

  it('download button is disabled when pdfBlob is null', () => {
    useShipmentPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    renderGSPreview();
    const downloadBtn = screen.getByTestId('icon-download').closest('button');
    expect(downloadBtn).toBeDisabled();
  });

  // ── ETP-4717 Pair 3 regression: preview drawer Send gating ────────────────
  // GoodsShipmentPreview never gated its Send action by documentStatus — the
  // primary action-bar Button (Mail icon) is a raw always-rendered button,
  // and EmailsCard's onSend is always openEmailModal. The fix will only wire
  // these up when shipment.documentStatus === 'CO'. These DR cases must FAIL
  // against the current (unfixed) source.
  describe('Send action gating by documentStatus (ETP-4717 Pair 3)', () => {
    expectPresenceGatedByStatus({
      hiddenIt: 'does NOT render the action-bar Send (mail) button when shipment.documentStatus is DR (draft)',
      shownIt: 'renders the action-bar Send (mail) button when shipment.documentStatus is CO (completed)',
      renderHidden: () => renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } }),
      renderShown: () => renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'CO' } }),
      findElement: () => screen.queryByTestId('icon-mail'),
    });

    expectPresenceGatedByStatus({
      hiddenIt: 'does NOT render the EMAILS-section send link when shipment.documentStatus is DR (draft)',
      shownIt: 'renders the EMAILS-section send link when shipment.documentStatus is CO (completed)',
      renderHidden: () => renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } }),
      renderShown: () => renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'CO' } }),
      findElement: () => screen.queryByText('previewCardSendEmail'),
    });
  });

  // ── ETP-4789: Download PDF gating by documentStatus ───────────────────────
  // The download button was only gated by pdfBlob — never by documentStatus.
  // The fix reuses the same isSendable variable already computed for Send
  // (documentStatus === 'CO'). These cases must FAIL against the current
  // (unfixed) source.
  describe('Download PDF gating by documentStatus (ETP-4789)', () => {
    function renderWithPdf(shipment) {
      useShipmentPdf.mockReturnValue({
        pdfUrl: 'blob:test',
        pdfBlob: new Blob(['%PDF'], { type: 'application/pdf' }),
        loading: false,
        error: null,
      });
      global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
      global.URL.revokeObjectURL = vi.fn();
      return renderGSPreview({ shipment });
    }

    expectDisabledGatedByStatus({
      hiddenIt: 'disables the download button when shipment.documentStatus is DR (draft), even with a PDF available',
      shownIt: 'enables the download button when shipment.documentStatus is CO (completed)',
      renderHidden: () => renderWithPdf({ ...defaultShipment, documentStatus: 'DR' }),
      renderShown: () => renderWithPdf({ ...defaultShipment, documentStatus: 'CO' }),
      findElement: () => screen.getByTestId('icon-download').closest('button'),
    });
  });

  it('download button is not disabled when pdfBlob is set', () => {
    useShipmentPdf.mockReturnValue({
      pdfUrl: 'blob:test',
      pdfBlob: new Blob(['%PDF'], { type: 'application/pdf' }),
      loading: false,
      error: null,
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    global.URL.revokeObjectURL = vi.fn();
    renderGSPreview();
    const downloadBtn = screen.getByTestId('icon-download').closest('button');
    expect(downloadBtn).not.toBeDisabled();
  });

  describe('shipmentDocSpecs fetch functions', () => {
    const shipmentId = 'ship-1';
    const base = '/api/goods-shipment';

    function mockDetailFetch(detail) {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { data: [detail] } }),
        }),
      );
    }

    beforeEach(() => {
      capturedSpecs.current = null;
      // ETP-4576: the descriptor's `fetch(id, base)` no longer receives a token —
      // its request reads the credential from the active scheme instead.
      declareBearerSession();
    });

    it('orders spec fetches linkedOrders from the detail endpoint', async () => {
      mockDetailFetch({ linkedOrders: [{ id: 'ord-1' }], linkedInvoices: [], returnReceipts: [] });
      renderGSPreview();
      const specs = capturedSpecs.current;
      expect(specs).toHaveLength(3);
      const result = await specs[0].fetch(shipmentId, base);
      expect(result).toEqual([{ id: 'ord-1' }]);
      expect(global.fetch).toHaveBeenCalledWith(
        `${base}/goodsShipment/${shipmentId}`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${TEST_BEARER_TOKEN}` }),
          credentials: 'include',
        }),
      );
    });

    it('invoices spec fetches linkedInvoices from the detail endpoint', async () => {
      mockDetailFetch({ linkedOrders: [], linkedInvoices: [{ id: 'inv-1' }], returnReceipts: [] });
      renderGSPreview();
      const specs = capturedSpecs.current;
      const result = await specs[1].fetch(shipmentId, base);
      expect(result).toEqual([{ id: 'inv-1' }]);
    });

    it('returns spec fetches returnReceipts from the detail endpoint', async () => {
      mockDetailFetch({ linkedOrders: [], linkedInvoices: [], returnReceipts: [{ id: 'ret-1' }] });
      renderGSPreview();
      const specs = capturedSpecs.current;
      const result = await specs[2].fetch(shipmentId, base);
      expect(result).toEqual([{ id: 'ret-1' }]);
    });

    it('all three specs share one HTTP call (caching)', async () => {
      mockDetailFetch({ linkedOrders: [{ id: 'ord-1' }], linkedInvoices: [{ id: 'inv-1' }], returnReceipts: [] });
      renderGSPreview();
      const specs = capturedSpecs.current;
      await Promise.all([
        specs[0].fetch(shipmentId, base),
        specs[1].fetch(shipmentId, base),
        specs[2].fetch(shipmentId, base),
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns empty arrays when the fetch response is missing fields', async () => {
      mockDetailFetch({});
      renderGSPreview();
      const specs = capturedSpecs.current;
      const [orders, invoices, returns] = await Promise.all([
        specs[0].fetch(shipmentId, base),
        specs[1].fetch(shipmentId, base),
        specs[2].fetch(shipmentId, base),
      ]);
      expect(orders).toEqual([]);
      expect(invoices).toEqual([]);
      expect(returns).toEqual([]);
    });

    it('resolves to empty arrays when fetch rejects (error path)', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
      renderGSPreview();
      const specs = capturedSpecs.current;
      const [orders, invoices, returns] = await Promise.all([
        specs[0].fetch(shipmentId, base),
        specs[1].fetch(shipmentId, base),
        specs[2].fetch(shipmentId, base),
      ]);
      expect(orders).toEqual([]);
      expect(invoices).toEqual([]);
      expect(returns).toEqual([]);
    });

    it('resolves to empty arrays when fetch returns a non-ok response', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
      );
      renderGSPreview();
      const specs = capturedSpecs.current;
      const result = await specs[0].fetch(shipmentId, base);
      expect(result).toEqual([]);
    });

    it('spec keys and types are set correctly', () => {
      renderGSPreview();
      const specs = capturedSpecs.current;
      expect(specs[0].key).toBe('orders');
      expect(specs[0].type).toBe('sales-order');
      expect(specs[1].key).toBe('invoices');
      expect(specs[1].type).toBe('sales-invoice');
      expect(specs[2].key).toBe('returns');
      expect(specs[2].type).toBe('return-material-receipt');
    });
  });

  // ── ETP-4315: attachmentConfig wiring (real Attachment, M_InOut table) ────
  describe('attachmentConfig wiring (ETP-4315 — real Attachment, tableName M_InOut)', () => {
    function lastAttachmentConfig() {
      const calls = vi.mocked(GenericPreviewModal).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      return calls[calls.length - 1][0].attachmentConfig;
    }

    it('includes tableName M_InOut, useMainAttachment true and the shipment documentId', () => {
      renderGSPreview();
      const cfg = lastAttachmentConfig();
      expect(cfg.tableName).toBe('M_InOut');
      expect(cfg.useMainAttachment).toBe(true);
      expect(cfg.documentId).toBe(defaultShipment.id);
    });

    it('sets storeCondition: false when shipment.documentStatus is DR (draft)', () => {
      renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } });
      const cfg = lastAttachmentConfig();
      expect(cfg.storeCondition).toBe(false);
    });

    it('sets storeCondition: true and sourceBlob=pdfBlob when shipment.documentStatus is CO (non-draft)', () => {
      const pdfBlob = new Blob(['%PDF'], { type: 'application/pdf' });
      useShipmentPdf.mockReturnValue({ pdfUrl: 'blob:test', pdfBlob, loading: false, error: null });
      renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'CO' } });
      const cfg = lastAttachmentConfig();
      expect(cfg.storeCondition).toBe(true);
      expect(cfg.sourceBlob).toBe(pdfBlob);
      expect(cfg.autoFetch).toBe(true);
    });
  });

  // ── ETP-4315 follow-up (2026-08-18): pdfCacheConfig wiring into useShipmentPdf
  // — same tableName as attachmentConfig above (M_InOut), storeCondition gated on
  // documentStatus !== 'DR'. This window never cached its rendered PDF before
  // ETP-4315 (new wiring, not a migration from an older cache shape).
  describe('pdfCacheConfig wiring into useShipmentPdf (ETP-4315 follow-up)', () => {
    function lastShipmentPdfCacheConfig() {
      const calls = vi.mocked(useShipmentPdf).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      // ETP-4576: the pdf hooks no longer take a credential, so cacheConfig
      // moved from the fourth argument to the third.
      return calls[calls.length - 1][2];
    }

    it('passes { tableName: "M_InOut", storeCondition: false } when shipment.documentStatus is DR (draft)', () => {
      renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } });
      expect(lastShipmentPdfCacheConfig()).toEqual({ tableName: 'M_InOut', storeCondition: false });
    });

    it('passes { tableName: "M_InOut", storeCondition: true } when shipment.documentStatus is CO (non-draft)', () => {
      renderGSPreview({ shipment: { ...defaultShipment, documentStatus: 'CO' } });
      expect(lastShipmentPdfCacheConfig()).toEqual({ tableName: 'M_InOut', storeCondition: true });
    });
  });
});

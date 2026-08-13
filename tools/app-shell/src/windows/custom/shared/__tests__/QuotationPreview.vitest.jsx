// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  // QuotationPreview now forwards this to statusLabel() (ETP-4856) so the
  // "Bajo evaluación" DB-sourced label resolves the same way it does in the
  // grid (DataTable.jsx). statusLabel itself is mocked below, so an empty
  // dictionary is enough here.
  useLocale: () => ({}),
}));

vi.mock('@/hooks/useCurrencyPrecision.js', () => ({
  useCurrencyPrecision: () => 4,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', state: null }),
}));

vi.mock('../GenericPreviewModal.jsx', () => ({
  default: vi.fn(({ title, subtitle, tabs, actionButtons, onClose, attachmentConfig }) => (
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
      {/* ETP-4789: simulates ManagedLeftPanel invoking attachmentConfig.onFileChange
          once the cached attachment (GET /preview-file) resolves — ahead of the
          jsreport regeneration behind useQuotationPdf. Mirrors the same mechanism
          already used in GoodsReceiptPreview.vitest.jsx. */}
      {attachmentConfig?.onFileChange && (
        <button
          data-testid="simulate-file-change"
          onClick={() => attachmentConfig.onFileChange({ objectUrl: 'blob:cached-url', fileName: 'cached.pdf' })}
        >
          SimulateFileChange
        </button>
      )}
    </div>
  )),
}));

vi.mock('../PreviewActionButtons.jsx', () => ({
  // Mirrors the real component's {onEmail && (...)} gate and its
  // disabled={!hasPdf || !onDownloadPdf} download gate (PreviewActionButtons.jsx,
  // ETP-4789) so tests can assert whether QuotationPreview passed a truthy
  // onEmail/onDownloadPdf or not.
  default: ({ onEmail, onDownloadPdf, hasPdf, sendLabel, downloadLabel, editLabel }) => (
    <div data-testid="action-buttons">
      {onEmail && (
        <button data-testid="email-btn" onClick={onEmail}>
          {sendLabel}
        </button>
      )}
      <button data-testid="download-btn" onClick={onDownloadPdf} disabled={!hasPdf || !onDownloadPdf}>
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

vi.mock('../useQuotationPdf.js', () => ({
  useQuotationPdf: vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null })),
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

vi.mock('../preview-cards/SummaryCard.jsx', () => ({
  default: () => <div data-testid="summary-card" />,
}));

vi.mock('../preview-cards/EmailsCard.jsx', () => ({
  // vi.fn (not a plain arrow) so tests can inspect the onSend prop QuotationPreview
  // passes in, matching the prop-inspection convention used across the sibling files.
  default: vi.fn(() => <div data-testid="emails-card" />),
}));

vi.mock('../preview-cards/RelatedDocumentsCard.jsx', () => ({
  default: () => <div data-testid="rel-docs-card" />,
}));

vi.mock('@/components/related-documents', () => ({
  fetchByCriteria: vi.fn(),
}));

vi.mock('@/lib/statusBadge.js', () => ({
  statusLabel: (code) => code,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import QuotationPreview from '../QuotationPreview.jsx';
import { useQuotationPdf } from '../useQuotationPdf.js';
import EmailsCard from '../preview-cards/EmailsCard.jsx';
import {
  expectPresenceGatedByStatus,
  expectEmailsCardOnSendGatedByStatus,
  expectDisabledGatedByStatus,
} from './testUtils/sendActionGatingCases.js';

const defaultQuotation = {
  id: 'q-1',
  documentNo: 'QUO-001',
  documentStatus: 'CO',
  grandTotalAmount: 2000,
  'businessPartner$_identifier': 'Partner Corp',
  businessPartner: 'bp-2',
  orderDate: '2024-01-15',
  validUntil: '2024-02-15',
  'currency$_identifier': 'EUR',
};

function renderQuotationPreview(overrides = {}) {
  const defaults = {
    quotation: defaultQuotation,
    token: 'tok',
    apiBaseUrl: '/api/sales-quotation',
    windowName: 'sales-quotation',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<QuotationPreview {...defaults} {...overrides} />);
}

describe('QuotationPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuotationPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  it('returns null when quotation prop is null', () => {
    const { container } = render(
      <QuotationPreview
        quotation={null}
        token="tok"
        apiBaseUrl="/api"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders GenericPreviewModal when quotation is provided', () => {
    renderQuotationPreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
  });

  it('title contains windowLabel and quotation documentNo', () => {
    renderQuotationPreview();
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('QUO-001');
    expect(title).toContain('Sales Quotation');
  });

  it('subtitle shows businessPartner$_identifier when present', () => {
    renderQuotationPreview();
    expect(screen.getByTestId('modal-subtitle')).toBeInTheDocument();
    expect(screen.getByTestId('modal-subtitle').textContent).toContain('Partner Corp');
  });

  it('does not render subtitle when businessPartner$_identifier is absent', () => {
    const quotationWithoutPartner = { ...defaultQuotation, 'businessPartner$_identifier': undefined };
    renderQuotationPreview({ quotation: quotationWithoutPartner });
    expect(screen.queryByTestId('modal-subtitle')).not.toBeInTheDocument();
  });

  it('renders 3 tabs: general, messages, history', () => {
    renderQuotationPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-messages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });

  it('shows send modal when email button is clicked', () => {
    renderQuotationPreview();
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('email-btn'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
  });

  it('download button is disabled when pdfUrl is null', () => {
    useQuotationPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
    renderQuotationPreview();
    expect(screen.getByTestId('download-btn')).toBeDisabled();
  });

  it('download button is enabled when pdfUrl is set', () => {
    useQuotationPdf.mockReturnValue({ pdfUrl: 'blob:q-test', pdfBlob: new Blob(), loading: false, error: null });
    renderQuotationPreview();
    expect(screen.getByTestId('download-btn')).not.toBeDisabled();
  });

  // ── ETP-4717 Pair 3 regression: preview drawer Send gating ────────────────
  // QuotationPreview never gated its Send action by documentStatus. The fix
  // matches the "Bajo evaluación+" rule already shipped for the Grid/Form
  // gate on sales-quotation: quotation?.documentStatus !== 'DR'. These DR
  // cases must FAIL against the current (unfixed) source.
  describe('Send action gating by documentStatus (ETP-4717 Pair 3)', () => {
    expectPresenceGatedByStatus({
      hiddenIt: 'does NOT render the top action-bar email button when quotation.documentStatus is DR (draft)',
      shownIt: 'renders the top action-bar email button when quotation.documentStatus is UE (under evaluation)',
      renderHidden: () => renderQuotationPreview({ quotation: { ...defaultQuotation, documentStatus: 'DR' } }),
      renderShown: () => renderQuotationPreview({ quotation: { ...defaultQuotation, documentStatus: 'UE' } }),
      findElement: () => screen.queryByTestId('email-btn'),
    });

    expectEmailsCardOnSendGatedByStatus({
      hiddenIt: 'passes onSend: undefined to EmailsCard when quotation.documentStatus is DR (draft)',
      shownIt: 'passes a truthy onSend function to EmailsCard when quotation.documentStatus is UE (under evaluation)',
      renderHidden: () => renderQuotationPreview({ quotation: { ...defaultQuotation, documentStatus: 'DR' } }),
      renderShown: () => renderQuotationPreview({ quotation: { ...defaultQuotation, documentStatus: 'UE' } }),
      EmailsCardMock: vi.mocked(EmailsCard),
    });
  });

  // ── ETP-4789: Download PDF gating by documentStatus ───────────────────────
  // QuotationPreview always passed onDownloadPdf=handleDownloadPdf regardless
  // of documentStatus — only hasPdf gated it. The fix reuses the same
  // isSendable variable already computed for Send (documentStatus !== 'DR').
  // These cases must FAIL against the current (unfixed) source.
  describe('Download PDF gating by documentStatus (ETP-4789)', () => {
    function renderWithPdf(quotation) {
      useQuotationPdf.mockReturnValue({ pdfUrl: 'blob:q-test', pdfBlob: new Blob(), loading: false, error: null });
      return renderQuotationPreview({ quotation });
    }

    expectDisabledGatedByStatus({
      hiddenIt: 'disables the download button when quotation.documentStatus is DR (draft), even with a PDF available',
      shownIt: 'enables the download button when quotation.documentStatus is UE (under evaluation)',
      renderHidden: () => renderWithPdf({ ...defaultQuotation, documentStatus: 'DR' }),
      renderShown: () => renderWithPdf({ ...defaultQuotation, documentStatus: 'UE' }),
      findElement: () => screen.getByTestId('download-btn'),
    });
  });

  // ── ETP-4789 (reject-cycle fix): Download gates on the cached attachment too ──
  // The cached attachment (GenericPreviewModal's ManagedLeftPanel, GET /preview-file)
  // resolves ahead of the slow jsreport regeneration behind useQuotationPdf. hasPdf
  // must become true as soon as attachmentConfig.onFileChange fires, even while
  // pdfUrl is still null — closing the perceptible gap QA reported between the
  // preview panel showing the PDF and the Download button enabling.
  describe('Download PDF gated by cached attachment (ETP-4789 reject-cycle fix)', () => {
    it('enables the download button once the cached attachment resolves, even while pdfUrl is still null', () => {
      useQuotationPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: true, error: null });
      renderQuotationPreview({ quotation: { ...defaultQuotation, documentStatus: 'UE' } });
      expect(screen.getByTestId('download-btn')).toBeDisabled();

      fireEvent.click(screen.getByTestId('simulate-file-change'));

      expect(screen.getByTestId('download-btn')).not.toBeDisabled();
    });

    it('downloads via cachedAttachment.objectUrl/fileName, not the (still-null) pdfUrl', () => {
      useQuotationPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
      renderQuotationPreview({ quotation: { ...defaultQuotation, documentStatus: 'UE' } });
      fireEvent.click(screen.getByTestId('simulate-file-change'));

      // Spy AFTER render/state-update — mocking document.createElement globally
      // before React finishes creating real DOM nodes breaks reconciliation.
      const clickMock = vi.fn();
      const fakeAnchor = { href: '', download: '', click: clickMock };
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);

      try {
        fireEvent.click(screen.getByTestId('download-btn'));
        expect(fakeAnchor.href).toBe('blob:cached-url');
        expect(fakeAnchor.download).toBe('cached.pdf');
        expect(clickMock).toHaveBeenCalledTimes(1);
      } finally {
        createElementSpy.mockRestore();
      }
    });

    it('keeps the download button disabled when documentStatus is DR, even with a cached attachment present (status gate is not bypassed by cache)', () => {
      useQuotationPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
      renderQuotationPreview({ quotation: { ...defaultQuotation, documentStatus: 'DR' } });

      fireEvent.click(screen.getByTestId('simulate-file-change'));

      expect(screen.getByTestId('download-btn')).toBeDisabled();
    });
  });
});

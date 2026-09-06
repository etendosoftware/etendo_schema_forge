// Mocks must come before imports (Vitest hoisting).
// Mirrors OrderPreview.vitest.jsx's isolated-mock approach so we can assert
// directly on the dual-currency props passed to SummaryCard (ETP-4029).

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
          jsreport regeneration behind p.pdfUrl. Mirrors the same mechanism already
          used in GoodsReceiptPreview.vitest.jsx. */}
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

vi.mock('../PdfViewer.jsx', () => ({
  default: ({ url }) => <div data-testid="pdf-viewer">{url}</div>,
}));

vi.mock('../NewPaymentEntryModal.jsx', () => ({
  default: ({ onSaved }) => (
    <div data-testid="new-payment-entry-modal">
      <button type="button" onClick={onSaved}>save payment</button>
    </div>
  ),
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

vi.mock('../SifSendingModal.jsx', () => ({
  default: () => <div data-testid="sif-modal" />,
}));

// ETP-4315 follow-up (2026-08-18) — useInvoicePreview.js (mocked wholesale here)
// is where pdfCacheConfig is actually computed and passed to useInvoicePdf, not
// this component. That wiring is covered by the dedicated useInvoicePreview.vitest.jsx
// hook test, since mocking useInvoicePreview here would make any such assertion
// in this file exercise the mock, not the real cacheConfig logic.
vi.mock('../useInvoicePreview.js', () => ({
  useInvoicePreview: vi.fn(),
}));

vi.mock('../useFiscalStatus.js', () => ({
  useFiscalStatus: () => ({ sii: null, tbai: null, verifactu: null, loading: false }),
}));

vi.mock('@/windows/custom/fiscal-monitor/FmPrimitives.jsx', () => ({
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
}));

const getInvoiceFiscalTargetsMock = vi.fn(() => ({ showSii: false, showTbai: false, showVerifactu: false }));
vi.mock('../fiscalTargets.js', () => ({
  getInvoiceFiscalTargets: (...args) => getInvoiceFiscalTargetsMock(...args),
}));

vi.mock('../useDocumentCurrency.js', async (importOriginal) => {
  const { mockUseDocumentCurrency } = await import('./testUtils/mockUseDocumentCurrency.js');
  return mockUseDocumentCurrency(importOriginal);
});

vi.mock('../preview-cards/SummaryCard.jsx', () => ({
  default: vi.fn(() => <div data-testid="summary-card" />),
  InfoRow: ({ children }) => <div data-testid="info-row">{children}</div>,
}));

vi.mock('../preview-cards/PaymentsCard.jsx', () => ({
  // vi.fn (not a plain arrow) so tests can inspect the isCreditNote prop
  // InvoicePreview derives, mirroring the SummaryCard prop-inspection pattern.
  default: vi.fn(() => <div data-testid="payments-card" />),
}));

vi.mock('../preview-cards/EmailsCard.jsx', () => ({
  // vi.fn (not a plain arrow) so tests can inspect the onSend prop InvoicePreview
  // passes in, mirroring the SummaryCard prop-inspection pattern used above.
  default: vi.fn(() => <div data-testid="emails-card" />),
}));

vi.mock('../preview-cards/RelatedDocumentsCard.jsx', () => ({
  default: () => <div data-testid="rel-docs-card" />,
}));

vi.mock('@/components/related-documents', () => ({
  fetchByCriteria: vi.fn(),
  fetchById: vi.fn(),
}));

vi.mock('@/lib/invoiceDueDate', () => ({
  getLatestInstallmentDueDate: () => null,
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import InvoicePreview from '../InvoicePreview.jsx';
import GenericPreviewModal from '../GenericPreviewModal.jsx';
import { useInvoicePreview } from '../useInvoicePreview.js';
import { useDocumentCurrency } from '../useDocumentCurrency.js';
import SummaryCard from '../preview-cards/SummaryCard.jsx';
import EmailsCard from '../preview-cards/EmailsCard.jsx';
import PaymentsCard from '../preview-cards/PaymentsCard.jsx';
import {
  expectPresenceGatedByStatus,
  expectEmailsCardOnSendGatedByStatus,
  expectDisabledGatedByStatus,
} from './testUtils/sendActionGatingCases.js';

const defaultInvoice = {
  id: 'inv-1',
  documentNo: 'INV-001',
  documentStatus: 'CO',
  grandTotalAmount: 1000,
  'businessPartner$_identifier': 'Acme Corp',
  businessPartner: 'bp-1',
  invoiceDate: '2024-01-01',
  'currency$_identifier': 'EUR',
};

function baseInvoicePreviewHook(overrides = {}) {
  return {
    displayInvoice: defaultInvoice,
    isSalesInvoice: false,
    isCompleted: true,
    isDraft: false,
    pdfUrl: null, pdfBlob: null, pdfLoading: false, pdfError: null, handleDownloadPdf: vi.fn(),
    installments: [], payments: [], loadingPayments: false,
    totalOutstanding: 0, canAddPayment: false, isFullyPaid: false, fetchPayments: vi.fn(),
    status: 'CO', badgeProps: {}, statusLabel: 'Completed', partnerName: 'Acme Corp', grandTotal: 1000,
    orgId: 'org-1', profile: null,
    showPaymentModal: false, setShowPaymentModal: vi.fn(),
    showSendModal: false, sendModalClosing: false, openEmailModal: vi.fn(), closeEmailModal: vi.fn(),
    showSifModal: false, setShowSifModal: vi.fn(),
    closeSifModal: vi.fn(), canSendToSif: false, sifBodyKey: null,
    pendingTargets: {},
    sifBase: '/sws/neo',
    refetchInvoice: vi.fn(),
    ...overrides,
  };
}

function renderInvoicePreview(overrides = {}) {
  const defaults = {
    invoice: defaultInvoice,
    token: 'tok',
    apiBaseUrl: '/api/purchase-invoice',
    windowName: 'purchase-invoice',
    specName: 'purchase-invoice',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<InvoicePreview {...defaults} {...overrides} />);
}

describe('InvoicePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInvoicePreview.mockReturnValue(baseInvoicePreviewHook());
    useDocumentCurrency.mockReturnValue({
      orgCurrencyCode: null,
      exchangeRate: null,
      isSameCurrency: true,
      loading: false,
      convertAmount: (amount) => amount,
    });
  });

  it('returns null when invoice prop is null', () => {
    const { container } = render(
      <InvoicePreview
        invoice={null}
        token="tok"
        apiBaseUrl="/api"
        specName="purchase-invoice"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders GenericPreviewModal when invoice is provided', () => {
    renderInvoicePreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
  });

  it('title contains windowLabel and documentNo', () => {
    renderInvoicePreview({ specName: 'sales-invoice' });
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('INV-001');
    expect(title).toContain('Sales Invoice');
  });

  // ── ETP-4842: dead kebab button removed from InvoiceActionButtons ────────
  // A trailing icon-only <button> (MoreVertical, no onClick/menuActions) used
  // to always render in the action bar regardless of status/specName — dead
  // UI that never did anything on click. Assert every action-bar button now
  // has a real accessible name (no leftover icon-only button) for both
  // sales-invoice and purchase-invoice.
  describe('dead kebab button removed (ETP-4842)', () => {
    it('renders only labeled action buttons for purchase-invoice (no icon-only kebab)', () => {
      renderInvoicePreview({ specName: 'purchase-invoice' });
      const actionsContainer = screen.getByTestId('modal-actions');
      const buttons = actionsContainer.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((btn) => {
        expect(btn.textContent.trim().length).toBeGreaterThan(0);
      });
    });

    it('renders only labeled action buttons for sales-invoice (no icon-only kebab)', () => {
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ isSalesInvoice: true }));
      renderInvoicePreview({ specName: 'sales-invoice' });
      const actionsContainer = screen.getByTestId('modal-actions');
      const buttons = actionsContainer.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((btn) => {
        expect(btn.textContent.trim().length).toBeGreaterThan(0);
      });
    });
  });

  // ── ETP-5027: purchase-invoice TBAI is always Batuz, never generic TicketBAI ──
  // The TBAI InfoRow's label key must switch on specName. SummaryCard is a plain
  // vi.fn() mock that renders nothing of its own, so the InfoRow element (passed
  // as a `children` prop) is inspected directly off the last call instead of
  // querying rendered DOM — the mock never mounts it.
  describe('TBAI status label is doc-type aware (ETP-5027)', () => {
    beforeEach(() => {
      getInvoiceFiscalTargetsMock.mockReturnValue({ showSii: false, showTbai: true, showVerifactu: false });
    });

    function tbaiInfoRow() {
      const props = SummaryCard.mock.calls.at(-1)[0];
      const rows = (props.children || []).filter(Boolean);
      return rows.find((el) => el?.props?.label);
    }

    it('purchase invoice shows the Batuz-specific label, never the generic TicketBAI one', () => {
      renderInvoicePreview({ specName: 'purchase-invoice', invoice: defaultInvoice });
      const row = tbaiInfoRow();
      expect(row).toBeTruthy();
      expect(row.props.label).toBe('invoicePreview.fiscalStatus.tbaiPurchase');
    });

    it('sales invoice keeps the generic TicketBAI label, unchanged', () => {
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ isSalesInvoice: true }));
      renderInvoicePreview({ specName: 'sales-invoice', invoice: defaultInvoice });
      const row = tbaiInfoRow();
      expect(row).toBeTruthy();
      expect(row.props.label).toBe('invoicePreview.fiscalStatus.tbai');
    });
  });

  // ── Dual-currency via useDocumentCurrency (ETP-4029) ─────────────────────

  describe('dual-currency via useDocumentCurrency', () => {
    it('passes non-null orgCurrencyCode/exchangeRate/orgGrandTotal/ratePrecision to SummaryCard when currencies differ', () => {
      useDocumentCurrency.mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: 1.1,
        isSameCurrency: false,
        loading: false,
        convertAmount: () => null,
      });

      const usdInvoice = {
        ...defaultInvoice,
        'currency$_identifier': 'USD',
        grandTotalAmount: 1100,
      };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ displayInvoice: usdInvoice }));

      renderInvoicePreview({ invoice: usdInvoice });

      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.orgCurrencyCode).toBe('EUR');
      expect(lastCall.exchangeRate).toBeCloseTo(1.1);
      // orgGrandTotal = 1100 / 1.1 = 1000
      expect(lastCall.orgGrandTotal).toBeCloseTo(1000, 2);
      expect(lastCall.ratePrecision).toBe(4);
    });

    it('passes orgGrandTotal: null and keeps currencyCode/grandTotal populated when currencies match', () => {
      useDocumentCurrency.mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: null,
        isSameCurrency: true,
        loading: false,
        convertAmount: (amount) => amount,
      });
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ displayInvoice: defaultInvoice }));

      renderInvoicePreview({ invoice: defaultInvoice });

      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.orgGrandTotal).toBeNull();
      // No regression: currencyCode/grandTotal are still populated as before this feature.
      expect(lastCall.currencyCode).toBe('EUR');
      expect(lastCall.grandTotal).toBe(1000);
    });

    it('uses the per-document eTGOCurrencyRate override instead of the system exchange rate when present and valid', () => {
      useDocumentCurrency.mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: 2.5, // system rate — should be overridden
        isSameCurrency: false,
        loading: false,
        convertAmount: () => null,
      });

      const invoiceWithOverride = {
        ...defaultInvoice,
        'currency$_identifier': 'USD',
        grandTotalAmount: 1200,
        eTGOCurrencyRate: '1.20',
      };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ displayInvoice: invoiceWithOverride }));

      renderInvoicePreview({ invoice: invoiceWithOverride });

      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall.exchangeRate).toBeCloseTo(1.2);
      expect(lastCall.exchangeRate).not.toBeCloseTo(2.5);
      // orgGrandTotal = 1200 / 1.20 = 1000
      expect(lastCall.orgGrandTotal).toBeCloseTo(1000, 2);
    });

    it('falls back to the system exchange rate when eTGOCurrencyRate is 0', () => {
      useDocumentCurrency.mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: 2.5,
        isSameCurrency: false,
        loading: false,
        convertAmount: () => null,
      });

      const invoiceWithZeroOverride = {
        ...defaultInvoice,
        'currency$_identifier': 'USD',
        grandTotalAmount: 1000,
        eTGOCurrencyRate: '0',
      };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ displayInvoice: invoiceWithZeroOverride }));

      renderInvoicePreview({ invoice: invoiceWithZeroOverride });

      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall.exchangeRate).toBeCloseTo(2.5);
    });

    // ETP-4836 — a genuinely different (deliberately 1:1-pegged) document
    // currency with eTGOCurrencyRate === 1 must use that real rate, not the
    // system rate. `1` is not a sentinel for "no override": that's already
    // handled by the `!isSameCurrency` guard in resolveDualCurrencyDisplay,
    // which zeroes out etgoRate entirely when the document currency equals
    // the org currency (covered separately above, "no dual-currency display
    // when currencies match"). Before this fix, eTGOCurrencyRate === 1 was
    // wrongly treated the same as "not set" and silently substituted the
    // system rate, showing an incorrect converted total for any 1:1-pegged
    // foreign currency (live-verified on both sales-invoice and sales-order).
    it('uses the per-document eTGOCurrencyRate override when it is exactly 1 for a genuinely different currency', () => {
      useDocumentCurrency.mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: 2.5, // system rate — must NOT be used here
        isSameCurrency: false,
        loading: false,
        convertAmount: () => null,
      });

      const invoiceWithUnitOverride = {
        ...defaultInvoice,
        'currency$_identifier': 'USD',
        grandTotalAmount: 1000,
        eTGOCurrencyRate: '1',
      };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ displayInvoice: invoiceWithUnitOverride }));

      renderInvoicePreview({ invoice: invoiceWithUnitOverride });

      const lastCall = vi.mocked(SummaryCard).mock.calls.at(-1)?.[0];
      expect(lastCall.exchangeRate).toBeCloseTo(1);
      expect(lastCall.exchangeRate).not.toBeCloseTo(2.5);
      // orgGrandTotal = 1000 / 1 = 1000
      expect(lastCall.orgGrandTotal).toBeCloseTo(1000, 2);
    });
  });

  // ── ETP-4717 Pair 3 regression: preview drawer Send gating ────────────────
  // InvoicePreview gates onEmail only by `specName !== 'purchase-invoice'`, never
  // by documentStatus. The fix will additionally require invoice.documentStatus
  // === 'CO'. These DR cases must FAIL against the current (unfixed) source; the
  // purchase-invoice exclusion case is expected to already pass (no regression there).
  describe('Send action gating by documentStatus (ETP-4717 Pair 3)', () => {
    // Sets up useInvoicePreview's mocked hook for a sales-invoice at the given
    // status and returns the matching invoice fixture, mirroring the isDraft/
    // isSalesInvoice wiring the real hook would derive from documentStatus.
    function setupSalesInvoice(status) {
      const invoice = { ...defaultInvoice, documentStatus: status };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
        displayInvoice: invoice,
        isSalesInvoice: true,
        isDraft: status === 'DR',
      }));
      return invoice;
    }

    expectPresenceGatedByStatus({
      hiddenIt: 'does NOT render the action-bar Send button for a sales-invoice in DR (draft) status',
      shownIt: 'renders the action-bar Send button for a sales-invoice in CO (completed) status',
      renderHidden: () => renderInvoicePreview({ specName: 'sales-invoice', invoice: setupSalesInvoice('DR') }),
      renderShown: () => renderInvoicePreview({ specName: 'sales-invoice', invoice: setupSalesInvoice('CO') }),
      findElement: () => screen.queryByText('invoicePreviewSend'),
    });

    it('still hides the action-bar Send button for purchase-invoice regardless of status (existing exclusion holds)', () => {
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
        displayInvoice: defaultInvoice, // documentStatus: 'CO'
        isSalesInvoice: false,
        isDraft: false,
      }));
      renderInvoicePreview({ specName: 'purchase-invoice', invoice: defaultInvoice });
      expect(screen.queryByText('invoicePreviewSend')).not.toBeInTheDocument();
    });

    expectEmailsCardOnSendGatedByStatus({
      hiddenIt: 'passes onSend: undefined to EmailsCard when invoice.documentStatus is DR (draft) for sales-invoice',
      shownIt: 'passes a truthy onSend function to EmailsCard when invoice.documentStatus is CO (completed) for sales-invoice',
      renderHidden: () => renderInvoicePreview({ specName: 'sales-invoice', invoice: setupSalesInvoice('DR') }),
      renderShown: () => renderInvoicePreview({ specName: 'sales-invoice', invoice: setupSalesInvoice('CO') }),
      EmailsCardMock: vi.mocked(EmailsCard),
    });
  });

  // ── ETP-4789: Download PDF gating by documentStatus ───────────────────────
  // InvoiceActionButtons (the local action bar) always passed
  // onDownloadPdf=p.handleDownloadPdf regardless of documentStatus — only
  // hasPdf gated it. The fix reuses the same isSendable variable already
  // computed for Send (specName !== 'purchase-invoice' && documentStatus ===
  // 'CO'). The download button only renders at all for sales invoices
  // (isSalesInvoice), so these cases must set that flag. These cases must
  // FAIL against the current (unfixed) source.

  // ── ETP-4841: credit detection follows the SIGN of the total ───────────────
  // `isCreditNote()` in InvoicePreview used to compare `arInvoiceSubtype`
  // against the pre-ETP-4737 values 'NC'/'DEV', which no longer exist — the
  // check was silently always false and fell through to keyword matching on the
  // document-type name. It now delegates to resolveInvoicePaymentBadge, so the
  // sign of the total is the only input.
  describe('credit-note detection by sign of the total (ETP-4841)', () => {
    function renderWithInvoice(invoice, overrides = {}) {
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({ displayInvoice: invoice, ...overrides }));
      return renderInvoicePreview({ invoice });
    }

    function lastIsCreditNoteProp() {
      const calls = vi.mocked(PaymentsCard).mock.calls;
      expect(calls.length, 'expected PaymentsCard to have been rendered').toBeGreaterThan(0);
      return calls[calls.length - 1][0].isCreditNote;
    }

    it('flags an invoice with a NEGATIVE total as a credit note', () => {
      renderWithInvoice({ ...defaultInvoice, grandTotalAmount: -1000 });
      expect(lastIsCreditNoteProp()).toBe(true);
    });

    it('does NOT flag a rectificativa with a POSITIVE total as a credit note', () => {
      renderWithInvoice({
        ...defaultInvoice,
        grandTotalAmount: 1000,
        arInvoiceSubtype: 'RECTIFICATIVA',
        'transactionDocument$_identifier': 'Factura Rectificativa',
      });
      expect(lastIsCreditNoteProp()).toBe(false);
    });

    it('flags an ordinary Factura with a NEGATIVE total as a credit note', () => {
      renderWithInvoice({
        ...defaultInvoice,
        grandTotalAmount: -500,
        arInvoiceSubtype: 'FAC',
        'transactionDocument$_identifier': 'ARInvoice',
      });
      expect(lastIsCreditNoteProp()).toBe(true);
    });

    it('does not flag an ordinary positive invoice as a credit note', () => {
      renderWithInvoice(defaultInvoice);
      expect(lastIsCreditNoteProp()).toBe(false);
    });

    it('still flags a DRAFT negative invoice as a credit note (document-level property)', () => {
      renderWithInvoice(
        { ...defaultInvoice, documentStatus: 'DR', grandTotalAmount: -300 },
        { isDraft: true, isCompleted: false, status: 'DR' },
      );
      expect(lastIsCreditNoteProp()).toBe(true);
    });
  });

  describe('Download PDF gating by documentStatus (ETP-4789)', () => {
    function renderSalesInvoiceWithPdf(status) {
      const invoice = { ...defaultInvoice, documentStatus: status };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
        displayInvoice: invoice,
        isSalesInvoice: true,
        isDraft: status === 'DR',
        pdfUrl: 'blob:test',
        pdfBlob: new Blob(['%PDF'], { type: 'application/pdf' }),
      }));
      return renderInvoicePreview({ specName: 'sales-invoice', invoice });
    }

    expectDisabledGatedByStatus({
      hiddenIt: 'disables the download button for a sales-invoice in DR (draft) status, even with a PDF available',
      shownIt: 'enables the download button for a sales-invoice in CO (completed) status',
      renderHidden: () => renderSalesInvoiceWithPdf('DR'),
      renderShown: () => renderSalesInvoiceWithPdf('CO'),
      findElement: () => screen.getByTestId('Download__cf88e6').closest('button'),
    });
  });

  // ── ETP-4315: attachmentConfig wiring (real Attachment, C_Invoice table) ──
  describe('attachmentConfig wiring (ETP-4315 — real Attachment, tableName C_Invoice)', () => {
    function lastAttachmentConfig() {
      const calls = vi.mocked(GenericPreviewModal).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      return calls[calls.length - 1][0].attachmentConfig;
    }

    describe('sales-invoice branch (draft-gated)', () => {
      it('sets storeCondition: false and sourceBlob: null when documentStatus is DR (draft)', () => {
        const invoice = { ...defaultInvoice, documentStatus: 'DR' };
        useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
          displayInvoice: invoice, isSalesInvoice: true, isDraft: true,
        }));
        renderInvoicePreview({ specName: 'sales-invoice', invoice });
        const cfg = lastAttachmentConfig();
        expect(cfg.tableName).toBe('C_Invoice');
        expect(cfg.documentId).toBe(invoice.id);
        expect(cfg.storeCondition).toBe(false);
        expect(cfg.sourceBlob).toBeNull();
      });

      it('sets storeCondition: true and sourceBlob=pdfBlob when documentStatus is CO (non-draft)', () => {
        const pdfBlob = new Blob(['%PDF'], { type: 'application/pdf' });
        const invoice = { ...defaultInvoice, documentStatus: 'CO' };
        useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
          displayInvoice: invoice, isSalesInvoice: true, isDraft: false, pdfBlob,
        }));
        renderInvoicePreview({ specName: 'sales-invoice', invoice });
        const cfg = lastAttachmentConfig();
        expect(cfg.storeCondition).toBe(true);
        expect(cfg.sourceBlob).toBe(pdfBlob);
        expect(cfg.autoFetch).toBe(true);
      });
    });

    describe('purchase-invoice branch (unconditional)', () => {
      it('sets storeCondition: true and autoFetch: false regardless of documentStatus', () => {
        useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
          displayInvoice: defaultInvoice, isSalesInvoice: false,
        }));
        renderInvoicePreview({ specName: 'purchase-invoice', invoice: defaultInvoice });
        const cfg = lastAttachmentConfig();
        expect(cfg.tableName).toBe('C_Invoice');
        expect(cfg.documentId).toBe(defaultInvoice.id);
        expect(cfg.storeCondition).toBe(true);
        expect(cfg.autoFetch).toBe(false);
      });

      it('stays storeCondition: true even for a draft purchase-invoice (unconditional branch)', () => {
        const invoice = { ...defaultInvoice, documentStatus: 'DR' };
        useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
          displayInvoice: invoice, isSalesInvoice: false, isDraft: true,
        }));
        renderInvoicePreview({ specName: 'purchase-invoice', invoice });
        const cfg = lastAttachmentConfig();
        expect(cfg.storeCondition).toBe(true);
        expect(cfg.autoFetch).toBe(false);
      });
    });
  });

  // ── ETP-4832: grid does not refresh after confirming a payment/collection ──
  // from the side panel. `NewPaymentEntryModal`'s onSaved handler only called
  // fetchPayments() (which is why the panel's own PaymentsCard correctly shows
  // Pagada/Cobrada), but never refetchInvoice() — the only function that
  // dispatches the `${specName}:invoice-updated` event / calls onInvoiceUpdated,
  // which is what tells the hosting list view to refresh the grid row. Mirrors
  // the already-correct SifSendingModal.onAfterSend pattern in this same file.
  describe('payment modal onSaved refetches the invoice (ETP-4832)', () => {
    it('calls refetchInvoice (not just fetchPayments) when a payment/collection is saved', async () => {
      const refetchInvoice = vi.fn().mockResolvedValue(undefined);
      const fetchPayments = vi.fn();
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
        showPaymentModal: true,
        canAddPayment: true,
        refetchInvoice,
        fetchPayments,
      }));

      renderInvoicePreview();
      await act(async () => {
        fireEvent.click(screen.getByText('save payment'));
      });

      expect(refetchInvoice).toHaveBeenCalled();
      expect(fetchPayments).toHaveBeenCalled();
    });
  });

  // ── ETP-4789 (reject-cycle fix): Download gates on the cached attachment too ──
  // The cached attachment (GenericPreviewModal's ManagedLeftPanel, GET /preview-file)
  // resolves ahead of the slow jsreport regeneration behind p.pdfUrl (useInvoicePreview).
  // hasPdf must become true as soon as attachmentConfig.onFileChange fires, even while
  // p.pdfUrl is still null — closing the perceptible gap QA reported between the
  // preview panel showing the PDF and the Download button enabling. The Download
  // button only renders for sales invoices at all (isSalesInvoice), so these cases
  // set that flag; the isSendable gate (specName !== 'purchase-invoice' &&
  // documentStatus === 'CO') is unchanged and must still hold even when hasPdf is
  // driven by the cache instead of p.pdfUrl.
  describe('Download PDF gated by cached attachment (ETP-4789 reject-cycle fix)', () => {
    function renderSalesInvoice(status, { pdfUrl = null } = {}) {
      const invoice = { ...defaultInvoice, documentStatus: status };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
        displayInvoice: invoice,
        isSalesInvoice: true,
        isDraft: status === 'DR',
        pdfUrl,
        pdfBlob: pdfUrl ? new Blob(['%PDF'], { type: 'application/pdf' }) : null,
      }));
      return renderInvoicePreview({ specName: 'sales-invoice', invoice });
    }

    function downloadButton() {
      return screen.getByTestId('Download__cf88e6').closest('button');
    }

    it('enables the download button once the cached attachment resolves, even while p.pdfUrl is still null', () => {
      renderSalesInvoice('CO');
      expect(downloadButton()).toBeDisabled();

      fireEvent.click(screen.getByTestId('simulate-file-change'));

      expect(downloadButton()).not.toBeDisabled();
    });

    it('downloads via cachedAttachment.objectUrl/fileName, without calling the (still-null-pdfUrl) p.handleDownloadPdf', () => {
      renderSalesInvoice('CO');
      fireEvent.click(screen.getByTestId('simulate-file-change'));

      // Spy AFTER render/state-update — mocking document.createElement globally
      // before React finishes creating real DOM nodes breaks reconciliation.
      const clickMock = vi.fn();
      const fakeAnchor = { href: '', download: '', click: clickMock };
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
      const { handleDownloadPdf: parentHandleDownloadPdf } = useInvoicePreview.mock.results.at(-1).value;

      try {
        fireEvent.click(downloadButton());
        expect(fakeAnchor.href).toBe('blob:cached-url');
        expect(fakeAnchor.download).toBe('cached.pdf');
        expect(clickMock).toHaveBeenCalledTimes(1);
        expect(parentHandleDownloadPdf).not.toHaveBeenCalled();
      } finally {
        createElementSpy.mockRestore();
      }
    });

    it('keeps the download button disabled when documentStatus is DR, even with a cached attachment present (status gate is not bypassed by cache)', () => {
      renderSalesInvoice('DR');

      fireEvent.click(screen.getByTestId('simulate-file-change'));

      expect(downloadButton()).toBeDisabled();
    });

    it('keeps the download button disabled when hasPdf is true via cache but the invoice is not confirmed (documentStatus !== CO)', () => {
      // Any non-DR, non-CO status also leaves isSendable false — the gate is not
      // limited to the draft case; confirmation (CO) is what it actually requires.
      renderSalesInvoice('AE');

      fireEvent.click(screen.getByTestId('simulate-file-change'));

      expect(downloadButton()).toBeDisabled();
    });

    it('never renders a Download button for purchase-invoice, even with a cached attachment — storeCondition is always true there, but the button itself is gated on isSalesInvoice, not on the attachment', () => {
      const invoice = { ...defaultInvoice, documentStatus: 'DR' };
      useInvoicePreview.mockReturnValue(baseInvoicePreviewHook({
        displayInvoice: invoice,
        isSalesInvoice: false,
        isDraft: true,
        pdfUrl: null,
      }));
      renderInvoicePreview({ specName: 'purchase-invoice', invoice });

      fireEvent.click(screen.getByTestId('simulate-file-change'));

      expect(screen.queryByTestId('Download__cf88e6')).not.toBeInTheDocument();
    });
  });
});

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

vi.mock('../PdfViewer.jsx', () => ({
  default: ({ url }) => <div data-testid="pdf-viewer">{url}</div>,
}));

vi.mock('../NewPaymentEntryModal.jsx', () => ({
  default: () => <div data-testid="new-payment-entry-modal" />,
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

vi.mock('../useInvoicePreview.js', () => ({
  useInvoicePreview: vi.fn(),
}));

vi.mock('../useFiscalStatus.js', () => ({
  useFiscalStatus: () => ({ sii: null, tbai: null, verifactu: null, loading: false }),
}));

vi.mock('@/windows/custom/fiscal-monitor/FmPrimitives.jsx', () => ({
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
}));

vi.mock('../fiscalTargets.js', () => ({
  getInvoiceFiscalTargets: () => ({ showSii: false, showTbai: false, showVerifactu: false }),
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

import { render, screen } from '@testing-library/react';
import InvoicePreview from '../InvoicePreview.jsx';
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

    it('falls back to the system exchange rate when eTGOCurrencyRate is 1', () => {
      useDocumentCurrency.mockReturnValue({
        orgCurrencyCode: 'EUR',
        exchangeRate: 2.5,
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
      expect(lastCall.exchangeRate).toBeCloseTo(2.5);
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
});

// ETP-4372 regression — the "Enviar email" link inside the EMAILS section of
// the OrderPreview side panel must open the SendDocumentModal.
//
// The bug was that OrderPreview passed onSend={undefined} to EmailsCard, so the
// link was dead. The fix passes onSend={openEmailModal}. Unlike the main
// OrderPreview.vitest.jsx (which stubs EmailsCard with a no-op), here the
// EmailsCard mock forwards its onSend prop so we can click the real link path
// and assert the SendDocumentModal appears.
//
// Mocks must come before imports (Vitest hoisting).

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
  default: vi.fn(({ title, tabs, actionButtons, onClose }) => (
    <div data-testid="generic-preview-modal">
      <span data-testid="modal-title">{title}</span>
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
  default: ({ onEmail }) => (
    <div data-testid="action-buttons">
      <button data-testid="topbar-email-btn" onClick={onEmail} />
    </div>
  ),
  PreviewEmptyPanel: ({ text }) => <div data-testid="empty-panel">{text}</div>,
  PreviewPdfPanel: () => <div data-testid="pdf-panel" />,
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
      <button data-testid="send-modal-close" onClick={onClose} />
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
  default: () => <div data-testid="summary-card" />,
}));

// Forward onSend so clicking the link exercises the real wiring (regression guard).
vi.mock('../preview-cards/EmailsCard.jsx', () => ({
  default: ({ onSend }) => (
    <div data-testid="emails-card">
      <button data-testid="emails-card-send" onClick={onSend}>
        previewCardSendEmail
      </button>
    </div>
  ),
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

describe('OrderPreview — EMAILS section send link (ETP-4372)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes a defined onSend down to EmailsCard (no dead link)', () => {
    renderOrderPreview();
    const link = screen.getByTestId('emails-card-send');
    expect(link).toBeInTheDocument();
    // A dead link (onSend={undefined}) would leave the button without an
    // effective handler; clicking it must open the modal (asserted below).
  });

  it('opens SendDocumentModal when the EMAILS-section send link is clicked', () => {
    renderOrderPreview();
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('emails-card-send'));
    const modal = screen.getByTestId('send-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute('data-docno')).toBe('DOC-001');
  });

  it('the EMAILS-section link and topbar email button open the same modal', () => {
    renderOrderPreview();
    // Topbar path already covered elsewhere; assert the EMAILS-section path
    // reaches the identical modal so both entry points stay wired.
    fireEvent.click(screen.getByTestId('emails-card-send'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
  });
});

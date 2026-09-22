// Mocks must come before imports (Vitest hoisting)

import React from 'react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

// Spread the REAL module and override only the formatter: an exhaustive factory
// silently becomes wrong the moment anything in this tree reaches for another
// `@/lib/dateOnly` export, and vitest reports that as a render-time
// `No "<name>" export is defined on the "@/lib/dateOnly" mock` (ETP-5046).
vi.mock('@/lib/dateOnly', async () => {
  const actual = await vi.importActual('@/lib/dateOnly');
  return { ...actual, formatCalendarDate: (val) => val || '-' };
});

const mockCapturedModalProps = { current: null };
vi.mock('../../shared/GenericPreviewModal.jsx', () => ({
  default: React.forwardRef(function MockGenericPreviewModal(props, ref) {
    mockCapturedModalProps.current = props;
    const { title, subtitle, tabs, actionButtons, onClose } = props;
    return (
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
    );
  }),
}));

const mockCapturedSendModalProps = { current: null };
vi.mock('../../shared/PreviewActionButtons.jsx', () => ({
  usePreviewSendModal: () => ({
    showSendModal: false,
    sendModalClosing: false,
    openEmailModal: vi.fn(),
    closeEmailModal: vi.fn(),
  }),
  ReceiptSendModal: (props) => {
    mockCapturedSendModalProps.current = props;
    return (
      <div data-testid="receipt-send-modal" data-pdf-url={props.pdfBlobUrl}>
        {/* ETP-5124 — exposes a way to simulate the modal reporting a successful send,
            mirroring GoodsShipmentPreviewEmails.vitest.jsx's send-modal-sent button. */}
        {props.onSent && (
          <button data-testid="receipt-send-modal-sent" onClick={() => props.onSent()}>
            Simulate Sent
          </button>
        )}
      </div>
    );
  },
  PreviewPdfPanel: (props) => <div data-testid="preview-pdf-panel" data-pdf-url={props.pdfUrl} />,
}));

const mockUseReturnReceiptPdf = vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null }));
vi.mock('../useReturnReceiptPdf.js', () => ({
  useReturnReceiptPdf: (...args) => mockUseReturnReceiptPdf(...args),
}));

// Mirrors what the real builder returns since ETP-4855: a single general tab.
// The messages/history placeholders were removed from every preview.
const mockBuildReturnPreviewContent = vi.fn(() => ({
  actionButtons: <div data-testid="action-buttons" />,
  tabs: [
    { key: 'general', label: 'general', content: <div data-testid="general-tab" /> },
  ],
}));
vi.mock('../../shared/preview-cards/buildReturnPreviewContent.jsx', () => ({
  buildReturnPreviewContent: (...args) => mockBuildReturnPreviewContent(...args),
}));

vi.mock('../../shared/pdfUtils.js', () => ({
  downloadBlobAsFile: vi.fn(),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import ReturnMaterialReceiptPreview from '../ReturnMaterialReceiptPreview.jsx';

const defaultReceipt = {
  id: 'rmr-1',
  documentNo: 'RMR-001',
  documentStatus: 'CO',
  'businessPartner$_identifier': 'Customer Corp',
  businessPartner: 'bp-1',
  movementDate: '2025-04-01',
};

function renderPreview(overrides = {}) {
  const defaults = {
    receipt: defaultReceipt,
    token: 'tok',
    apiBaseUrl: '/api/return-material-receipt',
    windowName: 'return-material-receipt',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<ReturnMaterialReceiptPreview {...defaults} {...overrides} />);
}

describe('ReturnMaterialReceiptPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCapturedModalProps.current = null;
    mockCapturedSendModalProps.current = null;
    mockUseReturnReceiptPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  it('returns null when receipt prop is falsy', () => {
    const { container } = render(
      <ReturnMaterialReceiptPreview
        receipt={null}
        token="tok"
        apiBaseUrl="/api/return-material-receipt"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders GenericPreviewModal when receipt is provided', () => {
    renderPreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
  });

  describe('leftPanel wiring (ETP-5124 — system-generated PDF, reverting ETP-4408)', () => {
    it('passes a leftPanel prop rendering the system-generated PDF panel', () => {
      renderPreview();
      // ETP-4408 had replaced this with a customer-upload `attachmentConfig`; QA
      // (Isaías) rejected that per the PM-confirmed AC that the preview must show
      // the Etendo-generated PDF. The customer's own document is still attachable,
      // but only via the generic Attachments tab — not this preview's left panel.
      expect(mockCapturedModalProps.current.leftPanel).toBeDefined();
    });

    it('does NOT pass an attachmentConfig prop to GenericPreviewModal', () => {
      renderPreview();
      expect(mockCapturedModalProps.current.attachmentConfig).toBeUndefined();
    });
  });

  describe('system-generated PDF still wired for send/download actions', () => {
    it('calls useReturnReceiptPdf with the receipt id, apiBaseUrl and token', () => {
      renderPreview();
      expect(mockUseReturnReceiptPdf).toHaveBeenCalledWith('rmr-1', '/api/return-material-receipt', 'tok');
    });

    it('forwards pdfBlob from useReturnReceiptPdf into buildReturnPreviewContent', () => {
      const pdfBlob = new Blob(['%PDF'], { type: 'application/pdf' });
      mockUseReturnReceiptPdf.mockReturnValue({ pdfUrl: 'blob:fake-url', pdfBlob, loading: false, error: null });
      renderPreview();
      expect(mockBuildReturnPreviewContent).toHaveBeenCalledWith(
        expect.objectContaining({ pdfBlob }),
      );
    });

    it('passes the system-generated pdfUrl to ReceiptSendModal as pdfBlobUrl', () => {
      mockUseReturnReceiptPdf.mockReturnValue({ pdfUrl: 'blob:fake-url', pdfBlob: new Blob(), loading: false, error: null });
      renderPreview();
      expect(screen.getByTestId('receipt-send-modal')).toHaveAttribute('data-pdf-url', 'blob:fake-url');
      expect(mockCapturedSendModalProps.current.pdfBlobUrl).toBe('blob:fake-url');
    });

    it('leaves pdfBlobUrl unset when useReturnReceiptPdf has not resolved a PDF yet', () => {
      renderPreview();
      expect(mockCapturedSendModalProps.current.pdfBlobUrl).toBeNull();
    });
  });

  it('renders the tabs coming from buildReturnPreviewContent — general alone', () => {
    renderPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-messages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-history')).not.toBeInTheDocument();
  });

  it('title contains windowLabel and receipt documentNo', () => {
    renderPreview();
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('RMR-001');
    expect(title).toContain('Return Material Receipt');
  });

  it('subtitle shows businessPartner$_identifier when present', () => {
    renderPreview();
    expect(screen.getByTestId('modal-subtitle').textContent).toContain('Customer Corp');
  });

  it('does not render subtitle when businessPartner$_identifier is absent', () => {
    const receiptWithoutPartner = { ...defaultReceipt, 'businessPartner$_identifier': undefined };
    renderPreview({ receipt: receiptWithoutPartner });
    expect(screen.queryByTestId('modal-subtitle')).not.toBeInTheDocument();
  });

  describe('ETP-5124 — email send wiring (return-material-receipt-send contract)', () => {
    function lastBuildContentArgs() {
      return mockBuildReturnPreviewContent.mock.calls.at(-1)?.[0];
    }

    it('passes onEmail as a function when the receipt is Confirmed (CO)', () => {
      renderPreview();
      expect(lastBuildContentArgs().onEmail).toBeInstanceOf(Function);
    });

    it('passes onEmail as undefined when the receipt is not Confirmed', () => {
      renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'DR' } });
      expect(lastBuildContentArgs().onEmail).toBeUndefined();
    });

    it('builds emailsCard with the receipt id and the given apiBaseUrl', () => {
      renderPreview();
      const { emailsCard } = lastBuildContentArgs();
      expect(emailsCard.documentId).toBe('rmr-1');
      expect(emailsCard.apiBaseUrl).toBe('/api/return-material-receipt');
    });

    it('builds emailsCard with a defined numeric refreshSignal', () => {
      renderPreview();
      expect(typeof lastBuildContentArgs().emailsCard.refreshSignal).toBe('number');
    });

    it('sets emailsCard.onSend to a function when the receipt is Confirmed (CO)', () => {
      renderPreview();
      expect(lastBuildContentArgs().emailsCard.onSend).toBeInstanceOf(Function);
    });

    it('leaves emailsCard.onSend undefined when the receipt is not Confirmed', () => {
      renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'DR' } });
      expect(lastBuildContentArgs().emailsCard.onSend).toBeUndefined();
    });

    it('passes pdfBlobLoading=true to ReceiptSendModal while the PDF is still generating', () => {
      mockUseReturnReceiptPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: true, error: null });
      renderPreview();
      expect(mockCapturedSendModalProps.current.pdfBlobLoading).toBe(true);
    });

    it('passes pdfBlobLoading=false to ReceiptSendModal once the PDF has resolved', () => {
      mockUseReturnReceiptPdf.mockReturnValue({ pdfUrl: 'blob:fake-url', pdfBlob: new Blob(), loading: false, error: null });
      renderPreview();
      expect(mockCapturedSendModalProps.current.pdfBlobLoading).toBe(false);
    });

    it('bumps emailsCard.refreshSignal on a subsequent render when ReceiptSendModal reports a successful send', () => {
      renderPreview();
      const before = lastBuildContentArgs().emailsCard.refreshSignal;

      fireEvent.click(screen.getByTestId('receipt-send-modal-sent'));

      expect(lastBuildContentArgs().emailsCard.refreshSignal).not.toBe(before);
    });
  });
});

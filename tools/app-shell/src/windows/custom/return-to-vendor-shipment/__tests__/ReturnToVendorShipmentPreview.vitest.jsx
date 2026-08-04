// Mocks must come before imports (Vitest hoisting)
//
// ETP-4718 — "Enviar" (send-email) is only meaningful once the Purchase Return
// Shipment is Confirmado (documentStatus === 'CO'); Borrador (and any other
// non-final state) has nothing to send yet. This suite guards the `isSendable`
// gate that decides whether `onEmail` reaches buildReturnPreviewContent, and
// mirrors the existing conventions from
// return-material-receipt/__tests__/ReturnMaterialReceiptPreview.vitest.jsx.

import React from 'react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (val) => val || '-',
}));

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

const openEmailModalMock = vi.fn();
const closeEmailModalMock = vi.fn();
const mockCapturedSendModalProps = { current: null };
vi.mock('../../shared/PreviewActionButtons.jsx', () => ({
  usePreviewSendModal: () => ({
    showSendModal: false,
    sendModalClosing: false,
    openEmailModal: openEmailModalMock,
    closeEmailModal: closeEmailModalMock,
  }),
  ReceiptSendModal: (props) => {
    mockCapturedSendModalProps.current = props;
    return <div data-testid="receipt-send-modal" data-pdf-url={props.pdfBlobUrl} />;
  },
  PreviewPdfPanel: (props) => (
    <div data-testid="preview-pdf-panel" data-pdf-url={props.pdfUrl ?? ''} data-loading={String(props.pdfLoading)} />
  ),
}));

const mockUseReturnToVendorPdf = vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null }));
vi.mock('../useReturnToVendorPdf.js', () => ({
  useReturnToVendorPdf: (...args) => mockUseReturnToVendorPdf(...args),
}));

const mockBuildReturnPreviewContent = vi.fn(() => ({
  actionButtons: <div data-testid="action-buttons" />,
  tabs: [
    { key: 'general', label: 'general', content: <div data-testid="general-tab" /> },
    { key: 'messages', label: 'messages', content: <div data-testid="messages-tab" /> },
    { key: 'history', label: 'history', content: <div data-testid="history-tab" /> },
  ],
}));
vi.mock('../../shared/preview-cards/buildReturnPreviewContent.jsx', () => ({
  buildReturnPreviewContent: (...args) => mockBuildReturnPreviewContent(...args),
}));

vi.mock('../../shared/pdfUtils.js', () => ({
  downloadBlobAsFile: vi.fn(),
}));

import { render, screen } from '@testing-library/react';
import ReturnToVendorShipmentPreview from '../ReturnToVendorShipmentPreview.jsx';

const defaultShipment = {
  id: 'rtvs-1',
  documentNo: 'RTVS-001',
  documentStatus: 'CO',
  'businessPartner$_identifier': 'Vendor Corp',
  businessPartner: 'bp-1',
  movementDate: '2025-04-01',
};

function renderPreview(overrides = {}) {
  const defaults = {
    shipment: defaultShipment,
    token: 'tok',
    apiBaseUrl: '/api/return-to-vendor-shipment',
    windowName: 'return-to-vendor-shipment',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<ReturnToVendorShipmentPreview {...defaults} {...overrides} />);
}

describe('ReturnToVendorShipmentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCapturedModalProps.current = null;
    mockCapturedSendModalProps.current = null;
    mockUseReturnToVendorPdf.mockReturnValue({ pdfUrl: null, pdfBlob: null, loading: false, error: null });
  });

  it('returns null when shipment prop is falsy', () => {
    const { container } = render(
      <ReturnToVendorShipmentPreview
        shipment={null}
        token="tok"
        apiBaseUrl="/api/return-to-vendor-shipment"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders GenericPreviewModal when shipment is provided', () => {
    renderPreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
  });

  it('renders 3 tabs coming from buildReturnPreviewContent: general, messages, history', () => {
    renderPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-messages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });

  it('title contains windowLabel and shipment documentNo', () => {
    renderPreview();
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('RTVS-001');
    expect(title).toContain('Return to Vendor Shipment');
  });

  it('subtitle shows businessPartner$_identifier when present', () => {
    renderPreview();
    expect(screen.getByTestId('modal-subtitle').textContent).toContain('Vendor Corp');
  });

  it('does not render subtitle when businessPartner$_identifier is absent', () => {
    const shipmentWithoutPartner = { ...defaultShipment, 'businessPartner$_identifier': undefined };
    renderPreview({ shipment: shipmentWithoutPartner });
    expect(screen.queryByTestId('modal-subtitle')).not.toBeInTheDocument();
  });

  describe('isSendable gate (ETP-4718 — send-email only for documentStatus === "CO")', () => {
    it('passes onEmail=sendModal.openEmailModal to buildReturnPreviewContent when documentStatus is CO', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'CO' } });
      expect(mockBuildReturnPreviewContent).toHaveBeenCalledTimes(1);
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBe(openEmailModalMock);
    });

    it('passes onEmail=undefined to buildReturnPreviewContent when documentStatus is not CO (e.g. DR)', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } });
      expect(mockBuildReturnPreviewContent).toHaveBeenCalledTimes(1);
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBeUndefined();
    });

    it('does not wire onEmail for any other non-CO status either', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'VO' } });
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBeUndefined();
    });

    it('renders ReceiptSendModal regardless of documentStatus (modal wiring stays mounted; only the trigger button is gated)', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } });
      expect(screen.getByTestId('receipt-send-modal')).toBeInTheDocument();
    });
  });

  describe('ReceiptSendModal wiring', () => {
    it('forwards documentType (windowLabel), receipt, partnerName, apiBaseUrl, token and windowName', () => {
      renderPreview();
      expect(mockCapturedSendModalProps.current).toMatchObject({
        documentType: 'Return to Vendor Shipment',
        receipt: defaultShipment,
        partnerName: 'Vendor Corp',
        apiBaseUrl: '/api/return-to-vendor-shipment',
        token: 'tok',
        windowName: 'return-to-vendor-shipment',
      });
    });

    it('passes the system-generated pdfUrl to ReceiptSendModal as pdfBlobUrl', () => {
      mockUseReturnToVendorPdf.mockReturnValue({ pdfUrl: 'blob:fake-url', pdfBlob: new Blob(), loading: false, error: null });
      renderPreview();
      expect(screen.getByTestId('receipt-send-modal')).toHaveAttribute('data-pdf-url', 'blob:fake-url');
      expect(mockCapturedSendModalProps.current.pdfBlobUrl).toBe('blob:fake-url');
    });

    it('calls useReturnToVendorPdf with the shipment id, apiBaseUrl and token', () => {
      renderPreview();
      expect(mockUseReturnToVendorPdf).toHaveBeenCalledWith('rtvs-1', '/api/return-to-vendor-shipment', 'tok');
    });
  });
});

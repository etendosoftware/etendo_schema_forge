// Mocks must come before imports (Vitest hoisting)
//
// ETP-4717 — QA (Emilio Polliotti) rejected the ETP-4718 "Enviar" (send-email)
// action on this window: the frontend derives the email contract name as
// `${windowName}-send` (`return-to-vendor-shipment-send`), but the backend
// only registers `ReturnToVendorSendEmailContract.NAME` =
// `return-to-vendor-send`, so every click failed with "Unknown email
// contract". QA explicitly asked to REMOVE the action from this window
// rather than reconcile the contract name mismatch (that reconciliation is a
// separate, deliberately out-of-scope backend concern). The previous
// `isSendable` gate (documentStatus === 'CO') that used to decide whether
// `onEmail` reached `buildReturnPreviewContent` no longer exists — `onEmail`
// is never wired here, for any status. See the "ETP-4717 — Enviar action
// removed (no onEmail wiring)" describe block below, and mirrors the
// pre-existing convention from
// return-material-receipt/__tests__/ReturnMaterialReceiptPreview.vitest.jsx
// (which also never passes `onEmail`).
//
// ETP-4789 — Download PDF gets its own status gate on this window (it has no
// pre-existing isSendable to reuse for that purpose): only downloadable once
// the return shipment is Confirmado (CO). See the "Download PDF gating by
// documentStatus (ETP-4789)" describe block below.

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

  it('renders the tabs coming from buildReturnPreviewContent — general alone', () => {
    renderPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-messages')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-history')).not.toBeInTheDocument();
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

  it('forwards pdfBlob from useReturnToVendorPdf into buildReturnPreviewContent', () => {
    const pdfBlob = new Blob(['%PDF'], { type: 'application/pdf' });
    mockUseReturnToVendorPdf.mockReturnValue({ pdfUrl: 'blob:fake-url', pdfBlob, loading: false, error: null });
    renderPreview();
    expect(mockBuildReturnPreviewContent).toHaveBeenCalledWith(
      expect.objectContaining({ pdfBlob }),
    );
  });

  // ── ETP-4789: Download PDF gating by documentStatus ───────────────────────
  // Unlike the other 5 windows in this bug, this window has no pre-existing
  // isSendable (it never had a Send action). The fix computes a fresh
  // isDownloadable = documentStatus === 'CO' and forwards it as canDownload
  // into buildReturnPreviewContent (which applies the actual gate — see
  // buildReturnPreviewContent.test.js). These cases must FAIL against the
  // current (unfixed) source, which never passes canDownload at all.
  describe('Download PDF gating by documentStatus (ETP-4789)', () => {
    it('passes canDownload: false to buildReturnPreviewContent when documentStatus is DR (draft)', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } });
      expect(mockBuildReturnPreviewContent).toHaveBeenCalledWith(
        expect.objectContaining({ canDownload: false }),
      );
    });

    it('passes canDownload: true to buildReturnPreviewContent when documentStatus is CO (completed)', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'CO' } });
      expect(mockBuildReturnPreviewContent).toHaveBeenCalledWith(
        expect.objectContaining({ canDownload: true }),
      );
    });
  });

  it('does not render subtitle when businessPartner$_identifier is absent', () => {
    const shipmentWithoutPartner = { ...defaultShipment, 'businessPartner$_identifier': undefined };
    renderPreview({ shipment: shipmentWithoutPartner });
    expect(screen.queryByTestId('modal-subtitle')).not.toBeInTheDocument();
  });

  describe('ETP-4717 — Enviar action removed (no onEmail wiring)', () => {
    // This is the behavior-changing case: before ETP-4717, documentStatus ===
    // 'CO' wired onEmail to sendModal.openEmailModal (the ETP-4718 isSendable
    // gate). QA rejected the whole action for this window (email contract
    // name mismatch — see file header), so onEmail must now be undefined even
    // when the shipment is Confirmado. Asserted against the OLD source, this
    // exact expectation would have failed (old code passed openEmailModalMock
    // for CO), which is what confirms this is a genuine regression test.
    it('passes onEmail=undefined to buildReturnPreviewContent when documentStatus is CO', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'CO' } });
      expect(mockBuildReturnPreviewContent).toHaveBeenCalledTimes(1);
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBeUndefined();
    });

    it('passes onEmail=undefined to buildReturnPreviewContent when documentStatus is DR', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'DR' } });
      expect(mockBuildReturnPreviewContent).toHaveBeenCalledTimes(1);
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBeUndefined();
    });

    it('does not wire onEmail for any other status either', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: 'VO' } });
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBeUndefined();
    });

    it('does not wire onEmail when documentStatus is undefined', () => {
      const shipmentWithoutStatus = { ...defaultShipment };
      delete shipmentWithoutStatus.documentStatus;
      renderPreview({ shipment: shipmentWithoutStatus });
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBeUndefined();
    });

    it('does not wire onEmail when documentStatus is null', () => {
      renderPreview({ shipment: { ...defaultShipment, documentStatus: null } });
      const callArgs = mockBuildReturnPreviewContent.mock.calls[0][0];
      expect(callArgs.onEmail).toBeUndefined();
    });

    it('renders ReceiptSendModal regardless of documentStatus (modal wiring stays mounted even though no trigger ever opens it)', () => {
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

    it('calls useReturnToVendorPdf with the shipment id, apiBaseUrl, token and pdfCacheConfig', () => {
      renderPreview();
      expect(mockUseReturnToVendorPdf).toHaveBeenCalledWith(
        'rtvs-1',
        '/api/return-to-vendor-shipment',
        'tok',
        { tableName: 'M_InOut', storeCondition: true },
      );
    });
  });
});

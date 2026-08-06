// Mocks must come before imports (Vitest hoisting)

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

vi.mock('../../shared/PreviewActionButtons.jsx', () => ({
  PreviewPdfPanel: ({ pdfUrl }) => <div data-testid="pdf-panel" data-url={pdfUrl} />,
}));

const mockUseReturnToVendorPdf = vi.fn(() => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null }));
vi.mock('../useReturnToVendorPdf.js', () => ({
  useReturnToVendorPdf: (...args) => mockUseReturnToVendorPdf(...args),
}));

const mockDownloadBlobAsFile = vi.fn();
vi.mock('../../shared/pdfUtils.js', () => ({
  downloadBlobAsFile: (...args) => mockDownloadBlobAsFile(...args),
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

import { render, screen } from '@testing-library/react';
import ReturnToVendorShipmentPreview from '../ReturnToVendorShipmentPreview.jsx';

const defaultShipment = {
  id: 'rtv-1',
  documentNo: 'RTV-001',
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

  it('title contains windowLabel and shipment documentNo', () => {
    renderPreview();
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('RTV-001');
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

  it('renders 3 tabs coming from buildReturnPreviewContent: general, messages, history', () => {
    renderPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-messages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });
});

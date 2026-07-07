// Unit coverage for ReturnToVendorPreview — the dedicated side-panel preview
// for the return-to-vendor window. Mirrors the mocking style of
// shared/__tests__/OrderPreviewEmailLink.vitest.jsx: GenericPreviewModal is
// stubbed to expose title/subtitle/tabs/actionButtons/attachmentConfig, and
// EmailsCard/PreviewActionButtons forward their handlers so the send + download
// paths are exercised.
//
// Mocks must come before imports (Vitest hoisting).

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/lib/statusBadge.js', () => ({
  statusLabel: (code) => code,
}));

let capturedAttachmentConfig = null;
let capturedTitle = null;
let capturedSubtitle = null;
vi.mock('../../shared/GenericPreviewModal.jsx', () => ({
  default: vi.fn(({ title, subtitle, tabs, actionButtons, attachmentConfig, onClose, onEdit }) => {
    capturedAttachmentConfig = attachmentConfig;
    capturedTitle = title;
    capturedSubtitle = subtitle;
    return (
      <div data-testid="generic-preview-modal">
        <span data-testid="modal-title">{title}</span>
        <span data-testid="modal-subtitle">{subtitle ?? ''}</span>
        <div data-testid="modal-tabs">
          {tabs?.map((t) => (
            <div key={t.key} data-testid={`tab-${t.key}`}>{t.content}</div>
          ))}
        </div>
        <div data-testid="modal-actions">{actionButtons}</div>
        <button data-testid="edit-btn" onClick={onEdit} />
        <button data-testid="close-btn" onClick={onClose} />
      </div>
    );
  }),
}));

vi.mock('../../shared/PreviewActionButtons.jsx', () => ({
  default: ({ onEmail, onDownloadPdf, hasPdf }) => (
    <div data-testid="action-buttons" data-has-pdf={hasPdf ? 'yes' : 'no'}>
      <button data-testid="topbar-email-btn" onClick={onEmail} />
      <button data-testid="download-pdf-btn" onClick={onDownloadPdf} />
    </div>
  ),
  PreviewEmptyPanel: ({ text }) => <div data-testid="empty-panel">{text}</div>,
  PreviewPdfPanel: () => <div data-testid="pdf-panel" />,
}));

vi.mock('../../shared/preview-cards/SummaryCard.jsx', () => ({
  default: () => <div data-testid="summary-card" />,
}));

// Forward onSend so clicking the EMAILS-section link exercises the real wiring.
vi.mock('../../shared/preview-cards/EmailsCard.jsx', () => ({
  default: ({ onSend }) => (
    <div data-testid="emails-card">
      <button data-testid="emails-card-send" onClick={onSend} />
    </div>
  ),
}));

vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
  default: ({ onClose, documentNo, isClosing }) => (
    <div data-testid="send-modal" data-docno={documentNo} data-closing={isClosing ? 'yes' : 'no'}>
      <button data-testid="send-modal-close" onClick={onClose} />
    </div>
  ),
}));

let pdfState = { pdfUrl: null, pdfBlob: null, loading: false, error: null };
vi.mock('../useReturnToVendorOrderPdf.js', () => ({
  useReturnToVendorOrderPdf: vi.fn(() => pdfState),
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import ReturnToVendorPreview from '../ReturnToVendorPreview.jsx';

const defaultOrder = {
  id: 'rtv-1',
  documentNo: 'RTV-001',
  documentStatus: 'CO',
  grandTotalAmount: 500,
  'businessPartner$_identifier': 'Vendor Inc',
  businessPartner: 'bp-1',
  orderDate: '2024-02-02',
  'currency$_identifier': 'USD',
};

function renderPreview(overrides = {}) {
  const props = {
    order: defaultOrder,
    token: 'tok',
    apiBaseUrl: '/api/return-to-vendor',
    windowName: 'return-to-vendor',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<ReturnToVendorPreview {...props} {...overrides} />);
}

describe('ReturnToVendorPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfState = { pdfUrl: null, pdfBlob: null, loading: false, error: null };
    capturedAttachmentConfig = null;
    capturedTitle = null;
    capturedSubtitle = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns null when no order is provided', () => {
    const { container } = renderPreview({ order: null });
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('generic-preview-modal')).not.toBeInTheDocument();
  });

  it('renders the modal with title, subtitle and the three tabs', () => {
    renderPreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
    expect(capturedTitle).toContain('RTV-001');
    expect(capturedSubtitle).toContain('Vendor Inc');
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-messages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });

  it('omits the subtitle when there is no business partner', () => {
    renderPreview({ order: { ...defaultOrder, 'businessPartner$_identifier': undefined } });
    expect(capturedSubtitle).toBeUndefined();
  });

  it('opens SendDocumentModal from the topbar email button', () => {
    renderPreview();
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('topbar-email-btn'));
    const modal = screen.getByTestId('send-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.getAttribute('data-docno')).toBe('RTV-001');
  });

  it('opens SendDocumentModal from the EMAILS-section send link', () => {
    renderPreview();
    fireEvent.click(screen.getByTestId('emails-card-send'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
  });

  it('closes the send modal after the 300ms closing animation', () => {
    vi.useFakeTimers();
    renderPreview();
    fireEvent.click(screen.getByTestId('topbar-email-btn'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('send-modal-close'));
    // Marked as closing but still mounted during the animation window.
    expect(screen.getByTestId('send-modal').getAttribute('data-closing')).toBe('yes');
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
  });

  it('does not download when there is no pdfBlob', () => {
    renderPreview();
    // Spy AFTER render so React's internal createElement calls are untouched.
    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'a' ? anchor : origCreate(tag));
    fireEvent.click(screen.getByTestId('download-pdf-btn'));
    // Early return: the anchor is never clicked because pdfBlob is null.
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('triggers an anchor download when a pdfBlob is available', () => {
    pdfState = { pdfUrl: 'blob:rtv-pdf', pdfBlob: new Blob(['x']), loading: false, error: null };
    renderPreview();
    // Spy AFTER render so React's internal createElement calls are untouched.
    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'a' ? anchor : origCreate(tag));
    fireEvent.click(screen.getByTestId('download-pdf-btn'));
    expect(anchor.href).toContain('blob:rtv-pdf');
    expect(anchor.download).toBe('RTV-001.pdf');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('uses the storing attachment config for non-draft documents', () => {
    pdfState = { pdfUrl: 'blob:x', pdfBlob: new Blob(['x']), loading: false, error: null };
    renderPreview({ order: { ...defaultOrder, documentStatus: 'CO' } });
    expect(capturedAttachmentConfig.storeCondition).toBe(true);
    expect(capturedAttachmentConfig.autoFetch).toBe(true);
    expect(capturedAttachmentConfig.documentId).toBe('rtv-1');
  });

  it('uses the non-storing attachment config for draft documents', () => {
    renderPreview({ order: { ...defaultOrder, documentStatus: 'DR' } });
    expect(capturedAttachmentConfig.storeCondition).toBe(false);
    expect(capturedAttachmentConfig.autoFetch).toBeUndefined();
  });

  it('forwards onEdit with the order id and onClose to the modal', () => {
    const onEdit = vi.fn();
    const onClose = vi.fn();
    renderPreview({ onEdit, onClose });
    fireEvent.click(screen.getByTestId('edit-btn'));
    expect(onEdit).toHaveBeenCalledWith('rtv-1');
    fireEvent.click(screen.getByTestId('close-btn'));
    expect(onClose).toHaveBeenCalled();
  });
});

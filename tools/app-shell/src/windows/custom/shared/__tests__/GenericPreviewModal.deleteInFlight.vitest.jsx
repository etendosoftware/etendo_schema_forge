// @covers tools/app-shell/src/windows/custom/shared/GenericPreviewModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/useMainAttachment.js
/**
 * ETP-5518 review follow-up (W1) — GenericPreviewModal's drop-zone mode with the REAL
 * useMainAttachment, UploadedFileViewer, FileLightbox, PdfViewer and ConfirmDeleteDialog.
 * Only the network layer (listAttachments) and react-pdf are stubbed.
 *  - fileActions opted in (purchase invoice list preview): once a delete is confirmed,
 *    Replace and Delete stay disabled in the menu and the lightbox until the DELETE
 *    returns; then the drop zone comes back.
 *  - not opted in (goods-receipt-like): the plain trash button still deletes, unconfirmed.
 */

vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react');
  function Document({ file, onLoadSuccess, children }) {
    useEffect(() => {
      onLoadSuccess?.({ numPages: 1 });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);
    return <div data-testid="pdf-document">{children}</div>;
  }
  function Page({ pageNumber }) {
    return <div data-testid="pdf-page" data-page={pageNumber} />;
  }
  return { Document, Page, pdfjs: { GlobalWorkerOptions: {} } };
});

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.js' }));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/copilot/ocr/listAttachments', () => ({
  fetchMainAttachment: vi.fn(),
  fetchBrandingUpdated: vi.fn(),
  fetchAttachmentBlobUrl: vi.fn(),
  uploadAndMarkMainAttachment: vi.fn(),
  markAttachmentAsMain: vi.fn(),
  deleteAttachment: vi.fn(),
}));

import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  fetchMainAttachment,
  fetchBrandingUpdated,
  fetchAttachmentBlobUrl,
  deleteAttachment,
} from '@/components/copilot/ocr/listAttachments';
import GenericPreviewModal from '../GenericPreviewModal.jsx';

const STORED_PDF = { id: 'att-1', name: 'supplier.pdf', dataType: 'application/pdf' };

class FixedResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe() { this.callback([{ contentRect: { width: 800, height: 1000 } }]); }
  unobserve() { /* nothing observed */ }
  disconnect() { /* nothing observed */ }
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => { globalThis.ResizeObserver = FixedResizeObserver; });
afterAll(() => { globalThis.ResizeObserver = originalResizeObserver; });

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

async function renderModal(attachmentConfig) {
  const user = userEvent.setup();
  render(
    <GenericPreviewModal
      title="Doc"
      onClose={vi.fn()}
      attachmentConfig={{
        documentId: 'doc-1',
        tableName: 'C_Invoice',
        storeCondition: true,
        autoFetch: false,
        token: 'test-token',
        apiBaseUrl: '/sws/neo/purchase-invoice',
        ...attachmentConfig,
      }}
    />,
  );
  await screen.findByLabelText('downloadPdf');
  return user;
}

async function confirmDeleteFrom(user, trigger) {
  await user.click(trigger);
  const dialog = await screen.findByTestId('confirm-delete-dialog');
  await user.click(within(dialog).getByTestId('confirm-delete-confirm'));
  await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:uploaded');
  globalThis.URL.revokeObjectURL = vi.fn();
  fetchBrandingUpdated.mockResolvedValue(null);
  fetchMainAttachment.mockResolvedValue(STORED_PDF);
  fetchAttachmentBlobUrl.mockResolvedValue('blob:stored');
});

describe('GenericPreviewModal fileActions with the real useMainAttachment — delete in flight (ETP-5518 W1)', () => {
  it('disables Replace and Delete in the lightbox and the menu until the DELETE returns', async () => {
    const del = deferred();
    deleteAttachment.mockReturnValue(del.promise);
    const user = await renderModal({ fileActions: true });

    await user.click(await screen.findByTestId('file-viewer-expand'));
    const lightbox = await screen.findByTestId('file-lightbox');
    await confirmDeleteFrom(user, within(lightbox).getByTestId('file-lightbox-delete'));

    expect(deleteAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: 'att-1' }));
    expect(within(lightbox).getByTestId('file-lightbox-replace')).toBeDisabled();
    expect(within(lightbox).getByTestId('file-lightbox-delete')).toBeDisabled();

    await user.click(within(lightbox).getByTestId('file-lightbox-close'));
    await waitFor(() => expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument());

    await user.click(screen.getByTestId('file-viewer-more'));
    expect(await screen.findByTestId('file-viewer-replace')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('file-viewer-delete')).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');

    await act(async () => { del.resolve({ ok: true }); await del.promise; });

    expect(await screen.findByTestId('preview-drop-zone')).toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('downloadPdf')).not.toBeInTheDocument();
  });

  it('confirming Delete from the menu keeps a second Delete from being requested while pending', async () => {
    const del = deferred();
    deleteAttachment.mockReturnValue(del.promise);
    const user = await renderModal({ fileActions: true });

    await user.click(screen.getByTestId('file-viewer-more'));
    await confirmDeleteFrom(user, await screen.findByTestId('file-viewer-delete'));

    await user.click(screen.getByTestId('file-viewer-more'));
    const remove = await screen.findByTestId('file-viewer-delete');
    expect(screen.getByTestId('file-viewer-replace')).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    await user.click(remove);

    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(deleteAttachment).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');

    await act(async () => { del.resolve({ ok: true }); await del.promise; });
    expect(await screen.findByTestId('preview-drop-zone')).toBeInTheDocument();
  });
});

describe('GenericPreviewModal without fileActions, real useMainAttachment (goods-receipt-like regression guard)', () => {
  it('the plain trash button deletes without a confirmation and the drop zone returns', async () => {
    deleteAttachment.mockResolvedValue({ ok: true });
    const user = await renderModal({});

    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('deleteDocument'));

    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(deleteAttachment).toHaveBeenCalledTimes(1);
    expect(deleteAttachment).toHaveBeenCalledWith({
      token: 'test-token', attachmentId: 'att-1', apiBaseUrl: '/sws/neo/purchase-invoice',
    });
    expect(await screen.findByTestId('preview-drop-zone')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stored');
  });

  it('a failed plain delete keeps the file and its trash button', async () => {
    deleteAttachment.mockResolvedValue({ ok: false, error: 'server_error' });
    const user = await renderModal({});

    await user.click(screen.getByLabelText('deleteDocument'));

    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('deleteDocument')).toBeInTheDocument();
    expect(screen.getByLabelText('downloadPdf')).toHaveAttribute('href', 'blob:stored');
    expect(screen.queryByTestId('preview-drop-zone')).not.toBeInTheDocument();
  });
});

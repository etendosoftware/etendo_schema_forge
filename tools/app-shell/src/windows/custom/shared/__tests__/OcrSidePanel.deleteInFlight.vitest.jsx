// @covers tools/app-shell/src/windows/custom/shared/OcrSidePanel.jsx
// @covers tools/app-shell/src/windows/custom/shared/useMainAttachment.js
/**
 * ETP-5518 review follow-up — OcrSidePanel's DocumentView with the REAL useMainAttachment,
 * UploadedFileViewer, FileLightbox and ConfirmDeleteDialog. Only the network layer
 * (listAttachments) and react-pdf are stubbed, so these tests prove what the user sees:
 *  - W1: once a delete is confirmed, Replace and Delete stay disabled (menu and lightbox)
 *        until the DELETE returns, and a file dropped meanwhile is not uploaded;
 *  - W4: a file dropped on the open lightbox does not replace the document, while a drop
 *        on the sidebar itself still does.
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

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/purchase-invoice/inv-1' }),
}));

vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({
  matchOcrDocType: () => ({ id: 'purchase-invoice', tableName: 'C_Invoice' }),
  getOcrDocType: () => ({ tableName: 'C_Invoice' }),
}));

vi.mock('@/components/copilot/ocr/OcrInlineUploader.jsx', () => ({
  default: () => <div data-testid="ocr-uploader" />,
}));

vi.mock('@/components/copilot/ocr/listAttachments', () => ({
  fetchMainAttachment: vi.fn(),
  fetchBrandingUpdated: vi.fn(),
  fetchAttachmentBlobUrl: vi.fn(),
  uploadAndMarkMainAttachment: vi.fn(),
  markAttachmentAsMain: vi.fn(),
  deleteAttachment: vi.fn(),
}));

import { render, screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  fetchMainAttachment,
  fetchBrandingUpdated,
  fetchAttachmentBlobUrl,
  uploadAndMarkMainAttachment,
  deleteAttachment,
} from '@/components/copilot/ocr/listAttachments';
import OcrSidePanel from '../OcrSidePanel.jsx';

const PROPS = {
  recordId: 'inv-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/purchase-invoice',
  isNew: false,
};

const STORED_IMAGE = { id: 'att-1', name: 'scan.png', dataType: 'image/png' };

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

const pdfFile = (name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

/** The stored image in the sidebar (the lightbox, when open, renders a second one). */
async function sidebarImage() {
  const images = await screen.findAllByAltText('scan.png');
  return images.find((img) => !screen.queryByTestId('file-lightbox')?.contains(img));
}

async function renderWithStoredImage() {
  const user = userEvent.setup();
  render(<OcrSidePanel {...PROPS} />);
  await sidebarImage();
  await waitFor(() => expect(screen.getByText('ocrSidePanelAttach').closest('button')).toBeEnabled());
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
  fetchMainAttachment.mockResolvedValue(STORED_IMAGE);
  fetchAttachmentBlobUrl.mockResolvedValue('blob:img');
  uploadAndMarkMainAttachment.mockResolvedValue({ id: 'att-2' });
});

describe('OcrSidePanel with the real useMainAttachment — delete in flight (ETP-5518 W1)', () => {
  it('disables Replace and Delete in the lightbox and the menu until the DELETE returns', async () => {
    const del = deferred();
    deleteAttachment.mockReturnValue(del.promise);
    const user = await renderWithStoredImage();

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

    expect(await screen.findByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelAttach')).toBeInTheDocument();
    expect(screen.queryByAltText('scan.png')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
  });

  it('confirming Delete from the menu disables the menu items while the DELETE is pending', async () => {
    const del = deferred();
    deleteAttachment.mockReturnValue(del.promise);
    const user = await renderWithStoredImage();

    await user.click(screen.getByTestId('file-viewer-more'));
    await confirmDeleteFrom(user, await screen.findByTestId('file-viewer-delete'));

    await user.click(screen.getByTestId('file-viewer-more'));
    const replace = await screen.findByTestId('file-viewer-replace');
    const remove = screen.getByTestId('file-viewer-delete');
    expect(replace).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAttribute('aria-disabled', 'true');

    await user.click(remove);
    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(deleteAttachment).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');

    await act(async () => { del.resolve({ ok: true }); await del.promise; });
    expect(await screen.findByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
  });

  it('a file dropped on the sidebar while the DELETE is pending is not uploaded', async () => {
    const del = deferred();
    deleteAttachment.mockReturnValue(del.promise);
    const user = await renderWithStoredImage();

    await user.click(screen.getByTestId('file-viewer-more'));
    await confirmDeleteFrom(user, await screen.findByTestId('file-viewer-delete'));

    fireEvent.drop(await sidebarImage(), { dataTransfer: { files: [pdfFile('late.pdf')] } });

    expect(uploadAndMarkMainAttachment).not.toHaveBeenCalled();

    await act(async () => { del.resolve({ ok: true }); await del.promise; });
    expect(await screen.findByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
    expect(uploadAndMarkMainAttachment).not.toHaveBeenCalled();
  });
});

describe('OcrSidePanel with the real useMainAttachment — drops on the lightbox (ETP-5518 W4)', () => {
  it('a PDF dropped on the open lightbox does not replace the stored document', async () => {
    const user = await renderWithStoredImage();

    await user.click(await screen.findByTestId('file-viewer-expand'));
    const lightbox = await screen.findByTestId('file-lightbox');

    fireEvent.dragOver(lightbox, { dataTransfer: { files: [pdfFile('dropped.pdf')], dropEffect: 'copy' } });
    fireEvent.drop(lightbox, { dataTransfer: { files: [pdfFile('dropped.pdf')], dropEffect: 'copy' } });
    await act(async () => { await Promise.resolve(); });

    expect(uploadAndMarkMainAttachment).not.toHaveBeenCalled();
    expect(screen.getByTestId('file-lightbox')).toBeInTheDocument();
    expect(within(lightbox).getByAltText('scan.png')).toHaveAttribute('src', 'blob:img');
    expect(await sidebarImage()).toHaveAttribute('src', 'blob:img');
  });

  it('control: a PDF dropped on the sidebar outside the lightbox still replaces the document', async () => {
    await renderWithStoredImage();

    fireEvent.drop(await sidebarImage(), { dataTransfer: { files: [pdfFile('replacement.pdf')] } });

    await waitFor(() => expect(uploadAndMarkMainAttachment).toHaveBeenCalledTimes(1));
    expect(uploadAndMarkMainAttachment).toHaveBeenCalledWith(expect.objectContaining({
      recordId: 'inv-1', tableName: 'C_Invoice', fileName: 'replacement.pdf',
    }));
    expect(await screen.findByText('replacement.pdf')).toBeInTheDocument();
  });
});

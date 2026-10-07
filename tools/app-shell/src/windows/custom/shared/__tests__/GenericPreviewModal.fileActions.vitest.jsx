// @covers tools/app-shell/src/windows/custom/shared/GenericPreviewModal.jsx
/**
 * ETP-5518 — `attachmentConfig.fileActions` on GenericPreviewModal's drop-zone mode. Opted
 * in, the stored file keeps its Download link and gains the "Más" menu (Replace / Delete
 * with confirmation) and the lightbox; the bare, unconfirmed trash button is gone. Not
 * opted in (goods-receipt, return-material-receipt), nothing changes. Real
 * UploadedFileViewer / PdfViewer / dialogs; react-pdf and useMainAttachment are stubbed.
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

const mockUseMainAttachment = vi.fn();
vi.mock('../useMainAttachment.js', () => ({
  useMainAttachment: (...args) => mockUseMainAttachment(...args),
}));

vi.mock('../attachmentFileTypes.js', () => ({
  ACCEPTED_TYPES: { 'application/pdf': 'pdf', 'image/png': 'png' },
  ACCEPT_ATTR: '.pdf,.png',
}));

import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenericPreviewModal from '../GenericPreviewModal.jsx';

const STORED_PDF = { objectUrl: 'blob:stored', mimeType: 'application/pdf', fileName: 'supplier.pdf' };

class FixedResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe() { this.callback([{ contentRect: { width: 800, height: 1000 } }]); }
  unobserve() { /* nothing observed */ }
  disconnect() { /* nothing observed */ }
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => { globalThis.ResizeObserver = FixedResizeObserver; });
afterAll(() => { globalThis.ResizeObserver = originalResizeObserver; });

function attachmentState(overrides = {}) {
  return {
    storedFile: STORED_PDF,
    storedFileIsStale: false,
    isBusy: false,
    storeFailed: false,
    storeFile: vi.fn(() => Promise.resolve()),
    storeBlob: vi.fn(() => Promise.resolve()),
    storeUrl: vi.fn(() => Promise.resolve()),
    markExisting: vi.fn(),
    deleteFile: vi.fn(() => Promise.resolve()),
    fetchBlobUrl: vi.fn(),
    ...overrides,
  };
}

function renderModal(attachmentConfig) {
  const user = userEvent.setup();
  const utils = render(
    <GenericPreviewModal
      title="Doc"
      onClose={vi.fn()}
      attachmentConfig={{
        documentId: 'doc-1', tableName: 'C_Invoice', storeCondition: true, autoFetch: false, ...attachmentConfig,
      }}
    />,
  );
  return { user, ...utils };
}

async function chooseDelete(user) {
  await user.click(screen.getByTestId('file-viewer-more'));
  await user.click(await screen.findByTestId('file-viewer-delete'));
  return screen.findByTestId('confirm-delete-dialog');
}

beforeEach(() => {
  mockUseMainAttachment.mockReset();
});

describe('GenericPreviewModal — fileActions opted in (purchase invoice)', () => {
  it('shows Download and the "Más" menu, and no bare delete button', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    renderModal({ fileActions: true });

    const download = screen.getByLabelText('downloadPdf');
    expect(download).toHaveAttribute('href', 'blob:stored');
    expect(download).toHaveAttribute('download', 'supplier.pdf');
    expect(screen.getByTestId('file-viewer-more')).toBeInTheDocument();
    expect(screen.queryByLabelText('deleteDocument')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-file-replace-input')).toHaveAttribute('type', 'file');
  });

  it('Replace opens the hidden file input, and a picked file is stored', async () => {
    const state = attachmentState();
    mockUseMainAttachment.mockReturnValue(state);
    const { user } = renderModal({ fileActions: true });
    const input = screen.getByTestId('preview-file-replace-input');
    const clickSpy = vi.spyOn(input, 'click');

    await user.click(screen.getByTestId('file-viewer-more'));
    await user.click(await screen.findByTestId('file-viewer-replace'));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const replacement = new File(['%PDF'], 'new.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [replacement] } });

    expect(state.storeFile).toHaveBeenCalledWith(replacement);
  });

  it('a picked file of a disallowed type is not stored', () => {
    const state = attachmentState();
    mockUseMainAttachment.mockReturnValue(state);
    renderModal({ fileActions: true });

    fireEvent.change(screen.getByTestId('preview-file-replace-input'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(state.storeFile).not.toHaveBeenCalled();
  });

  it('Delete asks for confirmation; confirming deletes', async () => {
    const state = attachmentState();
    mockUseMainAttachment.mockReturnValue(state);
    const { user } = renderModal({ fileActions: true });

    const dialog = await chooseDelete(user);
    expect(state.deleteFile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByTestId('confirm-delete-confirm'));

    expect(state.deleteFile).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirmation does not delete', async () => {
    const state = attachmentState();
    mockUseMainAttachment.mockReturnValue(state);
    const { user } = renderModal({ fileActions: true });

    const dialog = await chooseDelete(user);
    await user.click(within(dialog).getByTestId('confirm-delete-cancel'));

    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());
    expect(state.deleteFile).not.toHaveBeenCalled();
  });

  it('a failed delete is swallowed (no unhandled rejection) and the file stays on screen', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      // A plain function, not vi.fn: a vi.fn attaches its own handlers to the promise it
      // returns (to record settled results), which would mark the rejection as handled.
      let deleteCalls = 0;
      const deleteFile = () => { deleteCalls += 1; return Promise.reject(new Error('boom')); };
      const state = attachmentState({ deleteFile });
      mockUseMainAttachment.mockReturnValue(state);
      const { user } = renderModal({ fileActions: true });

      const dialog = await chooseDelete(user);
      await user.click(within(dialog).getByTestId('confirm-delete-confirm'));
      await new Promise((resolve) => { setTimeout(resolve, 20); });

      expect(deleteCalls).toBe(1);
      expect(unhandled).not.toHaveBeenCalled();
      expect(screen.getByTestId('file-viewer-more')).toBeInTheDocument();
      expect(screen.getByLabelText('downloadPdf')).toBeInTheDocument();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('while a write is in flight Replace and Delete are disabled', async () => {
    const state = attachmentState({ isBusy: true });
    mockUseMainAttachment.mockReturnValue(state);
    const { user } = renderModal({ fileActions: true });

    await user.click(screen.getByTestId('file-viewer-more'));
    const replace = await screen.findByTestId('file-viewer-replace');
    const del = screen.getByTestId('file-viewer-delete');
    expect(replace).toHaveAttribute('aria-disabled', 'true');
    expect(del).toHaveAttribute('aria-disabled', 'true');
    await user.click(del);

    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(state.deleteFile).not.toHaveBeenCalled();
  });

  it('the preview opens the lightbox with Replace and Delete', async () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());
    const { user } = renderModal({ fileActions: true });

    await user.click(await screen.findByTestId('file-viewer-expand'));
    const lightbox = await screen.findByTestId('file-lightbox');

    expect(within(lightbox).getByTestId('file-lightbox-replace')).toBeInTheDocument();
    expect(within(lightbox).getByTestId('file-lightbox-delete')).toBeInTheDocument();
  });

  it('without a stored file still shows the drop zone (fileActions changes only the stored view)', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState({ storedFile: null }));

    renderModal({ fileActions: true });

    expect(screen.getByTestId('preview-drop-zone')).toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
  });
});

describe('GenericPreviewModal — fileActions under Solo-Lectura (readOnly)', () => {
  it('keeps the file and its download but offers no write control', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    renderModal({ fileActions: true, readOnly: true });

    expect(screen.getByLabelText('downloadPdf')).toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-file-replace-input')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('deleteDocument')).not.toBeInTheDocument();
  });

  it('the lightbox still opens and zooms, with no Replace / Delete', async () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());
    const { user } = renderModal({ fileActions: true, readOnly: true });

    await user.click(await screen.findByTestId('file-viewer-expand'));
    const lightbox = await screen.findByTestId('file-lightbox');

    expect(within(lightbox).getByTestId('file-lightbox-zoom-in')).toBeEnabled();
    expect(within(lightbox).queryByTestId('file-lightbox-replace')).not.toBeInTheDocument();
    expect(within(lightbox).queryByTestId('file-lightbox-delete')).not.toBeInTheDocument();
  });
});

describe('GenericPreviewModal — fileActions NOT opted in (goods-receipt-like config)', () => {
  it('keeps the old bare delete button next to Download, with no menu or lightbox trigger', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    renderModal({});

    expect(screen.getByLabelText('downloadPdf')).toBeInTheDocument();
    expect(screen.getByLabelText('deleteDocument')).toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-expand')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-file-replace-input')).not.toBeInTheDocument();
  });

  it('the bare delete button still deletes immediately, without a confirmation', async () => {
    const state = attachmentState();
    mockUseMainAttachment.mockReturnValue(state);
    const { user } = renderModal({});

    await user.click(screen.getByLabelText('deleteDocument'));

    expect(state.deleteFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
  });

  it('under readOnly still hides the bare delete button', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    renderModal({ readOnly: true });

    expect(screen.getByLabelText('downloadPdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('deleteDocument')).not.toBeInTheDocument();
  });

  it('fileActions is ignored in autoFetch mode: the caller leftPanel still owns the panel', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    render(
      <GenericPreviewModal
        title="Doc"
        onClose={vi.fn()}
        leftPanel={<div data-testid="caller-left-panel" />}
        attachmentConfig={{ documentId: 'doc-1', tableName: 'C_Invoice', storeCondition: true, autoFetch: true, fileActions: true }}
      />,
    );

    expect(screen.getByTestId('caller-left-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
  });
});

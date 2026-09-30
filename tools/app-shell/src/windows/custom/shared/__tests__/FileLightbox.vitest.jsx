/**
 * ETP-5518 — FileLightbox, reached the way users reach it: by clicking (or pressing Enter
 * on) the preview rendered by UploadedFileViewer. Real Radix dialogs, real PdfViewer and
 * ConfirmDeleteDialog; only react-pdf is stubbed. Zoom is observed through the width the
 * viewer hands each rendered page.
 */

const pdfState = vi.hoisted(() => ({ numPages: 1 }));

vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react');
  function Document({ file, onLoadSuccess, children }) {
    useEffect(() => {
      if (pdfState.numPages !== null) onLoadSuccess?.({ numPages: pdfState.numPages });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);
    return <div data-testid="pdf-document">{children}</div>;
  }
  function Page({ pageNumber, width }) {
    return <div data-testid="pdf-page" data-page={pageNumber} data-width={width} />;
  }
  return { Document, Page, pdfjs: { GlobalWorkerOptions: {} } };
});

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.js' }));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${params.count}` : key),
}));

import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UploadedFileViewer from '../UploadedFileViewer.jsx';
import FileLightbox from '../FileLightbox.jsx';

const PDF = { objectUrl: 'blob:pdf', fileName: 'supplier.pdf', mimeType: 'application/pdf' };
const IMAGE = { objectUrl: 'blob:img', fileName: 'scan.png', mimeType: 'image/png' };

// The fixed box every ResizeObserver reports, and the page width PdfViewer derives from it.
const BOX = { width: 800, height: 1000 };
const A4_ASPECT = 842 / 595;
const FIT_PAGE_WIDTH = Math.min(BOX.width - 16, (BOX.height - 16) / A4_ASPECT);
const ZOOM_STEP = 0.15;

class FixedResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe() { this.callback([{ contentRect: { ...BOX } }]); }
  unobserve() { /* nothing observed */ }
  disconnect() { /* nothing observed */ }
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => { globalThis.ResizeObserver = FixedResizeObserver; });
afterAll(() => { globalThis.ResizeObserver = originalResizeObserver; });
beforeEach(() => { pdfState.numPages = 1; });

function setup(props = {}) {
  const user = userEvent.setup();
  const utils = render(<UploadedFileViewer file={PDF} {...props} />);
  return { user, ...utils };
}

async function openLightbox(user) {
  await user.click(screen.getByTestId('file-viewer-expand'));
  return screen.findByTestId('file-lightbox');
}

function lightboxPageWidth(lightbox) {
  return Number(within(lightbox).getAllByTestId('pdf-page')[0].dataset.width);
}

describe('FileLightbox — opening and semantics', () => {
  it('is closed until the preview is clicked', async () => {
    const { user } = setup();
    expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument();

    const lightbox = await openLightbox(user);

    expect(lightbox).toBeInTheDocument();
  });

  it('opens from the keyboard on the preview trigger', async () => {
    const { user } = setup();
    screen.getByTestId('file-viewer-expand').focus();

    await user.keyboard('{Enter}');

    expect(await screen.findByTestId('file-lightbox')).toBeInTheDocument();
  });

  it('is a modal dialog labelled by the file name', async () => {
    const { user } = setup();

    await openLightbox(user);

    const dialog = screen.getByRole('dialog', { name: 'supplier.pdf' });
    expect(dialog).toBe(screen.getByTestId('file-lightbox'));
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByTestId('file-lightbox-title')).toHaveTextContent('supplier.pdf');
  });

  it('shows the singular page count for a one-page document', async () => {
    const { user } = setup();

    const lightbox = await openLightbox(user);

    expect(within(lightbox).getByTestId('file-lightbox-page-count')).toHaveTextContent('fileViewerPageCount_one:1');
  });

  it('shows the plural page count for a multi-page document', async () => {
    pdfState.numPages = 3;
    const { user } = setup();

    const lightbox = await openLightbox(user);

    expect(within(lightbox).getByTestId('file-lightbox-page-count')).toHaveTextContent('fileViewerPageCount_plural:3');
    expect(within(lightbox).getAllByTestId('pdf-page')).toHaveLength(3);
  });

  it('draws its own header controls instead of the viewer floating toolbar', async () => {
    const { user } = setup({ onReplace: vi.fn(), onDelete: vi.fn() });

    const lightbox = await openLightbox(user);

    // The inline viewer keeps its mini toolbar; the lightbox copy is rendered with hideToolbar.
    // Only one "zoom in" inside the lightbox: its own header button.
    expect(within(lightbox).getAllByLabelText('pdfViewerZoomIn'))
      .toEqual([within(lightbox).getByTestId('file-lightbox-zoom-in')]);
    expect(within(lightbox).queryByTestId('file-viewer-more')).not.toBeInTheDocument();
  });
});

describe('FileLightbox — zoom', () => {
  it('opens fitted to the page, and zoom in / zoom out / fit change the rendered size', async () => {
    const { user } = setup();
    const lightbox = await openLightbox(user);

    expect(lightboxPageWidth(lightbox)).toBeCloseTo(FIT_PAGE_WIDTH, 5);

    await user.click(within(lightbox).getByTestId('file-lightbox-zoom-in'));
    expect(lightboxPageWidth(lightbox)).toBeCloseTo(FIT_PAGE_WIDTH * (1 + ZOOM_STEP), 5);

    await user.click(within(lightbox).getByTestId('file-lightbox-zoom-out'));
    await user.click(within(lightbox).getByTestId('file-lightbox-zoom-out'));
    expect(lightboxPageWidth(lightbox)).toBeCloseTo(FIT_PAGE_WIDTH * (1 - ZOOM_STEP), 5);

    await user.click(within(lightbox).getByTestId('file-lightbox-fit'));
    expect(lightboxPageWidth(lightbox)).toBeCloseTo(FIT_PAGE_WIDTH, 5);
  });

  it('zooming in the lightbox does not change the inline preview', async () => {
    const { user } = setup();
    const inlineWidth = Number(screen.getByTestId('pdf-page').dataset.width);
    const lightbox = await openLightbox(user);

    await user.click(within(lightbox).getByTestId('file-lightbox-zoom-in'));

    const inlinePage = screen.getAllByTestId('pdf-page').find((el) => !lightbox.contains(el));
    expect(Number(inlinePage.dataset.width)).toBe(inlineWidth);
  });

  it('disables zoom out at the minimum and zoom in at the maximum', async () => {
    const { user } = setup();
    const lightbox = await openLightbox(user);
    const zoomOut = within(lightbox).getByTestId('file-lightbox-zoom-out');
    const zoomIn = within(lightbox).getByTestId('file-lightbox-zoom-in');

    for (let i = 0; i < 4; i += 1) await user.click(zoomOut);
    expect(zoomOut).toBeDisabled();
    expect(zoomIn).toBeEnabled();

    for (let i = 0; i < 20 && !zoomIn.disabled; i += 1) await user.click(zoomIn);
    expect(zoomIn).toBeDisabled();
    expect(zoomOut).toBeEnabled();
  });

  it('starts fresh (fitted) every time it is reopened', async () => {
    const { user } = setup();
    let lightbox = await openLightbox(user);
    await user.click(within(lightbox).getByTestId('file-lightbox-zoom-in'));
    await user.click(within(lightbox).getByTestId('file-lightbox-close'));
    await waitFor(() => expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument());

    lightbox = await openLightbox(user);

    expect(lightboxPageWidth(lightbox)).toBeCloseTo(FIT_PAGE_WIDTH, 5);
  });
});

describe('FileLightbox — closing', () => {
  it('closes with the X button', async () => {
    const { user } = setup();
    const lightbox = await openLightbox(user);

    await user.click(within(lightbox).getByTestId('file-lightbox-close'));

    await waitFor(() => expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument());
  });

  it('closes with Escape', async () => {
    const { user } = setup();
    await openLightbox(user);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument());
  });

  it('does not let Escape reach document-level listeners of the view underneath', async () => {
    const underneath = vi.fn();
    document.addEventListener('keydown', underneath);
    try {
      const { user } = setup();
      await openLightbox(user);

      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument());
      expect(underneath).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    } finally {
      document.removeEventListener('keydown', underneath);
    }
  });

  it('returns focus to the preview trigger when it closes', async () => {
    const { user } = setup();
    const trigger = screen.getByTestId('file-viewer-expand');
    const lightbox = await openLightbox(user);
    expect(lightbox.contains(document.activeElement)).toBe(true);

    await user.click(within(lightbox).getByTestId('file-lightbox-close'));

    await waitFor(() => expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('FileLightbox — Replace and Delete', () => {
  it('Replace calls the caller picker', async () => {
    const onReplace = vi.fn();
    const { user } = setup({ onReplace, onDelete: vi.fn() });
    const lightbox = await openLightbox(user);

    await user.click(within(lightbox).getByTestId('file-lightbox-replace'));

    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
  });

  it('Delete goes through the confirmation; confirming deletes', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ onReplace: vi.fn(), onDelete });
    const lightbox = await openLightbox(user);

    await user.click(within(lightbox).getByTestId('file-lightbox-delete'));
    const confirm = await screen.findByTestId('confirm-delete-dialog');
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(within(confirm).getByTestId('confirm-delete-confirm'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirmation keeps the file and the lightbox open', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ onReplace: vi.fn(), onDelete });
    const lightbox = await openLightbox(user);

    await user.click(within(lightbox).getByTestId('file-lightbox-delete'));
    await user.click(await screen.findByTestId('confirm-delete-cancel'));

    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId('file-lightbox')).toBeInTheDocument();
  });

  it('Escape while the delete confirmation is open closes only the confirmation', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ onReplace: vi.fn(), onDelete });
    const lightbox = await openLightbox(user);
    await user.click(within(lightbox).getByTestId('file-lightbox-delete'));
    await screen.findByTestId('confirm-delete-dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('file-lightbox')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    // A second Escape then closes the lightbox itself.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('file-lightbox')).not.toBeInTheDocument());
  });

  it('marks Delete as the destructive action', async () => {
    const { user } = setup({ onReplace: vi.fn(), onDelete: vi.fn() });
    const lightbox = await openLightbox(user);

    const del = within(lightbox).getByTestId('file-lightbox-delete');
    expect(del).toHaveAccessibleName('fileViewerDelete');
    expect(del.className).toMatch(/--destructive/);
    expect(within(lightbox).getByTestId('file-lightbox-replace').className).not.toMatch(/--destructive/);
  });

  it('disables Replace and Delete while a write is in flight, but zoom and close still work', async () => {
    const onReplace = vi.fn();
    const onDelete = vi.fn();
    const { user } = setup({ onReplace, onDelete, actionsDisabled: true });
    const lightbox = await openLightbox(user);

    expect(within(lightbox).getByTestId('file-lightbox-replace')).toBeDisabled();
    expect(within(lightbox).getByTestId('file-lightbox-delete')).toBeDisabled();
    expect(within(lightbox).getByTestId('file-lightbox-zoom-in')).toBeEnabled();
    expect(within(lightbox).getByTestId('file-lightbox-close')).toBeEnabled();
    expect(onReplace).not.toHaveBeenCalled();
  });
});

describe('FileLightbox — edge cases', () => {
  it('a document whose page count is unknown opens without a page-count line', () => {
    // Rendered directly: the inline viewer only offers the expand trigger once pages load.
    pdfState.numPages = null;
    render(<FileLightbox open onClose={vi.fn()} file={PDF} />);

    const lightbox = screen.getByTestId('file-lightbox');
    expect(within(lightbox).getByTestId('file-lightbox-title')).toHaveTextContent('supplier.pdf');
    expect(within(lightbox).queryByTestId('file-lightbox-page-count')).not.toBeInTheDocument();
  });

  it('a zero-page document shows no page count and no pages', () => {
    pdfState.numPages = 0;
    render(<FileLightbox open onClose={vi.fn()} file={PDF} />);

    const lightbox = screen.getByTestId('file-lightbox');
    expect(within(lightbox).queryByTestId('file-lightbox-page-count')).not.toBeInTheDocument();
    expect(within(lightbox).queryByTestId('pdf-page')).not.toBeInTheDocument();
  });

  it('an image shows no page count and scales with zoom', () => {
    render(<FileLightbox open onClose={vi.fn()} file={IMAGE} />);
    const lightbox = screen.getByTestId('file-lightbox');
    const img = within(lightbox).getByAltText('scan.png');
    Object.defineProperty(img, 'naturalWidth', { value: 2000 });
    Object.defineProperty(img, 'naturalHeight', { value: 1000 });
    fireEvent.load(img);

    expect(within(lightbox).queryByTestId('file-lightbox-page-count')).not.toBeInTheDocument();
    // Fits the 800x1000 box, never upscaled: min(784, 984 * 2, 2000) = 784.
    expect(img.style.width).toBe('784px');

    fireEvent.click(within(lightbox).getByTestId('file-lightbox-zoom-in'));
    expect(parseFloat(img.style.width)).toBeCloseTo(784 * (1 + ZOOM_STEP), 5);
  });

  it('keeps a very long file name as a single accessible title', async () => {
    const longName = `${'factura-proveedor-'.repeat(20)}final.pdf`;
    const user = userEvent.setup();
    render(<UploadedFileViewer file={{ ...PDF, fileName: longName }} />);

    await user.click(screen.getByTestId('file-viewer-expand'));

    const dialog = await screen.findByRole('dialog', { name: longName });
    expect(within(dialog).getByTestId('file-lightbox-title')).toHaveTextContent(longName);
    // Controls stay reachable next to it.
    expect(within(dialog).getByTestId('file-lightbox-close')).toBeInTheDocument();
  });

  it('calls onClose when closed while controlled by the caller', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FileLightbox open onClose={onClose} file={PDF} />);

    await user.click(screen.getByTestId('file-lightbox-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

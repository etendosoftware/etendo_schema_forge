/**
 * ETP-5518 — UploadedFileViewer: the uploaded file's "Más" menu (Reemplazar / Eliminar),
 * the delete confirmation and the write gates. The real PdfViewer, FileLightbox,
 * ConfirmDeleteDialog and Radix primitives are rendered; only react-pdf is stubbed, so the
 * menu is found where users find it — on the PDF viewer's floating mini toolbar.
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

// The worker URL is a Vite asset import; only its string value matters here.
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.js' }));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

import { useState } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UploadedFileViewer from '../UploadedFileViewer.jsx';

const PDF = { objectUrl: 'blob:pdf', fileName: 'supplier.pdf', mimeType: 'application/pdf' };
const IMAGE = { objectUrl: 'blob:img', fileName: 'scan.png', mimeType: 'image/png' };

/** jsdom has no layout: report a fixed 800x1000 box so the viewer renders its pages. */
class FixedResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe() { this.callback([{ contentRect: { width: 800, height: 1000 } }]); }
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

async function openMenu(user) {
  await user.click(screen.getByTestId('file-viewer-more'));
  return screen.findByTestId('file-viewer-menu');
}

describe('UploadedFileViewer — "Más" menu', () => {
  it('opens a menu with Replace and Delete', async () => {
    const { user } = setup({ onReplace: vi.fn(), onDelete: vi.fn() });

    const menu = await openMenu(user);

    expect(within(menu).getByTestId('file-viewer-replace')).toHaveTextContent('fileViewerReplace');
    expect(within(menu).getByTestId('file-viewer-delete')).toHaveTextContent('fileViewerDelete');
  });

  it('mounts the "Más" button on the PDF mini toolbar, after the zoom controls', () => {
    setup({ onReplace: vi.fn(), onDelete: vi.fn() });

    const more = screen.getByTestId('file-viewer-more');
    const zoomOut = screen.getByLabelText('pdfViewerZoomOut');
    expect(more).toHaveAccessibleName('more');
    // Same floating group as Zoom in / Fit / Zoom out, and it comes last.
    expect(more.parentElement).toBe(zoomOut.parentElement);
    expect(zoomOut.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Replace calls the caller picker without asking for confirmation', async () => {
    const onReplace = vi.fn();
    const onDelete = vi.fn();
    const { user } = setup({ onReplace, onDelete });

    await openMenu(user);
    await user.click(screen.getByTestId('file-viewer-replace'));

    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
  });

  it('Delete asks for confirmation first; confirming calls the delete callback once', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ onReplace: vi.fn(), onDelete });

    await openMenu(user);
    await user.click(screen.getByTestId('file-viewer-delete'));

    const dialog = await screen.findByTestId('confirm-delete-dialog');
    expect(onDelete).not.toHaveBeenCalled();
    expect(within(dialog).getByText('fileViewerDelete')).toBeInTheDocument();

    await user.click(within(dialog).getByTestId('confirm-delete-confirm'));

    expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());
  });

  it('cancelling the confirmation does not delete and keeps the file on screen', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ onReplace: vi.fn(), onDelete });

    await openMenu(user);
    await user.click(screen.getByTestId('file-viewer-delete'));
    await user.click(await screen.findByTestId('confirm-delete-cancel'));

    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId('pdf-page')).toBeInTheDocument();
    expect(screen.getByTestId('file-viewer-more')).toBeInTheDocument();
  });

  it('offers only the action the caller provided', async () => {
    const { user } = setup({ onDelete: vi.fn() });

    const menu = await openMenu(user);

    expect(within(menu).queryByTestId('file-viewer-replace')).not.toBeInTheDocument();
    expect(within(menu).getByTestId('file-viewer-delete')).toBeInTheDocument();
  });

  it('disables Replace and Delete while a write is in flight', async () => {
    const onReplace = vi.fn();
    const onDelete = vi.fn();
    const { user } = setup({ onReplace, onDelete, actionsDisabled: true });

    await openMenu(user);
    const replace = screen.getByTestId('file-viewer-replace');
    const del = screen.getByTestId('file-viewer-delete');
    expect(replace).toHaveAttribute('aria-disabled', 'true');
    expect(del).toHaveAttribute('aria-disabled', 'true');

    await user.click(replace);
    await user.click(del);

    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('UploadedFileViewer — read-only (no write callbacks)', () => {
  it('renders no "Más" button but keeps the zoom controls and the lightbox trigger', () => {
    setup();

    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();
    expect(screen.getByLabelText('pdfViewerZoomIn')).toBeInTheDocument();
    expect(screen.getByTestId('file-viewer-expand')).toBeInTheDocument();
  });

  it('the lightbox opens with zoom and close but no Replace / Delete', async () => {
    const { user } = setup();

    await user.click(screen.getByTestId('file-viewer-expand'));
    const lightbox = await screen.findByTestId('file-lightbox');

    expect(within(lightbox).getByTestId('file-lightbox-zoom-in')).toBeInTheDocument();
    expect(within(lightbox).getByTestId('file-lightbox-fit')).toBeInTheDocument();
    expect(within(lightbox).getByTestId('file-lightbox-zoom-out')).toBeInTheDocument();
    expect(within(lightbox).getByTestId('file-lightbox-close')).toBeInTheDocument();
    expect(within(lightbox).queryByTestId('file-lightbox-replace')).not.toBeInTheDocument();
    expect(within(lightbox).queryByTestId('file-lightbox-delete')).not.toBeInTheDocument();
  });
});

describe('UploadedFileViewer — image files', () => {
  it('shows only the "Más" button on the image mini toolbar (no zoom group)', () => {
    setup({ file: IMAGE, onReplace: vi.fn(), onDelete: vi.fn() });

    const more = screen.getByTestId('file-viewer-more');
    expect(within(more.parentElement).getAllByRole('button')).toEqual([more]);
    expect(screen.queryByLabelText('pdfViewerZoomIn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-document')).not.toBeInTheDocument();
  });

  it('renders the image inside the lightbox trigger', async () => {
    const { user } = setup({ file: IMAGE });

    const trigger = screen.getByTestId('file-viewer-expand');
    const img = within(trigger).getByAltText('scan.png');
    expect(img).toHaveAttribute('src', 'blob:img');
    expect(screen.queryByTestId('file-viewer-more')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(await screen.findByTestId('file-lightbox')).toBeInTheDocument();
  });

  it('Delete on an image goes through the same confirmation', async () => {
    const onDelete = vi.fn();
    const { user } = setup({ file: IMAGE, onDelete });

    await openMenu(user);
    await user.click(screen.getByTestId('file-viewer-delete'));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(await screen.findByTestId('confirm-delete-confirm'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('UploadedFileViewer — edge cases', () => {
  /** A caller whose delete stays in flight: it flips `busy` and never settles. */
  function SlowDeleteCaller({ onReplace }) {
    const [busy, setBusy] = useState(false);
    return (
      <UploadedFileViewer
        file={PDF}
        onReplace={onReplace}
        onDelete={() => { setBusy(true); }}
        actionsDisabled={busy} />
    );
  }

  it('Replace cannot be triggered while a confirmed delete is still in flight', async () => {
    const onReplace = vi.fn();
    const user = userEvent.setup();
    render(<SlowDeleteCaller onReplace={onReplace} />);

    await openMenu(user);
    await user.click(screen.getByTestId('file-viewer-delete'));
    await user.click(await screen.findByTestId('confirm-delete-confirm'));
    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument());

    // From the menu...
    await openMenu(user);
    const replace = screen.getByTestId('file-viewer-replace');
    expect(replace).toHaveAttribute('aria-disabled', 'true');
    await user.click(replace);
    await user.keyboard('{Escape}');

    // ...and from the lightbox.
    await user.click(screen.getByTestId('file-viewer-expand'));
    const lightbox = await screen.findByTestId('file-lightbox');
    expect(within(lightbox).getByTestId('file-lightbox-replace')).toBeDisabled();
    expect(within(lightbox).getByTestId('file-lightbox-delete')).toBeDisabled();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('a PDF that fails to load offers no lightbox trigger but keeps the "Más" menu', async () => {
    pdfState.numPages = null;
    const onDelete = vi.fn();
    const { user } = setup({ onDelete });

    expect(screen.queryByTestId('file-viewer-expand')).not.toBeInTheDocument();
    await openMenu(user);
    await user.click(screen.getByTestId('file-viewer-delete'));
    await user.click(await screen.findByTestId('confirm-delete-confirm'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

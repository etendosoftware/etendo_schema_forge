/**
 * ETP-5518 — PdfViewer's new optional props (`zoom`, `hideToolbar`, `toolbarExtra`,
 * `onExpand`, `onNumPages`) and the extracted `usePdfZoom` hook. Without any of them the
 * viewer must behave exactly as before: its own floating Zoom in / Fit / Zoom out group,
 * internal zoom state, no expand trigger. react-pdf is stubbed; zoom is observed through
 * the width the viewer hands each page.
 */

const pdfState = vi.hoisted(() => ({ numPages: 2 }));

vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react');
  function Document({ file, onLoadSuccess, children }) {
    useEffect(() => {
      if (pdfState.numPages !== null) onLoadSuccess?.({ numPages: pdfState.numPages });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);
    return <div data-testid="pdf-document" data-file={file}>{children}</div>;
  }
  function Page({ pageNumber, width }) {
    return <div data-testid="pdf-page" data-page={pageNumber} data-width={width} />;
  }
  return { Document, Page, pdfjs: { GlobalWorkerOptions: {} } };
});

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf.worker.js' }));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PdfViewer, { usePdfZoom } from '../PdfViewer.jsx';

const BOX = { width: 800, height: 1000 };
const FIT_WIDTH = BOX.width - 16;
const FIT_PAGE = Math.min(FIT_WIDTH, (BOX.height - 16) / (842 / 595));
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
beforeEach(() => { pdfState.numPages = 2; });

function pageWidth() {
  return Number(screen.getAllByTestId('pdf-page')[0].dataset.width);
}

describe('PdfViewer — default behaviour (no new props)', () => {
  it('renders every page at the fit-to-width size with its own floating zoom group', () => {
    render(<PdfViewer url="blob:a" />);

    expect(screen.getByTestId('pdf-document')).toHaveAttribute('data-file', 'blob:a');
    expect(screen.getAllByTestId('pdf-page')).toHaveLength(2);
    expect(pageWidth()).toBe(FIT_WIDTH);
    const zoomIn = screen.getByLabelText('pdfViewerZoomIn');
    const fit = screen.getByLabelText('pdfViewerFitToPage');
    const zoomOut = screen.getByLabelText('pdfViewerZoomOut');
    // Exactly the three original controls in the group, in their original order.
    expect([...zoomIn.parentElement.querySelectorAll('button')]).toEqual([zoomIn, fit, zoomOut]);
  });

  it('offers no expand trigger and no extra toolbar control', () => {
    render(<PdfViewer url="blob:a" />);

    expect(screen.queryByTestId('file-viewer-expand')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('fileViewerExpand')).not.toBeInTheDocument();
  });

  it('zooms with its internal state and toggles fit between width and page', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="blob:a" />);

    await user.click(screen.getByLabelText('pdfViewerZoomIn'));
    expect(pageWidth()).toBeCloseTo(FIT_WIDTH * (1 + ZOOM_STEP), 5);

    await user.click(screen.getByLabelText('pdfViewerFitToPage'));
    expect(pageWidth()).toBeCloseTo(FIT_PAGE, 5);

    await user.click(screen.getByLabelText('pdfViewerFitToPage'));
    expect(pageWidth()).toBe(FIT_WIDTH);

    await user.click(screen.getByLabelText('pdfViewerZoomOut'));
    expect(pageWidth()).toBeCloseTo(FIT_WIDTH * (1 - ZOOM_STEP), 5);
  });
});

describe('PdfViewer — new optional props', () => {
  it('hideToolbar drops the floating zoom group but still renders the pages', () => {
    render(<PdfViewer url="blob:a" hideToolbar />);

    expect(screen.queryByLabelText('pdfViewerZoomIn')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('pdfViewerFitToPage')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('pdfViewerZoomOut')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('pdf-page')).toHaveLength(2);
  });

  it('toolbarExtra is appended to the floating group, after Zoom out', () => {
    render(<PdfViewer url="blob:a" toolbarExtra={<button type="button" data-testid="extra">x</button>} />);

    const extra = screen.getByTestId('extra');
    const zoomOut = screen.getByLabelText('pdfViewerZoomOut');
    expect(extra.parentElement).toBe(zoomOut.parentElement);
    const buttons = [...zoomOut.parentElement.querySelectorAll('button')];
    expect(buttons.at(-1)).toBe(extra);
  });

  it('toolbarExtra is not rendered when the toolbar is hidden', () => {
    render(<PdfViewer url="blob:a" hideToolbar toolbarExtra={<button type="button" data-testid="extra">x</button>} />);

    expect(screen.queryByTestId('extra')).not.toBeInTheDocument();
  });

  it('onExpand adds a labelled trigger over the pages that calls it on click', async () => {
    const onExpand = vi.fn();
    const user = userEvent.setup();
    render(<PdfViewer url="blob:a" onExpand={onExpand} />);

    const trigger = screen.getByTestId('file-viewer-expand');
    expect(trigger).toHaveAccessibleName('fileViewerExpand');
    await user.click(trigger);

    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('onExpand offers no trigger until the document has pages', () => {
    pdfState.numPages = null; // still loading / failed to load
    render(<PdfViewer url="blob:a" onExpand={vi.fn()} />);

    expect(screen.queryByTestId('file-viewer-expand')).not.toBeInTheDocument();
  });

  it('onNumPages reports the page count once the document loads', () => {
    pdfState.numPages = 5;
    const onNumPages = vi.fn();
    render(<PdfViewer url="blob:a" onNumPages={onNumPages} />);

    expect(onNumPages).toHaveBeenCalledWith(5);
  });

  it('onNumPages is not called while the document has not loaded', () => {
    pdfState.numPages = null;
    const onNumPages = vi.fn();
    render(<PdfViewer url="blob:a" onNumPages={onNumPages} />);

    expect(onNumPages).not.toHaveBeenCalled();
  });

  it('a controlled zoom drives the rendered size instead of the internal state', () => {
    function Controlled() {
      const zoom = usePdfZoom({ initialFitMode: 'page' });
      return (
        <>
          <button type="button" data-testid="outside-zoom-in" onClick={zoom.zoomIn}>+</button>
          <PdfViewer url="blob:a" zoom={zoom} hideToolbar />
        </>
      );
    }
    render(<Controlled />);
    expect(pageWidth()).toBeCloseTo(FIT_PAGE, 5);

    act(() => { screen.getByTestId('outside-zoom-in').click(); });

    expect(pageWidth()).toBeCloseTo(FIT_PAGE * (1 + ZOOM_STEP), 5);
  });

  it('with a controlled zoom its own toolbar buttons act on that state', async () => {
    const zoomIn = vi.fn();
    const zoom = {
      scale: 1, fitMode: 'width', zoomIn, zoomOut: vi.fn(), toggleFitMode: vi.fn(), fitToPage: vi.fn(),
    };
    const user = userEvent.setup();
    render(<PdfViewer url="blob:a" zoom={zoom} />);

    await user.click(screen.getByLabelText('pdfViewerZoomIn'));

    expect(zoomIn).toHaveBeenCalledTimes(1);
  });
});

describe('usePdfZoom', () => {
  it('starts at scale 1 in the requested fit mode (width by default)', () => {
    expect(renderHook(() => usePdfZoom()).result.current).toMatchObject({ scale: 1, fitMode: 'width' });
    expect(renderHook(() => usePdfZoom({ initialFitMode: 'page' })).result.current.fitMode).toBe('page');
  });

  it('clamps between 0.5 and 3 and reports canZoomIn / canZoomOut', () => {
    const { result } = renderHook(() => usePdfZoom());

    act(() => { for (let i = 0; i < 10; i += 1) result.current.zoomOut(); });
    expect(result.current.scale).toBe(0.5);
    expect(result.current.canZoomOut).toBe(false);
    expect(result.current.canZoomIn).toBe(true);

    act(() => { for (let i = 0; i < 30; i += 1) result.current.zoomIn(); });
    expect(result.current.scale).toBe(3);
    expect(result.current.canZoomIn).toBe(false);
    expect(result.current.canZoomOut).toBe(true);
  });

  it('fitToPage always lands on page mode at scale 1 (not a toggle)', () => {
    const { result } = renderHook(() => usePdfZoom({ initialFitMode: 'page' }));
    act(() => { result.current.zoomIn(); });

    act(() => { result.current.fitToPage(); });
    expect(result.current).toMatchObject({ scale: 1, fitMode: 'page' });

    act(() => { result.current.fitToPage(); });
    expect(result.current).toMatchObject({ scale: 1, fitMode: 'page' });
  });

  it('toggleFitMode swaps mode and resets the scale', () => {
    const { result } = renderHook(() => usePdfZoom());
    act(() => { result.current.zoomIn(); });

    act(() => { result.current.toggleFitMode(); });

    expect(result.current).toMatchObject({ scale: 1, fitMode: 'page' });
  });
});

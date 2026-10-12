// @covers tools/app-shell/src/windows/custom/shared/PdfViewer.jsx
//
// Layout half of the viewer tests (zoom-hook and toolbar props: PdfViewer.vitest.jsx).
// Renders the REAL shared viewer (every caller test stubs it) with react-pdf mocked, so the
// layout maths — fit width vs fit page, the content padding, the zoom clamp — run for real.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'pdf-worker-url' }));

// Pages report a 100x200 sheet (aspect 2) so the expected widths are round numbers.
vi.mock('react-pdf', async () => {
  const { useEffect } = await import('react');
  function Document({ file, onLoadSuccess, children }) {
    useEffect(() => { onLoadSuccess?.({ numPages: 2 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <div data-testid="pdf-document" data-file={file}>{children}</div>;
  }
  function Page({ pageNumber, width, onLoadSuccess }) {
    useEffect(() => { onLoadSuccess?.({ originalWidth: 100, originalHeight: 200 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <div data-testid={`pdf-page-${pageNumber}`} data-width={String(width)} />;
  }
  return { Document, Page, pdfjs: { GlobalWorkerOptions: {} } };
});

// The fit icon signals "active" through its inline colour; expose it as an attribute
// (jsdom drops `hsl(var(...))` from a parsed style declaration).
vi.mock('lucide-react', () => {
  const icon = (props) => <svg data-testid={props['data-testid']} data-color={props.style?.color} />;
  return { ZoomIn: icon, ZoomOut: icon, Maximize2: icon, Loader2: icon, AlertCircle: icon };
});

import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PdfViewer from '../PdfViewer.jsx';

const ACTIVE = 'hsl(var(--foreground))';
const INACTIVE = 'hsl(var(--text-disabled))';

let resizeCallback;
beforeEach(() => {
  resizeCallback = null;
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb) { resizeCallback = cb; }
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Container 600x500. Default padding: widthFit = 600 - 16 = 584,
// available height = 500 - 8 - 8 = 484 → heightFit = 242.
function renderViewer(props = {}) {
  const utils = render(<PdfViewer url="blob:doc" {...props} />);
  act(() => { resizeCallback([{ contentRect: { width: 600, height: 500 } }]); });
  return utils;
}

const pageWidth = () => Number(screen.getByTestId('pdf-page-1').dataset.width);
const zoomIn = () => screen.getByRole('button', { name: 'pdfViewerZoomIn' });
const zoomOut = () => screen.getByRole('button', { name: 'pdfViewerZoomOut' });
const fit = () => screen.getByRole('button', { name: 'pdfViewerFitToPage' });
const controls = () => zoomIn().parentElement;
const pagesWrapper = () => screen.getByTestId('pdf-document').parentElement;
const scrollContainer = () => pagesWrapper().parentElement;
const fitColor = () => screen.getByTestId('Maximize2__fca188').dataset.color;
const fitPressed = () => fit().getAttribute('aria-pressed');

describe('PdfViewer — defaults (width fit, controls top-right)', () => {
  it('loads the given url and renders every page at the container width minus the gutter', () => {
    renderViewer();
    expect(screen.getByTestId('pdf-document')).toHaveAttribute('data-file', 'blob:doc');
    expect(screen.getByTestId('pdf-page-2')).toBeInTheDocument();
    expect(pageWidth()).toBe(584);
  });

  it('floats the controls top-right with an 8px top padding and no x-axis clipping', () => {
    renderViewer();
    expect(controls().className).toContain('top-2 right-2');
    expect(controls().className).not.toContain('left-1/2');
    expect(pagesWrapper().style.paddingTop).toBe('8px');
    expect(pagesWrapper().style.paddingBottom).toBe('8px');
    expect(scrollContainer().style.overflowX).toBe('');
    expect(scrollContainer().getAttribute('style')).toBeNull();
  });

  it('page fit on a narrow, tall container is bound by the width, not the height', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="blob:doc" />);
    // widthFit = 200 - 16 = 184 < heightFit = (900 - 16) / 2 = 442.
    act(() => { resizeCallback([{ contentRect: { width: 200, height: 900 } }]); });
    await user.click(fit());
    expect(fitPressed()).toBe('true');
    expect(pageWidth()).toBe(184);
  });

  it('fit button toggles width -> page -> width', async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.click(fit());
    expect(pageWidth()).toBe(242);
    // Callers without contentPadding never clip the x-axis, even in page mode.
    expect(scrollContainer().style.overflowX).toBe('');
    await user.click(fit());
    expect(pageWidth()).toBe(584);
  });

  it('fit icon and aria-pressed are active exactly while fitMode is page, regardless of zoom', async () => {
    const user = userEvent.setup();
    renderViewer();
    expect(fitColor()).toBe(INACTIVE);
    expect(fitPressed()).toBe('false');
    await user.click(fit());
    expect(fitColor()).toBe(ACTIVE);
    expect(fitPressed()).toBe('true');
    await user.click(zoomIn());
    expect(fitColor()).toBe(ACTIVE);
    expect(fitPressed()).toBe('true');
    await user.click(fit());
    expect(fitColor()).toBe(INACTIVE);
    expect(fitPressed()).toBe('false');
  });
});

describe('PdfViewer — contentPadding (Send pop-up layout)', () => {
  // Container 600x500, padding 24 / 28 / 0 / 28 → widthFit = 600 - 56 = 544,
  // heightFit = (500 - 24 - 0) / 2 = 238.
  const PADDING = { top: 24, right: 28, bottom: 0, left: 28 };

  it('fits the sheet to the width minus the side padding and applies the padding around it', () => {
    renderViewer({ contentPadding: PADDING });
    expect(pageWidth()).toBe(544);
    const { paddingTop, paddingRight, paddingBottom, paddingLeft } = pagesWrapper().style;
    expect([paddingTop, paddingRight, paddingBottom, paddingLeft]).toEqual(['24px', '28px', '0px', '28px']);
    expect(controls().className).toContain('top-2 right-2');
  });

  it('clips the x-axis while not zoomed in, and releases it once zoomed in', async () => {
    const user = userEvent.setup();
    renderViewer({ contentPadding: PADDING });
    expect(scrollContainer().style.overflowX).toBe('hidden');
    await user.click(zoomIn());
    expect(scrollContainer().style.overflowX).toBe('');
    await user.click(zoomOut());
    expect(scrollContainer().style.overflowX).toBe('hidden');
  });

  it('keeps the default width <-> page toggle, using the padded height for page fit', async () => {
    const user = userEvent.setup();
    renderViewer({ contentPadding: PADDING });
    await user.click(fit());
    expect(pageWidth()).toBe(238);
    expect(fitPressed()).toBe('true');
    await user.click(fit());
    expect(pageWidth()).toBe(544);
    expect(fitPressed()).toBe('false');
  });
});

describe('PdfViewer — contentPadding sizing against the scroll box', () => {
  const PADDING = { top: 24, right: 28, bottom: 0, left: 28 };
  let clientWidthSpy;

  // jsdom reports clientWidth 0 everywhere; give the scroll box (the overflow-auto element) a
  // real one, as a browser with a stable scrollbar gutter would.
  function stubScrollBoxClientWidth(width) {
    clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function scrollBoxWidth() {
        return this.classList.contains('overflow-auto') ? width : 0;
      });
  }

  afterEach(() => { clientWidthSpy?.mockRestore(); clientWidthSpy = undefined; });

  it('reserves a stable scrollbar gutter on the scroll box', () => {
    renderViewer({ contentPadding: PADDING });
    expect(scrollContainer().style.scrollbarGutter).toBe('stable');
  });

  it('sizes the sheet from the scroll box client width minus the side padding', () => {
    stubScrollBoxClientWidth(520);
    renderViewer({ contentPadding: PADDING });
    // 520 - 28 - 28 — not the 600px container (which would give 544).
    expect(pageWidth()).toBe(464);
  });

  it('falls back to the container width when the scroll box reports a client width of 0', () => {
    stubScrollBoxClientWidth(0);
    renderViewer({ contentPadding: PADDING });
    expect(pageWidth()).toBe(600 - 56);
  });

  it('page fit on a narrow, tall container is bound by the padded width', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="blob:doc" contentPadding={PADDING} />);
    // widthFit = 200 - 56 = 144 < heightFit = (900 - 24 - 0) / 2 = 438.
    act(() => { resizeCallback([{ contentRect: { width: 200, height: 900 } }]); });
    await user.click(fit());
    expect(fitPressed()).toBe('true');
    expect(pageWidth()).toBe(144);
  });
});

describe('PdfViewer — fitIcon', () => {
  it('renders the given icon component in the fit button', () => {
    const CustomIcon = (props) => <svg data-testid={props['data-testid']} data-custom="yes" />;
    renderViewer({ fitIcon: CustomIcon });
    expect(screen.getByTestId('Maximize2__fca188')).toHaveAttribute('data-custom', 'yes');
  });
});

describe('PdfViewer — rounded zoom steps', () => {
  it('zoom in + zoom out lands exactly back on the fitted width', async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.click(zoomIn());
    await user.click(zoomOut());
    expect(pageWidth()).toBe(584);
  });
});

describe('PdfViewer — zoom bounds', () => {
  it('disables zoom-out at the minimum scale (0.5)', async () => {
    const user = userEvent.setup();
    renderViewer();
    // 1 → 0.85 → 0.7 → 0.55 → 0.5 (clamped)
    for (let i = 0; i < 3; i += 1) await user.click(zoomOut());
    expect(zoomOut()).not.toBeDisabled();
    await user.click(zoomOut());
    expect(zoomOut()).toBeDisabled();
    expect(pageWidth()).toBe(584 * 0.5);
    expect(zoomIn()).not.toBeDisabled();
  });

  it('disables zoom-in at the maximum scale (3.0)', async () => {
    const user = userEvent.setup();
    renderViewer();
    // 13 steps reach 2.95; the 14th clamps to 3.
    for (let i = 0; i < 13; i += 1) await user.click(zoomIn());
    expect(zoomIn()).not.toBeDisabled();
    await user.click(zoomIn());
    expect(zoomIn()).toBeDisabled();
    expect(pageWidth()).toBe(584 * 3);
    expect(zoomOut()).not.toBeDisabled();
  });
});

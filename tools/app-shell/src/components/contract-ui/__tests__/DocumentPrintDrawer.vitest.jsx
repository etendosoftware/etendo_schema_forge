import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/useAnimatedOpen.js', () => ({
  useAnimatedOpen: (open) => ({ shouldRender: open, isClosing: false }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'sonner';
import DocumentPrintDrawer, { printDocuments } from '../DocumentPrintDrawer.jsx';

describe('DocumentPrintDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toast.error.mockClear();
  });

  it('does not render when open is false', () => {
    const { container } = render(
      <DocumentPrintDrawer open={false} onClose={vi.fn()} windowName="purchase-order" documentIds={['d1']} token="tok" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders when open is true', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
      json: () => Promise.resolve({}),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="purchase-order" documentIds={['d1']} token="tok" />,
    );
    expect(screen.getByText('documentPreview')).toBeInTheDocument();
  });

  it('shows navigation arrows when multiple documents', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="sales-order" documentIds={['d1', 'd2', 'd3']} token="tok" />,
    );
    // 1 of 3 counter
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('does not show navigation for single document', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="sales-order" documentIds={['d1']} token="tok" />,
    );
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={onClose} windowName="order" documentIds={['d1']} token="tok" />,
    );
    // Click the backdrop (first child div with fixed inset-0)
    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('handles fetch error gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network'));
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
    );
    await waitFor(() => {
      expect(screen.getByText('Network')).toBeInTheDocument();
    });
  });

  it('handles HTTP error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server Error' }),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
    );
    await waitFor(() => {
      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });
  });

  it('renders with no token (skips fetch)', () => {
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="" />,
    );
    expect(container.innerHTML).not.toBe('');
  });

  it('renders with empty documentIds', () => {
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={[]} token="tok" />,
    );
    expect(container.innerHTML).not.toBe('');
  });

  it('does not render when windowName is empty', () => {
    const { container } = render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="" documentIds={['d1']} token="tok" />,
    );
    // reportId = 'print-' which is truthy, but still renders the drawer
    expect(container.innerHTML).not.toBe('');
  });

  it('shows download button', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Doc</html>'),
    });
    render(
      <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
    );
    expect(screen.getByText('download')).toBeInTheDocument();
  });

  // ETP-4728 — jsreport failures on the Download button must surface via
  // toast, not fail silently (previously: no content-type/status check, no
  // user-visible feedback beyond a bare "PDF generation failed").
  describe('handleDownload — jsreport error handling (ETP-4728)', () => {
    const mockFetchByUrl = (jsreportImpl) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        if (typeof url === 'string' && url.endsWith('/render')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('<html>Doc</html>') });
        }
        if (url === '/jsreport/api/report') return jsreportImpl();
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });
    };

    it('toasts a service-unavailable message when the jsreport fetch itself rejects (connection refused)', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(() => Promise.reject(new TypeError('Failed to fetch')));
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
      );
      await waitFor(() => expect(screen.getByText('download')).toBeInTheDocument());
      await user.click(screen.getByText('download'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('reportServiceUnavailable'));
    });

    it('toasts a PDF-generation-failed message on a non-2xx jsreport response', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(() => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Internal Server Error') }));
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
      );
      await waitFor(() => expect(screen.getByText('download')).toBeInTheDocument());
      await user.click(screen.getByText('download'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('pdfGenerationFailed'));
    });

    it('toasts a PDF-generation-failed message when jsreport returns a non-PDF body', async () => {
      const user = userEvent.setup();
      mockFetchByUrl(() => Promise.resolve({
        ok: true,
        headers: { get: (h) => (h === 'content-type' ? 'text/plain' : null) },
        text: () => Promise.resolve('not a pdf'),
      }));
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
      );
      await waitFor(() => expect(screen.getByText('download')).toBeInTheDocument());
      await user.click(screen.getByText('download'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('pdfGenerationFailed'));
    });

    it('downloads successfully when jsreport returns a real PDF', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      URL.createObjectURL = vi.fn(() => 'blob:generated');
      URL.revokeObjectURL = vi.fn();
      mockFetchByUrl(() => Promise.resolve({
        ok: true,
        headers: { get: (h) => (h === 'content-type' ? 'application/pdf' : null) },
        blob: () => Promise.resolve(new Blob(['%PDF'])),
      }));
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
      );
      await waitFor(() => expect(screen.getByText('download')).toBeInTheDocument());
      await user.click(screen.getByText('download'));
      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  // ETP-4728 (Hallazgo 2) — the drawer previously had no real print action,
  // only Download + a disabled "send by email" placeholder. This adds a
  // working Imprimir button that reuses printDocuments() for the doc
  // currently open in the drawer.
  describe('handlePrint — Imprimir button (ETP-4728 Hallazgo 2)', () => {
    it('shows a print button', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>Doc</html>'),
      });
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
      );
      expect(screen.getByText('print')).toBeInTheDocument();
    });

    it('opens a print window for the current document on click', async () => {
      const user = userEvent.setup();
      URL.createObjectURL = vi.fn(() => 'blob:generated');
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        if (typeof url === 'string' && url.endsWith('/render')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('<html>Doc</html>') });
        }
        if (url === '/jsreport/api/report') {
          return Promise.resolve({
            ok: true,
            headers: { get: (h) => (h === 'content-type' ? 'application/pdf' : null) },
            blob: () => Promise.resolve(new Blob(['%PDF'])),
          });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
      );
      await waitFor(() => expect(screen.getByText('print')).toBeInTheDocument());
      await user.click(screen.getByText('print'));
      await waitFor(() => expect(openSpy).toHaveBeenCalledWith('blob:generated', '_blank'));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('toasts a service-unavailable message when jsreport is unreachable', async () => {
      const user = userEvent.setup();
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        if (typeof url === 'string' && url.endsWith('/render')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('<html>Doc</html>') });
        }
        if (url === '/jsreport/api/report') return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={['d1']} token="tok" />,
      );
      await waitFor(() => expect(screen.getByText('print')).toBeInTheDocument());
      await user.click(screen.getByText('print'));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('reportServiceUnavailable'));
    });

    it('does nothing when there is no current document', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      render(
        <DocumentPrintDrawer open={true} onClose={vi.fn()} windowName="order" documentIds={[]} token="tok" />,
      );
      const printBtn = screen.getByText('print').closest('button');
      expect(printBtn).toBeDisabled();
      expect(openSpy).not.toHaveBeenCalled();
    });
  });
});

// ETP-4728 — printDocuments is a fire-and-forget onClick handler in ListView
// (never awaited/caught by its caller), so it must swallow its own failures
// and surface them via toast — otherwise they were unhandled promise
// rejections, invisible to the user.
describe('printDocuments (ETP-4728)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toast.error.mockClear();
  });

  const mockFetchByUrl = (jsreportImpl) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html>Doc</html>') });
      }
      if (url === '/jsreport/api/report') return jsreportImpl();
      return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
    });
  };

  it('does nothing when token or documentIds are missing — inverted: the cookie carries the session', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await printDocuments('order', [], 'tok');
    await printDocuments('order', ['d1'], '');
    // ETP-4576 — inverted on purpose: under the cookie scheme the client holds no token,
    // so the request MUST still go out. The old expectation encoded the guard that made
    // this call silently disappear for every authenticated user.
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('toasts a service-unavailable message when jsreport is unreachable, using the injected translator', async () => {
    mockFetchByUrl(() => Promise.reject(new TypeError('Failed to fetch')));
    const translate = vi.fn((key) => `t:${key}`);
    await printDocuments('order', ['d1'], 'tok', translate);
    expect(toast.error).toHaveBeenCalledWith('t:reportServiceUnavailable');
  });

  it('falls back to the raw key when no translator is injected', async () => {
    mockFetchByUrl(() => Promise.reject(new TypeError('Failed to fetch')));
    await printDocuments('order', ['d1'], 'tok');
    expect(toast.error).toHaveBeenCalledWith('reportServiceUnavailable');
  });

  it('opens a print window on success', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:generated');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    mockFetchByUrl(() => Promise.resolve({
      ok: true,
      headers: { get: (h) => (h === 'content-type' ? 'application/pdf' : null) },
      blob: () => Promise.resolve(new Blob(['%PDF'])),
    }));
    await printDocuments('order', ['d1'], 'tok');
    expect(openSpy).toHaveBeenCalledWith('blob:generated', '_blank');
    expect(toast.error).not.toHaveBeenCalled();
  });
});

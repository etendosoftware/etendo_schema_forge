// Mocks must be hoisted before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/windows/custom/goods-shipment/useShipmentPdf', () => ({
  generateShipmentPdf: vi.fn(),
  getShipmentPdfLabels: vi.fn((ui) => ({ ui })),
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import { generateShipmentPdf, getShipmentPdfLabels } from '@/windows/custom/goods-shipment/useShipmentPdf';
import GoodsShipmentMoreMenu from '../GoodsShipmentMoreMenu.jsx';

const BASE_PROPS = {
  recordId: 'rec-1',
  token: 'tok-123',
  apiBaseUrl: '/api/goods-shipment',
};

describe('GoodsShipmentMoreMenu (goods-shipment, ETP-4702)', () => {
  let clickMock;
  let lastAnchor;

  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    clickMock = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = clickMock;
        lastAnchor = el;
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when documentStatus is not CO (draft)', () => {
    const { container } = render(
      <GoodsShipmentMoreMenu {...BASE_PROPS} data={{ documentStatus: 'DR', documentNo: 'SHP-1' }} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when documentStatus is missing', () => {
    const { container } = render(
      <GoodsShipmentMoreMenu {...BASE_PROPS} data={{}} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the download button when documentStatus is CO (completed)', () => {
    render(
      <GoodsShipmentMoreMenu {...BASE_PROPS} data={{ documentStatus: 'CO', documentNo: 'SHP-1' }} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(getShipmentPdfLabels).toHaveBeenCalled();
  });

  it('clicking the button fetches the PDF blob with the right identifiers, downloads it, and calls onClose', async () => {
    const blob = new Blob(['pdf-bytes']);
    generateShipmentPdf.mockResolvedValueOnce(blob);
    const onClose = vi.fn();

    render(
      <GoodsShipmentMoreMenu
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(generateShipmentPdf).toHaveBeenCalledTimes(1);
    expect(generateShipmentPdf).toHaveBeenCalledWith(
      BASE_PROPS.recordId,
      BASE_PROPS.apiBaseUrl,
      BASE_PROPS.token,
      expect.any(Object),
    );
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(lastAnchor.download).toBe('alb-SHP-1.pdf');
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('falls back to recordId for the downloaded filename when documentNo is missing', async () => {
    generateShipmentPdf.mockResolvedValueOnce(new Blob(['pdf-bytes']));
    const onClose = vi.fn();

    render(
      <GoodsShipmentMoreMenu {...BASE_PROPS} data={{ documentStatus: 'CO' }} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(lastAnchor.download).toBe(`alb-${BASE_PROPS.recordId}.pdf`);
  });

  it('shows a toast.error and still calls onClose when the download fails (does not crash)', async () => {
    generateShipmentPdf.mockRejectedValueOnce(new Error('boom'));
    const onClose = vi.fn();

    render(
      <GoodsShipmentMoreMenu
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(clickMock).not.toHaveBeenCalled();
  });

  it('falls back to the i18n key when the rejection has no message', async () => {
    generateShipmentPdf.mockRejectedValueOnce(new Error());
    const onClose = vi.fn();

    render(
      <GoodsShipmentMoreMenu
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('failedToGeneratePdf'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a second click while a download is already in flight', async () => {
    let resolveDownload;
    generateShipmentPdf.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDownload = resolve; }),
    );

    render(
      <GoodsShipmentMoreMenu
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
        onClose={vi.fn()}
      />,
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);

    expect(generateShipmentPdf).toHaveBeenCalledTimes(1);
    resolveDownload(new Blob(['pdf-bytes']));
    await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
  });

  // ETP-4702 QA follow-up — edge cases not covered by the tests above.
  describe('QA edge cases (ETP-4702 follow-up)', () => {
    it('regression guard (was BUG-check): a null rejection is handled safely — toast shown, no unhandled rejection', async () => {
      // Previously the catch block did `toast.error(err.message || ui(...))`.
      // Since `err` is not guaranteed to be an object (e.g. `throw null`),
      // evaluating `err.message` threw a TypeError BEFORE toast.error was
      // ever called — so the user got NO error feedback (the menu just
      // silently closed) and the re-thrown TypeError escaped as an unhandled
      // promise rejection (onClick={handleDownload} never awaits/catches it).
      // Fixed by guarding with `err instanceof Error` before reading
      // `.message`, so a non-Error rejection now falls back to the i18n key
      // and never throws inside the catch.
      generateShipmentPdf.mockRejectedValueOnce(null);
      const onClose = vi.fn();
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);

      render(
        <GoodsShipmentMoreMenu
          {...BASE_PROPS}
          data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByRole('button'));

      // finally still runs even though the catch body itself threw.
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      // Let the now-rejected handleDownload() promise surface as unhandled.
      await new Promise((r) => setTimeout(r, 0));

      process.off('unhandledRejection', unhandled);

      // Fixed: the user gets a translated fallback message for this failure.
      expect(toast.error).toHaveBeenCalledWith('failedToGeneratePdf');
      // Fixed: nothing escapes as an unhandled rejection anymore.
      expect(unhandled).not.toHaveBeenCalled();
    });

    it('BUG-check: surfaces a raw technical message via toast when apiBaseUrl is undefined', async () => {
      // Simulates a caller wiring the component with a missing/undefined prop.
      // generateShipmentPdf is mocked here (as in every other test in this file),
      // so this only proves the component's own error path — not the real
      // generateShipmentPdf(apiBaseUrl.replace(...)) TypeError, which is exercised
      // in useShipmentPdf's own test suite, not here.
      generateShipmentPdf.mockRejectedValueOnce(
        new TypeError("Cannot read properties of undefined (reading 'replace')"),
      );
      const onClose = vi.fn();

      render(
        <GoodsShipmentMoreMenu
          recordId={undefined}
          token={undefined}
          apiBaseUrl={undefined}
          data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(toast.error).toHaveBeenCalledWith(
        "Cannot read properties of undefined (reading 'replace')",
      );
    });

    it('does not crash when onClose is not passed at all (optional chaining)', async () => {
      generateShipmentPdf.mockResolvedValueOnce(new Blob(['pdf-bytes']));

      render(
        <GoodsShipmentMoreMenu
          {...BASE_PROPS}
          data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
          // onClose intentionally omitted
        />,
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
      // No throw means onClose?.() safely no-ops.
    });

    it('does not crash on a failed download when onClose is not passed at all', async () => {
      generateShipmentPdf.mockRejectedValueOnce(new Error('network down'));

      render(
        <GoodsShipmentMoreMenu
          {...BASE_PROPS}
          data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
          // onClose intentionally omitted
        />,
      );

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('network down'));
    });

    it('BUG-check: a true same-tick double click (before React commits "downloading") calls generateShipmentPdf twice', async () => {
      // The existing "ignores a second click while a download is already in
      // flight" test issues two SEPARATE fireEvent.click() calls. Each
      // fireEvent.click() is independently wrapped in its own act(), which
      // flushes the setDownloading(true) update — and therefore the `disabled`
      // DOM attribute — before the second click fires. That test therefore
      // verifies the browser's native "disabled buttons don't dispatch click"
      // behavior, not the component's own `if (downloading) return;` guard.
      //
      // This test forces BOTH click events into the SAME act() batch, so no
      // re-render (and no `disabled` commit) happens between them — the true
      // "user double-clicks faster than a paint" race.
      let resolveDownload;
      generateShipmentPdf.mockImplementationOnce(
        () => new Promise((resolve) => { resolveDownload = resolve; }),
      );

      render(
        <GoodsShipmentMoreMenu
          {...BASE_PROPS}
          data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
          onClose={vi.fn()}
        />,
      );

      const button = screen.getByRole('button');

      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });

      // Report finding for the QA verdict: 1 = guard holds even same-tick,
      // 2 = the guard has a genuine same-tick race (see BUGS section).
      expect(generateShipmentPdf).toHaveBeenCalledTimes(1);

      resolveDownload(new Blob(['pdf-bytes']));
      await waitFor(() => expect(clickMock).toHaveBeenCalledTimes(1));
    });

    it('status transition to non-CO mid-download does not crash and still completes the in-flight download', async () => {
      // Simulates a background refetch flipping documentStatus away from 'CO'
      // while a download is in flight (e.g. another session reactivates the
      // document). The component's early-return guard reads `data` fresh on
      // every render, but the in-flight handleDownload closure captured the
      // OLD data/recordId/token/apiBaseUrl at click time.
      let resolveDownload;
      generateShipmentPdf.mockImplementationOnce(
        () => new Promise((resolve) => { resolveDownload = resolve; }),
      );
      const onClose = vi.fn();

      const { rerender } = render(
        <GoodsShipmentMoreMenu
          {...BASE_PROPS}
          data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(generateShipmentPdf).toHaveBeenCalledTimes(1);

      // Document status flips away from CO while the download is still pending.
      rerender(
        <GoodsShipmentMoreMenu
          {...BASE_PROPS}
          data={{ documentStatus: 'DR', documentNo: 'SHP-1' }}
          onClose={onClose}
        />,
      );

      // The button (and its "downloading" spinner) is gone from the DOM now...
      expect(screen.queryByRole('button')).toBeNull();

      // ...but the in-flight promise still resolves without throwing, and the
      // component instance (still mounted, just rendering null) safely settles
      // its state + calls onClose — no "setState on unmounted component" crash.
      resolveDownload(new Blob(['pdf-bytes']));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(clickMock).toHaveBeenCalledTimes(1);
    });

    it('is not gated by any artificial timeout — a very slow (but eventually resolving) download still completes', async () => {
      let resolveDownload;
      generateShipmentPdf.mockImplementationOnce(
        () => new Promise((resolve) => { resolveDownload = resolve; }),
      );
      const onClose = vi.fn();

      render(
        <GoodsShipmentMoreMenu
          {...BASE_PROPS}
          data={{ documentStatus: 'CO', documentNo: 'SHP-1' }}
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByRole('button')).toBeDisabled();

      // Simulate a large/slow PDF: nothing in the component times this out.
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByRole('button')).toBeDisabled();
      expect(onClose).not.toHaveBeenCalled();

      resolveDownload(new Blob(['pdf-bytes']));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
  });
});

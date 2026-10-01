// ETP-5424 — both artifact renders in the print drawer (the preview on open and the HTML
// fetched for the PDF download) can legitimately outlive apiFetch's default timeout, so they
// opt out with `timeout: 0`. The real client still performs the request; only its options
// are recorded (see `@/test/recordApiFetch.js`).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// A STABLE translator: `renderDocument` lists `ui` as a dependency, so a fresh function per
// render re-fires the preview effect in a loop (the real useUI is memoized on the dictionary).
const { stableUi } = vi.hoisted(() => ({ stableUi: (key) => key }));
vi.mock('@/i18n', () => ({
  useUI: () => stableUi,
}));

vi.mock('@/lib/useAnimatedOpen.js', () => ({
  useAnimatedOpen: (open) => ({ shouldRender: open, isClosing: false }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { apiFetchCallsTo, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import DocumentPrintDrawer from '../DocumentPrintDrawer.jsx';

// 'order' has no client-side PDF builder, so the drawer takes the artifact-render path.
const WINDOW = 'order';

describe('DocumentPrintDrawer — render timeout opt-out (ETP-5424)', () => {
  beforeEach(() => {
    resetApiFetchCalls();
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/jsreport/')) {
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['%PDF'], { type: 'application/pdf' })) });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<html>Doc</html>'), json: () => Promise.resolve({}) });
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the preview render passes timeout: 0', async () => {
    render(<DocumentPrintDrawer open onClose={vi.fn()} windowName={WINDOW} documentIds={['d1']} token="tok" />);

    await waitFor(() => expect(apiFetchCallsTo('/render').length).toBeGreaterThanOrEqual(1));
    expect(apiFetchCallsTo('/render')[0].options.timeout).toBe(0);
  });

  it('the render behind Download passes timeout: 0', async () => {
    const user = userEvent.setup();
    render(<DocumentPrintDrawer open onClose={vi.fn()} windowName={WINDOW} documentIds={['d1']} token="tok" />);
    await waitFor(() => expect(apiFetchCallsTo('/render').length).toBe(1));

    await user.click(screen.getByText('download'));

    await waitFor(() => expect(apiFetchCallsTo('/render').length).toBe(2));
    expect(apiFetchCallsTo('/render')[1].options.timeout).toBe(0);
  });
});

// ETP-5013 — two mechanisms let the user get back to the empty "ready to go"
// state (`hasGenerated: false`) without touching "Limpiar filtros" (which
// clears filter VALUES, a different concept):
//   1. Automatic invalidation: any real edit through ReportSidebar's onChange
//      resets hasGenerated before updating params.
//   2. An explicit "Clear Result" button (data-testid="action-clear-result"),
//      visible only once hasGenerated is true, which resets hasGenerated
//      WITHOUT touching params at all.
// This suite covers both, plus the regression the auto-invalidation effect is
// deliberately guarded against: internal param writes from loadAutoDefaults /
// the orgId-session-sync effect (which also touch `params`) must NOT trip the
// same invalidation, or a deep-linked auto-rendered report would go stale the
// instant those async effects resolve after the initial render.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

let mockSelectedOrg = { id: 'org1', name: 'GOOrganization' };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    selectedRole: { orgList: [] },
    get selectedOrg() { return mockSelectedOrg; },
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorite: () => false }),
}));

vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange, className }) => (
    <input
      type="date"
      data-testid="date-field"
      className={className}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ReportViewerPage from '../ReportViewerPage.jsx';

function makeReportsListResponse(reports) {
  return { ok: true, json: () => Promise.resolve(reports) };
}

const SIMPLE_REPORT = {
  id: 'report-simple',
  title: { en_US: 'Simple Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'freeText', type: 'text', label: { en_US: 'Free Text' }, section: 'primary' },
  ],
};

const DEEP_LINK_REPORT = {
  id: 'report-deep-link',
  title: { en_US: 'Deep Link Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'currencyId', type: 'search', selector: 'currency', label: { en_US: 'Currency' }, section: 'primary', autoDefault: true },
    { name: 'dateFrom', type: 'date', label: { en_US: 'Date From' }, section: 'primary' },
  ],
};

// Instruments the real <iframe>'s `src` setter so we can observe every write
// to it, without depending on jsdom actually performing an about:blank
// navigation (it doesn't — writeToIframe's `onload` callback never fires in
// jsdom, so asserting on `contentDocument` content is not reliable here).
// This directly proves `clearGeneratedResult` — not a bare
// `setHasGenerated(false)` — runs on both invalidation paths: it is the only
// code that reassigns `iframe.src` outside of an actual report render.
function spyOnIframeSrcSetter(iframe) {
  let descriptor;
  let proto = iframe;
  while (proto && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(proto, 'src');
    proto = Object.getPrototypeOf(proto);
  }
  const setSpy = vi.fn();
  Object.defineProperty(iframe, 'src', {
    configurable: true,
    get: () => descriptor.get.call(iframe),
    set: (v) => { setSpy(v); descriptor.set.call(iframe, v); },
  });
  return setSpy;
}

describe('ReportViewerPage — Clear Result button (ETP-5013)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams.mockClear();
    mockSelectedOrg = { id: 'org1', name: 'GOOrganization' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is hidden before a report has been generated and appears right after generating', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SIMPLE_REPORT]));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>ok</body></html>') });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());

    // Empty "ready to go" state, no result yet.
    expect(screen.queryByTestId('action-clear-result')).not.toBeInTheDocument();
    expect(screen.getByText('reportReadyTitle')).toBeInTheDocument();

    await user.click(screen.getByText('runReport'));

    await waitFor(() => expect(screen.getByTestId('action-clear-result')).toBeInTheDocument());
    expect(screen.queryByText('reportReadyTitle')).not.toBeInTheDocument();
  });

  it('clicking Clear Result returns to the empty state without touching filter values', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
    const user = userEvent.setup();
    const capturedBodies = [];
    globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SIMPLE_REPORT]));
      if (typeof url === 'string' && url.includes('/render')) {
        capturedBodies.push(JSON.parse(opts.body));
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>ok</body></html>') });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());

    const input = screen.getByRole('textbox');
    await user.type(input, 'foo');
    expect(input).toHaveValue('foo');

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByTestId('action-clear-result')).toBeInTheDocument());
    expect(capturedBodies[0].params.freeText).toBe('foo');

    await user.click(screen.getByTestId('action-clear-result'));

    // Back to the empty state...
    await waitFor(() => expect(screen.queryByTestId('action-clear-result')).not.toBeInTheDocument());
    expect(screen.getByText('reportReadyTitle')).toBeInTheDocument();
    // ...but the filter value the user typed is untouched.
    expect(screen.getByRole('textbox')).toHaveValue('foo');

    // Generating again proves params were never reset either.
    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(capturedBodies).toHaveLength(2));
    expect(capturedBodies[1].params.freeText).toBe('foo');
  });

  it('is disabled while a subsequent render is loading', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
    const user = userEvent.setup();
    let renderCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SIMPLE_REPORT]));
      if (typeof url === 'string' && url.includes('/render')) {
        renderCallCount += 1;
        if (renderCallCount === 1) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>ok</body></html>') });
        }
        return new Promise(() => {}); // second render never resolves — keeps loading: true
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByTestId('action-clear-result')).toBeInTheDocument());
    expect(screen.getByTestId('action-clear-result')).not.toBeDisabled();

    await user.click(screen.getByText('runReport'));

    await waitFor(() => expect(screen.getByText('running')).toBeInTheDocument());
    expect(screen.getByTestId('action-clear-result')).toBeDisabled();
  });

  it('auto-invalidates the generated result as soon as the user edits a filter', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SIMPLE_REPORT]));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>ok</body></html>') });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByTestId('action-clear-result')).toBeInTheDocument());

    // The user edits the filter directly — no click on "Clear Result" at all.
    await user.type(screen.getByRole('textbox'), 'x');

    await waitFor(() => expect(screen.queryByTestId('action-clear-result')).not.toBeInTheDocument());
    expect(screen.getByText('reportReadyTitle')).toBeInTheDocument();
  });

  // Regression guard: the auto-invalidation is wired ONLY to ReportSidebar's
  // real onChange (the user's own edit) — not to a generic effect watching
  // `params` as a whole. `params` also changes internally via
  // loadAutoDefaults (autoDefault-driven values, resolved async after mount)
  // and the orgId/session-sync effect. Neither of those may reset a report
  // that was just auto-rendered from a deep link (ETP-4898's drill-down
  // "open in new tab"), or the freshly generated result would flicker back
  // to the empty state on its own the instant those internal effects land.
  it('does not invalidate a deep-link auto-rendered report when internal effects update params afterwards', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-deep-link', dateFrom: '2026-01-01' });
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([DEEP_LINK_REPORT]));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>ok</body></html>') });
      }
      if (typeof url === 'string' && url.includes('/sws/report-selectors/currency')) {
        // Resolves after a tick, deliberately landing AFTER the deep-link
        // auto-render has already flipped hasGenerated to true.
        return new Promise((resolve) => {
          setTimeout(() => resolve({
            ok: true,
            json: () => Promise.resolve({ items: [{ id: 'USD', name: 'US Dollar' }] }),
          }), 10);
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    const { rerender } = render(<ReportViewerPage />);

    // Deep-link auto-render completes on its own — no user click.
    await waitFor(() => expect(screen.getByTestId('action-clear-result')).toBeInTheDocument());

    // The autoDefault-driven currency fetch lands afterwards and updates
    // `params.currencyId`/`params._display_currencyId` — confirm it actually
    // reached the field...
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('US Dollar'));
    // ...while the generated result is still shown, untouched.
    expect(screen.getByTestId('action-clear-result')).toBeInTheDocument();

    // Also simulate a mid-session active-org change (the other internal
    // params writer) — must not invalidate the result either.
    mockSelectedOrg = { id: 'org2', name: 'Second Org' };
    rerender(<ReportViewerPage />);
    expect(screen.getByTestId('action-clear-result')).toBeInTheDocument();
  });

  // Regression test for the bug found after the button/auto-invalidate
  // behavior above was already implemented: the previously rendered report's
  // HTML was left sitting inside the iframe's contentDocument, bleeding
  // through the semi-transparent "ready to go" blur overlay. The fix
  // (clearGeneratedResult) must reassign the real iframe's `src` to
  // 'about:blank' on both invalidation paths — not just flip `hasGenerated`.
  it('blanks the real iframe src when Clear Result is clicked, not just the overlay flag', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SIMPLE_REPORT]));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>real data</body></html>') });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByTestId('action-clear-result')).toBeInTheDocument());

    // Instrument the setter only now — the render above already wrote to it
    // once via writeToIframe, which is expected and not what we're testing.
    const iframe = screen.getByTitle('report');
    const srcSetSpy = spyOnIframeSrcSetter(iframe);

    await user.click(screen.getByTestId('action-clear-result'));

    expect(srcSetSpy).toHaveBeenCalledWith('about:blank');
    expect(iframe.src).toBe('about:blank');
  });

  it('blanks the real iframe src on automatic invalidation (filter change), not just the overlay flag', async () => {
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SIMPLE_REPORT]));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>real data</body></html>') });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());

    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(screen.getByTestId('action-clear-result')).toBeInTheDocument());

    const iframe = screen.getByTitle('report');
    const srcSetSpy = spyOnIframeSrcSetter(iframe);

    // The user edits the filter directly — no click on "Clear Result" at all.
    await user.type(screen.getByRole('textbox'), 'x');
    await waitFor(() => expect(screen.queryByTestId('action-clear-result')).not.toBeInTheDocument());

    expect(srcSetSpy).toHaveBeenCalledWith('about:blank');
    expect(iframe.src).toBe('about:blank');
  });
});

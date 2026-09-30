// ETP-5424 — a report render is the longest request the app makes, and it is the one a user
// is most likely to see fail on a flaky connection. Two contracts:
//   1. A dropped connection on the render (main viewer AND drill-down modal) shows the
//      translated networkErrorRetry text in the error area — never the browser's
//      'Failed to fetch'. These go through the REAL apiFetch: only `fetch` is stubbed.
//   2. The render call opts out of apiFetch's default timeout (`timeout: 0`): a big report
//      legitimately takes longer than the default, and cutting it off would turn a slow
//      success into a false "try again".
// `useApiFetch` is wrapped (not replaced) so the options each call site passes can be
// asserted while the real client still performs the request.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  registerErrorTranslator, resetErrorTranslatorForTests,
} from '@etendosoftware/app-shell-core/auth';

const TRANSLATED = 'No se pudo completar la acción. Intenta nuevamente.';

const { apiFetchCalls } = vi.hoisted(() => ({ apiFetchCalls: [] }));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const actual = await importOriginal();
  const wrapped = new WeakMap();
  return {
    ...actual,
    useApiFetch: (baseUrl) => {
      const real = actual.useApiFetch(baseUrl);
      if (!wrapped.has(real)) {
        wrapped.set(real, (path, options = {}) => {
          apiFetchCalls.push({ path, options });
          return real(path, options);
        });
      }
      return wrapped.get(real);
    },
  };
});

let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

// networkErrorRetry is mapped so the case holds whether the page shows the NetworkError's own
// (translator-resolved) message or asks ui() for the key itself.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => (key === 'networkErrorRetry' ? 'No se pudo completar la acción. Intenta nuevamente.' : key),
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    selectedRole: { orgList: [] },
    selectedOrg: { id: 'org1', name: 'GOOrganization' },
  }),
  useWindowAccess: () => 'full',
  WindowAccessGuard: (props) => (
    <div data-testid="window-access-guard" data-window-id={props.windowId} />
  ),
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
  DateField: () => <input type="date" data-testid="date-field" />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ReportViewerPage from '../ReportViewerPage.jsx';

const SIMPLE_REPORT = {
  id: 'report-simple',
  title: { en_US: 'Simple Report' },
  type: 'listing',
  outputs: ['pdf'],
  parameters: [
    { name: 'freeText', type: 'text', label: { en_US: 'Free Text' }, section: 'primary' },
  ],
};

function makeReportsListResponse(reports) {
  return { ok: true, json: () => Promise.resolve(reports) };
}

/** fetch stub: the report list and selectors answer, `/render` goes through `onRender`. */
function stubFetch(onRender) {
  globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
    if (url === '/api/reports') return Promise.resolve(makeReportsListResponse([SIMPLE_REPORT]));
    if (typeof url === 'string' && url.includes('/render')) return onRender(url, opts);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  });
}

const renderCalls = () => apiFetchCalls.filter(({ path }) => String(path).includes('/render'));

describe('ReportViewerPage — network failures and render timeout (ETP-5424)', () => {
  beforeEach(() => {
    apiFetchCalls.length = 0;
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
    registerErrorTranslator((key) => (key === 'networkErrorRetry' ? TRANSLATED : key));
  });

  afterEach(() => {
    resetErrorTranslatorForTests();
    vi.restoreAllMocks();
  });

  it('renderReport: a dropped connection shows the translated retry text, never "Failed to fetch"', async () => {
    const user = userEvent.setup();
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());
    await user.click(screen.getByText('runReport'));

    await waitFor(() => expect(screen.getByText(TRANSLATED)).toBeInTheDocument());
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it('renderReport passes timeout: 0 to apiFetch', async () => {
    const user = userEvent.setup();
    stubFetch(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>ok</body></html>') }));

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());
    await user.click(screen.getByText('runReport'));

    await waitFor(() => expect(renderCalls().length).toBeGreaterThanOrEqual(1));
    expect(renderCalls()[0].options.timeout).toBe(0);
  });

  it('renderReport keeps timeout: 0 on a download format (PDF)', async () => {
    const user = userEvent.setup();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    try {
      stubFetch(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['%PDF'])) }));

      render(<ReportViewerPage />);
      await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());
      await user.click(screen.getByText('PDF'));

      await waitFor(() => expect(renderCalls().length).toBeGreaterThanOrEqual(1));
      expect(renderCalls().every(({ options }) => options.timeout === 0)).toBe(true);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('drill-down: a dropped connection on the detail render shows the translated retry text', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'aging-drilldown', bpId: 'bp-42', bpName: 'Acme Corp' },
      }));
    });

    let dialog;
    await waitFor(() => {
      dialog = screen.getByTestId('dialog');
      expect(within(dialog).getByText(TRANSLATED)).toBeInTheDocument();
    });
    expect(within(dialog).queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it('drill-down: the detail render passes timeout: 0', async () => {
    stubFetch(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>detail</body></html>') }));

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    expect(renderCalls()).toHaveLength(0);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'aging-drilldown', bpId: 'bp-42', bpName: 'Acme Corp' },
      }));
    });

    await waitFor(() => expect(renderCalls().length).toBeGreaterThanOrEqual(1));
    expect(renderCalls().every(({ options }) => options.timeout === 0)).toBe(true);
  });
});

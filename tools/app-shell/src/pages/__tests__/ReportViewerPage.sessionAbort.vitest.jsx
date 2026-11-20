// ETP-5645 — the render catch blocks (main viewer AND drill-down) must not surface the session
// AbortError (apiFetch abandoning a request of a session that is gone) and must never print an
// untranslated `err.message`: unexpected errors show the translated reportErrorGeneric text.
// These go through the REAL apiFetch: only `fetch` is stubbed.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const GENERIC = 'No se pudo generar el informe.';

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
  useUI: () => (key) => (key === 'reportErrorGeneric' ? GENERIC : key),
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

const openDrillDown = () => act(() => {
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'aging-drilldown', bpId: 'bp-42', bpName: 'Acme Corp' },
  }));
});
const abort = () => new DOMException('The request belongs to a superseded session.', 'AbortError');

describe('ReportViewerPage — render catch blocks (ETP-5645)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-simple' });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renderReport: a superseded-session AbortError shows no error and ends loading', async () => {
    const user = userEvent.setup();
    stubFetch(() => Promise.reject(abort()));
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());
    await user.click(screen.getByText('runReport'));
    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/render'))).toBe(true));
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    expect(screen.queryByText(/superseded/)).not.toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  for (const [name, make] of [['Error', () => new Error('boom')], ['SyntaxError', () => new SyntaxError('boom')]]) {
    it(`renderReport: ${name} shows the translated generic text, not its message`, async () => {
      const user = userEvent.setup();
      stubFetch(() => Promise.resolve({ ok: true, text: () => Promise.reject(make()) }));
      render(<ReportViewerPage />);
      await waitFor(() => expect(screen.getByText('Free Text')).toBeInTheDocument());
      await user.click(screen.getByText('runReport'));
      await waitFor(() => expect(screen.getByText(GENERIC)).toBeInTheDocument());
      expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    });
  }

  it('drill-down: a superseded-session AbortError shows no error', async () => {
    stubFetch(() => Promise.reject(abort()));
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    openDrillDown();
    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/render'))).toBe(true));
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).queryByText(/superseded/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it('drill-down: an unexpected error shows the translated generic text, not its message', async () => {
    stubFetch(() => Promise.resolve({ ok: true, text: () => Promise.reject(new Error('boom')) }));
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    openDrillDown();
    const dialog = await screen.findByTestId('dialog');
    await waitFor(() => expect(within(dialog).getByText(GENERIC)).toBeInTheDocument());
    expect(within(dialog).queryByText(/boom/)).not.toBeInTheDocument();
  });
});

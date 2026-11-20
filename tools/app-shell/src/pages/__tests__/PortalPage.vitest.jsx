// @covers tools/app-shell/src/pages/PortalPage.jsx
// @covers tools/app-shell/src/pages/portal/PortalShell.jsx
// @covers tools/app-shell/src/pages/portal/PortalHomeView.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentListView.jsx
// @covers tools/app-shell/src/pages/portal/PortalListDesktop.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentDetailView.jsx
// @covers tools/app-shell/src/pages/portal/PortalDetailPanel.jsx
// @covers tools/app-shell/src/pages/portal/PortalBits.jsx
// @covers tools/app-shell/src/components/layout/SearchBar.jsx
// @covers tools/app-shell/src/lib/portal/usePortalApiFetch.js
// Mocks BEFORE imports.
const apiFetchMock = vi.fn();

// The page's only door to the network. Mocked at the hook rather than at `fetch` so the
// request OPTIONS are observable — that is what the plan's §5.4 assertion below reads.
// `real` lets the cold-open test drive the page through the REAL client over a stubbed `fetch`,
// to see what the session scope does to the answers.
const hookMode = { real: false };
vi.mock('@/lib/portal/usePortalApiFetch.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { usePortalApiFetch: (base) => (hookMode.real ? actual.usePortalApiFetch(base) : apiFetchMock) };
});

// The download plumbing lives in its own module so a test can see what would be saved.
vi.mock('@/lib/portal/portalDownload.js', () => ({ saveBlobAsFile: vi.fn() }));

// react-pdf cannot render in jsdom: the viewer is the boundary. The stub shows which URL it got.
vi.mock('@/windows/custom/shared/PdfViewer.jsx', () => ({
  default: ({ url }) => <div data-testid="pdf-viewer" data-url={url} />,
  usePdfZoom: () => ({
    scale: 1, zoomIn: () => {}, zoomOut: () => {}, canZoomIn: true, canZoomOut: true,
  }),
}));
vi.mock('@/windows/custom/shared/FileLightbox.jsx', () => ({
  default: ({ open, file }) => (open ? <div data-testid="pdf-lightbox" data-url={file.objectUrl} /> : null),
}));

// Radix menus open on pointer events jsdom does not drive reliably. This stand-in keeps the
// contract the portal relies on: the content exists only once its trigger has been clicked.
vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await vi.importActual('react');
  const Ctx = React.createContext(null);
  return {
    DropdownMenu: ({ children }) => {
      const [open, setOpen] = React.useState(false);
      return React.createElement(Ctx.Provider, { value: { open, setOpen } }, children);
    },
    DropdownMenuTrigger: ({ children }) => {
      const { open, setOpen } = React.useContext(Ctx);
      return React.cloneElement(children, { onClick: () => setOpen(!open), 'aria-expanded': open });
    },
    DropdownMenuContent: ({ children }) => {
      const { open, setOpen } = React.useContext(Ctx);
      return open ? React.createElement('div', { role: 'menu', onClick: () => setOpen(false) }, children) : null;
    },
    DropdownMenuItem: ({ children, onSelect, ...props }) => React.createElement(
      'button', { type: 'button', role: 'menuitem', onClick: onSelect, ...props }, children,
    ),
  };
});

/**
 * The mocked translation: the key, plus its variables when there are any, so an assertion can see
 * WHICH values reached the copy (the tenant name, the overdue amount) and not just the key.
 * A function declaration, so it is initialized before the hoisted `vi.mock` factories run.
 */
function t(key, vars) {
  return vars ? `${key} ${JSON.stringify(vars)}` : key;
}

/** Mutable per test: the language switch reads and writes it. */
const localeState = { locale: 'es_ES', setLocale: vi.fn() };
const dictionary = { genericLabels: {}, statuses: {} };

vi.mock('@/i18n', () => ({
  useUI: () => t,
  useLocaleSwitch: () => localeState,
  useLocale: () => dictionary,
}));

import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { registerApiSession, resetApiSessionForTests } from '@etendosoftware/app-shell-core/auth';
import PortalPage from '../PortalPage.jsx';
import { ETENDO_PRICING_URL, PortalCreatedWithHeaderLink } from '../portal/PortalBits.jsx';
import { PortalListTable } from '../portal/PortalListDesktop.jsx';
import { saveBlobAsFile } from '@/lib/portal/portalDownload.js';

/**
 * Business Partner self-service portal page (ETP-5267, ETP-6209).
 *
 * The load-bearing test in this file is `sends the token in the X-Portal-Token header on every
 * call` — plan §5.4. The rest guards the link states (dead, expired, unavailable), the shell and
 * its URL-held view, and the three views: home, one kind's list, one document.
 */

const TOKEN = 'tok-abcdef0123456789';

/** A euro amount exactly as the canonical formatter produces it (non-breaking space). */
const eur = (digits) => `${digits} €`;

const IDENTITY = { businessPartnerName: 'Cliente Uno', email: 'cliente@uno.es', tenantName: 'Acme SA' };
const WITH_ENTRY = { ...IDENTITY, entryDocument: { kind: 'INVOICE', id: 'inv-1' } };

const HOME = {
  balances: [
    {
      currency: 'EUR', outstanding: 1210.5, pendingCount: 3, overdue: 210.5, overdueCount: 1,
      overdueSince: '2026-08-15',
    },
    { currency: 'USD', outstanding: 100, pendingCount: 1, overdue: 0, overdueCount: 0 },
  ],
  tiles: {
    QUOTATION: { count: 4, highlight: { code: 'awaitingAnswer', count: 2 } },
    ORDER: { count: 7 },
    SHIPMENT: { count: 0 },
    INVOICE: { count: 12, highlight: { code: 'overdue', count: 1 } },
  },
  recent: [
    { kind: 'ORDER', id: 'ord-1', documentNo: 'PV/0001', date: '2026-08-01', documentStatus: 'CO', currency: 'EUR', grandTotal: 500 },
    {
      // The server says it is overdue: the home badge follows it (no instalments here).
      kind: 'INVOICE', id: 'inv-2', documentNo: 'FV/0002', date: '2026-08-02', documentStatus: 'CO',
      currency: 'EUR', grandTotal: 500, outstandingAmount: 500, overdue: true,
    },
  ],
};

/**
 * Invoices whose payment and due-date states do not depend on the day the suite runs: due dates
 * far in the past, and paid / credit decided before the date is consulted.
 */
const INVOICES = [
  {
    kind: 'INVOICE', id: 'inv-1', documentNo: 'FV/0001', date: '2026-08-01', dueDate: '2020-01-10',
    documentStatus: 'CO', currency: 'EUR', taxBase: 826.45, grandTotal: 1000, outstandingAmount: 0,
  },
  {
    kind: 'INVOICE', id: 'inv-2', documentNo: 'FV/0002', date: '2026-08-02', dueDate: '2020-01-10',
    documentStatus: 'CO', currency: 'EUR', taxBase: 413.22, grandTotal: 500, outstandingAmount: 500, overdue: true,
  },
  {
    kind: 'INVOICE', id: 'inv-3', documentNo: 'AB/0001', date: '2026-08-03', isCreditNote: true,
    documentStatus: 'CO', currency: 'EUR', taxBase: -82.64, grandTotal: -100, outstandingAmount: -100,
  },
];

const order = (n) => ({
  kind: 'ORDER', id: `ord-${n}`, documentNo: `PV/000${n}`, date: '2026-08-01', documentStatus: 'CO',
  currency: 'EUR', taxBase: 100, grandTotal: 121,
});

const LISTS = {
  invoice: { documents: INVOICES, totalCount: 3, statuses: ['CO', 'CL'] },
  shipment: {
    documents: [{ kind: 'SHIPMENT', id: 'shp-1', documentNo: 'AL/0001', date: '2026-08-01', documentStatus: 'CO' }],
    totalCount: 1,
    statuses: ['CO'],
  },
};

const DETAILS = {
  'invoice/inv-1': {
    kind: 'INVOICE', id: 'inv-1', documentNo: 'FV/0001', date: '2026-08-01', dueDate: '2026-08-31',
    documentStatus: 'CO', currency: 'EUR', taxBase: 826.45, grandTotal: 1000, outstandingAmount: 0,
    customer: { name: 'Cliente Uno' },
    lines: [
      { product: 'Tornillo', productCode: 'TOR-1', quantity: 2, unitPrice: 400, tax: 'IVA 21%', amount: 800 },
      { product: 'Arandela', quantity: 1.5, unitPrice: 17.63, tax: 'IVA 21%', amount: 26.45 },
    ],
    taxes: [{ tax: 'IVA 21%', taxableAmount: 826.45, taxAmount: 173.55 }],
    related: [{ kind: 'ORDER', id: 'ord-1', documentNo: 'PV/0001', documentStatus: 'CO' }],
    hasPdf: true,
  },
  'invoice/inv-2': {
    kind: 'INVOICE', id: 'inv-2', documentNo: 'FV/0002', date: '2026-08-02', dueDate: '2020-01-10',
    documentStatus: 'CO', currency: 'EUR', grandTotal: 500, outstandingAmount: 500,
    installments: [{ dueDate: '2020-01-10', amount: 500, paidAmount: 0, outstandingAmount: 500 }],
    lines: [], related: [], hasPdf: false,
  },
  'order/ord-1': {
    kind: 'ORDER', id: 'ord-1', documentNo: 'PV/0001', documentStatus: 'CO', currency: 'EUR',
    grandTotal: 500, lines: [], related: [], hasPdf: false,
  },
};

/**
 * A `fetch`-shaped response. `clone` and `headers` are present because a real `Response` has
 * them and the shared helper reads both — a fake without them fails in a confusing place.
 */
function jsonResponse(body, { status = 200 } = {}) {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    clone: () => jsonResponse(body, { status }),
    json: async () => body,
    blob: async () => null,
  };
}

function blobResponse(blob, { status = 200 } = {}) {
  return { ...jsonResponse({}, { status }), blob: async () => blob };
}

/** Marker for a request that never completes — transient, and never a dead link. */
const NETWORK_FAILURE = Symbol('network failure');

/** Answers in order, repeating the last one: what `/me` says on the first load, then on a re-check. */
function sequence(...answers) {
  let next = 0;
  return () => answers[Math.min(next++, answers.length - 1)];
}

/** What each endpoint answers; a test reassigns a field before rendering. */
let responses;

/**
 * Shows the router's search string, so a test can read the view the URL holds, and the history
 * entry's state (what a reload or a back navigation would read again).
 */
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location-probe" data-state={JSON.stringify(location.state ?? null)}>
      {location.search}
    </output>
  );
}

function renderPortal(path = `/portal/${TOKEN}`, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="portal/:token" element={<><PortalPage /><LocationProbe /></>} />
        <Route path="portal" element={<PortalPage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** The recorded `apiFetch` calls to one portal route, query string ignored. */
const callsTo = (route) => apiFetchMock.mock.calls
  .filter(([path]) => path.split('?')[0].endsWith(route));

/** The query of every list request made so far. */
const listQueries = () => callsTo('/documents')
  .map(([path]) => new URL(path, 'http://portal').searchParams);

/** The view the URL holds, as an object. */
const urlView = () => Object.fromEntries(new URLSearchParams(screen.getByTestId('location-probe').textContent));

/** The kind of the list on screen (its toolbar carries it). */
const listKind = () => screen.getByTestId('portal-document-list').querySelector('[data-kind]')?.getAttribute('data-kind');

/** Every "Creado con Etendo" link: the pricing page, in a new tab, with no opener, named by its label. */
function expectEtendoLink(link) {
  expect(link).toHaveAttribute('href', ETENDO_PRICING_URL);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(link).toHaveAccessibleName('portalCreatedWithLinkLabel');
}

const ETENDO_LINK_TEST_IDS = ['portal-created-with', 'portal-created-with-compact', 'portal-created-with-mobile'];

/** Renders below `md`, where the page opens a document as a full page with its own headers. */
function withViewportWidth(width, body) {
  const original = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  return Promise.resolve(body()).finally(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: original });
  });
}

/** Exact options of every GET the page makes; `/renew` adds `method: 'POST'`. */
const PORTAL_GET_OPTIONS = { token: TOKEN, headers: { 'X-Portal-Token': TOKEN }, on401: 'ignore' };

const shellReady = () => waitFor(
  () => expect(screen.getByTestId('portal-shell')).toBeInTheDocument(),
);
const listReady = () => waitFor(
  () => expect(screen.getAllByTestId('portal-document-row').length).toBeGreaterThan(0),
);
const detailReady = () => waitFor(
  () => expect(screen.getByTestId('portal-document-detail')).toBeInTheDocument(),
);
/** The printable has arrived: its download button is enabled. */
const pdfReady = () => waitFor(
  () => expect(screen.getByTestId('portal-download-pdf')).toBeEnabled(),
);

beforeEach(() => {
  vi.clearAllMocks();
  localeState.locale = 'es_ES';
  // jsdom has no object URLs; the logo and the printable both need one.
  URL.createObjectURL = vi.fn(() => 'blob:portal-object');
  URL.revokeObjectURL = vi.fn();
  // The preview sizes the page from its pane; the setup's ResizeObserver stub observes nothing.
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }

    observe() { this.callback([{ contentRect: { width: 840 } }]); }

    unobserve() {}

    disconnect() {}
  };
  responses = {
    me: jsonResponse(IDENTITY),
    home: jsonResponse(HOME),
    search: jsonResponse({ documents: [INVOICES[1]] }),
    documents: (params) => jsonResponse(
      LISTS[params.get('type')] ?? { documents: [], totalCount: 0, statuses: [] },
    ),
    document: (kind, id) => (DETAILS[`${kind}/${id}`]
      ? jsonResponse(DETAILS[`${kind}/${id}`]) : jsonResponse({}, { status: 404 })),
    pdf: blobResponse(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    // 404 by default: requested only when `/me` reports `hasLogo`.
    logo: jsonResponse({}, { status: 404 }),
    renew: jsonResponse({ state: 'renewed', renewal: 'sent' }),
  };
  apiFetchMock.mockImplementation(async (path) => {
    const [route, query = ''] = path.split('?');
    const documentMatch = route.match(/\/documents\/([^/]+)\/([^/]+?)(\/pdf)?$/);
    let answer;
    if (route.endsWith('/me')) answer = typeof responses.me === 'function' ? responses.me() : responses.me;
    else if (route.endsWith('/home')) answer = responses.home;
    else if (route.endsWith('/search')) answer = responses.search;
    else if (route.endsWith('/renew')) answer = responses.renew;
    else if (route.endsWith('/logo')) answer = responses.logo;
    else if (route.endsWith('/documents')) answer = responses.documents(new URLSearchParams(query));
    else if (documentMatch?.[3]) answer = responses.pdf;
    else if (documentMatch) answer = responses.document(documentMatch[1], decodeURIComponent(documentMatch[2]));
    else throw new Error(`unexpected portal path: ${path}`);

    if (answer === NETWORK_FAILURE) throw new TypeError('Failed to fetch');
    return answer;
  });
});

afterEach(() => {
  vi.useRealTimers();
  // The rail remembers its collapsed state per browser; no test may leak it into the next.
  localStorage.clear();
});

describe('PortalPage — token handling (plan §5.4)', () => {
  it('sends the token in the X-Portal-Token header on every call, and never in a URL', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse({ ...WITH_ENTRY, hasLogo: true });
    responses.logo = blobResponse(new Blob(['png'], { type: 'image/png' }));
    renderPortal();
    await detailReady();
    await pdfReady();

    await user.click(screen.getByTestId('portal-download-pdf'));
    await user.click(screen.getByTestId('portal-panel-close'));
    await listReady();
    await user.click(screen.getByTestId('portal-nav-home'));
    await shellReady();
    await user.type(screen.getByTestId('portal-global-search'), 'FV');
    await waitFor(() => expect(callsTo('/search')).toHaveLength(1));

    // Every GET the page can make: identity, home, logo, a document, its printable, a list, the
    // search. `/renew` is asserted in the link-states block.
    const routes = new Set(apiFetchMock.mock.calls.map(([path]) => path.split('?')[0]));
    expect([...routes].sort()).toEqual([
      '/sws/portal/documents',
      '/sws/portal/documents/invoice/inv-1',
      '/sws/portal/documents/invoice/inv-1/pdf',
      '/sws/portal/home',
      '/sws/portal/logo',
      '/sws/portal/me',
      '/sws/portal/search',
    ]);
    for (const [path, options] of apiFetchMock.mock.calls) {
      expect(path).not.toContain(TOKEN);
      // Strict: `toEqual` would also accept a stray `method: undefined` or a dropped header key.
      expect(options).toStrictEqual(PORTAL_GET_OPTIONS);
    }
  });

  it('never calls the backend when the link carries no token', async () => {
    renderPortal('/portal');

    await waitFor(() => expect(screen.getByTestId('portal-invalid-link')).toBeInTheDocument());
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('PortalPage — a cold open from the email', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    hookMode.real = false;
    globalThis.fetch = realFetch;
    resetApiSessionForTests();
  });

  it('shows the portal when the app session identity settles while its first requests are in flight', async () => {
    // The customer has no app session: the auth bootstrap resolves the identity (unknown, then
    // anonymous) in parallel with /me and /home. Their answers must not be discarded as belonging
    // to a superseded session, which would put a valid link on the load-error screen.
    let identityReplaced = false;
    registerApiSession({
      getToken: () => null,
      onUnauthorized: vi.fn(),
      scope: {
        capture: () => ({}),
        isSameIdentity: () => !identityReplaced,
        isCurrent: () => !identityReplaced,
      },
    });
    globalThis.fetch = vi.fn(async (url) => {
      identityReplaced = true;
      return new Response(JSON.stringify(String(url).endsWith('/sws/portal/me') ? IDENTITY : HOME), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    hookMode.real = true;

    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-home')).toBeInTheDocument();
    expect(screen.getByTestId('portal-customer-name').textContent).toBe('Cliente Uno');
    expect(screen.queryByTestId('portal-load-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-invalid-link')).not.toBeInTheDocument();
  });
});

describe('PortalPage — dead link (plan §5.2)', () => {
  it('shows the generic invalid-link notice, with no retry to loop on', async () => {
    responses.me = jsonResponse({}, { status: 401 });
    renderPortal();

    await waitFor(() => expect(screen.getByTestId('portal-invalid-link')).toBeInTheDocument());
    expect(screen.getByTestId('portal-invalid-link')).toHaveTextContent('portalInvalidLinkTitle');
    expect(screen.getByTestId('portal-invalid-link-description'))
      .toHaveTextContent('portalInvalidLinkDescription');
    expect(screen.queryByTestId('portal-retry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-load-error')).not.toBeInTheDocument();
  });

  it('renders 401, 403 and 404 as one indistinguishable screen', async () => {
    // Not "each of them is an error" — byte-identical output, so nothing rendered can be used
    // to tell an unknown token from a revoked one or from another BP's document.
    const screens = [];
    for (const status of [401, 403, 404]) {
      responses.me = jsonResponse({}, { status });
      const { container, unmount } = renderPortal();
      // eslint-disable-next-line no-await-in-loop -- one render per status, deliberately serial
      await waitFor(() => expect(screen.getByTestId('portal-invalid-link')).toBeInTheDocument());
      screens.push(container.innerHTML);
      unmount();
    }

    expect(screens[1]).toBe(screens[0]);
    expect(screens[2]).toBe(screens[0]);
  });
});

describe('PortalPage — transient failure', () => {
  it('offers a retry that recovers, on a screen distinct from the dead-link one', async () => {
    const user = userEvent.setup();
    responses.home = NETWORK_FAILURE;
    renderPortal();

    await waitFor(() => expect(screen.getByTestId('portal-load-error')).toBeInTheDocument());
    expect(screen.getByTestId('portal-load-error')).toHaveTextContent('portalLoadErrorTitle');
    expect(screen.queryByTestId('portal-invalid-link')).not.toBeInTheDocument();

    responses.home = jsonResponse(HOME);
    await user.click(screen.getByTestId('portal-retry'));

    await shellReady();
    expect(screen.getByTestId('portal-home')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-load-error')).not.toBeInTheDocument();
  });
});

describe('PortalPage — view in the URL', () => {
  it('opens the entry document when the URL names no view', async () => {
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    expect(callsTo('/documents/invoice/inv-1')).toHaveLength(1);
    expect(screen.getByTestId('portal-panel-title').textContent).toBe('portalKindInvoice FV/0001');
    expect(screen.getByTestId('location-probe').textContent).toBe('');
  });

  it('opens home when there is neither a view nor an entry document', async () => {
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-home')).toBeInTheDocument();
    expect(callsTo('/home')).toHaveLength(1);
  });

  // A backend newer than the bundle may name a kind this page does not know; indexing the kind
  // table with it would crash the page instead of showing anything.
  for (const [label, entryDocument] of [
    ['an unknown kind', { kind: 'PAYMENT', id: 'pay-1' }],
    ['no id', { kind: 'INVOICE', id: '' }],
  ]) {
    it(`falls back to home when the entry document has ${label}`, async () => {
      responses.me = jsonResponse({ ...IDENTITY, entryDocument });
      renderPortal();
      await shellReady();

      expect(screen.getByTestId('portal-home')).toBeInTheDocument();
      expect(apiFetchMock.mock.calls.some(([path]) => path.includes('/documents/'))).toBe(false);
    });
  }

  it('opens the list of the entry kind, with a notice, when the entry document is gone', async () => {
    responses.me = jsonResponse({ ...IDENTITY, entryKind: 'ORDER' });
    renderPortal();

    await waitFor(() => expect(listKind()).toBe('ORDER'));
    const notice = screen.getByTestId('portal-entry-unavailable');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice.textContent).toBe('portalEntryDocumentUnavailable');
  });

  it('opens home, with the notice, when the gone entry document is of an unknown kind', async () => {
    responses.me = jsonResponse({ ...IDENTITY, entryKind: 'PAYMENT' });
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-home')).toBeInTheDocument();
    expect(screen.getByTestId('portal-entry-unavailable')).toBeInTheDocument();
    expect(callsTo('/documents')).toHaveLength(0);
  });

  it('opens home without the notice when /me names neither an entry document nor an entry kind', async () => {
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-home')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-entry-unavailable')).not.toBeInTheDocument();
  });

  it('lets a view in the URL win over the entry document', async () => {
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal(`/portal/${TOKEN}?view=list&kind=INVOICE`);
    await listReady();

    expect(listKind()).toBe('INVOICE');
    expect(callsTo('/documents/invoice/inv-1')).toHaveLength(0);
  });

  it('writes the view to the search string on navigation, never the token', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-panel-close'));
    await listReady();

    expect(urlView()).toEqual({ view: 'list', kind: 'INVOICE' });
    expect(screen.getByTestId('location-probe').textContent).not.toContain(TOKEN);
  });
});

describe('PortalPage — shell', () => {
  it('shows the customer the link belongs to, as the sidebar row and the mobile avatar', async () => {
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-customer-name').textContent).toBe('Cliente Uno');
    const avatar = screen.getByTestId('portal-customer-avatar');
    expect(avatar.textContent).toBe('CU');
    expect(avatar).toHaveAttribute('aria-label', 'Cliente Uno');
  });

  it('shows no customer row and no avatar when /me names no customer', async () => {
    responses.me = jsonResponse({ tenantName: 'Acme SA' });
    renderPortal();
    await shellReady();

    expect(screen.queryByTestId('portal-customer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-customer-avatar')).not.toBeInTheDocument();
  });

  it('draws the header "Creado con Etendo" pill from lg and the compact tile below it, never both', () => {
    render(<PortalCreatedWithHeaderLink />);

    const pill = screen.getByTestId('portal-created-with');
    const compact = screen.getByTestId('portal-created-with-compact');
    // jsdom has no layout: what splits the two at the breakpoint is their wrappers' classes.
    expect(pill.parentElement).toHaveClass('hidden', 'lg:flex');
    expect(pill.parentElement).not.toHaveClass('lg:hidden');
    expect(compact.parentElement).toHaveClass('lg:hidden');
    expect(compact.parentElement).not.toHaveClass('hidden');
    // The pill writes the copy; the compact tile is only the mark, named and titled by the label.
    expect(pill).toHaveTextContent('portalCreatedWith');
    expect(pill).toHaveTextContent('portalLearnMore');
    expect(compact.textContent).toBe('');
    expect(compact).toHaveAttribute('title', 'portalCreatedWithLinkLabel');
    for (const link of [pill, compact]) expectEtendoLink(link);
  });

  // Each view draws its own headers: the link must be in every one of them, and the rail (where
  // the old etendo.ai brand lived) must not carry it.
  for (const { view, path, width, ready, desktopHeader, mobileHeader } of [
    {
      view: 'home',
      path: `/portal/${TOKEN}`,
      ready: shellReady,
      desktopHeader: () => screen.getByTestId('portal-view-header'),
      mobileHeader: () => screen.getByTestId('portal-mobile-topbar'),
    },
    {
      view: 'list',
      path: `/portal/${TOKEN}?view=list&kind=INVOICE`,
      ready: listReady,
      desktopHeader: () => screen.getByTestId('portal-view-header'),
      // The list's mobile header has no test id of its own; the only tile on this view is in it.
      mobileHeader: () => screen.getByTestId('portal-created-with-mobile').closest('header'),
    },
    {
      // Below md a document is a full page with both headers (desktop opens it as a drawer).
      view: 'document page',
      path: `/portal/${TOKEN}?view=doc&kind=ORDER&id=ord-1`,
      width: 500,
      ready: detailReady,
      desktopHeader: () => screen.getByTestId('portal-back').closest('header'),
      mobileHeader: () => screen.getByTestId('portal-back-mobile').closest('header'),
    },
  ]) {
    it(`puts the Etendo link in the ${view} desktop and mobile headers, and never in the rail`, async () => {
      await withViewportWidth(width ?? window.innerWidth, async () => {
        renderPortal(path);
        await ready();
      });

      const desktop = within(desktopHeader());
      const mobile = mobileHeader();
      expect(mobile).toHaveClass('md:hidden');
      for (const link of [
        desktop.getByTestId('portal-created-with'),
        desktop.getByTestId('portal-created-with-compact'),
        within(mobile).getByTestId('portal-created-with-mobile'),
      ]) expectEtendoLink(link);
      const rail = within(screen.getByTestId('portal-sidebar'));
      for (const testId of ETENDO_LINK_TEST_IDS) expect(rail.queryByTestId(testId)).not.toBeInTheDocument();
    });
  }

  it('marks the open view in the sidebar and counts what needs the customer', async () => {
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-nav-home')).toHaveAttribute('aria-current', 'page');
    // "Ayuda y soporte" was removed from the rail (PO answer).
    expect(screen.queryByTestId('portal-help')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('portal-nav-quotation')).getByTestId('portal-nav-count').textContent).toBe('2');
    expect(within(screen.getByTestId('portal-nav-invoice')).getByTestId('portal-nav-count').textContent).toBe('1');
    expect(within(screen.getByTestId('portal-nav-order')).queryByTestId('portal-nav-count')).not.toBeInTheDocument();
  });
});

describe('PortalPage — rail', () => {
  it('shows the promo card only while the rail is expanded, and remembers the choice', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    const rail = screen.getByTestId('portal-sidebar');
    expect(rail).toHaveAttribute('data-collapsed', 'false');
    // "Empieza gratis" opens the app's sign-up (PO answer).
    expect(within(rail).getByTestId('portal-promo-cta')).toHaveAttribute('href', 'https://app.etendo.ai/onboarding');

    await user.click(screen.getByTestId('portal-rail-toggle'));

    expect(rail).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('portal-promo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-nav-quotation')).not.toBeInTheDocument();
    // Collapsed, "Mis documentos" carries the total of the kinds' counts (2 quotations + 1 invoice).
    expect(screen.getByTestId('portal-nav-documents-count').textContent).toBe('3');
    expect(localStorage.getItem('etendo.portal.railCollapsed')).toBe('true');

    // "Mis documentos" expands the rail again, to choose a kind.
    await user.click(screen.getByTestId('portal-nav-documents'));
    expect(rail).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('portal-promo')).toBeInTheDocument();
  });

  // The header is the only place the company appears in the rail. Scoped to `portal-rail-company`:
  // the mobile top bar writes the tenant name too.
  for (const { state, collapse, alt, title } of [
    // Expanded, the name is written beside the logo, so the image stays silent.
    { state: 'expanded', collapse: false, alt: '', title: null },
    // Collapsed, the logo stands alone: it says the company, and its tooltip names it.
    { state: 'collapsed', collapse: true, alt: 'Acme SA', title: 'Acme SA' },
  ]) {
    it(`heads the ${state} rail with the company's round logo`, async () => {
      const user = userEvent.setup();
      responses.me = jsonResponse({ ...IDENTITY, hasLogo: true });
      responses.logo = blobResponse(new Blob(['logo'], { type: 'image/png' }));
      renderPortal();
      await shellReady();
      if (collapse) await user.click(screen.getByTestId('portal-rail-toggle'));

      const company = screen.getByTestId('portal-rail-company');
      const logo = await waitFor(() => within(company).getByTestId('portal-logo'));
      expect(logo).toHaveAttribute('src', 'blob:portal-object');
      expect(logo).toHaveAttribute('alt', alt);
      expect(within(company).getByTestId('portal-logo-tile')).toHaveClass('rounded-full');
      expect(company.getAttribute('title')).toBe(title);
      const names = within(company).queryAllByTestId('portal-tenant-name');
      expect(names.map((name) => name.textContent)).toEqual(collapse ? [] : ['Acme SA']);
    });
  }

  it('shows the company\'s initials without a logo, and no company item in either rail state', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    const company = () => screen.getByTestId('portal-rail-company');
    expect(within(company()).queryByTestId('portal-logo')).not.toBeInTheDocument();
    expect(within(company()).getByTestId('portal-logo-tile').textContent).toBe('AS');
    expect(screen.queryByTestId('portal-company')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('portal-rail-toggle'));

    expect(within(company()).getByTestId('portal-logo-tile').textContent).toBe('AS');
    expect(screen.queryByTestId('portal-company')).not.toBeInTheDocument();
    // Collapsed, the menu below the header is only expand, Inicio and "Mis documentos".
    const menu = screen.getByTestId('portal-nav-home').parentElement;
    expect([...menu.children].map((item) => item.dataset.testid))
      .toEqual(['portal-rail-toggle', 'portal-nav-home', 'portal-nav-documents']);
  });
});

describe('PortalPage — language', () => {
  it('offers the language only in the user menu, opened from the customer, and switches to English', async () => {
    const user = userEvent.setup();
    localeState.locale = undefined;
    renderPortal();
    await shellReady();

    // As in the app (PO answer): no standalone language switch; the user (the rail's customer row
    // or the mobile avatar) opens a menu with the language section.
    expect(screen.queryByTestId('portal-language-switch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-language-en')).not.toBeInTheDocument();
    await user.click(within(screen.getByTestId('portal-sidebar')).getByTestId('portal-customer'));
    // The app's user popup look: the customer's name and email, then the language.
    const header = screen.getByTestId('portal-user-menu-header');
    expect(header).toHaveTextContent('Cliente Uno');
    expect(within(header).getByTestId('portal-user-menu-email').textContent).toBe('cliente@uno.es');

    await user.click(screen.getByTestId('portal-language-en'));
    expect(localeState.setLocale).toHaveBeenCalledWith('en_US');
  });

  for (const [locale, active] of [['es_ES', 'es'], ['en_US', 'en']]) {
    it(`marks ${locale} as the active language`, async () => {
      const user = userEvent.setup();
      localeState.locale = locale;
      renderPortal();
      await shellReady();

      await user.click(screen.getAllByTestId('portal-customer-avatar')[0]);

      for (const short of ['es', 'en']) {
        const { className } = screen.getByTestId(`portal-language-${short}`);
        if (short === active) expect(className).toMatch(/font-semibold/);
        else expect(className).not.toMatch(/font-semibold/);
      }
    });
  }
});

describe('PortalPage — home', () => {
  it('shows the pending balance per currency, and the overdue line on the mobile card', async () => {
    renderPortal();
    await shellReady();

    const pending = screen.getAllByTestId('portal-balance-outstanding');
    expect(pending).toHaveLength(2);
    expect(pending[0].textContent).toBe(eur('1.210,50'));
    // The overdue detail belongs to the mobile card, once, for the currency that has it.
    const hero = screen.getByTestId('portal-pending-hero');
    expect(hero.textContent.match(/portalOverdueSince/g)).toHaveLength(1);
    // textContent, not toHaveTextContent: the matcher turns the amount's non-breaking space into a
    // plain one, so the formatted amount would never match.
    expect(hero.textContent).toContain(t('portalOverdueSince', { amount: eur('210,50'), date: '15/08/2026' }));
  });

  it('says nothing is pending when there are no balances', async () => {
    responses.home = jsonResponse({ ...HOME, balances: [] });
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-balance-empty').textContent).toBe('—');
    expect(screen.getByTestId('portal-pending-hero')).toHaveTextContent('portalNothingPending');
    expect(screen.queryByTestId('portal-view-pending-invoices')).not.toBeInTheDocument();
  });

  it('shows one tile per kind, with the figure the kind calls out', async () => {
    renderPortal();
    await shellReady();

    for (const [kind, count, label] of [
      ['quotation', '2', 'portalHighlightAwaitingAnswer'],
      ['order', '7', 'portalTileTotal'],
      ['shipment', '0', 'portalTileTotal'],
      ['invoice', '1', 'portalHighlightOverdue'],
    ]) {
      const tile = screen.getByTestId(`portal-tile-${kind}`);
      expect(within(tile).getByTestId('portal-tile-count').textContent).toBe(count);
      expect(tile).toHaveTextContent(label);
    }
  });

  it('opens the tab a tile counts, on all time, since what it counts may be older than a month', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    await user.click(screen.getByTestId('portal-tile-invoice'));

    await listReady();
    expect(urlView()).toEqual({ view: 'list', kind: 'INVOICE', group: 'overdue' });
    for (const query of listQueries()) {
      expect([query.get('type'), query.get('group'), query.get('dateFrom')]).toEqual(['invoice', 'overdue', null]);
    }
  });

  it('opens a plain list from a tile with nothing to call out', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    await user.click(screen.getByTestId('portal-tile-order'));

    await waitFor(() => expect(listKind()).toBe('ORDER'));
    expect(urlView()).toEqual({ view: 'list', kind: 'ORDER' });
  });

  it('lists the recent documents, the overdue one as overdue, and opens one', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    const recent = screen.getAllByTestId('portal-recent-document');
    expect(recent).toHaveLength(2);
    expect(recent[0]).toHaveTextContent('portalKindOrder');
    expect(recent[0]).toHaveTextContent('PV/0001');
    // No instalments on the home: the server's overdue flag decides the badge.
    expect(within(recent[1]).getByTestId('portal-payment-status')).toHaveAttribute('data-state', 'overdue');

    await user.click(recent[0]);

    await detailReady();
    expect(callsTo('/documents/order/ord-1')).toHaveLength(1);
    expect(screen.getByTestId('portal-panel-title').textContent).toBe('portalKindOrder PV/0001');
  });

  it('switches the chart between vertical and horizontal bars, with the month and amount on hover', async () => {
    const user = userEvent.setup();
    responses.home = jsonResponse({
      ...HOME,
      chart: { months: 3, currency: 'EUR', bars: [{ month: '2026-09', amount: 500 }, { month: '2026-10', amount: 1000 }] },
    });
    renderPortal();
    await shellReady();

    const chart = screen.getByTestId('portal-chart-body');
    expect(chart).toHaveAttribute('data-orientation', 'vertical');
    expect(screen.getByTestId('portal-chart-orientation-vertical')).toHaveAttribute('aria-pressed', 'true');
    const tallest = screen.getAllByTestId('portal-chart-bar')[1];
    expect(tallest.style.height).toBe('100%');

    await user.click(screen.getByTestId('portal-chart-orientation-horizontal'));

    expect(chart).toHaveAttribute('data-orientation', 'horizontal');
    expect(screen.getByTestId('portal-chart-orientation-horizontal')).toHaveAttribute('aria-pressed', 'true');
    const [half, full] = screen.getAllByTestId('portal-chart-bar');
    expect([half.style.width, full.style.width]).toEqual(['50%', '100%']);

    await user.hover(full);
    // The canonical formatter puts a no-break space before the symbol.
    expect(screen.getByTestId('portal-chart-tooltip')).toHaveTextContent(/1\.000,00\s€/);
  });

  it('shows one balance badge per currency, side by side in a wrapping row', async () => {
    responses.home = jsonResponse({
      ...HOME,
      balances: [
        { currency: 'EUR', outstanding: 1234567.89, pendingCount: 3 },
        { currency: 'USD', outstanding: 98765.43, pendingCount: 1 },
      ],
      paidThisYear: [{ currency: 'EUR', paid: 10, count: 1 }, { currency: 'USD', paid: 20, count: 2 }],
    });
    renderPortal();
    await shellReady();

    const pending = screen.getAllByTestId('portal-balance-outstanding');
    expect(pending).toHaveLength(2);
    expect(pending[0].parentElement).toBe(pending[1].parentElement);
    expect(pending[0].parentElement).toHaveClass('flex-wrap');
    expect(screen.getByTestId('portal-balance-pending-count').textContent).toBe('4');
    const paid = screen.getAllByTestId('portal-balance-paid-amount');
    expect(paid).toHaveLength(2);
    expect(paid[0].parentElement).toHaveClass('flex-wrap');
  });

  it('refetches only the home aggregates for another chart period', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();
    expect(new URL(callsTo('/home')[0][0], 'http://portal').searchParams.get('months')).toBe('12');

    await user.click(screen.getByTestId('portal-period'));
    await user.click(screen.getByTestId('portal-period-3'));

    await waitFor(() => expect(callsTo('/home')).toHaveLength(2));
    expect(new URL(callsTo('/home')[1][0], 'http://portal').searchParams.get('months')).toBe('3');
    expect(callsTo('/me')).toHaveLength(1);
  });

  it('searches every kind from the header and opens a match', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    // The app's own search bar (shared with the top bar), not a portal copy; it never reaches the
    // app's global search: the query goes to the portal's /search only.
    const input = screen.getByTestId('portal-global-search');
    expect(input.closest('.bg-search-bg')).not.toBeNull();
    expect(screen.queryByTestId('global-search-trigger')).not.toBeInTheDocument();
    await user.type(input, 'FV');

    await waitFor(() => expect(screen.getAllByTestId('portal-search-result')).toHaveLength(1));
    expect(new URL(callsTo('/search')[0][0], 'http://portal').searchParams.get('q')).toBe('FV');
    await user.click(screen.getByTestId('portal-search-result'));
    await detailReady();
    expect(urlView()).toEqual({ view: 'doc', kind: 'INVOICE', id: 'inv-2' });
  });
});

describe('PortalPage — document list', () => {
  const listPath = (kind, group) => `/portal/${TOKEN}?view=list&kind=${kind}${group ? `&group=${group}` : ''}`;

  it('asks for the rolling last month by default', async () => {
    // Only `Date` is faked, so the debounce and the waits keep their real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 2, 31, 10, 0));
    renderPortal(listPath('INVOICE'));
    await listReady();

    // 31 March → 28 February: the day is clamped to the shorter month.
    expect(listQueries().length).toBeGreaterThan(0);
    for (const query of listQueries()) {
      expect([query.get('dateFrom'), query.get('dateTo')]).toEqual(['2026-02-28', '2026-03-31']);
    }
  });

  it('offers no bulk download and no row checkboxes (PO: out for now)', async () => {
    renderPortal(listPath('INVOICE'));
    await listReady();

    expect(screen.queryByTestId('portal-download-selected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-select-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-select-row')).not.toBeInTheDocument();
  });

  it('sums the shown rows per currency', async () => {
    LISTS.invoice = {
      ...LISTS.invoice,
      documents: [...INVOICES, { ...INVOICES[0], id: 'inv-usd', documentNo: 'US/0001', currency: 'USD', taxBase: 10, grandTotal: 12 }],
    };
    try {
      renderPortal(listPath('INVOICE'));
      await listReady();

      const totals = screen.getAllByTestId('portal-document-totals');
      expect(totals).toHaveLength(2);
      expect(totals[0]).toHaveTextContent(/1\.400,00\s€/);
      expect(totals[1]).toHaveTextContent(/12,00/);
    } finally {
      LISTS.invoice = { documents: INVOICES, totalCount: 3, statuses: ['CO', 'CL'] };
    }
  });

  it('offers "all" plus the kind\'s status groups, and a tab sends its group, never a status', async () => {
    const user = userEvent.setup();
    renderPortal(listPath('INVOICE'));
    await listReady();

    const desktopTabs = screen.getAllByRole('tab').map((tab) => tab.getAttribute('data-testid'))
      .filter((id) => !id.endsWith('-mobile'));
    expect(desktopTabs).toEqual([
      'portal-status-tab-all', 'portal-status-tab-pending', 'portal-status-tab-overdue', 'portal-status-tab-paid',
    ]);
    expect(listQueries().every((query) => !query.has('group') && !query.has('status'))).toBe(true);

    await user.click(screen.getByTestId('portal-status-tab-paid'));

    await waitFor(() => expect(listQueries().some((query) => query.get('group') === 'paid')).toBe(true));
    expect(screen.getByTestId('portal-status-tab-paid')).toHaveAttribute('aria-selected', 'true');
    expect(urlView()).toEqual({ view: 'list', kind: 'INVOICE', group: 'paid' });
    expect(listQueries().some((query) => query.has('status'))).toBe(false);
  });

  it('debounces the search and sends it as q', async () => {
    const user = userEvent.setup();
    renderPortal(listPath('INVOICE'));
    await listReady();

    await user.type(screen.getByTestId('portal-search'), 'FV');

    await waitFor(() => expect(listQueries().some((query) => query.get('q') === 'FV')).toBe(true));
    // Typed faster than the debounce: no request went out for the half-typed term.
    expect(listQueries().some((query) => query.get('q') === 'F')).toBe(false);
  });

  it('loads the next page on demand and appends it', async () => {
    const user = userEvent.setup();
    responses.documents = (params) => jsonResponse(params.get('offset') === '2'
      ? { documents: [order(3)], totalCount: 3 }
      : { documents: [order(1), order(2)], totalCount: 3 });
    renderPortal(listPath('ORDER'));
    await listReady();
    expect(screen.getAllByTestId('portal-document-row')).toHaveLength(2);

    await user.click(screen.getByTestId('portal-load-more'));

    await waitFor(() => expect(screen.getAllByTestId('portal-document-row')).toHaveLength(3));
    expect(listQueries().some((query) => query.get('offset') === '2')).toBe(true);
    expect(screen.queryByTestId('portal-load-more')).not.toBeInTheDocument();
  });

  it('shows each invoice\'s type, payment badge and due-date dot', async () => {
    renderPortal(listPath('INVOICE'));
    await listReady();

    const rows = screen.getAllByTestId('portal-document-row');
    const states = rows.map((row) => [
      within(row).getByTestId('portal-document-open').textContent,
      within(row).getByTestId('portal-invoice-type').getAttribute('data-credit-note'),
      within(row).getByTestId('portal-payment-status').getAttribute('data-state'),
      within(row).queryByTestId('portal-due-date')?.getAttribute('data-state') ?? null,
    ]);
    expect(states).toEqual([
      ['FV/0001', 'false', 'paid', 'paid'],
      // The list badge never says overdue (as in the invoice list grid); the due-date dot does.
      ['FV/0002', 'false', 'pending', 'overdue'],
      // A credit note lives among the invoices, as a rectificative.
      ['AB/0001', 'true', 'credit-available', null],
    ]);
    expect(within(rows[2]).getByTestId('portal-invoice-type').textContent).toBe('rectificativeInvoicesTab');
  });

  it('shows no amount columns for shipments and a dash on the card', async () => {
    renderPortal(listPath('SHIPMENT'));
    await listReady();

    const table = screen.getByTestId('portal-document-table');
    expect(within(table).queryByText('portalColTaxBase')).not.toBeInTheDocument();
    expect(within(table).queryByText('portalColTotal')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('portal-document-card')).getByText('—')).toBeInTheDocument();
  });

  it('shows an empty state when the kind has nothing in range', async () => {
    renderPortal(listPath('QUOTATION'));

    await waitFor(() => expect(screen.getByTestId('portal-list-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-document-table')).not.toBeInTheDocument();
  });

  it('opens a document from a click anywhere on its row', async () => {
    const user = userEvent.setup();
    renderPortal(listPath('INVOICE'));
    await listReady();

    await user.click(within(screen.getAllByTestId('portal-document-row')[0]).getByText('—'));

    await detailReady();
    expect(urlView()).toEqual({ view: 'doc', kind: 'INVOICE', id: 'inv-1' });
  });

  it('opens a document once from its number, by click or Enter, with only the row\'s hover', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const row = order(1);
    render(<PortalListTable kind="ORDER" documents={[row]} onOpen={onOpen} />);

    const number = screen.getByTestId('portal-document-open');
    // Hover belongs to the row (Figma): the number has no colour of its own, but keeps a focus ring.
    expect(number.className).not.toMatch(/hover:text-/);
    expect(number).toHaveClass('focus-visible:ring-2');

    // The row opens the same document: the number's click must not reach it a second time.
    await user.click(number);
    expect(onOpen.mock.calls).toEqual([[row]]);

    number.focus();
    await user.keyboard('{Enter}');
    expect(onOpen.mock.calls).toEqual([[row], [row]]);
  });
});

describe('PortalPage — mobile layout', () => {
  // The breakpoint is Tailwind's `md` in the markup, which jsdom does not evaluate: what is
  // asserted is that each half carries the class that shows it on its own side of the breakpoint.
  it('renders the list both as a desktop table and as mobile cards, one card per row', async () => {
    renderPortal(`/portal/${TOKEN}?view=list&kind=INVOICE`);
    await listReady();

    expect(screen.getByTestId('portal-document-table').parentElement).toHaveClass('hidden', 'md:block');
    expect(screen.getByTestId('portal-document-cards')).toHaveClass('md:hidden');
    expect(screen.getAllByTestId('portal-document-card'))
      .toHaveLength(screen.getAllByTestId('portal-document-row').length);
  });

  it('shows on each invoice card the status when it is not completed, and what is still owed', async () => {
    responses.documents = () => jsonResponse({
      documents: [
        { ...INVOICES[1], overdue: false },
        { ...INVOICES[0], id: 'inv-9', documentNo: 'FV/0009', documentStatus: 'CL' },
      ],
      totalCount: 2,
    });
    renderPortal(`/portal/${TOKEN}?view=list&kind=INVOICE`);
    await listReady();

    const [completed, closed] = screen.getAllByTestId('portal-document-card');
    // Completed is what every listed invoice is: the card shows the payment state instead.
    expect(within(completed).queryByTestId('portal-document-status')).not.toBeInTheDocument();
    expect(within(completed).getByTestId('portal-payment-status')).toHaveAttribute('data-state', 'pending');
    expect(within(completed).getByTestId('portal-card-outstanding').textContent)
      .toBe(`portalColOutstanding ${eur('500,00')}`);
    expect(within(closed).getByTestId('portal-document-status')).toHaveAttribute('data-status', 'CL');
    expect(within(closed).getByTestId('portal-card-outstanding').textContent)
      .toBe(`portalColOutstanding ${eur('0,00')}`);
  });

  it('shows the bottom navigation below the breakpoint, with orders and shipments under "Más"', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-sidebar')).toHaveClass('hidden', 'md:flex');
    const bottomNav = screen.getByTestId('portal-bottom-nav');
    expect(bottomNav).toHaveClass('md:hidden');
    expect(within(bottomNav).getByTestId('portal-bottom-nav-home')).toHaveAttribute('aria-current', 'page');
    expect(within(bottomNav).queryByTestId('portal-bottom-nav-order')).not.toBeInTheDocument();

    await user.click(within(bottomNav).getByTestId('portal-bottom-nav-more'));
    await user.click(within(bottomNav).getByTestId('portal-bottom-nav-order'));

    await waitFor(() => expect(listKind()).toBe('ORDER'));
    expect(within(bottomNav).getByTestId('portal-bottom-nav-more')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('PortalPage — document detail', () => {
  it('shows the printable in the PDF viewer, with no data sheet, once it arrives', async () => {
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await waitFor(() => expect(screen.getByTestId('pdf-viewer')).toHaveAttribute('data-url', 'blob:portal-object'));
    expect(screen.queryByTestId('portal-document-sheet')).not.toBeInTheDocument();
    expect(callsTo('/documents/invoice/inv-1/pdf')[0][1]).toStrictEqual(PORTAL_GET_OPTIONS);
  });

  it('opens the printable full screen from the mobile "Ver PDF"', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();
    await pdfReady();

    await user.click(screen.getByTestId('portal-view-pdf'));
    expect(screen.getByTestId('pdf-lightbox')).toHaveAttribute('data-url', 'blob:portal-object');
  });

  it('saves the printable already fetched under a path-safe name on "Descargar PDF"', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();
    await pdfReady();

    await user.click(screen.getByTestId('portal-download-pdf'));

    // `FV/0001` would be saved as `0001.pdf` if the slash reached the download attribute.
    expect(saveBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'FV-0001.pdf');
    expect(saveBlobAsFile.mock.calls[0][0].type).toBe('application/pdf');
    // The download reuses the fetched printable: no second request.
    expect(callsTo('/documents/invoice/inv-1/pdf')).toHaveLength(1);
  });

  it('offers only "Descargar PDF" in the preview toolbar kebab, and it saves the same file', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();
    await pdfReady();

    await user.click(screen.getByTestId('portal-pdf-more'));
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    await user.click(screen.getByTestId('portal-pdf-more-download'));

    expect(saveBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'FV-0001.pdf');
    expect(callsTo('/documents/invoice/inv-1/pdf')).toHaveLength(1);
  });

  for (const [label, pdfAnswer, note] of [
    ['has none the server could render (404)', jsonResponse({}, { status: 404 }), 'portalPdfUnavailableHint'],
    ['failed to arrive', jsonResponse({}, { status: 500 }), 'portalDownloadFailed'],
  ]) {
    it(`falls back to the data sheet, lines read-only, when the printable ${label}`, async () => {
      responses.pdf = pdfAnswer;
      responses.me = jsonResponse(WITH_ENTRY);
      renderPortal();
      await detailReady();

      await waitFor(() => expect(screen.getByTestId('portal-document-sheet')).toBeInTheDocument());
      expect(screen.getByTestId('portal-pdf-unavailable')).toHaveTextContent(note);
      const lines = screen.getByTestId('portal-document-lines');
      expect(within(lines).getAllByRole('row')).toHaveLength(3); // header + two lines
      expect(lines).toHaveTextContent('Tornillo');
      const detail = screen.getByTestId('portal-document-detail');
      expect(within(detail).queryAllByRole('textbox')).toHaveLength(0);
      expect(within(detail).queryAllByRole('spinbutton')).toHaveLength(0);
      expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
    });
  }

  it('says "PDF no disponible", offers no download and asks for no printable when there is none', async () => {
    renderPortal(`/portal/${TOKEN}?view=doc&kind=ORDER&id=ord-1`);
    await detailReady();

    expect(screen.getByTestId('portal-pdf-unavailable')).toHaveTextContent('portalPdfUnavailable');
    expect(screen.queryByTestId('portal-download-pdf')).not.toBeInTheDocument();
    expect(callsTo('/pdf')).toHaveLength(0);
  });

  it('marks an invoice with an owing past-due instalment as overdue in its summary', async () => {
    renderPortal(`/portal/${TOKEN}?view=doc&kind=INVOICE&id=inv-2`);
    await detailReady();

    const panel = within(screen.getByTestId('portal-document-cards-panel'));
    expect(panel.getByTestId('portal-payment-status')).toHaveAttribute('data-state', 'overdue');
  });

  it('opens a related document', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByRole('button', { name: /orderDoc/ }));

    await waitFor(() => expect(screen.getByTestId('portal-panel-title').textContent).toBe('portalKindOrder PV/0001'));
    expect(callsTo('/documents/order/ord-1')).toHaveLength(1);
    expect(urlView()).toEqual({ view: 'doc', kind: 'ORDER', id: 'ord-1' });
  });

  it('refreshes the related documents in place, without the loading screen', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();
    const reads = callsTo('/documents/invoice/inv-1').filter(([path]) => !path.endsWith('/pdf')).length;

    await user.click(screen.getByTestId('portal-related-refresh'));

    await waitFor(() => expect(callsTo('/documents/invoice/inv-1')
      .filter(([path]) => !path.endsWith('/pdf'))).toHaveLength(reads + 1));
    expect(screen.queryByTestId('portal-document-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('portal-related-panel')).toBeInTheDocument();
  });

  it('opens a document from a list tab as a drawer over that list, and Escape returns to the tab', async () => {
    const user = userEvent.setup();
    renderPortal(`/portal/${TOKEN}?view=list&kind=INVOICE&group=pending`);
    await listReady();
    const listReads = listQueries().length;

    await user.click(screen.getAllByTestId('portal-document-open')[0]);
    await detailReady();

    expect(screen.getByTestId('portal-detail-drawer')).toBeInTheDocument();
    // The list stays underneath, not re-read.
    expect(screen.getByTestId('portal-document-list')).toBeInTheDocument();
    expect(urlView()).toEqual({ view: 'doc', kind: 'INVOICE', id: 'inv-1', group: 'pending' });
    // The open document is not one of its own related documents (user decision).
    expect(screen.queryByTestId('portal-related-current')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('portal-detail-drawer')).not.toBeInTheDocument());
    expect(urlView()).toEqual({ view: 'list', kind: 'INVOICE', group: 'pending' });
    expect(listQueries()).toHaveLength(listReads);
  });

  it('says the document is not available when it is not found', async () => {
    renderPortal(`/portal/${TOKEN}?view=doc&kind=ORDER&id=ord-404`);

    await waitFor(() => expect(screen.getByTestId('portal-document-unavailable'))
      .toHaveTextContent('portalDocumentNotFoundTitle'));
    expect(screen.queryByTestId('portal-invalid-link')).not.toBeInTheDocument();
  });
});

describe('PortalPage — a read refused after a valid /me', () => {
  /**
   * The link can change state mid-session (it expires, the customer is blocked). A data read that
   * answers 401 after /me said "valid" re-runs /me once and follows what it says now; only a second
   * refusal ends on the dead-link page. The refused read here is the entry document itself.
   */
  const CASES = [
    {
      label: 'goes to the renewal when the link has expired meanwhile',
      recheck: jsonResponse({ ...WITH_ENTRY, state: 'expired' }),
      testId: 'portal-renewed',
      renewals: 1,
      documentReads: 1,
    },
    {
      label: 'goes to the unavailable screen when the customer was blocked meanwhile',
      recheck: jsonResponse({ ...WITH_ENTRY, state: 'unavailable' }),
      testId: 'portal-unavailable',
      renewals: 0,
      documentReads: 1,
    },
    {
      label: 'goes to the dead-link screen when /me refuses the token too',
      recheck: jsonResponse({}, { status: 401 }),
      testId: 'portal-invalid-link',
      renewals: 0,
      documentReads: 1,
    },
  ];

  for (const row of CASES) {
    it(row.label, async () => {
      responses.me = sequence(jsonResponse(WITH_ENTRY), row.recheck);
      responses.document = () => jsonResponse({}, { status: 401 });
      renderPortal();

      // A re-check and a second read: more than the default second under load.
      await waitFor(() => expect(screen.getByTestId(row.testId)).toBeInTheDocument(),
        { timeout: 5000 });
      // Exactly one re-check, whatever it said: the page never loops on a refusing backend.
      expect(callsTo('/me')).toHaveLength(2);
      expect(callsTo('/documents/invoice/inv-1')).toHaveLength(row.documentReads);
      expect(callsTo('/renew')).toHaveLength(row.renewals);
    });
  }
});

describe('PortalPage — link states', () => {
  /**
   * Each row: what `/me` and `/renew` answer, the screen that must end up rendered and how many
   * renewals go out. Every row also guards that `/home` is never requested: only a valid
   * link may read documents.
   */
  const CASES = [
    {
      label: 'an expired link renews itself and says a new link was sent',
      me: { ...IDENTITY, state: 'expired' },
      renew: jsonResponse({ state: 'renewed', renewal: 'sent' }),
      testId: 'portal-renewed',
      title: 'portalRenewedTitle',
      description: 'portalRenewedDescription',
      renewals: 1,
    },
    {
      label: 'an expired link whose renewal went out recently says so instead',
      me: { ...IDENTITY, state: 'expired' },
      renew: jsonResponse({ state: 'renewed', renewal: 'recentlySent' }),
      testId: 'portal-recently-sent',
      title: 'portalRecentlySentTitle',
      description: 'portalRecentlySentDescription',
      renewals: 1,
    },
    {
      label: 'an expired link that the renewal finds unavailable names the company',
      me: { ...IDENTITY, state: 'expired' },
      renew: jsonResponse({ state: 'unavailable' }),
      testId: 'portal-unavailable',
      title: 'portalUnavailableTitle',
      description: t('portalUnavailableDescription', { tenantName: 'Acme SA' }),
      renewals: 1,
    },
    {
      label: 'an unavailable link names the company and asks for no renewal',
      me: { ...IDENTITY, state: 'unavailable' },
      testId: 'portal-unavailable',
      title: 'portalUnavailableTitle',
      description: t('portalUnavailableDescription', { tenantName: 'Acme SA' }),
      renewals: 0,
    },
    {
      label: 'an unavailable link with no tenant name falls back to the generic copy',
      me: { businessPartnerName: 'Cliente Uno', state: 'unavailable' },
      testId: 'portal-unavailable',
      title: 'portalUnavailableTitle',
      description: 'portalUnavailableDescriptionGeneric',
      renewals: 0,
    },
    {
      label: 'a renewal the server could not send offers a retry',
      me: { ...IDENTITY, state: 'expired' },
      renew: jsonResponse({}, { status: 500 }),
      testId: 'portal-renew-error',
      title: 'portalRenewErrorTitle',
      description: 'portalRenewErrorDescription',
      renewals: 1,
    },
  ];

  for (const row of CASES) {
    it(row.label, async () => {
      responses.me = jsonResponse(row.me);
      if (row.renew) responses.renew = row.renew;
      renderPortal();

      await waitFor(() => expect(screen.getByTestId(row.testId)).toBeInTheDocument());
      const notice = within(screen.getByTestId(row.testId));
      expect(notice.getByRole('heading', { level: 1 }).textContent).toBe(row.title);
      // Exact, not a substring: the generic key contains the tenant-specific one.
      expect(screen.getByTestId(`${row.testId}-description`).textContent).toBe(row.description);
      expect(callsTo('/renew')).toHaveLength(row.renewals);
      expect(callsTo('/home')).toHaveLength(0);
      expect(screen.queryByTestId('portal-shell')).not.toBeInTheDocument();
    });
  }

  it('sends one renewal under StrictMode, POSTed with the token in its header', async () => {
    responses.me = jsonResponse({ ...IDENTITY, state: 'expired' });
    renderPortal(undefined, { strict: true });

    await waitFor(() => expect(screen.getByTestId('portal-renewed')).toBeInTheDocument());
    // StrictMode runs the load effect twice; a second /renew would email the customer twice.
    const renewals = callsTo('/renew');
    expect(renewals).toHaveLength(1);
    expect(renewals[0][0]).not.toContain(TOKEN);
    expect(renewals[0][1]).toStrictEqual({ ...PORTAL_GET_OPTIONS, method: 'POST' });
  });

  it('lets the retry button request a new renewal after one failed', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse({ ...IDENTITY, state: 'expired' });
    responses.renew = jsonResponse({}, { status: 500 });
    renderPortal();

    await waitFor(() => expect(screen.getByTestId('portal-renew-error')).toBeInTheDocument());
    expect(callsTo('/renew')).toHaveLength(1);

    responses.renew = jsonResponse({ state: 'renewed', renewal: 'sent' });
    await user.click(screen.getByTestId('portal-renew-retry'));

    // The once-only guard was cleared by the failure, so the retry really asks again.
    await waitFor(() => expect(screen.getByTestId('portal-renewed')).toBeInTheDocument());
    expect(callsTo('/renew')).toHaveLength(2);
    expect(screen.queryByTestId('portal-renew-error')).not.toBeInTheDocument();
  });
});

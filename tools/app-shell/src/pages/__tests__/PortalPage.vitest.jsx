// @covers tools/app-shell/src/pages/PortalPage.jsx
// @covers tools/app-shell/src/pages/portal/PortalShell.jsx
// @covers tools/app-shell/src/pages/portal/PortalHomeView.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentListView.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentDetailView.jsx
// @covers tools/app-shell/src/pages/portal/PortalBits.jsx
// Mocks BEFORE imports.
const apiFetchMock = vi.fn();

// The page's only door to the network. Mocked at the hook rather than at `fetch` so the
// request OPTIONS are observable — that is what the plan's §5.4 assertion below reads.
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));

// The download plumbing lives in its own module so a test can see what would be saved.
vi.mock('@/lib/portal/portalDownload.js', () => ({ saveBlobAsFile: vi.fn() }));

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
import PortalPage from '../PortalPage.jsx';
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

const IDENTITY = { businessPartnerName: 'Cliente Uno', tenantName: 'Acme SA' };
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
      kind: 'INVOICE', id: 'inv-1', documentNo: 'FV/0001', date: '2026-08-02', documentStatus: 'CO',
      currency: 'EUR', grandTotal: 1000, outstandingAmount: 0,
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

/** What each endpoint answers; a test reassigns a field before rendering. */
let responses;

/** Shows the router's search string, so a test can read the view the URL holds. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{location.search}</output>;
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

beforeEach(() => {
  vi.clearAllMocks();
  localeState.locale = 'es_ES';
  // jsdom has no object URLs; the logo and "Ver PDF" both need one.
  URL.createObjectURL = vi.fn(() => 'blob:portal-object');
  URL.revokeObjectURL = vi.fn();
  responses = {
    me: jsonResponse(IDENTITY),
    home: jsonResponse(HOME),
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
    if (route.endsWith('/me')) answer = responses.me;
    else if (route.endsWith('/home')) answer = responses.home;
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
});

describe('PortalPage — token handling (plan §5.4)', () => {
  it('sends the token in the X-Portal-Token header on every call, and never in a URL', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse({ ...WITH_ENTRY, hasLogo: true });
    responses.logo = blobResponse(new Blob(['png'], { type: 'image/png' }));
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-download-pdf'));
    await waitFor(() => expect(saveBlobAsFile).toHaveBeenCalled());
    await user.click(screen.getByTestId('portal-back'));
    await listReady();

    // Every GET the page can make: identity, home, logo, one document, its printable, a list.
    // `/renew` is asserted in the link-states block.
    const routes = new Set(apiFetchMock.mock.calls.map(([path]) => path.split('?')[0]));
    expect([...routes].sort()).toEqual([
      '/sws/portal/documents',
      '/sws/portal/documents/invoice/inv-1',
      '/sws/portal/documents/invoice/inv-1/pdf',
      '/sws/portal/home',
      '/sws/portal/logo',
      '/sws/portal/me',
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
    expect(screen.getByTestId('portal-view-title').textContent).toBe('portalKindInvoice FV/0001');
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

  it('lets a view in the URL win over the entry document', async () => {
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal(`/portal/${TOKEN}?view=list&kind=INVOICE`);
    await listReady();

    expect(screen.getByTestId('portal-document-list')).toHaveAttribute('data-kind', 'INVOICE');
    expect(callsTo('/documents/invoice/inv-1')).toHaveLength(0);
  });

  it('writes the view to the search string on navigation, never the token', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-back'));
    await listReady();

    const search = screen.getByTestId('location-probe').textContent;
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({ view: 'list', kind: 'INVOICE' });
    expect(search).not.toContain(TOKEN);
  });
});

describe('PortalPage — home', () => {
  it('shows the pending balance per currency, with the overdue line only where there is one', async () => {
    renderPortal();
    await shellReady();

    expect(screen.getAllByTestId('portal-balance-currency')).toHaveLength(2);
    expect(screen.getAllByTestId('portal-balance-outstanding')[0].textContent).toBe(eur('1.210,50'));
    const overdue = screen.getAllByTestId('portal-balance-overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].textContent)
      .toBe(t('portalOverdueSince', { amount: eur('210,50'), date: '15/08/2026' }));
  });

  it('says nothing is pending when there are no balances', async () => {
    responses.home = jsonResponse({ ...HOME, balances: [] });
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-balance-empty')).toHaveTextContent('portalNothingPending');
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

  it('opens a kind list from its tile', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    await user.click(screen.getByTestId('portal-tile-invoice'));

    await listReady();
    expect(screen.getByTestId('portal-document-list')).toHaveAttribute('data-kind', 'INVOICE');
    expect(listQueries().every((query) => query.get('type') === 'invoice')).toBe(true);
  });

  it('lists the recent documents and opens one', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    const recent = screen.getAllByTestId('portal-recent-document');
    expect(recent).toHaveLength(2);
    expect(recent[0]).toHaveTextContent('portalKindOrder PV/0001');
    expect(within(recent[1]).getByTestId('portal-payment-status')).toHaveAttribute('data-state', 'paid');

    await user.click(recent[0]);

    await detailReady();
    expect(callsTo('/documents/order/ord-1')).toHaveLength(1);
    expect(screen.getByTestId('portal-view-title').textContent).toBe('portalKindOrder PV/0001');
  });
});

describe('PortalPage — document list', () => {
  const listPath = (kind) => `/portal/${TOKEN}?view=list&kind=${kind}`;

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

  it('offers "all" plus only the statuses the backend lists, and requests the one picked', async () => {
    const user = userEvent.setup();
    renderPortal(listPath('INVOICE'));
    await listReady();

    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('data-testid'))).toEqual([
      'portal-status-tab-all', 'portal-status-tab-co', 'portal-status-tab-cl',
    ]);
    // "All" sends no status at all: the client never names a status — draft included — on its own.
    expect(listQueries().every((query) => !query.has('status'))).toBe(true);

    await user.click(screen.getByTestId('portal-status-tab-co'));

    await waitFor(() => expect(listQueries().some((query) => query.get('status') === 'CO')).toBe(true));
    expect(screen.getByTestId('portal-status-tab-co')).toHaveAttribute('aria-selected', 'true');
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
      ? { documents: [order(3)], totalCount: 3, statuses: ['CO'] }
      : { documents: [order(1), order(2)], totalCount: 3, statuses: ['CO'] });
    renderPortal(listPath('ORDER'));
    await listReady();
    expect(screen.getAllByTestId('portal-document-row')).toHaveLength(2);

    await user.click(screen.getByTestId('portal-load-more'));

    await waitFor(() => expect(screen.getAllByTestId('portal-document-row')).toHaveLength(3));
    expect(listQueries().some((query) => query.get('offset') === '2')).toBe(true);
    expect(screen.queryByTestId('portal-load-more')).not.toBeInTheDocument();
  });

  it('shows the payment badge and the due-date dot of each invoice, and marks credit notes', async () => {
    renderPortal(listPath('INVOICE'));
    await listReady();

    const rows = screen.getAllByTestId('portal-document-row');
    const states = rows.map((row) => [
      within(row).getByTestId('portal-document-open').textContent,
      within(row).getByTestId('portal-payment-status').getAttribute('data-state'),
      within(row).queryByTestId('portal-due-date')?.getAttribute('data-state') ?? null,
    ]);
    expect(states).toEqual([
      ['FV/0001', 'paid', 'paid'],
      // The list badge never says overdue (as in the invoice list grid); the due-date dot does.
      ['FV/0002', 'pending', 'overdue'],
      ['AB/0001', 'credit-available', null],
    ]);
    // A credit note lives among the invoices, marked as such.
    expect(rows[2]).toHaveTextContent('portalKindCreditNote');
    expect(rows[0]).not.toHaveTextContent('portalKindCreditNote');
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

  it('opens a document from its row', async () => {
    const user = userEvent.setup();
    renderPortal(listPath('INVOICE'));
    await listReady();

    await user.click(within(screen.getAllByTestId('portal-document-row')[0]).getByTestId('portal-document-open'));

    await detailReady();
    expect(callsTo('/documents/invoice/inv-1')).toHaveLength(1);
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

  it('shows the bottom navigation below the breakpoint and the sidebar above it', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    expect(screen.getByTestId('portal-sidebar')).toHaveClass('hidden', 'md:flex');
    const bottomNav = screen.getByTestId('portal-bottom-nav');
    expect(bottomNav).toHaveClass('md:hidden');
    expect(within(bottomNav).getByTestId('portal-bottom-nav-home')).toHaveAttribute('aria-current', 'page');

    await user.click(within(bottomNav).getByTestId('portal-bottom-nav-order'));

    await waitFor(() => expect(screen.getByTestId('portal-document-list')).toHaveAttribute('data-kind', 'ORDER'));
    expect(within(bottomNav).getByTestId('portal-bottom-nav-order')).toHaveAttribute('aria-current', 'page');
  });
});

describe('PortalPage — language', () => {
  for (const [label, locale, pressed] of [
    ['Spanish', 'es_ES', 'es'],
    ['Spanish when no locale is set', undefined, 'es'],
    ['English', 'en_US', 'en'],
  ]) {
    it(`marks ${label} as the active language`, async () => {
      localeState.locale = locale;
      renderPortal();
      await shellReady();

      // One switch in the sidebar, one in the mobile top bar.
      for (const short of ['es', 'en']) {
        for (const button of screen.getAllByTestId(`portal-language-${short}`)) {
          expect(button).toHaveAttribute('aria-pressed', String(short === pressed));
        }
      }
    });
  }

  it('switches to English on EN', async () => {
    const user = userEvent.setup();
    renderPortal();
    await shellReady();

    await user.click(screen.getAllByTestId('portal-language-en')[0]);

    expect(localeState.setLocale).toHaveBeenCalledWith('en_US');
  });
});

describe('PortalPage — document detail', () => {
  it('renders the lines read-only', async () => {
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    const lines = screen.getByTestId('portal-document-lines');
    expect(within(lines).getAllByRole('row')).toHaveLength(3); // header + two lines
    expect(lines).toHaveTextContent('Tornillo');
    expect(lines).toHaveTextContent('Arandela');
    const detail = screen.getByTestId('portal-document-detail');
    expect(within(detail).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(detail).queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('marks an invoice with an owing past-due instalment as overdue in its payment block', async () => {
    renderPortal(`/portal/${TOKEN}?view=doc&kind=INVOICE&id=inv-2`);
    await detailReady();

    const payment = within(screen.getByTestId('portal-payment'));
    expect(payment.getByTestId('portal-payment-status')).toHaveAttribute('data-state', 'overdue');
    expect(payment.getByTestId('portal-due-date')).toHaveAttribute('data-state', 'overdue');
    expect(payment.getByTestId('portal-payment-outstanding').textContent).toBe(eur('500,00'));
  });

  it('opens a related document', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-related-document'));

    await waitFor(() => expect(screen.getByTestId('portal-view-title').textContent).toBe('portalKindOrder PV/0001'));
    expect(callsTo('/documents/order/ord-1')).toHaveLength(1);
    expect(Object.fromEntries(new URLSearchParams(screen.getByTestId('location-probe').textContent)))
      .toEqual({ view: 'doc', kind: 'ORDER', id: 'ord-1' });
  });

  it('opens the printable in a dialog on "Ver PDF"', async () => {
    const user = userEvent.setup();
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-view-pdf'));

    await waitFor(() => expect(screen.getByTestId('portal-pdf-dialog')).toBeInTheDocument());
    const pdfCalls = callsTo('/documents/invoice/inv-1/pdf');
    expect(pdfCalls).toHaveLength(1);
    expect(pdfCalls[0][1]).toStrictEqual(PORTAL_GET_OPTIONS);
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });

  it('saves the printable under a path-safe name on "Descargar PDF"', async () => {
    const user = userEvent.setup();
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    responses.pdf = blobResponse(pdf);
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-download-pdf'));

    // `FV/0001` would be saved as `0001.pdf` if the slash reached the download attribute.
    await waitFor(() => expect(saveBlobAsFile).toHaveBeenCalledWith(pdf, 'FV-0001.pdf'));
    expect(callsTo('/documents/invoice/inv-1/pdf')[0][1]).toStrictEqual(PORTAL_GET_OPTIONS);
  });

  it('says "PDF no disponible" and offers no buttons when the document has no printable', async () => {
    renderPortal(`/portal/${TOKEN}?view=doc&kind=ORDER&id=ord-1`);
    await detailReady();

    expect(screen.getByTestId('portal-pdf-unavailable')).toHaveTextContent('portalPdfUnavailable');
    expect(screen.queryByTestId('portal-view-pdf')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-download-pdf')).not.toBeInTheDocument();
  });

  it('reports one failed printable without leaving the document', async () => {
    const user = userEvent.setup();
    responses.pdf = jsonResponse({}, { status: 404 });
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-download-pdf'));

    await waitFor(() => expect(within(screen.getByTestId('portal-document-detail')).getByRole('alert'))
      .toHaveTextContent('portalDownloadFailed'));
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });

  it('takes the whole page to the dead-link screen when the printable rejects the token', async () => {
    const user = userEvent.setup();
    responses.pdf = jsonResponse({}, { status: 401 });
    responses.me = jsonResponse(WITH_ENTRY);
    renderPortal();
    await detailReady();

    await user.click(screen.getByTestId('portal-download-pdf'));

    await waitFor(() => expect(screen.getByTestId('portal-invalid-link')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-document-detail')).not.toBeInTheDocument();
  });

  it('says the document is not available when it is not found', async () => {
    renderPortal(`/portal/${TOKEN}?view=doc&kind=ORDER&id=ord-404`);

    await waitFor(() => expect(screen.getByTestId('portal-document-unavailable'))
      .toHaveTextContent('portalDocumentNotFoundTitle'));
    expect(screen.queryByTestId('portal-invalid-link')).not.toBeInTheDocument();
  });
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

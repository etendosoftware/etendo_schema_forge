// @covers tools/app-shell/src/pages/PortalPage.jsx
// Mocks BEFORE imports.
const apiFetchMock = vi.fn();

// The page's only door to the network. Mocked at the hook rather than at `fetch` so the
// request OPTIONS are observable — that is what the plan's §5.4 assertion below reads.
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));

// `URL.createObjectURL` does not exist in jsdom, which is exactly why the download plumbing
// lives in its own module (see `portalDownload.js`'s doc comment).
vi.mock('@/lib/portal/portalDownload.js', () => ({ saveBlobAsFile: vi.fn() }));

vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (
    vars ? key.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`) : key
  ),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PortalPage from '../PortalPage.jsx';
import { saveBlobAsFile } from '@/lib/portal/portalDownload.js';

/**
 * Business Partner self-service portal page (ETP-5267).
 *
 * The load-bearing test in this file is `sends the token in the X-Portal-Token header on every
 * call` — plan §5.4. The rest of the file guards the three screens the plan deliberately keeps apart:
 * a dead link (generic, no retry, indistinguishable across 401/403/404), a transient failure
 * (says so, offers a retry) and an empty invoice list (a normal state, not an error).
 */

const TOKEN = 'tok-abcdef0123456789';

/**
 * A euro amount exactly as the canonical formatter produces it, with the separator ESCAPED
 * rather than pasted: `formatCurrency` joins amount and symbol with a non-breaking space.
 *
 * Every currency assertion below reads `textContent` directly instead of going through
 * `toHaveTextContent`, because that matcher normalizes whitespace — it accepts a plain space
 * where the formatter emits a non-breaking one, so it would quietly stop distinguishing the
 * canonical output from a hand-rolled one (CLAUDE.md § Currency & Amount Formatting).
 */
const eur = (digits) => `${digits} €`;

const IDENTITY = { businessPartnerName: 'Cliente Uno', tenantName: 'Acme SA' };

/**
 * Two rows whose statuses do not depend on the day the suite runs: the first is settled (paid
 * is decided before the due date is consulted at all) and the second has no due date. A
 * fixture with a hardcoded future due date would silently start reading "overdue" once that
 * date passed.
 */
const INVOICES = {
  currency: 'EUR',
  outstandingAmount: 1210.5,
  invoices: [
    {
      id: 'inv-1',
      documentNo: 'FV/0001',
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-31',
      grandTotalAmount: 1000,
      outstandingAmount: 0,
    },
    {
      id: 'inv-2',
      documentNo: 'FV/0002',
      invoiceDate: '2026-08-15',
      dueDate: null,
      grandTotalAmount: 500,
      outstandingAmount: 210.5,
    },
  ],
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

/** What each endpoint answers on the NEXT call; a test reassigns a field before rendering. */
let responses;

function renderPortal(path = `/portal/${TOKEN}`, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="portal/:token" element={<PortalPage />} />
        <Route path="portal" element={<PortalPage />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** The recorded `apiFetch` calls to one portal route, query string ignored. */
const callsTo = (route) => apiFetchMock.mock.calls
  .filter(([path]) => path.split('?')[0].endsWith(route));

/** Exact options of every GET the page makes; `/renew` adds `method: 'POST'`. */
const PORTAL_GET_OPTIONS = { token: TOKEN, headers: { 'X-Portal-Token': TOKEN }, on401: 'ignore' };

const readyState = () => waitFor(
  () => expect(screen.getByTestId('portal-header')).toBeInTheDocument(),
);

beforeEach(() => {
  vi.clearAllMocks();
  responses = {
    me: jsonResponse(IDENTITY),
    invoices: jsonResponse(INVOICES),
    pdf: blobResponse(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    // 404 by default: the fixture identity carries no `hasLogo`, so the page never asks for this
    // unless a test opts in. A default 200 would make the logo appear in every assertion.
    logo: jsonResponse({}, { status: 404 }),
    renew: jsonResponse({ state: 'renewed', renewal: 'sent' }),
  };
  apiFetchMock.mockImplementation(async (path) => {
    // Routed on the path with any query string stripped: `/invoices` carries `?limit&offset`
    // since paging landed, and `/logo` is requested only when `/me` reports `hasLogo`. Matching
    // the raw string would silently fall through to the throw below on any new parameter — which
    // reaches the page as a load failure, i.e. a fixture gap wearing a source bug's clothes.
    const route = path.split('?')[0];
    let answer;
    if (route.endsWith('/me')) answer = responses.me;
    else if (route.endsWith('/invoices')) answer = responses.invoices;
    else if (route.endsWith('/pdf')) answer = responses.pdf;
    else if (route.endsWith('/logo')) answer = responses.logo;
    else if (route.endsWith('/renew')) answer = responses.renew;
    else throw new Error(`unexpected portal path: ${path}`);

    if (answer === NETWORK_FAILURE) throw new TypeError('Failed to fetch');
    return answer;
  });
});

describe('PortalPage — ready state', () => {
  it('shows the loading notice before either call resolves', () => {
    renderPortal();

    expect(screen.getByTestId('portal-loading')).toBeInTheDocument();
  });

  it('greets the reader and summarizes the balance and the invoice count', async () => {
    renderPortal();
    await readyState();

    expect(screen.getByTestId('portal-tenant-name')).toHaveTextContent('Acme SA');
    expect(screen.getByTestId('portal-greeting')).toHaveTextContent('portalGreeting');
    expect(screen.getByTestId('portal-intro')).toHaveTextContent('portalIntro');
    expect(screen.getByTestId('portal-outstanding-value').textContent).toBe(eur('1.210,50'));
    expect(screen.getByTestId('portal-invoice-count-value')).toHaveTextContent('2');
  });

  it('renders one row per invoice, in the order the backend sent them', async () => {
    renderPortal();
    await readyState();

    expect(screen.getByTestId('portal-invoices-section')).toBeInTheDocument();
    expect(screen.getByTestId('portal-invoice-table')).toBeInTheDocument();
    expect(screen.getByTestId('portal-invoice-row-inv-1')).toBeInTheDocument();
    expect(screen.getByTestId('portal-invoice-row-inv-2')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-empty-state')).not.toBeInTheDocument();
  });

  it('formats each cell through the canonical currency and calendar-date helpers', async () => {
    renderPortal();
    await readyState();

    const first = within(screen.getByTestId('portal-invoice-row-inv-1'));
    expect(first.getByTestId('portal-invoice-document-no')).toHaveTextContent('FV/0001');
    expect(first.getByTestId('portal-invoice-date')).toHaveTextContent('01/08/2026');
    expect(first.getByTestId('portal-invoice-due-date')).toHaveTextContent('31/08/2026');
    expect(first.getByTestId('portal-invoice-total').textContent).toBe(eur('1.000,00'));
    expect(first.getByTestId('portal-invoice-outstanding').textContent).toBe(eur('0,00'));
    // Settled, so `paid` is decided before the due date is ever consulted.
    expect(first.getByTestId('portal-invoice-status')).toHaveTextContent('statusPaid');

    const second = within(screen.getByTestId('portal-invoice-row-inv-2'));
    expect(second.getByTestId('portal-invoice-due-date')).toHaveTextContent('—');
    expect(second.getByTestId('portal-invoice-outstanding').textContent).toBe(eur('210,50'));
    expect(second.getByTestId('portal-invoice-status'))
      .toHaveTextContent('portalInvoicePartiallyPaid');
  });
});

describe('PortalPage — token handling (plan §5.4)', () => {
  it('sends the token in the X-Portal-Token header on every call, and never in a URL', async () => {
    const user = userEvent.setup();
    renderPortal();
    await readyState();

    await user.click(screen.getByTestId('portal-download-inv-1'));
    await waitFor(() => expect(saveBlobAsFile).toHaveBeenCalled());

    // Identity, invoices and the PDF on a valid link; `/renew` is asserted in the link-states
    // block and `/logo` in portalApi.test.js, which pins all five calls together.
    expect(callsTo('/me')).toHaveLength(1);
    expect(callsTo('/invoices')).toHaveLength(1);
    expect(callsTo('/pdf')).toHaveLength(1);
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
    // to tell an unknown token from a revoked one or from another BP's invoice.
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
    responses.invoices = NETWORK_FAILURE;
    renderPortal();

    await waitFor(() => expect(screen.getByTestId('portal-load-error')).toBeInTheDocument());
    expect(screen.getByTestId('portal-load-error')).toHaveTextContent('portalLoadErrorTitle');
    expect(screen.queryByTestId('portal-invalid-link')).not.toBeInTheDocument();

    responses.invoices = jsonResponse(INVOICES);
    await user.click(screen.getByTestId('portal-retry'));

    await readyState();
    expect(screen.getByTestId('portal-invoice-row-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-load-error')).not.toBeInTheDocument();
  });
});

describe('PortalPage — empty list (plan §6)', () => {
  it('treats a customer with nothing billed yet as a normal state', async () => {
    responses.invoices = jsonResponse({ currency: 'EUR', outstandingAmount: 0, invoices: [] });
    renderPortal();
    await readyState();

    expect(screen.getByTestId('portal-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('portal-invoice-count-value')).toHaveTextContent('0');
    expect(screen.queryByTestId('portal-invoice-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-load-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-invalid-link')).not.toBeInTheDocument();
  });
});

describe('PortalPage — PDF download', () => {
  it('hands the fetched blob to the saver under a path-safe file name', async () => {
    const user = userEvent.setup();
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    responses.pdf = blobResponse(pdf);
    renderPortal();
    await readyState();

    await user.click(screen.getByTestId('portal-download-inv-1'));

    // `FV/0001` would be saved as `0001.pdf` if the slash reached the download attribute.
    await waitFor(() => expect(saveBlobAsFile).toHaveBeenCalledWith(pdf, 'FV-0001.pdf'));
    expect(screen.queryByTestId('portal-download-error')).not.toBeInTheDocument();
  });

  it('reports one failed document without losing the rest of the list', async () => {
    const user = userEvent.setup();
    responses.pdf = jsonResponse({}, { status: 404 });
    renderPortal();
    await readyState();

    await user.click(screen.getByTestId('portal-download-inv-1'));

    await waitFor(() => expect(screen.getByTestId('portal-download-error')).toBeInTheDocument());
    expect(screen.getByTestId('portal-download-error')).toHaveTextContent('portalDownloadFailed');
    expect(screen.getByTestId('portal-invoice-table')).toBeInTheDocument();
    expect(screen.getByTestId('portal-invoice-row-inv-2')).toBeInTheDocument();
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });

  it('takes the whole page to the dead-link screen when the token itself is rejected', async () => {
    const user = userEvent.setup();
    responses.pdf = jsonResponse({}, { status: 401 });
    renderPortal();
    await readyState();

    await user.click(screen.getByTestId('portal-download-inv-1'));

    await waitFor(() => expect(screen.getByTestId('portal-invalid-link')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-invoice-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-download-error')).not.toBeInTheDocument();
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });
});

describe('PortalPage — link states', () => {
  /**
   * Each row: what `/me` and `/renew` answer, the screen that must end up rendered and how many
   * renewals go out. Every row also guards that `/invoices` is never requested: only a valid
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
      description: 'portalUnavailableDescription',
      renewals: 1,
    },
    {
      label: 'an unavailable link names the company and asks for no renewal',
      me: { ...IDENTITY, state: 'unavailable' },
      testId: 'portal-unavailable',
      title: 'portalUnavailableTitle',
      description: 'portalUnavailableDescription',
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
      expect(callsTo('/invoices')).toHaveLength(0);
      expect(screen.queryByTestId('portal-invoices-section')).not.toBeInTheDocument();
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

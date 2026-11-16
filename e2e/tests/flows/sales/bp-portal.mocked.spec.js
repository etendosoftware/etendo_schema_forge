// @covers tools/app-shell/src/pages/PortalPage.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentListView.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentDetailView.jsx
// @covers tools/app-shell/src/lib/portal/portalApi.js
// @covers tools/app-shell/src/pages/portal/PortalHomeView.jsx
import { test, expect } from '../../helpers/test.js';

/**
 * Customer portal (mocked) — the two journeys a Business Partner takes from a sales document email.
 *
 * A. A valid link opens the document it was sent with; from there the customer goes to the list,
 *    filters it by status group (a tab) and date, opens another document and downloads its PDF.
 * B. An expired link renews itself: exactly one POST /renew, then the "new link sent" message.
 *
 * The portal is a public page: no `login()`, no session. Every `/sws/portal/*` route is mocked here
 * and answers 401 unless the request carries the token in the `X-Portal-Token` header, so a request
 * that lost the header shows up as the dead-link page instead of passing silently. Any other
 * `/sws/**` call (shared configuration the shell may read) gets an empty 200.
 *
 * It lives under `flows/sales/` because every spec belongs to a cell (`e2e/support/test-cell.mjs`)
 * and the portal shows sales documents.
 */

const TOKEN = 'tok-e2e-portal-0123456789abcdef';

const INVOICES = [
  {
    kind: 'INVOICE', id: 'inv-1', documentNo: 'FV/0001', date: '2026-08-01', dueDate: '2026-08-31',
    documentStatus: 'CO', currency: 'EUR', taxBase: 826.45, grandTotal: 1000, outstandingAmount: 0,
  },
  {
    kind: 'INVOICE', id: 'inv-2', documentNo: 'FV/0002', date: '2026-08-02', dueDate: '2026-09-30',
    documentStatus: 'CO', currency: 'EUR', taxBase: 413.22, grandTotal: 500, outstandingAmount: 500,
  },
];

function detail(invoice) {
  return {
    ...invoice,
    customer: { name: 'Cliente Uno' },
    lines: [{ product: 'Tornillo', productCode: 'TOR-1', quantity: 2, unitPrice: 50, tax: 'IVA 21%', amount: 100 }],
    taxes: [{ tax: 'IVA 21%', taxableAmount: invoice.taxBase, taxAmount: invoice.grandTotal - invoice.taxBase }],
    installments: [],
    related: [],
    hasPdf: true,
  };
}

const json = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body),
});

/**
 * Mocks the whole portal API. `me` is what `/me` answers. Returns the recorded portal requests.
 *
 * Two routes, not one brace pattern (see the e2e guide's glob gotcha): `/sws/portal/**` covers every
 * sub-path, and the catch-all `/sws/**` is registered first so the portal route wins (LIFO).
 */
async function installPortalMock(page, { me }) {
  const requests = [];
  await page.route('**/sws/**', (route) => json(route, {}));
  await page.route('**/sws/portal/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/sws\/portal/, '');
    requests.push({ method: request.method(), path, url: request.url(), token: request.headers()['x-portal-token'] });

    if (request.headers()['x-portal-token'] !== TOKEN) return json(route, {}, 401);

    if (path === '/me') return json(route, me);
    if (path === '/renew' && request.method() === 'POST') return json(route, { state: 'renewed', renewal: 'sent' });
    if (path === '/home') {
      return json(route, {
        balances: [{ currency: 'EUR', outstanding: 500, pendingCount: 1, overdue: 0, overdueCount: 0 }],
        tiles: { INVOICE: { count: INVOICES.length } },
        recent: INVOICES,
      });
    }
    if (path === '/documents') {
      return json(route, { documents: INVOICES, totalCount: INVOICES.length, statuses: ['CO', 'CL'], totals: [] });
    }
    const pdf = path.match(/^\/documents\/invoice\/([^/]+)\/pdf$/);
    if (pdf) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n%%EOF\n') });
    }
    const document = path.match(/^\/documents\/invoice\/([^/]+)$/);
    const found = document && INVOICES.find((invoice) => invoice.id === decodeURIComponent(document[1]));
    if (found) return json(route, detail(found));
    // Anything else, the logo included (`hasLogo: false`), is not there.
    return json(route, {}, 404);
  });
  return requests;
}

/** Every portal request carried the header, and none put the token in its URL (plan §5.4). */
function expectTokenOnlyInHeader(requests) {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.token, `${request.method} ${request.path} without X-Portal-Token`).toBe(TOKEN);
    expect(request.url).not.toContain(TOKEN);
  }
}

test.describe('Customer portal — mocked', () => {
  test('A: entry document, list, status and date filter, another document, PDF', async ({ page }) => {
    const requests = await installPortalMock(page, {
      me: {
        state: 'valid', businessPartnerName: 'Cliente Uno', tenantName: 'Acme SA', hasLogo: false,
        entryDocument: { kind: 'INVOICE', id: 'inv-1' },
      },
    });

    await page.goto(`/portal/${TOKEN}`);

    // The link opens the document it was sent with.
    await expect(page.getByTestId('portal-document-detail')).toBeVisible();
    await expect(page.getByTestId('portal-view-title')).toContainText('FV/0001');

    // Back to that kind's list.
    await page.getByTestId('portal-back').click();
    const list = page.getByTestId('portal-document-list');
    await expect(list.locator('[data-kind="INVOICE"]')).toBeVisible();
    await expect(page.getByTestId('portal-document-row')).toHaveCount(INVOICES.length);
    const initial = requests.filter((request) => request.path === '/documents').at(-1);
    const initialFrom = new URL(initial.url).searchParams.get('dateFrom');
    // A plain list opens on the rolling last month (D-2).
    expect(initialFrom).toBeTruthy();

    // Status filter: the tab's customer-facing group goes to the backend, and to the URL.
    const byGroup = page.waitForRequest((request) => request.url().includes('/sws/portal/documents?')
      && new URL(request.url()).searchParams.get('group') === 'pending');
    await page.getByTestId('portal-status-tab-pending').click();
    await byGroup;
    await expect(page.getByTestId('portal-status-tab-pending')).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).searchParams.get('group')).toBe('pending');

    // Date filter: a preset replaces the default range, and the group stays applied.
    const byDate = page.waitForRequest((request) => {
      if (!request.url().includes('/sws/portal/documents?')) return false;
      const params = new URL(request.url()).searchParams;
      return params.get('group') === 'pending' && params.get('dateFrom') !== initialFrom;
    });
    await list.getByTestId('portal-date-range').click();
    await page.getByRole('button', { name: /últimos 12 meses|last 12 months/i }).click();
    await byDate;

    // Another document.
    await page.getByTestId('portal-document-row').filter({ hasText: 'FV/0002' })
      .getByTestId('portal-document-open').click();
    await expect(page.getByTestId('portal-view-title')).toContainText('FV/0002');

    // Its PDF, fetched with the document, saved under a path-safe name.
    await expect(page.getByTestId('portal-download-pdf')).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('portal-download-pdf').click(),
    ]);
    expect(download.suggestedFilename()).toBe('FV-0002.pdf');
    expect(requests.some((request) => request.path === '/documents/invoice/inv-2/pdf')).toBe(true);

    await expect(page.getByTestId('portal-invalid-link')).toHaveCount(0);
    expect(new URL(page.url()).search).not.toContain(TOKEN);
    expectTokenOnlyInHeader(requests);
  });

  test('B: an expired link sends exactly one renewal and says a new link was sent', async ({ page }) => {
    const requests = await installPortalMock(page, {
      me: { state: 'expired', businessPartnerName: 'Cliente Uno', tenantName: 'Acme SA', hasLogo: false },
    });

    await page.goto(`/portal/${TOKEN}`);

    await expect(page.getByTestId('portal-renewed')).toBeVisible();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const renewals = requests.filter((request) => request.path === '/renew');
    expect(renewals).toHaveLength(1);
    expect(renewals[0].method).toBe('POST');
    // An expired link reads no documents.
    expect(requests.some((request) => request.path === '/home' || request.path.startsWith('/documents'))).toBe(false);
    expectTokenOnlyInHeader(requests);
  });
});

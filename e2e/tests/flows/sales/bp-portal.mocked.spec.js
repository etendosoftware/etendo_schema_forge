// @covers tools/app-shell/src/pages/PortalPage.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentListView.jsx
// @covers tools/app-shell/src/pages/portal/PortalDocumentDetailView.jsx
// @covers tools/app-shell/src/lib/portal/portalApi.js
// @covers tools/app-shell/src/pages/portal/PortalHomeView.jsx
// @covers tools/app-shell/src/pages/portal/PortalDecisionActions.jsx
// @covers tools/app-shell/src/pages/PortalDecisionPage.jsx
import { test, expect } from '../../helpers/test.js';

/**
 * Customer portal (mocked) — the two journeys a Business Partner takes from a sales document email.
 *
 * A. A valid link opens the document it was sent with; from there the customer goes to the list,
 *    filters it by status group (a tab) and date, opens another document and downloads its PDF.
 * B. An expired link renews itself: exactly one POST /renew, then the "new link sent" message.
 * C. A pending quotation is rejected (with a reason) or accepted: the request only emails a
 *    confirmation; the email's landing (`/portal/decision/:token`) confirms it and opens the portal
 *    on the quotation, with no notice.
 * D. The landing's confirmation is lost on the way back: its one automatic resend answers "already
 *    applied", and the customer reads that instead of the failure card.
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

/** A quotation the customer can still answer, Aceptar included (PORTAL_ACCEPT_ENABLED is on). */
const QUOTATION = {
  ...detail({
    kind: 'QUOTATION', id: 'q-1', documentNo: 'PR/0001', date: '2026-08-01', documentStatus: 'UE',
    currency: 'EUR', taxBase: 100, grandTotal: 121,
  }),
  hasPdf: false,
  decision: { canDecide: true, acceptAvailable: true },
};

const DECISION_TOKEN = 'dec-e2e-0123456789abcdef';

const json = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body),
});

/**
 * Mocks the whole portal API. `me` is what `/me` answers. Returns the recorded portal requests.
 *
 * Two routes, not one brace pattern (see the e2e guide's glob gotcha): `/sws/portal/**` covers every
 * sub-path, and the catch-all `/sws/**` is registered first so the portal route wins (LIFO).
 */
async function installPortalMock(page, { me, confirmAnswer = null, loseFirstConfirm = false }) {
  const requests = [];
  await page.route('**/sws/**', (route) => json(route, {}));
  await page.route('**/sws/portal/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/sws\/portal/, '');
    // The confirmation landing carries the decision token in its own header, never the portal one.
    if (path === '/decisions/confirm' && request.method() === 'POST') {
      requests.decisionConfirms = (requests.decisionConfirms ?? 0) + 1;
      if (loseFirstConfirm && requests.decisionConfirms === 1) return route.abort('connectionreset');
      return request.headers()['x-portal-decision-token'] === DECISION_TOKEN
        ? json(route, confirmAnswer) : json(route, {}, 401);
    }
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
    if (path === '/quotations/q-1/decision' && request.method() === 'POST') {
      requests.decisionBodies = [...(requests.decisionBodies ?? []), request.postDataJSON()];
      return json(route, { state: 'sent', email: 'compras@cliente.es' });
    }
    if (path === '/documents/quotation/q-1') return json(route, QUOTATION);
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
    await expect(page.getByTestId('portal-panel-title')).toContainText('FV/0001');

    // Back to that kind's list.
    await page.getByTestId('portal-panel-close').click();
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
    await expect(page.getByTestId('portal-panel-title')).toContainText('FV/0002');

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

  for (const { decision, answer, expectedBody } of [
    {
      decision: 'Rechazar, with a reason',
      answer: async (page) => {
        await page.getByTestId('portal-decision-panel').getByTestId('portal-decision-reject').click();
        const modal = page.getByTestId('portal-reject-modal');
        await modal.getByTestId('portal-reject-reason-other').check();
        await modal.getByTestId('portal-reject-other-text').fill('Ya no lo necesitamos');
        // Reasons → "Confirma tu decisión por correo" → Enviar solicitud sends.
        await modal.getByTestId('portal-reject-continue').click();
        await page.getByTestId('portal-reject-confirm-modal').getByTestId('portal-reject-submit').click();
        await page.getByTestId('portal-check-email-ok').click();
      },
      expectedBody: { decision: 'REJECT', reasonCode: 'OTHER', reasonText: 'Ya no lo necesitamos' },
    },
    {
      decision: 'Aceptar',
      answer: async (page) => {
        await page.getByTestId('portal-decision-panel').getByTestId('portal-decision-accept').click();
        // "¿Deseas aceptar este presupuesto?" → Continuar sends.
        await page.getByTestId('portal-accept-continue').click();
        await page.getByTestId('portal-check-email-ok').click();
      },
      expectedBody: { decision: 'ACCEPT' },
    },
  ]) {
    test(`C: ${decision} emails a confirmation, whose landing confirms and leads to the quotation`, async ({ page }) => {
      const requests = await installPortalMock(page, {
        me: {
          state: 'valid', businessPartnerName: 'Cliente Uno', tenantName: 'Acme SA', hasLogo: false,
          entryDocument: { kind: 'QUOTATION', id: 'q-1' },
        },
        confirmAnswer: {
          state: 'confirmed', appliedNow: true, documentNo: 'PR/0001', tenantName: 'Acme SA',
          ...expectedBody, portalToken: TOKEN, quotationId: 'q-1',
        },
      });

      // In the portal: the request applies nothing, it says where the confirmation email went.
      await page.goto(`/portal/${TOKEN}`);
      await expect(page.getByTestId('portal-panel-title')).toContainText('PR/0001');
      await answer(page);
      await expect(page.getByTestId('portal-decision-sent')).toContainText('compras@cliente.es');
      expect(requests.decisionBodies).toEqual([expectedBody]);

      // The email's button: the landing confirms once and shows the result; "Portal de clientes"
      // opens the quotation, with no notice (the Figma has none).
      await page.goto(`/portal/decision/${DECISION_TOKEN}`);
      await expect(page.getByTestId('portal-decision-applied')).toBeVisible();
      await page.getByTestId('portal-decision-enter').click();
      expect(requests.decisionConfirms).toBe(1);
      const landed = new URL(page.url());
      expect(landed.pathname).toBe(`/portal/${TOKEN}`);
      expect(Object.fromEntries(landed.searchParams)).toEqual({ view: 'doc', kind: 'QUOTATION', id: 'q-1' });
      await expect(page.getByTestId('portal-panel-title')).toContainText('PR/0001');
      await expect(page.getByTestId('portal-arrival-notice')).toHaveCount(0);
      expect(requests.decisionConfirms).toBe(1);
      expectTokenOnlyInHeader(requests);
    });
  }

  test('D: a confirmation lost on the way back is resent once and reads as already applied', async ({ page }) => {
    const requests = await installPortalMock(page, {
      me: { state: 'valid', businessPartnerName: 'Cliente Uno', tenantName: 'Acme SA', hasLogo: false },
      loseFirstConfirm: true,
      confirmAnswer: {
        state: 'confirmed', appliedNow: false, decision: 'REJECT', documentNo: 'PR/0001', tenantName: 'Acme SA',
      },
    });

    await page.goto(`/portal/decision/${DECISION_TOKEN}`);

    await expect(page.getByTestId('portal-decision-confirmed')).toBeVisible();
    await expect(page.getByTestId('portal-decision-summary-number')).toContainText('PR/0001');
    await expect(page.getByTestId('portal-decision-failed')).toHaveCount(0);
    await expect(page.getByTestId('portal-decision-applied')).toHaveCount(0);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    expect(requests.decisionConfirms).toBe(2);
    // The resend answered: the read-only view, the last resort, was never needed.
    expect(requests.some((request) => request.path === '/decisions/view')).toBe(false);
  });
});

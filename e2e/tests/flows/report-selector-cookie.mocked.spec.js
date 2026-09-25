import { test, expect } from '@playwright/test';
import { login, declareCookieSession } from '../helpers/auth.js';

/**
 * Report selectors under the COOKIE session scheme (ETP-5455, test plan M-06).
 *
 * `/sws/report-selectors/*` was authenticated bearer-only on the backend, so under the cookie
 * session every selector answered 401 and `apiFetch` routed that 401 to the logout choke point:
 * opening a report with a selector parameter signed the user out. The backend half is fixed and
 * covered by the backend suite and the smoke script; this spec pins the client half of the
 * contract — the selector request carries no bearer (the `__Host-` cookie travels on its own) and a
 * report with an auto-defaulted selector opens without leaving the page.
 *
 * The report is a synthetic, non-catalog one, so the per-report access filter lets it through
 * without mocking a grant, and its only parameter is an `autoDefault` selector: opening it fires
 * the selector request with no click.
 */

const REPORT_ID = 'e2e-cookie-selector-report';

const REPORT_MANIFEST = [
  {
    id: REPORT_ID,
    category: 'finance',
    type: 'listing',
    orientation: 'portrait',
    outputs: ['pdf'],
    title: { en_US: 'Cookie selector report', es_ES: 'Informe con selector en cookie' },
    parameters: [
      {
        name: 'currencyId',
        label: { en_US: 'Currency', es_ES: 'Moneda' },
        type: 'search',
        selector: 'currency',
        inputStyle: 'popup-single',
        required: true,
        autoDefault: true,
      },
    ],
  },
];

async function installReportMocks(page) {
  await page.route('**/api/reports', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(REPORT_MANIFEST),
    });
  });
  await page.route('**/api/reports/*/render', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<html><body><!-- 0 records --></body></html>',
  }));

  const selectorRequests = [];
  await page.route('**/sws/report-selectors/**', (route) => {
    selectorRequests.push({ url: route.request().url(), headers: route.request().headers() });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'EUR-ID', name: 'EUR' }]),
    });
  });
  return selectorRequests;
}

test.describe('Report selectors — cookie session scheme (ETP-5455)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await declareCookieSession(page);
  });

  test('an auto-defaulted selector is requested with no bearer and the user stays signed in',
    async ({ page }) => {
      const selectorRequests = await installReportMocks(page);

      await page.goto(`/report-viewer?report=${REPORT_ID}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

      await expect.poll(() => selectorRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);
      const currency = selectorRequests.find((r) => r.url.includes('/sws/report-selectors/currency'));
      expect(currency, 'the currency selector was requested').toBeTruthy();
      expect(currency.headers.authorization).toBeUndefined();

      await expect(page).toHaveURL(/report-viewer/);
      await expect(page.locator('#login-email')).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('sf_auth_token'))).toBeNull();
    });
});

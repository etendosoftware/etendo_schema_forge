// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
// @covers tools/app-shell/src/components/contract-ui/LinesEmptyState.jsx
// @covers artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx
// @covers artifacts/sales-order/generated/web/sales-order/HeaderPage.jsx
// @covers artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx
// @covers artifacts/purchase-order/generated/web/purchase-order/HeaderPage.jsx
// @covers artifacts/sales-quotation/generated/web/sales-quotation/QuotationPage.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';
import { t } from '../../helpers/i18n.js';
import { addLinesEmptyStateButton, expandHeaderFields } from '../../helpers/purchase-helpers.js';

/**
 * New document — the "+ Añadir líneas" gate ignores the header totals (mocked).
 *
 * DetailView offers "+ Añadir líneas" in the empty lines state of a NEW document only
 * once every key of the page's generated `requiredHeaderFields` has a value
 * (`resolveCanAddLines`). `/defaults` answers the backend-computed totals
 * (`grandTotalAmount`, `summedLineAmount`) with null on a new document, so a total in
 * that array keeps the button hidden until a manual save — which is how it vanished
 * from these four windows unnoticed: every integration spec saved by hand first.
 *
 * Per window, `/defaults` returns totals null in both tests:
 *   1. no business partner yet → the empty state renders, without the button;
 *   2. every required header field filled → the button is offered, and neither total
 *      is a header form input.
 * Test 2 is the one that fails on the regression; test 1 keeps it from passing on a
 * gate that is simply always open.
 *
 * The header is filled through `/defaults` (with `$_identifier` companions) rather
 * than by driving each selector: the gate reads the form data only, so how a value got
 * there does not change what is under test. The generic login() catch-all answers the
 * callouts and selectors the defaults trigger. The generated arrays themselves are
 * guarded by tools/app-shell/test/generated-required-header-fields.test.js.
 */

const DATE = '16-10-2026'; // /defaults format (dd-MM-yyyy), normalised by useEntity

/** Present on every new document of these windows, partner or not. */
const BASE_DEFAULTS = {
  documentStatus: 'DR',
  documentNo: '<1000000>',
  currency: '102',
  'currency$_identifier': 'EUR',
  priceList: 'pl-e2e',
  'priceList$_identifier': 'Tarifa E2E',
  paymentTerms: 'pt-e2e',
  'paymentTerms$_identifier': '30 días',
  // The regression: the totals are computed from the lines, so a new document has none.
  grandTotalAmount: null,
  summedLineAmount: null,
};

const PARTNER_DEFAULTS = {
  businessPartner: 'bp-e2e',
  'businessPartner$_identifier': 'Cliente E2E',
  partnerAddress: 'addr-e2e',
  'partnerAddress$_identifier': 'Calle E2E 1',
};

const WAREHOUSE = { warehouse: 'wh-e2e', 'warehouse$_identifier': 'Almacén E2E' };

/** The window-specific required header fields, beyond BASE and PARTNER. */
const WINDOWS = [
  { spec: 'sales-order', entity: 'header', defaults: { orderDate: DATE, ...WAREHOUSE } },
  {
    spec: 'purchase-order',
    entity: 'header',
    defaults: { orderDate: DATE, scheduledDeliveryDate: DATE, ...WAREHOUSE },
  },
  {
    spec: 'sales-invoice',
    entity: 'header',
    defaults: {
      transactionDocument: 'dt-e2e',
      'transactionDocument$_identifier': 'Factura E2E',
      invoiceDate: DATE,
      accountingDate: DATE,
      paymentMethod: 'pm-e2e',
      'paymentMethod$_identifier': 'Transferencia',
    },
  },
  { spec: 'sales-quotation', entity: 'quotation', defaults: { orderDate: DATE } },
];

/** Answer `/<spec>/<entity>/defaults`, open `/<spec>/new` and wait for the empty lines state. */
async function openNewDocument(page, { spec, entity }, defaults) {
  await page.route(`**/sws/neo/${spec}/${entity}/defaults**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ defaults }),
    });
  });
  const defaultsServed = page.waitForResponse((r) => r.url().includes(`/${spec}/${entity}/defaults`));

  await page.goto(`/${spec}/new`);
  await defaultsServed;
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 20_000 });
  // Anchor the negative assertion of test 1: the empty state itself must be rendered.
  await expect(page.getByText(t('noLinesYet')),
    `The empty lines state of a new ${spec} should render`,
  ).toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

test.describe('New document — add-lines action gate with null header totals', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const doc of WINDOWS) {
    test(`${doc.spec}: without a business partner the empty state offers no add-lines action`, async ({ page }) => {
      await openNewDocument(page, doc, { ...BASE_DEFAULTS, ...doc.defaults });

      await expect(addLinesEmptyStateButton(page),
        'A header still missing its business partner must not offer the add-lines action',
      ).toHaveCount(0);
    });

    test(`${doc.spec}: with the header filled the add-lines action is offered and the totals are no form inputs`, async ({ page }) => {
      await openNewDocument(page, doc, { ...BASE_DEFAULTS, ...PARTNER_DEFAULTS, ...doc.defaults });

      await expect(addLinesEmptyStateButton(page),
        'Every required header field is filled — null totals must not hold the add-lines action back',
      ).toBeVisible({ timeout: 10_000 });

      // Collapsed "Mostrar más datos" fields are not in the DOM: open them before
      // asserting absence, or the check would pass on a field that is merely hidden.
      await expandHeaderFields(page);
      for (const total of ['grandTotalAmount', 'summedLineAmount']) {
        await expect(page.getByTestId(`field-${total}`),
          `${total} is computed by the backend and must not be a header form input`,
        ).toHaveCount(0);
      }
    });
  }
});

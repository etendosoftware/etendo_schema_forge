import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Custom tab strip — icon + label golden master (mocked).
 *
 * ETP-4708 T10-T13 makes custom tab icons declarative: the hardcoded `TAB_ICONS`
 * map at the top of DetailView.jsx is replaced by a `tab.icon` value in
 * decisions.json resolved through a shared registry. The registry keeps a `List`
 * fallback, so a wrong or missing mapping does NOT throw — it silently renders a
 * generic list glyph. Nothing today would catch that, which is what this spec
 * exists for.
 *
 * Every case below asserts three things about a tab that is on screen right now:
 * it renders, it is reachable (clicking activates it), and it shows the icon it
 * shows today. The icon is the load-bearing one.
 *
 * All custom tabs — attachments included — reach the strip through the SAME
 * path: the window's `customTabs` prop, filtered to `placement: 'tab'`, keyed by
 * `customTabKey(ct)` = `custom:{key}`. There is no separate attachments code
 * path in DetailView.
 *
 * Overlap with existing specs, deliberately not duplicated here:
 *   - rectificaciones-tab.mocked.spec.js already covers the reversedInvoices tab
 *     opening its panel; this spec only adds that tab's ICON.
 *   - sif-buttons-fiscal-config.spec.js clicks tab-custom:sif to edit fields, but
 *     asserts no icon, and lives in the `integration` project (needs a live
 *     backend), so it cannot guard a refactor from the mocked suite.
 */

const SALES_INVOICE_ID = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
const PURCHASE_INVOICE_ID = 'B2C3D4E5F60718293A4B5C6D7E8F90A1';
const PRODUCT_ID = 'PROD-TAB-ICONS-1';

function invoice(id, overrides = {}) {
  return {
    id,
    documentNo: 'FC-TABICONS-1',
    invoiceDate: '2026-07-01',
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Cliente Tab Icons S.L.',
    partnerAddress: 'addr-001',
    'partnerAddress$_identifier': 'Calle Tab 1',
    paymentMethod: 'pm-001',
    'paymentMethod$_identifier': 'Transferencia',
    paymentTerms: 'pt-001',
    'paymentTerms$_identifier': '30 dias',
    priceList: 'pl-001',
    'priceList$_identifier': 'Tarifa ventas',
    currency: 'eur-001',
    'currency$_identifier': 'EUR',
    transactionDocument: 'td-001',
    'transactionDocument$_identifier': 'AR Invoice',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    documentAction: 'CO',
    processed: false,
    posted: 'N',
    grandTotalAmount: 250.0,
    summedLineAmount: 250.0,
    outstandingAmount: 250.0,
    paymentComplete: false,
    ...overrides,
  };
}

const PRODUCT = {
  id: PRODUCT_ID,
  searchKey: 'PROD-TAB-ICONS-1',
  name: 'Tab icons product',
  _identifier: 'Tab icons product',
  productType: 'I',
  'productType$_identifier': 'Item',
  purchase: true,
  sale: true,
  stocked: true,
  returnable: false,
};

/**
 * The SIF tab hides itself (customTabVisibility -> false) unless the selected
 * org's fiscal profile requires it, so an invoice alone is not enough to put it
 * on screen. This seeds an SII org, mirroring sif-buttons-fiscal-config.spec.js.
 */
async function installSiiFiscalProfile(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: 'ORG_1', name: 'QA Mock Org' }));
  });
  const respond = (data) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ response: { data } }),
  });
  await page.route('**/sws/neo/sii-config/siiConfiguration**', (route) => route.fulfill(respond([{ taxtype: 'IVA' }])));
  await page.route('**/sws/neo/tbai-config/header**', (route) => route.fulfill(respond([])));
  await page.route('**/sws/neo/verifactu-config/**', (route) => route.fulfill(respond([])));
}

/** Invoice detail mocks (sales-invoice / purchase-invoice share the entity shape). */
async function installInvoiceMocks(page, spec, record) {
  await page.route(`**/sws/neo/${spec}/header/${record.id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [record] } }),
    });
  });

  for (const entity of ['lines', 'paymentPlan', 'reversedInvoices']) {
    await page.route(`**/sws/neo/${spec}/${entity}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
    });
  }

  await page.route(`**/sws/neo/${spec}/evaluate-display**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

/** Product detail mock. Selector sub-paths fall through to login()'s catch-all. */
async function installProductMocks(page) {
  await page.route('**/sws/neo/product/product/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    if (/\/product\/product\/selectors\//.test(req.url())) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [PRODUCT] } }),
    });
  });
}

/**
 * One row per custom tab currently on screen in these three windows. `icon` is
 * the component DetailView resolves today — `List` marks the tabs that have no
 * mapping and therefore exercise the fallback, which is the case most likely to
 * swallow a broken resolver.
 */
const CASES = [
  {
    window: 'sales-invoice', id: SALES_INVOICE_ID, kind: 'invoice',
    tab: 'sif', icon: 'Shield', label: /^SIF$/i,
  },
  {
    window: 'purchase-invoice', id: PURCHASE_INVOICE_ID, kind: 'invoice',
    tab: 'sif', icon: 'Shield', label: /^SIF$/i,
  },
  {
    window: 'sales-invoice', id: SALES_INVOICE_ID, kind: 'invoice',
    tab: 'attachments', icon: 'AttachmentIcon', label: /adjuntos|attachments/i,
  },
  {
    window: 'sales-invoice', id: SALES_INVOICE_ID, kind: 'invoice',
    tab: 'reversedInvoices', icon: 'List', label: /rectificaciones|rectifications/i,
  },
  {
    window: 'product', id: PRODUCT_ID, kind: 'product',
    tab: 'pricing', icon: 'PricingIcon', label: /precio|price/i,
  },
  {
    window: 'product', id: PRODUCT_ID, kind: 'product',
    tab: 'attachments', icon: 'AttachmentIcon', label: /adjuntos|attachments/i,
  },
];

async function openDetail(page, c) {
  if (c.kind === 'invoice') {
    await installSiiFiscalProfile(page);
    await installInvoiceMocks(page, c.window, invoice(c.id));
  } else {
    await installProductMocks(page);
  }
  await page.goto(`/${c.window}/${c.id}`);
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
}

for (const c of CASES) {
  const tabTestId = `tab-custom:${c.tab}`;
  const iconTestId = `tab-icon-custom:${c.tab}`;

  test.describe(`Custom tab ${c.window} / ${c.tab}`, () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await openDetail(page, c);
    });

    test('renders in the tab strip with its current label', async ({ page }) => {
      const tab = page.getByTestId(tabTestId);
      await expect(tab).toBeVisible({ timeout: 10_000 });
      await expect(tab).toHaveText(c.label);
    });

    test('is reachable — clicking activates it', async ({ page }) => {
      const tab = page.getByTestId(tabTestId);
      await expect(tab).toBeVisible({ timeout: 10_000 });
      await expect(tab).toHaveAttribute('data-active', 'false');

      await tab.click();

      await expect(tab).toHaveAttribute('data-active', 'true');
    });

    test(`shows the ${c.icon} icon`, async ({ page }) => {
      const icon = page.getByTestId(iconTestId);
      await expect(icon).toBeVisible({ timeout: 10_000 });
      // The whole point of the golden master: a broken mapping renders List
      // instead of throwing, so the icon's identity has to be asserted by name.
      await expect(icon).toHaveAttribute('data-icon', c.icon);
    });
  });
}

/**
 * Guards the fallback itself rather than one tab that happens to use it. If the
 * resolver's default is broken these two stop being List, and every unmapped tab
 * in every window silently changes glyph at once.
 */
test.describe('Custom tab icon fallback', () => {
  test('tabs with no icon mapping fall back to List', async ({ page }) => {
    await login(page);
    await openDetail(page, CASES[0]);

    await expect(page.getByTestId('tab-icon-custom:reversedInvoices'))
      .toHaveAttribute('data-icon', 'List', { timeout: 10_000 });
    // The lines tab is a plain (non-custom) tab and is unmapped too — proving the
    // fallback is not specific to custom tabs.
    await expect(page.getByTestId('tab-icon-lines'))
      .toHaveAttribute('data-icon', 'List');
  });
});

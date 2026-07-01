import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Product Pricing tab — mocked spec.
 *
 * Covers the `ProductPriceBar` inline redesign
 * (`tools/app-shell/src/windows/custom/product/ProductPriceBar.jsx`):
 *
 *   Suite A — Create flow (product with zero M_ProductPrice rows)
 *     The tab renders two section toggles (Venta / Compra) and an
 *     "+ Agregar tarifa" button. Clicking the button shows an inline <select>
 *     populated by a lazy fetch to /price/selectors/M_PriceList_Version_ID
 *     (filtered by salesPriceList flag for the active section). Selecting an
 *     option immediately fires a POST — no dialog, no "Guardar cambios".
 *
 *   Suite B — Lazy fetch filtered to purchase section
 *     Switching to the Compra toggle and clicking "+ Agregar tarifa" triggers
 *     the lazy fetch. The resulting <select> only offers purchase-flagged
 *     versions (salesPriceList=false). Sales-flagged versions are filtered out.
 *
 * Mock mode only: routes are installed AFTER login() so they win over the
 * generic /sws/** catch-all (Playwright LIFO route matching).
 */

// ── Synthetic data ───────────────────────────────────────────────────────────

const PLV_SALE = {
  id: 'plv-sale',
  label: 'Lista venta 2026',
  name: 'Lista venta 2026',
  salesPriceList: true,
};

const PLV_PURCHASE = {
  id: 'plv-purchase',
  label: 'Lista compra 2026',
  name: 'Lista compra 2026',
  salesPriceList: false,
};

const SELECTOR_PAYLOAD = {
  items: [PLV_SALE, PLV_PURCHASE],
};

const PRODUCT_NO_PRICES = {
  id: 'PROD-1',
  searchKey: 'PROD-1',
  name: 'Product without prices',
  '_identifier': 'Product without prices',
  productType: 'I',
  'productType$_identifier': 'Item',
  purchase: true,
  sale: true,
  stocked: true,
  returnable: false,
  organization: 'org-1',
  client: 'client-1',
};

const EXISTING_SALES_ROW = {
  id: 'price-existing-sales-1',
  product: 'PROD-2',
  priceListVersion: 'plv-sale',
  'priceListVersion$_identifier': 'Lista venta 2026',
  'priceListVersion$salesPriceList': true,
  // Fields required by ProductSalePriceCell / ProductPurchasePriceCell (list view)
  // to resolve the correct price row via selectPriceRow.
  'priceListVersion$default': true,
  'priceListVersion$validFromDate': '2026-01-01',
  standardPrice: '8',
  listPrice: '10',
  priceLimit: '10',
};

const PRODUCT_WITH_SALES_PRICE = {
  ...PRODUCT_NO_PRICES,
  id: 'PROD-2',
  searchKey: 'PROD-2',
  name: 'Product with existing sales price',
  '_identifier': 'Product with existing sales price',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Install the product detail GET mock so navigating to /product/<id>
 * resolves a synthetic product record.
 */
async function mockProductDetail(page, product) {
  await page.route('**/sws/neo/product/product/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const url = req.url();
    // Match detail GETs `/product/product/<id>` — selectors live under
    // `/product/product/selectors/...` and must fall through to the generic
    // catch-all installed by login().
    if (/\/product\/product\/selectors\//.test(url)) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [product] } }),
    });
  });
}

/**
 * Install the M_PriceList_Version_ID selector mock and capture each call so
 * tests can assert the lazy fetch actually fired.
 */
async function mockSelector(page, calls) {
  await page.route('**/sws/neo/product/price/selectors/M_PriceList_Version_ID**', async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SELECTOR_PAYLOAD),
    });
  });
}

// mockPriceDefaults is kept as a no-op helper for backwards compatibility;
// the current ProductPriceBar no longer fetches /price/defaults.
async function mockPriceDefaults(_page) {}

// ── Suite A — Create flow ────────────────────────────────────────────────────

test.describe('Product pricing — create flow (no existing rows)', () => {
  let postBodies;
  let selectorCalls;
  let priceListRows;

  test.beforeEach(async ({ page }) => {
    postBodies = [];
    selectorCalls = [];
    priceListRows = []; // start empty so the create flow is triggered

    await login(page);

    // Catch-all for /price endpoints — list GET + POST + per-id PATCH/DELETE.
    // Installed AFTER login() so it wins over the generic catch-all.
    await page.route('**/sws/neo/product/price**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      // Selector and defaults endpoints handled by dedicated mocks below.
      if (/\/price\/selectors\//.test(url)) return route.fallback();
      if (/\/price\/defaults/.test(url)) return route.fallback();

      // List GET: `/price?parentId=...`
      if (method === 'GET' && !/\/price\/[^/?]+/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: priceListRows, totalRows: priceListRows.length },
          }),
        });
        return;
      }

      // POST `/price` — create new row.
      if (method === 'POST' && !/\/price\/[^/?]+/.test(url)) {
        const body = req.postData() ? JSON.parse(req.postData()) : {};
        postBodies.push(body);

        // Build a saved row that mirrors what the next list GET should return.
        const isSales = String(body.priceListVersion) === 'plv-sale';
        const newRow = {
          id: `price-new-${postBodies.length}`,
          product: body.product,
          priceListVersion: body.priceListVersion,
          'priceListVersion$_identifier': isSales ? PLV_SALE.label : PLV_PURCHASE.label,
          'priceListVersion$salesPriceList': isSales,
          // Fields required by ProductSalePriceCell / ProductPurchasePriceCell (list view)
          'priceListVersion$default': true,
          'priceListVersion$validFromDate': '2026-01-01',
          standardPrice: body.standardPrice,
          listPrice: body.listPrice,
          priceLimit: body.priceLimit,
        };
        priceListRows = [...priceListRows, newRow];

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, response: { data: [{ id: newRow.id }] } }),
        });
        return;
      }

      return route.fallback();
    });

    await mockSelector(page, selectorCalls);
    await mockPriceDefaults(page);
    await mockProductDetail(page, PRODUCT_NO_PRICES);

    await page.goto(`/product/${PRODUCT_NO_PRICES.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('empty state shows section toggle and add button; clicking add reveals version selector filtered to sales', async ({ page }) => {
    // The Venta section title is rendered on the right column.
    await expect(
      page.getByText(/sales price lists|listas de precios de venta/i),
    ).toBeVisible({ timeout: 10_000 });

    // Both section toggles are visible in the left column.
    await expect(page.locator('[data-testid="price-tab-sales"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="price-tab-purchase"]')).toBeVisible({ timeout: 5_000 });

    // "+ Agregar tarifa" button is visible.
    await expect(page.locator('[data-testid="price-add-tariff"]')).toBeVisible({ timeout: 5_000 });

    // Set up the lazy-fetch promise before clicking so we can assert it fired.
    const selectorRequestPromise = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/sws/neo/product/price/selectors/M_PriceList_Version_ID'),
      { timeout: 10_000 },
    );

    // Click "+ Agregar tarifa" — triggers lazy fetch, shows inline <select>.
    await page.locator('[data-testid="price-add-tariff"]').click();

    // Inline select appears (not inside a dialog).
    const addSelect = page.locator('select');
    await expect(addSelect).toBeVisible({ timeout: 10_000 });

    // Lazy fetch must have fired.
    await selectorRequestPromise;

    // Sales-flagged option is offered for the active Venta section.
    await expect(
      addSelect.locator('option', { hasText: 'Lista venta 2026' }),
    ).toHaveCount(1, { timeout: 10_000 });

    // Purchase-flagged option is NOT offered (filtered out for Venta section).
    await expect(
      addSelect.locator('option', { hasText: 'Lista compra 2026' }),
    ).toHaveCount(0);
  });

  test('selecting a sales version fires one POST immediately and rerenders the row', async ({ page }) => {
    // Click "+ Agregar tarifa" and wait for the inline select to appear.
    await page.locator('[data-testid="price-add-tariff"]').click();

    const addSelect = page.locator('select');
    await expect(
      addSelect.locator('option', { hasText: 'Lista venta 2026' }),
    ).toHaveCount(1, { timeout: 10_000 });

    // Set up POST intercept BEFORE selecting so we don't miss the request.
    const postPromise = page.waitForRequest(
      (req) =>
        req.method() === 'POST' &&
        /\/sws\/neo\/product\/price(\?|$)/.test(req.url()),
      { timeout: 10_000 },
    );

    // Selecting fires POST immediately — no "Guardar cambios" button needed.
    await addSelect.selectOption({ label: 'Lista venta 2026' });

    await postPromise;

    // After POST + refresh the row label appears inline as a readonly input value.
    await expect(page.locator('input[value="Lista venta 2026"]')).toBeVisible({ timeout: 10_000 });

    // Exactly one POST was made.
    expect(postBodies).toHaveLength(1);

    const sentBody = postBodies[0];
    expect(sentBody.priceListVersion).toBe('plv-sale');
    expect(sentBody.product).toBe(PRODUCT_NO_PRICES.id);

    // Switch to Compra — no rows there.
    await page.locator('[data-testid="price-tab-purchase"]').click();
    await expect(page.locator('input[value="Lista compra 2026"]')).toHaveCount(0);
  });
});

// ── Suite B — Edit dialog with lazy-loaded options ───────────────────────────

test.describe('Product pricing — edit dialog populates dropdown from lazy fetch', () => {
  let selectorCalls;

  test.beforeEach(async ({ page }) => {
    selectorCalls = [];

    await login(page);

    // Return ONE existing sales row so the footer shows "Edit pricing".
    await page.route('**/sws/neo/product/price**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (/\/price\/selectors\//.test(url)) return route.fallback();
      if (/\/price\/defaults/.test(url)) return route.fallback();

      if (method === 'GET' && !/\/price\/[^/?]+/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: [EXISTING_SALES_ROW], totalRows: 1 },
          }),
        });
        return;
      }

      return route.fallback();
    });

    await mockSelector(page, selectorCalls);
    await mockPriceDefaults(page);
    await mockProductDetail(page, PRODUCT_WITH_SALES_PRICE);

    await page.goto(`/product/${PRODUCT_WITH_SALES_PRICE.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('switching to Compra toggle and clicking add triggers lazy fetch filtered to purchase options', async ({ page }) => {
    // Existing sales row should already be visible in the Venta section (readonly input).
    await expect(page.locator('input[value="Lista venta 2026"]')).toBeVisible({ timeout: 10_000 });

    // Switch to the Compra section via its toggle button.
    await page.locator('[data-testid="price-tab-purchase"]').click();

    // Section title switches to purchase.
    await expect(
      page.getByText(/purchase price lists|listas de precios de compra/i),
    ).toBeVisible({ timeout: 5_000 });

    // Set up the selector fetch promise BEFORE clicking add, because the lazy
    // fetch fires as soon as adding=true.
    const selectorRequestPromise = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/sws/neo/product/price/selectors/M_PriceList_Version_ID'),
      { timeout: 10_000 },
    );

    // Click "+ Agregar tarifa" in the Compra section.
    await page.locator('[data-testid="price-add-tariff"]').click();

    // Inline select appears — no dialog.
    const purchaseSelect = page.locator('select');
    await expect(purchaseSelect).toBeVisible({ timeout: 10_000 });

    // Lazy fetch fired.
    await selectorRequestPromise;
    expect(selectorCalls.length).toBeGreaterThanOrEqual(1);

    // After fetch, purchase-flagged option is available.
    await expect(
      purchaseSelect.locator('option', { hasText: 'Lista compra 2026' }),
    ).toHaveCount(1, { timeout: 10_000 });

    // Sales-flagged option is NOT offered (filtered for Compra section).
    await expect(
      purchaseSelect.locator('option', { hasText: 'Lista venta 2026' }),
    ).toHaveCount(0);
  });
});

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { clickEmptyStateAddLine } from '../helpers/secondaryTabsInteractions.js';

/**
 * Product Pricing tab — mocked spec.
 *
 * Covers the `ProductPriceBar` inline redesign
 * (`tools/app-shell/src/windows/custom/product/ProductPriceBar.jsx`):
 *
 *   Suite A — Create flow (product with zero M_ProductPrice rows)
 *     The tab renders two section toggles (Venta / Compra) and an
 *     "+ Añadir nueva tarifa" button (`price-add-tariff`). Clicking it shows an
 *     inline `CreatableSearchSelect` (text input `field-priceListVersion`).
 *     Focusing the input opens the dropdown, populated by a lazy fetch to
 *     /price/selectors/M_PriceList_Version_ID (filtered by salesPriceList for
 *     the active section). Selecting an existing option
 *     (`option-priceListVersion-<id>`) immediately fires a POST /price — no
 *     dialog, no "Guardar cambios".
 *
 *   Suite B — Lazy fetch filtered to purchase section
 *     Switching to the Compra toggle and opening the selector triggers the lazy
 *     fetch. The dropdown only offers purchase-flagged versions
 *     (salesPriceList=false). Sales-flagged versions are filtered out.
 *
 *   Suite C — Inline create-tariff flow
 *     The dropdown exposes a create action (`action-create-priceListVersion`).
 *     Clicking it opens the `InlineCreateModal` (`inline-create-modal`); typing
 *     a name and submitting POSTs a new price list to the spec-swapped
 *     /price-list/priceList endpoint (currency injected by the backend), reads
 *     back the auto-created `priceListVersion`, links it via POST /price, and the
 *     new row appears in the active section.
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

const PRODUCT_FOR_ACCOUNTING = {
  ...PRODUCT_NO_PRICES,
  id: 'PROD-ACCT-1',
  searchKey: 'PROD-ACCT-1',
  name: 'Product with accounting row',
  '_identifier': 'Product with accounting row',
};

const ACCOUNTING_ROW = {
  id: 'prod-acct-001',
  fixedAsset: 'gl-001',
  'fixedAsset$_identifier': '2130000 Maquinaria',
  productExpense: 'gl-002',
  'productExpense$_identifier': '6000000 Compras de mercaderías',
  productRevenue: 'gl-003',
  'productRevenue$_identifier': '7000000 Ventas de mercaderías',
  productCOGS: 'gl-004',
  'productCOGS$_identifier': '6100000 Variación de existencias',
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

/**
 * Install the /price catch-all: list GET (`/price?parentId=`) returns the
 * (mutable) rows array, POST /price appends a synthetic saved row so the next
 * list GET reflects it. `postBodies` captures each create body.
 */
function installPriceRoute(page, state) {
  return page.route('**/sws/neo/product/price**', async (route) => {
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
          response: { data: state.rows, totalRows: state.rows.length },
        }),
      });
      return;
    }

    if (method === 'POST' && !/\/price\/[^/?]+/.test(url)) {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.postBodies.push(body);

      const isSales = String(body.priceListVersion) === 'plv-sale';
      const newRow = {
        id: `price-new-${state.postBodies.length}`,
        product: body.product,
        priceListVersion: body.priceListVersion,
        'priceListVersion$_identifier': isSales ? PLV_SALE.label : PLV_PURCHASE.label,
        'priceListVersion$salesPriceList': isSales,
        'priceListVersion$default': true,
        'priceListVersion$validFromDate': '2026-01-01',
        standardPrice: body.standardPrice,
        listPrice: body.listPrice,
        priceLimit: body.priceLimit,
      };
      state.rows = [...state.rows, newRow];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, response: { data: [{ id: newRow.id }] } }),
      });
      return;
    }

    return route.fallback();
  });
}

/**
 * Install the `accounting` child-entity mock (M_Product_Acct) for the
 * Accounting secondary tab added in ETP-4402.
 */
async function mockProductAccounting(page, rows) {
  await page.route('**/sws/neo/product/accounting**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (/\/accounting\/selectors\//.test(url)) return route.fallback();
    if (req.method() !== 'GET') return route.fallback();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
    });
  });
}

// ── Suite A — Create flow ────────────────────────────────────────────────────

test.describe('Product pricing — create flow (no existing rows)', () => {
  let state;
  let selectorCalls;

  test.beforeEach(async ({ page }) => {
    state = { rows: [], postBodies: [] };
    selectorCalls = [];

    await login(page);

    await installPriceRoute(page, state);
    await mockSelector(page, selectorCalls);
    await mockProductDetail(page, PRODUCT_NO_PRICES);

    await page.goto(`/product/${PRODUCT_NO_PRICES.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // ETP-4402 made "Accounting" (Contabilidad) the default detail tab; the
    // pricing UI now lives in the non-default "Precio" tab (customTab 'pricing').
    await page.getByTestId('tab-custom:pricing').click();
  });

  test('empty state shows section toggle and add button; opening the selector lists sales options only', async ({ page }) => {
    // The Venta section title is rendered on the right column.
    await expect(
      page.getByText(/sales price lists|listas de precios de venta/i),
    ).toBeVisible({ timeout: 10_000 });

    // Both section toggles are visible in the left column.
    await expect(page.getByTestId('price-tab-sales')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('price-tab-purchase')).toBeVisible({ timeout: 5_000 });

    // Add-tariff button is visible.
    await expect(page.getByTestId('price-add-tariff')).toBeVisible({ timeout: 5_000 });

    // Lazy fetch fires as soon as adding=true — arm the waiter before clicking.
    const selectorRequestPromise = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/sws/neo/product/price/selectors/M_PriceList_Version_ID'),
      { timeout: 10_000 },
    );

    await page.getByTestId('price-add-tariff').click();

    // Inline creatable selector appears (text input, not a native <select>).
    const input = page.getByTestId('field-priceListVersion');
    await expect(input).toBeVisible({ timeout: 10_000 });

    await selectorRequestPromise;

    // Focus opens the dropdown with the section-filtered options.
    await input.click();

    // Sales-flagged option is offered for the active Venta section.
    await expect(page.getByTestId('option-priceListVersion-plv-sale')).toBeVisible({ timeout: 10_000 });

    // Purchase-flagged option is NOT offered (filtered out for Venta section).
    await expect(page.getByTestId('option-priceListVersion-plv-purchase')).toHaveCount(0);
  });

  test('selecting a sales version fires one POST immediately and rerenders the row', async ({ page }) => {
    await page.getByTestId('price-add-tariff').click();
    await page.getByTestId('field-priceListVersion').click();

    const option = page.getByTestId('option-priceListVersion-plv-sale');
    await expect(option).toBeVisible({ timeout: 10_000 });

    // Arm the POST waiter BEFORE selecting so we don't miss the request.
    const postPromise = page.waitForRequest(
      (req) =>
        req.method() === 'POST' &&
        /\/sws\/neo\/product\/price(\?|$)/.test(req.url()),
      { timeout: 10_000 },
    );

    // Selecting fires POST immediately — no "Guardar cambios" button needed.
    await option.click();

    await postPromise;

    // After POST + refresh the row label appears inline as a readonly input value.
    await expect(page.locator('input[value="Lista venta 2026"]')).toBeVisible({ timeout: 10_000 });

    // Exactly one POST was made.
    expect(state.postBodies).toHaveLength(1);

    const sentBody = state.postBodies[0];
    expect(sentBody.priceListVersion).toBe('plv-sale');
    expect(sentBody.product).toBe(PRODUCT_NO_PRICES.id);

    // Switch to Compra — no rows there.
    await page.getByTestId('price-tab-purchase').click();
    await expect(page.locator('input[value="Lista compra 2026"]')).toHaveCount(0);
  });
});

// ── Suite B — Purchase section lazy fetch ────────────────────────────────────

test.describe('Product pricing — selector populates dropdown from lazy fetch (purchase)', () => {
  let selectorCalls;

  test.beforeEach(async ({ page }) => {
    selectorCalls = [];

    await login(page);

    // Return ONE existing sales row so the sales section is populated.
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
    await mockProductDetail(page, PRODUCT_WITH_SALES_PRICE);

    await page.goto(`/product/${PRODUCT_WITH_SALES_PRICE.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // ETP-4402 made "Accounting" (Contabilidad) the default detail tab; the
    // pricing UI now lives in the non-default "Precio" tab (customTab 'pricing').
    await page.getByTestId('tab-custom:pricing').click();
  });

  test('switching to Compra and opening the selector triggers lazy fetch filtered to purchase options', async ({ page }) => {
    // Existing sales row should already be visible in the Venta section (readonly input).
    await expect(page.locator('input[value="Lista venta 2026"]')).toBeVisible({ timeout: 10_000 });

    // Switch to the Compra section via its toggle button.
    await page.getByTestId('price-tab-purchase').click();

    // Section title switches to purchase.
    await expect(
      page.getByText(/purchase price lists|listas de precios de compra/i),
    ).toBeVisible({ timeout: 5_000 });

    // Arm the selector fetch waiter BEFORE clicking add — the lazy fetch fires
    // as soon as adding=true.
    const selectorRequestPromise = page.waitForRequest(
      (req) =>
        req.method() === 'GET' &&
        req.url().includes('/sws/neo/product/price/selectors/M_PriceList_Version_ID'),
      { timeout: 10_000 },
    );

    await page.getByTestId('price-add-tariff').click();

    // Inline creatable selector appears — no dialog.
    const input = page.getByTestId('field-priceListVersion');
    await expect(input).toBeVisible({ timeout: 10_000 });

    await selectorRequestPromise;
    expect(selectorCalls.length).toBeGreaterThanOrEqual(1);

    // Open the dropdown.
    await input.click();

    // Purchase-flagged option is available.
    await expect(page.getByTestId('option-priceListVersion-plv-purchase')).toBeVisible({ timeout: 10_000 });

    // Sales-flagged option is NOT offered (already present + filtered for Compra section).
    await expect(page.getByTestId('option-priceListVersion-plv-sale')).toHaveCount(0);
  });
});

// ── Suite C — Inline create tariff ───────────────────────────────────────────

test.describe('Product pricing — inline create tariff', () => {
  let state;
  let createBodies;

  test.beforeEach(async ({ page }) => {
    state = { rows: [], postBodies: [] };
    createBodies = [];

    await login(page);

    // Spec-swapped price-list create endpoint: apiBaseUrl `/sws/neo/product`
    // has its last segment replaced → `/sws/neo/price-list/priceList`.
    await page.route('**/sws/neo/price-list/priceList**', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.fallback();
      createBodies.push(req.postData() ? JSON.parse(req.postData()) : {});
      // Go auto-creates exactly one hidden version with the same name; return its id.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: [{ id: 'PL-NEW', priceListVersion: 'plv-sale' }] },
        }),
      });
    });

    await installPriceRoute(page, state);
    await mockSelector(page, []);
    await mockProductDetail(page, PRODUCT_NO_PRICES);

    await page.goto(`/product/${PRODUCT_NO_PRICES.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // ETP-4402 made "Accounting" (Contabilidad) the default detail tab; the
    // pricing UI now lives in the non-default "Precio" tab (customTab 'pricing').
    await page.getByTestId('tab-custom:pricing').click();
  });

  test('creating a tariff by name POSTs a price list then links it and shows the new row', async ({ page }) => {
    await expect(page.getByTestId('price-add-tariff')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('price-add-tariff').click();

    // Open the dropdown, then trigger the inline create action.
    await page.getByTestId('field-priceListVersion').click();
    const createAction = page.getByTestId('action-create-priceListVersion');
    await expect(createAction).toBeVisible({ timeout: 10_000 });
    await createAction.click();

    // Name-only modal opens.
    await expect(page.getByTestId('inline-create-modal')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('inline-create-name').fill('Tarifa nueva');
    await page.getByTestId('inline-create-submit').click();

    // The new price row appears in the (sales) section after create + link + refresh.
    await expect(page.locator('input[value="Lista venta 2026"]')).toBeVisible({ timeout: 10_000 });

    // The price list was created with the sales flag and NO currency (backend injects it).
    expect(createBodies).toHaveLength(1);
    expect(createBodies[0].name).toBe('Tarifa nueva');
    expect(createBodies[0].salesPriceList).toBe(true);
    expect(createBodies[0].costBasedPriceList).toBe(false);
    expect(createBodies[0].priceIncludesTax).toBe(false);
    expect(createBodies[0].default).toBe(false);
    expect(createBodies[0]).not.toHaveProperty('currency');

    // The returned auto-created version was linked to the product via POST /price.
    expect(state.postBodies.some((b) => b.priceListVersion === 'plv-sale')).toBe(true);
    expect(state.postBodies.every((b) => b.product === PRODUCT_NO_PRICES.id)).toBe(true);
  });
});

// ── Suite C — Accounting tab (ETP-4402) ──────────────────────────────────────

test.describe('Product Accounting tab — mocked', () => {
  /**
   * ETP-4402 wired the `accounting` entity (M_Product_Acct) into the unified
   * secondary tab strip (Accounting, Price, Attachments — in that order) via
   * `window.secondaryTabs.accounting`, using the classic grid+form layout
   * (not inlineEditable). Covers the previously-untested surface:
   *
   *   - The Accounting tab (`tab-accounting`) is present and shows the
   *     Fixed Asset / Product Expense / Product Revenue / Product COGS
   *     GL account columns.
   *   - `accountingSchema` never renders as a column or an add-line field for
   *     a row added when a sibling already exists — `addLineFromSibling`
   *     copies it client-side from the previous row, and `ProductAccountingHandler`
   *     auto-fills it server-side on POST when absent (covering the very
   *     first row, which has no sibling to copy from).
   *
   * ETP-4565 added `"maxDetailLines": 1` to the `accounting` secondary-tab
   * entry in `decisions.json` — the tab is now capped at a single,
   * non-deletable record (see `DetailView.jsx`,
   * `st.maxDetailLines == null || childrenCount < st.maxDetailLines` gating
   * `action-add-line`, and `docs/ui-customization.md` §17). With the seeded
   * ACCOUNTING_ROW present (the default state exercised by the "columns"
   * test), Add Line is correctly hidden — so the GL-fields-but-not-
   * accountingSchema coverage below now runs against an empty-seed variant
   * (the one state where Add Line is still reachable), and a companion test
   * asserts the cap itself: Add Line is absent once the single allowed
   * record exists.
   */

  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockProductAccounting(page, [ACCOUNTING_ROW]);
    await mockProductDetail(page, PRODUCT_FOR_ACCOUNTING);

    await page.goto(`/product/${PRODUCT_FOR_ACCOUNTING.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Accounting tab shows the four GL account columns; accountingSchema is absent', async ({ page }) => {
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });

    const accountingTab = page.getByTestId('tab-accounting');
    await expect(accountingTab).toBeVisible({ timeout: 10_000 });
    await accountingTab.click();

    await expect(page.getByTestId('column-header-fixedAsset')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('column-header-productExpense')).toBeVisible();
    await expect(page.getByTestId('column-header-productRevenue')).toBeVisible();
    await expect(page.getByTestId('column-header-productCOGS')).toBeVisible();

    await expect(page.getByTestId('column-header-accountingSchema')).toHaveCount(0);

    await expect(page.getByText('6000000 Compras de mercaderías')).toBeVisible();
  });

  test('Add Line is hidden once the accounting record already exists (maxDetailLines: 1 cap)', async ({ page }) => {
    await page.getByTestId('tab-accounting').click();

    // ETP-4565: maxDetailLines: 1 hides action-add-line once childrenCount
    // reaches the cap — the seeded ACCOUNTING_ROW already fills it.
    await expect(page.getByTestId('column-header-fixedAsset')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('action-add-line')).toHaveCount(0);
  });
});

test.describe('Product Accounting tab (empty state) — mocked', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockProductAccounting(page, []);
    await mockProductDetail(page, PRODUCT_FOR_ACCOUNTING);

    await page.goto(`/product/${PRODUCT_FOR_ACCOUNTING.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Add Line exposes the four GL account fields; accountingSchema is never editable', async ({ page }) => {
    await page.getByTestId('tab-accounting').click();

    await clickEmptyStateAddLine(page);

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('inline-add-field-fixedAsset')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-productExpense')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-productRevenue')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-productCOGS')).toBeVisible();

    await expect(page.getByTestId('inline-add-field-accountingSchema')).toHaveCount(0);
  });
});

// @covers tools/app-shell/src/windows/custom/product/ProductStockDefaultsWatcher.jsx
// @covers tools/app-shell/src/components/contract-ui/saveActions.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * ETP-5091 / ETP-5696 — stock flags hidden for Expense/Resource product types.
 *
 * The unified product sheet (ETP-5696) shows `Almacenable`/`Retornable` in the main form only
 * when `productType === 'I'` (`displayLogicJs` in decisions.json); `ProductSidebar.jsx` hides the
 * stock widget for the non-stockable types (`S`, `E`, `R`, ETP-4606 / ETP-5091).
 *
 * This spec reproduces the ticket's steps end-to-end (real DetailView + ProductSidebar, only the
 * network layer mocked): open a product of type Gasto or Recurso and confirm the stock flags are
 * gone, the same way they are for Service. It also pins the control case (type Artículo, 'I').
 */

function buildProduct(id, productType, productTypeLabel) {
  return {
    id,
    searchKey: id,
    name: `Product ${id}`,
    '_identifier': `Product ${id}`,
    productType,
    'productType$_identifier': productTypeLabel,
    purchase: true,
    sale: true,
    stocked: true,
    returnable: true,
    weight: 0,
    organization: 'org-1',
    client: 'client-1',
  };
}

const PRODUCTS = {
  E: buildProduct('PROD-EXPENSE-1', 'E', 'Expense type'),
  R: buildProduct('PROD-RESOURCE-1', 'R', 'Resource'),
  I: buildProduct('PROD-ARTICLE-1', 'I', 'Item'),
};

async function mockProductDetail(page, product) {
  await page.route('**/sws/neo/product/product/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    const url = req.url();
    if (/\/product\/product\/selectors\//.test(url)) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [product] } }),
    });
  });
}

// Deterministic, empty stock/transactions so ProductSidebar always resolves
// to either `null` (non-stockable types) or the `StockEmptyState` fallback
// (stockable types) — never left in a perpetually-loading state.
async function mockStockAndTransactions(page) {
  await page.route('**/sws/neo/product/stock**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });
  await page.route('**/sws/neo/product/transactions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });
}

async function openProduct(page, product) {
  await login(page);
  await mockProductDetail(page, product);
  await mockStockAndTransactions(page);
  await page.goto(`/product/${product.id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

for (const [code, label] of [['E', 'Gasto'], ['R', 'Recurso']]) {
  test.describe(`Product stock flags — hidden for ${label} (ETP-5091)`, () => {
    test.beforeEach(async ({ page }) => {
      await openProduct(page, PRODUCTS[code]);
    });

    test(`hides the stock flags (Almacenable/Retornable) for ${label}`, async ({ page }) => {
      await expect(page.getByText('Gestión de stock')).not.toBeVisible();
      await expect(page.getByTestId('field-stocked')).not.toBeVisible();
      await expect(page.getByTestId('field-returnable')).not.toBeVisible();
    });
  });
}

test.describe('Product stock flags — control case, Artículo stays stockable', () => {
  test.beforeEach(async ({ page }) => {
    await openProduct(page, PRODUCTS.I);
  });

  test('keeps the stock flags visible for Artículo', async ({ page }) => {
    await expect(page.getByTestId('field-stocked')).toBeVisible();
    await expect(page.getByTestId('field-returnable')).toBeVisible();
  });
});

/**
 * ETP-5680 follow-up — Save is disabled while the tax-category lookup that follows a type change
 * is in flight, and the save that follows it carries the Services category.
 *
 * The `/defaults?productType=` answer is held back by the test, so the in-flight window is
 * observable instead of a race: Save (and its spinner) is asserted before the reply is released.
 */
test.describe('Product type change — Save waits for the tax category (ETP-5680)', () => {
  test('Save stays disabled until /defaults?productType=S answers, then saves Servicios', async ({ page }) => {
    const product = { ...PRODUCTS.I, taxCategory: 'TAX-GOODS', 'taxCategory$_identifier': 'IVA Normal' };
    let releaseDefaults;
    const defaultsGate = new Promise((resolve) => { releaseDefaults = resolve; });
    const patchBodies = [];

    await login(page);
    await page.route('**/sws/neo/product/product/PROD-ARTICLE-1', async (route) => {
      const req = route.request();
      if (req.method() !== 'PATCH' && req.method() !== 'PUT') return route.fallback();
      const body = JSON.parse(req.postData() || '{}');
      patchBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...product, ...body }] } }),
      });
    });
    await mockProductDetail(page, product);
    await mockStockAndTransactions(page);
    // Registered AFTER mockProductDetail on purpose: Playwright matches routes last-registered-first,
    // and that broader pattern would otherwise answer /defaults with the product list at once.
    await page.route('**/sws/neo/product/product/defaults**', async (route) => {
      await defaultsGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaults: { typeTaxCategory: 'TAX-SERV', 'typeTaxCategory$_identifier': 'IVA Normal Servicios' } }),
      });
    });
    await page.goto(`/product/${product.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The Tipo combo is the button that shows the current type (Artículo) next to its clear action.
    await page.getByRole('button', { name: /^Artículo/ }).first().click();
    await page.getByRole('option', { name: 'Servicio' }).click();

    // In flight: nothing may be saved, and the button says it is busy.
    await expect(page.getByTestId('action-save')).toBeDisabled();
    await expect(page.getByTestId('action-save').getByTestId('Loader2__fa3275')).toBeVisible();
    expect(patchBodies).toHaveLength(0);

    releaseDefaults();
    await expect(page.getByTestId('action-save')).toBeEnabled();
    await page.getByTestId('action-save').click();

    await expect.poll(() => patchBodies.length).toBeGreaterThan(0);
    expect(patchBodies[patchBodies.length - 1]).toMatchObject({ productType: 'S', taxCategory: 'TAX-SERV' });
  });
});

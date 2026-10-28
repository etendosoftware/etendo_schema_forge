import { test, expect } from '../../helpers/test.js';
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

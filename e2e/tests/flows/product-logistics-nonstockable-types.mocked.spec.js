import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * ETP-5091 — Logistics section visible for Expense/Resource product types.
 *
 * Twin bug of ETP-4943 (Service). `ProductAdditionalInfoPanel.jsx` only hides
 * the `Logistics` row (weight/UOM, "Almacenable"/"Retornable") when
 * `productType === 'S'`; `ProductSidebar.jsx` only hides the stock widget
 * under the same condition (ETP-4606). Neither treats `productType === 'E'`
 * (Gasto) or `'R'` (Recurso) the same way, even though both have no physical
 * existence and cannot be stocked — matching the ticket's own wording.
 *
 * This spec reproduces the ticket's reported steps end-to-end (real
 * DetailView + real ProductAdditionalInfoPanel/ProductSidebar, only the
 * network layer mocked): create/open a product of type Gasto or Recurso and
 * confirm the Logistics section and stock sidebar are gone, the same way
 * they already are for Service. It also pins the control case (type
 * Artículo, 'I') so a future regression on Service/Article is caught too.
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

async function openProductAdditionalInfo(page, product) {
  await login(page);
  await mockProductDetail(page, product);
  await mockStockAndTransactions(page);
  await page.goto(`/product/${product.id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByRole('button', { name: 'Información adicional' }).click();
}

for (const [code, label] of [['E', 'Gasto'], ['R', 'Recurso']]) {
  test.describe(`Product Logistics section — hidden for ${label} (ETP-5091)`, () => {
    test.beforeEach(async ({ page }) => {
      await openProductAdditionalInfo(page, PRODUCTS[code]);
    });

    test(`hides the Logistics section (Almacenable/Retornable) for ${label}`, async ({ page }) => {
      await expect(page.getByText('Logística')).not.toBeVisible();
      await expect(page.getByTestId('field-stocked')).not.toBeVisible();
      await expect(page.getByTestId('field-returnable')).not.toBeVisible();
    });

    test(`hides the stock movement sidebar for ${label}`, async ({ page }) => {
      await expect(page.getByText('Sin movimientos de stock')).not.toBeVisible();
      await expect(page.getByText('Movimiento de stock')).not.toBeVisible();
    });
  });
}

test.describe('Product Logistics section — control case, Artículo stays stockable', () => {
  test.beforeEach(async ({ page }) => {
    await openProductAdditionalInfo(page, PRODUCTS.I);
  });

  test('keeps the Logistics section visible for Artículo', async ({ page }) => {
    await expect(page.getByText('Logística')).toBeVisible();
    await expect(page.getByTestId('field-stocked')).toBeVisible();
    await expect(page.getByTestId('field-returnable')).toBeVisible();
  });

  test('keeps the stock movement sidebar visible for Artículo', async ({ page }) => {
    await expect(page.getByText('Sin movimientos de stock')).toBeVisible({ timeout: 10_000 });
  });
});

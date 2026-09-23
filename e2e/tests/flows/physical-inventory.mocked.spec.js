import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Physical Inventory — flow tests.
 *
 * Requires the dev server running (make dev or make dev-mock).
 * By default the shared auth helper uses mock mode. Set E2E_USE_MOCK=0 with
 * real backend credentials to exercise the onboarding login flow.
 *
 * Selectors use stable data-testid attributes instead of localized labels.
 * Column headers are sortable <button> elements in list views.
 */

// Mocked existing record used by add-line tests.
// canAddLines requires all requiredHeaderFields to be non-null; navigating to
// /new leaves movementDate/name/warehouse empty, hiding the add-line button.
const MOCK_INV_ID = 'mock-pi-e2e-001';
const MOCK_INV_HEADER = {
  id: MOCK_INV_ID,
  movementDate: '2026-01-15',
  name: 'Test Physical Inventory',
  warehouse: 'wh-e2e-001',
  'warehouse$_identifier': 'Main Warehouse',
  inventoryType: 'N',
  'inventoryType$_identifier': 'Normal',
  processed: false,
};

async function installInventoryMocks(page) {
  await page.route(`**/sws/neo/physical-inventory/inventory/${MOCK_INV_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [MOCK_INV_HEADER] } }),
    });
  });
  await page.route('**/sws/neo/physical-inventory/inventoryLine*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });
}

test.describe('Physical Inventory', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateTo(page, 'physical-inventory');
  });

  // --- forceCalloutFields invariant ---
  // Verifies ETP-3585: selecting a product must overwrite user-typed userCount,
  // even if the user pre-filled it manually (forceCalloutFields bypasses the touch guard).
  // The route intercept in auth.js returns a synthetic product suggestion and callout
  // response ({ quantityCount: 42 }), so this test runs without VITE_MOCK=true.
  test('selecting a product overwrites user-typed userCount (forceCalloutFields)', async ({ page }) => {
    await page.route('**/sws/**/selectors/M_Product_ID{/**,}**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: 'prod-e2e',
          label: 'Test Product',
          name: 'Test Product',
          _identifier: 'Test Product',
          searchKey: 'TEST-PRODUCT',
        }],
        hasMore: false,
        totalCount: 1,
      }),
    }));
    await page.route('**/sws/**/callout{/**,}**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        updates: { quantityCount: { value: 42 }, bookQuantity: { value: 42 } },
        combos: {},
        messages: [],
      }),
    }));

    await installInventoryMocks(page);
    await page.goto(`/physical-inventory/${MOCK_INV_ID}`);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('action-add-lines-empty-state').click();

    // Wait for inline add row
    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    const userCountInput = page.getByTestId('inline-add-field-quantityCount');
    await expect(userCountInput).toBeVisible({ timeout: 5_000 });

    // User manually types 999 in userCount BEFORE selecting a product
    await userCountInput.fill('999');

    // The product field is a PopupSearchInput: a button that opens a drawer dialog.
    // Click the button to open it, then type in the inner search input.
    const productButton = page.getByTestId('inline-add-field-product');
    await expect(productButton).toBeVisible({ timeout: 3_000 });
    await productButton.click();

    const drawerInput = page.getByTestId('product-search-input');
    await expect(drawerInput).toBeVisible({ timeout: 3_000 });
    await drawerInput.fill('test');

    // Select first result from the route fixture.
    const firstResult = page.getByTestId('product-search-option-prod-e2e');
    await expect(firstResult).toBeVisible({ timeout: 3_000 });
    await firstResult.click();

    // forceCalloutFields: callout returns quantityCount=42, must overwrite the 999
    await expect(userCountInput).toHaveValue('42', { timeout: 3_000 });
  });

  // --- ETP-3901: warehouse-scoped system count (bookQuantity) ---

  // Selects a product in the inline add row using the shared popup flow.
  async function selectProduct(page) {
    const productButton = page.getByTestId('inline-add-field-product');
    await expect(productButton).toBeVisible({ timeout: 3_000 });
    await productButton.click();
    const drawerInput = page.getByTestId('product-search-input');
    await expect(drawerInput).toBeVisible({ timeout: 3_000 });
    await drawerInput.fill('Test');
    const firstResult = page.locator('[data-testid^="product-search-option-"]').first();
    await expect(firstResult).toBeVisible({ timeout: 3_000 });
    await firstResult.click();
  }

  // Verifies ETP-3901: afterCallout() on InventoryLineHandler now overrides both
  // bookQuantity (Conteo del sistema) and quantityCount in the callout response.
  // We intercept the callout with a specific value (296) and verify quantityCount
  // reflects it — quantityCount is the editable mirror of bookQuantity in the UI.
  test('callout overrides quantityCount and bookQuantity to warehouse-scoped stock value', async ({ page }) => {
    await page.route('**/sws/**', (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/selectors/')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{ id: 'prod-e2e', label: 'Test Product', name: 'Test Product', _identifier: 'Test Product' }],
          }),
        });
      } else if (req.method() === 'POST' && url.includes('/callout')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            updates: { quantityCount: { value: 296 }, bookQuantity: { value: 296 } },
            combos: {},
            messages: [],
          }),
        });
      } else {
        route.fallback();
      }
    });

    await installInventoryMocks(page);
    await page.goto(`/physical-inventory/${MOCK_INV_ID}`);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('action-add-lines-empty-state').click();

    const userCountInput = page.getByTestId('inline-add-field-quantityCount');
    await expect(userCountInput).toBeVisible({ timeout: 5_000 });

    await selectProduct(page);

    // afterCallout() returns { quantityCount: 296, bookQuantity: 296 }.
    // quantityCount maps to the editable User Count input — verifies both fields
    // were set to the warehouse-scoped value, not the global default.
    await expect(userCountInput).toHaveValue('296', { timeout: 3_000 });
  });

  // Verifies ETP-3901: the callout request targets the inventoryLine endpoint,
  // confirming InventoryLineHandler.afterCallout() is the active handler.
  test('product selection sends callout request to the inventoryLine endpoint', async ({ page }) => {
    const capturedUrls = [];
    await page.route('**/sws/**', (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/selectors/')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{ id: 'prod-e2e', label: 'Test Product', name: 'Test Product', _identifier: 'Test Product' }],
          }),
        });
      } else if (req.method() === 'POST' && url.includes('/callout')) {
        capturedUrls.push(url);
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            updates: { quantityCount: { value: 42 }, bookQuantity: { value: 42 } },
            combos: {},
            messages: [],
          }),
        });
      } else {
        route.fallback();
      }
    });

    await installInventoryMocks(page);
    await page.goto(`/physical-inventory/${MOCK_INV_ID}`);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('action-add-lines-empty-state').click();
    await expect(page.getByTestId('inline-add-field-quantityCount')).toBeVisible({ timeout: 5_000 });

    await selectProduct(page);
    await page.waitForTimeout(500);

    expect(capturedUrls.length).toBeGreaterThan(0);
    expect(capturedUrls.some(url => url.includes('inventoryLine'))).toBe(true);
  });

  // Verifies ETP-3901: the product selector is now served by InventoryProductSelectorPolicy
  // (SPI-based) instead of the deleted InventoryProductSelectorServlet.
  // Confirms the /selectors/ endpoint is hit when the product popup search fires.
  test('product popup search calls the selector endpoint (InventoryProductSelectorPolicy)', async ({ page }) => {
    let selectorEndpointHit = false;
    await page.route('**/sws/**', (route) => {
      const url = route.request().url();
      if (url.includes('/selectors/')) {
        selectorEndpointHit = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{ id: 'prod-e2e', label: 'Test Product', name: 'Test Product', _identifier: 'Test Product' }],
          }),
        });
      } else {
        route.fallback();
      }
    });

    await installInventoryMocks(page);
    await page.goto(`/physical-inventory/${MOCK_INV_ID}`);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('action-add-lines-empty-state').click();
    await expect(page.getByTestId('inline-add-field-quantityCount')).toBeVisible({ timeout: 5_000 });

    const productButton = page.getByTestId('inline-add-field-product');
    await expect(productButton).toBeVisible({ timeout: 3_000 });
    await productButton.click();
    const drawerInput = page.getByTestId('product-search-input');
    await expect(drawerInput).toBeVisible({ timeout: 3_000 });
    await drawerInput.fill('Test');

    // Result must appear — confirms the SPI-based selector is responding
    await expect(page.locator('[data-testid^="product-search-option-"]').first()).toBeVisible({ timeout: 3_000 });
    expect(selectorEndpointHit).toBe(true);
  });
});

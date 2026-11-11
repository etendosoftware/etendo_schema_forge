// @covers tools/app-shell/src/windows/custom/product/ProductMovementsTab.jsx
// @covers tools/app-shell/src/windows/custom/product/productMovements.js
// @covers tools/app-shell/src/windows/custom/product/ProductSidebar.jsx
// @covers tools/app-shell/src/windows/custom/product/useStockHistory.js
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Product Movements tab and stock side panel — mocked spec.
 *
 * Guards: the row layout (date + time on one line, type pill + document chip) at a
 * constrained container width, the server-side Type sort request, the two empty
 * states, and the side panel when /stock or the history fails.
 */

const PRODUCT = {
  id: 'PROD-MOV-1',
  searchKey: 'PROD-MOV-1',
  name: 'Stocked product',
  '_identifier': 'Stocked product',
  productType: 'I',
  'productType$_identifier': 'Item',
  stocked: true,
  organization: 'org-1',
  client: 'client-1',
};

const MOVEMENT = {
  id: 'mov-1',
  movementDate: '2026-10-20',
  etgoProcessTime: '2026-10-20T14:35:10',
  movementQuantity: 12,
  movementType: 'V+',
  etgoDocKind: 'goods-receipt',
  etgoDocWindow: 'goods-receipt',
  etgoDocHeaderId: 'doc-1',
  etgoDocLabel: 'GR-0001',
  'etgoWarehouse$_identifier': 'Main warehouse',
  transactionCost: 100,
  etgoStockAfter: 12,
};

const STOCK_ROWS = [{ storageBin: 'LOC1', 'warehouse$_identifier': 'Main warehouse', quantityOnHand: 1530 }];
const HISTORY_ROWS = [{ movementDate: '2026-10-20', movementQuantity: 1530, storageBin: 'LOC1' }];

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const page_ = (data) => ({ response: { data, totalRows: data.length } });

/**
 * Installs the product detail, /stock and /transactions mocks AFTER login() (LIFO route matching).
 * `transactions(url)` decides each answer; every /transactions URL is recorded in `calls`.
 */
async function installMocks(page, { stock = () => [200, page_(STOCK_ROWS)], transactions }, calls) {
  await page.route('**/sws/neo/product/product/**', async (route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET' || /\/selectors\//.test(url)) return route.fallback();
    return json(route, 200, { response: { data: [PRODUCT] } });
  });
  await page.route('**/sws/neo/product/stock**', async (route) => {
    const [status, body] = stock(route.request().url());
    return json(route, status, body);
  });
  await page.route('**/sws/neo/product/transactions**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    const [status, body] = transactions(url);
    return json(route, status, body);
  });
}

async function openMovements(page) {
  await page.goto(`/product/${PRODUCT.id}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('tab-custom:movements').click();
}

test.describe('Product movements tab — layout and sort', () => {
  let calls;

  test.beforeEach(async ({ page }) => {
    calls = [];
    await login(page);
    await installMocks(page, { transactions: () => [200, page_([MOVEMENT])] }, calls);
    await openMovements(page);
  });

  test('keeps date and time on one line and the type pill beside the document chip, even in a narrow container', async ({ page }) => {
    const row = page.getByTestId('product-movements-row').first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    const time = row.getByTestId('product-movements-time');
    await expect(time).toHaveText('14:35');
    const dateBox = await row.getByText('2026', { exact: false }).first().boundingBox();
    const timeBox = await time.boundingBox();
    expect(Math.abs((dateBox.y + dateBox.height / 2) - (timeBox.y + timeBox.height / 2))).toBeLessThan(6);

    const chip = row.getByTestId('product-movements-doc-link');
    await expect(chip).toContainText('GR-0001');
    await expect(chip.locator('svg').first()).toBeVisible();

    // Constrain the container (not the window): the page itself must not grow a horizontal scrollbar
    // and the cells of a row must never overlap each other.
    await page.getByTestId('product-movements-tab').evaluate((el) => { el.style.width = '640px'; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const cells = await row.locator('[role="cell"]').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }));
    for (let i = 1; i < cells.length; i++) expect(cells[i].left).toBeGreaterThanOrEqual(cells[i - 1].right - 1);
  });

  test('sorting by Type sends the label order next to the Type sort and aria-sort follows it', async ({ page }) => {
    await expect(page.getByTestId('product-movements-row').first()).toBeVisible({ timeout: 10_000 });
    expect(calls.some((u) => u.includes('typeLabelOrder'))).toBe(false);

    const typeHeader = page.getByRole('columnheader').nth(1);
    const request = page.waitForRequest((r) => r.url().includes('/transactions') && r.url().includes('typeLabelOrder'));
    await typeHeader.getByRole('button').click();
    const params = new URL((await request).url()).searchParams;
    expect(params.get('_sortBy')).toMatch(/^-?etgoDocKind,/);
    expect(params.get('typeLabelOrder').split(',').sort()).toEqual([
      'customer-return', 'customer-shipment', 'internal-consumption', 'inventory-in',
      'inventory-out', 'transfer', 'vendor-receipt', 'vendor-return',
    ]);
    await expect(typeHeader).toHaveAttribute('aria-sort', /ascending|descending/);
  });
});

test.describe('Product movements tab — empty states', () => {
  test('a product with no movements at all shows the empty state after one probe request', async ({ page }) => {
    const calls = [];
    await login(page);
    await installMocks(page, { transactions: () => [200, page_([])] }, calls);
    await openMovements(page);
    await expect(page.getByTestId('product-movements-empty')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('product-movements-no-results')).toHaveCount(0);
    expect(calls.some((u) => u.includes('_endRow=0') && !u.includes('criteria'))).toBe(true);
  });

  test('filters that match nothing show the no-results state, not the empty one', async ({ page }) => {
    const calls = [];
    const state = { filtered: false };
    await login(page);
    await installMocks(page, {
      // The probe (`_endRow=0`, no criteria) still sees a movement: the product has some, the filters match none.
      transactions: (url) => [200, page_(state.filtered && !url.includes('_endRow=0') ? [] : [MOVEMENT])],
    }, calls);
    await openMovements(page);
    await expect(page.getByTestId('product-movements-row').first()).toBeVisible({ timeout: 10_000 });
    state.filtered = true;
    await page.getByTestId('product-movements-direction').getByRole('button').nth(1).click();
    await expect(page.getByTestId('product-movements-no-results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('product-movements-empty')).toHaveCount(0);
  });
});

test.describe('Product side panel — failed reads', () => {
  test('a /stock 500 shows a dash and the unavailable note, with no chart', async ({ page }) => {
    await login(page);
    await installMocks(page, {
      stock: () => [500, { error: { message: 'boom' } }],
      transactions: () => [200, page_(HISTORY_ROWS)],
    }, []);
    await page.goto(`/product/${PRODUCT.id}`);
    await expect(page.getByTestId('AvailabilityUnavailable')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('StockUnavailableNote')).toBeVisible();
    await expect(page.getByTestId('StockChartExpandButton')).toHaveCount(0);
  });

  test('a failed history keeps the real stock and shows the history note, with no chart', async ({ page }) => {
    await login(page);
    await installMocks(page, { transactions: () => [500, { error: { message: 'boom' } }] }, []);
    await page.goto(`/product/${PRODUCT.id}`);
    await expect(page.getByTestId('StockUnavailableNote')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('AvailabilityUnavailable')).toHaveCount(0);
    await expect(page.getByText('1.530').first()).toBeVisible();
    await expect(page.getByTestId('StockChartExpandButton')).toHaveCount(0);
  });

  test('collapsing the panel leaves the 48 px icon strip', async ({ page }) => {
    await login(page);
    await installMocks(page, { transactions: () => [200, page_(HISTORY_ROWS)] }, []);
    await page.goto(`/product/${PRODUCT.id}`);
    await page.getByTestId('ProductSidebarCollapseButton').click({ timeout: 10_000 });
    const strip = page.getByTestId('ProductSidebarCollapsed');
    await expect(strip).toBeVisible();
    const box = await strip.boundingBox();
    expect(Math.round(box.width)).toBeLessThanOrEqual(48);
  });
});

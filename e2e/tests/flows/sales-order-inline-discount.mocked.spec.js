import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order — Inline discount edit regression tests (mocked).
 *
 * Covers the bug where editing a line's discount inline did NOT derive and
 * send unitPrice = listPrice × (1 - discount/100) in the PATCH request,
 * causing the backend to confirm the order at the pre-discount unit price.
 *
 * Fix: DetailView.jsx onUpdateRow now calls prepareLineForPost(fieldValues)
 * before the PATCH, matching the side-panel save and addRow flows.
 *
 * Routing note: login() installs a catch-all for /sws/**, so installMocks()
 * must run AFTER login() for specific routes to win.
 */

const ORDER_ID = 'mock-order-discount-001';
const LINE_ID = 'mock-line-discount-001';

const LINE = {
  id: LINE_ID,
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Cerveza',
  orderedQuantity: 2,
  listPrice: 23,
  discount: 0,
  unitPrice: 23,
  lineNetAmount: 46,
  lineGrossAmount: 50.6,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 10%',
  'currency$_identifier': 'EUR',
};

const DRAFT_HEADER = {
  id: ORDER_ID,
  documentNo: 'SO-MOCK-DISC-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 50.6,
  summedLineAmount: 46,
  'businessPartner$_identifier': 'Test Client',
  'currency$_identifier': 'EUR',
};

/**
 * Install mocks for the sales-order detail page.
 * Must be called AFTER login() so specific routes win over the catch-all.
 *
 * @param {object} opts
 * @param {function} opts.onPatch  - called with { url, body } on every PATCH to /lines/{id}
 * @param {number}   opts.patchStatus - HTTP status to return for PATCH (default 200)
 */
// Non-matching methods use route.fallback(), NOT route.continue(): continue() sends the
// request to the real network, so a request these handlers do not model reached the live
// backend with the fake E2E token and came back 401. That was harmless while a 401 was
// ignored; since ETP-5022 routes an expired session to the login screen, it logged the test
// out and blanked the page. fallback() defers to login()'s /sws/** catch-all instead, which
// is what the rest of this suite already does.
async function installMocks(page, { onPatch = null, patchStatus = 200 } = {}) {
  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_HEADER] } }),
    });
  });

  await page.route('**/sws/neo/sales-order/lines{/**,}**', async (route) => {
    const method = route.request().method();
    if (method !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [LINE], totalRows: 1 } }),
    });
  });

  await page.route('**/sws/neo/sales-order/lines/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    onPatch?.({ url: req.url(), body });
    if (patchStatus !== 200) {
      await route.fulfill({
        status: patchStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Mocked server error' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ ...LINE, ...body }] } }),
    });
  });
}

/** Open edit mode for the first line by clicking the pencil icon. */
async function openLineEdit(page) {
  const row = page.locator(`[data-testid="line-row-${LINE_ID}"]`);
  await row.dispatchEvent('mouseover');
  await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');
  return row;
}

// ---------------------------------------------------------------------------

test.describe('Sales Order — inline discount regression', () => {
  test('PATCH body includes unitPrice = listPrice × (1 - discount/100)', async ({ page }) => {
    const patches = [];
    await login(page);
    await installMocks(page, { onPatch: (info) => patches.push(info) });
    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const row = await openLineEdit(page);
    const discountField = row.locator('[data-testid="field-discount"]');
    await expect(discountField).toBeVisible({ timeout: 3_000 });

    await discountField.fill('20');
    await discountField.blur();

    await expect.poll(() => patches.length, { timeout: 3_000 }).toBeGreaterThan(0);
    const lastPatch = patches.at(-1);
    expect(lastPatch.url).toContain(`/lines/${LINE_ID}`);

    // listPrice=23, discount=20 → unitPrice = 23 × 0.80 = 18.4
    expect(Number(lastPatch.body.discount)).toBe(20);
    const derivedUnitPrice = Number(lastPatch.body.unitPrice);
    expect(derivedUnitPrice).toBeCloseTo(18.4, 2);
  });

  test('PATCH body includes unitPrice for a different discount value (15%)', async ({ page }) => {
    const patches = [];
    await login(page);
    await installMocks(page, { onPatch: (info) => patches.push(info) });
    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const row = await openLineEdit(page);
    const discountField = row.locator('[data-testid="field-discount"]');
    await expect(discountField).toBeVisible({ timeout: 3_000 });

    await discountField.fill('15');
    await discountField.blur();

    await expect.poll(() => patches.length, { timeout: 3_000 }).toBeGreaterThan(0);
    const lastPatch = patches.at(-1);

    // listPrice=23, discount=15 → unitPrice = 23 × 0.85 = 19.55
    expect(Number(lastPatch.body.discount)).toBe(15);
    const derivedUnitPrice = Number(lastPatch.body.unitPrice);
    expect(derivedUnitPrice).toBeCloseTo(19.55, 2);
  });

  test('success toast appears after committing a discount edit', async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const row = await openLineEdit(page);
    const discountField = row.locator('[data-testid="field-discount"]');
    await expect(discountField).toBeVisible({ timeout: 3_000 });

    await discountField.fill('10');
    await discountField.blur();

    // Sonner renders toasts into a [data-sonner-toaster] region
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /guardado|saved/i }).first();
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('zero-discount edit sends unitPrice equal to listPrice', async ({ page }) => {
    const patches = [];
    // Start with a line that already has a discount applied so we can clear it.
    const lineWithDiscount = { ...LINE, discount: 20, unitPrice: 18.4 };
    await login(page);

    await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [DRAFT_HEADER] } }),
      });
    });
    await page.route('**/sws/neo/sales-order/lines{/**,}**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [lineWithDiscount], totalRows: 1 } }),
      });
    });
    await page.route('**/sws/neo/sales-order/lines/**', async (route) => {
      const req = route.request();
      if (req.method() !== 'PATCH') return route.fallback();
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      patches.push({ url: req.url(), body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...lineWithDiscount, ...body }] } }),
      });
    });

    await page.goto(`/sales-order/${ORDER_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });

    const row = await openLineEdit(page);
    const discountField = row.locator('[data-testid="field-discount"]');
    await expect(discountField).toBeVisible({ timeout: 3_000 });

    await discountField.fill('0');
    await discountField.blur();

    await expect.poll(() => patches.length, { timeout: 3_000 }).toBeGreaterThan(0);
    const lastPatch = patches.at(-1);

    // discount=0 → unitPrice = listPrice = 23
    expect(Number(lastPatch.body.discount)).toBe(0);
    const derivedUnitPrice = Number(lastPatch.body.unitPrice);
    expect(derivedUnitPrice).toBeCloseTo(23, 2);
  });
});

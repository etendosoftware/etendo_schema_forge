import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Invoice — Import from Shipment: no page-reload after success (mocked).
 *
 * Covers the regression where onSuccess() called window.location.reload(),
 * which preserved location.state.openImportModal = true in browser history.
 * DetailView's useEffect detected that flag on the reloaded page and
 * re-opened the import modal immediately.
 *
 * Fix: replaced window.location.reload() with onRefresh?.() which only
 * re-fetches the invoice lines without a full page reload, so the modal
 * does not re-open.
 *
 * Routing note: login() installs a catch-all for /sws/**, so installMocks()
 * must run AFTER login() for specific routes to win.
 */

const INVOICE_ID = 'mock-inv-import-001';
const BP_ID = 'bp-mock-001';
const SHIPMENT_ID = 'ship-mock-001';
const SHIP_LINE_ID = 'ship-line-001';

const INVOICE_HEADER = {
  id: INVOICE_ID,
  documentNo: 'INV-MOCK-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  // Document type is a required header field; the add-lines / import buttons
  // stay hidden until it is set. Field renamed to transactionDocument in ETP-4299.
  transactionDocument: 'doctype-mock-001',
  'transactionDocument$_identifier': 'AR Invoice',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Test Client',
  partnerAddress: 'addr-mock-001',
  invoiceDate: '2026-05-01',
  paymentTerms: 'pt-mock-001',
  paymentMethod: 'pm-mock-001',
  priceList: 'pl-mock-001',
  grandTotalAmount: 0,
  summedLineAmount: 0,
  'currency$_identifier': 'EUR',
};

const SHIPMENT = {
  id: SHIPMENT_ID,
  documentNo: 'SHIP-MOCK-001',
  documentStatus: 'CO',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Test Client',
  movementDate: '2026-05-01',
  invoiced: false,
};

const SHIP_LINE = {
  id: SHIP_LINE_ID,
  product: 'prod-001',
  'product$_identifier': 'Cerveza',
  movementQuantity: 2,
  salesOrderLine: null,
};

/**
 * Install mocks for the invoice detail + import flow.
 * Must be called AFTER login() so specific routes win over the catch-all.
 */
async function installMocks(page) {
  // Invoice header — detail page fetch
  await page.route(`**/sws/neo/sales-invoice/header/${INVOICE_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [INVOICE_HEADER] } }),
    });
  });

  // Goods-shipment list — ImportFromShipmentModal.fetchDocuments
  await page.route('**/sws/neo/goods-shipment/goodsShipment**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [SHIPMENT] } }),
    });
  });

  // Goods-shipment lines — ImportFromShipmentModal.fetchLines
  await page.route('**/sws/neo/goods-shipment/goodsShipmentLine**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [SHIP_LINE] } }),
    });
  });
}

test.describe('Sales Invoice — import from shipment no-reload', () => {
  test('modal closes after a successful import and does not re-open', async ({ page }) => {
    await login(page);
    await installMocks(page);

    await page.goto(`/sales-invoice/${INVOICE_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Empty state with the import button should be visible
    const importBtn = page.getByText(/Import.*Shipment|Importar.*envío/i).first();
    await expect(importBtn).toBeVisible({ timeout: 8_000 });
    await importBtn.click();

    // Modal opens and shows the shipment document
    const modalTitle = page.getByText(/Import.*Shipment|Importar.*envío/i).first();
    await expect(modalTitle).toBeVisible({ timeout: 5_000 });

    const shipmentRow = page.getByText(/SHIP-MOCK-001/i).first();
    await expect(shipmentRow).toBeVisible({ timeout: 5_000 });

    // Expand the shipment to load its lines
    await shipmentRow.click();

    // Wait for lines to load inside the modal
    const lineRow = page.getByText(/Cerveza/i).first();
    await expect(lineRow).toBeVisible({ timeout: 5_000 });

    // ETP-4299: ImportLinesModal no longer auto-selects lines — click the checkbox.
    await page.getByRole('checkbox').last().click();

    // Click the import button
    const importSelectedBtn = page.getByRole('button', { name: /Import.*selected|Importar.*seleccionadas/i });
    await expect(importSelectedBtn).toBeEnabled({ timeout: 3_000 });
    await importSelectedBtn.click();

    // After import the modal must disappear
    const modal = page.locator('[data-testid="import-lines-modal"], .fixed.inset-0.z-50').first();
    // The modal is rendered with class "fixed inset-0 z-50" — wait for it to be gone
    await expect(page.locator('.fixed.inset-0.z-50')).toHaveCount(0, { timeout: 5_000 });

    // Wait a bit and confirm the modal does NOT re-open
    await page.waitForTimeout(600);
    await expect(page.locator('.fixed.inset-0.z-50')).toHaveCount(0);
  });

  test('window.location.reload is NOT called after a successful import', async ({ page }) => {
    // Inject a spy before the page boots so it catches any reload call.
    await page.addInitScript(() => {
      window.__reloadCallCount = 0;
      const descriptor = Object.getOwnPropertyDescriptor(window.location, 'reload');
      try {
        Object.defineProperty(window.location, 'reload', {
          configurable: true,
          writable: true,
          value: function reloadSpy(...args) {
            window.__reloadCallCount += 1;
            if (descriptor?.value) descriptor.value.apply(this, args);
          },
        });
      } catch {
        // Some browsers protect window.location.reload — fall back to wrapping via prototype
        const origReload = window.location.reload.bind(window.location);
        window.location.reload = function reloadSpy(...args) {
          window.__reloadCallCount += 1;
          origReload(...args);
        };
      }
    });

    await login(page);
    await installMocks(page);

    await page.goto(`/sales-invoice/${INVOICE_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const importBtn = page.getByText(/Import.*Shipment|Importar.*envío/i).first();
    await expect(importBtn).toBeVisible({ timeout: 8_000 });
    await importBtn.click();

    await expect(page.getByText(/SHIP-MOCK-001/i).first()).toBeVisible({ timeout: 5_000 });
    await page.getByText(/SHIP-MOCK-001/i).first().click();
    await expect(page.getByText(/Cerveza/i).first()).toBeVisible({ timeout: 5_000 });

    // ETP-4299: ImportLinesModal no longer auto-selects lines — click the checkbox.
    await page.getByRole('checkbox').last().click();

    const importSelectedBtn = page.getByRole('button', { name: /Import.*selected|Importar.*seleccionadas/i });
    await expect(importSelectedBtn).toBeEnabled({ timeout: 3_000 });
    await importSelectedBtn.click();

    // Give the success handler a moment to fire
    await page.waitForTimeout(800);

    const reloadCount = await page.evaluate(() => window.__reloadCallCount ?? 0);
    expect(reloadCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Discount carry-over: lines imported from a shipment inherit the discount
// from the originating sales order line (etgoDiscount on the invoice line).
// ---------------------------------------------------------------------------

const ORDER_LINE_ID = 'order-line-discount-001';
const SHIP_LINE_WITH_ORDER = {
  id: 'ship-line-disc-001',
  product: 'prod-001',
  'product$_identifier': 'Cerveza',
  movementQuantity: 2,
  salesOrderLine: ORDER_LINE_ID,
};
const ORDER_LINE_WITH_DISCOUNT = {
  id: ORDER_LINE_ID,
  product: 'prod-001',
  orderedQuantity: 2,
  listPrice: 23,
  unitPrice: 20.7,
  discount: 10,
  lineGrossAmount: 45.54,
};

test.describe('Sales Invoice — import from shipment discount carry-over', () => {
  test('imported invoice line carries etgoDiscount from the originating order line', async ({ page }) => {
    const invoiceLinePosts = [];

    await login(page);

    // Invoice header
    await page.route(`**/sws/neo/sales-invoice/header/${INVOICE_ID}`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [INVOICE_HEADER] } }),
      });
    });

    // Shipment list
    await page.route('**/sws/neo/goods-shipment/goodsShipment**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SHIPMENT] } }),
      });
    });

    // Shipment lines — line WITH a salesOrderLine reference
    await page.route('**/sws/neo/goods-shipment/goodsShipmentLine**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SHIP_LINE_WITH_ORDER] } }),
      });
    });

    // Sales order line — returns 10% discount
    await page.route(`**/sws/neo/sales-order/lines/${ORDER_LINE_ID}`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ORDER_LINE_WITH_DISCOUNT] } }),
      });
    });

    // Capture the POST that creates the invoice line
    await page.route('**/sws/neo/sales-invoice/lines', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
      invoiceLinePosts.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'new-inv-line-001', ...body }] } }),
      });
    });

    await page.goto(`/sales-invoice/${INVOICE_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const importBtn = page.getByText(/Import.*Shipment|Importar.*envío/i).first();
    await expect(importBtn).toBeVisible({ timeout: 8_000 });
    await importBtn.click();

    await expect(page.getByText(/SHIP-MOCK-001/i).first()).toBeVisible({ timeout: 5_000 });
    await page.getByText(/SHIP-MOCK-001/i).first().click();
    await expect(page.getByText(/Cerveza/i).first()).toBeVisible({ timeout: 5_000 });

    // ETP-4299: ImportLinesModal no longer auto-selects lines — click the checkbox.
    await page.getByRole('checkbox').last().click();

    const importSelectedBtn = page.getByRole('button', { name: /Import.*selected|Importar.*seleccionadas/i });
    await expect(importSelectedBtn).toBeEnabled({ timeout: 3_000 });
    await importSelectedBtn.click();

    // Wait for the POST to fire
    await expect.poll(() => invoiceLinePosts.length, { timeout: 5_000 }).toBeGreaterThan(0);

    const posted = invoiceLinePosts[0];
    // The invoice line must carry etgoDiscount=10 from the order line.
    // This is the critical assertion — the discount field on C_OrderLine is mapped
    // to etgoDiscount on the invoice line so the backend sees the correct discount.
    expect(Number(posted.etgoDiscount)).toBe(10);
    // The POST must also include the salesOrderLine reference so re-import detection works.
    expect(posted.cOrderlineId).toBe(ORDER_LINE_ID);
  });
});

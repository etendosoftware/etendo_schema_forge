import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Quotation — convert to Sales Order with preserved prices (ETP-4027, mocked).
 *
 * The SalesQuotationHeaderHandler now calls convertQuotationIntoSalesOrder(false, id)
 * so prices from the quotation are not recalculated from the price list.
 *
 * Scenarios:
 *   A. Confirm modal appears when the sales-quotation:open-confirm-modal event fires.
 *   B. Confirming "Crear Pedido" fires a POST to the Convertquotation action.
 *   C. The total from the quotation is visible in the modal before confirming.
 *   D. On success, the modal shows the document number of the newly created order.
 */

const QUOT_ID = 'quot-convert-prices-001';
const NEW_ORDER_ID = 'new-order-001';

const QUOTATION = {
  id: QUOT_ID,
  documentNo: 'QUOT-ETP4027-001',
  documentStatus: 'UE',
  'documentStatus$_identifier': 'Under Evaluation',
  orderDate: '2026-01-15',
  validUntil: '2026-06-15',
  businessPartner: 'bp-001',
  'businessPartner$_identifier': 'Test Customer SA',
  partnerAddress: 'addr-001',
  'partnerAddress$_identifier': 'Main Address',
  priceList: 'pl-001',
  'priceList$_identifier': 'Standard Sales Price List',
  paymentMethod: 'pm-001',
  'paymentMethod$_identifier': 'Cash',
  paymentTerms: 'pt-001',
  'paymentTerms$_identifier': '30 Days',
  currency: '100',
  'currency$_identifier': 'USD',
  grandTotalAmount: 1250.00,
  summedLineAmount: 1000.00,
  etgoTotalDiscount: 0,
  processed: true,
};

const NEW_ORDER = {
  id: NEW_ORDER_ID,
  documentNo: 'SO-NEW-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Draft',
  grandTotalAmount: 1250.00,
  currency: '100',
  'currency$_identifier': 'USD',
};

const QUOTATION_LINES = [
  {
    id: 'quot-line-001',
    product: 'prod-001',
    'product$_identifier': 'Test Widget',
    orderedQuantity: 5,
    listPrice: 200,
    discount: 0,
    lineGrossAmount: 1000,
  },
];

/**
 * Install all mocks for the sales-quotation detail view + Convertquotation flow.
 * Must be called AFTER login().
 *
 * @param {object} state - Mutable state object to track call counts.
 */
async function installQuotationMocks(page, state) {
  await page.route('**/sws/neo/sales-quotation/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const segments = url.pathname.split('/').filter(Boolean);
    const idx = segments.indexOf('sales-quotation');
    const entity = segments[idx + 1];
    const idOrSubpath = segments[idx + 2];
    const action = segments[idx + 4];

    // quotationLine — return lines
    if (entity === 'quotationLine' && req.method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: QUOTATION_LINES } }),
      });
      return;
    }

    // defaults endpoint
    if ((entity === 'quotation' || entity === 'header') && req.method() === 'GET' && idOrSubpath === 'defaults') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ defaults: { orderDate: '2026-01-15' } }),
      });
      return;
    }

    // Detail GET
    if ((entity === 'quotation' || entity === 'header') && req.method() === 'GET' && idOrSubpath === QUOT_ID) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [QUOTATION] } }),
      });
      return;
    }

    // List GET
    if ((entity === 'quotation' || entity === 'header') && req.method() === 'GET' && !idOrSubpath) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [QUOTATION], totalRows: 1 } }),
      });
      return;
    }

    // Convertquotation action
    if (entity === 'quotation' && req.method() === 'POST' && action === 'Convertquotation') {
      state.convertCalls += 1;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    route.fallback();
  });

  // Sales order mock — used by QuotationConfirmModal to find the created order
  await page.route('**/sws/neo/sales-order/header**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      // Detail fetch by ID
      const idMatch = req.url().match(/\/header\/([^/?]+)/);
      if (idMatch) {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ response: { data: [NEW_ORDER] } }),
        });
      } else {
        // List fetch (criteria search for quotation link)
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ response: { data: [NEW_ORDER], totalRows: 1 } }),
        });
      }
      return;
    }
    route.fallback();
  });
}

/**
 * Dispatch the custom event that opens the QuotationConfirmModal and wait for it.
 * Retries up to 5 times with 1-second intervals (matches pattern in etp4006 spec).
 */
async function openConfirmModal(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });

  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sales-quotation:open-confirm-modal'));
    });
    try {
      await expect(page.getByTestId('confirm-summary-total')).toBeVisible({ timeout: 1_000 });
      return;
    } catch {
      if (attempt === 4) throw new Error('confirm modal did not appear after 5 attempts');
    }
  }
}

async function clearServiceWorkerState(page) {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  });
}

test.describe('Sales Quotation — convert to order with preserved prices (ETP-4027)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await clearServiceWorkerState(page);
  });

  test('A: confirm modal appears when open-confirm-modal event is dispatched', async ({ page }) => {
    const state = { convertCalls: 0 };
    await installQuotationMocks(page, state);

    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await openConfirmModal(page);

    // The modal must be visible with the selection options
    await expect(page.getByTestId('confirm-option-order')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('confirm-option-invoice')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByTestId('action-confirm-modal')).toBeVisible({ timeout: 3_000 });
  });

  test('C: modal shows the quotation total before confirming', async ({ page }) => {
    const state = { convertCalls: 0 };
    await installQuotationMocks(page, state);

    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await openConfirmModal(page);

    // grandTotalAmount = 1250 — formatted as "1,250.00" or "1.250,00" depending on locale
    const totalEl = page.getByTestId('confirm-summary-total');
    await expect(totalEl).toBeVisible({ timeout: 5_000 });
    await expect(totalEl).toContainText('1');      // at minimum starts with 1
    await expect(totalEl).toContainText('250');    // contains 250
  });

  test('B: confirming "Crear Pedido" POSTs to Convertquotation action', async ({ page }) => {
    const state = { convertCalls: 0 };
    await installQuotationMocks(page, state);

    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await openConfirmModal(page);

    // Order option is selected by default
    await expect(page.getByTestId('confirm-option-order')).toBeVisible({ timeout: 3_000 });

    // Click confirm
    await page.getByTestId('action-confirm-modal').click();

    // Wait for Convertquotation to be called
    await expect.poll(() => state.convertCalls, { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
  });

  test('D: success state shows the document number of the new sales order', async ({ page }) => {
    const state = { convertCalls: 0 };
    await installQuotationMocks(page, state);

    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await openConfirmModal(page);

    // Confirm to trigger the flow
    await page.getByTestId('action-confirm-modal').click();

    // After success the modal transitions to a success state showing the new docNo
    // QuotationConfirmModal sets createdDoc.documentNo = order.documentNo from the
    // sales-order/header list response which returns NEW_ORDER (documentNo: 'SO-NEW-001')
    await expect(page.getByText('SO-NEW-001')).toBeVisible({ timeout: 8_000 });
  });
});

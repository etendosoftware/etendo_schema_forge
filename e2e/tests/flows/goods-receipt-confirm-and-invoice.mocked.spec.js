import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Goods Receipt — Confirm & Invoice flows (mocked) — ETP-5063
 *
 * Mirrors goods-shipment-confirm-and-invoice.mocked.spec.js's structure on the
 * purchase side. There was no prior mocked spec exercising GoodsReceiptActions'
 * confirm flow, so this file covers both:
 *
 *   1. The bug fix — a confirm that creates NO related purchase invoice must
 *      show a toast, never the old blocking ConfirmResultModal (covers both
 *      the "toggle off" path and the "already fully invoiced" path).
 *   2. The regression guard — a confirm that DOES create an invoice must
 *      still show the ConfirmResultModal exactly as before, with a working
 *      "Ver factura" navigation button.
 *
 * No backend required — all API calls are intercepted after login() (LIFO
 * order). Route isolation: "goodsReceiptLine" URLs must NOT be captured by
 * the "goodsReceipt" handler (the entity name is a prefix of the line entity
 * name) — URL predicate functions avoid the substring collision, same as the
 * goods-shipment spec.
 */

function makeReceipt(overrides) {
  return {
    id: 'mock-gr-001',
    documentNo: 'GR-TEST-001',
    documentStatus: 'DR',
    'documentStatus$_identifier': 'Borrador',
    processed: false,
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Vendor',
    movementDate: '2026-05-01',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'Almacén Principal',
    invoiceStatus: 0,
    returnStatus: 0,
    grandTotalAmount: 500,
    'currency$_identifier': 'EUR',
    linkedOrders: [],
    linkedInvoices: [],
    ...overrides,
  };
}

/**
 * Install a mock for the goods-receipt entity endpoints (lines + header).
 * Must be called AFTER login() so it takes priority over the generic
 * /sws/** catch-all.
 */
async function installGoodsReceiptMock(page, records) {
  // Lines endpoint — installed FIRST (lower LIFO priority). Returns empty.
  await page.route(
    (url) => url.href.includes('/sws/neo/goods-receipt/goodsReceiptLine'),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      route.fallback();
    }
  );

  // Header entity (list + detail) — installed SECOND (higher LIFO priority).
  await page.route(
    (url) =>
      url.href.includes('/sws/neo/goods-receipt/goodsReceipt') &&
      !url.href.includes('/goodsReceiptLine'),
    async (route) => {
      const req = route.request();
      const url = req.url();

      if (req.method() !== 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [] } }),
        });
        return;
      }

      const detailMatch = url.match(/\/goodsReceipt\/([^/?]+)(\?.*)?$/);
      if (
        detailMatch &&
        !['evaluate-display', 'defaults', 'selectors', 'action'].includes(detailMatch[1])
      ) {
        const id = detailMatch[1];
        const found = records.find((r) => r.id === id) ?? records[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [found] } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: records, totalRows: records.length } }),
      });
    }
  );
}

test.describe('Goods Receipt — Confirm without invoice (ETP-5063 toast fix)', () => {
  test('unchecking the invoice toggle and confirming shows a toast, never the result modal, and refreshes the header', async ({ page }) => {
    const receipt = makeReceipt({
      id: 'gr-nodoc-toggle-001',
      documentNo: 'GR-NODOC-TOGGLE-001',
      'businessPartner$_identifier': 'Proveedor Sin Factura S.L.',
      linkedOrders: [
        { id: 'po-nodoc-001', grandTotalAmount: 500, 'currency$_identifier': 'EUR' },
      ],
    });

    let headerGetCount = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (
        req.method() === 'GET' &&
        url.includes(`/sws/neo/goods-receipt/goodsReceipt/${receipt.id}`) &&
        !url.includes('goodsReceiptLine')
      ) {
        headerGetCount += 1;
      }
    });

    await login(page);
    await installGoodsReceiptMock(page, [receipt]);

    let documentActionCalls = 0;
    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-receipt/goodsReceipt/${receipt.id}/action/documentAction`),
      async (route) => {
        documentActionCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    let createPurchaseInvoiceCalls = 0;
    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-receipt/goodsReceipt/${receipt.id}/action/createPurchaseInvoice`),
      async (route) => {
        createPurchaseInvoiceCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-should-not-be-created', documentNo: 'SHOULD-NOT-EXIST', grandTotalAmount: 500 } },
          }),
        });
      }
    );

    await page.goto(`/goods-receipt/${receipt.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await expect.poll(() => headerGetCount, { timeout: 8_000 }).toBeGreaterThan(0);
    const countBeforeConfirm = headerGetCount;

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'))
    );

    await expect(page.getByTestId('confirm-inout-modal')).toBeVisible({ timeout: 8_000 });
    const invoiceToggle = page.getByTestId('confirm-modal-invoice-toggle');
    // ETP-4848: defaults to checked — uncheck it to exercise the no-doc path.
    await expect(invoiceToggle).toHaveAttribute('aria-checked', 'true');
    await invoiceToggle.click();
    await expect(invoiceToggle).toHaveAttribute('aria-checked', 'false');

    await page.getByTestId('confirm-modal-confirm-btn').click();

    // Wait for the async confirm flow to fully resolve (documentAction fetch
    // + the ETP-5063 useEffect firing the toast) before asserting on its side
    // effects — a synchronous check right after click() would race the
    // in-flight fetch and read stale counters.
    const successToast = page.locator('[data-type="success"]').first();
    await expect(successToast).toBeVisible({ timeout: 5_000 });

    // A success toast communicates the outcome, with the exact resolved
    // goodsReceipt.confirmModal.confirmedTitle text (es_ES: "Albarán de
    // compra confirmado").
    await expect(successToast).toContainText('Albarán de compra confirmado');

    // No invoice was requested — createPurchaseInvoice must never be called —
    // and the old blocking ConfirmResultModal must never appear.
    expect(createPurchaseInvoiceCalls).toBe(0);
    await expect(page.getByTestId('confirm-result-modal')).toHaveCount(0);
    expect(documentActionCalls).toBe(1);

    // onRefresh?.() actually ran — proven by a second header GET after
    // confirm, not just by the toast text being right.
    await expect.poll(() => headerGetCount, { timeout: 5_000 }).toBeGreaterThan(countBeforeConfirm);
  });

  test('confirming an already fully-invoiced receipt shows a toast, never the result modal', async ({ page }) => {
    const invoicedReceipt = makeReceipt({
      id: 'gr-already-invoiced-001',
      documentNo: 'GR-ALREADYINV-001',
      invoiceStatus: 100,
      'businessPartner$_identifier': 'Proveedor Ya Facturado S.L.',
      linkedInvoices: [
        { id: 'inv-existing-001', documentNo: 'PFAC-EXISTING-001', documentStatus: 'CO', grandTotalAmount: 500, 'currency$_identifier': 'EUR' },
      ],
    });

    let headerGetCount = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (
        req.method() === 'GET' &&
        url.includes(`/sws/neo/goods-receipt/goodsReceipt/${invoicedReceipt.id}`) &&
        !url.includes('goodsReceiptLine')
      ) {
        headerGetCount += 1;
      }
    });

    await login(page);
    await installGoodsReceiptMock(page, [invoicedReceipt]);

    let documentActionCalls = 0;
    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-receipt/goodsReceipt/${invoicedReceipt.id}/action/documentAction`),
      async (route) => {
        documentActionCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    await page.goto(`/goods-receipt/${invoicedReceipt.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await expect.poll(() => headerGetCount, { timeout: 8_000 }).toBeGreaterThan(0);
    const countBeforeConfirm = headerGetCount;

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'))
    );

    // Fully-invoiced branch renders ConfirmReceiptInvoicedModal, whose
    // confirm button reads goodsReceipt.confirmModal.confirmBtn = "Confirmar"
    // — the SAME text as the topbar's own "action-save" button (unrelated,
    // pre-existing coincidence: draftMode's Save button is also labeled
    // "Confirmar" for this window). The modal is portal-appended to the end
    // of <body>, so it is the LAST DOM match for this exact name.
    const confirmBtn = page.getByRole('button', { name: 'Confirmar', exact: true }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 8_000 });
    await confirmBtn.click();

    const successToast = page.locator('[data-type="success"]').first();
    await expect(successToast).toBeVisible({ timeout: 5_000 });
    await expect(successToast).toContainText('Albarán de compra confirmado');

    await expect(page.getByTestId('confirm-result-modal')).toHaveCount(0);
    expect(documentActionCalls).toBe(1);

    await expect.poll(() => headerGetCount, { timeout: 5_000 }).toBeGreaterThan(countBeforeConfirm);
  });

  test('regression guard: confirming WITH the invoice toggle on still shows the result modal with a working "Ver factura" navigation button', async ({ page }) => {
    const receipt = makeReceipt({
      id: 'gr-withdoc-confirm-001',
      documentNo: 'GR-WITHDOC-001',
      'businessPartner$_identifier': 'Proveedor Con Factura S.L.',
      linkedOrders: [
        { id: 'po-withdoc-001', grandTotalAmount: 700, 'currency$_identifier': 'EUR' },
      ],
      resolvedPriceListId: 'pl-withdoc',
    });

    await login(page);
    await installGoodsReceiptMock(page, [receipt]);

    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-receipt/goodsReceipt/${receipt.id}/action/documentAction`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: { documentStatus: 'CO' } } }),
        });
      }
    );

    await page.route(
      (url) =>
        url.href.includes(`/sws/neo/goods-receipt/goodsReceipt/${receipt.id}/action/createPurchaseInvoice`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'inv-withdoc-001', documentNo: 'PFAC-WITHDOC-001', grandTotalAmount: 700 } },
          }),
        });
      }
    );

    await page.route('**/sws/neo/price-list/priceList{/**,}**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: [{ id: 'pl-withdoc', name: 'Tarifa compra', active: true, purchasePriceList: true, default: true }] },
        }),
      });
    });

    await page.goto(`/goods-receipt/${receipt.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'))
    );

    await expect(page.getByTestId('confirm-inout-modal')).toBeVisible({ timeout: 8_000 });
    // Invoice toggle stays checked (default true) — do NOT uncheck it.
    await expect(page.getByTestId('confirm-modal-invoice-toggle')).toHaveAttribute('aria-checked', 'true');

    const confirmBtn = page.getByTestId('confirm-modal-confirm-btn');
    await expect(confirmBtn).toBeEnabled({ timeout: 8_000 });
    await confirmBtn.click();

    // Doc WAS created — the ConfirmResultModal must still render exactly as
    // before this fix, with its "Ver factura" navigation button.
    await expect(page.getByTestId('confirm-result-modal')).toBeVisible({ timeout: 8_000 });
    const viewInvoiceBtn = page.getByRole('button', { name: 'Ver factura' });
    await expect(viewInvoiceBtn).toBeVisible();
  });
});

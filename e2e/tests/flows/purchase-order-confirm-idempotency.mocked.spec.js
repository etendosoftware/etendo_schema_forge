import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { installHeaderConfirmMock } from '../helpers/confirmMocks.js';

/**
 * Purchase Order — Confirm Modal Idempotency (mocked).
 *
 * Mirror of sales-order-confirm-idempotency.mocked.spec.js for the
 * purchase-order ConfirmModal that lives in PurchaseOrderActions.jsx.
 *
 * Verifies:
 *   - receipt OK + invoice fails → retry must NOT call createGoodsReceipt again
 *   - invoice OK + receipt fails → retry must NOT call createPurchaseInvoice again
 *   - documentAction=CO is NEVER called twice across attempts
 *
 * Steps 2 and 3 run INDEPENDENTLY — a failure on createGoodsReceipt must not
 * prevent createPurchaseInvoice from being attempted. Each step has its own
 * try/catch and the modal aggregates the errors at the end.
 */

const ORDER_ID = 'idem-mock-po-001';
const RECEIPT_ID = 'idem-mock-receipt-001';
const INVOICE_ID = 'idem-mock-pinvoice-001';

const DRAFT_HEADER = {
  id: ORDER_ID,
  documentNo: '2000999',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 200,
  summedLineAmount: 200,
  totalLines: 200,
  'businessPartner$_identifier': 'Test Vendor',
  'currency$_identifier': 'EUR',
};

const ONE_LINE = {
  id: 'po-line-001',
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  orderedQuantity: 2,
  listPrice: 100,
  lineGrossAmount: 200,
};

async function installConfirmMocks(page, state) {
  // Header GET/PATCH — shared helper (see confirmMocks.js for the ETP-4468
  // rationale on why the PATCH/PUT echo is required).
  await installHeaderConfirmMock(page, {
    spec: 'purchase-order',
    recordId: ORDER_ID,
    record: DRAFT_HEADER,
  });

  // Lines GET
  await page.route('**/sws/neo/purchase-order/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [ONE_LINE] } }),
    });
  });

  // Step 1 — documentAction=CO
  await page.route(
    `**/sws/neo/purchase-order/header/${ORDER_ID}/action/documentAction`,
    async (route) => {
      state.calls.documentAction += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: { id: ORDER_ID, documentNo: DRAFT_HEADER.documentNo, documentStatus: 'CO' } },
        }),
      });
    },
  );

  // Step 2 — createGoodsReceipt
  await page.route(
    `**/sws/neo/purchase-order/header/${ORDER_ID}/action/createGoodsReceipt`,
    async (route) => {
      state.calls.createGoodsReceipt += 1;
      if (state.failNext.receipt) {
        state.failNext.receipt = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ response: { message: 'simulated receipt failure' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              id: RECEIPT_ID,
              documentNo: 'REC-001',
              grandTotalAmount: 200,
            },
          },
        }),
      });
    },
  );

  // Step 3 — createPurchaseInvoice
  await page.route(
    `**/sws/neo/purchase-order/header/${ORDER_ID}/action/createPurchaseInvoice`,
    async (route) => {
      state.calls.createPurchaseInvoice += 1;
      if (state.failNext.invoice) {
        state.failNext.invoice = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ response: { message: 'simulated invoice failure' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              id: INVOICE_ID,
              documentNo: 'PINV-001',
              grandTotalAmount: 200,
            },
          },
        }),
      });
    },
  );
}

async function openConfirmAndTickBoth(page) {
  // Wait for DetailView (and its topbarRight PurchaseOrderActions) to mount
  // before dispatching — domcontentloaded fires before React renders.
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });

  // Retry dispatching the event in case PurchaseOrderActions listener
  // hasn't been registered yet (useEffect runs after paint).
  const receiptCard = page.getByText(/Crear albarán|Crear recepción|Create receipt/i).first();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('purchase-order:open-confirm-modal'));
    });
    try {
      await expect(receiptCard).toBeVisible({ timeout: 1000 });
      break;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }

  const invoiceCard = page.getByText(/Crear factura|Create invoice/i).first();
  await expect(invoiceCard).toBeVisible();

  await receiptCard.click();
  await invoiceCard.click();
}

async function clickConfirm(page) {
  await page.getByTestId('action-confirm-modal').click();
}

test.describe('Purchase Order — Confirm Modal idempotency (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('receipt succeeds, invoice fails — retry only re-runs the invoice step', async ({ page }) => {
    const state = {
      calls: { documentAction: 0, createGoodsReceipt: 0, createPurchaseInvoice: 0 },
      failNext: { receipt: false, invoice: true },
    };
    await installConfirmMocks(page, state);

    await page.goto(`/purchase-order/${ORDER_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openConfirmAndTickBoth(page);
    await clickConfirm(page);

    await expect(page.getByText(/simulated invoice failure/i)).toBeVisible({ timeout: 5000 });
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createGoodsReceipt).toBe(1);
    expect(state.calls.createPurchaseInvoice).toBe(1);

    await expect(page.getByText(/Ya creado|Already created/i)).toBeVisible();

    await clickConfirm(page);

    // Match the exact confirmed-result title ("Pedido de compra confirmado" /
    // "Purchase order confirmed"), NOT a loose `.*` pattern — the still-open
    // ConfirmModal's own static content (title "Confirmar pedido #X" + the
    // "Una vez confirmado..." warning banner) concatenates to a false match
    // for /Pedido.*confirmado/i, resolving toBeVisible() before the retry's
    // createPurchaseInvoice request actually completes.
    await expect(page.getByText(/Pedido de compra confirmado|Purchase order confirmed/i)).toBeVisible({ timeout: 5000 });

    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createGoodsReceipt).toBe(1);
    expect(state.calls.createPurchaseInvoice).toBe(2);

    await expect(page.getByText(/REC-001/)).toBeVisible();
    await expect(page.getByText(/PINV-001/)).toBeVisible();
  });

  test('invoice succeeds, receipt fails — retry only re-runs the receipt step', async ({ page }) => {
    const state = {
      calls: { documentAction: 0, createGoodsReceipt: 0, createPurchaseInvoice: 0 },
      failNext: { receipt: true, invoice: false },
    };
    await installConfirmMocks(page, state);

    await page.goto(`/purchase-order/${ORDER_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openConfirmAndTickBoth(page);
    await clickConfirm(page);

    // First attempt: documentAction + (failed) createGoodsReceipt + (independent) createPurchaseInvoice
    // The receipt failure must NOT block the invoice — both steps are independent.
    await expect(page.getByText(/simulated receipt failure/i)).toBeVisible({ timeout: 5000 });
    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createGoodsReceipt).toBe(1);
    expect(state.calls.createPurchaseInvoice).toBe(1);

    // Invoice succeeded silently in the same attempt — its card must now be locked
    await expect(page.getByText(/Ya creado|Already created/i)).toBeVisible();

    // Retry — receipt mock now succeeds, invoice is locked and skipped by the !invoiceResult guard
    await clickConfirm(page);

    // See the exact-phrase note above — avoid the `.*` false match against the
    // still-open ConfirmModal's own title + warning banner text.
    await expect(page.getByText(/Pedido de compra confirmado|Purchase order confirmed/i)).toBeVisible({ timeout: 5000 });

    expect(state.calls.documentAction).toBe(1);
    expect(state.calls.createGoodsReceipt).toBe(2);
    expect(state.calls.createPurchaseInvoice).toBe(1);

    await expect(page.getByText(/REC-001/)).toBeVisible();
    await expect(page.getByText(/PINV-001/)).toBeVisible();
  });

});

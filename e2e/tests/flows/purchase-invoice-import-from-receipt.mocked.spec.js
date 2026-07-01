import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Purchase Invoice — Import from Goods Receipt (mocked).
 *
 * Covers:
 *   1. Single line — POST body matches original PO values resolved via callout
 *   2. Secondary text shows the PO reference from the receipt header
 *   3. Already-imported receipt lines are grayed and show "already imported" label
 *
 * Note: "completing a receipt" is not tested here because that flow may not be
 * implemented yet. Tests start from a pre-mocked completed (CO) goods receipt.
 *
 * Routing note: login() installs a catch-all for /sws/**, so installMocks()
 * must run AFTER login() so specific routes win.
 */

const INV_ID = 'mock-pinv-gr-001';
const BP_ID = 'bp-1';
const RECEIPT_ID = 'mock-gr-001';
const RECEIPT_LINE_ID = 'grl-001';
const PO_LINE_ID_REF = 'pol-001';

// ---------------------------------------------------------------------------
// Data fixtures
// ---------------------------------------------------------------------------

const DRAFT_INVOICE = {
  id: INV_ID,
  documentNo: 'PINV-GR-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Proveedor Test',
  // All required header fields must be present so DetailView sets canAddLine=true
  // which reveals the import buttons inside PurchaseInvoiceLinesEmptyState
  transactionDocument: 'doc-type-ap-invoice',
  'transactionDocument$_identifier': 'AP Invoice',
  partnerAddress: 'addr-1',
  priceList: 'pl-1',
  paymentTerms: 'pt-1',
  paymentMethod: 'pm-1',
  invoiceDate: '2026-05-01',
  grandTotalAmount: 0,
  'currency$_identifier': 'EUR',
};

const RECEIPT_HEADER = {
  id: RECEIPT_ID,
  documentNo: 'GR-TEST-001',
  documentStatus: 'CO',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Proveedor Test',
  invoiced: false,
  movementDate: '2026-05-01',
  'salesOrder$_identifier': 'PO-TEST-001',
};

const RECEIPT_LINE_1 = {
  id: RECEIPT_LINE_ID,
  product: 'prod-1',
  'product$_identifier': 'Queso Sardo',
  movementQuantity: 2,
  uOM: 'uom-1',
  salesOrderLine: PO_LINE_ID_REF,
  purchaseOrderLine: PO_LINE_ID_REF,
};

// An existing invoice line that references the receipt line — used for already-imported detection
const EXISTING_INVOICE_LINE = {
  id: 'existing-inv-line-001',
  goodsShipmentLine: RECEIPT_LINE_ID,
  product: 'prod-1',
  invoicedQuantity: 2,
};

// Callout response: resolves unitPrice and listPrice for the product
const CALLOUT_RESPONSE = {
  updates: {
    unitPrice: { value: '100' },
    listPrice: { value: '100' },
    lineNetAmount: { value: '200' },
    tax: { value: 'tax-1' },
    uOM: { value: 'uom-1' },
  },
  combos: {},
  messages: [],
};

// ---------------------------------------------------------------------------
// Mock installer
// ---------------------------------------------------------------------------

/**
 * Install mocks for a goods receipt import flow.
 *
 * @param {object} opts
 * @param {object}   opts.receipt            - receipt header
 * @param {Array}    opts.receiptLines       - receipt lines to return when expanded
 * @param {Array}    opts.alreadyImported    - invoice lines to return when fetchDocuments
 *                                             queries existing lines (for already-imported detection).
 *                                             These are NOT shown in the detail view — detail view
 *                                             always gets an empty list so LinesEmptyState renders.
 * @param {object}   opts.state              - mutable object to capture intercepted requests
 */
async function installMocks(page, { receipt, receiptLines, alreadyImported = [], state = {} }) {
  // Invoice header — GET (detail page fetch + post-import reload via fetchById)
  await page.route(`**/sws/neo/purchase-invoice/header/${INV_ID}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [DRAFT_INVOICE] } }),
      });
      return;
    }
    if (method === 'PATCH') {
      // handleSave() sends PATCH when user clicks import button (saves the header first)
      const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...DRAFT_INVOICE, ...body }] } }),
      });
      return;
    }
    route.fallback();
  });

  // Invoice lines GET — differentiate detail view vs modal fetchDocuments by _endRow:
  //   - Detail view does NOT include _startRow/_endRow on first load (from useEntity.js)
  //     or uses _endRow=74 (BATCH_SIZE-1)
  //   - Modal fetchDocuments uses _endRow=200 (from ImportFromGoodsReceiptModal.js)
  // Detail view returns empty so LinesEmptyState renders.
  // Modal fetchDocuments returns alreadyImported so the already-imported detection works.
  await page.route('**/sws/neo/purchase-invoice/lines**', async (route) => {
    const method = route.request().method();
    if (method !== 'GET') return route.fallback();
    const url = route.request().url();
    const isModalFetch = url.includes('_endRow=200') || url.includes('_endRow=199');
    // For the detail view, return empty (so LinesEmptyState is shown).
    // For the modal's fetchDocuments, return alreadyImported.
    // Do NOT use state.importedLines here — that tracks POST-created lines only.
    const data = isModalFetch ? alreadyImported : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data } }),
    });
  });

  // Invoice lines POST — captures each created line
  await page.route('**/sws/neo/purchase-invoice/lines', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
    if (state.postBodies) state.postBodies.push(body);
    const created = { id: `inv-line-gr-${Date.now()}`, ...body };
    if (state.importedLines) state.importedLines.push(created);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [created] } }),
    });
  });

  // Callout endpoint — resolves prices per product.
  // Installed early because fetchLines calls callout per line asynchronously.
  await page.route('**/sws/neo/purchase-invoice/lines/callout', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (state.calloutCalls) state.calloutCalls.push(true);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CALLOUT_RESPONSE),
    });
  });

  // Product selector — prices resolved via callout, return empty list
  await page.route('**/sws/neo/purchase-invoice/lines/selectors/M_Product_ID**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  // Goods receipt header list — ImportFromGoodsReceiptModal.fetchDocuments
  await page.route('**/sws/neo/goods-receipt/goodsReceipt**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [receipt] } }),
    });
  });

  // Goods receipt lines — ImportFromGoodsReceiptModal.fetchLines
  await page.route('**/sws/neo/goods-receipt/goodsReceiptLine**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: receiptLines } }),
    });
  });

  // Purchase order line GET — used by fetchLines to resolve discount from the originating PO line
  await page.route(`**/sws/neo/purchase-order/lines/${PO_LINE_ID_REF}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: {
          data: [{
            id: PO_LINE_ID_REF,
            orderedQuantity: 2,
            listPrice: 100,
            unitPrice: 100,
            discount: 0,
          }],
        },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: open the import-from-receipt modal via the empty-state button
// ---------------------------------------------------------------------------

async function openImportFromReceiptModal(page) {
  // Button text: ui('importFromGoodsReceipt') = "Importar desde recibo" (es) / "Import from receipt" (en)
  const btn = page.getByText('Importar desde recibo').or(page.getByText('Import from receipt')).first();
  await expect(btn).toBeVisible({ timeout: 8_000 });
  await btn.click();
  // Modal opens — wait for the receipt row to appear (fastest observable signal)
  // The modal shows the receipt list which includes the document row
  await expect(page.getByText('GR-TEST-001').first()).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Helper: expand the first document row in the modal
// ---------------------------------------------------------------------------

async function expandFirstDocRow(page, docNo) {
  const docRow = page.getByText(docNo).first();
  await expect(docRow).toBeVisible({ timeout: 5_000 });
  await docRow.click();
}

// ---------------------------------------------------------------------------
// Helper: click the import-selected button
// ---------------------------------------------------------------------------

async function clickImportSelected(page) {
  const btn = page.getByRole('button', { name: /Importar seleccionadas|Import selected/i });
  await expect(btn).toBeEnabled({ timeout: 8_000 });
  await btn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Purchase Invoice — Import from Goods Receipt (mocked)', () => {
  test('single line — POST body matches original PO values resolved via callout', async ({ page }) => {
    const state = { postBodies: [], calloutCalls: [], importedLines: [] };

    await login(page);
    await installMocks(page, { receipt: RECEIPT_HEADER, receiptLines: [RECEIPT_LINE_1], state });

    await page.goto(`/purchase-invoice/${INV_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openImportFromReceiptModal(page);
    await expandFirstDocRow(page, 'GR-TEST-001');

    // Product line appears after callout resolves prices (async per-line)
    await expect(page.getByText('Queso Sardo').first()).toBeVisible({ timeout: 10_000 });

    // Qty input pre-filled with movementQuantity=2
    const qtyInput = page.locator('input[type="number"]').first();
    await expect(qtyInput).toHaveValue('2', { timeout: 5_000 });

    // ETP-4299: ImportLinesModal no longer auto-selects lines — click the checkbox.
    await page.getByRole('checkbox').last().click();

    await clickImportSelected(page);

    // Wait for POST to be captured
    await expect.poll(() => state.postBodies.length, { timeout: 10_000 }).toBeGreaterThan(0);

    const posted = state.postBodies[0];
    expect(posted.goodsShipmentLine).toBe(RECEIPT_LINE_ID);
    expect(Number(posted.invoicedQuantity)).toBe(2);
    // unitPrice resolved by callout = 100
    expect(Number(posted.unitPrice)).toBe(100);

    // Modal should close after success
    await expect(page.locator('.fixed.inset-0.z-50')).toHaveCount(0, { timeout: 5_000 });
  });

  test('secondary text shows the PO reference from the goods receipt header', async ({ page }) => {
    const state = { calloutCalls: [], importedLines: [] };

    await login(page);
    await installMocks(page, { receipt: RECEIPT_HEADER, receiptLines: [RECEIPT_LINE_1], state });

    await page.goto(`/purchase-invoice/${INV_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await openImportFromReceiptModal(page);

    // getDocDisplay returns `#${orderRef}` for secondary — receipt has salesOrder$_identifier='PO-TEST-001'
    // The secondary text "#PO-TEST-001" appears next to the document row in the modal
    await expect(page.getByText('#PO-TEST-001').first()).toBeVisible({ timeout: 5_000 });
  });

  test('receipt with all lines already imported is hidden from the modal list', async ({ page }) => {
    // ETP-4299: ImportLinesModal now eager-loads all lines and filters out receipts
    // where every line is already imported, so users never see a receipt they can't use.
    const state = { calloutCalls: [], importedLines: [] };

    await login(page);
    await installMocks(page, {
      receipt: RECEIPT_HEADER,
      receiptLines: [RECEIPT_LINE_1],
      alreadyImported: [EXISTING_INVOICE_LINE],
      state,
    });

    await page.goto(`/purchase-invoice/${INV_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Open the modal
    const btn = page.getByText('Importar desde recibo').or(page.getByText('Import from receipt')).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();

    // Modal opens — wait for the search field to confirm the modal rendered
    await expect(page.getByTestId('import-lines-search')).toBeVisible({ timeout: 8_000 });

    // GR-TEST-001 must NOT appear — all its lines are already imported
    await expect(page.getByText('GR-TEST-001').first()).not.toBeVisible({ timeout: 10_000 });

    // Import button stays disabled — nothing selectable
    const importBtn = page.getByRole('button', { name: /Importar seleccionadas|Import selected/i });
    await expect(importBtn).toBeDisabled({ timeout: 3_000 });
  });
});

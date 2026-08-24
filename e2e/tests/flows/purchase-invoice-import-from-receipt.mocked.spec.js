import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { clickLastCheckbox } from '../helpers/selectors.js';

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
  // `currency` is a required header field; resolveCanAddLines checks the field
  // value (not the $_identifier), so both must be set or canAddLine stays false
  // and the empty-state import buttons never render.
  currency: 'eur-1',
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
  await page.route('**/sws/neo/purchase-invoice/lines{/**,}**', async (route) => {
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
  await page.route('**/sws/neo/purchase-invoice/lines/selectors/M_Product_ID{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  // Goods receipt header list — ImportFromGoodsReceiptModal.fetchDocuments
  await page.route('**/sws/neo/goods-receipt/goodsReceipt{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [receipt] } }),
    });
  });

  // Goods receipt lines — ImportFromGoodsReceiptModal.fetchLines
  await page.route('**/sws/neo/goods-receipt/goodsReceiptLine{/**,}**', async (route) => {
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
    await clickLastCheckbox(page);

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

// ---------------------------------------------------------------------------
// ETP-4737: Import from Source Invoice — negative quantity, already-imported
// detection, and the originInvoice link-back PATCH.
// ---------------------------------------------------------------------------

const PINV_SRC_ID = 'mock-pinv-src-001';
const SOURCE_PINV_ID = 'src-pinv-001';
const SRC_PLINE_1_ID = 'src-pline-imported-1';
const SRC_PLINE_2_ID = 'src-pline-importable-2';

// A RECTIFICATIVA-subtype draft invoice — required for the "Import from Source
// Invoice" empty-state button to render (see PurchaseInvoiceBottomPanel.jsx's isRectificativa gate).
const PINV_SRC_HEADER = {
  id: PINV_SRC_ID,
  documentNo: 'PINV-SRC-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  transactionDocument: 'doctype-ap-rect-001',
  'transactionDocument$_identifier': 'AP Rectificativa',
  apInvoiceSubtype: 'RECTIFICATIVA',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Proveedor Test',
  partnerAddress: 'addr-1',
  priceList: 'pl-1',
  paymentTerms: 'pt-1',
  paymentMethod: 'pm-1',
  invoiceDate: '2026-05-01',
  grandTotalAmount: 0,
  currency: 'eur-1',
  'currency$_identifier': 'EUR',
};

// Plain "Factura" (FAC) purchase invoice — the only subtype the picker offers (per
// ETP-4737's "solo facturas de Tipo Factura" acceptance criteria). No apInvoiceSubtype
// set — getApSubtype() falls back to FAC when no rectificative hint is present.
const SOURCE_PINV_DOC = {
  id: SOURCE_PINV_ID,
  documentNo: 'SRC-PINV-001',
  documentStatus: 'CO',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Proveedor Test',
  invoiceDate: '2026-04-01',
};

// Already imported into PINV_SRC_HEADER — must appear grayed out in the picker.
const SOURCE_PLINE_1_IMPORTED = {
  id: SRC_PLINE_1_ID,
  product: 'prod-a',
  'product$_identifier': 'Producto Origen A',
  invoicedQuantity: -2,
};

// Not yet imported — selectable, and used to assert the negative quantity stepper.
const SOURCE_PLINE_2_AVAILABLE = {
  id: SRC_PLINE_2_ID,
  product: 'prod-b',
  'product$_identifier': 'Producto Origen B',
  invoicedQuantity: -3,
};

// Current invoice's own existing line — its sourceInvoiceLineId points back at
// SRC_PLINE_1_ID, which is how fetchDocuments builds the alreadyImported set.
const EXISTING_PLINE_LINKING_SOURCE_1 = {
  id: 'existing-pline-1',
  product: 'prod-a',
  sourceInvoiceLineId: SRC_PLINE_1_ID,
  invoicedQuantity: -2,
};

// Classifies a `.../{entity}/header...` request URL as the plain 'detail' GET/PATCH
// (`/header/{id}`, nothing after), the plain 'list' query (`/header` with only a
// querystring, no extra path segments), or `null` for anything else (selectors,
// actions, evaluate-display, etc.) — those must fall through to the generic /sws/**
// catch-all instead of being answered with the wrong response shape. A route pattern
// broad enough to match `/header**` also matches these unrelated sub-paths, and
// answering them incorrectly silently breaks unrelated UI state (confirmed empirically:
// intercepting `/header/{id}/action/currencyOptions` or `/header/selectors/...` with a
// header-shaped body made the whole "add line" area fail to render).
function classifyHeaderRequest(url, id) {
  const { pathname } = new URL(url);
  const idx = pathname.indexOf('/header');
  if (idx === -1) return null;
  const remainder = pathname.slice(idx + '/header'.length);
  if (remainder === '') return 'list';
  const segs = remainder.split('/').filter(Boolean);
  return (segs.length === 1 && segs[0] === id) ? 'detail' : null;
}

// Same idea for `.../{entity}/lines...` — isolates the plain create (POST `/lines`)
// and list (GET `/lines?parentId=...`) endpoints from `/lines/defaults`,
// `/lines/evaluate-display`, `/lines/callout`, etc.
function isPlainLinesPath(url) {
  const { pathname } = new URL(url);
  const idx = pathname.indexOf('/lines');
  if (idx === -1) return false;
  return pathname.slice(idx + '/lines'.length) === '';
}

async function installSourceInvoiceMocks(page, state) {
  // Header: detail GET, candidate-list GET, and the afterImport PATCH that links
  // originInvoice back to the source invoice.
  await page.route('**/sws/neo/purchase-invoice/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    const kind = classifyHeaderRequest(url, PINV_SRC_ID);
    if (req.method() === 'PATCH') {
      if (kind !== 'detail') return route.fallback();
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.patchBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...PINV_SRC_HEADER, ...body }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    if (kind === 'detail') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [PINV_SRC_HEADER] } }),
      });
      return;
    }
    if (kind === 'list') {
      // fetchDocuments' candidate-invoices lookup (no server-side criteria;
      // FAC-only filtering happens client-side via getApSubtype()).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SOURCE_PINV_DOC] } }),
      });
      return;
    }
    route.fallback();
  });

  // Lines: detail view's own (empty) fetch, modal fetchDocuments' own-lines lookup
  // (for alreadyImported detection), the source invoice's own lines (fetchLines), and POST.
  await page.route('**/sws/neo/purchase-invoice/lines{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (!isPlainLinesPath(url)) return route.fallback();
    if (req.method() === 'POST') {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.postBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: `new-pline-${Date.now()}`, ...body }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    if (url.includes(`parentId=${SOURCE_PINV_ID}`)) {
      // fetchLines(docId=SOURCE_PINV_ID) — the source invoice's own lines.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SOURCE_PLINE_1_IMPORTED, SOURCE_PLINE_2_AVAILABLE] } }),
      });
      return;
    }
    if (url.includes(`parentId=${PINV_SRC_ID}`)) {
      if (url.includes('_endRow=200')) {
        // Modal fetchDocuments' own-lines lookup — builds alreadyImportedSourceLineIds.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [EXISTING_PLINE_LINKING_SOURCE_1] } }),
        });
        return;
      }
      // Detail view's own lines fetch — empty so LinesEmptyState (and its import button) renders.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
      return;
    }
    route.fallback();
  });

  // Callout — resolves unitPrice for the line being imported (buildLineBody -> resolveLinePrice).
  await page.route('**/sws/neo/purchase-invoice/lines/callout', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        updates: { unitPrice: { value: '15' }, listPrice: { value: '15' }, tax: { value: 'tax-1' } },
        combos: {},
        messages: [],
      }),
    });
  });
}

test.describe('Purchase Invoice — Import from Source Invoice (ETP-4737)', () => {
  test('shows negative quantity, blocks re-import of an already-imported line, and links originInvoice on success', async ({ page }) => {
    const state = { postBodies: [], patchBodies: [] };

    await login(page);
    await installSourceInvoiceMocks(page, state);

    await page.goto(`/purchase-invoice/${PINV_SRC_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const importBtn = page.getByText(/Import.*Source Invoice|Importar.*factura origen/i).first();
    await expect(importBtn).toBeVisible({ timeout: 8_000 });
    await importBtn.click();

    const sourceDocRow = page.getByText('SRC-PINV-001').first();
    await expect(sourceDocRow).toBeVisible({ timeout: 5_000 });
    await sourceDocRow.click();

    await expect(page.getByText('Producto Origen A').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Producto Origen B').first()).toBeVisible({ timeout: 5_000 });

    // Assertion: the already-imported source line is grayed out / cannot be re-selected.
    await expect(page.getByText(/already imported|ya importado/i)).toBeVisible();
    const checkboxes = page.getByRole('checkbox');
    // nth(0) = document-level checkbox, nth(1) = line 1 (already imported), nth(2) = line 2.
    await expect(checkboxes.nth(1)).toBeDisabled();

    // Assertion: the quantity stepper displays a NEGATIVE value (negativeQuantity prop) —
    // checked on the selectable line (invoicedQuantity=-3 → maxQty=3 → displayed as -3).
    const qtyInputs = page.locator('input[type="number"]');
    await expect(qtyInputs.nth(1)).toHaveValue('-3', { timeout: 5_000 });

    // Select the selectable line and import it. Uses a native evaluate()-click (same
    // as the shared clickLastCheckbox() helper) instead of Playwright's actionability
    // click — the Checkbox's 1px visual target is frequently occluded by its own
    // decorative wrapper div, which fails Playwright's pointer-events hit test.
    await checkboxes.nth(2).evaluate((el) => el.click());
    const importSelectedBtn = page.getByRole('button', { name: /Import.*selected|Importar.*seleccionadas/i });
    await expect(importSelectedBtn).toBeEnabled({ timeout: 3_000 });
    await importSelectedBtn.click();

    // The imported line's POST body must carry a negative invoicedQuantity.
    await expect.poll(() => state.postBodies.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(Number(state.postBodies[0].invoicedQuantity)).toBeLessThan(0);

    // Assertion: after a successful import, afterImport PATCHes the header's originInvoices
    // virtual field (ETP-4919: plural — a rectificativa can be linked to more than one source
    // invoice across separate import runs) with the source invoice's id. Other unrelated
    // PATCHes to the same header (e.g. autosave) may also fire, so find the one that actually
    // carries originInvoices rather than assuming it is the first captured PATCH.
    await expect.poll(
      () => state.patchBodies.some((b) => b.originInvoices !== undefined),
      { timeout: 5_000 },
    ).toBe(true);
    const originInvoicePatch = state.patchBodies.find((b) => b.originInvoices !== undefined);
    expect(originInvoicePatch.originInvoices).toEqual([SOURCE_PINV_ID]);
  });
});

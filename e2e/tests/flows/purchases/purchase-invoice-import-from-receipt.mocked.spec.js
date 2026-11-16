// @covers artifacts/purchase-invoice/custom/ImportFromGoodsReceiptModal.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';
import { clickLastCheckbox } from '../../helpers/selectors.js';

/**
 * Purchase Invoice — Import from Goods Receipt (mocked).
 *
 * Covers:
 *   1. Single line — POST body matches original PO values resolved via callout
 *   2. A receipt with nothing left to import is hidden from the list
 *
 * ETP-6099: the popup reads the invoice's availableReceipts / availableReceiptLines actions
 * (rows in the action contract's shape, `detail: true`); the price callout runs at import only.
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
  // ETP-5273: accountingDate is now an independent, required header field —
  // resolveCanAddLines needs it populated too, same reason as `currency` below.
  accountingDate: '2026-05-01',
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
  date: '2026-05-01',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Proveedor Test',
  currency: 'eur-1',
  pendingLines: 1,
  order: 'po-1',
  orderDocumentNo: 'PO-TEST-001',
  amount: 200,
};

const RECEIPT_LINE_1 = {
  id: RECEIPT_LINE_ID,
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  uOM: 'uom-1',
  pendingQuantity: 2,
  movementQuantity: 2,
  orderLine: PO_LINE_ID_REF,
  orderLineDiscount: 0,
  importedHere: false,
  invoicedElsewhere: false,
};

// A receipt whose only line this invoice already holds: nothing left (`pendingLines: 0`).
const RECEIPT_HEADER_COVERED = { ...RECEIPT_HEADER, pendingLines: 0 };
const RECEIPT_LINE_IMPORTED = { ...RECEIPT_LINE_1, pendingQuantity: 0, importedHere: true };

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
 * @param {object}   opts.state              - mutable object to capture intercepted requests
 */
async function installMocks(page, { receipt, receiptLines, state = {} }) {
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

  // Invoice lines GET — the detail view's own fetch: empty, so LinesEmptyState renders.
  // (ETP-6099: the popup no longer reads the invoice lines; the server flags `importedHere`.)
  await page.route('**/sws/neo/purchase-invoice/lines{/**,}**', async (route) => {
    const method = route.request().method();
    if (method !== 'GET') return route.fallback();
    const data = [];
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

  // Callout endpoint — resolves prices per product, at import time (buildLineBody).
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

  // The invoice's availableReceipts / availableReceiptLines actions —
  // ImportFromGoodsReceiptModal.fetchDocuments / fetchLines
  await page.route(`**/sws/neo/purchase-invoice/header/${INV_ID}/action/availableReceipt*`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const isLines = route.request().url().endsWith('/availableReceiptLines');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: isLines ? receiptLines : [receipt], hasMore: false, nextOffset: null } }),
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

    // Product line appears once the lines action answers
    await expect(page.getByText('Test Product').first()).toBeVisible({ timeout: 10_000 });

    // Qty input pre-filled with movementQuantity=2
    const qtyInput = page.getByTestId('ImportLinesModal__qtyInput').first();
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

  test('receipt with all lines already imported is hidden from the modal list', async ({ page }) => {
    // ETP-4299 hid a receipt whose every line is already imported, so users never see a
    // receipt they can't use. ETP-6099: decided from the row (`pendingLines: 0`), no line read.
    const state = { calloutCalls: [], importedLines: [] };

    await login(page);
    await installMocks(page, {
      receipt: RECEIPT_HEADER_COVERED,
      receiptLines: [RECEIPT_LINE_IMPORTED],
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
  // ETP-5273: accountingDate is now an independent, required header field —
  // resolveCanAddLines needs it populated too, alongside invoiceDate.
  accountingDate: '2026-05-01',
  grandTotalAmount: 0,
  currency: 'eur-1',
  'currency$_identifier': 'EUR',
};

// Plain "Factura" (FAC) purchase invoice — the only subtype the picker offers (per
// ETP-4737's "solo facturas de Tipo Factura" acceptance criteria). No apInvoiceSubtype
// set — getApSubtype() falls back to FAC when no rectificative hint is present.
// What the rectificative's `availableOriginInvoices` action lists (ETP-6099): the server already
// keeps the supplier's completed FAC invoices only.
const SOURCE_PINV_DOC = {
  id: SOURCE_PINV_ID,
  documentNo: 'SRC-PINV-001',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Proveedor Test',
  date: '2026-04-01',
  pendingLines: 1,
};

// Already imported into PINV_SRC_HEADER — must appear grayed out in the picker.
const SOURCE_PLINE_1_IMPORTED = {
  id: SRC_PLINE_1_ID,
  lineNo: 10,
  product: 'prod-a',
  'product$_identifier': 'Producto Origen A',
  invoicedQuantity: -2,
  pendingQuantity: 0,
  importedHere: true,
};

// Not yet imported — selectable, and used to assert the negative quantity stepper.
const SOURCE_PLINE_2_AVAILABLE = {
  id: SRC_PLINE_2_ID,
  lineNo: 20,
  product: 'prod-b',
  'product$_identifier': 'Producto Origen B',
  invoicedQuantity: -3,
  pendingQuantity: 3,
  importedHere: false,
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
  // Header: detail GET, the popup's read actions (ETP-6099: availableOriginInvoices for the
  // candidates, availableOriginInvoiceLines for the source's lines, already-imported ones marked
  // `importedHere`), and the afterImport PATCH that links originInvoice back to the source invoice.
  await page.route('**/sws/neo/purchase-invoice/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    const { pathname } = new URL(url);
    if (req.method() === 'POST' && pathname.endsWith(`/header/${PINV_SRC_ID}/action/availableOriginInvoices`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SOURCE_PINV_DOC], hasMore: false } }),
      });
      return;
    }
    if (req.method() === 'POST' && pathname.endsWith(`/header/${PINV_SRC_ID}/action/availableOriginInvoiceLines`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SOURCE_PLINE_1_IMPORTED, SOURCE_PLINE_2_AVAILABLE], hasMore: false } }),
      });
      return;
    }
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
    route.fallback();
  });

  // Lines: detail view's own (empty) fetch and the import's line POST.
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
    if (url.includes(`parentId=${PINV_SRC_ID}`)) {
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
    // nth(0) = document-level checkbox, nth(1) = the lines table's master checkbox,
    // nth(2) = line 1 (already imported), nth(3) = line 2.
    await expect(checkboxes.nth(2)).toBeDisabled();

    // Assertion: the quantity stepper displays a NEGATIVE value (negativeQuantity prop) —
    // checked on the selectable line (invoicedQuantity=-3 → maxQty=3 → displayed as -3).
    const qtyInputs = page.getByTestId('ImportLinesModal__qtyInput');
    await expect(qtyInputs.nth(1)).toHaveValue('-3', { timeout: 5_000 });

    // Select the selectable line and import it. Uses a native evaluate()-click (same
    // as the shared clickLastCheckbox() helper) instead of Playwright's actionability
    // click — the Checkbox's 1px visual target is frequently occluded by its own
    // decorative wrapper div, which fails Playwright's pointer-events hit test.
    await checkboxes.nth(3).evaluate((el) => el.click());
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

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { clickLastCheckbox } from '../helpers/selectors.js';

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
  // `currency` is a required header field; resolveCanAddLines checks the field
  // value (not the $_identifier), so both must be set or canAddLine stays false
  // and the empty-state import button never renders.
  currency: 'eur-1',
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
  await page.route('**/sws/neo/goods-shipment/goodsShipment{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [SHIPMENT] } }),
    });
  });

  // Goods-shipment lines — ImportFromShipmentModal.fetchLines
  await page.route('**/sws/neo/goods-shipment/goodsShipmentLine{/**,}**', async (route) => {
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
    await clickLastCheckbox(page);

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
    await clickLastCheckbox(page);

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
    await page.route('**/sws/neo/goods-shipment/goodsShipment{/**,}**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SHIPMENT] } }),
      });
    });

    // Shipment lines — line WITH a salesOrderLine reference
    await page.route('**/sws/neo/goods-shipment/goodsShipmentLine{/**,}**', async (route) => {
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
    await clickLastCheckbox(page);

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

// ---------------------------------------------------------------------------
// ETP-4737: Import from Source Invoice — negative quantity, already-imported
// detection, and the originInvoice link-back PATCH.
// ---------------------------------------------------------------------------

const SRC_INVOICE_ID2 = 'mock-inv-src-001';
const SOURCE_INVOICE_ID = 'src-inv-001';
const SRC_LINE_1_ID = 'src-line-imported-1';
const SRC_LINE_2_ID = 'src-line-importable-2';

// A RECTIFICATIVA-subtype draft invoice — required for the "Import from Source
// Invoice" empty-state button to render (see InvoiceBottomPanel.jsx's isRectificativa gate).
const SRC_INVOICE_HEADER = {
  id: SRC_INVOICE_ID2,
  documentNo: 'INV-SRC-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  transactionDocument: 'doctype-rect-001',
  'transactionDocument$_identifier': 'AR Rectificativa',
  arInvoiceSubtype: 'RECTIFICATIVA',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Test Client',
  partnerAddress: 'addr-mock-001',
  invoiceDate: '2026-05-01',
  paymentTerms: 'pt-mock-001',
  paymentMethod: 'pm-mock-001',
  priceList: 'pl-mock-001',
  grandTotalAmount: 0,
  summedLineAmount: 0,
  currency: 'eur-1',
  'currency$_identifier': 'EUR',
};

const SOURCE_INVOICE_DOC = {
  id: SOURCE_INVOICE_ID,
  documentNo: 'SRC-INV-001',
  documentStatus: 'CO',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Test Client',
  invoiceDate: '2026-04-01',
  currency: 'eur-1',
};

// Already imported into SRC_INVOICE_HEADER — must appear grayed out in the picker.
const SOURCE_LINE_1_IMPORTED = {
  id: SRC_LINE_1_ID,
  product: 'prod-a',
  'product$_identifier': 'Producto Origen A',
  invoicedQuantity: 2,
  unitPrice: 10,
  lineNetAmount: 20,
};

// Not yet imported — selectable, and used to assert the negative quantity stepper.
const SOURCE_LINE_2_AVAILABLE = {
  id: SRC_LINE_2_ID,
  product: 'prod-b',
  'product$_identifier': 'Producto Origen B',
  invoicedQuantity: 3,
  unitPrice: 15,
  lineNetAmount: 45,
};

// Current invoice's own existing line — its sourceInvoiceLineId points back at
// SRC_LINE_1_ID, which is how fetchDocuments builds the alreadyImported set.
const EXISTING_LINE_LINKING_SOURCE_1 = {
  id: 'existing-line-1',
  product: 'prod-a',
  sourceInvoiceLineId: SRC_LINE_1_ID,
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
  // Header: detail GET, currency-lookup GET (same URL), candidate-list GET, and the
  // afterImport PATCH that links originInvoice back to the source invoice.
  await page.route('**/sws/neo/sales-invoice/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    const kind = classifyHeaderRequest(url, SRC_INVOICE_ID2);
    if (req.method() === 'PATCH') {
      if (kind !== 'detail') return route.fallback();
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.patchBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...SRC_INVOICE_HEADER, ...body }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    if (kind === 'detail') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SRC_INVOICE_HEADER] } }),
      });
      return;
    }
    if (kind === 'list') {
      // fetchDocuments' candidate-invoices lookup.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SOURCE_INVOICE_DOC] } }),
      });
      return;
    }
    route.fallback();
  });

  // Lines: detail view's own (empty) fetch, modal fetchDocuments' own-lines lookup
  // (for alreadyImported detection), the source invoice's own lines (fetchLines), and POST.
  await page.route('**/sws/neo/sales-invoice/lines{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (!isPlainLinesPath(url)) return route.fallback();
    if (req.method() === 'POST') {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.postBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: `new-line-${Date.now()}`, ...body }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    if (url.includes(`parentId=${SOURCE_INVOICE_ID}`)) {
      // fetchLines(docId=SOURCE_INVOICE_ID) — the source invoice's own lines.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [SOURCE_LINE_1_IMPORTED, SOURCE_LINE_2_AVAILABLE] } }),
      });
      return;
    }
    if (url.includes(`parentId=${SRC_INVOICE_ID2}`)) {
      if (url.includes('_endRow=200')) {
        // Modal fetchDocuments' own-lines lookup — builds alreadyImportedSourceLineIds.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [EXISTING_LINE_LINKING_SOURCE_1] } }),
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
}

test.describe('Sales Invoice — Import from Source Invoice (ETP-4737)', () => {
  test('shows negative quantity, blocks re-import of an already-imported line, and links originInvoice on success', async ({ page }) => {
    const state = { postBodies: [], patchBodies: [] };

    await login(page);
    await installSourceInvoiceMocks(page, state);

    await page.goto(`/sales-invoice/${SRC_INVOICE_ID2}`);
    await page.waitForLoadState('domcontentloaded');

    const importBtn = page.getByText(/Import.*Source Invoice|Importar.*factura origen/i).first();
    await expect(importBtn).toBeVisible({ timeout: 8_000 });
    await importBtn.click();

    const sourceDocRow = page.getByText('SRC-INV-001').first();
    await expect(sourceDocRow).toBeVisible({ timeout: 5_000 });
    await sourceDocRow.click();

    await expect(page.getByText('Producto Origen A').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Producto Origen B').first()).toBeVisible({ timeout: 5_000 });

    // Assertion: the already-imported source line is grayed out / cannot be re-selected.
    await expect(page.getByText(/already imported|ya importado/i)).toBeVisible();
    const checkboxes = page.getByRole('checkbox');
    // nth(0) = document-level checkbox, nth(1) = line 1 (already imported), nth(2) = line 2.
    await expect(checkboxes.nth(1)).toBeDisabled();

    // Assertion: the quantity stepper displays a NEGATIVE value (negativeQuantity prop),
    // not a positive magnitude — checked on the selectable line (invoicedQuantity=3 → -3).
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

    // Assertion: after a successful import, afterImport PATCHes the header's originInvoice
    // virtual field with the source invoice's id. Other unrelated PATCHes to the same header
    // (e.g. autosave) may also fire, so find the one that actually carries originInvoice
    // rather than assuming it is the first captured PATCH.
    await expect.poll(
      () => state.patchBodies.some((b) => b.originInvoice !== undefined),
      { timeout: 5_000 },
    ).toBe(true);
    const originInvoicePatch = state.patchBodies.find((b) => b.originInvoice !== undefined);
    expect(originInvoicePatch.originInvoice).toBe(SOURCE_INVOICE_ID);
  });
});

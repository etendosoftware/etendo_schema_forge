import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Invoice import — the order-line FK must travel as `salesOrderLine` (ETP-5381, mocked).
 *
 * The bug
 * -------
 * The sales-invoice import modals posted the invoice-line → order-line FK under the key
 * `cOrderlineId`, which exists in NO NEO spec. The spec's `java_qualifier` for
 * `C_INVOICELINE.C_OrderLine_ID` is `salesOrderLine`, and `NeoFieldFilter.filterRecord`
 * drops any body key absent from the spec **silently** — HTTP 200, line created, FK NULL.
 * Nothing in the UI, the response or the logs surfaced the loss.
 *
 * Why it mattered: with `C_OrderLine_ID` NULL, `C_INVOICE_POST` never reached its MatchSO
 * block (no `M_MATCHSO` row — the Classic "Matched Sales Orders" window stayed empty for
 * GO-made invoices) and never ran `UPDATE C_ORDERLINE SET QtyInvoiced`, so the order stayed
 * invoiceable forever. That is the double-invoicing hole ETP-5381 targets.
 *
 * What this spec locks — for the write path AND the read path:
 *   1. WRITE — the intercepted `POST /sws/neo/{spec}/lines` body carries `salesOrderLine`
 *      with the originating order-line id, and carries no `cOrderlineId` key at all.
 *   2. READ  — the modal's duplicate detection reads the FK back off existing invoice lines
 *      under `salesOrderLine`, so an order line already invoiced is greyed out and cannot
 *      be re-selected.
 *   3. READ (negative) — an existing invoice line carrying only the dead `cOrderlineId` key
 *      is NOT picked up by that detection. This is the assertion that actually fails if
 *      someone re-introduces the old key on either side: a test that only checked (2) would
 *      stay green against a codebase that read both keys.
 *
 * Both import-from-order windows are covered: sales-invoice (`ImportFromOrderModal`, the side
 * that was broken) and purchase-invoice (`ImportFromPurchaseOrderModal`, the side that was
 * always correct — guarded here so it cannot silently regress INTO the broken shape).
 *
 * Scope note: the import-from-shipment and import-from-source-invoice paths reuse the
 * scaffolding that already exists in `sales-invoice-import-no-reload.mocked.spec.js` and
 * assert the same two properties there, rather than re-mocking the callout cascade here.
 *
 * Routing notes
 * -------------
 * - `login()` installs a catch-all for `/sws/**`; install specific routes AFTER it so they
 *   win (Playwright matches routes in reverse registration order).
 * - Every endpoint that can receive a sub-path is registered TWICE (`word/**` and `word**`).
 *   A bare `word**` does not cross a `/`, so `/lines/callout` or `/header/{id}` would fall
 *   through to the catch-all and silently answer with the wrong shape. See
 *   docs/e2e-testing-guide.md § "a route pattern ending in a bare `word**`".
 */

const BP_ID = 'bp-import-fk-001';

// Classifies a `.../{entity}/header...` URL as the plain detail GET/PATCH (`/header/{id}`),
// the plain list query (`/header?...`), or null for anything else (selectors, `/action/...`,
// evaluate-display). Anything else MUST fall through to the catch-all: answering a selector
// call with a header-shaped body silently breaks unrelated parts of the detail view.
function classifyHeaderRequest(url, id) {
  const { pathname } = new URL(url);
  const idx = pathname.indexOf('/header');
  if (idx === -1) return null;
  const remainder = pathname.slice(idx + '/header'.length);
  if (remainder === '') return 'list';
  const segs = remainder.split('/').filter(Boolean);
  return (segs.length === 1 && segs[0] === id) ? 'detail' : null;
}

// Same idea for `.../{entity}/lines...` — isolates the plain create (POST `/lines`) and the
// plain list (GET `/lines?parentId=...`) from `/lines/callout`, `/lines/defaults`, etc.
function isPlainLinesPath(url) {
  const { pathname } = new URL(url);
  const idx = pathname.indexOf('/lines');
  if (idx === -1) return false;
  return pathname.slice(idx + '/lines'.length) === '';
}

// ---------------------------------------------------------------------------
// Per-window matrix
// ---------------------------------------------------------------------------

const WINDOWS = [
  {
    label: 'sales-invoice ← sales-order',
    invoiceSpec: 'sales-invoice',
    orderSpec: 'sales-order',
    // ui('importFromSalesOrder') — "Add from order" / "Añadir desde pedido"
    importButton: /Add from order|Añadir desde pedido/i,
    documentType: { transactionDocument: 'doctype-ar-001', 'transactionDocument$_identifier': 'AR Invoice' },
  },
  {
    label: 'purchase-invoice ← purchase-order',
    invoiceSpec: 'purchase-invoice',
    orderSpec: 'purchase-order',
    // ui('importFromPurchaseOrder') — "Import from PO" / "Importar desde pedido"
    importButton: /Import from PO|Importar desde pedido/i,
    documentType: { transactionDocument: 'doctype-ap-001', 'transactionDocument$_identifier': 'AP Invoice' },
  },
];

function buildFixtures({ invoiceSpec, orderSpec, documentType }) {
  const invoiceId = `mock-${invoiceSpec}-fk-001`;
  const orderId = `mock-${orderSpec}-fk-001`;
  const orderLine1Id = `${orderSpec}-line-fk-1`;
  const orderLine2Id = `${orderSpec}-line-fk-2`;

  return {
    invoiceId,
    orderId,
    orderLine1Id,
    orderLine2Id,
    // A draft invoice with every field resolveCanAddLines requires — without them
    // canAddLine stays false and the empty-state import buttons never render.
    invoiceHeader: {
      id: invoiceId,
      documentNo: `INV-FK-001`,
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      ...documentType,
      businessPartner: BP_ID,
      'businessPartner$_identifier': 'Cliente Test',
      partnerAddress: 'addr-fk-001',
      invoiceDate: '2026-05-01',
      accountingDate: '2026-05-01',
      paymentTerms: 'pt-fk-001',
      paymentMethod: 'pm-fk-001',
      priceList: 'pl-fk-001',
      grandTotalAmount: 0,
      summedLineAmount: 0,
      currency: 'eur-1',
      'currency$_identifier': 'EUR',
    },
    // Completed, same partner, same currency, invoiceStatus < 100 — the three conditions
    // ImportFrom{Sales,Purchase}OrderModal.fetchDocuments filters candidates on.
    order: {
      id: orderId,
      documentNo: 'ORD-FK-001',
      documentStatus: 'CO',
      businessPartner: BP_ID,
      'businessPartner$_identifier': 'Cliente Test',
      orderDate: '2026-04-01',
      currency: 'eur-1',
      invoiceStatus: 0,
    },
    // Two lines: the dedup tests mark line 1 as already invoiced, and line 2 keeps the
    // order visible in the picker (a document whose lines are ALL already imported is
    // filtered out of the list entirely by ImportLinesModal).
    orderLines: [
      {
        id: orderLine1Id,
        product: 'prod-fk-a',
        'product$_identifier': 'Producto Pedido A',
        orderedQuantity: 4,
        invoicedQuantity: 0,
        unitPrice: 10,
        listPrice: 10,
        uOM: 'uom-1',
        tax: 'tax-1',
      },
      {
        id: orderLine2Id,
        product: 'prod-fk-b',
        'product$_identifier': 'Producto Pedido B',
        orderedQuantity: 3,
        invoicedQuantity: 0,
        unitPrice: 20,
        listPrice: 20,
        uOM: 'uom-1',
        tax: 'tax-1',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {Array}  opts.existingInvoiceLines invoice lines the modal's fetchDocuments sees
 *                                           (`_endRow=200`); the detail view always gets an
 *                                           empty list so the empty state renders.
 * @param {object} opts.state                mutable capture bag — `state.postBodies`.
 */
async function installMocks(page, cfg, { existingInvoiceLines = [], state }) {
  const { invoiceSpec, orderSpec } = cfg;
  const { invoiceId, orderId, invoiceHeader, order, orderLines } = cfg.fixtures;

  // Invoice header — detail GET, plus the PATCH handleImportOrderClick fires before opening
  // the modal (onSave). The PATCH must echo the full header: answering it from the /sws/**
  // catch-all returns a body with no businessPartner, and the modal then filters every
  // candidate order out because bpId is undefined.
  const invoiceHeaderHandler = async (route) => {
    const req = route.request();
    const kind = classifyHeaderRequest(req.url(), invoiceId);
    if (kind !== 'detail') return route.fallback();
    if (req.method() === 'PATCH' || req.method() === 'PUT') {
      const patch = req.postData() ? JSON.parse(req.postData()) : {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...invoiceHeader, ...patch }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [invoiceHeader] } }),
    });
  };
  await page.route(`**/sws/neo/${invoiceSpec}/header/**`, invoiceHeaderHandler);
  await page.route(`**/sws/neo/${invoiceSpec}/header**`, invoiceHeaderHandler);

  // Invoice lines — POST capture, the modal's own-lines lookup (_endRow=200, feeds duplicate
  // detection) and the detail view's own fetch (empty, so the import buttons render).
  const invoiceLinesHandler = async (route) => {
    const req = route.request();
    const url = req.url();
    if (!isPlainLinesPath(url)) return route.fallback();
    if (req.method() === 'POST') {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      state.postBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: `new-inv-line-${state.postBodies.length}`, ...body }] } }),
      });
      return;
    }
    if (req.method() !== 'GET') return route.fallback();
    const isModalFetch = url.includes('_endRow=200');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: isModalFetch ? existingInvoiceLines : [] } }),
    });
  };
  await page.route(`**/sws/neo/${invoiceSpec}/lines/**`, invoiceLinesHandler);
  await page.route(`**/sws/neo/${invoiceSpec}/lines**`, invoiceLinesHandler);

  // Order header list — the modal's candidate-documents lookup.
  const orderHeaderHandler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    if (classifyHeaderRequest(req.url(), orderId) !== 'list') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [order] } }),
    });
  };
  await page.route(`**/sws/neo/${orderSpec}/header/**`, orderHeaderHandler);
  await page.route(`**/sws/neo/${orderSpec}/header**`, orderHeaderHandler);

  // Order lines — the modal's fetchLines for the expanded order.
  const orderLinesHandler = async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    if (!isPlainLinesPath(req.url())) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: orderLines } }),
    });
  };
  await page.route(`**/sws/neo/${orderSpec}/lines/**`, orderLinesHandler);
  await page.route(`**/sws/neo/${orderSpec}/lines**`, orderLinesHandler);
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

async function openImportFromOrderModal(page, cfg) {
  const btn = page.getByText(cfg.importButton).first();
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
  await expect(page.getByTestId('import-lines-search')).toBeVisible({ timeout: 10_000 });
}

async function expandOrder(page) {
  const docRow = page.getByText('ORD-FK-001').first();
  await expect(docRow).toBeVisible({ timeout: 10_000 });
  await docRow.click();
}

// The modal's Checkbox renders its native input sr-only inside a 1px clip-rect, which
// Playwright's mouse-based click cannot reliably hit (same reason the shared
// clickLastCheckbox() helper uses a DOM click). Index 0 is the document-level checkbox,
// 1..n are the lines in render order.
function modalCheckboxes(page) {
  return page.locator('.fixed.inset-0.z-50').first().getByRole('checkbox');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const win of WINDOWS) {
  const cfg = { ...win, fixtures: buildFixtures(win) };
  const { invoiceId, orderLine1Id, orderLine2Id } = cfg.fixtures;

  test.describe(`Import from order — order-line FK (${cfg.label})`, () => {
    test('the POSTed invoice line carries salesOrderLine, and no cOrderlineId key at all', async ({ page }) => {
      const state = { postBodies: [] };

      await login(page);
      await installMocks(page, cfg, { state });

      await page.goto(`/${cfg.invoiceSpec}/${invoiceId}`);
      await page.waitForLoadState('domcontentloaded');

      await openImportFromOrderModal(page, cfg);
      await expandOrder(page);

      await expect(page.getByText('Producto Pedido B').first()).toBeVisible({ timeout: 10_000 });

      // Select the second order line only, so the assertion pins a specific id.
      await modalCheckboxes(page).nth(2).evaluate((el) => el.click());

      const importBtn = page.getByRole('button', { name: /Import selected|Importar seleccionadas/i });
      await expect(importBtn).toBeEnabled({ timeout: 5_000 });
      await importBtn.click();

      await expect.poll(() => state.postBodies.length, { timeout: 10_000 }).toBe(1);

      const posted = state.postBodies[0];
      // The FK the backend actually persists (spec java_qualifier for C_OrderLine_ID).
      expect(posted.salesOrderLine).toBe(orderLine2Id);
      // The dead key must not be present at all — NeoFieldFilter would drop it silently,
      // so sending it "just in case" is indistinguishable from not sending the FK.
      expect(Object.hasOwn(posted, 'cOrderlineId')).toBe(false);
    });
  });
}

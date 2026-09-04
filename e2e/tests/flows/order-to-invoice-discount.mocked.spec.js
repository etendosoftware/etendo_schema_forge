import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order → Sales Invoice with total discount (ETP-4015, mocked).
 *
 * Background
 * ----------
 * Creating a sales invoice from a sales order that carries
 * `etgoTotalDiscount > 0` used to land the user on an invoice whose grand
 * total was wrong: pre-fix the backend produced 50.16 EUR (double-taxed
 * discount), an intermediate fix left 48.40 EUR (discount lost entirely),
 * and the correct AEAT-compliant total is 45.98 EUR.
 *
 * The backend fix lives in
 *   com.etendoerp.go.schemaforge.InvoiceFromOrderSupport.applyOrderDiscountToInvoice
 * and makes the new invoice carry:
 *   summedLineAmount   = 41.80   (Test Product line 44.00 − 2.20 ETGO_DTO discount)
 *   grandTotalAmount   = 45.98   (41.80 + 4.18 tax)
 *   etgoTotalDiscount  = 5       (the % the order had)
 *   one ETGO_DTO line whose listPrice/grossAmount carry the negative discount
 *
 * This is the same window covered by sales-order-totals-rounding.mocked.spec.js
 * (panel rounding); this spec is its order-to-invoice cousin and locks the end
 * state of the journey, not the intermediate panel math.
 *
 * What this spec locks
 * --------------------
 * 1. After "Confirmar + factura →" the user lands on the new invoice and the
 *    Total = 45.98 EUR (never 48.40 — discount lost, never 50.16 — double tax).
 * 2. The DOM invariant Subtotal + Tax === Total (AEAT/Modelo 303 rule the
 *    original bug violated).
 * 3. Completing the invoice (documentAction=CO) keeps the total at 45.98 —
 *    i.e. the backend post-processor does not silently re-apply or drop the
 *    discount when the user transitions the invoice to CO.
 *
 * Routing note
 * ------------
 * `login()` installs a catch-all for /sws/** — install specific routes AFTER
 * login() so they win (Playwright matches routes in reverse registration order).
 */

const ORDER_ID   = 'mock-so-disc-001';
const INVOICE_ID = 'mock-si-disc-001';

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Sales order in DR with one line (Test Product 44.00) and a 5% total discount.
//   gross line 44.00 × 1.10 tax = 48.40
//   subtotal sin descuento     = 44.00
//   descuento total (5%)       = -2.20
//   subtotal                   = 41.80
//   tax  (10% IVA on 41.80)    =  4.18
//   total                      = 45.98
const ORDER_HEADER = {
  id: ORDER_ID,
  documentNo: 'SO-ETP4015-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  documentAction: 'CO',
  businessPartner: 'bp-1',
  'businessPartner$_identifier': 'Test Client',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 48.40,   // pre-fix server snapshot — frontend factors it in DR
  summedLineAmount: 44.00,
  etgoTotalDiscount: 5,
};

const ORDER_LINE = {
  id: 'mock-so-line-disc-001',
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  orderedQuantity: 1,
  listPrice: 44,
  discount: 0,
  unitPrice: 44,
  lineNetAmount: 44,
  lineGrossAmount: 48.40,
  tax: 'tax-iva10',
  'tax$_identifier': 'IVA 10%',
  'currency$_identifier': 'EUR',
};

// Invoice that the backend (post-fix) returns from /action/createDraftInvoice.
const INVOICE_HEADER_DR = {
  id: INVOICE_ID,
  documentNo: 'SI-ETP4015-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  documentAction: 'CO',
  businessPartner: 'bp-1',
  'businessPartner$_identifier': 'Test Client',
  invoiceDate: '2026-05-21',
  'currency$_identifier': 'EUR',
  grandTotalAmount: 45.98,
  summedLineAmount: 41.80,
  etgoTotalDiscount: 5,
  description: '',
};

const INVOICE_HEADER_CO = {
  ...INVOICE_HEADER_DR,
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  processed: true,
  // Whatever the backend returns on completion — keep totals stable.
  grandTotalAmount: 45.98,
  summedLineAmount: 41.80,
};

// The invoice's lines on the panel use the invoice line config:
//   qtyField=invoicedQuantity, priceField=listPrice,
//   grossField=grossAmount, discountField=etgoDiscount
// Two lines: the product line (44.00 × 1 = 44.00, gross 48.40) and the
// ETGO_DTO discount line (-2.20 × 1 = -2.20, gross -2.42), giving:
//   grossSubtotal = 44.00 + (-2.20) = 41.80
//   netSubtotal   = 41.80   (no per-line discount)
//   baseGrandTotal= 48.40 + (-2.42) = 45.98
//   taxAmt        = 45.98 - 41.80   = 4.18
//   grandTotal    = round2(41.80) + round2(4.18) = 45.98
const INVOICE_PRODUCT_LINE = {
  id: 'mock-si-line-prod-001',
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  invoicedQuantity: 1,
  listPrice: 44,
  etgoDiscount: 0,
  unitPrice: 44,
  lineNetAmount: 44,
  grossAmount: 48.40,
  tax: 'tax-iva10',
  'tax$_identifier': 'IVA 10%',
  'currency$_identifier': 'EUR',
};

const INVOICE_DISCOUNT_LINE = {
  id: 'mock-si-line-dto-001',
  lineNo: 20,
  product: 'E4BC94E71D664E73A066DAF78BF39DB3',  // real ETGO_DTO product id — must match the LinesBottomSection guard
  'product$_identifier': 'Total Discount',
  invoicedQuantity: 1,
  listPrice: -2.20,
  etgoDiscount: 0,
  unitPrice: -2.20,
  lineNetAmount: -2.20,
  grossAmount: -2.42,
  tax: 'tax-iva10',
  'tax$_identifier': 'IVA 10%',
  'currency$_identifier': 'EUR',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Install the route handlers that drive the full order → invoice journey.
 *
 *   GET    /sales-order/header/{ORDER_ID}        → order header
 *   GET    /sales-order/lines?parentId={ORDER_ID}→ one order line
 *   POST   /sales-order/header/{ORDER_ID}/action/documentAction       → 200 (CO)
 *   POST   /sales-order/header/{ORDER_ID}/action/createDraftInvoice   → new invoice id
 *   GET    /sales-invoice/header/{INVOICE_ID}    → invoice header (DR or CO depending on completed flag)
 *   GET    /sales-invoice/lines?parentId={INVOICE_ID} → product line + ETGO_DTO discount line
 *   POST   /sales-invoice/header/{INVOICE_ID}/action/documentAction   → 200 (CO) and flip header state
 *
 * `invoiceCompletedRef.value` lets the invoice header fetch return CO once the
 * test has explicitly completed the invoice via documentAction.
 */
async function installOrderToInvoiceMocks(page, invoiceCompletedRef) {
  // ── Sales order detail (header + lines + evaluate-display passthrough) ──
  await page.route(`**/sws/neo/sales-order/header/${ORDER_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [ORDER_HEADER] } }),
    });
  });

  await page.route('**/sws/neo/sales-order/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [ORDER_LINE], totalRows: 1 } }),
    });
  });

  await page.route('**/sws/neo/sales-order/evaluate-display{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // ── Sales order actions ──────────────────────────────────────────────────
  // documentAction=CO: succeed silently so ConfirmModal moves on to step 2.
  await page.route(
    `**/sws/neo/sales-order/header/${ORDER_ID}/action/documentAction`,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { id: ORDER_ID, documentStatus: 'CO' } } }),
      });
    },
  );

  // createDraftInvoice: this is THE bug surface — return the post-fix invoice
  // payload (45.98 / 41.80 / 5% discount) so the result modal renders it.
  await page.route(
    `**/sws/neo/sales-order/header/${ORDER_ID}/action/createDraftInvoice`,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              id: INVOICE_ID,
              documentNo: INVOICE_HEADER_DR.documentNo,
              grandTotalAmount: INVOICE_HEADER_DR.grandTotalAmount,
              summedLineAmount: INVOICE_HEADER_DR.summedLineAmount,
              etgoTotalDiscount: INVOICE_HEADER_DR.etgoTotalDiscount,
            },
          },
        }),
      });
    },
  );

  // ── Sales invoice detail ────────────────────────────────────────────────
  await page.route(`**/sws/neo/sales-invoice/header/${INVOICE_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const header = invoiceCompletedRef.value ? INVOICE_HEADER_CO : INVOICE_HEADER_DR;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [header] } }),
    });
  });

  await page.route('**/sws/neo/sales-invoice/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: [INVOICE_PRODUCT_LINE, INVOICE_DISCOUNT_LINE], totalRows: 2 },
      }),
    });
  });

  await page.route('**/sws/neo/sales-invoice/evaluate-display{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  // Invoice documentAction=CO: flip the shared flag so the next header fetch
  // returns INVOICE_HEADER_CO; the response payload also carries the CO state.
  await page.route(
    `**/sws/neo/sales-invoice/header/${INVOICE_ID}/action/documentAction`,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      invoiceCompletedRef.value = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { ...INVOICE_HEADER_CO } } }),
      });
    },
  );
}

/**
 * Parse a currency-formatted string ("45.98 €", "45,98 €", "$45.98", etc.)
 * into a number, locale-agnostically. Same helper as the panel-rounding spec.
 */
function parseAmount(text) {
  if (!text) return NaN;
  const cleaned = text.replace(/[^\d,.\-]/g, '');
  if (!cleaned) return NaN;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decIdx = Math.max(lastDot, lastComma);
  if (decIdx === -1) return Number(cleaned);
  const intPart = cleaned.slice(0, decIdx).replace(/[.,]/g, '');
  const decPart = cleaned.slice(decIdx + 1);
  return Number(`${intPart}.${decPart}`);
}

/**
 * Read a totals-panel row value as a number. Returns 0 when the element is
 * missing or has no parseable text, so expect.poll can keep retrying.
 */
async function readRow(page, testId) {
  const el = page.getByTestId(testId);
  const text = (await el.textContent().catch(() => '')) || '';
  const n = parseAmount(text);
  return isNaN(n) ? 0 : n;
}

/**
 * Navigate directly to the mock invoice detail page so the totals panel renders.
 * Simpler and more stable than the full order→confirm→invoice journey.
 * Waits until the totals panel has loaded the lines data (total > 0 or negative).
 */
async function openInvoicePage(page, completedRef = { value: false }) {
  await installOrderToInvoiceMocks(page, completedRef);
  await page.goto(`/sales-invoice/${INVOICE_ID}`);
  await expect(page.getByTestId('totals-row-total-value')).toBeVisible({ timeout: 10_000 });
  // Poll until both rows show non-zero absolute values. The panel renders with
  // "0.00 EUR" while the lines request is in-flight. We use page.evaluate to
  // run parseAmount in the test context (not the page context).
  const readRow = async (testId) => {
    const el = page.getByTestId(testId);
    const text = (await el.textContent()) || '';
    const n = parseAmount(text);
    return isNaN(n) ? 0 : Math.abs(n);
  };
  await expect.poll(() => readRow('totals-row-total-value'),
    { timeout: 10_000, intervals: [200, 300, 500, 1000] }).toBeGreaterThan(0);
  await expect.poll(() => readRow('totals-row-subtotal-value'),
    { timeout: 8_000, intervals: [200, 300, 500, 1000] }).toBeGreaterThan(0);
}

/**
 * Drive the order → invoice journey end-to-end:
 *   open SO → click "Confirmar" → tick "Crear factura" → "Confirmar + factura →"
 *   → click the invoice card in the result modal → land on /sales-invoice/{id}
 *
 * Returns once the invoice detail page has rendered the totals panel.
 */
async function runOrderToInvoiceJourney(page) {
  // Open the sales order.
  await page.goto(`/sales-order/${ORDER_ID}`);

  // The order panel must be visible — the custom window mounted and the
  // sales-order:open-confirm-modal listener is attached.
  await expect(page.getByTestId('totals-row-total-value')).toBeVisible({ timeout: 10_000 });

  // Open the confirm modal. The custom window listens for the event and the
  // detail's draftMode primary action dispatches it (same wiring used by the
  // sales-order-totals-rounding spec).
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal'));
  });

  // Modal opens — its title is unique enough to anchor the card.
  const modalTitle = page.getByText(/Confirmar pedido.*SO-ETP4015-001/);
  await expect(modalTitle).toBeVisible({ timeout: 10_000 });
  const confirmCard = modalTitle.locator(
    'xpath=ancestor::div[contains(@style,"width")][1]',
  );

  // Tick the "Crear factura" checkbox card (Spanish UI).
  await confirmCard.getByText('Crear factura', { exact: false }).first().click();

  // Click the primary action → its label flips to "Confirmar + factura →"
  // once only the invoice checkbox is selected.
  await confirmCard.getByRole('button', { name: /Confirmar \+ factura/ }).click();

  // The result modal opens with a clickable invoice card linking to the new
  // invoice. Click it → navigates to /sales-invoice/{INVOICE_ID}.
  const resultTitle = page.getByText(/Pedido confirmado|Documentos creados/);
  await expect(resultTitle).toBeVisible({ timeout: 10_000 });
  // The card label uses the invoiceDoc key, "Factura #{number}".
  const invoiceCard = page.getByText(/Factura #?SI-ETP4015-001/);
  await expect(invoiceCard).toBeVisible({ timeout: 10_000 });
  await invoiceCard.click();

  await expect(page).toHaveURL(new RegExp(`/sales-invoice/${INVOICE_ID}`));
  // Wait for the invoice totals panel to render.
  await expect(page.getByTestId('totals-row-total-value')).toBeVisible({ timeout: 10_000 });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Sales Order → Sales Invoice — total discount (ETP-4015)', () => {
  test('invoice panel shows Total = 45.98 EUR (no double tax, no lost discount)', async ({ page }) => {
    await login(page);
    await openInvoicePage(page);

    // Poll the assertions so transient React re-renders don't cause false failures.
    await expect.poll(() => readRow(page, 'totals-row-total-value'),
      { timeout: 6_000 }).toBeCloseTo(45.98, 2);
    await expect.poll(() => readRow(page, 'totals-row-subtotal-value'),
      { timeout: 6_000 }).toBeCloseTo(41.80, 2);
    await expect.poll(() => readRow(page, 'totals-row-tax-value'),
      { timeout: 6_000 }).toBeCloseTo(4.18, 2);

    // Forbid the two regression values.
    const total = await readRow(page, 'totals-row-total-value');
    expect(total).not.toBeCloseTo(48.40, 2); // discount lost
    expect(total).not.toBeCloseTo(50.16, 2); // original double-tax bug
  });

  test('DOM invariant: displayed subtotal + tax === displayed total on the new invoice', async ({ page }) => {
    await login(page);
    await openInvoicePage(page);

    // Wait for stable values, then verify the invariant in a single snapshot.
    await expect.poll(() => readRow(page, 'totals-row-total-value'),
      { timeout: 6_000 }).toBeGreaterThan(0);
    const subtotal = await readRow(page, 'totals-row-subtotal-value');
    const tax      = await readRow(page, 'totals-row-tax-value');
    const total    = await readRow(page, 'totals-row-total-value');

    const sum = Math.round((subtotal + tax) * 100) / 100;
    const rounded = Math.round(total * 100) / 100;
    expect(rounded).toBe(sum);
  });

  test('completed invoice (CO) does not double-apply the discount — panel stays at 45.98', async ({ page }) => {
    // Regression guard: processed=true invoices with the ETGO_DTO line already in
    // their lines were showing 39.71 (41.80 × 0.95 = double-discount) instead of
    // 45.98 because LinesBottomSection was passing etgoTotalDiscount=5 to the
    // panel even though the discount was already reflected in the lines.
    // Fix: LinesBottomSection skips the factor when lines contain the ETGO_DTO
    // product (E4BC94E71D664E73A066DAF78BF39DB3) or when data.processed===true.
    await login(page);
    // invoiceCompletedRef.value=true → the header mock returns INVOICE_HEADER_CO
    // (processed: true) immediately on first GET.
    await openInvoicePage(page, { value: true });

    // Poll — same strategy as other tests: wait for the values to stabilise.
    await expect.poll(() => readRow(page, 'totals-row-total-value'),
      { timeout: 6_000 }).toBeCloseTo(45.98, 2);
    await expect.poll(() => readRow(page, 'totals-row-subtotal-value'),
      { timeout: 6_000 }).toBeCloseTo(41.80, 2);
    await expect.poll(() => readRow(page, 'totals-row-tax-value'),
      { timeout: 6_000 }).toBeCloseTo(4.18, 2);

    // Regression guards — must NOT be the double-discount value (39.71).
    const subtotal = await readRow(page, 'totals-row-subtotal-value');
    const tax      = await readRow(page, 'totals-row-tax-value');
    const total    = await readRow(page, 'totals-row-total-value');
    expect(subtotal).not.toBeCloseTo(39.71, 2);
    expect(total).not.toBeCloseTo(39.71 + 3.97, 2);  // 43.68 (double-discount result)
    expect(total).not.toBeCloseTo(48.40, 2);          // 48.40 (discount lost)

    // AEAT invariant: Subtotal + Tax === Total
    const sum = Math.round((subtotal + tax) * 100) / 100;
    const rounded = Math.round(total * 100) / 100;
    expect(rounded).toBe(sum);
  });
});

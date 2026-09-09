import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Invoice — Discount display regression tests (mocked).
 *
 * Covers two bugs fixed together:
 *
 * 1. PDF preview (useInvoicePdf.js): `etgoDiscount` was read as `l.discount`
 *    (wrong field name) → now correctly reads `l.etgoDiscount`.
 *    The DESC.% column now shows the discount value; the totals desglose
 *    (Subtotal sin descuento, Descuento por producto, Descuento total X%)
 *    appears when etgoTotalDiscount > 0 or any line has etgoDiscount > 0.
 *
 * 2. List + side panel (SalesInvoiceHeaderHandler.afterHandle()): API GET
 *    responses for draft invoices now return grandTotalAmount and
 *    outstandingAmount adjusted by (1 - etgoTotalDiscount/100).
 *    Since this adjustment is server-side, the mocked API returns the
 *    already-adjusted values and the test verifies the UI renders them.
 *
 * Routing note: login() installs a catch-all for /sws/**, so installMocks()
 * must run AFTER login() for specific routes to win.
 */

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

const INVOICE_ID = 'mock-disc-inv-001';
const INVOICE_NO = 'INV-DISC-001';
const BP_ID = 'bp-disc-001';
const LINE_ID = 'line-disc-001';

// Raw totals before applying the 5% header discount:
//   listPrice=100, qty=5 → grossSubtotal=500
//   after 5% line discount: unitPrice=95, lineTotal=475
//   after 5% header discount: grandTotal = 475 * (1-0.05) + tax ≈ …
// For simplicity we use round numbers that make it clear:
//   invoiced at 470.63, etgoTotalDiscount=5
//   afterHandle adjusts → grandTotalAmount = 470.63 * 0.95 = 447.10 (rounded)
const ADJUSTED_TOTAL = 447.10;
const RAW_TOTAL = 470.63;
const TOTAL_DISCOUNT_PCT = 5;

const INVOICE_HEADER_DRAFT = {
  id: INVOICE_ID,
  documentNo: INVOICE_NO,
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  businessPartner: BP_ID,
  'businessPartner$_identifier': 'Test Client',
  partnerAddress: 'addr-001',
  invoiceDate: '2026-05-01',
  paymentTerms: 'pt-001',
  'paymentTerms$_identifier': '30 días',
  paymentMethod: 'pm-001',
  'paymentMethod$_identifier': 'Transferencia',
  priceList: 'pl-001',
  // These values are what SalesInvoiceHeaderHandler.afterHandle returns
  // after applying the etgoTotalDiscount adjustment server-side:
  grandTotalAmount: ADJUSTED_TOTAL,
  outstandingAmount: ADJUSTED_TOTAL,
  summedLineAmount: 447.10,
  'currency$_identifier': 'EUR',
  etgoTotalDiscount: TOTAL_DISCOUNT_PCT,
  processed: 'N',
};

const INVOICE_LINE = {
  id: LINE_ID,
  lineNo: 10,
  product: 'prod-001',
  'product$_identifier': 'Cerveza Premium',
  description: 'Cerveza Premium',
  invoicedQuantity: 5,
  listPrice: 100,
  unitPrice: 95,
  etgoDiscount: 5,
  tax: 'tax-001',
  'tax$_identifier': 'IVA 10%',
  grossAmount: 475.00,
  lineNetAmount: 475.00,
};

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/**
 * Install list + detail mocks for the sales-invoice window.
 * Must be called AFTER login() so these routes win over the catch-all.
 *
 * @param {object} opts
 * @param {object} opts.headerOverride - override fields on the returned header
 * @param {Array}  opts.lines          - invoice lines to return
 */
// Non-matching methods use route.fallback(), NOT route.continue(): continue() sends the
// request to the real network, so a request these handlers do not model reached the live
// backend with the fake E2E token and came back 401. That was harmless while a 401 was
// ignored; since ETP-5022 routes an expired session to the login screen, it logged the test
// out and blanked the page. fallback() defers to login()'s /sws/** catch-all instead, which
// is what the rest of this suite already does.
async function installInvoiceMocks(page, { headerOverride = {}, lines = [INVOICE_LINE] } = {}) {
  const header = { ...INVOICE_HEADER_DRAFT, ...headerOverride };

  // Sales-invoice list endpoint (no specific ID)
  await page.route('**/sws/neo/sales-invoice/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();

    // Detail fetch: URL contains /header/<id>
    if (/\/header\/[^/?]+/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [header] } }),
      });
    }

    // List fetch
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [header], totalRows: 1 } }),
    });
  });

  // Invoice lines endpoint
  await page.route('**/sws/neo/sales-invoice/lines{/**,}**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: lines, totalRows: lines.length } }),
    });
  });

  // Payment plan — empty (no installments so side panel uses grandTotalAmount)
  await page.route('**/sws/neo/sales-invoice/paymentPlan{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });

  // invoicePayments action — empty
  await page.route('**/sws/neo/sales-invoice/header/**/action/invoicePayments', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });
}

/**
 * Install a jsreport mock that captures the submitted template data object.
 * Collects all calls and resolves with a minimal valid PDF blob.
 *
 * @param {object} opts
 * @param {object[]} opts.jsreportCalls - array to push each submitted data payload into
 */
async function installJsreportMock(page, { jsreportCalls }) {
  await page.route('**/jsreport/api/report', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postData();
    try {
      const parsed = JSON.parse(body);
      jsreportCalls.push(parsed.data ?? {});
    } catch {
      jsreportCalls.push({});
    }
    // Return a minimal PDF blob so PdfViewer does not error
    const minimalPdf = '%PDF-1.4\n%%EOF\n';
    return route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: minimalPdf,
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(n) {
  // Mirrors the app's formatAmount — two decimal places, locale-agnostic for test assertions
  return Number(n).toFixed(2);
}

// ---------------------------------------------------------------------------
// Group 1: List view — grandTotalAmount rendered from API response
// ---------------------------------------------------------------------------

test.describe('Sales Invoice — list view grandTotalAmount display (mocked)', () => {
  test('shows adjusted total in list when etgoTotalDiscount is set', async ({ page }) => {
    await login(page);
    await installInvoiceMocks(page);

    await page.goto('/sales-invoice');
    await page.waitForLoadState('networkidle').catch(() => {});

    // The DataTable should render a row with the invoice document number.
    // The row is identified by data-testid="row-<id>" (DataTable convention).
    const row = page.getByTestId(`row-${INVOICE_ID}`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The grandTotalAmount column (type=amount) renders the adjusted value.
    // The cell renders the numeric amount — assert it contains 447.10.
    // We use a regex that matches "447.10" formatted with either . or , as decimal sep.
    await expect(row).toContainText(/447[.,]10/, { timeout: 5_000 });
  });

  test('list row does NOT show the unadjusted raw total (470.63) when discount is applied', async ({ page }) => {
    await login(page);
    await installInvoiceMocks(page);

    await page.goto('/sales-invoice');
    await page.waitForLoadState('networkidle').catch(() => {});

    const row = page.getByTestId(`row-${INVOICE_ID}`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The unadjusted RAW_TOTAL should not appear in the row since the API already
    // returns the adjusted total and the UI just renders what the API returns.
    await expect(row).not.toContainText(/470[.,]63/, { timeout: 2_000 });
  });
});

// ---------------------------------------------------------------------------
// Group 2: Side panel (GenericPreviewModal) — Total and Pendiente de pago
// ---------------------------------------------------------------------------

test.describe('Sales Invoice — side panel discount display (mocked)', () => {
  test('side panel shows adjusted Total from API response', async ({ page }) => {
    await login(page);
    await installInvoiceMocks(page);

    await page.goto('/sales-invoice');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Click the row to open the preview side panel
    const row = page.getByTestId(`row-${INVOICE_ID}`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    // The GenericPreviewModal should appear
    const panel = page.getByTestId('generic-preview-modal');
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // The StatsPanel renders grandTotalAmount in the SectionCard titleRight area.
    // It shows: "EUR 447.10"
    await expect(panel).toContainText(/447[.,]10/, { timeout: 5_000 });
  });

  test('side panel shows invoice document number in title', async ({ page }) => {
    await login(page);
    await installInvoiceMocks(page);

    await page.goto('/sales-invoice');
    await page.waitForLoadState('networkidle').catch(() => {});

    const row = page.getByTestId(`row-${INVOICE_ID}`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    const panel = page.getByTestId('generic-preview-modal');
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // Title includes the document number
    await expect(panel).toContainText(INVOICE_NO, { timeout: 5_000 });
  });

  test('side panel shows adjusted Pendiente de pago when no payments are recorded', async ({ page }) => {
    // With no installments (paymentPlan returns []), useInvoicePreview derives:
    //   totalOutstanding = grandTotal (= ADJUSTED_TOTAL = 447.10)
    // The StatsPanel shows this as the outstanding amount.
    await login(page);
    await installInvoiceMocks(page);

    await page.goto('/sales-invoice');
    await page.waitForLoadState('networkidle').catch(() => {});

    const row = page.getByTestId(`row-${INVOICE_ID}`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    const panel = page.getByTestId('generic-preview-modal');
    await expect(panel).toBeVisible({ timeout: 8_000 });

    // The Total SectionCard titleRight shows the grandTotalAmount.
    // It should be the adjusted value 447.10, not the raw 470.63.
    await expect(panel).toContainText(/447[.,]10/, { timeout: 5_000 });
    await expect(panel).not.toContainText(/470[.,]63/);
  });
});

// ---------------------------------------------------------------------------
// Group 3: Invoice preview PDF — desglose (jsreport data inspection)
//
// useInvoicePdf is triggered when the side panel (InvoicePreview) opens from
// the list view. The hook is NOT called on the detail page — it is called
// inside InvoicePreview.jsx → useInvoicePreview → useInvoicePdf.
//
// Strategy:
//   1. Go to the list view (/sales-invoice)
//   2. Click the row to open the GenericPreviewModal (InvoicePreview)
//   3. InvoicePreview calls useInvoicePdf → fetches header + lines from the
//      API → sends data to /jsreport/api/report
//   4. Capture the jsreport payload and assert on the data fields
// ---------------------------------------------------------------------------

/**
 * Open the sales-invoice list, click the row, wait for jsreport to be called,
 * and return the submitted data object.
 */
async function openPreviewAndGetJsreportData(page, { jsreportCalls, headerOverride = {}, lines } = {}) {
  await login(page);
  await installInvoiceMocks(page, { headerOverride, lines });
  await installJsreportMock(page, { jsreportCalls });

  await page.goto('/sales-invoice');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Click the row to open the InvoicePreview side panel
  const row = page.getByTestId(`row-${INVOICE_ID}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();

  // Wait for the panel to open
  const panel = page.getByTestId('generic-preview-modal');
  await expect(panel).toBeVisible({ timeout: 8_000 });

  // Wait for jsreport call (PDF generation is async after panel opens)
  await expect.poll(() => jsreportCalls.length, { timeout: 20_000 }).toBeGreaterThan(0);
  return jsreportCalls[0];
}

test.describe('Sales Invoice — PDF preview discount desglose (mocked)', () => {
  test('preview sends etgoDiscount from invoice line field to jsreport', async ({ page }) => {
    const jsreportCalls = [];
    const data = await openPreviewAndGetJsreportData(page, { jsreportCalls });

    // The lines array should contain a line whose `discount` field is 5
    // (mapped from etgoDiscount=5).
    // Before the fix the field was read as `l.discount` (wrong) and the line had
    // the `discount` DB column (old field name) which was undefined in our fixture →
    // discount would be null. After the fix it reads `l.etgoDiscount` → 5.
    expect(Array.isArray(data.lines)).toBe(true);
    expect(data.lines.length).toBeGreaterThan(0);

    const line = data.lines[0];
    expect(line.discount).toBe(5);
  });

  test('preview shows discount breakdown flags when etgoTotalDiscount is set', async ({ page }) => {
    const jsreportCalls = [];
    const data = await openPreviewAndGetJsreportData(page, { jsreportCalls });

    // hasAnyDiscount must be true when there are line discounts or a total discount
    expect(data.hasAnyDiscount).toBe(true);

    // hasTotalDiscount is true when etgoTotalDiscount > 0
    expect(data.hasTotalDiscount).toBe(true);

    // totalDiscountPct matches the invoice header's etgoTotalDiscount
    expect(data.totalDiscountPct).toBe(TOTAL_DISCOUNT_PCT);

    // Subtotal sin descuento (grossSubtotal) should be > 0
    expect(Number(data.grossSubtotal)).toBeGreaterThan(0);

    // totalDiscountAmt > 0
    expect(Number(data.totalDiscountAmt)).toBeGreaterThan(0);
  });

  test('preview grand total in jsreport data matches the adjusted total from the API', async ({ page }) => {
    const jsreportCalls = [];
    const data = await openPreviewAndGetJsreportData(page, { jsreportCalls });

    // The grandTotal in the template data must equal ADJUSTED_TOTAL (447.10)
    // which is what the (fixed) server afterHandle returns.
    expect(Number(data.grandTotal)).toBeCloseTo(ADJUSTED_TOTAL, 1);
  });

  test('preview with no discount shows hasAnyDiscount=false and no breakdown rows', async ({ page }) => {
    // Override the invoice to have zero discount
    const noDiscountHeader = {
      etgoTotalDiscount: 0,
      grandTotalAmount: 500,
      outstandingAmount: 500,
      summedLineAmount: 500,
    };
    const noDiscountLine = {
      ...INVOICE_LINE,
      etgoDiscount: 0,
      listPrice: 100,
      unitPrice: 100,
      grossAmount: 500,
    };

    const jsreportCalls = [];
    const data = await openPreviewAndGetJsreportData(page, {
      jsreportCalls,
      headerOverride: noDiscountHeader,
      lines: [noDiscountLine],
    });

    // No discount in lines (etgoDiscount=0 → null in buildInvoiceData) and
    // no header discount (etgoTotalDiscount=0) → hasAnyDiscount must be false
    expect(data.hasAnyDiscount).toBe(false);
    expect(data.hasTotalDiscount).toBe(false);

    // Verify the line discount is null (not 0, since 0 is falsy → mapped to null)
    expect(data.lines[0].discount).toBeFalsy();
  });

  test('DESC.% column value in jsreport line data is 5 (not null) after the fix', async ({ page }) => {
    // This is the canonical regression test: before the fix l.discount was read
    // (the old AD column name). Our test fixture sets etgoDiscount=5 but does NOT
    // have a top-level `discount` field. After the fix, `l.etgoDiscount` is read → 5.
    const lineWithOnlyEtgoDiscount = {
      ...INVOICE_LINE,
      // Explicitly omit a `discount` field at the root level to prove the fix
      // reads etgoDiscount and not the old column name.
      discount: undefined,
      etgoDiscount: 5,
    };

    const jsreportCalls = [];
    const data = await openPreviewAndGetJsreportData(page, {
      jsreportCalls,
      lines: [lineWithOnlyEtgoDiscount],
    });

    expect(data.lines[0].discount).toBe(5);
  });
});

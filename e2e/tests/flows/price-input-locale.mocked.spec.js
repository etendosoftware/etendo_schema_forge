import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Price input locale & masking (mocked) — ETP-5107.
 *
 * Mirrors the manually-verified flows from
 * docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §11/§12/§14:
 *
 *   1. Add-line (sales-order, DataTable.jsx inline-add-row): typing a 5+ digit
 *      price live-groups with thousands separators while typing. This is the
 *      exact §14 post-QA regression — `listPrice` is declared `type: 'number'`
 *      in HeaderPage.jsx's `addLineFields.entry` but `type: 'amount'` in
 *      LinesTable.jsx's `columns` (confirmed live in the generated files for
 *      this window) — grouping only works because `renderNumericInputCell`
 *      now also consults `col?.type`.
 *   2. Add-line: the exact live-reproduced probe string from the plan
 *      (§5.1/§5.2), `20,0rrwetwrtwrt2`, filters down to `20,02` — letters
 *      rejected, comma accepted as the decimal separator.
 *   3. Existing-line edit (sales-quotation, InlineLinesPanel.jsx EditCell):
 *      a comma-decimal price commits as the correctly parsed value in the
 *      PATCH body — the literal Bug 1 fix (previously reached NEO Headless
 *      as the broken string "10,50", Error 400).
 *
 * Mock mode only — no Etendo backend required.
 */

// ---------------------------------------------------------------------------
// Group 1/2 — sales-order add-line (mirrors discount-max-autocorrect.mocked.spec.js)
// ---------------------------------------------------------------------------

const ORDER_ID = 'so-etp5107-001';

const DRAFT_ORDER = {
  id: ORDER_ID,
  documentNo: 'SO-ETP5107',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  orderDate: '2026-06-25',
  businessPartner: 'bp-e2e-001',
  'businessPartner$_identifier': 'Test Client',
  partnerAddress: 'addr-e2e-001',
  'partnerAddress$_identifier': 'Test Address',
  priceList: 'pl-e2e-001',
  'priceList$_identifier': 'EUR Price List',
  paymentTerms: 'pt-e2e-001',
  'paymentTerms$_identifier': '30 days',
  warehouse: 'wh-e2e-001',
  'warehouse$_identifier': 'Main Warehouse',
  grandTotalAmount: 0,
  summedLineAmount: 0,
  currency: 'eur-e2e-001',
  'currency$_identifier': 'EUR',
};

async function installSalesOrderMocks(page) {
  await page.route('**/sws/neo/sales-order/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();
    if (url.includes('/selectors/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ id: 'addr-e2e-001', label: 'Test Address', _identifier: 'Test Address' }],
        }),
      });
    }
    const detailMatch = url.match(/\/header\/([^/?]+)/);
    if (detailMatch) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [DRAFT_ORDER] } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_ORDER], totalRows: 1 } }),
    });
  });

  // No existing lines — the inline-add row is the only thing under test.
  await page.route('**/sws/neo/sales-order/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });
}

async function openAddRowPriceField(page) {
  await page.goto(`/sales-order/${ORDER_ID}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  const addLineBtn = page.getByTestId('action-add-lines-empty-state');
  await expect(addLineBtn).toBeVisible({ timeout: 8_000 });
  await addLineBtn.click();

  const inlineAddRow = page.getByTestId('inline-add-row');
  await expect(inlineAddRow).toBeVisible({ timeout: 5_000 });

  const priceInput = inlineAddRow.getByTestId('inline-add-field-listPrice');
  await expect(priceInput).toBeVisible({ timeout: 3_000 });
  return priceInput;
}

test.describe('Add-line price — live thousands-grouping (ETP-5107 §14 regression)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installSalesOrderMocks(page);
  });

  test('typing a 5-digit price groups live with thousands separators while typing', async ({ page }) => {
    const priceInput = await openAddRowPriceField(page);

    // Real per-keystroke typing (not .fill()) — this is what exercises the
    // LIVE re-grouping on every keystroke, not just the final committed value.
    await priceInput.pressSequentially('12345', { delay: 20 });

    // The exact live-reproduced symptom from plan §14: pre-fix this stayed
    // "12345" (no grouping) on the add-line path specifically, while the same
    // field on an EXISTING line already grouped correctly.
    await expect(priceInput).toHaveValue('12.345');
  });

  test('the letters+comma probe string filters down to the exact expected result (plan §5.1/§5.2)', async ({ page }) => {
    const priceInput = await openAddRowPriceField(page);

    await priceInput.pressSequentially('20,0rrwetwrtwrt2', { delay: 10 });

    await expect(priceInput).toHaveValue('20,02');
  });

  test('a leading "-" is accepted (ETP-4567 negative listPrice support), grouped correctly', async ({ page }) => {
    const priceInput = await openAddRowPriceField(page);

    await priceInput.pressSequentially('-1234', { delay: 15 });

    await expect(priceInput).toHaveValue('-1.234');
  });
});

// ---------------------------------------------------------------------------
// Group 3 — sales-quotation existing-line edit (mirrors inline-lines-min-value.mocked.spec.js)
// ---------------------------------------------------------------------------

const QUOT_ID = 'etp5107-mock-quot-001';
const LINE_ID = 'etp5107-line-001';
const BP_UUID = 'A94756453D1011D39A840050044F4CCE';

const DRAFT_QUOTATION = {
  id: QUOT_ID,
  documentNo: 'CQ-ETP5107',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  grandTotalAmount: 100,
  summedLineAmount: 100,
  businessPartner: BP_UUID,
  'businessPartner$_identifier': 'Test BP',
  'currency$_identifier': 'EUR',
};

const QUOTATION_LINE = {
  id: LINE_ID,
  lineNo: 10,
  product: 'prod-1',
  'product$_identifier': 'Test Product',
  orderedQuantity: 2,
  listPrice: 44,
  discount: 0,
  lineGrossAmount: 88,
  tax: 'tax-1',
  'tax$_identifier': 'IVA 21%',
  'currency$_identifier': 'EUR',
};

async function installQuotationMocks(page, { onPatch } = {}) {
  await page.route('**/sws/neo/sales-quotation/quotation?**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_QUOTATION], totalRows: 1 } }),
    });
  });
  await page.route(`**/sws/neo/sales-quotation/quotation/${QUOT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_QUOTATION] } }),
    });
  });
  await page.route(`**/sws/neo/sales-quotation/header/${QUOT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_QUOTATION] } }),
    });
  });
  await page.route('**/sws/neo/sales-quotation/quotationLine{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [QUOTATION_LINE], totalRows: 1 } }),
    });
  });
  await page.route('**/sws/neo/sales-quotation/quotationLine/**', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = JSON.parse(route.request().postData() || '{}');
    onPatch?.({ url: route.request().url(), body });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ ...QUOTATION_LINE, ...body }] } }),
    });
  });
}

test.describe('Existing-line price — comma-decimal commit (ETP-5107 Bug 1 regression)', () => {
  let patchCalls;

  test.beforeEach(async ({ page }) => {
    patchCalls = [];
    await login(page);
    await installQuotationMocks(page, { onPatch: (info) => patchCalls.push(info) });
    await page.goto(`/sales-quotation/${QUOT_ID}`);
    await page.waitForSelector('[data-testid="inline-lines-panel"]', { timeout: 8_000 });
  });

  test('typing a comma-decimal price on an existing line commits the correctly parsed value', async ({ page }) => {
    const row = page.locator(`[data-testid="line-row-${LINE_ID}"]`);
    await row.dispatchEvent('mouseover');
    await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const priceField = row.locator('[data-testid="field-listPrice"]');
    await expect(priceField).toBeVisible({ timeout: 3_000 });
    await priceField.fill('');
    await priceField.pressSequentially('25,50', { delay: 20 });
    await expect(priceField).toHaveValue('25,50');
    await priceField.blur();

    await expect.poll(() => patchCalls.filter((c) => c.body.listPrice !== undefined).length, {
      timeout: 5_000,
    }).toBeGreaterThan(0);

    const patch = patchCalls.find((c) => c.body.listPrice !== undefined);
    // parseLocaleNumber('25,50').value is the real JS Number 25.5 (by design —
    // see parseLocaleNumber.js's own JSDoc/tests), which JSON-serializes as the
    // bare number 25.5, never a zero-padded string. Never "25,50" (the display
    // string) and never rejected as an invalid BigDecimal by the backend (the
    // pre-fix Error 400, plan §3 Bug 1 / §5).
    expect(patch.body.listPrice).toBe(25.5);
  });

  test('letters typed into an existing line price are filtered live, never reach the DOM value', async ({ page }) => {
    const row = page.locator(`[data-testid="line-row-${LINE_ID}"]`);
    await row.dispatchEvent('mouseover');
    await row.locator('[data-testid="line-actions"] button').first().dispatchEvent('click');

    const priceField = row.locator('[data-testid="field-listPrice"]');
    await expect(priceField).toBeVisible({ timeout: 3_000 });
    await priceField.fill('');
    // Exact live-reproduced probe string from the plan (§5, §5.2, Purchase Order
    // and Sales Order existing-line editors both matched this behavior).
    await priceField.pressSequentially('20,0rrwetwrtwrt2', { delay: 10 });

    await expect(priceField).toHaveValue('20,02');
  });
});

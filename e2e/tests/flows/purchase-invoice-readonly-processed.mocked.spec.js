import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Purchase Invoice — read-only fields when processed (mocked).
 *
 * Verifies ETP-4012: businessPartner, partnerAddress, paymentMethod,
 * paymentTerms, and priceList are disabled when the invoice has
 * processed=true (documentStatus='CO').
 *
 * Regression guard: orderReference has NO readOnlyLogic in decisions.json
 * by design — it must stay editable even on completed invoices.
 *
 * Routing note: login() installs a catch-all for /sws/**, so installMocks()
 * must run AFTER login() so specific routes win.
 */

const INV_CO_ID = 'inv-co-001';
const INV_DR_ID = 'inv-dr-001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPLETED_INVOICE = {
  id: INV_CO_ID,
  orderReference: 'SUPPLIER-REF-123',
  documentNo: 'PC-00042',
  invoiceDate: '2026-05-01',
  businessPartner: 'bp-001',
  'businessPartner$_identifier': 'Test Supplier S.A.',
  partnerAddress: 'addr-001',
  'partnerAddress$_identifier': 'Calle Test 1',
  paymentMethod: 'pm-001',
  'paymentMethod$_identifier': 'Efectivo',
  paymentTerms: 'pt-001',
  'paymentTerms$_identifier': '30 Días',
  priceList: 'pl-001',
  'priceList$_identifier': 'Tarifa de compra principal',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  documentAction: '--',
  processed: true,
  posted: 'N',
  grandTotalAmount: 100.0,
  summedLineAmount: 100.0,
  outstandingAmount: 100.0,
};

// ETP-4933's regen surfaced an AD readOnlyLogic on orderReference that this file
// predates: it locks POReference once the invoice has been submitted to the AEAT
// SII (`aeatsiiIssent === true`, and only for purchase — not sales — transactions,
// i.e. `salesTransaction !== true`). Confirmed correct with Gremiger. It does not
// conflict with the "editable when completed" guard above (COMPLETED_INVOICE):
// `processed: true` alone must still leave orderReference editable — only SII
// submission locks it. See artifacts/purchase-invoice/__tests__/contract-integrity.test.js
// for the contract/generated-source assertions of the same rule.
const SII_SENT_INVOICE = {
  ...COMPLETED_INVOICE,
  id: 'inv-co-sii-001',
  aeatsiiIssent: true,
  salesTransaction: false,
};

const DRAFT_INVOICE = {
  id: INV_DR_ID,
  orderReference: 'SUPPLIER-REF-456',
  documentNo: 'PC-00043',
  invoiceDate: '2026-05-10',
  businessPartner: 'bp-002',
  'businessPartner$_identifier': 'Draft Supplier S.L.',
  partnerAddress: 'addr-002',
  'partnerAddress$_identifier': 'Calle Draft 2',
  paymentMethod: 'pm-001',
  'paymentMethod$_identifier': 'Efectivo',
  paymentTerms: 'pt-001',
  'paymentTerms$_identifier': '30 Días',
  priceList: 'pl-001',
  'priceList$_identifier': 'Tarifa de compra principal',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  documentAction: 'CO',
  processed: false,
  posted: 'N',
  grandTotalAmount: 0.0,
  summedLineAmount: 0.0,
  outstandingAmount: 0.0,
};

// ---------------------------------------------------------------------------
// Mock installer
// ---------------------------------------------------------------------------

/**
 * Install mocks for the purchase-invoice detail endpoint.
 * Routes are installed AFTER login() so they take precedence over the
 * catch-all /sws/** stub.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} invoice - The invoice fixture to serve on detail GET
 */
async function installMocks(page, invoice) {
  // Detail endpoint
  await page.route(`**/sws/neo/purchase-invoice/header/${invoice.id}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [invoice] } }),
      });
      return;
    }
    route.fallback();
  });

  // Lines endpoint — return empty so the form renders cleanly
  await page.route('**/sws/neo/purchase-invoice/lines{/**,}**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  // evaluate-display — return {} so client-side readOnlyLogic drives the UI
  await page.route('**/sws/neo/purchase-invoice/evaluate-display{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Purchase Invoice — readOnlyLogic when processed (mocked)', () => {
  test('businessPartner is disabled when processed', async ({ page }) => {
    await login(page);
    await installMocks(page, COMPLETED_INVOICE);

    await page.goto(`/purchase-invoice/${INV_CO_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const fieldRoot = page.getByTestId('field-businessPartner');
    await expect(fieldRoot).toBeVisible({ timeout: 8_000 });

    const control = fieldRoot.locator('input, button').first();
    await expect(control).toBeDisabled({ timeout: 5_000 });
  });

  test('partnerAddress is disabled when processed', async ({ page }) => {
    await login(page);
    await installMocks(page, COMPLETED_INVOICE);

    await page.goto(`/purchase-invoice/${INV_CO_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const fieldRoot = page.getByTestId('field-partnerAddress');
    await expect(fieldRoot).toBeVisible({ timeout: 8_000 });

    const control = fieldRoot.locator('input, button').first();
    await expect(control).toBeDisabled({ timeout: 5_000 });
  });

  test('paymentMethod is disabled when processed', async ({ page }) => {
    await login(page);
    await installMocks(page, COMPLETED_INVOICE);

    await page.goto(`/purchase-invoice/${INV_CO_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const fieldRoot = page.getByTestId('field-paymentMethod');
    await expect(fieldRoot).toBeVisible({ timeout: 8_000 });

    const control = fieldRoot.locator('input, button').first();
    await expect(control).toBeDisabled({ timeout: 5_000 });
  });

  test('paymentTerms is disabled when processed', async ({ page }) => {
    await login(page);
    await installMocks(page, COMPLETED_INVOICE);

    await page.goto(`/purchase-invoice/${INV_CO_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const fieldRoot = page.getByTestId('field-paymentTerms');
    await expect(fieldRoot).toBeVisible({ timeout: 8_000 });

    const control = fieldRoot.locator('input, button').first();
    await expect(control).toBeDisabled({ timeout: 5_000 });
  });

  test('orderReference remains editable when processed (regression guard)', async ({ page }) => {
    await login(page);
    await installMocks(page, COMPLETED_INVOICE);

    await page.goto(`/purchase-invoice/${INV_CO_ID}`);
    await page.waitForLoadState('domcontentloaded');

    const fieldRoot = page.getByTestId('field-orderReference');
    await expect(fieldRoot).toBeVisible({ timeout: 8_000 });

    // The testid is placed directly on the <input> element for text-type fields,
    // so fieldRoot itself is the control to assert against.
    await expect(fieldRoot).toBeEnabled({ timeout: 5_000 });
  });

  // ETP-4933: the new-to-this-suite locked state. Distinct from the `processed`-only
  // COMPLETED_INVOICE case above (which asserts orderReference stays editable) —
  // here the invoice has ALSO been declared to the AEAT SII, which is the only
  // thing that locks it per the AD rule confirmed by Gremiger.
  test('orderReference is disabled once the invoice has been submitted to the SII (aeatsiiIssent: true)', async ({ page }) => {
    await login(page);
    await installMocks(page, SII_SENT_INVOICE);

    await page.goto(`/purchase-invoice/${SII_SENT_INVOICE.id}`);
    await page.waitForLoadState('domcontentloaded');

    const fieldRoot = page.getByTestId('field-orderReference');
    await expect(fieldRoot).toBeVisible({ timeout: 8_000 });
    await expect(fieldRoot).toBeDisabled({ timeout: 5_000 });
  });

  test('draft invoice has editable businessPartner (contrast check)', async ({ page }) => {
    await login(page);
    await installMocks(page, DRAFT_INVOICE);

    await page.goto(`/purchase-invoice/${INV_DR_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // With a pre-existing businessPartner value, the editable SearchInput
    // renders the SelectorChip variant (`field-{key}-chip`). The read-only
    // path renders a disabled <Input> wrapped by `field-{key}` instead, so
    // chip visibility alone is the contrast against the completed cases.
    const chip = page.getByTestId('field-businessPartner-chip');
    await expect(chip).toBeVisible({ timeout: 8_000 });

    // Clicking the chip flips editingIntent and reveals the editable <input>.
    await chip.click();
    const input = page.getByTestId('field-businessPartner');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await expect(input).toBeEnabled({ timeout: 5_000 });
  });
});

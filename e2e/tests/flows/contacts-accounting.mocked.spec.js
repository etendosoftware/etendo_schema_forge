import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts — Customer Accounting / Vendor Accounting tabs (mocked).
 *
 * ETP-4402 wired two new secondary tabs into `decisions.json →
 * window.secondaryTabs`: `customerAccounting` (C_BP_Customer_Acct) and
 * `vendorAccounting` (C_BP_Vendor_Acct), both `tabMode: "table-form"` and
 * rendered with `linesLayout: "inlineEditable"` (same as Person/Bank
 * Account/Location).
 *
 * `contacts-integration.spec.js` is a live-backend integration spec (skipped
 * unless E2E_USE_MOCK=0), so it is not a suitable home for CI-safe coverage —
 * this is a new sibling `.mocked.spec.js`, mirroring the pattern already used
 * by `contacts-bank-account-add-row.mocked.spec.js`.
 *
 * Covers the previously-untested surface:
 *   - Both tabs are present and show their respective GL account columns.
 *   - `accountingSchema` never renders as a column or an add-line field on
 *     either tab — `CustomerAccountingHandler` / `VendorAccountingHandler`
 *     auto-fill it server-side on POST when absent from the request body.
 *
 * Mock mode only: routes are installed AFTER login() so they win over the
 * generic `/sws/**` catch-all (Playwright LIFO route matching).
 */

const BP_ID = 'bp-acct-mock-001';
const BP_ROW = {
  id: BP_ID,
  name: 'Test Business Partner Accounting',
  searchKey: 'TEST_BP_ACCT',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
};

const CUSTOMER_ACCOUNTING_ROW = {
  id: 'ca-001',
  customerReceivablesNo: 'gl-001',
  'customerReceivablesNo$_identifier': '4300000 Clientes',
  customerPrepayment: 'gl-002',
  'customerPrepayment$_identifier': '4380000 Anticipos de clientes',
  accountingSchema: 'schema-001',
};

const VENDOR_ACCOUNTING_ROW = {
  id: 'va-001',
  vendorLiability: 'gl-003',
  'vendorLiability$_identifier': '4000000 Proveedores',
  vendorPrepayment: 'gl-004',
  'vendorPrepayment$_identifier': '4070000 Anticipos a proveedores',
  accountingSchema: 'schema-001',
};

async function installBaseMocks(page, { customerRows = [], vendorRows = [] } = {}) {
  await page.route('**/sws/neo/contacts/businessPartner**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'GET' && !/\/businessPartner\/[^/?]+/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [BP_ROW], totalRows: 1 } }) });
    }
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [BP_ROW] } }) });
    }
    route.fallback();
  });

  await page.route('**/sws/neo/contacts/customerAccounting**', async (route) => {
    const url = route.request().url();
    if (/\/customerAccounting\/selectors\//.test(url)) return route.fallback();
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: customerRows, totalRows: customerRows.length } }) });
  });

  await page.route('**/sws/neo/contacts/vendorAccounting**', async (route) => {
    const url = route.request().url();
    if (/\/vendorAccounting\/selectors\//.test(url)) return route.fallback();
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: vendorRows, totalRows: vendorRows.length } }) });
  });

  // Other secondary tabs / related entities — return empty so they never
  // trigger unrelated fetch errors while we exercise the accounting tabs.
  for (const entity of ['contact', 'bankAccount', 'locationAddress', 'customer', 'vendorCreditor']) {
    await page.route(`**/sws/neo/contacts/${entity}**`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [], totalRows: 0 } }) });
      }
      route.fallback();
    });
  }
}

test.describe('Contacts — Customer Accounting tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installBaseMocks(page, { customerRows: [CUSTOMER_ACCOUNTING_ROW] });
    await page.goto(`/contacts/${BP_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  });

  test('tab shows Customer Receivables No. / Customer Prepayment columns; accountingSchema is hidden', async ({ page }) => {
    const tab = page.getByTestId('tab-customerAccounting');
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click();

    await expect(page.getByTestId('column-header-customerReceivablesNo')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('column-header-customerPrepayment')).toBeVisible();
    await expect(page.getByTestId('column-header-accountingSchema')).toHaveCount(0);

    await expect(page.getByText('4300000 Clientes')).toBeVisible();
  });

  test('Add Line exposes the customer GL fields but never accountingSchema', async ({ page }) => {
    await page.getByTestId('tab-customerAccounting').click();

    const addBtn = page.getByTestId('action-add-line');
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('inline-add-field-customerReceivablesNo')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-customerPrepayment')).toBeVisible();

    // CustomerAccountingHandler auto-fills accountingSchema server-side.
    await expect(page.getByTestId('inline-add-field-accountingSchema')).toHaveCount(0);
  });
});

test.describe('Contacts — Vendor Accounting tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installBaseMocks(page, { vendorRows: [VENDOR_ACCOUNTING_ROW] });
    await page.goto(`/contacts/${BP_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  });

  test('tab shows Vendor Liability / Vendor Prepayment columns; accountingSchema is hidden', async ({ page }) => {
    const tab = page.getByTestId('tab-vendorAccounting');
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click();

    await expect(page.getByTestId('column-header-vendorLiability')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('column-header-vendorPrepayment')).toBeVisible();
    await expect(page.getByTestId('column-header-accountingSchema')).toHaveCount(0);

    await expect(page.getByText('4000000 Proveedores')).toBeVisible();
  });

  test('Add Line exposes the vendor GL fields but never accountingSchema', async ({ page }) => {
    await page.getByTestId('tab-vendorAccounting').click();

    const addBtn = page.getByTestId('action-add-line');
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('inline-add-field-vendorLiability')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-vendorPrepayment')).toBeVisible();

    // VendorAccountingHandler auto-fills accountingSchema server-side.
    await expect(page.getByTestId('inline-add-field-accountingSchema')).toHaveCount(0);
  });
});

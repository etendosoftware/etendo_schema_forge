import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Business Partner Category — Accounting tab (mocked).
 *
 * ETP-4402 onboarded this window from scratch. The header entity
 * (`businessPartnerCategory`, table `C_BP_Group`) exposes an Accounting tab
 * (`window.detailEntity: "accounting"`, `linesLayout: "inlineEditable"`) with
 * 20 ValidCombination GL account selectors, one row per accounting schema.
 *
 * `window.addLineGuard` only allows adding a NEW accounting row when the
 * record currently has ZERO accounting rows (`children.length < 1`) — rows
 * are normally pre-created by Etendo per accounting schema. This spec covers:
 *
 *   - The Accounting tab is present and shows the primary GL columns
 *     (Customer Receivables No., Customer Prepayment, Write-off, Vendor
 *     Liability, Vendor Prepayment) plus at least one secondary GL column.
 *   - `accountingSchema` never renders as a column (system field, hidden).
 *   - On a record with no existing accounting rows, Add Line exposes the
 *     mandatory GL selectors but never accountingSchema (auto-filled
 *     server-side by `BusinessPartnerCategoryAccountingHandler`).
 *
 * Mock mode only: routes are installed AFTER login() so they win over the
 * generic `/sws/**` catch-all (Playwright LIFO route matching).
 */

const CATEGORY_ROW = {
  id: 'bpc-001',
  searchKey: 'CLIENTES',
  name: 'Clientes',
  description: 'Categoría de clientes',
  default: false,
};

const ACCOUNTING_ROW = {
  id: 'bpc-acct-001',
  customerReceivablesNo: 'gl-001',
  'customerReceivablesNo$_identifier': '4300000 Clientes',
  customerPrepayment: 'gl-002',
  'customerPrepayment$_identifier': '4380000 Anticipos de clientes',
  writeoff: 'gl-003',
  'writeoff$_identifier': '6500000 Pérdidas de créditos comerciales',
  vendorLiability: 'gl-004',
  'vendorLiability$_identifier': '4000000 Proveedores',
  vendorPrepayment: 'gl-005',
  'vendorPrepayment$_identifier': '4070000 Anticipos a proveedores',
  nonInvoicedReceipts: 'gl-006',
  'nonInvoicedReceipts$_identifier': '4090000 Envases y embalajes a devolver',
  accountingSchema: 'schema-001',
};

async function installHeaderMock(page) {
  await page.route('**/sws/neo/business-partner-category/businessPartnerCategory**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/businessPartnerCategory\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [CATEGORY_ROW], totalRows: 1 } }),
      });
      return;
    }
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [CATEGORY_ROW] } }),
      });
      return;
    }
    route.fallback();
  });
}

async function installAccountingMock(page, rows) {
  await page.route('**/sws/neo/business-partner-category/accounting**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (/\/accounting\/selectors\//.test(url)) return route.fallback();
    if (req.method() !== 'GET') return route.fallback();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
    });
  });
}

test.describe('Business Partner Category — Accounting tab (existing rows)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installHeaderMock(page);
    await installAccountingMock(page, [ACCOUNTING_ROW]);
    await page.goto(`/business-partner-category/${CATEGORY_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Accounting tab shows the primary and secondary GL account columns; accountingSchema is hidden', async ({ page }) => {
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });

    const accountingTab = page.getByTestId('tab-lines');
    await expect(accountingTab).toBeVisible({ timeout: 10_000 });
    await accountingTab.click();

    // Primary columns (grow: true — share the row width).
    await expect(page.getByTestId('column-header-customerReceivablesNo')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('column-header-customerPrepayment')).toBeVisible();
    await expect(page.getByTestId('column-header-writeoff')).toBeVisible();
    await expect(page.getByTestId('column-header-vendorLiability')).toBeVisible();
    await expect(page.getByTestId('column-header-vendorPrepayment')).toBeVisible();

    // Secondary GL account column (sample) also present and editable.
    await expect(page.getByTestId('column-header-nonInvoicedReceipts')).toBeVisible();

    // accountingSchema is a system field (addLineFromSibling) — never a visible column.
    await expect(page.getByTestId('column-header-accountingSchema')).toHaveCount(0);

    await expect(page.getByText('4300000 Clientes')).toBeVisible();
  });
});

test.describe('Business Partner Category — Accounting tab (no existing rows)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installHeaderMock(page);
    await installAccountingMock(page, []);
    await page.goto(`/business-partner-category/${CATEGORY_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Add Line exposes the mandatory GL selectors but never accountingSchema', async ({ page }) => {
    await page.getByTestId('tab-lines').click();

    // window.addLineGuard only allows adding when there are zero existing rows.
    const addBtn = page.getByTestId('action-add-line');
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('inline-add-field-customerReceivablesNo')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-writeoff')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-vendorLiability')).toBeVisible();

    // BusinessPartnerCategoryAccountingHandler auto-fills accountingSchema
    // server-side — it must never appear as a user-fillable field.
    await expect(page.getByTestId('inline-add-field-accountingSchema')).toHaveCount(0);
  });
});

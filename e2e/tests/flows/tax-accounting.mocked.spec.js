import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Tax — Accounting tab (mocked).
 *
 * ETP-4402 onboarded the `accounting` entity (`C_Tax_Acct`) as the primary
 * detail entity (`window.detailEntity: "accounting"`), rendered with the
 * classic add-line grid. This spec covers the previously-untested surface:
 *
 *   - The Accounting tab (`tab-lines`, labelled "Accounting") is present and
 *     shows the `Tax Due` / `Tax Credit` GL account columns.
 *   - `accountingSchema` (system field, auto-filled server-side by
 *     `TaxAccountingHandler`) never renders as a column or as an add-line
 *     field — the user cannot see or edit it.
 *
 * NOTE: the running spec name for this window is `tax-rate` (see
 * `api.baseUrl` in the generated `TaxPage.jsx`), NOT the `tax` route slug.
 *
 * Mock mode only: routes are installed AFTER login() so they win over the
 * generic `/sws/**` catch-all (Playwright LIFO route matching).
 */

const TAX_ROW = {
  id: 'tax-001',
  name: 'IVA 21%',
  rate: 21,
  applicableTo: 'B',
  'applicableTo$_identifier': 'Both',
  validFrom: '2026-01-01',
  docTaxAmount: 'DOC',
  baseAmount: 'NET',
};

const ACCOUNTING_ROW = {
  id: 'acct-001',
  taxDue: 'gl-001',
  'taxDue$_identifier': '4770000 IVA soportado',
  taxCredit: 'gl-002',
  'taxCredit$_identifier': '4720000 IVA repercutido',
  accountingSchema: 'schema-001',
};

async function installMocks(page, { accountingRows = [ACCOUNTING_ROW] } = {}) {
  await page.route('**/sws/neo/tax-rate/tax**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/tax\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [TAX_ROW], totalRows: 1 } }),
      });
      return;
    }
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [TAX_ROW] } }),
      });
      return;
    }
    route.fallback();
  });

  await page.route('**/sws/neo/tax-rate/accounting**', async (route) => {
    const req = route.request();
    const url = req.url();

    // Selector endpoints (e.g. /accounting/selectors/taxDue) fall through to
    // the generic /sws/** catch-all installed by login().
    if (/\/accounting\/selectors\//.test(url)) return route.fallback();
    if (req.method() !== 'GET') return route.fallback();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: accountingRows, totalRows: accountingRows.length } }),
    });
  });
}

test.describe('Tax — Accounting tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/tax/${TAX_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Accounting tab is present and shows Tax Due / Tax Credit columns; accountingSchema is hidden', async ({ page }) => {
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });

    const accountingTab = page.getByTestId('tab-lines');
    await expect(accountingTab).toBeVisible({ timeout: 10_000 });
    await accountingTab.click();

    await expect(page.getByTestId('column-header-taxDue')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('column-header-taxCredit')).toBeVisible();

    // accountingSchema is a system field (addLineFromSibling) — never a visible column.
    await expect(page.getByTestId('column-header-accountingSchema')).toHaveCount(0);

    // The existing accounting row renders with its GL account identifiers.
    await expect(page.getByText('4770000 IVA soportado')).toBeVisible();
    await expect(page.getByText('4720000 IVA repercutido')).toBeVisible();
  });

  test('Add Line exposes Tax Due / Tax Credit but never accountingSchema', async ({ page }) => {
    await page.getByTestId('tab-lines').click();

    const addBtn = page.getByTestId('action-add-line');
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();

    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('inline-add-field-taxDue')).toBeVisible();
    await expect(page.getByTestId('inline-add-field-taxCredit')).toBeVisible();

    // TaxAccountingHandler auto-fills accountingSchema server-side — it must
    // never appear as a user-fillable field in the add-line form.
    await expect(page.getByTestId('inline-add-field-accountingSchema')).toHaveCount(0);
  });
});

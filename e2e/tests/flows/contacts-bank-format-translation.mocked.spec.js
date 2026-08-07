import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Contacts — Cuenta Bancaria "Formato" translation coverage (ETP-4685, mocked).
 *
 * Regression guard for the 3 places an enum column's label can render:
 *   1. Read-only cell (InlineLinesPanel ReadCell) — the row as shown BEFORE
 *      the user clicks to edit it. Fixed today: previously fell through to
 *      the raw backend identifier, never resolving col.enumLabels via ui().
 *   2. Inline-edit Select (InlineLinesPanel EditCell) — already fixed in an
 *      earlier ETP-4685 pass, but had no e2e coverage until now.
 *   3. Add-row Select (DataTable InlineAddRow) — fixed today: previously
 *      rendered the raw AD `label` (English name), ignoring the per-option
 *      `labels` map the generator emits.
 *
 * Mock mode only.
 */

const BP_ID = 'bp-mock-002';
const BP_ROW = {
  id: BP_ID,
  name: 'Test Business Partner',
  searchKey: 'TEST_BP2',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
};

const BANK_LINE_GENERIC = {
  id: 'bank-generic-001',
  bankName: 'Santander',
  bankFormat: 'GENERIC',
  accountNo: '1234567890',
  iBAN: '',
  swiftCode: '',
  displayedAccount: '1234567890',
};

async function installMocks(page) {
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

  await page.route('**/sws/neo/contacts/bankAccount**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [BANK_LINE_GENERIC], totalRows: 1 } }) });
    }
    if (method === 'POST') {
      const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [{ id: 'bank-new-001', ...body }] } }) });
    }
    route.fallback();
  });

  for (const entity of ['contact', 'locationAddress', 'customer', 'vendorCreditor']) {
    await page.route(`**/sws/neo/contacts/${entity}**`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [], totalRows: 0 } }) });
      }
      route.fallback();
    });
  }
}

test.describe('Contacts — Cuenta Bancaria Formato translation (ETP-4685)', () => {
  test('existing row (read-only) shows the translated Format label, not the raw i18n key or English', async ({ page }) => {
    await login(page);
    await installMocks(page);

    await page.goto(`/contacts/${BP_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    await page.getByTestId('tab-bankAccount').click();

    await expect(page.getByText('Utilizar Número Genérico de Cuenta')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('bankFormatGeneric')).toHaveCount(0);
    await expect(page.getByText('Use Generic Account No.')).toHaveCount(0);
  });

  test('editing an existing row shows translated Format options in the Select', async ({ page }) => {
    await login(page);
    await installMocks(page);

    await page.goto(`/contacts/${BP_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    await page.getByTestId('tab-bankAccount').click();
    await expect(page.getByText('Utilizar Número Genérico de Cuenta')).toBeVisible({ timeout: 10_000 });

    const row = page.getByTestId('line-row-bank-generic-001');
    await row.hover();
    const actions = row.getByTestId('line-actions');
    await actions.getByRole('button').first().click();

    const trigger = row.getByTestId('field-bankFormat');
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();

    await expect(page.getByRole('option', { name: 'Utilizar IBAN' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('option', { name: 'Usar código SWIFT + Número Genérico de Cuenta' })).toBeVisible();
    await expect(page.getByText('bankFormatIban')).toHaveCount(0);
  });

  test('add-row Select shows translated Format options', async ({ page }) => {
    await login(page);
    await installMocks(page);

    await page.goto(`/contacts/${BP_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    await page.getByTestId('tab-bankAccount').click();
    await expect(page.getByText('Utilizar Número Genérico de Cuenta')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('action-add-line').click();
    await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });

    const addRowFormatTrigger = page.getByTestId('inline-add-field-bankFormat');
    await expect(addRowFormatTrigger).toBeVisible({ timeout: 5_000 });
    await addRowFormatTrigger.click();

    await expect(page.getByRole('option', { name: 'Utilizar Número Genérico de Cuenta' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('option', { name: 'Utilizar IBAN' })).toBeVisible();
    await expect(page.getByText('Use Generic Account No.')).toHaveCount(0);
  });
});

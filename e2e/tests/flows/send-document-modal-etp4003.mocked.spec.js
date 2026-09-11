/**
 * Mocked E2E coverage for the editable SendDocumentModal recipient controls.
 *
 * Run: cd e2e && npx playwright test tests/flows/send-document-modal-etp4003.mocked.spec.js
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

const SI_ROWS = [{
  id: 'si-001',
  documentNo: 'INV-001',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  'businessPartner$_identifier': 'ACME Corp',
  grandTotalAmount: 1000,
  invoiceDate: '2026-01-15',
  bpartnerId: 'bp-001',
}];

async function installSalesInvoiceMock(page) {
  await page.route('**/sws/neo/sales-invoice/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: SI_ROWS, totalRows: SI_ROWS.length } }) });
      return;
    }
    if (req.method() === 'GET') {
      const m = url.match(/\/header\/([^/?]+)/);
      const found = SI_ROWS.find((r) => r.id === m?.[1]) ?? SI_ROWS[0];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [found] } }) });
      return;
    }
    route.fallback();
  });
  await page.route('**/sws/neo/contacts/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [] } }) });
  });
  await page.route('**/api/reports/*/render', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>PDF Preview</body></html>' });
  });
}

test.describe('SendDocumentModal editable recipients (ETP-4003 / ETP-4226)', () => {
  const TEST_EMAIL = 'buyer@example.com';

  test.beforeEach(async ({ page }) => {
    await login(page);
    await installSalesInvoiceMock(page);
    await page.goto('/sales-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  async function openSendModal(page) {
    const firstRow = page.locator('tbody tr').filter({ hasText: 'INV-001' }).first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.hover();
    const emailBtn = firstRow.getByTestId('row-quick-action-email');
    await expect(emailBtn).toBeVisible({ timeout: 5_000 });
    const contactsDone = page.waitForResponse(
      r => r.url().includes('/sws/neo/contacts'),
      { timeout: 8_000 },
    ).catch(() => {});
    await emailBtn.click();
    const toInput = page.getByTestId('send-modal-to-input');
    await expect(toInput).toBeVisible({ timeout: 8_000 });
    await contactsDone;
    return toInput;
  }

  test('row email quick-action opens the Send modal with the editable To field', async ({ page }) => {
    const toInput = await openSendModal(page);
    await expect(toInput).not.toHaveAttribute('readonly', '');
    await expect(toInput).toBeEditable();
  });

  test('typing an email and pressing Enter creates a removable recipient chip', async ({ page }) => {
    const toInput = await openSendModal(page);
    await expect(page.getByTestId(`send-modal-to-chip-${TEST_EMAIL}`)).toHaveCount(0);
    await toInput.fill(TEST_EMAIL);
    await toInput.press('Enter');
    const chip = page.getByTestId(`send-modal-to-chip-${TEST_EMAIL}`);
    await expect(chip).toBeVisible({ timeout: 5_000 });
    await expect(toInput).toHaveValue('');
    await page.getByTestId(`send-modal-to-remove-${TEST_EMAIL}`).click();
    await expect(chip).toHaveCount(0);
  });

  test('Send is disabled while To is empty and enabled after adding a recipient', async ({ page }) => {
    const toInput = await openSendModal(page);
    const sendBtn = page.locator('button').filter({ hasText: /^(Enviar|Send)$/i });
    await expect(sendBtn).toBeDisabled({ timeout: 5_000 });
    await toInput.fill(TEST_EMAIL);
    await toInput.press('Enter');
    await expect(page.getByTestId(`send-modal-to-chip-${TEST_EMAIL}`)).toBeVisible({ timeout: 5_000 });
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  });

  test('the add-CC affordance reveals the CC chip editor', async ({ page }) => {
    await openSendModal(page);
    const addCc = page.getByTestId('send-modal-add-cc');
    await expect(addCc).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('send-modal-cc-input')).toHaveCount(0);
    await addCc.click();
    await expect(page.getByTestId('send-modal-cc-input')).toBeVisible({ timeout: 5_000 });
  });
});

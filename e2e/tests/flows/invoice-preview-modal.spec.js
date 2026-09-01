import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Invoice Preview — modal lifecycle tests.
 *
 * Tests the GenericPreviewModal shell: open via row click, close via X button,
 * close via backdrop, tab rendering, and Edit navigation.
 *
 * Uses the purchase-invoice window because its left panel is a drop zone managed
 * entirely by GenericPreviewModal — no jsreport dependency.
 *
 * All tests run in mock mode (no BASE_URL) using a single synthetic row.
 * The locale defaults to es_ES; selectors use regex where both locales apply.
 */

const ROW = {
  id: 'pi-modal-test-001',
  documentNo: 'PI-MODAL-001',
  invoiceDate: '2026-05-01',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completed',
  businessPartner: 'bp-001',
  'businessPartner$_identifier': 'Test Supplier S.A.',
  grandTotalAmount: 1500.00,
  outstandingAmount: 0,
  paymentComplete: true,
  eTGODueDate: '2026-06-01',
  eTGODeliveryStatus: 100,
  transactionDocument: 'td-001',
  'transactionDocument$_identifier': 'AP Invoice',
};

async function seedPurchaseInvoiceRows(page, rows = [ROW]) {
  await page.route('**/sws/neo/purchase-invoice/header{/**,}**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
    } else {
      route.fallback();
    }
  });
}

async function openPreview(page) {
  const row = page.getByTestId(`row-${ROW.id}`);
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  await row.click();
  await expect(page.getByTestId('generic-preview-modal')).toBeVisible({ timeout: 5_000 });
}

test.describe('Invoice Preview — modal lifecycle (purchase invoice)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await seedPurchaseInvoiceRows(page);
    await navigateTo(page, 'purchase-invoice');
  });

  test('row click opens the preview modal', async ({ page }) => {
    const row = page.getByTestId(`row-${ROW.id}`);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.click();

    const modal = page.getByTestId('generic-preview-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Invoice document number appears in the title area
    await expect(modal.getByText(ROW.documentNo)).toBeVisible();
  });

  test('close button (X) dismisses the modal', async ({ page }) => {
    await openPreview(page);

    // The X button has aria-label = ui('close') → "Cerrar" (es_ES) or "Close" (en_US)
    const closeBtn = page.getByRole('button', { name: /cerrar|close/i }).first();
    await closeBtn.click();

    // After 280ms slide-out animation the modal is unmounted
    await expect(page.getByTestId('generic-preview-modal')).not.toBeVisible({ timeout: 2_000 });
  });

  test('clicking the backdrop dismisses the modal', async ({ page }) => {
    await openPreview(page);

    // Click the semi-transparent backdrop area (fixed overlay behind the card).
    // The overlay covers the full viewport; click at top-left corner which is
    // guaranteed to be outside the right-anchored side panel.
    await page.mouse.click(10, 10);

    await expect(page.getByTestId('generic-preview-modal')).not.toBeVisible({ timeout: 2_000 });
  });

  test('the General tab is rendered', async ({ page }) => {
    await openPreview(page);

    const modal = page.getByTestId('generic-preview-modal');

    // General is the only tab InvoicePreview declares today (same in both
    // locales) — the modal shell no longer ships Messages/History tabs.
    const generalTab = modal.getByRole('button', { name: 'General' });
    await expect(generalTab).toBeVisible();
  });

  test('Edit button navigates to the detail page', async ({ page }) => {
    await openPreview(page);

    // Edit button text: "Editar" (es_ES) or "Edit" (en_US)
    const editBtn = page.getByTestId('generic-preview-modal').getByRole('button', { name: /editar|edit/i });
    await editBtn.click();

    // After the closingUp animation (280ms), the window navigates to the detail page.
    // The URL should contain the invoice id.
    await page.waitForURL(`**/purchase-invoice/${ROW.id}`, { timeout: 5_000 });
  });
});

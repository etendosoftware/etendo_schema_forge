import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Required-field validation on new record form — mocked.
 *
 * Verifies the ETP-3894 fix: when a window renders more than one EntityForm
 * instance (e.g. main section + collapsed "more details" section), all forms
 * must contribute to the validation set. Previously, the second EntityForm
 * overwrote the first (Array ref), so form-1's required fields were silently
 * dropped.
 *
 * The spec targets /sales-quotation/new because:
 *  - The window uses EntityForm for the header section.
 *  - Required fields: businessPartner, partnerAddress, priceList, paymentTerms.
 *  - The form is accessible without a real backend (mock mode).
 *
 * Mocked routes (registered AFTER login() so they win over the generic stub):
 *  - GET /sws/neo/sales-quotation/quotation        → empty list
 *  - GET /sws/neo/sales-quotation/quotation/defaults → synthetic defaults
 *  - POST /sws/neo/sales-quotation/quotation       → synthetic saved record
 *
 * data-testid conventions (from EntityForm.jsx / e2e-testing-guide.md):
 *  - `field-{fieldKey}`      → input/control wrapper
 *  - `error-{fieldKey}`      → inline error paragraph appended by renderFieldWithError
 *  - `action-save-draft`     → "Guardar" (save draft) button — calls handleSave()
 *  - `action-save`           → "Confirmar" button — calls handleSaveAndProcess()
 *
 * NOTE: sales-quotation uses draftMode, so the toolbar shows:
 *   [Guardar] (action-save-draft) + [Confirmar] (action-save)
 * The required-field validation runs in handleSave(), so the "Guardar"
 * (action-save-draft) button is the correct trigger for this test.
 */

async function installQuotationNewMocks(page, { postResponse } = {}) {
  // List endpoint — return empty so the page doesn't try to show a table.
  await page.route('**/sws/neo/sales-quotation/quotation', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(postResponse ?? { response: { data: [{ id: 'new-quot-001' }] } }),
      });
      return;
    }
    route.fallback();
  });

  // Defaults endpoint — return minimal values to pre-populate non-required fields.
  await page.route('**/sws/neo/sales-quotation/quotation/defaults', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        defaults: {
          orderDate: '14-05-2026',
        },
      }),
    });
  });
}

test.describe('Required-field validation — /sales-quotation/new (ETP-3894)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installQuotationNewMocks(page);
    await page.goto('/sales-quotation/new');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  // -------------------------------------------------------------------------
  // Scenario 1: inline error appears under the first required field that is
  // empty when "Guardar" (save draft) is clicked.
  // -------------------------------------------------------------------------
  test('shows inline error on required field when saving empty form', async ({ page }) => {
    // Wait for the form to be fully rendered before clicking.
    const bpWrapper = page.getByTestId('field-businessPartner');
    await expect(bpWrapper).toBeVisible({ timeout: 8_000 });

    // "Guardar" (save draft) is action-save-draft in draftMode windows.
    // Clicking it calls handleSave() which runs the formFieldsRef validation.
    const saveDraftBtn = page.getByTestId('action-save-draft');
    await expect(saveDraftBtn).toBeVisible({ timeout: 5_000 });
    await saveDraftBtn.click();

    // businessPartner is the canonical first required field on this form.
    // EntityForm appends <p data-testid="error-{key}"> via renderFieldWithError.
    const bpError = page.getByTestId('error-businessPartner');
    await expect(bpError).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: toast fires when required fields are missing.
  // -------------------------------------------------------------------------
  test('toast appears when required fields are missing on save', async ({ page }) => {
    const bpWrapper = page.getByTestId('field-businessPartner');
    await expect(bpWrapper).toBeVisible({ timeout: 8_000 });

    const saveDraftBtn = page.getByTestId('action-save-draft');
    await expect(saveDraftBtn).toBeVisible({ timeout: 5_000 });
    await saveDraftBtn.click();

    // Sonner renders toasts with [data-sonner-toast] — locale-independent assertion.
    const toastLocator = page.locator('[data-sonner-toast]').first();
    await expect(toastLocator).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: no inline error under businessPartner before any save attempt.
  // The field must not show an error on the initial load (happy path: pristine).
  // -------------------------------------------------------------------------
  test('no inline error on pristine form before save is attempted', async ({ page }) => {
    // Wait for the form to render completely, including async effects.
    // Using the save button as the readiness signal — it only becomes visible once
    // the form is fully mounted and stable (no loading skeleton).
    const saveDraftBtn = page.getByTestId('action-save-draft');
    await expect(saveDraftBtn).toBeVisible({ timeout: 8_000 });

    // No save attempt yet — the error element must not exist in the DOM.
    const bpError = page.getByTestId('error-businessPartner');
    await expect(bpError).toHaveCount(0);
  });
});

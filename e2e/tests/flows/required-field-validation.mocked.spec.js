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

/**
 * Budget for the FIRST visibility gate of each test — the one that waits for the
 * window to finish mounting.
 *
 * 20s, not the usual 8s: on a cold dev server vite compiles this window's chunk
 * on first request, and with several workers hitting it at once 8s is not enough.
 * The spec then failed in parallel and passed when run alone, which reads as a
 * product bug and is not one. Gates that run AFTER the form is already on screen
 * keep their short timeouts — a slow assertion there is a real signal.
 */
const MOUNT_TIMEOUT = 20_000;

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
    await expect(bpWrapper).toBeVisible({ timeout: MOUNT_TIMEOUT });

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
    await expect(bpWrapper).toBeVisible({ timeout: MOUNT_TIMEOUT });

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
    await expect(saveDraftBtn).toBeVisible({ timeout: MOUNT_TIMEOUT });

    // No save attempt yet — the error element must not exist in the DOM.
    const bpError = page.getByTestId('error-businessPartner');
    await expect(bpError).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 4 (ETP-4793 / IMP-16): the `dd-MM-yyyy` default this spec's mock
  // has always served must reach the date field as 14 May 2026.
  //
  // The mock fed `orderDate: '14-05-2026'` from the start but nothing ever
  // asserted how it rendered, so the conversion in `normalizeDefaultValue`
  // (useEntity.js) was unpinned. It matters because `parseCalendarDate` falls
  // through to `new Date(str)`, which reads a bare `MM-dd-yyyy`: an unconverted
  // `dd-MM-yyyy` does not render blank, it renders the day and month SWAPPED
  // whenever both are <= 12 — the same lenient-reparse failure mode that put
  // corrupt rows in the database (IMP-16 §3.6). 14 is > 12, so here the
  // regression shows up as an empty field; the day/month-swap case is covered
  // by date-defaults-tolerance.mocked.spec.js with a 5 Nov fixture.
  //
  // NEO now canonicalizes date defaults to ISO server-side, but the frontend
  // conversion must stay: only `/defaults` is normalized, and this spec is what
  // stops it being removed as dead code.
  // -------------------------------------------------------------------------
  test('renders the dd-MM-yyyy orderDate default as 14 May 2026', async ({ page }) => {
    const dateInput = page.getByTestId('field-orderDate');
    await expect(dateInput).toBeVisible({ timeout: MOUNT_TIMEOUT });
    // DateField shows a locale-formatted value; es_ES is the app default and
    // gives dd/mm/yyyy.
    await expect(dateInput).toHaveValue('14/05/2026');
  });
});

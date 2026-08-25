import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Required-field validation on new record form — mocked.
 *
 * Originally verified the ETP-3894 fix: when a window renders more than one
 * EntityForm instance (e.g. main section + collapsed "more details" section),
 * all forms must contribute to the validation set. Previously, the second
 * EntityForm overwrote the first (Array ref), so form-1's required fields
 * were silently dropped.
 *
 * ETP-4933 replaced ETP-3894's click-then-report model with prevent-before-
 * click: the five primary persist buttons are now DISABLED while any
 * reachable required field is empty (see `buildSaveGate` /
 * `getMissingRequiredFields`). A click on "Guardar" used to run handleSave(),
 * which then discovered the missing fields and reported them via an inline
 * <p data-testid="error-{key}"> + a toast. That code path (`useEntity.
 * handleSave`'s post-hoc validation) is kept as a safety net for
 * `handleSaveAndProcess`, programmatic saves and not-yet-migrated modals, but
 * it can no longer be reached by clicking Save — the button is disabled
 * before the click can ever land. Do NOT restore the old inline-error /
 * toast assertions below; they describe a path this button no longer takes.
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
 * data-testid conventions (from EntityForm.jsx / saveActions.jsx / e2e-testing-guide.md):
 *  - `field-{fieldKey}`      → input/control wrapper
 *  - `action-save-draft`     → "Guardar" (save draft) button — calls handleSave()
 *  - `action-save`           → "Confirmar" button — calls handleSaveAndProcess()
 *  - `data-missing-required` → comma-joined field KEYS on the button itself
 *    (locale-independent — set by `buildSaveGate`, see saveActions.jsx)
 *
 * NOTE: sales-quotation uses draftMode, so the toolbar shows:
 *   [Guardar] (action-save-draft) + [Confirmar] (action-save)
 * The required-field gate reads the same `useEntity` validity state for
 * both buttons, so "Guardar" (action-save-draft) is still the button this
 * spec exercises.
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
  // Scenario 1 (ETP-4933 — was "shows inline error on required field when
  // saving empty form"): the button itself carries the missing-fields
  // information now, instead of an inline error appearing after a click.
  // -------------------------------------------------------------------------
  test('Guardar is disabled and reports businessPartner + partnerAddress via data-missing-required while the form is empty', async ({ page }) => {
    // Wait for the form to be fully rendered.
    const bpWrapper = page.getByTestId('field-businessPartner');
    await expect(bpWrapper).toBeVisible({ timeout: MOUNT_TIMEOUT });

    // "Guardar" (save draft) is action-save-draft in draftMode windows.
    const saveDraftBtn = page.getByTestId('action-save-draft');
    await expect(saveDraftBtn).toBeVisible({ timeout: 5_000 });
    await expect(saveDraftBtn).toBeDisabled({ timeout: 5_000 });

    // data-missing-required is the locale-independent E2E hook `buildSaveGate`
    // sets on the button (see saveActions.jsx) — it carries field KEYS, never
    // translated labels, precisely so this assertion doesn't depend on locale.
    const missingRequired = await saveDraftBtn.getAttribute('data-missing-required');
    expect(missingRequired).toContain('businessPartner');
    // partnerAddress (inputMode: "dependent") is required too — ETP-4773 fixed
    // dependent fields being invisible to this same validation set.
    expect(missingRequired).toContain('partnerAddress');
  });

  // -------------------------------------------------------------------------
  // Scenario 2 (ETP-4933 — was "toast appears when required fields are
  // missing on save"): with the button disabled, a click is a no-op — no
  // handleSave() runs, no toast fires, and (this is the part still worth
  // guarding) no POST is ever sent. Force the click to prove even a forced
  // DOM click event on the disabled <button> does not reach the network.
  // -------------------------------------------------------------------------
  test('a forced click on the disabled Guardar button never POSTs the record', async ({ page }) => {
    const bpWrapper = page.getByTestId('field-businessPartner');
    await expect(bpWrapper).toBeVisible({ timeout: MOUNT_TIMEOUT });

    let postSent = false;
    page.on('request', (r) => {
      if (r.url().includes('/sws/neo/sales-quotation/quotation') && r.method() === 'POST') postSent = true;
    });

    const saveDraftBtn = page.getByTestId('action-save-draft');
    await expect(saveDraftBtn).toBeVisible({ timeout: 5_000 });
    await expect(saveDraftBtn).toBeDisabled({ timeout: 5_000 });
    // force: true bypasses Playwright's actionability check (which would
    // otherwise time out waiting for a disabled element to become "enabled")
    // — the browser itself still refuses to fire the click handler on a
    // native disabled <button>, which is exactly the behavior under test.
    await saveDraftBtn.click({ force: true });

    // No sonner toast either — the click never reached handleSave().
    await expect(page.locator('[data-sonner-toast]').first()).toHaveCount(0);
    expect(postSent).toBe(false);
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

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Product Category — Duplicate identifier error message (ETP-4597, integration).
 *
 * Bug: Etendo AD's backend core sometimes rewrites a raw Postgres
 * unique-constraint violation into an already-translated-but-still-technical
 * sentence that names AD's internal field group — e.g. (Spanish) "Ya existe
 * un/a Categoría del producto con el mismo (Entidad, Organización,
 * Identificador). (Entidad, Organización, Identificador) debe ser único.
 * Cambie los valores introducidos" — instead of the friendly, generic
 * "validationDuplicateIdentifier" message. The fix lives in
 * normalizeServerError (tools/app-shell/src/hooks/useEntity.js).
 *
 * `useEntity-helpers.test.js` already proves the string-transform logic
 * against a MOCKED backend response. This spec proves the same transform
 * against a REAL backend response shape/wording, end to end: create a
 * Product Category, then try to create a second one with the same Search
 * Key (the column AD enforces uniqueness on), and assert the toast shows
 * the friendly copy — never the technical AD field-group fingerprint.
 *
 * Self-sufficient re: fixture data — creates its own category with a random
 * Search Key and immediately tries to duplicate it, so it never depends on
 * a specific seeded record (e.g. "Bebidas") continuing to exist.
 *
 * Requires:
 *   - Etendo backend running at localhost:8080
 *   - Dev server running at localhost:3100 (make dev)
 *   - E2E_USE_MOCK=0 E2E_PASSWORD=<password>
 *
 * Skipped automatically if env vars are not set.
 */

/**
 * Load credentials from the onboarding test if available (.auth-credentials.json),
 * otherwise fall back to E2E_PASSWORD / E2E_USER env vars.
 */
function loadCredentials() {
  try {
    const credPath = resolve(import.meta.dirname, '../../.auth-credentials.json');
    const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
    if (creds.email && creds.password) return creds;
  } catch { /* file doesn't exist — fall back to env vars */ }
  return null;
}

const onboardingCreds = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_USE_MOCK === '0' && !!(process.env.E2E_PASSWORD || onboardingCreds);

// Technical AD field-group fingerprint that must never leak to the user —
// mirrors the assert.doesNotMatch guard in useEntity-helpers.test.js.
const AD_TECHNICAL_FINGERPRINT = /\(Entidad[,)]|\(Organizaci[oó]n[,)]|\(Client[,)]|\(Organization[,)]|Categor[ií]a del producto con el mismo/i;

// Friendly copy (validationDuplicateIdentifier), es_ES and en_US.
const FRIENDLY_MESSAGE_PATTERN = /ya existe un registro con este identificador|a record with (this|the same) identifier already exists/i;

/** Wait for detail view fully loaded (spinner gone, data fetched). */
async function waitForDetailReady(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
  const spinner = page.getByText(/cargando|loading/i);
  if (await spinner.isVisible({ timeout: 500 }).catch(() => false)) {
    await expect(spinner).toBeHidden({ timeout: 10_000 });
  }
}

/**
 * Start listening for a successful save API response BEFORE triggering the
 * action. Returns a promise — await it AFTER the action (click/Enter/Tab).
 */
function expectSaveResponse(page) {
  return page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) && resp.status() < 500,
    { timeout: 15_000 },
  ).catch(() => {});
}

/**
 * Like expectSaveResponse but does NOT filter by status. The duplicate-key
 * save in this spec is expected to be REJECTED: NeoCrudHandler#handleDefault
 * (com.etendoerp.go) wraps the AD unique-constraint OBException in a generic
 * SC_INTERNAL_SERVER_ERROR (500), so a `status < 500` filter would never
 * match it and would silently time out instead of confirming the round trip.
 */
function expectWriteAttemptResponse(page) {
  return page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && ['POST', 'PUT', 'PATCH'].includes(resp.request().method()),
    { timeout: 15_000 },
  ).catch(() => {});
}

/**
 * Start listening for a DELETE API response BEFORE triggering the action.
 * Returns a promise — await it AFTER the action (click/Enter/Tab).
 */
function expectDeleteResponse(page) {
  return page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && resp.request().method() === 'DELETE' && resp.status() < 500,
    { timeout: 15_000 },
  ).catch(() => {});
}

async function createCategory(page, { searchKey, name }) {
  const newButton = page.getByTestId('action-new');
  await expect(newButton).toBeVisible({ timeout: 10_000 });
  await newButton.click();
  await expect(page).toHaveURL(/\/product-category\/new/, { timeout: 15_000 });
  await waitForDetailReady(page);

  await page.getByTestId('field-searchKey').fill(searchKey);
  await page.getByTestId('field-name').fill(name);

  const saveBtn = page.getByTestId('action-save')
    .or(page.getByRole('button', { name: /^guardar$|^save$/i }));
  await expect(saveBtn.first()).toBeEnabled({ timeout: 10_000 });
  await saveBtn.first().click();
}

test.describe('Product Category — Duplicate identifier error message (integration)', () => {
  test.skip(!RUN_INTEGRATION, 'Requires real Etendo backend (E2E_USE_MOCK=0 + E2E_PASSWORD)');
  test.setTimeout(90_000);

  test('shows the friendly duplicate-identifier message, not the technical AD sentence', async ({ page }) => {
    const ts = Date.now();
    const searchKey = `E2E-CAT-${ts}`;

    // Use onboarding-created credentials if available, otherwise env vars
    const loginOpts = onboardingCreds
      ? { user: onboardingCreds.email, password: onboardingCreds.password }
      : {};
    await login(page, loginOpts);

    // ═══════════════════════════════════════════════════════════════════════
    // PART 1: Create the first category — establishes the Search Key we will
    // then try to duplicate. Waits for the successful save response and the
    // resulting navigation to the new record's detail URL.
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'product-category');
    const listView = page.getByTestId('list-view');
    await expect(listView).toBeVisible({ timeout: 15_000 });

    const firstSaveP = expectSaveResponse(page);
    await createCategory(page, { searchKey, name: `E2E Category ${ts}` });
    await firstSaveP;

    await expect(page).toHaveURL(/\/product-category\/(?!new)/, { timeout: 15_000 });
    const firstCategoryUrl = page.url();

    // ═══════════════════════════════════════════════════════════════════════
    // PART 2: Attempt to create a SECOND category with the same Search Key.
    // The backend must reject it as a duplicate on (Client, Organization,
    // Search Key); the frontend must surface the friendly message.
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'product-category');
    await expect(listView).toBeVisible({ timeout: 15_000 });

    const dupSaveP = expectWriteAttemptResponse(page);
    await createCategory(page, { searchKey, name: `E2E Category Duplicate ${ts}` });
    await dupSaveP;

    // ═══════════════════════════════════════════════════════════════════════
    // PART 3: Assert the error toast shows the friendly copy and never the
    // technical AD field-group fingerprint. Two-sided assertion, mirroring
    // useEntity-helpers.test.js's assert.equal + assert.doesNotMatch pair.
    // ═══════════════════════════════════════════════════════════════════════

    const errorToast = page.locator('[data-type="error"]').first();
    await expect(errorToast).toBeVisible({ timeout: 15_000 });

    const toastText = await errorToast.innerText();
    expect(toastText).toMatch(FRIENDLY_MESSAGE_PATTERN);
    expect(toastText).not.toMatch(AD_TECHNICAL_FINGERPRINT);

    // The save must have been rejected — still on the "new" form, confirming
    // no accidental navigation/creation happened.
    expect(page.url()).toMatch(/\/product-category\/new/);

    // ═══════════════════════════════════════════════════════════════════════
    // PART 4: Cleanup — delete the first category created in PART 1 so this
    // spec doesn't leave real backend garbage behind on every run.
    // ═══════════════════════════════════════════════════════════════════════

    await page.goto(firstCategoryUrl);
    await waitForDetailReady(page);

    const deleteP = expectDeleteResponse(page);
    await page.getByTestId('action-delete').click();
    await page.getByTestId('action-delete-confirm').click();
    await deleteP;

    // Spanish-only precedent match ("Registro eliminado"), plus the English
    // equivalent ("Record deleted") — this backend is primarily Spanish.
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Registro eliminado|Record deleted/i, { timeout: 10_000 });
  });
});

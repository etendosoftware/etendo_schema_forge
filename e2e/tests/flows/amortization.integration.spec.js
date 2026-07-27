import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Amortization window — Test Plan "Activos y Amortizaciones" (REAL BACKEND).
 *
 * ETP-4429: Amortization documents are created EXCLUSIVELY via "Crear Amortización"
 * from the Assets window. There is NO manual create button in the Amortization list
 * and NO delete action on amortization documents in any state.
 *
 * Requires: Etendo up (dev proxy → ETENDO_URL), E2E_USE_MOCK=0, E2E_PASSWORD set,
 * an existing asset category named "Genérico".
 */

const toastByText = (page, re) => page.locator('[data-sonner-toast]').filter({ hasText: re });
// "Crear Amortización" process button (label resolves via i18n).
const crearAmortizacionBtn = (page) => page.getByRole('button', { name: /Crear Amortización|Create Amortization/i });

/** Full-reload navigation to a deep SPA link, tolerating the boot-time redirect
 *  that aborts the first navigation (net::ERR_ABORTED). */
async function gotoDeepLink(page, url) {
  await expect(async () => {
    await page.goto(url, { waitUntil: 'commit' });
  }).toPass({ timeout: 30_000 });
}

/** Fill a DateField (es locale: 8 digits "01012026" → "01/01/2026"). */
async function fillDateField(page, testId, digits) {
  const field = page.getByTestId(testId);
  await field.click();
  await field.fill('');
  await field.pressSequentially(digits);
  await field.blur();
}

/** Click "Guardar" and wait for the asset PATCH/PUT to actually land, so the
 *  next "Crear Amortización" runs against the persisted record (no save race). */
async function saveAsset(page) {
  const saveBtn = page.getByTestId('action-save');
  if (await saveBtn.isDisabled().catch(() => false)) return;
  const saved = page.waitForResponse(
    (r) => /\/sws\/neo\/assets\/assets\/[^/?]+/.test(r.url())
      && ['PUT', 'PATCH', 'POST'].includes(r.request().method()),
    { timeout: 12_000 },
  ).catch(() => null);
  await saveBtn.click();
  await saved;
}

/** Set a field's value and retry until the form is actually dirty (save enabled).
 *  A save triggers a refetch GET that resets `editing`; if it lands after a fill,
 *  the fill is lost. Retrying the fill until the save button enables absorbs that
 *  race deterministically. */
async function setFieldUntilDirty(page, testId, value) {
  const field = page.getByTestId(testId);
  await expect(async () => {
    await field.fill('');
    await field.fill(value);
    await field.blur();
    await expect(page.getByTestId('action-save')).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 12_000 });
}

/** Persist current edits, then run "Crear Amortización" and expect a toast. */
async function saveThenProcess(page, expectRe) {
  await saveAsset(page);
  await crearAmortizacionBtn(page).click();
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(expectRe, { timeout: 12_000 });
}

/**
 * Create a minimal depreciable asset (percentage mode, 50% annual) via the Assets
 * window and trigger "Crear Amortización". Navigates to the first period header
 * via the Plan de amortización tab.
 *
 * Modeled on `setupDepreciableWithAmortization` from assets.integration.spec.js
 * (percentage mode path only, no verify steps).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number|string} stamp  Unique timestamp used to name the asset.
 * @returns {{ assetUrl: string, amortizationUrl: string }}
 */
async function createAssetWithAmortization(page, stamp) {
  await page.goto('/assets');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.getByTestId('action-new').click();
  await expect(page.getByTestId('detail-view')).toBeVisible();

  await page.getByTestId('field-searchKey').fill(`AM-ETP4429-${stamp}`);
  await page.getByTestId('field-name').fill(`Activo Amort ETP-4429 ${stamp}`);
  await page.getByTestId('field-assetCategory').click();
  // Wait for selector options to load from the API before clicking the specific one.
  await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('option', { name: /Gen[eé]rico|Otros|Others/i }).first().click();
  await expect(page.getByTestId('field-assetCategory')).not.toContainText(/Seleccionar|Select/i);

  // Activate "Depreciar" → financial sections appear.
  await page.getByRole('switch').first().click();
  await expect(page.getByText('Información financiera')).toBeVisible({ timeout: 15_000 });

  // Save → record created; wait for the route to settle on /assets/{id}.
  await page.getByTestId('action-save').click();
  await expect(toastByText(page, /Registro creado/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForURL(/\/assets\/(?!new)[^/?]+/, { timeout: 10_000 });
  const assetUrl = page.url();

  // Step 5: crearAmortizacion → expects missing start-date error.
  await crearAmortizacionBtn(page).click();
  await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });

  // Step 6: fill start date.
  await fillDateField(page, 'field-depreciationStartDate', '01012026');

  // Step 7: save + crearAmortizacion → expects missing amount error.
  await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);

  // Step 8: fill Valor a amortizar.
  await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');

  // Step 9: save + crearAmortizacion → expects missing annual depreciation error.
  await saveThenProcess(page, /Amortización Anual no puede estar vac/i);

  // Step 10: fill % Amortización anual (50% — percentage mode default).
  await page.getByTestId('field-annualDepreciation').fill('50');

  // Step 11: save + crearAmortizacion → expects success.
  await saveAsset(page);
  await crearAmortizacionBtn(page).click();
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Amortización creada/i, { timeout: 20_000 });

  // Step 12: open Plan de amortización tab, click the 2026 period button.
  await page.getByRole('button', { name: /Plan de amortización/ }).click();
  await page.getByRole('button', { name: '2026', exact: true }).click();
  await page.waitForURL(/\/amortization\//, { timeout: 10_000 });
  const amortizationUrl = page.url();

  return { assetUrl, amortizationUrl };
}

test.describe('Amortization (real backend)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('topbar-user-menu').click();
    await page.getByTestId('user-menu-language-es_ES').click();
  });

  test('amortization list: no create button (ETP-4429)', async ({ page }) => {
    await page.goto('/amortization');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    // ETP-4429: amortizations are only created via Assets — the create button must
    // be absent from the list.
    await expect(page.getByTestId('action-new')).toHaveCount(0);
  });

  test('amortization document: no delete button — documents created via Assets (ETP-4429)', async ({ page }) => {
    const stamp = Date.now();
    const { assetUrl, amortizationUrl } = await createAssetWithAmortization(page, stamp);

    // Navigate to the amortization header and assert no delete button is present.
    await gotoDeepLink(page, amortizationUrl);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
    // ETP-4429: amortization documents have no delete action in any state.
    await expect(page.getByTestId('action-delete')).toHaveCount(0);

    // Cleanup: delete the asset via UI (removes its amortization lines).
    await gotoDeepLink(page, assetUrl);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('action-delete').click();
    await page.getByTestId('action-delete-confirm').click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Registro eliminado/i, { timeout: 10_000 });

    // Cleanup: remove the now-empty amortization header via API since the UI
    // intentionally provides no delete button (ETP-4429).
    const headerId = amortizationUrl.split('/amortization/')[1]?.split(/[?#]/)[0];
    if (headerId) {
      await page.evaluate(async (id) => {
        try {
          await fetch(`/sws/neo/amortization/header/${id}`, { method: 'DELETE' });
        } catch (e) {
          console.warn('Amortization header cleanup failed:', e.message);
        }
      }, headerId);
    }
  });
});

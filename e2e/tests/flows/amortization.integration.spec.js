import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { openSelectorField, selectorFieldDisplay } from '../helpers/selectors.js';

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

const SLOW_MS = Number(process.env.E2E_SLOW_MS || 0);

async function slow(page) {
  if (SLOW_MS > 0) await page.waitForTimeout(SLOW_MS);
}

const toastByText = (page, re) => page.locator('[data-sonner-toast]').filter({ hasText: re });
// "Crear Amortización" process button (label resolves via i18n).
const crearAmortizacionBtn = (page) => page.getByRole('button', { name: /Crear Amortización|Create Amortization/i });

async function waitForDetailReady(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 20_000 });
  // Wait for any loading indicator to disappear (covers late-appearing spinners)
  await expect(page.getByText(/cargando|loading/i)).toBeHidden({ timeout: 15_000 })
    .catch(() => {}); // OK if spinner never appeared
}

function expectSaveResponse(page) {
  return page.waitForResponse(
    (resp) =>
      resp.url().includes('/sws/neo/') &&
      ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) &&
      resp.status() < 400,
    { timeout: 30_000 },
  );
}

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
  const saveBtn = page.getByTestId('action-save')
    .or(page.getByRole('button', { name: /guardar|save/i }));
  if (await saveBtn.isDisabled().catch(() => false)) return;
  const saved = page.waitForResponse(
    (r) => /\/sws\/neo\/assets\/assets\/[^/?]+/.test(r.url())
      && ['PUT', 'PATCH', 'POST'].includes(r.request().method())
      && r.status() < 400,
    { timeout: 12_000 },
  );
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
  // Wait for the PROCESS call itself, at ANY status. The validation answers this test asserts
  // on come back as 400s, so a `status < 400` predicate never matched them — it matched some
  // unrelated request instead and let the assertion race the toast it was supposed to wait for.
  const processResponse = page.waitForResponse(
    (r) => r.url().includes('/action/processAsset'),
    { timeout: 20_000 },
  );
  await crearAmortizacionBtn(page).click();
  await processResponse;
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
  await page.goto('/assets', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('action-new')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('action-new').click();
  await waitForDetailReady(page);

  await page.getByTestId('field-searchKey').fill(`AM-ETP4429-${stamp}`);
  await page.getByTestId('field-name').fill(`Activo Amort ETP-4429 ${stamp}`);
  // `assetCategory` carries an explicit `searchSelect: false` opt-out
  // (AssetsDetailPanel.jsx, ETP-4600 follow-up) that keeps it on the OLD plain
  // Radix SelectorInput rather than the unified CreatableSearchSelect — a
  // temporary carve-out for a DetailView save→refetch/callout race the unified
  // selector exposes. `openSelectorField`/`selectorFieldDisplay` both fall back
  // to the plain `field-assetCategory` trigger when no chip testid exists, so
  // this helper works unchanged regardless of which component the field renders.
  // Open asset category dropdown — retry if click doesn't register
  await expect(async () => {
    await openSelectorField(page, 'assetCategory');
    await expect(page.getByRole('option', { name: /Gen[eé]rico|Otros|Others/i }).first())
      .toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('option', { name: /Gen[eé]rico|Otros|Others/i }).first().click();
  // Original guarantee: a category is now selected (no longer the placeholder).
  await expect(selectorFieldDisplay(page, 'assetCategory')).not.toContainText(/Seleccionar|Select/i);

  // Activate "Depreciar" → financial sections appear — retry if click doesn't register
  await expect(async () => {
    await page.getByRole('switch').first().click({ timeout: 3_000 });
    await expect(page.getByText('Información financiera')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });

  // Save → record created; wait for the route to settle on /assets/{id}.
  const createResponse = expectSaveResponse(page);
  const saveCreateBtn = page.getByTestId('action-save')
    .or(page.getByRole('button', { name: /guardar|save/i }));
  await saveCreateBtn.click();
  await createResponse;
  await expect(toastByText(page, /Registro creado/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForURL(/\/assets\/(?!new)[^/?]+/, { timeout: 10_000 });
  const assetUrl = page.url();

  // Step 5: crearAmortizacion → expects missing start-date error.
  const step5Response = page.waitForResponse(
    (r) => r.url().includes('/sws/neo/') && r.status() < 400,
    { timeout: 15_000 },
  );
  await crearAmortizacionBtn(page).click();
  await step5Response;
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
  const step11Response = page.waitForResponse(
    (r) => r.url().includes('/sws/neo/') && r.status() < 400,
    { timeout: 30_000 },
  );
  await crearAmortizacionBtn(page).click();
  await step11Response;
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Amortización creada/i, { timeout: 20_000 });

  // Step 12: open Plan de amortización tab — retry click→content sequence
  await expect(async () => {
    await page.getByRole('button', { name: /Plan de amortización|Amortization Plan/i }).click({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: '2026', exact: true })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('button', { name: '2026', exact: true }).click();
  await page.waitForURL(/\/amortization\//, { timeout: 10_000 });
  const amortizationUrl = page.url();

  return { assetUrl, amortizationUrl };
}

test.describe('Amortization (real backend)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('topbar-user-menu')).toBeVisible({ timeout: 15_000 });
    // Open user menu and select language — retry if click doesn't register
    await expect(async () => {
      await page.getByTestId('topbar-user-menu').click({ timeout: 3_000 });
      await expect(page.getByTestId('user-menu-language-es_ES')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId('user-menu-language-es_ES').click();
  });

  test('amortization list: no create button (ETP-4429)', async ({ page }) => {
    await test.step('Navigate to amortization list', async () => {
      await page.goto('/amortization', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 15_000 });
    });

    await test.step('Verify no create button exists', async () => {
      // ETP-4429: amortizations are only created via Assets — the create button must
      // be absent from the list.
      await expect(page.getByTestId('action-new')).toHaveCount(0);
    });
  });

  test('amortization document: no delete button — documents created via Assets (ETP-4429)', async ({ page }) => {
    const stamp = Date.now();

    const { assetUrl, amortizationUrl } = await test.step('Create asset with amortization', async () => {
      return createAssetWithAmortization(page, stamp);
    });

    await test.step('Verify no delete button on amortization document', async () => {
      // Navigate to the amortization header and assert no delete button is present.
      await gotoDeepLink(page, amortizationUrl);
      await waitForDetailReady(page);
      // ETP-4429: amortization documents have no delete action in any state.
      await expect(page.getByTestId('action-delete')).toHaveCount(0);
    });

    await test.step('Cleanup: delete the asset via UI', async () => {
      await gotoDeepLink(page, assetUrl);
      await waitForDetailReady(page);

      // Click delete — retry click→confirm sequence
      await expect(async () => {
        await page.getByTestId('action-delete').click({ timeout: 3_000 });
        await expect(page.getByTestId('action-delete-confirm')).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 15_000 });

      const deleteResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') && r.request().method() === 'DELETE' && r.status() < 400,
        { timeout: 15_000 },
      );
      await page.getByTestId('action-delete-confirm').click();
      await deleteResponse;
      await expect(page.locator('[data-sonner-toast][data-front="true"]'))
        .toContainText(/Registro eliminado/i, { timeout: 10_000 });
    });

    await test.step('Cleanup: remove empty amortization header via API', async () => {
      const headerId = amortizationUrl.split('/amortization/')[1]?.split(/[?#]/)[0];
      if (headerId) {
        await page.evaluate(async (id) => {
          try {
            await fetch(`/sws/neo/amortization/header/${id}`, { method: 'DELETE' });
          } catch { /* cleanup best-effort */ }
        }, headerId);
      }
    });
  });
});

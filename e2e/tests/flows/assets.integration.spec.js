import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Assets window — Test Plan "Activos y Amortizaciones" (REAL BACKEND).
 *
 * Consolidated real-mode suite. Requires:
 *   - Etendo up (dev proxy → ETENDO_URL), E2E_USE_MOCK=0, E2E_PASSWORD set.
 *   - An existing asset category named "Otros".
 *
 * Cases covered:
 *   - Case 1: create a non-depreciable asset — required validation, save, find.
 *   - Case 2: depreciable by TIME → 2 monthly amortization lines (06/07-2026).
 *   - Case 3: depreciable by PERCENTAGE → 2 annual amortization lines (2026/2027).
 *   - Case 9: toggling "Depreciar" shows/hides the depreciation config.
 *
 * Tests that save use a unique timestamped name/searchKey so records never
 * collide and the filter isolates exactly the one created.
 */

const DISABLED_HINT = 'La depreciación está desactivada';

// Toast 'El campo "<label>" es obligatorio.' for a field label.
const requiredToast = (label) => new RegExp(`El campo\\s*"?${label}"?\\s*es obligatorio`, 'i');
// Scope to the sonner toast so page content (title/breadcrumb) can't false-match.
const toastByText = (page, re) => page.locator('[data-sonner-toast]').filter({ hasText: re });
// "Crear Amortización" process button (label resolves via i18n).
const crearAmortizacionBtn = (page) => page.getByRole('button', { name: /Crear Amortización|Create Amortization/i });

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Open Assets and start a new record (detail form in edit mode). */
async function openNewAsset(page) {
  await page.goto('/assets');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.getByTestId('action-new').click();
  await expect(page.getByTestId('detail-view')).toBeVisible();
}

/** Pick the real "Otros" category in the Grupo activo selector. */
async function selectGrupoActivoOtros(page) {
  await page.getByTestId('field-assetCategory').click();
  await page.getByRole('option', { name: 'Otros', exact: true }).click();
  await expect(page.getByTestId('field-assetCategory')).toContainText('Otros');
}

/** Click "Guardar" and wait for the asset PATCH/PUT to actually land, so the
 *  next "Crear Amortización" runs against the persisted record (no save race). */
async function saveAsset(page) {
  const saveBtn = page.getByTestId('action-save');
  // Nothing pending (form already clean) → skip; clicking a disabled button hangs.
  if (await saveBtn.isDisabled().catch(() => false)) return;
  const saved = page.waitForResponse(
    (r) => /\/sws\/neo\/assets\/assets\/[^/?]+/.test(r.url())
      && ['PUT', 'PATCH', 'POST'].includes(r.request().method()),
    { timeout: 12_000 },
  ).catch(() => null);
  await saveBtn.click();
  await saved;
}

/** Parse a currency string like "2,000.00 €" / "-100.00 €" / "—" to a number. */
function parseCurrency(text) {
  const cleaned = (text || '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return cleaned ? parseFloat(cleaned) : 0;
}

/** With Depreciar ON, the "Resumen de depreciación" sidebar mirrors the live
 *  editing state: Valor del activo / Valor residual in the form must equal
 *  Valor actual / Valor residual del activo in the sidebar. Run after each
 *  financial-field change and after creating the amortization. */
async function verifySidebarSync(page) {
  // Scope to the sidebar's card container (no testids in the app): the
  // "Resumen de depreciación" heading → its card grid is the next sibling.
  // Each card is <div>{label}</div><div>{value}</div>, so the value is the
  // label's following sibling. Scoping avoids the form's identical residual label.
  const cards = page.getByText('Resumen de depreciación', { exact: true })
    .locator('xpath=ancestor::div[1]/following-sibling::div[1]');
  const sidebarValue = (label) =>
    cards.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]').innerText();

  const formAsset = parseFloat((await page.getByTestId('field-assetValue').inputValue()) || '0');
  expect(parseCurrency(await sidebarValue('Valor actual'))).toBeCloseTo(formAsset, 2);
  const formResidual = parseFloat((await page.getByTestId('field-residualAssetValue').inputValue()) || '0');
  expect(parseCurrency(await sidebarValue('Valor residual del activo'))).toBeCloseTo(formResidual, 2);
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
  // Assert the FRONTMOST toast (newest = this cycle's result) so repeated
  // identical errors (empty / 0 / negative) don't trip strict mode or match a
  // stale toast from a previous attempt.
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(expectRe, { timeout: 12_000 });
}

/**
 * Apply the conditional filter Nombre Es <name> AND Grupo activo Es Otros,
 * and assert the list narrows to exactly the created asset.
 */
/** Build and apply the conditional filter Nombre Es <name> AND Grupo activo Es Otros. */
async function applyNameAndGrupoFilter(page, name) {
  await page.getByTestId('filter-advanced').click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();

  // Condition 1 — Nombre Es <name> (plain text value).
  await panel.locator('[role="combobox"]', { hasText: 'Selector de campo' }).first().click();
  await page.getByRole('option', { name: /^Nombre$|^Name$/ }).click();
  await panel.locator('[role="combobox"]', { hasText: 'Seleccionar condición' }).first().click();
  await page.getByRole('option', { name: 'Es', exact: true }).click();
  await panel.getByRole('textbox').first().fill(name);

  // Condition 2 — Grupo activo Es Otros (FK value = IdentifierMultiPicker).
  await panel.getByRole('button', { name: 'Añadir condición' }).click();
  await panel.locator('[role="combobox"]', { hasText: 'Selector de campo' }).first().click();
  await page.getByRole('option', { name: /Grupo activo|Asset Category|Categor/i }).click();
  await panel.locator('[role="combobox"]', { hasText: 'Seleccionar condición' }).first().click();
  await page.getByRole('option', { name: 'Es', exact: true }).click();
  await panel.getByRole('button', { name: 'Seleccionar valor' }).click();
  await page.getByRole('button', { name: 'Otros', exact: true }).click();
  await page.keyboard.press('Escape');

  await panel.getByRole('button', { name: 'Aplicar' }).click();
}

/** Filter the list and assert it narrows to exactly the created asset. */
async function findByNameAndGrupo(page, name) {
  await applyNameAndGrupoFilter(page, name);
  await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('tbody tr').first()).toContainText(name);
}

/** After deletion, filter the list by the asset's name + Grupo activo and assert
 *  it no longer appears. */
async function verifyAssetNotInList(page, name) {
  await page.goto('/assets');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await applyNameAndGrupoFilter(page, name);
  await expect(page.locator('tbody tr').filter({ hasText: name })).toHaveCount(0, { timeout: 10_000 });
}

/** Full-reload navigation to a deep SPA link (e.g. /assets/{id} or
 *  /amortization/{id}). While the app boots it re-resolves the route, which can
 *  abort the in-flight document load that `goto` waits on → `net::ERR_ABORTED`.
 *  Retry with `waitUntil: 'commit'` so an aborted attempt is absorbed; the
 *  caller's own waits (networkidle / detail-view) settle the rendered page. */
async function gotoDeepLink(page, url) {
  await expect(async () => {
    await page.goto(url, { waitUntil: 'commit' });
  }).toPass({ timeout: 30_000 });
}

/** Open the Amortization doc, select the asset's line (checkbox) and confirm it
 *  (Confirmar → "Confirmar amortización" modal). */
async function confirmAmortizationForAsset(page, amortizationUrl, name) {
  await gotoDeepLink(page, amortizationUrl); // SPA period-link nav doesn't re-render; force load
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.locator('tbody tr').filter({ hasText: name }).getByRole('checkbox').check();
  await page.getByTestId('action-save').click(); // "Confirmar" → opens the confirm modal
  // The modal's confirm button is disabled while it loads the totals, and the
  // floating "lines" selection bar overlaps it — so wait until it's enabled, then
  // dispatch the click directly and retry until the modal closes.
  const modalConfirm = page.getByRole('button', { name: 'Confirmar amortización', exact: true });
  await expect(modalConfirm).toBeEnabled({ timeout: 10_000 });
  await expect(async () => {
    await modalConfirm.dispatchEvent('click');
    await expect(modalConfirm).toHaveCount(0, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  // Point 3: the document becomes "Procesado" (no longer "Borrador").
  await expect(page.getByText('Procesado').first()).toBeVisible({ timeout: 15_000 });
  // Point 2: once processed, the Moneda selector is read-only.
  await expect(page.getByRole('textbox', { name: 'Moneda' })).toBeDisabled();
}

/** Open the Amortization doc and reactivate it via the kebab menu. */
async function reactivateAmortization(page, amortizationUrl) {
  await gotoDeepLink(page, amortizationUrl);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('action-more').click();
  await page.getByRole('button', { name: /reactivar|reactivate/i }).click();
  // Reactivation returns the document to "Borrador" (no extra confirm).
  await expect(page.getByText('Borrador').first()).toBeVisible({ timeout: 10_000 });
}

/** The sidebar "Depreciado" (Resumen de depreciación) percentage, as a number. */
async function depreciatedSidebarPct(page) {
  const cards = page.getByText('Resumen de depreciación', { exact: true })
    .locator('xpath=ancestor::div[1]/following-sibling::div[1]');
  const text = await cards.getByText('Depreciado', { exact: true })
    .locator('xpath=following-sibling::div[1]').innerText();
  return parseCurrency(text);
}

/** After confirming, on the asset detail: the "Confirmado" plan line percentage
 *  must equal the sidebar "Depreciado" percentage. Reads the sidebar (form view)
 *  first, then opens the plan tab to read the confirmed line. */
async function verifyConfirmedLineMatchesSidebar(page) {
  // Runs AFTER the confirm. The sidebar "Depreciado" reflects only CONFIRMED
  // lines, so it recalculates with the confirm we just did: two pending 50% lines
  // read 0%, and confirming one moves it to 50%. On reopen the recalc can lag, so
  // wait until the sidebar reports the (non-zero) confirmed value before comparing.
  let sidebarPct = 0;
  await expect(async () => {
    sidebarPct = await depreciatedSidebarPct(page);
    expect(sidebarPct).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
  // It must equal the percentage of the now-"Confirmado" plan line.
  await page.getByRole('button', { name: /Plan de amortización/ }).click();
  const confirmedRow = page.locator('table tr').filter({ hasText: 'Confirmado' }).first();
  await expect(confirmedRow).toBeVisible({ timeout: 10_000 });
  const m = (await confirmedRow.innerText()).match(/([\d.,]+)\s*%/);
  expect(m, 'the Confirmado plan line should show a percentage').not.toBeNull();
  expect(parseFloat(m[1])).toBeCloseTo(sidebarPct, 1);
}

/** While its amortization is confirmed, deleting the asset is blocked: the
 *  backend rejects it with "Documento ya procesado" and the record survives. */
async function verifyDeleteBlockedWhileProcessed(page) {
  await page.getByTestId('action-delete').click();
  await page.getByTestId('action-delete-confirm').click();
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Documento ya procesado/i, { timeout: 10_000 });
}

/** In the filtered grid, the asset's row shows the amortization progress bar
 *  (a width-styled fill) alongside its percentage. Optionally assert the exact %. */
async function verifyGridAmortizationBar(page, expectedPct) {
  const row = page.locator('tbody tr').first();
  await expect(row.locator('div[style*="width"]').first()).toBeVisible();
  await expect(row).toContainText(expectedPct != null ? `${expectedPct}%` : '%');
}

/** Wait until the sidebar "Depreciado" (Resumen de depreciación) reports the
 *  expected percentage (it recalculates after each confirm, with refetch lag). */
async function verifyDepreciatedSidebar(page, expectedPct) {
  await expect(async () => {
    expect(await depreciatedSidebarPct(page)).toBeCloseTo(expectedPct, 1);
  }).toPass({ timeout: 10_000 });
}

/** Delete the asset and expect the success toast. */
async function deleteAsset(page) {
  await page.getByTestId('action-delete').click();
  await page.getByTestId('action-delete-confirm').click();
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Registro eliminado/i, { timeout: 10_000 });
}

/** From the asset's plan tab, capture the URL of each period's amortization
 *  header (clicking the Period link, then going back). Creating an asset's plan
 *  makes one header per period, each with a line for the asset. */
async function captureAmortizationHeaderUrls(page, periods) {
  const urls = [];
  for (const period of periods) {
    await page.getByRole('button', { name: /Plan de amortización/ }).click();
    await page.getByRole('button', { name: period, exact: true }).click();
    await expect(page).toHaveURL(/\/amortization\//, { timeout: 10_000 });
    urls.push(page.url());
    await page.goBack();
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
  }
  return urls;
}

/** Test cleanup: delete the amortization headers created by the asset's plan.
 *  Deleting the asset removes its lines but NOT the headers — real usage keeps
 *  empty headers (correct behavior), so the test removes them to stay atomic.
 *  Headers must be in "Borrador" (the delete button hides when processed). */
async function deleteAmortizationHeaders(page, headerUrls) {
  for (const url of headerUrls) {
    await gotoDeepLink(page, url);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('action-delete').click();
    await page.getByTestId('action-delete-confirm').click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Registro eliminado/i, { timeout: 10_000 });
  }
}

/** Create a depreciable asset with required fields + Depreciar ON, saved. */
async function createDepreciableAsset(page, { stamp, name }) {
  await openNewAsset(page);
  const saveBtn = page.getByTestId('action-save');

  // Required-field validation (same as Case 1).
  await saveBtn.click();
  await expect(toastByText(page, requiredToast('Identificador'))).toBeVisible({ timeout: 8_000 });
  await page.getByTestId('field-searchKey').fill(`AS-E2E-${stamp}`);
  await saveBtn.click();
  await expect(toastByText(page, requiredToast('Nombre'))).toBeVisible({ timeout: 8_000 });
  await page.getByTestId('field-name').fill(name);
  await selectGrupoActivoOtros(page);

  // Activate "Depreciar" → financial + accounting-dimensions sections appear.
  await page.getByRole('switch').first().click();
  await expect(page.getByText('Información financiera')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Dimensiones contables')).toBeVisible();

  // Save → record created; wait for the route to settle on /assets/{id} so the
  // process has `selected.id`, then the "Crear Amortización" button is usable.
  await saveBtn.click();
  await expect(toastByText(page, /Registro creado/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForURL(/\/assets\/(?!new)[^/?]+/, { timeout: 10_000 });
  await expect(crearAmortizacionBtn(page)).toBeVisible({ timeout: 8_000 });
}

/** Create a depreciable asset and its amortization plan (2 lines/headers) for the
 *  given mode ('monthly' | 'annual' | 'percentage'), mirroring Cases 2/3/4. Ends
 *  on the asset detail with the amortization created. */
async function setupDepreciableWithAmortization(page, { stamp, name, mode }) {
  await createDepreciableAsset(page, { stamp, name });
  await crearAmortizacionBtn(page).click();
  await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });
  await fillStartDate(page, mode === 'monthly' ? '01062026' : '01012026');
  await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);
  await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
  await verifySidebarSync(page);
  await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
  if (mode === 'monthly') {
    await page.getByTestId('field-calculateType').click();
    await page.getByRole('option', { name: 'Tiempo', exact: true }).click();
    await expect(page.getByTestId('field-depreciationType')).toContainText('Lineal');
    await expect(page.getByTestId('field-amortize')).toContainText('Mensual');
    await saveThenProcess(page, /Vida útil - Meses no puede estar vac/i);
    await page.getByTestId('field-usableLifeMonths').fill('2');
  } else if (mode === 'annual') {
    await page.getByTestId('field-calculateType').click();
    await page.getByRole('option', { name: 'Tiempo', exact: true }).click();
    await expect(page.getByTestId('field-depreciationType')).toContainText('Lineal');
    await page.getByTestId('field-amortize').click();
    await page.getByRole('option', { name: 'Anual', exact: true }).click();
    await expect(page.getByTestId('field-usableLifeYears')).toBeVisible();
    await saveThenProcess(page, /Vida útil - Años no puede estar vac/i);
    await page.getByTestId('field-usableLifeYears').fill('2');
  } else { // percentage
    await expect(page.getByTestId('field-annualDepreciation')).toBeVisible();
    await page.getByTestId('field-annualDepreciation').fill('50');
  }
  await saveAsset(page);
  await crearAmortizacionBtn(page).click();
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Amortización creada/i, { timeout: 20_000 });
  await verifySidebarSync(page);
}

/** Fill the depreciation start date (DateField) and commit it. */
async function fillStartDate(page, digits) {
  const dateInput = page.getByTestId('field-depreciationStartDate');
  await dateInput.click();
  await dateInput.fill('');
  await dateInput.pressSequentially(digits);
  await dateInput.blur(); // commit so the form becomes dirty
}

/** Edit Descripción in place and save, expecting "Registro guardado". */
async function editDescriptionInPlace(page, stamp) {
  await setFieldUntilDirty(page, 'field-description', `Descripción de prueba ${stamp}`);
  await saveAsset(page);
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Registro guardado/i, { timeout: 10_000 });
}

/** Edit Valor residual with negative / 0 / below / above Valor a amortizar
 *  (2000), saving each and expecting "Registro guardado". Resets to 0 so the
 *  amortization plan below isn't affected by the residual value. */
async function editResidualValues(page) {
  for (const value of ['-100', '0', '1000', '3000', '0']) {
    await setFieldUntilDirty(page, 'field-residualAssetValue', value);
    await verifySidebarSync(page);
    await saveAsset(page);
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Registro guardado/i, { timeout: 10_000 });
  }
}

/** From the filtered list, open the record, edit Descripción + save
 *  ("Registro guardado"), then delete it ("Registro eliminado"). */
async function editDescriptionAndDelete(page, stamp, name) {
  await page.locator('tbody tr').first().click();
  await expect(page.getByTestId('detail-view')).toBeVisible();
  await page.getByTestId('field-description').fill(`Descripción de prueba ${stamp}`);
  await page.getByTestId('action-save').click();
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Registro guardado/i, { timeout: 10_000 });

  await page.getByTestId('action-delete').click();
  await page.getByTestId('action-delete-confirm').click();
  await expect(page.locator('[data-sonner-toast][data-front="true"]'))
    .toContainText(/Registro eliminado/i, { timeout: 10_000 });

  // The deleted asset must no longer appear when filtered.
  await verifyAssetNotInList(page, name);
}

// ---------------------------------------------------------------------------
// Tests (run in plan order: 1 → 2 → 3 → 4 → 9)
// ---------------------------------------------------------------------------

test.describe('Assets (real backend)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Force the UI to Spanish (via the user menu) so the expected backend/UI
    // messages match the assertions, regardless of the logged-in user's prefs.
    // Wait for the dashboard to settle so the topbar menu is actionable.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('topbar-user-menu').click();
    await page.getByTestId('user-menu-language-es_ES').click();
  });

  // Case 1 — non-depreciable asset: required validation, save, find.
  test('Case 1: non-depreciable asset — required validation, save, and find via filter', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E sin depreciar ${stamp}`;
    await openNewAsset(page);

    // Non-depreciable: no depreciation config shown.
    await expect(page.getByText(DISABLED_HINT, { exact: false })).toBeVisible();

    const saveBtn = page.getByTestId('action-save');
    await saveBtn.click();
    await expect(toastByText(page, requiredToast('Identificador'))).toBeVisible({ timeout: 8_000 });
    await page.getByTestId('field-searchKey').fill(`AS-E2E-${stamp}`);
    await saveBtn.click();
    await expect(toastByText(page, requiredToast('Nombre'))).toBeVisible({ timeout: 8_000 });

    await page.getByTestId('field-name').fill(name);
    await selectGrupoActivoOtros(page);
    await saveBtn.click();
    await expect(toastByText(page, /Registro creado/i)).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('action-cancel').click();
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);

    // Open it, edit Descripción + save, then delete the record.
    await editDescriptionAndDelete(page, stamp, name);
  });

  // Case 2 — depreciable by TIME → 2 monthly lines (06-2026, 07-2026).
  test('Case 2: depreciable by time generates 2 monthly amortization lines', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E depreciable ${stamp}`;
    await createDepreciableAsset(page, { stamp, name });

    // Attempt 1: missing start date.
    await crearAmortizacionBtn(page).click();
    await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });
    await fillStartDate(page, '01062026');

    // Attempt 2: missing Valor a amortizar.
    await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await verifySidebarSync(page);

    // Attempt 3: percentage mode (default) → annual depreciation required.
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);

    // Switch Tipo de cálculo to "Tiempo"; Lineal/Mensual must already be defaulted.
    await page.getByTestId('field-calculateType').click();
    await page.getByRole('option', { name: 'Tiempo', exact: true }).click();
    await expect(page.getByTestId('field-depreciationType')).toContainText('Lineal');
    await expect(page.getByTestId('field-amortize')).toContainText('Mensual');

    // Attempt 4: by-time mode → Vida útil - Meses required (empty / 0 / negative
    // all give the same "no puede estar vacío, ser cero o negativo" error).
    await saveThenProcess(page, /Vida útil - Meses no puede estar vac/i);
    await page.getByTestId('field-usableLifeMonths').fill('0');
    await saveThenProcess(page, /Vida útil - Meses no puede estar vac/i);
    await page.getByTestId('field-usableLifeMonths').fill('-1');
    await saveThenProcess(page, /Vida útil - Meses no puede estar vac/i);
    await page.getByTestId('field-usableLifeMonths').fill('2');

    // All required data present → amortization created.
    await saveAsset(page);
    await crearAmortizacionBtn(page).click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Amortización creada/i, { timeout: 20_000 });
    await verifySidebarSync(page);

    // Plan: 2 monthly lines, 06-2026 & 07-2026, 50.00% / 1,000.00 € each.
    await page.getByRole('button', { name: /Plan de amortización/ }).click();
    await expect(page.getByText('06-2026')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('07-2026')).toBeVisible();
    await expect(page.getByText('50.00%')).toHaveCount(2);
    await expect(page.getByText('1,000.00 €')).toHaveCount(2);

    // Back to the list: filter and verify the row columns.
    await page.getByTestId('action-cancel').click();
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('2,000.00 €');
    await expect(row).toContainText('01/06/2026');

    // Re-open the record; capture both period headers (06-2026, 07-2026) for
    // end-of-test cleanup, then confirm on the first.
    await row.click();
    await expect(page.getByTestId('detail-view')).toBeVisible();
    const assetUrl = page.url();
    const headerUrls = await captureAmortizationHeaderUrls(page, ['06-2026', '07-2026']);
    const amortizationUrl = headerUrls[0];
    // Select the asset's line + confirm → doc "Procesado", Moneda read-only.
    await confirmAmortizationForAsset(page, amortizationUrl, name);

    // Point 2: the "Confirmado" plan line % equals the sidebar "Depreciado" %.
    await gotoDeepLink(page, assetUrl);
    await verifyConfirmedLineMatchesSidebar(page);

    // Point 3: deleting the asset is blocked while the amortization is processed.
    await verifyDeleteBlockedWhileProcessed(page);

    // Point 3: the filtered grid shows the amortization progress bar with its %.
    // Navigate straight to the list (the blocked-delete dialog is discarded).
    await page.goto('/assets');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);
    await verifyGridAmortizationBar(page);

    // Reactivate → now deletable. Delete and verify the asset is gone, then clean
    // up the (now empty) amortization headers so the test leaves no orphans.
    await reactivateAmortization(page, amortizationUrl);
    await gotoDeepLink(page, assetUrl);
    await expect(page.getByTestId('detail-view')).toBeVisible();
    await deleteAsset(page);
    await verifyAssetNotInList(page, name);
    await deleteAmortizationHeaders(page, headerUrls);
  });

  // Case 3 — depreciable by TIME with a YEARLY schedule → 2 annual lines (2026, 2027).
  test('Case 3: depreciable by time (yearly) generates 2 annual amortization lines', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E anual ${stamp}`;
    await createDepreciableAsset(page, { stamp, name });

    // Attempt 1: missing start date. Start of year so the yearly split is two
    // clean full years (2026 + 2027), not a prorated 3-year plan (a mid-year
    // start prorates the first year, same as the percentage case).
    await crearAmortizacionBtn(page).click();
    await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });
    await fillStartDate(page, '01012026');

    // Attempt 2: missing Valor a amortizar.
    await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await verifySidebarSync(page);

    // Attempt 3: percentage mode (default) → annual depreciation required.
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);

    // Switch Tipo de cálculo to "Tiempo", then Amortizar to "Anual" → the
    // "Vida útil - Años" field replaces "Vida útil - Meses".
    await page.getByTestId('field-calculateType').click();
    await page.getByRole('option', { name: 'Tiempo', exact: true }).click();
    await expect(page.getByTestId('field-depreciationType')).toContainText('Lineal');
    await page.getByTestId('field-amortize').click();
    await page.getByRole('option', { name: 'Anual', exact: true }).click();
    await expect(page.getByTestId('field-usableLifeYears')).toBeVisible();
    await expect(page.getByTestId('field-usableLifeMonths')).toHaveCount(0);

    // Attempt 4: Vida útil - Años required (empty / 0 / negative → same error).
    await saveThenProcess(page, /Vida útil - Años no puede estar vac/i);
    await page.getByTestId('field-usableLifeYears').fill('0');
    await saveThenProcess(page, /Vida útil - Años no puede estar vac/i);
    await page.getByTestId('field-usableLifeYears').fill('-1');
    await saveThenProcess(page, /Vida útil - Años no puede estar vac/i);
    await page.getByTestId('field-usableLifeYears').fill('2');

    // All required data present → amortization created.
    await saveAsset(page);
    await crearAmortizacionBtn(page).click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Amortización creada/i, { timeout: 20_000 });
    await verifySidebarSync(page);

    // Plan: 2 annual lines, 2026 & 2027, 50.00% / 1,000.00 € each.
    await page.getByRole('button', { name: /Plan de amortización/ }).click();
    await expect(page.getByText('2026', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2027', { exact: true })).toBeVisible();
    await expect(page.getByText('50.00%')).toHaveCount(2);
    await expect(page.getByText('1,000.00 €')).toHaveCount(2);

    // Back to the list: filter and verify the row columns.
    await page.getByTestId('action-cancel').click();
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('2,000.00 €');
    await expect(row).toContainText('01/01/2026');

    // Re-open the record → Plan de amortización → follow the first Period link (2026).
    await row.click();
    await expect(page.getByTestId('detail-view')).toBeVisible();
    const assetUrl = page.url();
    const headerUrls = await captureAmortizationHeaderUrls(page, ['2026', '2027']);
    const amortizationUrl = headerUrls[0];
    await confirmAmortizationForAsset(page, amortizationUrl, name);

    // Point 2: the "Confirmado" plan line % equals the sidebar "Depreciado" %.
    await gotoDeepLink(page, assetUrl);
    await verifyConfirmedLineMatchesSidebar(page);

    // Point 3: deleting the asset is blocked while the amortization is processed.
    await verifyDeleteBlockedWhileProcessed(page);

    // Point 3: the filtered grid shows the amortization progress bar with its %.
    await page.goto('/assets');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);
    await verifyGridAmortizationBar(page);

    // Reactivate → now deletable. Delete, verify gone, conditional cascade (Point 4).
    await reactivateAmortization(page, amortizationUrl);
    await gotoDeepLink(page, assetUrl);
    await expect(page.getByTestId('detail-view')).toBeVisible();
    await deleteAsset(page);
    await verifyAssetNotInList(page, name);
    await deleteAmortizationHeaders(page, headerUrls);
  });

  // Case 4 — depreciable by PERCENTAGE → 2 annual lines (2026, 2027).
  test('Case 4: depreciable by percentage generates 2 annual amortization lines', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E porcentaje ${stamp}`;
    await createDepreciableAsset(page, { stamp, name });

    // Attempt 1: missing start date.
    await crearAmortizacionBtn(page).click();
    await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });
    // Start of year so the annual percentage split is two clean full years
    // (2026 + 2027 at 50% each), not a prorated 3-year plan.
    await fillStartDate(page, '01012026');

    // Attempt 2: missing Valor a amortizar.
    await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await verifySidebarSync(page);

    // Attempt 3: keep Tipo de cálculo = "Porcentaje" (default). The by-time fields
    // (Amortizar, Vida útil - Meses) are hidden; "% Amortización anual" is shown.
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    await expect(page.getByTestId('field-amortize')).toHaveCount(0);
    await expect(page.getByTestId('field-usableLifeMonths')).toHaveCount(0);
    await expect(page.getByTestId('field-annualDepreciation')).toBeVisible();
    // Zero and negative give the same "no puede estar vacío, ser cero o negativo" error.
    await page.getByTestId('field-annualDepreciation').fill('0');
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    await page.getByTestId('field-annualDepreciation').fill('-1');
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    // Above 100% → a client-side guard blocks the process with a clear message.
    await page.getByTestId('field-annualDepreciation').fill('150');
    await saveThenProcess(page, /no puede ser superior al 100%/i);
    await page.getByTestId('field-annualDepreciation').fill('50');

    // All required data present → amortization created.
    await saveAsset(page);
    await crearAmortizacionBtn(page).click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Amortización creada/i, { timeout: 20_000 });
    await verifySidebarSync(page);

    // Plan: 2 annual lines, Período 2026 & 2027, 50.00% / 1,000.00 € each.
    await page.getByRole('button', { name: /Plan de amortización/ }).click();
    await expect(page.getByText('2026', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2027', { exact: true })).toBeVisible();
    await expect(page.getByText('50.00%')).toHaveCount(2);
    await expect(page.getByText('1,000.00 €')).toHaveCount(2);

    // Back to the list: filter and verify the row columns.
    await page.getByTestId('action-cancel').click();
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('2,000.00 €');
    await expect(row).toContainText('01/01/2026');

    // Re-open the record → Plan de amortización → follow the first Period link (2026).
    await row.click();
    await expect(page.getByTestId('detail-view')).toBeVisible();
    const assetUrl = page.url();
    const headerUrls = await captureAmortizationHeaderUrls(page, ['2026', '2027']);
    const amortizationUrl = headerUrls[0];
    await confirmAmortizationForAsset(page, amortizationUrl, name);

    // Point 2: the "Confirmado" plan line % equals the sidebar "Depreciado" %.
    await gotoDeepLink(page, assetUrl);
    await verifyConfirmedLineMatchesSidebar(page);

    // Point 3: deleting the asset is blocked while the amortization is processed.
    await verifyDeleteBlockedWhileProcessed(page);

    // Point 3: the filtered grid shows the amortization progress bar with its %.
    await page.goto('/assets');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);
    await verifyGridAmortizationBar(page);

    // Reactivate → now deletable. Delete, verify gone, conditional cascade (Point 4).
    await reactivateAmortization(page, amortizationUrl);
    await gotoDeepLink(page, assetUrl);
    await expect(page.getByTestId('detail-view')).toBeVisible();
    await deleteAsset(page);
    await verifyAssetNotInList(page, name);
    await deleteAmortizationHeaders(page, headerUrls);
  });

  // Case 5 — copy of Case 2 (by TIME, monthly) + Descripción/Valor residual edits
  // + cascade delete (deleting the asset also removes its amortization lines).
  test('Case 5: by time (monthly) — edit description/residual, then cascade delete', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E residual ${stamp}`;
    await createDepreciableAsset(page, { stamp, name });

    await crearAmortizacionBtn(page).click();
    await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });
    await fillStartDate(page, '01062026');
    await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await verifySidebarSync(page);
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    await page.getByTestId('field-calculateType').click();
    await page.getByRole('option', { name: 'Tiempo', exact: true }).click();
    await expect(page.getByTestId('field-depreciationType')).toContainText('Lineal');
    await expect(page.getByTestId('field-amortize')).toContainText('Mensual');
    await saveThenProcess(page, /Vida útil - Meses no puede estar vac/i);
    await page.getByTestId('field-usableLifeMonths').fill('0');
    await saveThenProcess(page, /Vida útil - Meses no puede estar vac/i);
    await page.getByTestId('field-usableLifeMonths').fill('-1');
    await saveThenProcess(page, /Vida útil - Meses no puede estar vac/i);
    await page.getByTestId('field-usableLifeMonths').fill('2');

    // NEW: edit Descripción and Valor residual (negative / 0 / below / above), saving each.
    await editDescriptionInPlace(page, stamp);
    await editResidualValues(page);

    // The residual edits leave the form clean; re-touch Valor a amortizar so the
    // create (save-and-process) persists and runs, then create the amortization.
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await saveAsset(page);
    await crearAmortizacionBtn(page).click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Amortización creada/i, { timeout: 20_000 });
    await verifySidebarSync(page);

    // Verify the plan (2 monthly lines).
    await page.getByRole('button', { name: /Plan de amortización/ }).click();
    await expect(page.getByText('06-2026')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('07-2026')).toBeVisible();
    await expect(page.getByText('50.00%')).toHaveCount(2);
    await expect(page.getByText('1,000.00 €')).toHaveCount(2);

    // Capture both period headers (06-2026, 07-2026) for end-of-test cleanup.
    const headerUrls = await captureAmortizationHeaderUrls(page, ['06-2026', '07-2026']);

    // Delete the asset, verify it's gone, then clean up the (now empty) headers.
    await deleteAsset(page);
    await verifyAssetNotInList(page, name);
    await deleteAmortizationHeaders(page, headerUrls);
  });

  // Case 6 — copy of Case 3 (by TIME, yearly) + Descripción/Valor residual edits
  // + cascade delete.
  test('Case 6: by time (yearly) — edit description/residual, then cascade delete', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E residual anual ${stamp}`;
    await createDepreciableAsset(page, { stamp, name });

    await crearAmortizacionBtn(page).click();
    await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });
    await fillStartDate(page, '01012026');
    await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await verifySidebarSync(page);
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    await page.getByTestId('field-calculateType').click();
    await page.getByRole('option', { name: 'Tiempo', exact: true }).click();
    await expect(page.getByTestId('field-depreciationType')).toContainText('Lineal');
    await page.getByTestId('field-amortize').click();
    await page.getByRole('option', { name: 'Anual', exact: true }).click();
    await expect(page.getByTestId('field-usableLifeYears')).toBeVisible();
    await expect(page.getByTestId('field-usableLifeMonths')).toHaveCount(0);
    await saveThenProcess(page, /Vida útil - Años no puede estar vac/i);
    await page.getByTestId('field-usableLifeYears').fill('0');
    await saveThenProcess(page, /Vida útil - Años no puede estar vac/i);
    await page.getByTestId('field-usableLifeYears').fill('-1');
    await saveThenProcess(page, /Vida útil - Años no puede estar vac/i);
    await page.getByTestId('field-usableLifeYears').fill('2');

    await editDescriptionInPlace(page, stamp);
    await editResidualValues(page);

    // The residual edits leave the form clean; re-touch Valor a amortizar so the
    // create (save-and-process) persists and runs, then create the amortization.
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await saveAsset(page);
    await crearAmortizacionBtn(page).click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Amortización creada/i, { timeout: 20_000 });
    await verifySidebarSync(page);

    await page.getByRole('button', { name: /Plan de amortización/ }).click();
    await expect(page.getByText('2026', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2027', { exact: true })).toBeVisible();
    await expect(page.getByText('50.00%')).toHaveCount(2);
    await expect(page.getByText('1,000.00 €')).toHaveCount(2);

    // Capture both period headers (2026, 2027) for end-of-test cleanup.
    const headerUrls = await captureAmortizationHeaderUrls(page, ['2026', '2027']);

    // Delete the asset, verify it's gone, then clean up the (now empty) headers.
    await deleteAsset(page);
    await verifyAssetNotInList(page, name);
    await deleteAmortizationHeaders(page, headerUrls);
  });

  // Case 7 — copy of Case 4 (by PERCENTAGE) + Descripción/Valor residual edits
  // + cascade delete.
  test('Case 7: by percentage — edit description/residual, then cascade delete', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E residual porcentaje ${stamp}`;
    await createDepreciableAsset(page, { stamp, name });

    await crearAmortizacionBtn(page).click();
    await expect(toastByText(page, /fecha de inicio es obligatorio/i)).toBeVisible({ timeout: 10_000 });
    await fillStartDate(page, '01012026');
    await saveThenProcess(page, /Valor a amortizar no puede estar vac/i);
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await verifySidebarSync(page);
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    await expect(page.getByTestId('field-amortize')).toHaveCount(0);
    await expect(page.getByTestId('field-usableLifeMonths')).toHaveCount(0);
    await expect(page.getByTestId('field-annualDepreciation')).toBeVisible();
    await page.getByTestId('field-annualDepreciation').fill('0');
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    await page.getByTestId('field-annualDepreciation').fill('-1');
    await saveThenProcess(page, /Amortización Anual no puede estar vac/i);
    // Above 100% → a client-side guard blocks the process with a clear message.
    await page.getByTestId('field-annualDepreciation').fill('150');
    await saveThenProcess(page, /no puede ser superior al 100%/i);
    await page.getByTestId('field-annualDepreciation').fill('50');

    await editDescriptionInPlace(page, stamp);
    await editResidualValues(page);

    // The residual edits leave the form clean; re-touch Valor a amortizar so the
    // create (save-and-process) persists and runs, then create the amortization.
    await setFieldUntilDirty(page, 'field-depreciationAmt', '2000');
    await saveAsset(page);
    await crearAmortizacionBtn(page).click();
    await expect(page.locator('[data-sonner-toast][data-front="true"]'))
      .toContainText(/Amortización creada/i, { timeout: 20_000 });
    await verifySidebarSync(page);

    await page.getByRole('button', { name: /Plan de amortización/ }).click();
    await expect(page.getByText('2026', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2027', { exact: true })).toBeVisible();
    await expect(page.getByText('50.00%')).toHaveCount(2);
    await expect(page.getByText('1,000.00 €')).toHaveCount(2);

    // Capture both period headers (2026, 2027) for end-of-test cleanup.
    const headerUrls = await captureAmortizationHeaderUrls(page, ['2026', '2027']);

    // Delete the asset, verify it's gone, then clean up the (now empty) headers.
    await deleteAsset(page);
    await verifyAssetNotInList(page, name);
    await deleteAmortizationHeaders(page, headerUrls);
  });

  // Cases 10/11/12 — copies of 2/3/4 but CONFIRM every amortization line of the
  // plan (not just one). With all lines confirmed the asset is 100% depreciated:
  // the sidebar "Depreciado" and the grid bar both show 100%. Then full cleanup.
  for (const { n, mode, periods, label, blocked } of [
    { n: 10, mode: 'monthly', periods: ['06-2026', '07-2026'], label: 'by time (monthly)' },
    { n: 11, mode: 'annual', periods: ['2026', '2027'], label: 'by time (yearly)', blocked: true },
    { n: 12, mode: 'percentage', periods: ['2026', '2027'], label: 'by percentage', blocked: true },
  ]) {
    test(`Case ${n}: ${label} — confirm ALL lines → 100% depreciated, then cleanup`, async ({ page }) => {
      // BLOCKED: the sample data has no 2027 fiscal calendar/periods, so confirming
      // the 2027 amortization line fails in the backend. This is a happy-path case
      // (asset depreciated 100%) that SHOULD run — re-enable once 2027 fiscal
      // periods exist in the sample data. The monthly case (10, both periods in
      // 2026) is unaffected and runs.
      test.skip(!!blocked, 'Sample data lacks the 2027 fiscal calendar/periods; confirming a 2027 amortization fails. Re-enable once 2027 periods exist.');
      const stamp = Date.now();
      const name = `Activo E2E 100% ${mode} ${stamp}`;
      await setupDepreciableWithAmortization(page, { stamp, name, mode });
      const assetUrl = page.url();

      // Capture both period headers, then confirm ALL the plan's amortizations.
      const headerUrls = await captureAmortizationHeaderUrls(page, periods);
      for (const url of headerUrls) await confirmAmortizationForAsset(page, url, name);

      // Every line confirmed → asset 100% depreciated: sidebar + grid bar show 100%.
      await gotoDeepLink(page, assetUrl);
      await verifyDepreciatedSidebar(page, 100);
      await page.goto('/assets');
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
      await findByNameAndGrupo(page, name);
      await verifyGridAmortizationBar(page, 100);

      // Cleanup: reactivate every header, delete the asset (removes its lines),
      // then delete the (now empty) headers.
      for (const url of headerUrls) await reactivateAmortization(page, url);
      await gotoDeepLink(page, assetUrl);
      await expect(page.getByTestId('detail-view')).toBeVisible();
      await deleteAsset(page);
      await verifyAssetNotInList(page, name);
      await deleteAmortizationHeaders(page, headerUrls);
    });
  }

  // Case 9 — toggle Depreciar shows/hides sections; then edit description + delete.
  test('Case 9: toggle Depreciar sections, then edit Descripción and delete', async ({ page }) => {
    const stamp = Date.now();
    const name = `Activo E2E caso 9 ${stamp}`;
    await openNewAsset(page);

    await page.getByTestId('field-searchKey').fill(`AS-E2E-${stamp}`);
    await page.getByTestId('field-name').fill(name);
    await selectGrupoActivoOtros(page);

    const depreciarToggle = page.getByRole('switch').first();

    // OFF (default): disabled hint shown, config fields absent.
    await expect(page.getByText(DISABLED_HINT, { exact: false })).toBeVisible();
    await expect(page.getByTestId('field-assetValue')).toHaveCount(0);

    // Activate → financial + accounting-dimensions sections appear.
    await depreciarToggle.click();
    await expect(page.getByText('Información financiera')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Configuración de depreciación')).toBeVisible();
    await expect(page.getByText('Fechas', { exact: true })).toBeVisible();
    await expect(page.getByText('Dimensiones contables')).toBeVisible();
    await expect(page.getByTestId('field-assetValue')).toBeVisible();
    await expect(page.getByText(DISABLED_HINT, { exact: false })).toHaveCount(0);

    // Deactivate → all those sections hide, hint returns.
    await depreciarToggle.click();
    await expect(page.getByText(DISABLED_HINT, { exact: false })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('field-assetValue')).toHaveCount(0);
    await expect(page.getByText('Información financiera')).toHaveCount(0);
    await expect(page.getByText('Dimensiones contables')).toHaveCount(0);

    // Save the (non-depreciable) asset and find it via the filter.
    await page.getByTestId('action-save').click();
    await expect(toastByText(page, /Registro creado/i)).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('action-cancel').click();
    await expect(page.getByTestId('list-view')).toBeVisible({ timeout: 10_000 });
    await findByNameAndGrupo(page, name);

    // Open it, edit Descripción + save, then delete the record.
    await editDescriptionAndDelete(page, stamp, name);
  });

});

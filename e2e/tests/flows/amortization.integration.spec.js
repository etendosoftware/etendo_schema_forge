import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Amortization window — Test Plan "Activos y Amortizaciones" (REAL BACKEND).
 *
 * Manually-built amortization flow: create two non-depreciable assets, then in
 * the Amortization window create a document, validate required fields, add a line
 * per asset (asset + 50% + 1000), confirm, verify each asset's plan line shows
 * 50% / 1000 / "Confirmado", and clean everything up (reactivate → delete the
 * amortization → delete the assets).
 *
 * Requires: Etendo up (dev proxy → ETENDO_URL), E2E_USE_MOCK=0, E2E_PASSWORD set,
 * an existing asset category named "Otros".
 */

const toastByText = (page, re) => page.locator('[data-sonner-toast]').filter({ hasText: re });
const frontToast = (page) => page.locator('[data-sonner-toast][data-front="true"]');

/** Full-reload navigation to a deep SPA link, tolerating the boot-time redirect
 *  that aborts the first navigation (net::ERR_ABORTED). */
async function gotoDeepLink(page, url) {
  await expect(async () => {
    await page.goto(url, { waitUntil: 'commit' });
  }).toPass({ timeout: 30_000 });
}

/** Create a non-depreciable asset (required fields only, Depreciar OFF). Returns
 *  the asset's detail URL. */
async function createNonDepreciableAsset(page, { searchKey, name }) {
  await page.goto('/assets');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.getByTestId('action-new').click();
  await expect(page.getByTestId('detail-view')).toBeVisible();
  await page.getByTestId('field-searchKey').fill(searchKey);
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('field-assetCategory').click();
  await page.getByRole('option', { name: 'Otros', exact: true }).click();
  await expect(page.getByTestId('field-assetCategory')).toContainText('Otros');
  await page.getByTestId('action-save').click();
  await expect(toastByText(page, /Registro creado/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForURL(/\/assets\/(?!new)[^/?]+/, { timeout: 10_000 });
  return page.url();
}

/** Fill a DateField (es locale: 8 digits "01012026" → "01/01/2026"). */
async function fillDateField(page, testId, digits) {
  const field = page.getByTestId(testId);
  await field.click();
  await field.fill('');
  await field.pressSequentially(digits);
  await field.blur();
}

/** Open the inline add-line row, pick the asset, set the percentage + amount, save
 *  (click outside the row). */
async function addAmortizationLine(page, assetName, pct, amount) {
  await page.getByTestId('action-add-line').click();
  const row = page.getByTestId('inline-add-row');
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.locator('button[role="combobox"]').first().click();
  await page.getByRole('option', { name: assetName, exact: true }).click();
  const nums = row.locator('input[type="number"]');
  await nums.nth(0).fill(String(pct));
  await nums.nth(1).fill(String(amount));
  // "Enter o clic fuera para guardar" — click outside the row (the document name)
  // and wait for the line POST to land.
  const saved = page.waitForResponse(
    (r) => /\/amortization\/lines\b/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 10_000 },
  ).catch(() => null);
  await page.getByTestId('field-name').click();
  await saved;
  await expect(page.getByTestId('inline-add-row')).toHaveCount(0, { timeout: 8_000 });
}

/** On the asset detail, the Plan de amortización tab shows a "Confirmado" line
 *  whose percentage and amount match what was entered in the amortization line. */
async function verifyAssetPlanLineConfirmed(page, assetUrl, pct, amount) {
  await gotoDeepLink(page, assetUrl);
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Plan de amortización/ }).click();
  const row = page.locator('table tr').filter({ hasText: 'Confirmado' }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  // The plan line percentage must equal the percentage entered in the amortization
  // line (rendered with 2 decimals, e.g. 50 → "50.00%").
  await expect(row).toContainText(`${Number(pct).toFixed(2)}%`);
  // ...and the amount (thousands separator may be "." or ",").
  await expect(row).toContainText(new RegExp(String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '[.,]')));
}

/** Full manual-amortization flow at the given percentage/amount: create two
 *  non-depreciable assets, build + validate the amortization header, add a line
 *  per asset, confirm, verify each asset's plan line matches, then clean up. */
async function runManualAmortizationFlow(page, { pct, amount }) {
  const stamp = Date.now();
  const name1 = `Activo Amort E2E 1 ${stamp}`;
  const name2 = `Activo Amort E2E 2 ${stamp}`;
  const asset1Url = await createNonDepreciableAsset(page, { searchKey: `AM-${stamp}-1`, name: name1 });
  const asset2Url = await createNonDepreciableAsset(page, { searchKey: `AM-${stamp}-2`, name: name2 });
  // One amortization line per asset: the percentage + amount entered here are the
  // values each asset's plan line must later match.
  const lines = [
    { name: name1, url: asset1Url, pct, amount },
    { name: name2, url: asset2Url, pct, amount },
  ];

  // New amortization → clear name + accounting date → Guardar → required error.
  await page.goto('/amortization');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.getByTestId('action-new').click();
  await expect(page.getByTestId('detail-view')).toBeVisible();
  await page.getByTestId('field-name').fill('');
  await fillDateField(page, 'field-accountingDate', '');
  await page.getByTestId('action-save-draft').click();
  await expect(frontToast(page)).toContainText(/Completá todos los campos requeridos/i, { timeout: 10_000 });

  // Fill the name only → still missing the accounting date.
  await page.getByTestId('field-name').fill(`Amort E2E ${stamp}`);
  await page.getByTestId('action-save-draft').click();
  await expect(frontToast(page)).toContainText(/Completá todos los campos requeridos/i, { timeout: 10_000 });

  // Fill the accounting date 01/01/2026 → now it saves.
  await fillDateField(page, 'field-accountingDate', '01012026');
  await page.getByTestId('action-save-draft').click();
  await expect(frontToast(page)).toContainText(/Registro creado/i, { timeout: 10_000 });
  await page.waitForURL(/\/amortization\/(?!new)[^/?]+/, { timeout: 10_000 });
  const amortizationUrl = page.url();

  // Add one line per asset (asset + percentage + amount).
  for (const l of lines) await addAmortizationLine(page, l.name, l.pct, l.amount);

  // Confirm the amortization → "Procesado".
  await page.getByTestId('action-save').click(); // "Confirmar" → opens the modal
  const modalConfirm = page.getByRole('button', { name: 'Confirmar amortización', exact: true });
  await expect(modalConfirm).toBeEnabled({ timeout: 10_000 });
  await expect(async () => {
    await modalConfirm.dispatchEvent('click');
    await expect(modalConfirm).toHaveCount(0, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText('Procesado').first()).toBeVisible({ timeout: 15_000 });

  // Each asset's plan line is "Confirmado" and its percentage + amount match what
  // was entered in the amortization line.
  for (const l of lines) await verifyAssetPlanLineConfirmed(page, l.url, l.pct, l.amount);

  // Cleanup: reactivate → delete the amortization → delete both assets.
  await gotoDeepLink(page, amortizationUrl);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('action-more').click();
  await page.getByRole('button', { name: /reactivar|reactivate/i }).click();
  await expect(page.getByText('Borrador').first()).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('action-delete').click();
  await page.getByTestId('action-delete-confirm').click();
  await expect(frontToast(page)).toContainText(/Registro eliminado/i, { timeout: 10_000 });

  for (const url of [asset1Url, asset2Url]) {
    await gotoDeepLink(page, url);
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('action-delete').click();
    await page.getByTestId('action-delete-confirm').click();
    await expect(frontToast(page)).toContainText(/Registro eliminado/i, { timeout: 10_000 });
  }
}

test.describe('Amortization (real backend)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.getByTestId('topbar-user-menu').click();
    await page.getByTestId('user-menu-language-es_ES').click();
  });

  test('manual amortization at 50%: required validation, confirm, verify, cleanup', async ({ page }) => {
    await runManualAmortizationFlow(page, { pct: 50, amount: 1000 });
  });

  test('manual amortization at 100%: both assets fully amortized, confirm, verify, cleanup', async ({ page }) => {
    await runManualAmortizationFlow(page, { pct: 100, amount: 1000 });
  });
});

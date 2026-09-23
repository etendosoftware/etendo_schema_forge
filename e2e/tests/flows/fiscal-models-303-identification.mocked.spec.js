import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Fiscal Models 303 — Identification section conditional rendering (mocked).
 *
 * Tests UI behaviour that depends on real browser interaction and cannot be
 * verified with jsdom/Vitest:
 *   1. Numeric box inputs reject letter input (type="number" browser enforcement)
 *   2. datos_bancarios section appears/disappears based on tipo_declaracion value
 *   3. Rectificativa fields (2024 T4+): nro_justificante, baja_domiciliacion,
 *      and motivo_rectificacion select appear when rectificativa checkbox is checked
 *   4. Complementaria fields (pre-2024-T4): only nro_justificante appears
 *
 * Mock mode: routes are mocked to avoid hitting the real backend.
 * Navigation for the current filing year (2026) uses the real "+ Nueva
 * declaración" button so the full creation flow is exercised, not an internal
 * shortcut (goToDeclaration()). Historical years (ETP-5391 restricted
 * "Nueva declaración" to SELECTABLE_YEARS = [2026], so they can no longer be
 * created that way) are opened by seeding an existing declaration straight
 * into the mocked declarations list and clicking its row instead
 * (goToExistingDeclaration()) — SUPPORTED_YEARS (layout resolution) is
 * unaffected by that restriction and still spans 2021-2026.
 *
 * CasillasTab has a left sidebar with 4 sections:
 *   - "Identificación" → renders identificacion + datos_bancarios
 *   - "Liquidación"    → renders iva_devengado + iva_deducible + resultado
 *   - "Información adicional"
 *   - "Resultado"      → renders resultado_final + sin_actividad + rectificativa
 *
 * Rectificativa/complementaria and editable cells are on the "Resultado" sidebar section.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Navigate to a Modelo 303 declaration by creating it through the real UI flow.
 *
 * Registers specific mocks for /fiscal-models-catalog and /fiscal303/declarations
 * AFTER login so they take priority over the sws/** catch-all registered by
 * login() (Playwright gives precedence to the last-registered route).
 * POST returns a declaration with the requested year/period so the detail view
 * renders the correct layout.
 */
async function goToDeclaration(page, { year, period }) {
  // login() registers a **/sws/** catch-all; our more-specific routes must be
  // added AFTER it so Playwright (last-registered wins) picks ours first.
  await login(page);

  // FmListPage's activeModels state gates both the "Nueva declaración" button
  // and the row-visibility filter (`activeDecls = decls.filter(d =>
  // activeModels[d.model])`). login()'s generic /sws/** catch-all answers this
  // URL with `{ data: [], totalRows: 0 }`, whose truthy-but-wrong-shape `data`
  // key coincidentally satisfies `activeCount > 0` (so the button still
  // renders) but leaves `activeModels['303']` undefined — silently hiding any
  // newly created declaration from the table. Mock it explicitly so model 303
  // is active and the created row is visible.
  await page.route('**/fiscal-models-catalog', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ '303': true, '349': false }) });
  });

  await page.route('**/fiscal303/declarations', (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `test-decl-${year}-${period}`,
          model: '303',
          year,
          period,
          status: 'draft',
          type: 'ord',
          incidents: { blocking: 0, warning: 0, items: [] },
        }),
      });
    } else {
      // GET → empty list so the page loads cleanly
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
  });

  await page.goto('/fiscal-models');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // Open the "Nueva declaración" modal
  await page.getByText('+ Nueva declaración').click();

  // NewDeclModal (post-restyle): Modelo defaults to the first active model
  // (303), so we only need to drive Año → Frecuencia → Período. Año is a
  // dropdown trigger button (`.fm-newdecl-year-trigger`) that opens a
  // `role="listbox"` panel of `role="option"` rows — mirrors the Modelo
  // trigger/`ModelSelectMenu` dropdown pattern. Frecuencia and Período
  // remain plain pill buttons (unaffected by the restyle).
  const modal = page.locator('.fm-config-modal.fm-newdecl-modal');
  await expect(modal).toBeVisible();

  // Año: open the year dropdown, then click the option matching the exact target year.
  await modal.locator('.fm-newdecl-year-trigger').click();
  await modal.getByRole('option', { name: String(year), exact: true }).click();

  // Frecuencia: select quarterly/monthly so the matching Período grid renders
  // before we try to click the period pill (a 2-digit month like "01" only
  // exists in the monthly grid; "T1".."T4" only exist in the quarterly grid).
  const isMonthly = /^\d{2}$/.test(period);
  await modal
    .getByRole('group', { name: 'Frecuencia' })
    .getByRole('button', { name: isMonthly ? 'Mensual' : 'Trimestral', exact: true })
    .click();

  // Período: click the pill matching the exact target period.
  await modal.getByRole('button', { name: period, exact: true }).click();

  await modal.getByRole('button', { name: 'Crear declaración', exact: true }).click();

  // Click the new row to open the declaration detail
  const row = page.locator('tr').filter({ hasText: String(year) }).first();
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.click();
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/**
 * Navigate directly to an EXISTING Modelo 303 declaration for a historical
 * year, bypassing "Nueva declaración" entirely.
 *
 * ETP-5391 restricted the "Nueva declaración" Año dropdown to a single
 * selectable year (`SELECTABLE_YEARS`, see fm303Layouts.js — currently just
 * the current filing year, 2026), so the old "create it via the modal, then
 * open it" path this file used for every year no longer works for a
 * historical one. That restriction only applies to CREATING a new
 * declaration though: `SUPPORTED_YEARS` (layout resolution for an EXISTING
 * declaration) is unchanged and still spans 2021-2026, so the historical
 * layout differences these tests actually cover (fm303Layouts.js PATCHES
 * per year) are still fully in place and still worth testing.
 *
 * This seeds a declaration for the requested year/period straight into the
 * mocked GET /fiscal303/declarations response — as if it already existed,
 * which for a past year it always would in real usage — and opens it by
 * clicking its row, exactly like goToDeclaration() does after creating one.
 * The declaration shape mirrors the POST response goToDeclaration() mocks
 * above so FmModel303Page hydrates identically either way.
 */
async function goToExistingDeclaration(page, { year, period, extra = {} }) {
  await login(page);

  // Same reasoning as goToDeclaration() above: must be registered after
  // login() so it wins over the generic /sws/** catch-all.
  await page.route('**/fiscal-models-catalog', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ '303': true, '349': false }) });
  });

  const declaration = {
    id: `test-decl-${year}-${period}`,
    model: '303',
    year,
    period,
    status: 'draft',
    type: 'ord',
    incidents: { blocking: 0, warning: 0, items: [] },
    ...extra,
  };

  await page.route('**/fiscal303/declarations', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([declaration]) });
      return;
    }
    route.fallback();
  });

  await page.goto('/fiscal-models');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // Click the seeded row to open the declaration detail — same mechanism
  // goToDeclaration() uses after creating one, just skipping the modal.
  const row = page.locator('tr').filter({ hasText: String(year) }).first();
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.click();
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

/**
 * Click the "Identificación" button in the CasillasTab left sidebar.
 * This renders the identificacion + datos_bancarios sections.
 *
 * `isVisible()` is a single no-wait snapshot: under full-suite concurrency
 * the button can simply not be painted yet at the instant this runs, so the
 * old `if (await btn.isVisible()) await btn.click()` guard silently skipped
 * the click and left the wrong sidebar section active — every assertion
 * after it then failed for a reason unrelated to what the test names.
 * `waitFor` polls instead of sampling once, so the click always fires.
 */
async function goToIdentificacion(page) {
  const btn = page.getByRole('button', { name: /^Identificaci[oó]n$/i });
  await btn.waitFor({ state: 'visible', timeout: 8_000 });
  await btn.click();
}

/**
 * Click the "Resultado" button in the CasillasTab left sidebar.
 * This renders the resultado_final + sin_actividad + rectificativa sections.
 * Editable cells and rectificativa/complementaria sections live here.
 * See goToIdentificacion() above for why this waits instead of sampling.
 */
async function goToResultadoFinal(page) {
  const btn = page.getByRole('button', { name: /^Resultado$/i });
  await btn.waitFor({ state: 'visible', timeout: 8_000 });
  await btn.click();
}

// ── Suite 2 — datos_bancarios conditional visibility ─────────────────────────
// The identificacion sidebar also contains select options with "Devolución" and
// "Domiciliación" text, so we cannot filter sections by those words. Instead
// we check visibility of the IBAN field (unique to datos_bancarios) and use
// .last() when checking section visibility to skip the identificacion section.

test.describe('FM 303 — datos_bancarios section visibility', () => {
  test.beforeEach(async ({ page }) => {
    await goToDeclaration(page, { year: 2026, period: 'T1' });
    await goToIdentificacion(page);
  });

  test('datos_bancarios is hidden for Ingreso (I) — EDID065 fix, I no longer allows/requires IBAN', async ({ page }) => {
    const select = page.locator('.fm-aeat-ident-inline-field__select--compact').first();
    await select.selectOption('I');
    // AEAT rejects Modelo 303 submissions with error EDID065 if IBAN is present for a tipo
    // other than U/D/X — the datos_bancarios section (and its IBAN field) must not render for I.
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /IBAN/i })
    ).not.toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /SWIFT|BIC/i })
    ).not.toBeVisible();
  });

  test('datos_bancarios appears with Domiciliación title when tipo_declaracion is U', async ({ page }) => {
    const select = page.locator('.fm-aeat-ident-inline-field__select--compact').first();
    await select.selectOption('U');
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /domiciliaci/i }).last()
    ).toBeVisible();
    // IBAN visible, SWIFT not visible for Domiciliación
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /IBAN/i })
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /SWIFT|BIC/i })
    ).not.toBeVisible();
  });

  test('section disappears when switching to Sin Resultado (N)', async ({ page }) => {
    const select = page.locator('.fm-aeat-ident-inline-field__select--compact').first();
    await select.selectOption('D');
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /devoluci/i }).last()
    ).toBeVisible();
    await select.selectOption('N');
    // N is not in the datos_bancarios visible set — IBAN field disappears
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /IBAN/i })
    ).not.toBeVisible();
  });
});

// ── Suite 3 — Rectificativa fields (2024 T4+) ────────────────────────────────
// Rectificativa section lives in the "Resultado" sidebar section (resultado_final).
// (ETP-5338) These checkboxes are now `CheckboxField` — a bare
// `<button role="checkbox" aria-checked>`, not a native `<input type="checkbox">`.
// Locate it via role and click it directly; no `{ force: true }` needed since
// there is no sr-only input hidden behind an overlay anymore.

test.describe('FM 303 — rectificativa conditional fields (2024 T4+)', () => {
  test.beforeEach(async ({ page }) => {
    // 2024 T4 uses the BASE layout — full rectificativa section.
    // (ETP-5391) 2024 is outside SELECTABLE_YEARS (creation-only restriction),
    // so this opens a seeded existing declaration instead of creating a new
    // one — see goToExistingDeclaration()'s docblock.
    await goToExistingDeclaration(page, { year: 2024, period: 'T4' });
    await goToResultadoFinal(page);
  });

  test('nro_justificante, baja_domiciliacion and motivo are hidden when rectificativa unchecked', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /rectificativa/i }).last();
    const checkbox = section.getByRole('checkbox').first();
    if (await checkbox.isChecked()) await checkbox.click();

    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /justificante/i })
    ).not.toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /baja|domiciliaci/i })
    ).not.toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /motivo/i })
    ).not.toBeVisible();
  });

  test('checking rectificativa reveals nro_justificante, baja_domiciliacion and motivo select', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /rectificativa/i }).last();
    const checkbox = section.getByRole('checkbox').first();
    if (!(await checkbox.isChecked())) await checkbox.click();

    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /justificante/i })
    ).toBeVisible();
    // baja_domiciliacion is a checkbox — rendered as .fm-aeat-ident-cb, not .fm-aeat-ident-inline-field
    await expect(
      page.locator('.fm-aeat-ident-cb').filter({ hasText: /baja|domiciliaci/i })
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /motivo/i }).locator('select')
    ).toBeVisible();
  });
});

// ── Suite 4 — Complementaria fields (2023) ───────────────────────────────────
// Complementaria section lives in the "Resultado" sidebar section (resultado_final).

test.describe('FM 303 — complementaria shows only nro_justificante (2023)', () => {
  test.beforeEach(async ({ page }) => {
    // (ETP-5391) 2023 is outside SELECTABLE_YEARS — see goToExistingDeclaration()'s docblock.
    await goToExistingDeclaration(page, { year: 2023, period: 'T1' });
    await goToResultadoFinal(page);
  });

  test('checking complementaria shows only nro_justificante, not baja_domiciliacion or motivo', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i }).last();
    const checkbox = section.getByRole('checkbox').first();
    if (!(await checkbox.isChecked())) await checkbox.click();

    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /justificante/i })
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /baja|domiciliaci/i })
    ).not.toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /motivo/i })
    ).not.toBeVisible();
  });
});

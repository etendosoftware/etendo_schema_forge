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
 * Navigation uses the real "+ Nueva declaración" button so the full creation
 * flow is exercised, not an internal shortcut.
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
 * Registers a specific mock for /fiscal303/declarations AFTER login so that
 * it takes priority over the sws/** catch-all registered by login()
 * (Playwright gives precedence to the last-registered route).
 * POST returns a declaration with the requested year/period so the detail view
 * renders the correct layout.
 */
async function goToDeclaration(page, { year, period }) {
  // login() registers a **/sws/** catch-all; our more-specific route must be
  // added AFTER it so Playwright (last-registered wins) picks ours first.
  await login(page);

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
  await page.waitForLoadState('networkidle').catch(() => {});

  // Open the "Nueva declaración" modal
  await page.getByText('+ Nueva declaración').click();

  // The modal: first select = model (303/349), second select = year, input = period
  const modal = page.locator('.fm-present-modal');
  await modal.locator('select').nth(1).selectOption(String(year));
  await modal.locator('input').fill(period);
  await modal.getByRole('button', { name: /Crear/i }).click();

  // Click the new row to open the declaration detail
  const row = page.locator('tr').filter({ hasText: String(year) }).first();
  await expect(row).toBeVisible({ timeout: 5_000 });
  await row.click();
  await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Click the "Identificación" button in the CasillasTab left sidebar.
 * This renders the identificacion + datos_bancarios sections.
 */
async function goToIdentificacion(page) {
  const btn = page.getByRole('button', { name: /^Identificaci[oó]n$/i });
  if (await btn.isVisible()) await btn.click();
}

/**
 * Click the "Resultado" button in the CasillasTab left sidebar.
 * This renders the resultado_final + sin_actividad + rectificativa sections.
 * Editable cells and rectificativa/complementaria sections live here.
 */
async function goToResultadoFinal(page) {
  const btn = page.getByRole('button', { name: /^Resultado$/i });
  if (await btn.isVisible()) await btn.click();
}

// ── Suite 1 — Numeric inputs reject letters ───────────────────────────────────

test.describe('FM 303 — numeric box inputs reject letters', () => {
  test.beforeEach(async ({ page }) => {
    await goToDeclaration(page, { year: 2026, period: 'T1' });
    // Editable cells are in resultado_final sidebar section
    await goToResultadoFinal(page);
  });

  test('clicking edit on a box cell shows a number input', async ({ page }) => {
    const editBtn = page.locator('.fm-aeat-cell__edit-btn').first();
    await editBtn.click();
    const input = page.locator('.fm-aeat-cell__input[type="number"]').first();
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('step', 'any');
  });

  test('number input does not accept letter characters', async ({ page }) => {
    const editBtn = page.locator('.fm-aeat-cell__edit-btn').first();
    await editBtn.click();
    const input = page.locator('.fm-aeat-cell__input[type="number"]').first();
    // fill() refuses to type into number inputs; use pressSequentially to simulate keystrokes
    await input.pressSequentially('abc');
    // type="number" inputs silently discard non-numeric characters
    await expect(input).toHaveValue('');
  });

  test('number input accepts a valid numeric value', async ({ page }) => {
    const editBtn = page.locator('.fm-aeat-cell__edit-btn').first();
    await editBtn.click();
    const input = page.locator('.fm-aeat-cell__input[type="number"]').first();
    await input.fill('1234.56');
    await expect(input).toHaveValue('1234.56');
  });
});

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

  test('datos_bancarios is hidden when tipo_declaracion is Ingreso (I)', async ({ page }) => {
    const select = page.locator('.fm-aeat-ident-inline-field__select--compact').first();
    await select.selectOption('I');
    // When datos_bancarios is hidden, no IBAN field is rendered
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /IBAN/ })
    ).not.toBeVisible();
  });

  test('datos_bancarios appears with Devolución fields when tipo_declaracion is D', async ({ page }) => {
    const select = page.locator('.fm-aeat-ident-inline-field__select--compact').first();
    await select.selectOption('D');
    // The datos_bancarios section becomes visible — use .last() because the
    // identificacion section also contains "devolución" in its select options
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /devoluci/i }).last()
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /IBAN/i })
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /SWIFT|BIC/i })
    ).toBeVisible();
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

  test('section disappears again when switching back to Ingreso', async ({ page }) => {
    const select = page.locator('.fm-aeat-ident-inline-field__select--compact').first();
    await select.selectOption('D');
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /devoluci/i }).last()
    ).toBeVisible();
    await select.selectOption('I');
    // IBAN field disappears when switching back
    await expect(
      page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /IBAN/i })
    ).not.toBeVisible();
  });
});

// ── Suite 3 — Rectificativa fields (2024 T4+) ────────────────────────────────
// Rectificativa section lives in the "Resultado" sidebar section (resultado_final).
// The Checkbox component uses a sr-only input; { force: true } is required.

test.describe('FM 303 — rectificativa conditional fields (2024 T4+)', () => {
  test.beforeEach(async ({ page }) => {
    // 2024 T4 uses the BASE layout — full rectificativa section
    await goToDeclaration(page, { year: 2024, period: 'T4' });
    await goToResultadoFinal(page);
  });

  test('nro_justificante, baja_domiciliacion and motivo are hidden when rectificativa unchecked', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /rectificativa/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    if (await checkbox.isChecked()) await checkbox.click({ force: true });

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
    const checkbox = section.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isChecked())) await checkbox.click({ force: true });

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

  test('motivo select has Rectificaciones and Discrepancia options', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /rectificativa/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isChecked())) await checkbox.click({ force: true });

    const motivoSelect = page.locator('.fm-aeat-ident-inline-field').filter({ hasText: /motivo/i }).locator('select');
    await expect(motivoSelect.locator('option[value="R"]')).toHaveCount(1);
    await expect(motivoSelect.locator('option[value="D"]')).toHaveCount(1);
  });
});

// ── Suite 4 — Complementaria fields (2023) ───────────────────────────────────
// Complementaria section lives in the "Resultado" sidebar section (resultado_final).

test.describe('FM 303 — complementaria shows only nro_justificante (2023)', () => {
  test.beforeEach(async ({ page }) => {
    await goToDeclaration(page, { year: 2023, period: 'T1' });
    await goToResultadoFinal(page);
  });

  test('section is titled Complementaria, not Rectificativa', async ({ page }) => {
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i })
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /autoliquidaci.*rectif/i })
    ).not.toBeVisible();
  });

  test('checking complementaria shows only nro_justificante, not baja_domiciliacion or motivo', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isChecked())) await checkbox.click({ force: true });

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

// ── Suite 5 — Complementaria fields (2024 T1) ────────────────────────────────

test.describe('FM 303 — complementaria shows only nro_justificante (2024 T1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToDeclaration(page, { year: 2024, period: 'T1' });
    await goToResultadoFinal(page);
  });

  test('checking complementaria shows only nro_justificante', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isChecked())) await checkbox.click({ force: true });

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

// ── Suite 6 — sin_actividad checkbox in Resultado sidebar ────────────────────
// sin_actividad lives in the "Resultado" sidebar section (after resultado_final
// in sectionOrder). The Checkbox component renders input[type="checkbox"] with
// class sr-only inside .fm-aeat-ident-cb — { force: true } is required to click.

test.describe('FM 303 — sin_actividad checkbox', () => {
  test.beforeEach(async ({ page }) => {
    await goToDeclaration(page, { year: 2026, period: 'T1' });
    await goToResultadoFinal(page);
  });

  test('sin_actividad section is visible in the Resultado sidebar', async ({ page }) => {
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /sin.actividad/i })
    ).toBeVisible();
  });

  test('sin_actividad checkbox is rendered and initially unchecked', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /sin.actividad/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    await expect(checkbox).not.toBeChecked();
  });

  test('sin_actividad checkbox can be toggled on', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /sin.actividad/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    await checkbox.click({ force: true });
    await expect(checkbox).toBeChecked();
  });

  test('sin_actividad checkbox can be toggled back off', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /sin.actividad/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    // Toggle on then off
    await checkbox.click({ force: true });
    await expect(checkbox).toBeChecked();
    await checkbox.click({ force: true });
    await expect(checkbox).not.toBeChecked();
  });
});

// ── Suite 7 — Year <select> in NewDeclModal shows only supported years ────────
// The modal year selector must be a <select> (not a free-text input) and must
// expose exactly the SUPPORTED_YEARS options (2021–2026).
// This suite uses its own beforeEach that stops after opening the modal so it
// doesn't depend on a complete declaration creation flow.

test.describe('FM 303 — NewDeclModal year select shows supported years only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Mock declarations endpoint so the page loads cleanly
    await page.route('**/fiscal303/declarations', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.goto('/fiscal-models');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.getByText('+ Nueva declaración').click();
  });

  test('year field is a <select> element, not a free-text input', async ({ page }) => {
    const modal = page.locator('.fm-present-modal');
    // nth(0) = model select (303/349), nth(1) = year select
    const yearSelect = modal.locator('select').nth(1);
    await expect(yearSelect).toBeVisible();
  });

  test('year select has options for all supported years 2021 to 2026', async ({ page }) => {
    const modal = page.locator('.fm-present-modal');
    const yearSelect = modal.locator('select').nth(1);
    for (const year of [2021, 2022, 2023, 2024, 2025, 2026]) {
      await expect(yearSelect.locator(`option[value="${year}"]`)).toHaveCount(1);
    }
  });

  test('year select does not have options outside the supported range', async ({ page }) => {
    const modal = page.locator('.fm-present-modal');
    const yearSelect = modal.locator('select').nth(1);
    // Years outside supported range must not appear
    for (const badYear of [2019, 2020, 2027, 2030]) {
      await expect(yearSelect.locator(`option[value="${badYear}"]`)).toHaveCount(0);
    }
  });
});

// ── Suite 8 — 2021 and 2022 complementaria (regression guard for year patches) ─
// Mirrors Suites 4 and 5 for 2021 and 2022 to ensure patch application for those
// years does not accidentally reintroduce the rectificativa section or break the
// complementaria layout.

test.describe('FM 303 — complementaria shows only nro_justificante (2022)', () => {
  test.beforeEach(async ({ page }) => {
    await goToDeclaration(page, { year: 2022, period: 'T1' });
    await goToResultadoFinal(page);
  });

  test('section is titled Complementaria, not Rectificativa', async ({ page }) => {
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i })
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /autoliquidaci.*rectif/i })
    ).not.toBeVisible();
  });

  test('checking complementaria shows only nro_justificante', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isChecked())) await checkbox.click({ force: true });

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

test.describe('FM 303 — complementaria shows only nro_justificante (2021)', () => {
  test.beforeEach(async ({ page }) => {
    await goToDeclaration(page, { year: 2021, period: 'T1' });
    await goToResultadoFinal(page);
  });

  test('section is titled Complementaria, not Rectificativa', async ({ page }) => {
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i })
    ).toBeVisible();
    await expect(
      page.locator('.fm-aeat-section').filter({ hasText: /autoliquidaci.*rectif/i })
    ).not.toBeVisible();
  });

  test('checking complementaria shows only nro_justificante', async ({ page }) => {
    const section = page.locator('.fm-aeat-section').filter({ hasText: /complementaria/i }).last();
    const checkbox = section.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isChecked())) await checkbox.click({ force: true });

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

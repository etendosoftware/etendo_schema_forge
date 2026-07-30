import { test, expect } from '@playwright/test';

const RUN_ONBOARDING_E2E = process.env.RUN_ONBOARDING_E2E === '1';
function buildDisposablePassword(suffix) {
  return `Qa-${suffix}-Pass!42`;
}

test.describe('Onboarding invoice readiness', () => {
  test.skip(!RUN_ONBOARDING_E2E, 'Set RUN_ONBOARDING_E2E=1 to run state-changing onboarding E2E tests.');
  test.setTimeout(180_000);
  test.describe.configure({ retries: 0 });

  test('new onboarding seeds a payment term available to Sales Invoice', async ({ page }) => {
    const suffix = `${Date.now()}`;
    const email = `sbarrozo+onboarding-payment-term-${suffix}@gmail.com`;
    const clientName = `QA Payment Term Seed ${suffix}`;
    const password = buildDisposablePassword(suffix);

    await page.goto('/onboarding');

    await page.getByRole('textbox', { name: 'Nombre*' }).fill('QA Payment Term User');
    await page.getByRole('textbox', { name: 'Correo electrónico*' }).fill(email);
    await page.getByRole('textbox', { name: 'Contraseña*' }).fill(password);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByText(/Vamos a dejar todo listo/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Continuar/ }).click();

    await page.getByRole('textbox', { name: 'Nombre de la empresa*' }).fill(clientName);
    await page.locator('#fiscalIdValue').fill('B12345678');
    await page.getByRole('textbox', { name: /Dirección/ }).fill('Calle QA 123, Madrid');

    await Promise.all([
      page.waitForURL('**/dashboard', { timeout: 120_000 }),
      page.getByRole('button', { name: /Empezar/ }).click(),
    ]);

    await expect(page.getByRole('button', { name: email })).toBeVisible({ timeout: 30_000 });

    // ETP-4576 — this probe authenticates exactly like the app's own readiness
    // probes (tools/app-shell/src/pages/onboarding/onboardingReadiness.js): with
    // the server-side `__Host-` session cookie, via `credentials: 'include'` and
    // NO Authorization header. The session contract no longer hands the client a
    // bearer token at all, so the `sf_auth_token` this used to read is always
    // null — the request went out as `Authorization: Bearer null`.
    const selectorResponse = await page.evaluate(async () => {
      const response = await fetch('/sws/neo/sales-invoice/header/selectors/C_PaymentTerm_ID?isSOTrx=Y&isCustomer=Y&limit=50&offset=0', {
        credentials: 'include',
      });
      return {
        status: response.status,
        body: await response.json(),
      };
    });

    // A 200 here is also the assertion that the cookie session authenticates the
    // call — it replaces the old "the bearer token from localStorage works"
    // contract. A 401 means the cookie never reached /sws/neo/*.
    expect(selectorResponse.status, JSON.stringify(selectorResponse.body)).toBe(200);
    expect(selectorResponse.body.items, JSON.stringify(selectorResponse.body)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          label: expect.any(String),
        }),
      ])
    );

    await page.goto('/sales-invoice/new');
    await expect(page.getByText('Ventas / Factura de Venta / Nuevo')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('combobox', { name: 'Condiciones de pago*' })).toContainText(/\S/);
  });
});

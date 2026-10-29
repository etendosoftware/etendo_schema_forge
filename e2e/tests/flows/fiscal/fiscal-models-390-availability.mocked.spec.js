// @covers tools/app-shell/src/windows/custom/fiscal-models/catalogAvailability.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/useFiscalModelsCatalog.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmCatalogPage.jsx
// @covers tools/app-shell/src/windows/custom/organization/useFiscalSectionVisibility.js
import { test, expect } from '@playwright/test';
import { login, MOCK_ORG_ID } from '../../helpers/auth.js';

/**
 * Modelo 390 availability (mocked) — backend-only flag `fiscal-model-390`.
 *
 * The SPA never evaluates the flag: it reacts to the fiscal models catalog answer.
 *   flag off → `GET /sws/neo/fiscal-models-catalog` answers without `390` and with
 *              `"_unavailable": ["390"]`
 *   flag on  → the plain stored catalog
 *
 * Off must hide the 390 everywhere a user can reach it: the catalog drawer's card, the
 * declarations list (count, Modelo filter, "Nueva declaración") and the Organization window's
 * "Representante legal / Modelo 390" section. On must show all of them.
 *
 * Mock mode only. Every route is installed AFTER `login()`: Playwright matches routes in reverse
 * registration order, so the generic `/sws/**` stub would otherwise answer first.
 * Run with: `cd e2e && npx playwright test tests/flows/fiscal/fiscal-models-390-availability.mocked.spec.js`
 */

const FLAG_OFF_CATALOG = { 303: true, 349: false, _unavailable: ['390'] };
const FLAG_ON_CATALOG = { 303: true, 349: false, 390: true };

async function installCatalog(page, catalog) {
  await page.route('**/sws/neo/fiscal-models-catalog', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) });
  });
}

async function openFiscalModels(page, catalog) {
  await login(page);
  await installCatalog(page, catalog);
  // An empty declarations list keeps the page on its toolbar; the catalog alone drives it.
  for (const pattern of ['**/fiscal303/declarations', '**/fiscal303/declarations?**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  }
  await page.goto('/fiscal-models');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('fm-list-new-declaration-button')).toBeVisible({ timeout: 15_000 });
}

/** The option texts of the list's "Modelo" filter (2nd toolbar pill: year, model, status). */
async function modelFilterOptions(page) {
  await page.locator('.fm-toolbar__pill').nth(1).click();
  const options = page.locator('.fm-status-select__menu [role="option"]');
  await expect(options.first()).toBeVisible();
  return options.allTextContents();
}

/** The model ids offered by the "Nueva declaración" modal's Modelo dropdown. */
async function newDeclarationModels(page) {
  await page.getByTestId('fm-list-new-declaration-button').click();
  const modal = page.locator('.fm-config-modal.fm-newdecl-modal');
  await expect(modal).toBeVisible();
  await modal.locator('.fm-newdecl-model-trigger').click();
  const badges = modal.locator('.fm-newdecl-model-option .fm-model-badge');
  await expect(badges.first()).toBeVisible();
  return badges.allTextContents();
}

/** The model ids of the cards in the catalog drawer. */
async function catalogDrawerModels(page) {
  await page.getByTestId('fm-list-catalog-button').click();
  const badges = page.locator('.fm-catalog-drawer .fm-catalog-card__badge');
  await expect(badges.first()).toBeVisible();
  return (await badges.allTextContents()).map((s) => s.trim()).sort();
}

const orgRecord = {
  id: MOCK_ORG_ID,
  name: 'E2E Organización',
  socialName: 'E2E Nombre Comercial',
  etgoBusinessType: '',
  'currency$_identifier': 'EUR',
  updated: 'ORG-TOKEN',
};
const infoRecord = {
  id: MOCK_ORG_ID,
  taxID: 'B12345674',
  locationAddress: 'e2e-location-0001',
  'locationAddress$_identifier': 'Calle Falsa - 123 - 28001 - Madrid - España',
  yourCompanyDocumentImage: '',
  etgoEmail: 'e2e@example.com',
  etgoPhone: '600000000',
  etgoWeb: '',
  updated: 'INFO-TOKEN',
};

async function openOrganization(page, catalog) {
  await login(page);
  await installCatalog(page, catalog);
  for (const [entity, record] of [['organization', orgRecord], ['information', infoRecord]]) {
    const handler = (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [record] } }),
    });
    // A bare `word**` glob does not cross a `/`: register both forms (see organization-save spec).
    await page.route(`**/sws/neo/organization/${entity}/**`, handler);
    await page.route(`**/sws/neo/organization/${entity}**`, handler);
  }
  await page.goto('/organization');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('OrganizationPage__phone')).toBeVisible({ timeout: 15_000 });
}

test.describe('Modelo 390 availability — flag off (catalog marks 390 unavailable)', () => {
  test('the declarations list counts only 303 and offers no 390 in the Modelo filter', async ({ page }) => {
    await openFiscalModels(page, FLAG_OFF_CATALOG);

    await expect(page.getByTestId('fm-list-catalog-button')).toContainText('(1)');
    const options = await modelFilterOptions(page);
    expect(options.some((o) => o.includes('303'))).toBe(true);
    expect(options.some((o) => o.includes('390'))).toBe(false);
  });

  test('"Nueva declaración" offers no 390', async ({ page }) => {
    await openFiscalModels(page, FLAG_OFF_CATALOG);

    const models = await newDeclarationModels(page);
    expect(models.map((s) => s.trim())).toEqual(['303']);
  });

  test('the catalog drawer has no 390 card', async ({ page }) => {
    await openFiscalModels(page, FLAG_OFF_CATALOG);

    expect(await catalogDrawerModels(page)).toEqual(['303', '349']);
  });

  test('the Organization window shows no "Representante legal / Modelo 390" section', async ({ page }) => {
    await openOrganization(page, FLAG_OFF_CATALOG);

    // The IAE section (303 active) proves the catalog answer has been applied.
    await expect(page.getByTestId('OrganizationPage__section-iae')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('OrganizationPage__section-390')).toHaveCount(0);
  });
});

test.describe('Modelo 390 availability — flag on (plain catalog)', () => {
  test('the declarations list counts the 390 and offers it in the Modelo filter', async ({ page }) => {
    await openFiscalModels(page, FLAG_ON_CATALOG);

    await expect(page.getByTestId('fm-list-catalog-button')).toContainText('(2)');
    const options = await modelFilterOptions(page);
    expect(options.some((o) => o.includes('390'))).toBe(true);
  });

  test('"Nueva declaración" offers the 390', async ({ page }) => {
    await openFiscalModels(page, FLAG_ON_CATALOG);

    const models = await newDeclarationModels(page);
    expect(models.map((s) => s.trim()).sort()).toEqual(['303', '390']);
  });

  test('the catalog drawer shows the 390 card', async ({ page }) => {
    await openFiscalModels(page, FLAG_ON_CATALOG);

    expect(await catalogDrawerModels(page)).toEqual(['303', '349', '390']);
  });

  test('the Organization window shows the "Representante legal / Modelo 390" section', async ({ page }) => {
    await openOrganization(page, FLAG_ON_CATALOG);

    await expect(page.getByTestId('OrganizationPage__section-390')).toBeVisible({ timeout: 15_000 });
  });
});

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Offline financial account creation — smoke (mocked).
 *
 * Validates the ETP-4096 (T2) "New Account" wizard reachable from the Cuentas
 * page: type picker → (Bank) connection toggle → bank picker → institution →
 * form → submit. The spec mocks the generic W (CRUD) endpoints introduced by
 * ETP-4239: the currency selector + entity defaults GETs (so the wizard can
 * pre-select EUR) and the create POST against the `account` entity.
 *
 * Mock mode only: installs the `financial-account` selector/defaults/create
 * handlers and the `financial-accounts-page` list AFTER the generic /sws/**
 * stub seeded by login() so the specific handlers win (Playwright matches
 * routes in reverse registration order). Within installCreateMocks the POST
 * route is registered FIRST so the more specific selectors/defaults routes
 * (registered later) take priority over it.
 *
 * Default app locale is es_ES (see useLocaleState.DEFAULT_LOCALE), so the copy
 * assertions target the Spanish strings.
 *
 * Status: authored to follow the existing mocked-spec patterns; run with
 *   cd e2e && npm test -- tests/flows/financial-account-create.mocked.spec.js
 * (requires the same dev server the sibling financial-account specs use).
 */

const ACCOUNTS = [
  {
    id: 'acc-1',
    name: 'BBVA',
    type: 'B',
    currentBalance: 1000,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000001',
    isDefault: true,
    pendingCount: 0,
    psd2Connected: false,
  },
];

const SUMMARY = {
  totalBalance: 1000,
  byCurrency: [{ currencyIso: 'EUR', total: 1000 }],
  pending: { accountsWithPending: 0, suggestionsReady: 0, byRule: 0 },
};

// Selector rows for the C_Currency_ID selector — the hook maps `name` to the
// ISO code (`{ id, iso, symbol }`), so the wizard sees EUR + USD.
const CURRENCY_ROWS = [
  { id: '102', name: 'EUR' },
  { id: '100', name: 'USD' },
];

// Entity defaults envelope — `defaults.currency` is the session default the
// wizard pre-selects.
const ENTITY_DEFAULTS = { defaults: { currency: '102' } };

/**
 * Installs the financial-account mocks (generic W endpoints, ETP-4239). All of
 * them must be installed after login()'s generic /sws/** stub. Registration
 * order matters: Playwright matches routes in reverse registration order, so
 * the create POST route goes FIRST and the more specific selectors/defaults
 * routes go AFTER it — they must not be swallowed by the entity route.
 *
 * @param {import('@playwright/test').Page} page the test page
 * @param {() => void} onCreate called when the create POST is intercepted
 */
async function installCreateMocks(page, onCreate) {
  // POST /financial-account/account → 201 created.
  await page.route('**/sws/neo/financial-account/account', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') {
      await route.fallback();
      return;
    }
    onCreate?.();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [{ id: 'acc-new', name: 'Cuenta BBVA' }] } }),
    });
  });

  // GET /account/selectors/C_Currency_ID?limit=200 → currency selector rows.
  await page.route('**/sws/neo/financial-account/account/selectors/C_Currency_ID*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: CURRENCY_ROWS } }),
    });
  });

  // GET /account/defaults → session default currency (best-effort in the hook).
  await page.route('**/sws/neo/financial-account/account/defaults', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ENTITY_DEFAULTS),
    });
  });

  // List endpoint — used by the Cuentas page (and re-fetched after create).
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { accounts: ACCOUNTS, summary: SUMMARY } } }),
    });
  });
}

test.describe('Financial Account Create (T2) — mocked', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('walks Bank → Sin conexión → Santander → institution → form → submit', async ({ page }) => {
    let created = false;
    await installCreateMocks(page, () => {
      created = true;
    });

    await page.goto('/finance/accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Open the wizard from the Cuentas toolbar.
    await page.getByTestId('cuentas-new-account-button').click();
    await expect(page.getByTestId('new-account-wizard')).toBeVisible();

    // Step 1: pick the Bank type.
    await page.getByTestId('new-account-type-B').click();

    // Step 2: connection options — both cards are info-only tiles; only
    // "Sin conexión" carries an onClick and advances the wizard.
    await expect(page.getByTestId('account-connection-options')).toBeVisible();
    await expect(page.getByTestId('account-connection-online')).toBeVisible();
    await expect(page.getByTestId('account-connection-offline')).toBeVisible();
    await page.getByTestId('account-connection-offline').click();

    // Step 3: bank picker — search then pick Santander.
    await expect(page.getByTestId('new-account-bank-search')).toBeVisible();
    await page.getByTestId('new-account-bank-search').fill('santander');
    await page.getByTestId('new-account-bank-santander').click();

    // Step 4: institution list — pick the first variant.
    await expect(page.getByTestId('new-account-institution-santander-default')).toBeVisible();
    await page.getByTestId('new-account-institution-santander-default').click();

    // Step 5: the form. Currency is pre-selected from defaults (EUR).
    await expect(page.getByTestId('account-form')).toBeVisible();
    await page.getByTestId('account-form-name').fill('Cuenta BBVA');
    await page.getByTestId('account-form-iban').fill('ES9121000418450200051332');

    // Submit must be enabled and fire the create POST.
    const submit = page.getByTestId('account-form-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Success toast (es_ES) + the create POST landed.
    await expect(page.getByText('Cuenta creada')).toBeVisible();
    expect(created).toBe(true);

    // The wizard closes after a successful create.
    await expect(page.getByTestId('new-account-wizard')).toHaveCount(0);
  });

  test('blocks submit and shows the IBAN error for an invalid IBAN', async ({ page }) => {
    await installCreateMocks(page);

    await page.goto('/finance/accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('cuentas-new-account-button').click();
    await page.getByTestId('new-account-type-B').click();
    await page.getByTestId('account-connection-offline').click();
    await page.getByTestId('new-account-bank-santander').click();
    await page.getByTestId('new-account-institution-santander-default').click();

    await page.getByTestId('account-form-name').fill('Cuenta BBVA');
    await page.getByTestId('account-form-iban').fill('ES00INVALID0000');
    // Blur the IBAN to surface the inline error.
    await page.getByTestId('account-form-name').click();

    await expect(page.getByTestId('account-form-iban-error')).toBeVisible();
    await expect(page.getByTestId('account-form-submit')).toBeDisabled();
  });

  test('Caja type goes straight to the cash form (no IBAN)', async ({ page }) => {
    await installCreateMocks(page);

    await page.goto('/finance/accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('cuentas-new-account-button').click();
    await page.getByTestId('new-account-type-C').click();

    await expect(page.getByTestId('account-form')).toBeVisible();
    await expect(page.getByTestId('account-form-iban')).toHaveCount(0);
  });

  /**
   * Full offline Bank creation — golden path.
   *
   * Walks every wizard step, submits the form, asserts the POST body carries the
   * right payload, and verifies that the new account row appears in the list after
   * the page reloads the accounts from the backend.
   */
  test('full offline Bank creation: form → POST → new row appears in list', async ({ page }) => {
    let postBody = null;
    let listFetchCount = 0;

    const newAccount = {
      id: 'acc-new',
      name: 'Santander Principal',
      type: 'B',
      currentBalance: 0,
      currencyId: '102',
      currencyIso: 'EUR',
      iban: 'ES9121000418450200051332',
      isDefault: false,
      pendingCount: 0,
      psd2Connected: false,
    };

    // create POST → 201; capture the body for assertion. Registered FIRST so
    // the more specific selectors/defaults routes below take priority.
    await page.route('**/sws/neo/financial-account/account', async (route) => {
      if (route.request().method() !== 'POST') { await route.fallback(); return; }
      postBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ id: 'acc-new', name: newAccount.name }] } }),
      });
    });

    // currency selector → EUR + USD rows so the form pre-selects EUR.
    await page.route('**/sws/neo/financial-account/account/selectors/C_Currency_ID*', async (route) => {
      if (route.request().method() !== 'GET') { await route.fallback(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: CURRENCY_ROWS } }),
      });
    });

    // entity defaults → session default currency.
    await page.route('**/sws/neo/financial-account/account/defaults', async (route) => {
      if (route.request().method() !== 'GET') { await route.fallback(); return; }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ENTITY_DEFAULTS),
      });
    });

    // list endpoint → first call returns the original accounts; subsequent calls
    // include the new account, simulating the backend reload after creation.
    await page.route('**/sws/neo/financial-accounts-page', async (route) => {
      listFetchCount++;
      const accounts = listFetchCount > 1 ? [...ACCOUNTS, newAccount] : ACCOUNTS;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { accounts, summary: SUMMARY } } }),
      });
    });

    await page.goto('/finance/accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Initial state: existing account is there, new one is not.
    await expect(page.getByTestId('account-row-acc-1')).toBeVisible();
    await expect(page.getByTestId('account-row-acc-new')).toHaveCount(0);

    // ── Step 1: open wizard and pick Bank ──────────────────────────────────
    await page.getByTestId('cuentas-new-account-button').click();
    await expect(page.getByTestId('new-account-wizard')).toBeVisible();
    await page.getByTestId('new-account-type-B').click();

    // ── Step 2: connection options ─────────────────────────────────────────
    // Both connection cards are info-only tiles; only "Sin conexión" advances
    // the wizard. The online card has no onClick and no `disabled` flag.
    await expect(page.getByTestId('account-connection-options')).toBeVisible();
    await expect(page.getByTestId('account-connection-online')).toBeVisible();
    await expect(page.getByTestId('account-connection-offline')).toBeVisible();
    await page.getByTestId('account-connection-offline').click();

    // ── Step 3: bank picker → search → Santander ───────────────────────────
    await expect(page.getByTestId('new-account-bank-search')).toBeVisible();
    await page.getByTestId('new-account-bank-search').fill('santander');
    await expect(page.getByTestId('new-account-bank-santander')).toBeVisible();
    await page.getByTestId('new-account-bank-santander').click();

    // ── Step 4: institution ────────────────────────────────────────────────
    await expect(page.getByTestId('new-account-institution-santander-default')).toBeVisible();
    await page.getByTestId('new-account-institution-santander-default').click();

    // ── Step 5: fill form ──────────────────────────────────────────────────
    await expect(page.getByTestId('account-form')).toBeVisible();
    await page.getByTestId('account-form-name').fill(newAccount.name);
    await page.getByTestId('account-form-iban').fill(newAccount.iban);

    const submit = page.getByTestId('account-form-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    // ── Assertions ─────────────────────────────────────────────────────────

    // 1. Toast confirms the creation.
    await expect(page.getByText('Cuenta creada')).toBeVisible();

    // 2. POST body carried the correct name, type, IBAN and currency — the
    // hook maps the SPA payload to DAL property names (iBAN, currency).
    expect(postBody).toMatchObject({
      name: newAccount.name,
      type: 'B',
      iBAN: newAccount.iban,
      currency: '102',
    });

    // 3. Wizard auto-closes.
    await expect(page.getByTestId('new-account-wizard')).toHaveCount(0);

    // 4. The list reloaded and the new account row is now visible.
    await expect(page.getByTestId('account-row-acc-new')).toBeVisible();
  });
});

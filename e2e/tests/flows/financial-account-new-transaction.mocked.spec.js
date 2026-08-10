import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * "Nuevo movimiento (GL item)" — smoke (mocked).
 *
 * Validates the ETP-4500 flow reachable from the Financial Account detail's
 * Movements toolbar: open the New Transaction modal, fill the required GL item +
 * amount, save, and assert the create POST payload. A second test exercises a
 * row lifecycle action (Confirmar) from the movement-row kebab.
 *
 * Mock mode only: installs the financial-account detail/movements/lookup/create
 * handlers AFTER login()'s generic /sws/** stub so the specific routes win
 * (Playwright matches routes in reverse registration order). No backend needed —
 * run against `make dev`:
 *   cd e2e && npm test -- tests/flows/financial-account-new-transaction.mocked.spec.js
 *
 * Default app locale is es_ES (see useLocaleState.DEFAULT_LOCALE), so copy
 * assertions target the Spanish strings.
 */

const ACCOUNT_ID = 'acc-1';

// useFinancialAccount reads /financial-accounts-page and filters by id; the
// account must carry currencyId + currencyIso so the modal builds accountCurrency.
const ACCOUNTS = [
  {
    id: ACCOUNT_ID,
    name: 'BBVA',
    type: 'B',
    currentBalance: 1000,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000001',
    isDefault: true,
    pendingCount: 0,
    bankConnected: false,
  },
];

const SUMMARY = {
  totalBalance: 1000,
  byCurrency: [{ currencyIso: 'EUR', total: 1000 }],
  pending: { accountsWithPending: 0, suggestionsReady: 0, byRule: 0 },
};

// Today's date (yyyy-mm-dd) so the single draft movement survives the Movements
// tab default "last 30 days" filter.
function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// One manual G/L draft movement (no paymentId, processed:false) so the row kebab
// shows Confirmar + Eliminar.
const MOVEMENTS = [
  {
    id: 'mov-draft',
    date: `${todayISO()}T00:00:00Z`,
    amount: -50,
    trxType: 'BPW',
    documentNo: 'TR-0001',
    contact: 'Proveedor X',
    glItem: 'Comisiones bancarias',
    description: 'Comisión mantenimiento',
    depositAmount: 0,
    withdrawalAmount: 50,
    currencyIso: 'EUR',
    paymentStatus: 'RPPC',
    processed: false,
    posted: 'N',
  },
];

const GL_ITEMS = [
  { id: 'gl-1', name: 'Comisiones bancarias' },
  { id: 'gl-2', name: 'Intereses' },
];

const GL_PLACEHOLDER = 'Selecciona una cuenta contable…';

/**
 * Installs every financial-account mock this flow needs. All are registered
 * AFTER login(). The single financial-account-transactions handler branches by
 * method + query so the movements GET, the GL-item lookup GET and the create /
 * process POSTs are all served from one route.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ onCreate?: (body:object)=>void, onProcess?: (body:object)=>void }} hooks
 */
async function installMocks(page, hooks = {}) {
  // Accounts list (useFinancialAccount).
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { accounts: ACCOUNTS, summary: SUMMARY } } }),
    });
  });

  // Financial account transactions: movements GET + lookups + lifecycle POSTs.
  await page.route('**/sws/neo/financial-account-transactions**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (method === 'GET' && url.includes('action=glitem-lookup')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { glItems: GL_ITEMS } } }),
      });
      return;
    }
    if (method === 'GET' && url.includes('action=bpartner-lookup')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { bpartners: [] } } }),
      });
      return;
    }
    if (method === 'GET' && url.includes('action=dimension-values')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { values: [] } } }),
      });
      return;
    }
    // Movements list for the account (no action, filtered by account id).
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              transactions: MOVEMENTS,
              totals: { balance: 1000, inflows: 0, outflows: 50, currency: 'EUR' },
              enabledDimensions: [],
              headerDimensions: [],
              trxTypes: ['BPD', 'BPW'],
              accountOrgId: 'org-1',
              paymentMethods: [],
            },
          },
        }),
      });
      return;
    }
    // POST actions — create / process / reactivate / delete.
    if (method === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}');
      if (url.includes('action=create')) hooks.onCreate?.(body);
      if (url.includes('action=process')) hooks.onProcess?.(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { id: 'mov-new', status: 'DR' } } }),
      });
      return;
    }
    await route.fallback();
  });
}

test.describe('Financial Account — Nuevo movimiento (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('opens the modal, fills GL item + amount, saves → create POST payload', async ({ page }) => {
    let createBody = null;
    await installMocks(page, { onCreate: (b) => { createBody = b; } });

    await page.goto(`/financial-account/${ACCOUNT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Open the New Transaction modal from the Movements toolbar.
    await page.getByTestId('new-movement-button').click();
    const modal = page.getByTestId('tx-new-modal');
    await expect(modal).toBeVisible();

    // Default direction is "Salida" (BPW). Save starts disabled.
    await expect(page.getByTestId('tx-new-save')).toBeDisabled();

    // Pick a GL item via the searchable lookup (LookupPicker exposes only a
    // placeholder input, so locate it by placeholder then click the result).
    const glInput = page.getByPlaceholder(GL_PLACEHOLDER);
    await glInput.click();
    await glInput.fill('Comis');
    await page.getByRole('button', { name: 'Comisiones bancarias' }).click();

    // Enter a positive amount (AmountInput renders data-testid field-number-tx-amount).
    await page.getByTestId('field-number-tx-amount').fill('100');

    const save = page.getByTestId('tx-new-save');
    await expect(save).toBeEnabled();
    await save.click();

    // Success toast (es_ES) and the create POST carried the mapped payload.
    await expect(page.getByText('Movimiento creado')).toBeVisible();
    await expect(modal).toHaveCount(0);

    expect(createBody).toMatchObject({
      FIN_Financial_Account_ID: ACCOUNT_ID,
      trxType: 'BPW',
      paymentAmount: 100,
      depositAmount: 0,
      currencyId: '102',
      glItemId: 'gl-1',
    });
  });

  test('Entrada direction maps the amount to a deposit', async ({ page }) => {
    let createBody = null;
    await installMocks(page, { onCreate: (b) => { createBody = b; } });

    await page.goto(`/financial-account/${ACCOUNT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('new-movement-button').click();
    await expect(page.getByTestId('tx-new-modal')).toBeVisible();

    // Switch to Entrada (BPD → depositAmount).
    await page.getByTestId('tx-dir-in').click();

    const glInput = page.getByPlaceholder(GL_PLACEHOLDER);
    await glInput.click();
    await glInput.fill('Inter');
    await page.getByRole('button', { name: 'Intereses' }).click();
    await page.getByTestId('field-number-tx-amount').fill('75');

    await page.getByTestId('tx-new-save').click();
    await expect(page.getByText('Movimiento creado')).toBeVisible();

    expect(createBody).toMatchObject({
      trxType: 'BPD',
      depositAmount: 75,
      paymentAmount: 0,
      glItemId: 'gl-2',
    });
  });

  test('Cancel closes the modal without creating anything', async ({ page }) => {
    let created = false;
    await installMocks(page, { onCreate: () => { created = true; } });

    await page.goto(`/financial-account/${ACCOUNT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await page.getByTestId('new-movement-button').click();
    await expect(page.getByTestId('tx-new-modal')).toBeVisible();
    await page.getByTestId('tx-new-cancel').click();
    await expect(page.getByTestId('tx-new-modal')).toHaveCount(0);
    expect(created).toBe(false);
  });

  test('Confirmar a draft G/L movement from the row kebab → process POST', async ({ page }) => {
    let processBody = null;
    await installMocks(page, { onProcess: (b) => { processBody = b; } });

    await page.goto(`/financial-account/${ACCOUNT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Locate the draft movement row and open its kebab menu.
    const row = page.locator('tbody tr').filter({ hasText: 'TR-0001' }).first();
    await expect(row).toBeVisible();
    await row.hover();
    await row.getByTestId('movement-row-menu-mov-draft').click();

    // Confirmar is only shown for unprocessed G/L transactions.
    const confirm = page.getByTestId('movement-row-process');
    await expect(confirm).toBeVisible();
    await confirm.click();

    // Success toast (es_ES) + the process POST carried the movement id.
    await expect(page.getByText('Movimiento procesado')).toBeVisible();
    expect(processBody).toMatchObject({ id: 'mov-draft' });
  });
});

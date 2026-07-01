import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Financial Account detail view — smoke (mocked).
 *
 * Validates the ETP-4098 detail page that shows account movements with
 * filter controls and an account summary strip (IBAN + 3 KPIs). The spec
 * walks the basic flow: navigate from the accounts list, exercise a
 * couple of filters (status + type) plus the free-text search, copy the
 * IBAN, and back-navigate to the list.
 *
 * Mock mode only: installs `/sws/neo/financial-accounts-page` and
 * `/sws/neo/financial-account-transactions` AFTER the generic /sws/**
 * stub seeded by login() so the specific handlers win (Playwright
 * matches routes in reverse registration order).
 *
 * Default app locale is es_ES (see useLocaleState.DEFAULT_LOCALE), so
 * assertions target the Spanish copy.
 */

const ACCOUNT_ID = 'acc-santander';

const ACCOUNTS = [
  {
    id: ACCOUNT_ID,
    name: 'Banco Santander',
    type: 'B',
    currentBalance: 211841.01,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000001',
    isDefault: true,
    pendingCount: 4,
    psd2Connected: true,
  },
  {
    id: 'acc-galicia',
    name: 'Banco Galicia',
    type: 'B',
    currentBalance: 50000,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000002',
    isDefault: false,
    pendingCount: 0,
    psd2Connected: false,
  },
];

const SUMMARY = {
  totalBalance: 261841.01,
  byCurrency: [{ currencyIso: 'EUR', total: 261841.01 }],
  pending: { accountsWithPending: 1, suggestionsReady: 0, byRule: 0 },
};

/**
 * Movements mock: mix of trxType BPD/BPW and varied paymentStatus codes so
 * the Type filter assertion is meaningful (status is now filtered via the
 * generic "Filtro por condicionales"). Labels reflect the
 * 5 user-facing status families introduced in ETP-4121.
 *   - tx-1: BPD / RPPC   (Cobro / Conciliado)
 *   - tx-2: BPW / RPAP   (Pago / Borrador)
 *   - tx-3: BPD / RPR    (Cobro / Completado)
 *   - tx-4: BPW / RPVOID (Pago / Anulado)
 *   - tx-5: BPD / RPPC   (Cobro / Conciliado)
 */
function recentMovementDate(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

const MOVEMENTS = [
  {
    id: 'tx-1', date: recentMovementDate(1), documentNo: 'PAY-001',
    contact: 'DHL Technologies SL', description: 'Invoice No.: 100',
    paymentStatus: 'RPPC', trxType: 'BPD',
    amount: 12450.00, balance: 211841.01,
    currencyIso: 'EUR', posted: 'Y',
  },
  {
    id: 'tx-2', date: recentMovementDate(2), documentNo: 'PAY-002',
    contact: 'Acme Corp', description: 'Office rent April',
    paymentStatus: 'RPAP', trxType: 'BPW',
    amount: -1800.00, balance: 199391.01,
    currencyIso: 'EUR', posted: 'N',
  },
  {
    id: 'tx-3', date: recentMovementDate(3), documentNo: 'PAY-003',
    contact: 'Foo Industries', description: 'Refund #45',
    paymentStatus: 'RPR', trxType: 'BPD',
    amount: 500.00, balance: 201191.01,
    currencyIso: 'EUR', posted: 'Y',
  },
  {
    id: 'tx-4', date: recentMovementDate(4), documentNo: 'PAY-004',
    contact: 'Bar SL', description: 'Voided payment',
    paymentStatus: 'RPVOID', trxType: 'BPW',
    amount: -250.00, balance: 200691.01,
    currencyIso: 'EUR', posted: 'N',
  },
  {
    id: 'tx-5', date: recentMovementDate(5), documentNo: 'PAY-005',
    contact: 'DHL Technologies SL', description: 'Invoice No.: 99',
    paymentStatus: 'RPPC', trxType: 'BPD',
    amount: 2500.00, balance: 200941.01,
    currencyIso: 'EUR', posted: 'Y',
  },
];

const TOTALS = {
  balance: 211841.01,
  inflows: 15450.00,
  outflows: 2050.00,
  currency: 'EUR',
};

async function installFinancialAccountMocks(page) {
  // List endpoint — used by both /finance/accounts (page) and useFinancialAccount
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: { accounts: ACCOUNTS, summary: SUMMARY } },
      }),
    });
  });

  // Transactions endpoint — useAccountMovements
  await page.route('**/sws/neo/financial-account-transactions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: { transactions: MOVEMENTS, totals: TOTALS } },
      }),
    });
  });
}

test.describe('Financial Account Detail (T6) — mocked', () => {
  test.beforeEach(async ({ context, page }) => {
    // Allow clipboard.writeText for the IBAN copy assertion.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await login(page);
    await installFinancialAccountMocks(page);
    await page.goto('/finance/accounts');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('clicking an account row navigates to the detail view', async ({ page }) => {
    const row = page.getByTestId(`account-row-${ACCOUNT_ID}`);
    await expect(row).toBeVisible();
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));

    // Detail view rendered: tabs + summary strip + table all visible.
    await expect(page.getByRole('tab', { name: /Movimientos/i })).toBeVisible();
    await expect(page.getByTestId('iban-text')).toBeVisible();
    await expect(page.getByTestId('kpi-balance')).toBeVisible();
  });

  test('breadcrumb and account name are set via useSetPageMeta', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));

    // The TopBar renders the breadcrumb: "Finanzas / Cuentas / Banco Santander"
    await expect(
      page.getByText(/Finanzas\s*\/\s*Cuentas\s*\/\s*Banco Santander/),
    ).toBeVisible();
  });

  test('the three tabs are visible with correct counts', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));

    // Wait for movements to load (5 transactions in mock)
    await expect(page.getByTestId('movement-row-tx-1')).toBeVisible();

    // Movements tab with badge "5"
    const movementsTab = page.getByRole('tab', { name: /Movimientos/i });
    await expect(movementsTab).toBeVisible();
    await expect(movementsTab).toContainText('5');

    // Conciliación with the account.pendingCount (4)
    const reconcileTab = page.getByRole('tab', { name: /Conciliación/i });
    await expect(reconcileTab).toBeVisible();
    await expect(reconcileTab).toContainText('4');

    // Extractos importados — statementsCount=0 (badge hidden when 0 typically)
    await expect(page.getByRole('tab', { name: /Extractos importados/i })).toBeVisible();
  });

  test('summary strip shows IBAN chunked and the three KPI labels', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));
    await expect(page.getByTestId('movement-row-tx-1')).toBeVisible();

    // IBAN chunked into groups of 4: "ES12 1234 0000 0000 0000 0001"
    await expect(page.getByTestId('iban-text')).toHaveText('ES12 1234 0000 0000 0000 0001');

    // KPIs visible
    await expect(page.getByTestId('kpi-balance')).toContainText('Saldo total');
    await expect(page.getByTestId('kpi-inflows')).toContainText('Entradas');
    await expect(page.getByTestId('kpi-outflows')).toContainText('Salidas');

    // Spanish currency formatting: "211.841,01" appears in the balance KPI.
    await expect(page.getByTestId('kpi-balance')).toContainText('211.841,01');
  });

  test('all five mocked movement rows are visible in the table', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));

    for (const m of MOVEMENTS) {
      await expect(page.getByTestId(`movement-row-${m.id}`)).toBeVisible();
    }
  });

  test('Type filter narrows the table to BPD (Cobro) rows only', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page.getByTestId('movement-row-tx-1')).toBeVisible();

    // Open the Type filter (trigger shows "Cualquier tipo" while no value is selected).
    await page.getByRole('button', { name: 'Cualquier tipo' }).click();

    // Pick the BPD option (label is "Cobro").
    await page.getByRole('button', { name: 'Cobro' }).click();

    // After filtering, only BPD rows remain: tx-1, tx-3, tx-5
    await expect(page.getByTestId('movement-row-tx-1')).toBeVisible();
    await expect(page.getByTestId('movement-row-tx-3')).toBeVisible();
    await expect(page.getByTestId('movement-row-tx-5')).toBeVisible();

    // BPW rows are hidden: tx-2, tx-4
    await expect(page.getByTestId('movement-row-tx-2')).toHaveCount(0);
    await expect(page.getByTestId('movement-row-tx-4')).toHaveCount(0);
  });

  // NOTE: the standalone "Todos los estados" status dropdown was removed in
  // ETP-4098 (commit 76581994) and folded into the generic "Filtro por
  // condicionales" (AdvancedFilterBuilder), which exposes status as the
  // `statusFamily` enum column. Status filtering is therefore covered by the
  // AdvancedFilterBuilder's own test surface, not by a per-window e2e against a
  // toolbar control that no longer exists.

  test('search input filters by document number / contact / description', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page.getByTestId('movement-row-tx-1')).toBeVisible();

    // Search for "DHL" → matches tx-1 and tx-5 (contact = "DHL Technologies SL").
    await page.getByTestId('movements-search-input').fill('DHL');

    await expect(page.getByTestId('movement-row-tx-1')).toBeVisible();
    await expect(page.getByTestId('movement-row-tx-5')).toBeVisible();
    await expect(page.getByTestId('movement-row-tx-2')).toHaveCount(0);
    await expect(page.getByTestId('movement-row-tx-3')).toHaveCount(0);
    await expect(page.getByTestId('movement-row-tx-4')).toHaveCount(0);

    // Clear search → all 5 rows back.
    await page.getByTestId('movements-search-input').fill('');
    for (const m of MOVEMENTS) {
      await expect(page.getByTestId(`movement-row-${m.id}`)).toBeVisible();
    }
  });

  test('clicking the IBAN copy button writes to clipboard and shows the success toast', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page.getByTestId('iban-copy-button')).toBeVisible();

    await page.getByTestId('iban-copy-button').click();

    // Sonner toast text in es_ES: "IBAN copiado"
    await expect(page.getByText('IBAN copiado')).toBeVisible();

    // Confirm the clipboard actually received the raw IBAN (no spaces).
    const clipboardValue = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardValue).toBe('ES1212340000000000000001');
  });

  test('clicking the back arrow returns to the accounts list', async ({ page }) => {
    await page.getByTestId(`account-row-${ACCOUNT_ID}`).click();
    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));
    await expect(page.getByTestId('movements-toolbar-back')).toBeVisible();

    await page.getByTestId('movements-toolbar-back').click();

    await expect(page).toHaveURL(/\/finance\/accounts$/);
    // List rendering is back: the same account row is visible again.
    await expect(page.getByTestId(`account-row-${ACCOUNT_ID}`)).toBeVisible();
  });
});

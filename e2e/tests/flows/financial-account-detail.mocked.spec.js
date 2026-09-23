import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { openAccountRowMenu } from '../helpers/financial-account-helpers.js';

/**
 * Financial Account detail view — smoke (mocked).
 *
 * Validates the ETP-4098 detail page that shows account movements with
 * filter controls and an account summary strip (IBAN + 3 KPIs). The spec
 * walks the basic flow: navigate from the accounts list, exercise a
 * couple of filters (status + type) plus the free-text search, copy the
 * IBAN, and back-navigate to the list.
 *
 * Mock mode only: installs `/sws/neo/financial-account/account` (the window list),
 * `/sws/neo/financial-accounts-page` (still the source for `useFinancialAccount`, the
 * DETAIL hook) and `/sws/neo/financial-account-transactions` AFTER the generic /sws/**
 * stub seeded by login() so the specific handlers win (Playwright matches routes in
 * reverse registration order).
 *
 * ETP-4658: the entry point is now the `financial-account` window itself — the spec loads
 * the list once (so `navigate(-1)` has somewhere to go back to) and then navigates straight
 * to `/financial-account/{id}`. Most tests deliberately do NOT click through the list to get
 * here: the list→detail row click is the accounts-list spec's subject, and it is currently
 * broken (see the `test.fail` in `financial-accounts-page.mocked.spec.js`). The one exception
 * is the back-arrow round trip, which needs a real history entry pushed by the list itself
 * and therefore enters the detail through the row kebab's "Abrir".
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
    bankConnected: true,
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
    bankConnected: false,
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

const LONG_MOVEMENT_VALUES = {
  documentNo: 'PAYMENT-DOCUMENT-2026-000000000000001',
  businessPartner: 'DHL Technologies Sociedad Limitada International Logistics Division',
  description: 'Invoice settlement with a description that is wider than the movement column',
  transactionType: 'Incoming payment generated from a very long transaction type label',
  gLItem: '100000000-Share capital and other long accounting account information',
};

const MOVEMENTS = [
  {
    id: 'tx-1', date: recentMovementDate(1), documentNo: LONG_MOVEMENT_VALUES.documentNo,
    contact: LONG_MOVEMENT_VALUES.businessPartner, description: LONG_MOVEMENT_VALUES.description,
    paymentStatus: 'RPPC', trxType: 'BPD', typeLabel: LONG_MOVEMENT_VALUES.transactionType,
    glItem: LONG_MOVEMENT_VALUES.gLItem, paymentId: 'payment-long-1', paymentIsReceipt: 'Y',
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
  // Window list endpoint — the generated ListView's own useEntity fetch. Matched by RegExp
  // on the query string so it never swallows the entity's other verbs/sub-paths.
  await page.route(/\/sws\/neo\/financial-account\/account\?/, async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    // The two specs name the pending counter differently and the fixture below is shared, so
    // the W rows are mapped here rather than carrying both keys. The R spec hand-builds its
    // JSON and kept the flat `pendingCount`; the W spec's generic CRUD derives its keys from
    // the AD column, so the same value arrives as `eTGOPendingCount`.
    const wRows = ACCOUNTS.map(({ pendingCount, ...rest }) => ({
      ...rest, eTGOPendingCount: pendingCount,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: wRows, totalRows: wRows.length, summary: SUMMARY },
      }),
    });
  });

  // Detail endpoint — still the R spec, which `useFinancialAccount` reads.
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
  await page.route('**/sws/neo/financial-account-transactions{/**,}**', async (route) => {
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
    // Land on the window list first so the detail's back button (navigate(-1)) has a
    // history entry, then go straight to the detail route.
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.goto(`/financial-account/${ACCOUNT_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('the detail route renders the hand-written tabs, not the generated DetailView', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));
    // The wrapper must NOT forward recordId to the generated AccountPage, otherwise the
    // generic DetailView would render here instead of these tabs.
    await expect(page.getByTestId('detail-view')).toHaveCount(0);

    // Detail view rendered: tabs + summary strip + table all visible.
    await expect(page.getByRole('tab', { name: /Movimientos/i })).toBeVisible();
    await expect(page.getByTestId('iban-text')).toBeVisible();
    await expect(page.getByTestId('kpi-balance')).toBeVisible();
  });

  test('clipped movement values reveal their complete content on hover', async ({ page }) => {
    await expect(page.getByTestId('movement-row-tx-1')).toBeVisible();

    for (const [field, fullValue] of Object.entries(LONG_MOVEMENT_VALUES)) {
      const cellText = page.getByTestId(`movement-cell-tx-1-${field}`);
      await expect(cellText).toBeVisible();
      await expect(cellText).toHaveCSS('text-overflow', 'ellipsis');
      expect(await cellText.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(true);

      await cellText.hover();
      await expect(page.getByTestId(`movement-cell-tx-1-${field}-tooltip`)).toHaveText(fullValue);
    }
  });

  test('Type filter narrows the table to BPD (Cobro) rows only', async ({ page }) => {
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
    await expect(page.getByTestId('iban-copy-button')).toBeVisible();

    await page.getByTestId('iban-copy-button').click();

    // Sonner toast text in es_ES: "IBAN copiado"
    await expect(page.getByText('IBAN copiado')).toBeVisible();

    // Confirm the clipboard actually received the raw IBAN (no spaces).
    const clipboardValue = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardValue).toBe('ES1212340000000000000001');
  });

  // The back arrow is `navigate(-1)` (MovementsToolbar/index.jsx ~99) — browser history, NOT a
  // fixed route — so the round trip is only meaningful when the detail was actually entered
  // FROM the list. The detail is opened through the row kebab's "Abrir" (which hands the whole
  // account to `onOpen`); a plain row click is still broken, see the `test.fail` in
  // `financial-accounts-page.mocked.spec.js`.
  // The row kebab trigger (account-row-menu-trigger-*) used to be reproducibly obscured by the
  // eTGOPendingCount cell (Playwright reported "element intercepts pointer events"), same known
  // issue hitting financial-account-delete.mocked.spec.js and financial-accounts-page.mocked.spec.js.
  // Confirmed live and fixed (commit 23343b3c2, PR #1496).
  test('entering the detail from the list and pressing back returns to the list', async ({ page }) => {
    await page.goto('/financial-account');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const row = page.getByTestId(`row-${ACCOUNT_ID}`);
    await expect(row).toBeVisible();
    await openAccountRowMenu(page, ACCOUNT_ID);
    await page.getByTestId(`account-row-menu-open-${ACCOUNT_ID}`).click();

    await expect(page).toHaveURL(new RegExp(`/financial-account/${ACCOUNT_ID}$`));
    await expect(page.getByTestId('movements-toolbar-back')).toBeVisible();

    await page.getByTestId('movements-toolbar-back').click();

    // Back on the window's own list branch at /financial-account, whose rows carry the
    // generic DataTable testid.
    await expect(page).toHaveURL(/\/financial-account$/);
    await expect(page.getByTestId(`row-${ACCOUNT_ID}`)).toBeVisible();
  });
});

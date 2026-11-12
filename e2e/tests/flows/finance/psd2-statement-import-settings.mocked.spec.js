// @covers tools/app-shell/src/windows/custom/financial-account/BankConnectionFlowUI.jsx
// @covers tools/app-shell/src/windows/custom/financial-account/BankImportSettingsFields.jsx
// @covers tools/app-shell/src/windows/custom/financial-account/BankReimportNotice.jsx
// @covers tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx
// @covers tools/app-shell/src/windows/custom/financial-account/StatementsTable.jsx
// @covers tools/app-shell/src/hooks/useBankConnectionFlow.js
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';
import { openAccountRowMenu } from '../../helpers/financial-account-helpers.js';

/**
 * PSD2 statement import settings — bank connect + statement delete on a bank-connected account
 * (mocked, no backend).
 *
 * Behind the frontend flag `psd2-statement-import-settings` (`PSD2_STATEMENT_IMPORT_SETTINGS`,
 * shipped default OFF). Like every web flag it is baked when Vite starts or builds
 * (`VITE_FEATURE_FLAGS`, no runtime override), so the file is split in two describes, the same
 * pattern as `platform/grid-column-views.mocked.spec.js`:
 *
 *  - "flag OFF" runs in every default run (CI, the push gate) and proves the feature is inert:
 *    the connect modal has no import fields and a connected account's rows offer no trash.
 *  - "flag ON" skips itself unless the server was started with the flag on AND
 *    `E2E_PSD2_IMPORT_SETTINGS_FLAG=on` is exported.
 *
 *   # flag OFF (default) — the ON describe skips
 *   cd e2e && npx playwright test tests/flows/finance/psd2-statement-import-settings.mocked.spec.js --project=mocked
 *
 *   # flag ON — the OFF describe skips itself, the ON describe runs
 *   cd tools/app-shell && VITE_FEATURE_FLAGS='{"psd2-statement-import-settings":true}' npx vite --port 3181
 *   cd e2e && E2E_USE_MOCK=1 BASE_URL=http://localhost:3181 E2E_PSD2_IMPORT_SETTINGS_FLAG=on \
 *     npx playwright test tests/flows/finance/psd2-statement-import-settings.mocked.spec.js --project=mocked
 *
 * Run against plain `npx vite`/`make dev`, never `make dev-mock` — `VITE_MOCK=true` replaces
 * `window.fetch` in-page and silently bypasses every `page.route()` here.
 *
 * Flag ON covers three flows:
 *   1. connecting a bank account: the account picker asks for "Importar desde" (day 1 of the
 *      current month) and a required grouping, "Vincular cuenta" waits for account + date +
 *      grouping, the `link` request carries both, and a link advisory shows as a warning toast;
 *   2. deleting a statement of a bank-connected account: the trash is on a processed row, the
 *      confirm warns the movements come back (naming the date read from `status`), the delete is
 *      POSTed, and the posted refusal reaches the user translated;
 *   3. a bulk delete mixing a deletable and a posted statement reports a partial success.
 *
 * The bank popup is not driven: the connect URL is `about:blank` and the callback is simulated the
 * way `BankConnectionCallbackPage` hands it back, through localStorage, which the opener polls.
 *
 * Every route is installed AFTER `login()` so the specific handlers beat the generic `/sws/**`
 * stub that helper seeds (Playwright matches routes in reverse registration order).
 */

const FLAG_ON = process.env.E2E_PSD2_IMPORT_SETTINGS_FLAG === 'on';

const BANK_CONNECTION_KEY = 'bankConnection:lastConnectionId';

const LINK_ACCOUNT_ID = 'acc-psd2-unlinked';
const CONNECTED_ACCOUNT_ID = 'acc-psd2-connected';

const BASE_ACCOUNT = {
  type: 'B',
  currentBalance: 1000,
  currencyId: '102',
  currencyIso: 'EUR',
  isDefault: false,
  pendingCount: 0,
  eTGOPendingCount: 0,
  active: true,
  deletable: true,
  // Salt Edge is contracted for Spain only: the connect action needs an ES account.
  countryIso: 'ES',
  amountTolerance: 0,
  glItemDifferenceId: '',
  glItemDifferenceName: '',
};

const UNLINKED_ACCOUNT = {
  ...BASE_ACCOUNT,
  id: LINK_ACCOUNT_ID,
  name: 'Banco sin vincular',
  iban: 'ES1212340000000000000011',
  bankConnected: false,
};

const CONNECTED_ACCOUNT = {
  ...BASE_ACCOUNT,
  id: CONNECTED_ACCOUNT_ID,
  name: 'Banco conectado',
  iban: 'ES1212340000000000000022',
  bankConnected: true,
};

const SUMMARY = {
  totalBalance: 1000,
  byCurrency: [{ currencyIso: 'EUR', total: 1000 }],
  pending: { accountsWithPending: 0, suggestionsReady: 0, byRule: 0 },
};

const MOVEMENTS_PAYLOAD = {
  response: {
    data: {
      transactions: [],
      totals: { balance: 1000, inflows: 0, outflows: 0, currency: 'EUR' },
      paymentMethods: [],
      trxTypes: [],
      enabledDimensions: [],
      headerDimensions: [],
    },
  },
};

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** A processed statement, inside the tab's default last-30-days window. */
function statement(id, documentNo, name, daysAgo) {
  return {
    id,
    documentNo,
    name,
    fileName: `${id}.c43`,
    notes: '',
    importDate: isoDaysAgo(daysAgo),
    transactionDate: isoDaysAgo(daysAgo),
    periodFrom: isoDaysAgo(daysAgo + 2),
    periodTo: isoDaysAgo(daysAgo + 1),
    lineCount: 2,
    totalIn: 100,
    totalOut: 20,
    processed: 'Y',
    status: 'PENDING',
  };
}

const POSTED_REFUSAL = 'The statement is posted. Unpost it before deleting it.';
const POSTED_REFUSAL_ES = 'El extracto está contabilizado. Descontabilízalo antes de eliminarlo.';

/** The day-1-of-the-current-month default, as the ISO the request carries and the es_ES box shows. */
function firstOfCurrentMonth() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return { iso: `${yyyy}-${mm}-01`, display: `01/${mm}/${yyyy}` };
}

const jsonOk = (data, extra = {}) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ response: { data }, ...extra }),
});

/**
 * Installs everything the two windows read, plus the bank bridge and the statements endpoint.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {object[]} [opts.accounts] rows of the account list / detail
 * @param {object[]} [opts.statements] statements of the connected account (mutated by deletes)
 * @param {Set<string>} [opts.postedIds] statement ids the backend refuses to delete (400 posted)
 * @param {string|null} [opts.importFromDate] the date `status` reports for the connection
 * @param {object} [opts.linkResponse] extra top-level keys of the `link` answer (e.g. messages)
 * @returns {Promise<{ deleteCalls: object[], linkCalls: object[] }>}
 */
async function installMocks(page, {
  accounts = [UNLINKED_ACCOUNT, CONNECTED_ACCOUNT],
  statements = [],
  postedIds = new Set(),
  importFromDate = '2026-03-01',
  linkResponse = {},
} = {}) {
  const deleteCalls = [];
  const linkCalls = [];

  await page.route(/\/sws\/neo\/financial-account\/account\?/, async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: accounts, totalRows: accounts.length, summary: SUMMARY },
      }),
    });
  });

  // Detail endpoint: `useFinancialAccount` still reads the R spec (flat `pendingCount`).
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill(jsonOk({
      accounts: accounts.map(({ eTGOPendingCount, ...rest }) => rest),
      summary: SUMMARY,
    }));
  });

  const movementsHandler = async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(MOVEMENTS_PAYLOAD),
    });
  };
  await page.route('**/sws/neo/financial-account-transactions/**', movementsHandler);
  await page.route('**/sws/neo/financial-account-transactions**', movementsHandler);

  // Imported statements tab: list on GET, `?action=delete` on POST.
  const statementsHandler = async (route) => {
    const req = route.request();
    const action = new URL(req.url()).searchParams.get('action');

    if (req.method() === 'POST' && action === 'delete') {
      const body = JSON.parse(req.postData() ?? '{}');
      deleteCalls.push(body);
      if (postedIds.has(body.id)) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: POSTED_REFUSAL } }),
        });
        return;
      }
      const at = statements.findIndex((s) => s.id === body.id);
      if (at >= 0) statements.splice(at, 1);
      await route.fulfill(jsonOk({ id: body.id }));
      return;
    }

    if (req.method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill(jsonOk({ statements: [...statements], lines: [] }));
  };
  await page.route('**/sws/neo/bank-statements/**', statementsHandler);
  await page.route('**/sws/neo/bank-statements**', statementsHandler);

  // The bank bridge: connect / accounts / link / status / syncStatus, told apart by `?action=`.
  await page.route('**/sws/neo/financial-account-bank-connection**', async (route) => {
    const req = route.request();
    const action = new URL(req.url()).searchParams.get('action');

    if (action === 'connect') {
      await route.fulfill(jsonOk({ connectUrl: 'about:blank' }));
    } else if (action === 'accounts') {
      await route.fulfill(jsonOk({
        accounts: [
          { saltEdgeAccountId: 'se-1', name: 'Cuenta Nómina', iban: 'ES1111', currency: 'EUR' },
          { saltEdgeAccountId: 'se-2', name: 'Cuenta Ahorro', iban: 'ES2222', currency: 'EUR' },
        ],
        providerName: 'BBVA',
        providerLogoUrl: '',
        maxFetchInterval: 90,
      }));
    } else if (action === 'link') {
      linkCalls.push(JSON.parse(req.postData() ?? '{}'));
      await route.fulfill(jsonOk({ linked: true }, linkResponse));
    } else if (action === 'status') {
      await route.fulfill(jsonOk({
        connected: true,
        providerName: 'BBVA',
        importFromDate,
        importToDate: '',
        statementGrouping: '1BM',
      }));
    } else {
      // syncStatus and anything else this window polls: nothing running.
      await route.fulfill(jsonOk({}));
    }
  });

  return { deleteCalls, linkCalls };
}

/** Opens the statements tab of the connected account. */
async function openStatementsTab(page) {
  await page.goto(`/financial-account/${CONNECTED_ACCOUNT_ID}?tab=statements`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('detail-tab-statements')).toBeVisible();
}

/** Starts "Conectar banco" from the account's row kebab and lets the (simulated) bank callback land. */
async function connectUnlinkedAccount(page) {
  await page.goto('/financial-account');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await openAccountRowMenu(page, LINK_ACCOUNT_ID);
  // The kebab content is portalled, so the item is not inside the row.
  await page.getByTestId(`account-row-menu-connect-${LINK_ACCOUNT_ID}`).click();

  // The flow opens a popup, then polls localStorage for the connection id the callback page writes.
  // The poll clears the key when it starts, so keep handing it over until the picker is up.
  const modal = page.getByTestId('bank-connection-account-select-modal');
  await expect(async () => {
    await page.evaluate(
      (key) => localStorage.setItem(key, 'conn-1'), BANK_CONNECTION_KEY,
    );
    await expect(modal).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return modal;
}

async function pickGrouping(page, id) {
  await page.getByTestId('field-statementGrouping').click();
  await page.getByTestId(`option-statementGrouping-${id}`).click();
}

test.describe('PSD2 statement import settings — flag ON (mocked)', () => {
  test.skip(!FLAG_ON, 'Needs psd2-statement-import-settings ON (E2E_PSD2_IMPORT_SETTINGS_FLAG=on)');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('connect: the picker asks for the date and a grouping, and the link carries both', async ({ page }) => {
    const { linkCalls } = await installMocks(page, {
      linkResponse: { messages: [{ type: 'warning', text: 'Aviso del banco: historial limitado' }] },
    });
    const modal = await connectUnlinkedAccount(page);
    const { iso, display } = firstOfCurrentMonth();

    // "Importar desde" defaults to day 1 of the current month; the grouping starts empty.
    await expect(modal.getByTestId('field-date-bank-connection-link-import-from')).toHaveValue(display);
    await expect(modal.getByTestId('field-statementGrouping')).toHaveValue('');
    await expect(modal.getByTestId('bank-connection-link-import-from-help')).toContainText('90');

    // "Vincular cuenta" waits for the account AND the grouping (the date has its default).
    const confirm = modal.getByTestId('bank-connection-account-select-confirm');
    await expect(confirm).toBeDisabled();
    await modal.getByTestId('bank-connection-account-option-se-2').click();
    await expect(confirm).toBeDisabled();
    await pickGrouping(page, '1BW');
    await expect(confirm).toBeEnabled();

    // Emptying the date disables it again and flags the field.
    const dateBox = modal.getByTestId('field-date-bank-connection-link-import-from');
    await dateBox.fill('');
    await dateBox.blur();
    await expect(modal.getByTestId('bank-connection-link-import-from-required')).toBeVisible();
    await expect(confirm).toBeDisabled();
    await dateBox.fill(display.replaceAll('/', ''));
    await dateBox.blur();
    await expect(confirm).toBeEnabled();

    await confirm.click();

    await expect.poll(() => linkCalls.length).toBe(1);
    expect(linkCalls[0]).toMatchObject({
      financialAccountId: LINK_ACCOUNT_ID,
      connectionId: 'conn-1',
      saltEdgeAccountId: 'se-2',
      importFromDate: iso,
      statementGrouping: '1BW',
    });
    // The bridge's advisory (top-level `messages`) surfaces as a toast next to the success one.
    await expect(page.getByText('Aviso del banco: historial limitado')).toBeVisible();
    await expect(page.getByText('Cuenta bancaria conectada')).toBeVisible();
  });

  test('delete: a processed statement of a connected account warns about the re-import and is deleted', async ({ page }) => {
    const statements = [statement('st-processed', 'BS-701', 'Extracto procesado', 3)];
    const { deleteCalls } = await installMocks(page, { statements, importFromDate: '2026-03-01' });
    await openStatementsTab(page);

    const row = page.getByTestId('statement-row-st-processed');
    await expect(row).toBeVisible();
    await row.hover();
    // Edit stays hidden on a bank statement; delete is offered even though it is processed.
    await expect(page.getByTestId('statement-row-edit-st-processed')).toHaveCount(0);
    await page.getByTestId('statement-row-delete-st-processed').click();

    const dialog = page.getByTestId('statement-confirm-dialog');
    await expect(dialog).toBeVisible();
    // The date comes from `status` (es_ES: dd/mm/yyyy).
    await expect(dialog.getByTestId('statement-delete-bank-reimport-notice')).toContainText('01/03/2026');
    await dialog.getByTestId('statement-confirm-action').click();

    await expect.poll(() => deleteCalls).toEqual([{ id: 'st-processed' }]);
    await expect(page.getByText('Extracto eliminado')).toBeVisible();
    await expect(page.getByTestId('statement-row-st-processed')).toHaveCount(0);
  });

  test('delete: the posted refusal reaches the user translated, and the row stays', async ({ page }) => {
    const statements = [statement('st-posted', 'BS-702', 'Extracto contabilizado', 3)];
    const { deleteCalls } = await installMocks(page, {
      statements, postedIds: new Set(['st-posted']),
    });
    await openStatementsTab(page);

    const row = page.getByTestId('statement-row-st-posted');
    await row.hover();
    await page.getByTestId('statement-row-delete-st-posted').click();
    await page.getByTestId('statement-confirm-action').click();

    await expect.poll(() => deleteCalls).toEqual([{ id: 'st-posted' }]);
    await expect(page.getByText(POSTED_REFUSAL_ES)).toBeVisible();
    await expect(page.getByText(POSTED_REFUSAL)).toHaveCount(0);
    await expect(page.getByTestId('statement-row-st-posted')).toBeVisible();
  });

  test('bulk delete: one deletable and one posted statement report a partial success', async ({ page }) => {
    const statements = [
      statement('st-ok', 'BS-703', 'Extracto borrable', 3),
      statement('st-blocked', 'BS-704', 'Extracto contabilizado', 4),
    ];
    const { deleteCalls } = await installMocks(page, {
      statements, postedIds: new Set(['st-blocked']),
    });
    await openStatementsTab(page);

    // The real input is visually hidden (sr-only): click its visible label.
    await page.getByTestId('statement-row-st-ok').locator('label').first().click();
    await page.getByTestId('statement-row-st-blocked').locator('label').first().click();
    await page.getByTestId('bulk-delete-selection-trigger').click();

    // The bulk dialog carries the same re-import notice.
    await expect(page.getByTestId('statement-delete-bank-reimport-notice')).toContainText('01/03/2026');
    await page.getByTestId('batch-delete-confirm').click();

    await expect.poll(() => deleteCalls.map((c) => c.id).sort()).toEqual(['st-blocked', 'st-ok']);
    await expect(page.getByText(/1 de 2 registros eliminados/)).toBeVisible();
    // The deletable one is gone, the posted one stays.
    await expect(page.getByTestId('statement-row-st-ok')).toHaveCount(0);
    await expect(page.getByTestId('statement-row-st-blocked')).toBeVisible();
  });
});

test.describe('PSD2 statement import settings — flag OFF (mocked)', () => {
  test.skip(FLAG_ON, 'Flag-ON server: the OFF behaviour cannot be observed on it');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('connect: the picker has no import fields and confirms on the account alone', async ({ page }) => {
    const { linkCalls } = await installMocks(page);
    const modal = await connectUnlinkedAccount(page);

    await expect(modal.getByTestId('bank-connection-link-import-from-help')).toHaveCount(0);
    await expect(modal.getByTestId('field-statementGrouping')).toHaveCount(0);

    const confirm = modal.getByTestId('bank-connection-account-select-confirm');
    await expect(confirm).toBeDisabled();
    await modal.getByTestId('bank-connection-account-option-se-1').click();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect.poll(() => linkCalls.length).toBe(1);
    expect(linkCalls[0]).not.toHaveProperty('importFromDate');
    expect(linkCalls[0]).not.toHaveProperty('statementGrouping');
  });

  test('delete: a connected account offers no trash on its statements and no re-import notice', async ({ page }) => {
    const statements = [statement('st-processed', 'BS-701', 'Extracto procesado', 3)];
    await installMocks(page, { statements });
    await openStatementsTab(page);

    const row = page.getByTestId('statement-row-st-processed');
    await expect(row).toBeVisible();
    await row.hover();
    await expect(page.getByTestId('statement-row-delete-st-processed')).toHaveCount(0);
    await expect(page.getByTestId('statement-row-edit-st-processed')).toHaveCount(0);
    await expect(page.getByTestId('statement-delete-bank-reimport-notice')).toHaveCount(0);
  });
});

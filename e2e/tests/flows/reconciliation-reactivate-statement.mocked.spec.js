import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * ETP-5121 — reactivating a bank statement must not hide its already reconciled line.
 *
 * Reported scenario: a PROCESSED statement with two lines, one of them reconciled, is returned to
 * Borrador from "Extractos importados". From that moment the reconciled line vanished from the
 * reconciliation panel — under EVERY filter, not only "Conciliadas" — which also made it
 * unreachable: it could no longer be un-reconciled from there, and the statement itself could not
 * be deleted while it still held a matched line.
 *
 * Root cause (backend): `PENDING_LINES_SQL` in `ReconciliationHandler.java` gated the whole
 * `?action=pendingLines` query on `bs.processed = 'Y'`. `BankStatementsHandler.reactivateStatement`
 * only clears that flag — it never touches `FIN_BankStatementLine.FIN_FinAcc_Transaction_ID` nor
 * the transaction's `FIN_Reconciliation`, so the line stays genuinely reconciled. The gate now
 * carries an exception for exactly that case (the same predicate that labels a line
 * `line_status = 'reconciled'`), so a line whose reconciliation is back in DRAFT still falls to
 * the pending pool.
 *
 * Covered here (browser, mocked backend):
 *   CP-1  the reconciled line is still listed under the "Conciliadas" filter after the statement
 *         has been reactivated, and is still selectable / un-reconcilable there;
 *   CP-1b before the reactivation both lines are bucketed by their own state (baseline, so a
 *         failure in CP-1 cannot be blamed on the fixture);
 *   CP-1c the exception is NARROW: the unmatched sibling is legitimately dropped once the
 *         statement is a draft (a draft statement's pending lines are not reconcilable yet);
 *   CP-2  that same reconciled line stays read-only in the statement editor even though its
 *         statement is now a draft — core's `APRM_FIN_BNKSTM_LINE_CHECK_TRG` rejects any
 *         update/delete of it regardless of the parent's Processed flag (ETP-4921);
 *   the reactivate request itself is header-only (it carries the id and nothing else, so it can
 *   never resend — and so never rewrite — the matched line).
 *
 * SCOPE NOTE — a mocked spec cannot catch the backend regression itself: the `pendingLines`
 * payload is produced here, so it is a MODEL of the fixed handler, not the handler. What it does
 * guard is the whole UI contract on top of it (routing, the two tabs, the client-side status
 * filter, the read-only rendering) and the requests the client sends. The SQL predicate itself is
 * pinned by `ReconciliationHandlerTest`'s `PENDING_LINES_SQL` shape tests in
 * `com.etendoerp.go`. The mock below deliberately implements the FIXED gate rather than returning
 * a canned list, so the fixture states the contract it stands in for.
 *
 * Mock mode only. Every route is installed AFTER `login()` so the specific handlers beat the
 * generic `**\/sws\/**` stub that helper seeds (Playwright matches routes in reverse
 * registration order). Modelled on `reconciliation-difference.mocked.spec.js`.
 */

const ACCOUNT_ID = 'acc-etp5121';
const STATEMENT_ID = 'bs-etp5121';

/** The reconciled statement line — the one the bug made disappear. */
const RECONCILED_LINE_ID = 'bsl-reconciled';
/** Its unmatched sibling on the same statement. */
const PENDING_LINE_ID = 'bsl-pending';
/** The transaction the reconciled line is matched against. */
const TRANSACTION_ID = 'trx-reconciled';
const TRANSACTION_DOC_NO = '1000501';

/**
 * Every date in these fixtures is RELATIVE to the run.
 *
 * "Extractos importados" filters on `importDate` with a default `last30` range
 * (`ImportedStatementsTab`), so a statement pinned to a hardcoded calendar date silently drops out
 * of the list as soon as the clock moves past it — the row is simply never found, which reads as a
 * broken selector rather than an expired fixture. The reconciliation panel has no default date
 * range, but its lines are kept in the same window so the two tabs tell one coherent story.
 */
const NOW = new Date();

/**
 * @param {number} n days back from now
 * @returns {string} ISO timestamp
 */
function isoDaysAgo(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * The status dropdown is a `DistinctValuesFilter`, which currently exposes NO `data-testid` of its
 * own (the `data-testid` prop passed at the call site is dropped — see the report attached to this
 * spec's task). It is located structurally instead — the first `button` sibling after the panel's
 * back button, which has a testid — so the locator stays independent of the UI language. The
 * option rows are `[Todos, pending, suggested, byRule, difference, reconciled]`, mirroring
 * `STATUS_CODES` in `reconciliationStatusFilter.js` plus the leading "all" row.
 */
const STATUS_OPTION_COUNT = 6;
const STATUS_OPTION_ALL = 0;
const STATUS_OPTION_RECONCILED = 5;

const SUMMARY = {
  totalBalance: 5000,
  byCurrency: [{ currencyIso: 'EUR', total: 5000 }],
  pending: { accountsWithPending: 1, suggestionsReady: 0, byRule: 0 },
};

const ACCOUNT = {
  id: ACCOUNT_ID,
  name: 'Banco ETP-5121',
  type: 'B',
  currentBalance: 5000,
  currencyId: '102',
  currencyIso: 'EUR',
  iban: 'ES1212340000000000000009',
  isDefault: true,
  pendingCount: 1,
  bankConnected: false,
  amountTolerance: 0,
  glItemDifferenceId: '',
  glItemDifferenceName: '',
};

/** The reconciliation panel's view of the reconciled line (state drives the client-side filter). */
const PANEL_RECONCILED_LINE = {
  id: RECONCILED_LINE_ID,
  date: isoDaysAgo(4),
  description: 'Cobro ya conciliado',
  status: 'reconciled',
  state: 'reconciled',
  reconcileStatus: 'RECONCILED',
  amount: 250,
  reconciledAmount: 250,
  reconciledPct: 100,
  pendingAmount: 0,
  // Empty on purpose: the RECONCILIATION is still processed. Reactivating the STATEMENT is a
  // different operation from reactivating the reconciliation, and only the latter would put a
  // draft reconciliation id here (which would send the line back to the pending pool).
  draftReconciliationId: '',
  txns: [{
    transactionId: TRANSACTION_ID,
    documentNo: TRANSACTION_DOC_NO,
    contact: 'Globex',
    amount: 250,
    autoCreated: false,
  }],
};

/** The reconciliation panel's view of the unmatched line. */
const PANEL_PENDING_LINE = {
  id: PENDING_LINE_ID,
  date: isoDaysAgo(3),
  description: 'Cargo sin conciliar',
  status: 'pending',
  state: 'pending',
  amount: -40,
  reconciledAmount: 0,
  pendingAmount: -40,
};

/** The linked transaction, as the candidates panel lists it for a read-only line. */
const LINKED_CANDIDATE = {
  id: TRANSACTION_ID,
  date: isoDaysAgo(4),
  documentNo: TRANSACTION_DOC_NO,
  partnerName: 'Globex',
  amount: 250,
  pendingBalance: 250,
  status: 'reconciled',
  linked: true,
};

/** The statement editor's view of the same two lines. */
const EDITOR_LINES = [
  {
    id: RECONCILED_LINE_ID,
    date: isoDaysAgo(4),
    reference: 'REF-CONC',
    description: 'Cobro ya conciliado',
    bpartnerName: 'Globex',
    bpartnerId: 'bp-globex',
    bpartnerFkName: 'Globex S.A.',
    glItemId: null,
    glItemName: '',
    in: 250,
    out: 0,
    // The flag the editor keys off to render the row read-only (ETP-4921).
    matched: true,
  },
  {
    id: PENDING_LINE_ID,
    date: isoDaysAgo(3),
    reference: 'REF-LIBRE',
    description: 'Cargo sin conciliar',
    bpartnerName: 'Acme',
    bpartnerId: 'bp-acme',
    bpartnerFkName: 'Acme S.L.',
    glItemId: null,
    glItemName: '',
    in: 0,
    out: 40,
    matched: false,
  },
];

const MOVEMENTS_PAYLOAD = {
  response: {
    data: {
      transactions: [],
      totals: { balance: 5000, inflows: 0, outflows: 0, currency: 'EUR' },
      paymentMethods: [],
      trxTypes: [],
      enabledDimensions: [],
      headerDimensions: [],
    },
  },
};

/**
 * The statement header row, in whichever state the run has left it.
 *
 * @param {boolean} processed
 * @returns {object}
 */
function statementRow(processed) {
  return {
    id: STATEMENT_ID,
    documentNo: 'BS-501',
    name: 'Extracto junio',
    fileName: 'junio.c43',
    notes: '',
    // Inside the tab's default last-30-days window, or the row is filtered out of the list.
    importDate: isoDaysAgo(2),
    transactionDate: isoDaysAgo(2),
    periodFrom: isoDaysAgo(4),
    periodTo: isoDaysAgo(3),
    lineCount: EDITOR_LINES.length,
    totalIn: 250,
    totalOut: 40,
    // `isDraftStatement` reads BOTH, so keep them consistent.
    processed: processed ? 'Y' : 'N',
    status: processed ? 'PARTIAL' : 'DRAFT',
  };
}

/**
 * The FIXED `PENDING_LINES_SQL` gate, expressed over the fixtures:
 *
 *   AND (bs.processed = 'Y'
 *        OR (bsl.fin_finacc_transaction_id IS NOT NULL AND COALESCE(rec.processed,'N') = 'Y'))
 *
 * A processed statement contributes all of its lines. A draft one contributes only the lines that
 * are already reconciled against a PROCESSED reconciliation. Writing it out (instead of returning
 * a canned array) is what makes the fixture a statement of the contract under test.
 *
 * @param {boolean} statementProcessed
 * @returns {object[]}
 */
function panelLinesFor(statementProcessed) {
  const reconciled = [PANEL_RECONCILED_LINE];
  return statementProcessed ? [...reconciled, PANEL_PENDING_LINE] : reconciled;
}

/**
 * Installs every route the account detail needs for both tabs, plus a tiny amount of state so the
 * reactivate POST actually changes what the subsequent GETs report.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {boolean} [opts.processed] initial state of the statement
 * @returns {Promise<{ state: { processed: boolean }, reactivateCalls: object[] }>}
 */
async function installMocks(page, { processed = true } = {}) {
  const state = { processed };
  const reactivateCalls = [];

  // Window list endpoint (the generated ListView's own useEntity fetch).
  await page.route(/\/sws\/neo\/financial-account\/account\?/, async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: [ACCOUNT], totalRows: 1, summary: SUMMARY },
      }),
    });
  });

  // Detail endpoint — `useFinancialAccount` still reads the R spec.
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: { accounts: [ACCOUNT], summary: SUMMARY } } }),
    });
  });

  // Movements tab (mounted first on a bank account) — both routes: this endpoint also serves
  // lookups under `?action=...`, and a bare `word**` glob does not cross a `/`.
  const movementsHandler = async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(MOVEMENTS_PAYLOAD),
    });
  };
  await page.route('**/sws/neo/financial-account-transactions/**', movementsHandler);
  await page.route('**/sws/neo/financial-account-transactions**', movementsHandler);

  // Imported statements tab + the statement editor's lines, and the reactivate action. All on one
  // path, distinguished by `?action=`.
  const statementsHandler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const action = url.searchParams.get('action');

    if (req.method() === 'POST' && action === 'reactivate') {
      reactivateCalls.push(JSON.parse(req.postData() ?? '{}'));
      state.processed = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: { statement: { id: STATEMENT_ID, processed: false } } },
        }),
      });
      return;
    }

    if (req.method() !== 'GET') { await route.fallback(); return; }

    if (action === 'lines') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { lines: EDITOR_LINES } } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: { statements: [statementRow(state.processed)], lines: [] } },
      }),
    });
  };
  await page.route('**/sws/neo/bank-statements/**', statementsHandler);
  await page.route('**/sws/neo/bank-statements**', statementsHandler);

  // The reconciliation surface: pendingLines / candidates / autoMatch, all GET on one path.
  await page.route(/\/sws\/neo\/bank-reconciliation\?/, async (route) => {
    const req = route.request();
    const action = new URL(req.url()).searchParams.get('action');

    if (req.method() !== 'GET') { await route.fallback(); return; }

    if (action === 'pendingLines') {
      const lines = panelLinesFor(state.processed);
      const reconciled = lines.filter((l) => l.state === 'reconciled').length;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              lines,
              total: lines.length,
              counts: {
                all: lines.length,
                pending: lines.length - reconciled,
                suggested: 0,
                byRule: 0,
                difference: 0,
                reconciled,
              },
              draftReconciliationCount: 0,
            },
          },
        }),
      });
      return;
    }

    if (action === 'candidates') {
      const lineId = new URL(req.url()).searchParams.get('lineId');
      // Only the reconciled line has anything linked to it.
      const candidates = lineId === RECONCILED_LINE_ID ? [LINKED_CANDIDATE] : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { candidates, counts: {} } } }),
      });
      return;
    }

    if (action === 'autoMatch') {
      // No suggestions → the automatch modal never opens and cannot swallow clicks.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { groups: [], counts: {} } } }),
      });
      return;
    }

    await route.fallback();
  });

  return { state, reactivateCalls };
}

/**
 * Opens the account detail on the requested tab.
 *
 * Entering the reconciliation tab MAY pop the automatch suggestions modal, whose overlay swallows
 * every click on the panel behind it — so dismiss it defensively even though the mock reports no
 * suggestions.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} tab
 */
async function openTab(page, tab) {
  await page.goto(`/financial-account/${ACCOUNT_ID}?tab=${tab}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId(`detail-tab-${tab}`)).toBeVisible();

  const automatch = page.getByTestId('automatch-suggestion-modal');
  if (await automatch.isVisible().catch(() => false)) {
    await page.getByTestId('automatch-modal-cancel').click();
    await expect(automatch).toHaveCount(0);
  }
}

/**
 * Picks an option in the reconciliation panel's status dropdown by position (see
 * `STATUS_OPTION_*` above for why position and not label).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 */
async function selectStatusOption(page, index) {
  const trigger = page.getByTestId('recon-toolbar-back')
    .locator('xpath=following-sibling::button[1]');
  await expect(trigger).toBeVisible();
  await trigger.click();

  const popover = page.getByRole('dialog').last();
  await expect(popover).toBeVisible();
  const options = popover.getByRole('button');
  // Guards the positional indexing: if a status code is ever added or removed, this fails loudly
  // here instead of silently clicking the wrong filter.
  await expect(options).toHaveCount(STATUS_OPTION_COUNT);
  await options.nth(index).click();
  await expect(popover).toHaveCount(0);
}

/**
 * Reactivates the statement from the "Extractos importados" tab (kebab → Reactivar → confirm).
 *
 * @param {import('@playwright/test').Page} page
 */
async function reactivateStatementFromUi(page) {
  await openTab(page, 'statements');

  const row = page.getByTestId(`statement-row-${STATEMENT_ID}`);
  await expect(row).toBeVisible();
  // The row actions only reveal on hover.
  await row.hover();
  await page.getByTestId(`statement-row-menu-${STATEMENT_ID}`).click();

  const reactivate = page.getByTestId('statement-row-reactivate');
  await expect(reactivate).toBeVisible();
  await reactivate.click();

  const dialog = page.getByTestId('statement-confirm-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('statement-confirm-action').click();
  await expect(page.getByTestId('statement-confirm-dialog')).toHaveCount(0);
}

test.describe('ETP-5121 — a reactivated statement keeps its reconciled line (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // Baseline: with the statement still processed, the panel buckets the two lines by their own
  // state. Without this, a CP-1 failure could just as easily mean the fixture never rendered.
  test('CP-1b: before the reactivation each line shows under its own filter', async ({ page }) => {
    await installMocks(page);
    await openTab(page, 'reconciliation');

    // Default filter is "pending" = everything not reconciled.
    await expect(page.getByTestId(`recon-line-row-${PENDING_LINE_ID}`)).toBeVisible();
    await expect(page.getByTestId(`recon-line-row-${RECONCILED_LINE_ID}`)).toHaveCount(0);

    await selectStatusOption(page, STATUS_OPTION_RECONCILED);

    await expect(page.getByTestId(`recon-line-row-${RECONCILED_LINE_ID}`)).toBeVisible();
    await expect(page.getByTestId(`recon-line-row-${PENDING_LINE_ID}`)).toHaveCount(0);
  });

  test('CP-1: the reconciled line is still listed after the statement is reactivated', async ({ page }) => {
    const { state } = await installMocks(page);

    await reactivateStatementFromUi(page);
    // The statement really is back in draft now — otherwise the assertion below would be testing
    // the pre-reactivation state.
    expect(state.processed).toBe(false);

    await openTab(page, 'reconciliation');
    await selectStatusOption(page, STATUS_OPTION_RECONCILED);

    // THE REGRESSION: before the fix this row was absent from the payload entirely, so the
    // "Conciliadas" filter rendered an empty list.
    const row = page.getByTestId(`recon-line-row-${RECONCILED_LINE_ID}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Cobro ya conciliado');
    // es-ES formatting; match the number only so the NBSP before the symbol is irrelevant.
    await expect(row).toContainText('250,00');
  });

  test('CP-1: the reconciled line is still reachable and un-reconcilable after the reactivation', async ({ page }) => {
    await installMocks(page);

    await reactivateStatementFromUi(page);
    await openTab(page, 'reconciliation');
    await selectStatusOption(page, STATUS_OPTION_RECONCILED);

    await page.getByTestId(`recon-line-radio-${RECONCILED_LINE_ID}`).click();

    // Its linked document is listed and pre-checked, and the bulk un-reconcile action is enabled —
    // which is the practical consequence of not dropping the row: while it was missing, the line
    // could not be un-reconciled from here at all (nor the statement deleted, since it still held
    // a matched line).
    await expect(page.getByTestId(`recon-cand-row-${TRANSACTION_ID}`)).toBeVisible();
    const action = page.getByTestId('recon-action-reconcile');
    await expect(action).toBeVisible();
    await expect(action).toBeEnabled();
  });

  // The exception in the gate is deliberately narrow. A draft statement's PENDING lines are not
  // reconcilable yet, so they stay out — an over-broad fix that simply dropped the
  // `bs.processed` gate would show them and let the user reconcile against a draft statement.
  test('CP-1c: the unmatched sibling is dropped once the statement is a draft', async ({ page }) => {
    await installMocks(page);

    await reactivateStatementFromUi(page);
    await openTab(page, 'reconciliation');

    // "Todos" — nothing is filtered out by the client here, so what is missing is missing from
    // the payload.
    await selectStatusOption(page, STATUS_OPTION_ALL);

    await expect(page.getByTestId(`recon-line-row-${RECONCILED_LINE_ID}`)).toBeVisible();
    await expect(page.getByTestId(`recon-line-row-${PENDING_LINE_ID}`)).toHaveCount(0);
  });

  test('the reactivate request is header-only: it carries the id and nothing else', async ({ page }) => {
    const { reactivateCalls } = await installMocks(page);

    await reactivateStatementFromUi(page);

    expect(reactivateCalls).toHaveLength(1);
    // No `lines` key at all — resending the matched line would ask the backend to rewrite a row
    // core's trigger forbids touching.
    expect(reactivateCalls[0]).toEqual({ id: STATEMENT_ID });
  });

  test('CP-2: the reconciled line stays read-only in the editor of the reactivated statement', async ({ page }) => {
    await installMocks(page);

    await reactivateStatementFromUi(page);

    // Editing is only offered for a draft, so this button appearing is itself part of the
    // scenario: the statement IS a draft now, and the reconciled line still may not be touched.
    const row = page.getByTestId(`statement-row-${STATEMENT_ID}`);
    await expect(row).toBeVisible();
    await row.hover();
    await page.getByTestId(`statement-row-edit-${STATEMENT_ID}`).click();

    /*
     * Hydration is async (it waits for the lines fetch to settle), so the first assertion below is
     * the one that waits.
     *
     * The locator deliberately does NOT key on `RECONCILED_LINE_ID`: `ManualStatementModal`'s
     * `lineToRow()` drops the backend line id entirely and stamps every grid row with a SYNTHETIC
     * client-side id (`e1`, `e2`, …) drawn from a module-level counter that keeps incrementing
     * across modal opens in the same page session. So `manual-line-matched-bsl-reconciled` never
     * exists, and no literal `e<n>` is deterministic either — a regex is the only stable handle
     * (the sibling Vitest test matches `/^manual-line-matched-/` for the same reason). The strict
     * count keeps the regex honest: exactly one matched row, so the assertions that follow can
     * never be diluted across several rows, and the content assertions are what still tie this row
     * to the reconciled line specifically.
     */
    const locked = page.getByTestId(/^manual-line-matched-/);
    await expect(locked).toHaveCount(1);
    await expect(locked).toBeVisible();

    // Read-only, not hidden: values on screen, no control to change them.
    await expect(locked).toContainText('Cobro ya conciliado');
    await expect(locked).toContainText('250,00');
    await expect(locked.getByTestId('manual-line-lock')).toBeVisible();
    await expect(locked.locator('input')).toHaveCount(0);
    await expect(locked.locator('button')).toHaveCount(0);
    await expect(locked.getByTestId('manual-line-remove')).toHaveCount(0);

    // Its unmatched sibling stays fully editable on the same draft — which is the point of being
    // able to reactivate a partially reconciled statement at all.
    await expect(page.getByTestId('manual-line-editrow')).toHaveCount(1);
    await expect(page.getByTestId('manual-line-description')).toBeVisible();
  });
});

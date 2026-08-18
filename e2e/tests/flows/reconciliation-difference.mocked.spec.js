import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * "Post the unreconciled statement remainder to a G/L item" — mocked.
 *
 * Scenario: a 12,50 € bank-statement line already matched against a 12,00 € movement. The
 * remaining 0,50 € cannot be reconciled against anything real, so the reconciliation panel offers
 * to post it to an accounting concept and close the line.
 *
 * Covered here:
 *   1. the amber banner appears once a PARTIAL line within tolerance is selected;
 *   2. "Dejar pendiente" hides it (session-only, no request);
 *   3. confirming the modal POSTs `?action=reconcileDifference` with the REMAINDER sub-line id and
 *      NO amount — the server recomputes the remainder and must not be able to be overridden;
 *   4. the banner never appears when the account has no amount tolerance configured.
 *
 * Mock mode only. Every route is installed AFTER `login()` so the specific handlers beat the
 * generic `**\/sws\/**` stub that helper seeds (Playwright matches routes in reverse registration
 * order).
 *
 * NOTE on the account fixture: the sibling `financial-account-detail.mocked.spec.js` predates this
 * feature and its ACCOUNTS entries carry neither `amountTolerance` nor `glItemDifferenceId`. Both
 * are required here — the tab reads them off the account and a missing/zero tolerance is exactly
 * the "banner hidden" case in test 4.
 */

const ACCOUNT_ID = 'acc-santander';
const GL_ITEM_ID = 'gl-bank-fees';
const GL_ITEM_NAME = 'Comisiones bancarias';

/** The merged/logical PARTIAL line the left panel shows. */
const LINE_ID = 'bsl-partial-head';
/** Its still-pending sub-line — the id the POST must target. */
const REMAINDER_LINE_ID = 'bsl-partial-remainder';

/**
 * Account fixture. `amountTolerance` is a PERCENTAGE: 5 % of 12,50 € = 0,63 €, comfortably above
 * the 0,50 € remainder, so the action is on offer.
 */
function account({ amountTolerance = 5, withGlItem = true } = {}) {
  return {
    id: ACCOUNT_ID,
    name: 'Banco Santander',
    type: 'B',
    currentBalance: 211841.01,
    currencyId: '102',
    currencyIso: 'EUR',
    iban: 'ES1212340000000000000001',
    isDefault: true,
    pendingCount: 1,
    bankConnected: false,
    // ETP-4796 — the two fields the reconciliation tab reads for the difference banner.
    amountTolerance,
    glItemDifferenceId: withGlItem ? GL_ITEM_ID : '',
    glItemDifferenceName: withGlItem ? GL_ITEM_NAME : '',
  };
}

const SUMMARY = {
  totalBalance: 211841.01,
  byCurrency: [{ currencyIso: 'EUR', total: 211841.01 }],
  pending: { accountsWithPending: 1, suggestionsReady: 0, byRule: 0 },
};

/**
 * The PARTIAL statement line: 12,50 € total, 12,00 € reconciled against DOC-1000034, 0,50 €
 * pending on `remainderLineId`. `status` stays 'pending' — the backend only flips it at 100 %.
 */
const PARTIAL_LINE = {
  id: LINE_ID,
  date: '2026-05-13T00:00:00Z',
  description: 'Transferencia ACME',
  status: 'pending',
  // `state: 'pending'` is what the backend really assigns to a PARTIAL group
  // (ReconciliationHandlerSupport.summarizePendingLines: "a PARTIAL group stays in the pending
  // universe"). Anything else and the left panel's default "Pendientes" filter hides the row.
  state: 'pending',
  reconcileStatus: 'PARTIAL',
  partial: true,
  amount: 12.5,
  reconciledAmount: 12,
  reconciledPct: 96,
  pendingAmount: 0.5,
  matchGroupId: 'grp-1',
  remainderLineId: REMAINDER_LINE_ID,
  txns: [{
    transactionId: 'trx-matched',
    documentNo: '1000034',
    contact: 'ACME',
    amount: 12,
    autoCreated: false,
  }],
};

/** A plain pending line, so the panel is not a single-row special case. */
const PLAIN_LINE = {
  id: 'bsl-plain',
  date: '2026-05-14T00:00:00Z',
  description: 'Nómina mayo',
  status: 'pending',
  state: 'pending',
  amount: 1200,
  reconciledAmount: 0,
  pendingAmount: 1200,
};

const LINES = [PARTIAL_LINE, PLAIN_LINE];

const MOVEMENTS_PAYLOAD = {
  response: {
    data: {
      transactions: [],
      totals: { balance: 211841.01, inflows: 0, outflows: 0, currency: 'EUR' },
      paymentMethods: [],
      trxTypes: [],
      enabledDimensions: [],
      headerDimensions: [],
    },
  },
};

/**
 * Installs every route the reconciliation tab of the account detail needs.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {object} [opts.accountOverrides] passed through to `account()`
 * @param {object[]} [opts.postCalls] collector for the `reconcileDifference` request bodies
 * @param {object} [opts.postResponse] `{ status, body }` to answer the POST with
 * @param {object[]} [opts.glItems] rows served by the modal's accounting-concept lookup
 */
async function installMocks(page, {
  accountOverrides = {},
  postCalls = [],
  postResponse = null,
  glItems = [],
} = {}) {
  const acc = account(accountOverrides);

  // Window list endpoint (the generated ListView's own useEntity fetch).
  await page.route(/\/sws\/neo\/financial-account\/account\?/, async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: [acc], totalRows: 1, summary: SUMMARY },
      }),
    });
  });

  // Detail endpoint — `useFinancialAccount` still reads the R spec.
  await page.route('**/sws/neo/financial-accounts-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: { data: { accounts: [acc], summary: SUMMARY } },
      }),
    });
  });

  // Movements — `useAccountMovements` (also the source of `paymentMethods`) AND the modal's
  // accounting-concept lookup, which `useGLItemLookup` serves off the same path via
  // `?action=glitem-lookup`.
  const transactionsHandler = async (route) => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action === 'glitem-lookup') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { glItems } } }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(MOVEMENTS_PAYLOAD),
    });
  };
  await page.route('**/sws/neo/financial-account-transactions/**', transactionsHandler);
  await page.route('**/sws/neo/financial-account-transactions**', transactionsHandler);

  // The whole reconciliation surface lives on ONE path, distinguished by `?action=`:
  // pendingLines / candidates (GET) and reconcileDifference (POST).
  await page.route(/\/sws\/neo\/bank-reconciliation\?/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const action = url.searchParams.get('action');

    if (req.method() === 'POST' && action === 'reconcileDifference') {
      postCalls.push(JSON.parse(req.postData() ?? '{}'));
      const answer = postResponse ?? {
        status: 201,
        body: {
          response: {
            data: {
              reconciliationId: 'rec-1',
              transactionId: 'trx-difference',
              differenceAmount: '0.50',
              glItemId: GL_ITEM_ID,
            },
          },
        },
      };
      await route.fulfill({
        status: answer.status,
        contentType: 'application/json',
        body: JSON.stringify(answer.body),
      });
      return;
    }

    if (req.method() !== 'GET') { await route.fallback(); return; }

    if (action === 'pendingLines') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: {
              lines: LINES,
              total: LINES.length,
              counts: { pending: LINES.length, difference: 1 },
              draftReconciliationCount: 0,
            },
          },
        }),
      });
      return;
    }

    if (action === 'candidates') {
      // Deliberately empty: the point of the difference banner is that there is NOTHING left to
      // reconcile the remainder against.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: { candidates: [], counts: {} } } }),
      });
      return;
    }

    await route.fallback();
  });

  return { postCalls };
}

/**
 * Opens the account detail on the reconciliation tab and returns the PARTIAL line's row locator.
 *
 * Entering that tab ALWAYS pops the automatch suggestions modal first
 * (`financial-account/index.jsx`: "The automatch modal opens whenever the user enters the
 * Reconciliation tab"), and while it is open its overlay swallows every click on the panel behind
 * it — so it has to be dismissed before anything else, deep link or not.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openReconciliationTab(page) {
  await page.goto(`/financial-account/${ACCOUNT_ID}?tab=reconciliation`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('detail-tab-reconciliation')).toBeVisible();

  const automatch = page.getByTestId('automatch-suggestion-modal');
  if (await automatch.isVisible().catch(() => false)) {
    await page.getByTestId('automatch-modal-cancel').click();
    await expect(automatch).toHaveCount(0);
  }

  const row = page.getByTestId(`recon-line-row-${LINE_ID}`);
  await expect(row).toBeVisible();
  return row;
}

test.describe('Reconciliation difference — post the remainder to a G/L item (mocked)', () => {
  test('the banner appears once the PARTIAL line is selected, and not before', async ({ page }) => {
    await login(page);
    await installMocks(page);
    const row = await openReconciliationTab(page);

    // Nothing selected yet → the right panel is empty and the banner is not rendered.
    await expect(page.getByTestId('recon-difference-banner')).toHaveCount(0);

    await row.click();

    const banner = page.getByTestId('recon-difference-banner');
    await expect(banner).toBeVisible();
    // The banner is inside the candidates panel, above the list — where the problem is.
    await expect(banner.getByTestId('recon-difference-open')).toBeVisible();
    await expect(banner.getByTestId('recon-difference-open')).toBeEnabled();
    await expect(banner.getByTestId('recon-difference-dismiss')).toBeVisible();
  });

  // The banner communicates ONE thing: the remainder. The design's subtitle (line total + matched
  // amount + movement reference) was dropped because all of it is already on screen — the line total
  // in the left panel, the matched amount and progress in the "conciliado" block rendered directly
  // below the banner. Asserting those numbers are ABSENT here is what keeps the duplication from
  // creeping back.
  test('the banner names the remainder only, not the figures already on screen', async ({ page }) => {
    await login(page);
    await installMocks(page);
    const row = await openReconciliationTab(page);
    await row.click();

    const banner = page.getByTestId('recon-difference-banner');
    await expect(banner).toBeVisible();
    // es-ES currency formatting; the NBSP before the symbol is normalised away by
    // Playwright's text matching, so match the number only.
    await expect(banner).toContainText('0,50');
    await expect(banner).not.toContainText('12,50');
    await expect(banner).not.toContainText('12,00');
    await expect(banner).not.toContainText('1000034');

    // Those figures ARE on screen, just not duplicated in the banner: the line total on the
    // statement row, the matched amount in the "conciliado" block right below it.
    await expect(page.getByTestId(`recon-line-row-${LINE_ID}`)).toContainText('12,50');
    await expect(page.getByTestId('recon-matched-block')).toContainText('12,00');
  });

  test('"Dejar pendiente" hides the banner without sending anything', async ({ page }) => {
    await login(page);
    const { postCalls } = await installMocks(page);
    const row = await openReconciliationTab(page);
    await row.click();

    const banner = page.getByTestId('recon-difference-banner');
    await expect(banner).toBeVisible();

    await banner.getByTestId('recon-difference-dismiss').click();

    await expect(page.getByTestId('recon-difference-banner')).toHaveCount(0);
    // It is a UI dismissal only — no request, and the line is still selected/pending.
    expect(postCalls).toHaveLength(0);
    await expect(page.getByTestId(`recon-line-row-${LINE_ID}`)).toBeVisible();
  });

  // The dismissal is scoped to the CURRENT selection and resets when it changes, per the design's
  // `bannerDismissed` state model ("se resetea al cambiar de línea"). An implementation that
  // remembers the dismissed line id instead hides the offer for the rest of the session — the exact
  // regression this test exists to catch.
  test('the banner comes back after selecting another line and returning', async ({ page }) => {
    await login(page);
    await installMocks(page);
    const row = await openReconciliationTab(page);
    await row.click();

    const banner = page.getByTestId('recon-difference-banner');
    await expect(banner).toBeVisible();
    await banner.getByTestId('recon-difference-dismiss').click();
    await expect(page.getByTestId('recon-difference-banner')).toHaveCount(0);

    // Move to the plain pending line — no banner there either way.
    await page.getByTestId(`recon-line-row-${PLAIN_LINE.id}`).click();
    await expect(page.getByTestId('recon-difference-banner')).toHaveCount(0);

    // ...and back to the PARTIAL one: the offer is on the table again.
    await page.getByTestId(`recon-line-row-${LINE_ID}`).click();
    await expect(page.getByTestId('recon-difference-banner')).toBeVisible();
  });

  test('confirming the modal POSTs reconcileDifference for the REMAINDER line, with no amount', async ({ page }) => {
    await login(page);
    const { postCalls } = await installMocks(page);
    const row = await openReconciliationTab(page);
    await row.click();

    await page.getByTestId('recon-difference-open').click();

    const dialog = page.getByTestId('recon-difference-dialog');
    await expect(dialog).toBeVisible();
    // The amount is fixed by design — it is shown as a read-only breakdown row, never an input.
    await expect(dialog.getByTestId('recon-difference-row-difference')).toContainText('0,50');

    // The account's configured concept is preselected, so confirm is already available.
    const confirm = dialog.getByTestId('recon-difference-confirm');
    await expect(confirm).toBeEnabled();

    await dialog.getByTestId('recon-difference-description').fill('Comisión bancaria');

    const postRequest = page.waitForRequest((r) =>
      r.method() === 'POST'
      && r.url().includes('/sws/neo/bank-reconciliation')
      && r.url().includes('action=reconcileDifference'));
    await confirm.click();
    await postRequest;

    expect(postCalls).toHaveLength(1);
    const body = postCalls[0];
    expect(body.financialAccountId).toBe(ACCOUNT_ID);
    // The REMAINDER sub-line, never the merged head — the backend answers 409 for the head.
    expect(body.statementLineId).toBe(REMAINDER_LINE_ID);
    expect(body.statementLineId).not.toBe(LINE_ID);
    expect(body.glItemId).toBe(GL_ITEM_ID);
    expect(body.description).toBe('Comisión bancaria');
    // The client must NOT be able to widen what gets written off.
    expect(body).not.toHaveProperty('amount');
    expect(Object.keys(body).sort())
      .toEqual(['description', 'financialAccountId', 'glItemId', 'statementLineId']);

    // The modal closes and the selection is dropped on success.
    await expect(page.getByTestId('recon-difference-dialog')).toHaveCount(0);
  });

  test('omitting the description sends no description key at all', async ({ page }) => {
    await login(page);
    const { postCalls } = await installMocks(page);
    const row = await openReconciliationTab(page);
    await row.click();

    await page.getByTestId('recon-difference-open').click();
    const dialog = page.getByTestId('recon-difference-dialog');
    await expect(dialog).toBeVisible();

    const postRequest = page.waitForRequest((r) =>
      r.method() === 'POST' && r.url().includes('action=reconcileDifference'));
    await dialog.getByTestId('recon-difference-confirm').click();
    await postRequest;

    expect(Object.keys(postCalls[0]).sort())
      .toEqual(['financialAccountId', 'glItemId', 'statementLineId']);
  });

  test('a backend rejection keeps the modal open and surfaces the message', async ({ page }) => {
    await login(page);
    const { postCalls } = await installMocks(page, {
      postResponse: {
        status: 400,
        body: { error: { message: 'La diferencia pendiente excede la tolerancia', status: 400 } },
      },
    });
    const row = await openReconciliationTab(page);
    await row.click();

    await page.getByTestId('recon-difference-open').click();
    const dialog = page.getByTestId('recon-difference-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('recon-difference-confirm').click();

    await expect(page.getByText('La diferencia pendiente excede la tolerancia')).toBeVisible();
    expect(postCalls).toHaveLength(1);
    // Still open, so the user can pick a different concept instead of losing the context.
    await expect(page.getByTestId('recon-difference-dialog')).toBeVisible();
  });

  test('the banner is absent when the account has no amount tolerance configured', async ({ page }) => {
    await login(page);
    await installMocks(page, { accountOverrides: { amountTolerance: 0 } });
    const row = await openReconciliationTab(page);
    await row.click();

    // The line is selected (its candidates panel rendered) but nothing is on offer: a 0 %
    // tolerance means "no difference may be posted" until an administrator configures one.
    await expect(page.getByTestId('recon-difference-banner')).toHaveCount(0);
  });

  // An account with NO configured difference concept is NOT a dead end: the banner action stays
  // enabled and the concept is picked in the modal, whose confirm is the real gate. (An earlier
  // version disabled the banner and told the user to go configure the account — wrong, since the
  // backend accepts any glItemId the modal sends.)
  test('with no configured concept the banner still offers the action, gated at the modal', async ({ page }) => {
    await login(page);
    const { postCalls } = await installMocks(page, {
      accountOverrides: { withGlItem: false },
      glItems: [{ id: 'gl-picked', name: 'Diferencias de conciliación', identifier: 'Diferencias de conciliación' }],
    });
    const row = await openReconciliationTab(page);
    await row.click();

    const banner = page.getByTestId('recon-difference-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByTestId('recon-difference-open')).toBeEnabled();

    await banner.getByTestId('recon-difference-open').click();
    const dialog = page.getByTestId('recon-difference-dialog');
    await expect(dialog).toBeVisible();

    // Nothing preselected → confirm is gated.
    const confirm = dialog.getByTestId('recon-difference-confirm');
    await expect(confirm).toBeDisabled();

    // Pick a concept from the lookup, which unblocks it. The ChipSelect popover is PORTALED to the
    // body (so it is never clipped by the modal body), hence scoped to `page`, not to `dialog`.
    await dialog.getByTestId('recon-difference-concept-search').fill('Dif');
    await page.getByTestId('recon-difference-concept-option-gl-picked').click();
    await expect(dialog.getByTestId('recon-difference-concept-chip')).toBeVisible();
    await expect(confirm).toBeEnabled();

    const postRequest = page.waitForRequest((r) =>
      r.method() === 'POST' && r.url().includes('action=reconcileDifference'));
    await confirm.click();
    await postRequest;

    expect(postCalls).toHaveLength(1);
    expect(postCalls[0].glItemId).toBe('gl-picked');
    expect(postCalls[0].statementLineId).toBe(REMAINDER_LINE_ID);
  });

  test('the banner is absent for a plain pending line', async ({ page }) => {
    await login(page);
    await installMocks(page);
    await openReconciliationTab(page);

    await page.getByTestId(`recon-line-row-${PLAIN_LINE.id}`).click();

    await expect(page.getByTestId('recon-difference-banner')).toHaveCount(0);
  });
});

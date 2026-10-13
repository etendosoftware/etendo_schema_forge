// @covers tools/app-shell/src/components/contract-ui/AccountLookupPopup.jsx
// @covers tools/app-shell/src/components/contract-ui/DataTable.jsx
// @covers artifacts/simple-g-l-journal/decisions.json
// @covers artifacts/simple-g-l-journal/custom/SimpleGLJournalBottomPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Simple G/L Journal — balance footer (mocked).
 *
 * Exercises the window's defining feature: the aligned debit/credit balance
 * row rendered inline inside the lines grid, plus the save-gate that blocks
 * saving while the journal is unbalanced (blockSaveForBalance in DetailView).
 *
 * `simple-g-l-journal` uses `linesLayout: 'inlineEditable'`, so as of ETP-5210
 * ("Align balance totals under their grid columns") `renderTotalsBlock()`
 * (tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx) early-
 * returns null for this window and the old standalone `BalanceFooterPanel`
 * never mounts. The totals now render as a dedicated row inside the lines
 * grid itself, via `renderBalanceFooterRow()` in
 * tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
 * (`data-testid="balance-footer-row"`, with the debit/credit cells tagged
 * `balance-footer-debit` / `balance-footer-credit` so each total lines up
 * under its own grid column instead of sitting in a separate panel below).
 *
 * Mock mode only. The spec opens an EXISTING draft journal in detail view and
 * feeds its `gLJournalLine` children through a window-specific route installed
 * AFTER login() (Playwright matches routes in reverse registration order, so a
 * specific route wins over the generic /sws/** stub seeded by login()).
 *
 * The footer reads its totals directly from the saved children (hook.children),
 * so balanced vs unbalanced is fully deterministic without driving the inline
 * line-editing callout flow — no live backend required.
 *
 * Balance semantics (see tools/app-shell/src/lib/balanceTotals.js):
 *   isBalanced === (Σ debit - Σ credit === 0)
 *   (non-zero total is a separate gate: blockCompleteForBalance in DetailView)
 */

const SPEC = 'simple-g-l-journal';
const ENTITY = 'gLJournal';
const LINE_ENTITY = 'gLJournalLine';
const RECORD_ID = 'glj-001';

// Draft header (processed: 'N' so the form stays editable and the document is
// not locked — otherwise the save button would be disabled regardless of balance).
const HEADER = {
  id: RECORD_ID,
  documentNo: 'GLJ-001',
  description: 'E2E manual journal',
  processed: 'N',
  posted: 'N',
  // Required header fields — must all be present so the add-line guard
  // (resolveCanAddLines) lets the inline add-row open.
  accountingDate: '2026-06-22',
  period: 'period-001',
  currency: 'cur-eur',
  'currency$_identifier': 'EUR',
  opening: 'N',
  multigeneralLedger: 'N',
};

// Two-line journals keyed by scenario. The footer sums foreignCurrencyDebit and
// foreignCurrencyCredit across these saved children.
const BALANCED_LINES = [
  { id: 'line-1', foreignCurrencyDebit: 100, foreignCurrencyCredit: 0 },
  { id: 'line-2', foreignCurrencyDebit: 0, foreignCurrencyCredit: 100 },
];
const UNBALANCED_LINES = [
  { id: 'line-1', foreignCurrencyDebit: 100, foreignCurrencyCredit: 0 },
  { id: 'line-2', foreignCurrencyDebit: 0, foreignCurrencyCredit: 60 },
];

/**
 * Install detail + children + save mocks for the journal record.
 * `lines` controls the balance scenario. Must run AFTER login().
 */
async function installJournalMock(page, lines, header = HEADER) {
  let saveRequested = false;

  await page.route(`**/sws/neo/${SPEC}/${ENTITY}/**`, async (route) => {
    const req = route.request();
    const method = req.method();

    // Save (PUT/PATCH/POST) on the header — record the call and acknowledge it.
    if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
      saveRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [header] } }),
      });
      return;
    }

    // Detail GET by id → header envelope.
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [header] } }),
      });
      return;
    }
    route.fallback();
  });

  // Children lines fetch: GET /gLJournalLine?parentId=<id>
  await page.route(`**/sws/neo/${SPEC}/${LINE_ENTITY}{/**,}**`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: lines, totalRows: lines.length } }),
      });
      return;
    }
    // Line writes (add/update/delete) — acknowledge generically.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: lines } }),
    });
  });

  return { wasSaveRequested: () => saveRequested };
}

async function openJournal(page, lines) {
  await login(page);
  const ctx = await installJournalMock(page, lines);
  await page.goto(`/${SPEC}/${RECORD_ID}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  // The balance footer row renders once the children resolve.
  await expect(page.getByTestId('balance-footer-row')).toBeVisible();
  return ctx;
}

test.describe('Simple G/L Journal — balance footer', () => {
  test('balanced journal: status is balanced and save is enabled, save succeeds', async ({ page }) => {
    const ctx = await openJournal(page, BALANCED_LINES);

    // Footer row reflects the balanced totals (debit 100 / credit 100). The
    // difference amount and the balanced/unbalanced badge were removed from
    // BalanceFooterPanel (ETP-4917, DF Contabilidad §2.1 point 3), and the
    // footer itself moved inline under the grid columns (ETP-5210) — only the
    // two debit/credit totals render now, with no "Total debe"/"Total haber"
    // labels; balance status is asserted through the save-gate behavior below.
    await expect(page.getByTestId('balance-footer-debit')).toContainText('100');
    await expect(page.getByTestId('balance-footer-credit')).toContainText('100');

    // Make the form dirty without unbalancing it (edit a header text field) so
    // the existing-record save gate (!isDirty) clears and we isolate the
    // balance gate: balanced ⇒ save is ENABLED. The textarea itself carries the
    // field-description testid.
    const descInput = page.getByTestId('field-description');
    await expect(descInput).toBeVisible();
    await descInput.fill('E2E manual journal — edited');

    const saveBtn = page.getByTestId('action-save');
    await expect(saveBtn).toBeEnabled();

    await saveBtn.click();
    await expect.poll(() => ctx.wasSaveRequested(), { timeout: 5_000 }).toBe(true);
  });

  test('unbalanced journal: status is unbalanced, save is disabled', async ({ page }) => {
    await openJournal(page, UNBALANCED_LINES);

    // debit 100 / credit 60 → not balanced. The footer row no longer renders a
    // difference amount or a balanced/unbalanced badge (ETP-4917) — the
    // unbalanced status is proven by the save-gate staying disabled below.
    await expect(page.getByTestId('balance-footer-debit')).toContainText('100');
    await expect(page.getByTestId('balance-footer-credit')).toContainText('60');

    // Even after making the form dirty, the balance gate keeps save DISABLED.
    const descInput = page.getByTestId('field-description');
    await expect(descInput).toBeVisible();
    await descInput.fill('E2E manual journal — edited');

    await expect(page.getByTestId('action-save')).toBeDisabled();
  });

  // A third test used to live here: 'new line add-row pre-fills the description
  // from the line /defaults (HandleDefaults)'. Removed — ETP-5210 discarded the
  // gLJournalLine `description` field entirely (decisions.json: visibility
  // "discarded"), so it no longer appears in addLineFields.entry and the inline
  // add-row has no description input to pre-fill. The HandleDefaults prefill
  // behavior the test exercised no longer applies to this window; the feature
  // itself is gone, not just the testid.
});

// ETP-5611 — manual journal fixes visible in the detail view.
async function openJournalWith(page, lines, header) {
  await login(page);
  await installJournalMock(page, lines, header);
  await page.goto(`/${SPEC}/${RECORD_ID}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

const DRAFT = { ...HEADER, documentStatus: 'DR' };
const COMPLETED = { ...HEADER, documentStatus: 'CO', processed: 'Y', posted: 'N' };

test.describe('Simple G/L Journal — detail view (ETP-5611)', () => {
  test('saved draft with no lines shows the empty state with the add button', async ({ page }) => {
    await openJournalWith(page, [], DRAFT);
    await expect(page.getByTestId('lines-empty-state')).toBeVisible();
    await expect(page.getByTestId('action-add-lines-empty-state')).toBeVisible();
  });

  test('new journal shows the empty state message without the add button', async ({ page }) => {
    await login(page);
    await installJournalMock(page, []);
    await page.goto(`/${SPEC}/new`);
    await expect(page.getByTestId('lines-empty-state')).toBeVisible();
    await expect(page.getByTestId('action-add-lines-empty-state')).toHaveCount(0);
  });

  test('no Print button in the detail view', async ({ page }) => {
    await openJournalWith(page, BALANCED_LINES, DRAFT);
    await expect(page.getByTestId('balance-footer-row')).toBeVisible();
    await expect(page.getByTestId('action-document-print')).toHaveCount(0);
  });

  test('draft: neither Post nor Reactivate is offered', async ({ page }) => {
    await openJournalWith(page, BALANCED_LINES, DRAFT);
    await expect(page.getByTestId('balance-footer-row')).toBeVisible();
    // Post was the only kebab item a draft used to offer; with it gated on CO (and Reactivate
    // too), a draft has no visible menu action left, so the kebab itself is not rendered.
    await expect(page.getByTestId('action-more')).toHaveCount(0);
    await expect(page.getByTestId('menu-action-post')).toHaveCount(0);
  });

  test('completed, not posted: Post and Reactivate are offered, Unpost is not', async ({ page }) => {
    await openJournalWith(page, BALANCED_LINES, COMPLETED);
    await page.getByTestId('action-more').click();
    await expect(page.getByTestId('menu-action-post')).toBeVisible();
    await expect(page.getByTestId('menu-action-reactivate')).toBeVisible();
    await expect(page.getByTestId('menu-action-unpost')).toHaveCount(0);
  });

  test('Delete is offered on a draft and hidden once the journal is completed', async ({ page }) => {
    await openJournalWith(page, BALANCED_LINES, DRAFT);
    await expect(page.getByTestId('balance-footer-row')).toBeVisible();
    await expect(page.getByTestId('action-delete')).toBeVisible();

    await openJournalWith(page, BALANCED_LINES, COMPLETED);
    await expect(page.getByTestId('action-more')).toBeVisible();
    await expect(page.getByTestId('action-delete')).toHaveCount(0);
  });

  test('hovering a line keeps the Credit cell on screen', async ({ page }) => {
    await openJournalWith(page, BALANCED_LINES, DRAFT);
    const row = page.getByTestId('line-row-line-2');
    await row.hover();
    await expect(row.getByTestId('line-actions')).toBeVisible();
    await expect(row.locator('[data-cell-key="foreignCurrencyCredit"]')).toBeVisible();
  });
});

// ETP-5681 — the line Account column (`"lookupDrawer": "account"`) opens the shared search popup
// over the field's server selector, both in the add row and when editing a saved line, and shows
// each "code - name" in full instead of cutting it off.
const ACCOUNT_SELECTOR = 'C_ValidCombination_ID';
const ACCOUNTS = [
  { id: 'acc-572', label: '57200001 - Bancos e instituciones de crédito c/c vista, euros, cuenta principal de tesorería' },
  { id: 'acc-430', label: '43000000 - Clientes' },
];
const LINES_WITH_ACCOUNT = BALANCED_LINES.map((line) => ({
  ...line,
  accountingCombination: 'acc-430',
  'accountingCombination$_identifier': ACCOUNTS[1].label,
}));

/**
 * Account selector mock — filters by `q` like the server — plus a recorder for line writes.
 * Must run AFTER installJournalMock().
 */
async function installAccountSelectorMock(page) {
  const queries = [];
  const lineWrites = [];
  await page.route(`**/sws/neo/${SPEC}/${LINE_ENTITY}/**`, async (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    lineWrites.push(route.request().postData() || '');
    return route.fallback();
  });
  await page.route(`**/sws/neo/${SPEC}/${LINE_ENTITY}/selectors/${ACCOUNT_SELECTOR}**`, async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    queries.push(q);
    const items = ACCOUNTS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, hasMore: false }),
    });
  });
  return { queries, lineWrites };
}

test.describe('Simple G/L Journal — account popup', () => {
  test('add row: the Account field opens the popup, searches the selector and fills the pick', async ({ page }) => {
    await openJournalWith(page, BALANCED_LINES, DRAFT);
    const selector = await installAccountSelectorMock(page);

    await page.getByTestId('action-add-line').click();
    const field = page.getByTestId('inline-add-field-accountingCombination');
    await field.click();

    const popup = page.getByTestId('account-lookup-popup');
    await expect(popup).toBeVisible();
    // Titled with the column's resolved label — the same string the field shows as placeholder.
    await expect(popup.getByRole('heading')).toHaveText((await field.textContent()).trim());
    // Long names are shown in full, not truncated.
    await expect(popup.getByTestId('account-lookup-popup-option-acc-572')).toHaveText(ACCOUNTS[0].label);

    await popup.getByTestId('account-lookup-popup-input').fill('4300');
    await expect.poll(() => selector.queries).toContain('4300');
    await expect(popup.getByTestId('account-lookup-popup-option-acc-572')).toHaveCount(0);

    await popup.getByTestId('account-lookup-popup-option-acc-430').click();
    await expect(popup).toHaveCount(0);
    await expect(field).toContainText(ACCOUNTS[1].label);
  });

  test('editing a saved line: the Account cell opens the popup and replaces the account', async ({ page }) => {
    await openJournalWith(page, LINES_WITH_ACCOUNT, DRAFT);
    const selector = await installAccountSelectorMock(page);

    const row = page.getByTestId('line-row-line-1');
    await row.locator('[data-cell-key="accountingCombination"]').click();
    const trigger = row.getByTestId('field-accountingCombination');
    await expect(trigger).toContainText(ACCOUNTS[1].label);
    await trigger.click();

    const popup = page.getByTestId('account-lookup-popup');
    await expect(popup).toBeVisible();
    await popup.getByTestId('account-lookup-popup-option-acc-572').click();

    await expect(popup).toHaveCount(0);
    // The pick is saved for that line (the mock answers with the old rows, so the saved request,
    // not the re-rendered cell, is what proves the new account).
    await expect.poll(() => selector.lineWrites.join('\n')).toContain('acc-572');
  });
});

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

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
async function installJournalMock(page, lines) {
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
        body: JSON.stringify({ response: { data: [HEADER] } }),
      });
      return;
    }

    // Detail GET by id → header envelope.
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [HEADER] } }),
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

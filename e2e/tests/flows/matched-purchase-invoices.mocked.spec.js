import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { t } from '../helpers/i18n.js';

/**
 * Matched Purchase Invoices — bulk accounting post/unpost (ETP-5075, mocked).
 *
 * `MatchedInvoiceBulkActions` reuses the shared `BulkDocumentAction` floating-toolbar
 * modal via `actionMode="neoAction"` — the per-row call goes to the generic NEO action
 * endpoint (`POST .../matchedInvoice/{id}/action/{post|unpost}`) instead of the DocAction
 * one, since this window has no DocAction/`documentStatus` at all.
 *
 * Mock mode only: installs window-specific routes on top of the generic /sws/** mock
 * that login() seeds, so it does not need a backend.
 */

const SPEC = 'matched-purchase-invoices';
const ENTITY_PATH = 'matchedInvoice';

// M_MatchInv.Posted is NOT boolean — mixing an unposted ('T') and a posted ('Y') row
// exercises buildPostActions' mixed-selection branch: both 'post' and 'unpost' must be
// offered in the dropdown.
const ROWS = [
  {
    id: 'mi-001',
    posted: 'T',
    'product$_identifier': 'Product A',
    invoiceLine: 'il-1',
    goodsShipmentLine: 'sl-1',
    quantity: 10,
    transactionDate: '2026-01-10',
    processed: true,
  },
  {
    id: 'mi-002',
    posted: 'Y',
    'product$_identifier': 'Product B',
    invoiceLine: 'il-2',
    goodsShipmentLine: 'sl-2',
    quantity: 5,
    transactionDate: '2026-01-12',
    processed: true,
  },
];

async function installMatchedInvoiceMock(page, actionRequests) {
  const handler = async (route) => {
    const req = route.request();
    const url = req.url();

    // Per-row accounting action — the call under test.
    const actionMatch = url.match(new RegExp(`/${ENTITY_PATH}/([^/?]+)/action/(\\w+)`));
    if (req.method() === 'POST' && actionMatch) {
      actionRequests.push({ id: actionMatch[1], action: actionMatch[2] });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ success: true }] } }),
      });
      return;
    }

    // List fetch.
    if (req.method() === 'GET' && !new RegExp(`/${ENTITY_PATH}/[^/?]+`).test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
      return;
    }

    // Detail fetch — return the matching row by id.
    if (req.method() === 'GET') {
      const m = url.match(new RegExp(`/${ENTITY_PATH}/([^/?]+)`));
      const found = ROWS.find((r) => r.id === m?.[1]) ?? ROWS[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }

    route.fallback();
  };

  // Two-route registration (guide's own gotcha): a bare `word**` glob does NOT cross a
  // `/` boundary, so /action/{id}/... would silently fall through to the generic
  // catch-all without this explicit sub-path route.
  await page.route(`**/sws/neo/${SPEC}/${ENTITY_PATH}/**`, handler);
  await page.route(`**/sws/neo/${SPEC}/${ENTITY_PATH}**`, handler);
}

test.describe('Matched Purchase Invoices — bulk post/unpost', () => {
  let actionRequests;

  test.beforeEach(async ({ page }) => {
    actionRequests = [];
    await login(page);
    await installMatchedInvoiceMock(page, actionRequests);
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('selecting 2 rows shows the floating bar, the dropdown offers post AND unpost, and confirming "post" only sends it for the row that is not already posted', async ({ page }) => {
    const row1 = page.getByTestId(`row-${ROWS[0].id}`);
    const row2 = page.getByTestId(`row-${ROWS[1].id}`);
    await expect(row1).toBeVisible();
    await expect(row2).toBeVisible();

    // force: true — the native input is visually `sr-only`; a sibling styled
    // `<div>` renders the visible box and intercepts pointer events on top of it.
    await row1.getByRole('checkbox').click({ force: true });
    await row2.getByRole('checkbox').click({ force: true });

    // ETP-5302 — floating toolbar's bulk-action button: labelKey="process" →
    // "Procesar" (es_ES). It used to be labelKey="confirmBulk" → "Confirmar";
    // "Confirmar" is now the label of the DR→CO dropdown option instead (which
    // this window never offers — its actions are post/unpost), so matching on
    // /confirmar/ here would no longer find the button at all.
    const processBtn = page.getByRole('button', { name: /^(procesar|process)$/i });
    await expect(processBtn).toBeVisible();
    await processBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Mixed posted values (row-001 not posted, row-002 posted) ⇒ both actions offered.
    // Anchored regexes ('^...$') — "Contabilizar" is otherwise a substring match
    // of "Descontabilizar" and Playwright's accessible-name regex is unanchored
    // by default, so an un-anchored pattern here resolves both options at once.
    const trigger = dialog.getByRole('combobox');
    await trigger.click();
    await expect(page.getByRole('option', { name: /^(contabilizar|post)$/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /^(descontabilizar|unpost)$/i })).toBeVisible();
    // Close the listbox back onto the default selection ('post', pushed first by
    // buildPostActions whenever any row is not posted) without changing it.
    await page.getByRole('option', { name: /^(contabilizar|post)$/i }).click();

    // ETP-5302 — the shared modal's confirm button is "Aceptar"/"Accept" (labelKey
    // 'accept'). It used to be 'done' → "Completado" in es_ES, which reads as the
    // document STATUS of the same name on a dialog that runs document actions.
    await dialog.getByRole('button', { name: /^(aceptar|accept)$/i }).click();

    // rowFilter pre-blocks mi-002 for 'post' — it is already posted ('Y') — so only
    // mi-001 (state 'T', not posted) is actually sent. Sending 'post' again on an
    // already-posted row would hit the backend with a confusing accounting error instead
    // of this clear, immediate per-row message (see MatchedInvoiceBulkActions' rowFilter).
    await expect.poll(() => actionRequests.length).toBe(1);
    const byId = Object.fromEntries(actionRequests.map((r) => [r.id, r.action]));
    expect(byId['mi-001']).toBe('post');
    expect(byId['mi-002']).toBeUndefined();

    // The shared modal keeps the pre-blocked row separate from a real API failure
    // (ETP-5209): mi-002 was blocked by rowFilter BEFORE any API call, so it lands in
    // `omitted`, not `failed` — nothing actually errored (1 ok, 1 omitted, 0 failed).
    //
    // Assert the toast the user actually sees. This used to read the result out of
    // sessionStorage instead, because `handleDone` persisted it and reloaded the whole
    // page, and asserting the post-reload toast raced the reload plus sonner's
    // auto-dismiss. ETP-5302 removed that reload: whenever ListView's `bulkActions`
    // slot supplies a `refresh` (always, in the real app) the toast is shown in place,
    // immediately and stably — so do NOT reinstate the sessionStorage workaround.
    //
    // The exact 3-number message is what keeps omitted ≠ failed guarded: counting the
    // pre-blocked row as a failure renders the 2-number `processExecuted` instead
    // ("… y 1 registros fallidos."), and counting it as processed renders that same
    // 2-number message as a *success* toast — both fail this assertion.
    // mi-002 being the omitted one is already proven above: it is the only selected row
    // for which no action request was ever sent.
    const bulkToast = page.locator('[data-sonner-toast]').first();
    await expect(bulkToast).toBeVisible({ timeout: 10_000 });
    await expect(bulkToast).toContainText(
      t('processExecutedWithOmitted', { ok: 1, omitted: 1, failed: 0 }),
    );
    // richColors variant: 1 ok + 1 omitted + 0 failed is a partial outcome ⇒ warning,
    // never success (all processed) and never error (nothing processed).
    await expect(bulkToast).toHaveAttribute('data-type', 'warning');
  });
});

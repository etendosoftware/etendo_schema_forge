import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

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

    // Floating toolbar's bulk-action button — labelKey="confirmBulk" → "Confirmar" (es_ES).
    const confirmBtn = page.getByRole('button', { name: /confirmar|confirm/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

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

    // "Completado" is the real es_ES translation of the shared modal's Done button
    // (labelKey 'done'), not a document-status label — this window has no DocAction.
    await dialog.getByRole('button', { name: /^(completado|done)$/i }).click();

    // rowFilter pre-blocks mi-002 for 'post' — it is already posted ('Y') — so only
    // mi-001 (state 'T', not posted) is actually sent. Sending 'post' again on an
    // already-posted row would hit the backend with a confusing accounting error instead
    // of this clear, immediate per-row message (see MatchedInvoiceBulkActions' rowFilter).
    await expect.poll(() => actionRequests.length).toBe(1);
    const byId = Object.fromEntries(actionRequests.map((r) => [r.id, r.action]));
    expect(byId['mi-001']).toBe('post');
    expect(byId['mi-002']).toBeUndefined();

    // The shared modal counts the pre-blocked row as "failed" (1 ok, 1 failed) — read
    // straight from sessionStorage, which handleDone writes synchronously right after the
    // click, rather than the post-reload toast: that assertion raced the reload + sonner's
    // default auto-dismiss duration inside the same 10s window and was flaky in CI.
    const stored = await page
      .waitForFunction(() => {
        const raw = sessionStorage.getItem('bulkActionResult');
        return raw ? JSON.parse(raw) : null;
      }, null, { timeout: 5_000 })
      .then((handle) => handle.jsonValue());
    expect(stored.ok).toBe(1);
    expect(stored.failed).toHaveLength(1);
    expect(stored.failed[0].documentNo).toBe('mi-002');
  });
});

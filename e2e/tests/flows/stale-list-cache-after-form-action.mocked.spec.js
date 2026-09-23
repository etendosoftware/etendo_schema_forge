import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Stale grid after a form action — regression (mocked). ETP-5378.
 *
 * ── The reported bug ──────────────────────────────────────────────────────
 * A Completed-but-unposted Sales Invoice is posted from the form's "⋮" menu and
 * the user then leaves with **Cancelar**. The grid still showed "Sin
 * contabilizar" until the user hit refresh by hand.
 *
 * `useEntity` keeps a shared client-side cache with TWO things to update after a
 * mutation — the cached LIST pages and the cached RECORD. `handleProcessSuccess`
 * already did both (`invalidateEntityCache()` + `fetchById()`); the kebab menu
 * and the slot `onRefresh` handlers only did the second. So the form read the
 * new state (ETP-4563 fixed that half) while the cached grid page kept the
 * pre-action row. `Cancelar` only runs `navigate('/'+windowName)`, so the grid
 * re-mounted straight onto that stale cached list. Not a Cancelar bug, and not
 * specific to Sales Invoice — it is the whole family of post-action refresh
 * handlers in DetailMoreActionsMenu.jsx and DetailView.jsx.
 *
 * ── ⚠️ Why this spec MUST reach the form by clicking the grid row ───────────
 * The first version of this spec used `page.goto('/sales-invoice/inv-1')` for
 * step 2 and **passed both with and against the bug**. A `page.goto` is a HARD
 * navigation: it tears the SPA down and takes the whole in-memory cache with
 * it, so on the way back the list has nothing stale left to serve and a
 * cache bug cannot reproduce. Only a client-side route change — clicking
 * `row-quick-action-edit` on the row — keeps the DataProvider (and its cache)
 * mounted across the flow.
 *
 * **A cache test that navigates with `page.goto` proves nothing.** The
 * `documentAlive` probe below asserts that property directly: a variable set on
 * `window` after the first list render must survive to the end of the flow.
 * If a future edit reintroduces a hard navigation anywhere in these steps, that
 * probe fails loudly instead of the spec silently going green forever.
 *
 * The corrected version was verified to FAIL on the unfixed build and PASS on
 * the fixed one.
 *
 * ── Why the mock holds server-side state ──────────────────────────────────
 * `posted` lives in `state.rows` and the `/action/post` route FLIPS it, so the
 * list response genuinely differs between the first and the second read. With a
 * constant fixture the final assertion could pass on nothing more than a lucky
 * re-render. The list-GET counter is the second signal: with the fix the list is
 * re-read after the action, without it the cached page is reused.
 *
 * Mock mode only: routes are installed AFTER login() so they win over the
 * generic /sws/** stub it seeds (Playwright matches routes in reverse
 * registration order).
 */

const SPEC = 'sales-invoice';
const ENTITY = 'header';

const BASE_ROW = {
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  // Completed document → satisfies the `visibleWhenFieldTrue: processed` gate on
  // the Post kebab item (see artifacts/sales-invoice/decisions.json).
  processed: 'Y',
  'businessPartner$_identifier': 'Test BP',
  grandTotalAmount: 100,
  outstandingAmount: 0,
  invoiceDate: '2026-01-15',
  accountingDate: '2026-01-15',
};

// Realistic Etendo values: 'Y'/'N' strings, never booleans. TARGET starts
// unposted (badge "Sin contabilizar", Post item visible); CONTROL is already
// posted and must read "Contabilizado" from the very first render — it proves
// the badge renderer works in both directions, so the final assertion on TARGET
// cannot be satisfied by a renderer that always prints the same text.
const TARGET_ID = 'inv-unposted';
const CONTROL_ID = 'inv-posted';
const TARGET_DOC_NO = 'INV-UNPOSTED';
const CONTROL_DOC_NO = 'INV-POSTED';

const BADGE_POSTED = 'Contabilizado';
const BADGE_NOT_POSTED = 'Sin contabilizar';

/** Fresh per-test server state — the `/action/post` route mutates it. */
function createState() {
  return {
    rows: [
      { ...BASE_ROW, id: TARGET_ID, documentNo: TARGET_DOC_NO, posted: 'N' },
      { ...BASE_ROW, id: CONTROL_ID, documentNo: CONTROL_DOC_NO, posted: 'Y' },
    ],
    listGets: 0,
    postActions: 0,
  };
}

/**
 * Install the stateful list/detail/action mock. Must run AFTER login().
 */
async function installMocks(page, state) {
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();

    // Action POST: `/header/<id>/action/post` — mutates the server-side fixture.
    if (req.method() === 'POST' && /\/action\/post(\?|$)/.test(url)) {
      const m = url.match(new RegExp(`/${ENTITY}/([^/?]+)/action/post`));
      const row = state.rows.find((r) => r.id === m?.[1]);
      if (row) row.posted = 'Y';
      state.postActions += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Document posted' }),
      });
      return;
    }

    // List GET: `/header` (no id segment).
    if (req.method() === 'GET' && !new RegExp(`/${ENTITY}/[^/?]+`).test(url)) {
      state.listGets += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: state.rows, totalRows: state.rows.length } }),
      });
      return;
    }

    // Detail GET: `/header/<id>`.
    if (req.method() === 'GET') {
      const m = url.match(new RegExp(`/${ENTITY}/([^/?]+)`));
      const found = state.rows.find((r) => r.id === m?.[1]) ?? state.rows[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }

    route.fallback();
  });
}

const rowFor = (page, documentNo) =>
  page.locator('tbody tr').filter({ hasText: documentNo }).first();

test.describe(`Stale grid after a form action — ${SPEC}`, () => {
  let state;

  test.beforeEach(async ({ page }) => {
    state = createState();
    await login(page);
    await installMocks(page, state);
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('a document posted from the form must not leave a stale row in the grid', async ({ page }) => {
    // ── 1. The grid shows the row as not posted ────────────────────────────
    const targetRow = rowFor(page, TARGET_DOC_NO);
    const controlRow = rowFor(page, CONTROL_DOC_NO);

    await expect(targetRow).toBeVisible({ timeout: 15_000 });
    await expect(targetRow).toContainText(BADGE_NOT_POSTED);
    await expect(controlRow).toContainText(BADGE_POSTED);

    // Marker on the live document. Any hard navigation from here on wipes it —
    // and a wiped cache is a flow that can no longer reproduce the bug.
    await page.evaluate(() => { window.__etp5378DocumentAlive = true; });
    const listGetsBeforeAction = state.listGets;
    expect(listGetsBeforeAction).toBeGreaterThanOrEqual(1);

    // ── 2. Open the record from the GRID (client-side route change) ────────
    // NEVER page.goto here — see the docblock. A hard navigation drops the
    // in-memory cache and makes this spec pass against the bug it guards.
    await targetRow.hover();
    const editBtn = targetRow.getByTestId('row-quick-action-edit');
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    await expect(page).toHaveURL(new RegExp(`/${SPEC}/${TARGET_ID}`));
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });

    // ── 3. Post it from the "⋮" menu ───────────────────────────────────────
    const moreTrigger = page.getByTestId('action-more');
    await expect(moreTrigger).toBeVisible({ timeout: 10_000 });
    await moreTrigger.click();

    const postItem = page.getByTestId('menu-action-post');
    await expect(postItem).toBeVisible();

    const actionRequest = page.waitForRequest(
      (r) => r.method() === 'POST'
        && new RegExp(`/sws/neo/${SPEC}/${ENTITY}/${TARGET_ID}/action/post`).test(r.url()),
      { timeout: 10_000 },
    );
    await postItem.click();
    await actionRequest;

    // Success feedback (Sonner) — the action really completed before we leave.
    await expect(page.locator('[data-type="success"]').first()).toBeVisible({ timeout: 10_000 });
    expect(state.postActions).toBe(1);

    const listGetsBeforeReturn = state.listGets;

    // ── 4. Leave with Cancelar ─────────────────────────────────────────────
    // Cancelar only does navigate(`/${windowName}`) — it never refreshes
    // anything, which is exactly why the list cache has to have been
    // invalidated by the action itself.
    await page.getByTestId('action-cancel').click();
    await expect(page).toHaveURL(new RegExp(`/${SPEC}(\\?.*)?$`));

    // ── 5. The grid must show the new state, with NO manual refresh ────────
    const targetRowAfter = rowFor(page, TARGET_DOC_NO);
    await expect(targetRowAfter).toBeVisible({ timeout: 15_000 });
    await expect(targetRowAfter).toContainText(BADGE_POSTED, { timeout: 15_000 });
    await expect(targetRowAfter).not.toContainText(BADGE_NOT_POSTED);
    await expect(rowFor(page, CONTROL_DOC_NO)).toContainText(BADGE_POSTED);

    // The whole flow stayed inside one SPA document — so the cache the fix
    // invalidates was live the entire time and this really was a cache test.
    expect(await page.evaluate(() => window.__etp5378DocumentAlive)).toBe(true);

    // Second signal: the list was genuinely re-read from the network after the
    // action. Without the fix the cached page is served and this never grows.
    expect(state.listGets).toBeGreaterThan(listGetsBeforeReturn);
  });
});

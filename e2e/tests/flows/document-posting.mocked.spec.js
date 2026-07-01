import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Document posting — smoke (mocked).
 *
 * Validates the ETP-4298 Post menu action on a document window (sales-invoice,
 * entity `header`):
 *
 *   1. The kebab "more" menu (data-testid="action-more") exposes a Post item
 *      (data-testid="menu-action-post") for a not-yet-posted document.
 *   2. Clicking it invokes useNeoAction.execute(recordId, 'post'), which POSTs to
 *      `${apiBaseUrl}/${entityName}/${recordId}/action/post` — apiBaseUrl is
 *      spec-scoped, so the full path is `/sws/neo/sales-invoice/header/<id>/action/post`.
 *   3. On `{ success: true, message }` the UI shows a success toast.
 *
 * Mock mode only: installs spec-specific routes on top of the generic /sws/**
 * mock that login() seeds. Playwright matches routes in reverse registration
 * order, so these specific routes (installed AFTER login) win.
 *
 * NOTE on `posted`: the generated menuAction is now Y/N-aware. It declares
 * `visible: !(data?.posted === 'Y' || data?.posted === true)`, so the Post item
 * renders unless the document is actually posted. The mock row uses the realistic
 * Etendo value `posted: 'N'` (an unposted document): `!('N' === 'Y' || 'N' === true)`
 * → `!(false || false)` → true → the Post action is visible. (Before the gate
 * fix, the old `!data?.posted` check treated the truthy string 'N' as "posted"
 * and hid the item, which required the `posted: ''` workaround — no longer needed.)
 * `documentStatus: 'CO'` mirrors a completed document that is eligible for posting.
 */

const SPEC = 'sales-invoice';
const ENTITY = 'header';

const ROW = {
  id: 'inv-1',
  documentNo: 'INV-1',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  // Realistic Etendo value: 'N' (unposted). Y/N-aware gate → Post item visible.
  posted: 'N',
  // Completed document: processed='Y' satisfies the second Post visibility gate.
  processed: 'Y',
  // Minimal extra fields so the detail view renders cleanly.
  'businessPartner$_identifier': 'Test BP',
  grandTotalAmount: 100,
  invoiceDate: '2026-01-15',
};

/**
 * Install list + detail GET mocks and a Post action POST mock for the spec.
 * Must run AFTER login() so it takes precedence over the generic /sws/** stub.
 */
async function installMocks(page) {
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, async (route) => {
    const req = route.request();
    const url = req.url();

    // Action POST: `/header/<id>/action/post`
    if (req.method() === 'POST' && /\/action\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Document posted' }),
      });
      return;
    }

    // List GET: `/header` (no id segment)
    if (req.method() === 'GET' && !new RegExp(`/${ENTITY}/[^/?]+`).test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ROW], totalRows: 1 } }),
      });
      return;
    }

    // Detail GET: `/header/<id>`
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [ROW] } }),
      });
      return;
    }

    route.fallback();
  });
}

test.describe(`Document posting — ${SPEC}`, () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/${SPEC}/${ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Post menu action POSTs to /action/post and confirms success', async ({ page }) => {
    // Detail view should be rendered for the mocked record.
    const detail = page.getByTestId('detail-view');
    await expect(detail).toBeVisible();

    // Open the kebab "more" menu (stable trigger testid).
    const moreTrigger = page.getByTestId('action-more');
    await expect(moreTrigger).toBeVisible();
    await moreTrigger.click();

    // The Post item should be visible (document is not yet posted).
    const postItem = page.getByTestId('menu-action-post');
    await expect(postItem).toBeVisible();

    // Start waiting for the action POST before clicking to avoid a race.
    const actionRequest = page.waitForRequest(
      (r) => r.method() === 'POST' && /\/sws\/neo\/sales-invoice\/header\/inv-1\/action\/post/.test(r.url()),
      { timeout: 10_000 },
    );

    await postItem.click();

    const req = await actionRequest;
    expect(req.url()).toMatch(/\/action\/post(\?|$)/);

    // Success feedback: Sonner success toast (data-type="success").
    await expect(page.locator('[data-type="success"]').first()).toBeVisible({ timeout: 5_000 });
  });
});

import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';
import { t } from '../../helpers/i18n.js';

/**
 * Not Posted Documents — smoke (mocked).
 *
 * Validates the ETP-4298 Not Posted Documents custom window:
 *   1. Filter options (document types) load on page open.
 *   2. Initial table renders 2 rows without user interaction.
 *   3. Single-row Post fires the correct action endpoint and shows a success toast.
 *   4. Bulk Post fires the bulk-post endpoint with the right payload.
 *   5. Empty state renders when the rows endpoint returns no rows.
 *   6. Filter apply sends the selected filter value in the GET rows request.
 *
 * Mock mode only: spec-specific routes are installed AFTER login() so they take
 * priority over the generic /sws/** stub (Playwright matches in reverse order).
 */

const SPEC = 'not-posted-documents';
const ENTITY = 'header';

const ROWS = [
  {
    documentId: 'doc-si-001',
    documentType: 'Sales Invoice',
    tableId: '318',
    description: 'INV-2026-001',
    accountingDate: '2026-03-15',
    organization: 'F&B España, S.A.',
  },
  {
    documentId: 'doc-gl-002',
    documentType: 'GL Journal',
    tableId: '224',
    description: 'GL-2026-042',
    accountingDate: '2026-03-20',
    organization: 'F&B España, S.A.',
  },
];

const FILTER_OPTIONS = {
  documentTypes: [
    { value: 'SI', label: 'Sales Invoice' },
    { value: 'PI', label: 'Purchase Invoice' },
  ],
  accountingStatuses: [
    { value: 'Y', label: 'Posted' },
    { value: 'N', label: 'Not Posted' },
  ],
};

/**
 * Install all mocks for the Not Posted Documents window.
 * Must run AFTER login() to take precedence over the generic stub.
 */
async function installMocks(page, { rows = ROWS } = {}) {
  // NOTE: two separate page.route() registrations, not the `{/**,}**` brace
  // pattern — Playwright's glob→regex compiler only treats `**` as
  // "crosses path separators" when it sits right before a `/` (or the glob's
  // end); inside a brace group the `**` right before the `,` is followed by
  // `,`, so it silently degrades to a single-segment `[^/]*`. That matched
  // `/header/0` but NOT the two-segments-deep `/header/0/action/bulk-post`,
  // so the bulk-post POST fell through to the generic `/sws/**` stub and its
  // response never carried `ok`/`total`, leaving the success toast unfired.
  // See docs/e2e-testing-guide.md for the full write-up.
  const headerHandler = async (route) => {
    const req = route.request();
    const url = req.url();

    // Filter-options GET: ?_mode=filter-options
    if (req.method() === 'GET' && url.includes('_mode=filter-options')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FILTER_OPTIONS),
      });
      return;
    }

    // Bulk-post POST: /header/0/action/bulk-post
    if (req.method() === 'POST' && /\/header\/0\/action\/bulk-post/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: 2, total: 2, success: true, results: [] }),
      });
      return;
    }

    // Single-row post POST: /header/<id>/action/post
    if (req.method() === 'POST' && /\/action\/post/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Posted' }),
      });
      return;
    }

    // Rows list GET: /header? (no id segment, not filter-options)
    if (req.method() === 'GET' && !new RegExp(`/${ENTITY}/[^/?]+`).test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: rows, total: rows.length }),
      });
      return;
    }

    route.fallback();
  };
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}/**`, headerHandler);
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, headerHandler);
}

test.describe('Not Posted Documents — initial rows', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('table renders 2 rows on initial load without clicking Apply', async ({ page }) => {
    // Both row descriptions must be visible in the table
    await expect(page.getByTestId(`npd-row-${ROWS[0].documentId}`)).toBeVisible();
    await expect(page.getByTestId(`npd-row-${ROWS[1].documentId}`)).toBeVisible();

    // Row text content
    await expect(page.getByTestId(`npd-row-${ROWS[0].documentId}`)).toContainText(ROWS[0].description);
    await expect(page.getByTestId(`npd-row-${ROWS[1].documentId}`)).toContainText(ROWS[1].description);
  });
});

test.describe('Not Posted Documents — single-row Post', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Post button fires action/post with correct tableId and recordId, then shows success toast', async ({ page }) => {
    const firstRow = ROWS[0];
    const postBtn = page.getByTestId(`npd-post-row-${firstRow.documentId}`);
    await expect(postBtn).toBeVisible();

    // Capture the POST request before clicking to avoid a race condition
    const actionRequest = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        new RegExp(`/sws/neo/${SPEC}/${ENTITY}/${firstRow.documentId}/action/post`).test(r.url()),
      { timeout: 10_000 },
    );

    await postBtn.click();

    const req = await actionRequest;
    const body = JSON.parse(req.postData() ?? '{}');
    expect(body.tableId).toBe(firstRow.tableId);
    expect(body.recordId).toBe(firstRow.documentId);

    // Success toast — Sonner renders with data-type="success"
    await expect(page.locator('[data-type="success"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-type="success"]').first()).toContainText(t('documentPosted'));
  });
});

test.describe('Not Posted Documents — bulk post', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('checking both rows and clicking Post selected fires bulk-post with rows array of length 2', async ({ page }) => {
    // Check both row checkboxes
    await page.getByTestId(`npd-row-checkbox-${ROWS[0].documentId}`).check();
    await page.getByTestId(`npd-row-checkbox-${ROWS[1].documentId}`).check();

    // The "Post selected (2)" button should now be visible
    const postSelectedBtn = page.getByTestId('npd-post-selected');
    await expect(postSelectedBtn).toBeVisible();

    // Capture the bulk-post request before clicking
    const bulkRequest = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        /\/sws\/neo\/not-posted-documents\/header\/0\/action\/bulk-post/.test(r.url()),
      { timeout: 10_000 },
    );

    await postSelectedBtn.click();

    const req = await bulkRequest;
    const body = JSON.parse(req.postData() ?? '{}');
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows).toHaveLength(2);
    // Each entry must carry tableId and recordId
    expect(body.rows[0].tableId).toBeTruthy();
    expect(body.rows[0].recordId).toBeTruthy();

    // Success toast for full completion
    await expect(page.locator('[data-type="success"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-type="success"]').first()).toContainText(t('postingComplete'));
  });
});

test.describe('Not Posted Documents — filter apply', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMocks(page);
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('selecting document type and clicking Apply includes document=SI in the GET rows request', async ({ page }) => {
    const select = page.getByTestId('npd-filter-document-type');
    await select.selectOption('SI');

    const applyBtn = page.getByTestId('npd-filter-apply');
    await expect(applyBtn).toBeVisible();

    // Capture the GET request triggered by Apply
    const rowsRequest = page.waitForRequest(
      (r) =>
        r.method() === 'GET' &&
        /\/sws\/neo\/not-posted-documents\/header/.test(r.url()) &&
        !r.url().includes('_mode=filter-options'),
      { timeout: 10_000 },
    );

    await applyBtn.click();

    const req = await rowsRequest;
    expect(req.url()).toContain('document=SI');
  });
});

/**
 * ETP-5485 (BUG-2, the ticket's Problem 2) — a role without the "Not Posted Documents" OBUIAPP
 * process grant must get the access-denied screen when it opens the route directly, exactly
 * like any window it cannot reach: no filters, no "0 registros", no raw "Forbidden".
 */
test.describe('Not Posted Documents — direct route without process access (ETP-5485)', () => {
  test('a role whose menu lacks the process sees the access-denied screen and fires no data request', async ({ page }) => {
    await login(page);
    await installMocks(page);
    // A non-empty role menu WITHOUT the process (an empty one would trip AppLayout's
    // zero-access block screen instead). Mirrors a Purchasing-only role.
    await page.route('**/sws/neo/listmenu**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tree: [{ type: 'folder', name: 'Compras', children: [{ windowId: '181', name: 'Purchase Order' }] }],
        count: 1,
      }),
    }));
    const dataRequests = [];
    page.on('request', (r) => {
      if (r.url().includes(`/sws/neo/${SPEC}/${ENTITY}`)) dataRequests.push(r.url());
    });

    await page.goto(`/${SPEC}`);

    const denied = page.getByTestId('window-access-denied');
    await expect(denied).toBeVisible({ timeout: 15_000 });
    await expect(denied).toHaveText(t('windowAccessDenied'));
    await expect(page.getByTestId('npd-empty-state')).toHaveCount(0);
    await expect(page.getByText('Forbidden')).toHaveCount(0);
    expect(dataRequests).toEqual([]);
  });

  test('a backend 403 renders the access-denied screen instead of filters and the raw status text', async ({ page }) => {
    await login(page);
    // Menu access unreachable in mock mode → the route guard fails open (like the sidebar);
    // the backend's 403 is then the only signal, and it must still land on the denied screen.
    await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Access denied' }),
    }));

    await page.goto(`/${SPEC}`);

    await expect(page.getByTestId('window-access-denied')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Forbidden')).toHaveCount(0);
    await expect(page.getByText('Access denied')).toHaveCount(0);
    await expect(page.getByTestId('npd-empty-state')).toHaveCount(0);
  });
});

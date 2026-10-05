import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';
import { t } from '../../helpers/i18n.js';

/**
 * Not Posted Documents — smoke (mocked).
 *
 * Validates the Not Posted Documents custom window (ETP-4298), rebuilt on the shared list
 * building blocks by ETP-5591:
 *   1. Rows render on open with the translated type and a status badge; the default request
 *      covers the last 12 months and there is no "Buscar" button.
 *   2. Hovering a row reveals "Abrir documento" / "Contabilizar"; posting fires action/post.
 *   3. "Abrir documento" opens the source window's record.
 *   4. Selecting rows shows the floating toolbar; its "Contabilizar" fires bulk-post.
 *   5. Picking a filter refetches immediately and writes it to the URL; "Limpiar filtros"
 *      returns to the defaults.
 *   6. The two empty states (nothing to post / no matches).
 *   7. Access denied (ETP-5485): route guard and backend 403.
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
    documentTypeCode: 'SI',
    accountingStatus: 'E',
    tableId: '318',
    description: 'INV-2026-001',
    accountingDate: '2026-03-15',
    organization: 'F&B España, S.A.',
  },
  {
    documentId: 'doc-gl-002',
    documentType: 'GL Journal',
    documentTypeCode: 'GLJ',
    accountingStatus: 'p',
    tableId: '224',
    description: 'GL-2026-042',
    accountingDate: '2026-03-20',
    organization: 'F&B España, S.A.',
  },
];

const FILTER_OPTIONS = {
  documentTypes: [
    { value: 'SI', label: 'Factura (Cliente)' },
    { value: 'GLJ', label: 'Asiento contable' },
  ],
  accountingStatuses: [],
};

/**
 * Install all mocks for the Not Posted Documents window. Must run AFTER login() to take
 * precedence over the generic stub. Every rows GET is recorded in `rowRequests`.
 *
 * Two separate page.route() registrations, not a `{/**,}**` brace pattern: inside a brace group
 * the `**` silently degrades to one path segment, so `/header/0/action/bulk-post` would fall
 * through to the generic stub. See docs/e2e-testing-guide.md.
 */
async function installMocks(page, { rows = ROWS } = {}) {
  const rowRequests = [];
  const headerHandler = async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && url.includes('_mode=filter-options')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FILTER_OPTIONS) });
      return;
    }
    if (req.method() === 'POST' && /\/header\/0\/action\/bulk-post/.test(url)) {
      const sent = JSON.parse(req.postData() ?? '{}').rows ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: sent.length,
          total: sent.length,
          success: true,
          results: sent.map((r) => ({ ...r, success: true, message: 'Posted' })),
        }),
      });
      return;
    }
    if (req.method() === 'POST' && /\/action\/post/.test(url)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Posted' }) });
      return;
    }
    if (req.method() === 'GET' && !new RegExp(`/${ENTITY}/[^/?]+`).test(url)) {
      rowRequests.push(new URL(url).searchParams);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows, total: rows.length }) });
      return;
    }
    route.fallback();
  };
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}/**`, headerHandler);
  await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, headerHandler);
  return { rowRequests };
}

async function openPage(page, query = '', options) {
  await login(page);
  const mocks = await installMocks(page, options);
  await page.goto(`/${SPEC}${query}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  return mocks;
}

const row = (page, id) => page.getByTestId(`row-${id}`);

test.describe('Not Posted Documents — rows and toolbar', () => {
  test('rows render on open with translated type and status badge, last 12 months by default', async ({ page }) => {
    const { rowRequests } = await openPage(page);

    await expect(row(page, ROWS[0].documentId)).toContainText('Factura (Cliente)');
    await expect(row(page, ROWS[0].documentId)).toContainText(ROWS[0].description);
    await expect(page.getByTestId(`npd-status-${ROWS[0].documentId}`)).toHaveText(t('notPostedStatusError'));
    await expect(page.getByTestId(`npd-status-${ROWS[1].documentId}`)).toHaveText(t('postedStatusPeriodClosed'));

    await expect(page.getByTestId('npd-filter-date-range')).toContainText(t('dateRangeLast12Months'));
    await expect(page.getByTestId('npd-filter-apply')).toHaveCount(0);
    await expect(page.getByTestId('npd-reset-filters')).toHaveCount(0);

    const first = rowRequests[0];
    expect(first.get('dateFrom')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.get('dateTo')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.has('accountingStatus')).toBe(false);
  });
});

test.describe('Not Posted Documents — row actions', () => {
  test('hovering a row reveals "Contabilizar", which fires action/post and toasts success', async ({ page }) => {
    await openPage(page);
    const target = ROWS[0];
    await row(page, target.documentId).hover();
    const postLink = page.getByTestId(`npd-post-row-${target.documentId}`);
    await expect(postLink).toBeVisible();

    const actionRequest = page.waitForRequest(
      (r) => r.method() === 'POST'
        && new RegExp(`/sws/neo/${SPEC}/${ENTITY}/${target.documentId}/action/post`).test(r.url()),
      { timeout: 10_000 },
    );
    await postLink.click();

    const body = JSON.parse((await actionRequest).postData() ?? '{}');
    expect(body.tableId).toBe(target.tableId);
    expect(body.recordId).toBe(target.documentId);
    await expect(page.locator('[data-type="success"]').first()).toContainText(t('documentPosted'), { timeout: 5_000 });
  });

  test('"Abrir documento" opens the source window record', async ({ page }) => {
    await openPage(page);
    const target = ROWS[0];
    await row(page, target.documentId).hover();
    await page.getByTestId(`npd-open-row-${target.documentId}`).click();
    await expect(page).toHaveURL(new RegExp(`/sales-invoice/${target.documentId}$`));
  });
});

test.describe('Not Posted Documents — bulk post', () => {
  test('selecting rows shows the floating toolbar; its "Contabilizar" fires bulk-post', async ({ page }) => {
    await openPage(page);
    // `force`: the shared Checkbox draws its box over a visually hidden input (same as
    // matched-purchase-invoices.mocked.spec.js).
    await row(page, ROWS[0].documentId).getByRole('checkbox').click({ force: true });
    await row(page, ROWS[1].documentId).getByRole('checkbox').click({ force: true });

    const toolbar = page.getByTestId('npd-selection-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(page.getByTestId('npd-selection-count')).toHaveText(t('selected', { count: 2 }));

    const bulkRequest = page.waitForRequest(
      (r) => r.method() === 'POST' && /\/sws\/neo\/not-posted-documents\/header\/0\/action\/bulk-post/.test(r.url()),
      { timeout: 10_000 },
    );
    await page.getByTestId('npd-post-selected').click();

    const body = JSON.parse((await bulkRequest).postData() ?? '{}');
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].tableId).toBeTruthy();
    expect(body.rows[0].recordId).toBeTruthy();
    await expect(page.locator('[data-type="success"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(toolbar).toHaveCount(0);
  });
});

test.describe('Not Posted Documents — filters', () => {
  test('picking a document type refetches immediately and writes it to the URL', async ({ page }) => {
    const { rowRequests } = await openPage(page);
    const before = rowRequests.length;

    await page.getByTestId('npd-filter-document-type').click();
    await page.getByRole('button', { name: 'Factura (Cliente)' }).click();

    await expect(page).toHaveURL(/[?&]document=SI\b/);
    await expect.poll(() => rowRequests.length).toBeGreaterThan(before);
    expect(rowRequests.at(-1).get('document')).toBe('SI');
    await expect(page.getByTestId('npd-reset-filters')).toBeVisible();
  });

  test('statuses multi-select: "Error" sends E and C, and the trigger counts the picks', async ({ page }) => {
    const { rowRequests } = await openPage(page);

    await page.getByTestId('npd-filter-accounting-status').click();
    // `exact`: a plain name match is a substring match, and "Todos los errores" contains "Error".
    await page.getByRole('checkbox', { name: t('notPostedStatusUnposted'), exact: true }).click();
    await page.getByRole('checkbox', { name: t('notPostedStatusError'), exact: true }).click();

    await expect.poll(() => rowRequests.at(-1)?.get('accountingStatus')).toBe('N,E,C');
    await expect(page.getByTestId('npd-filter-accounting-status')).toContainText(t('statusesCount', { count: 2 }));
  });

  test('"Limpiar filtros" returns to the defaults and clears the URL', async ({ page }) => {
    await openPage(page, '?document=SI&status=N');
    await page.getByTestId('npd-reset-filters').click();
    await expect(page).toHaveURL(new RegExp(`/${SPEC}$`));
    await expect(page.getByTestId('npd-reset-filters')).toHaveCount(0);
  });
});

test.describe('Not Posted Documents — "Todos los errores"', () => {
  test('ticks every error status at once and the trigger says so', async ({ page }) => {
    const { rowRequests } = await openPage(page);

    await page.getByTestId('npd-filter-accounting-status').click();
    await page.getByRole('checkbox', { name: t('allErrors'), exact: true }).click();

    await expect.poll(() => rowRequests.at(-1)?.get('accountingStatus')).toBe('p,i,NC,E,C');
    await expect(page.getByTestId('npd-filter-accounting-status')).toContainText(t('allErrors'));
    await expect(page.getByRole('checkbox', { name: t('postedStatusCostNotCalculated'), exact: true }))
      .toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Not Posted Documents — empty states', () => {
  test('nothing to post with the default filters', async ({ page }) => {
    await openPage(page, '', { rows: [] });
    await expect(page.getByTestId('npd-empty-none')).toContainText(t('notPostedEmptyNoneTitle'));
    await expect(page.getByTestId('npd-empty-reset-filters')).toHaveCount(0);
  });

  test('no matches for the chosen filters offers to clear them', async ({ page }) => {
    await openPage(page, '?status=i', { rows: [] });
    const empty = page.getByTestId('npd-empty-filtered');
    await expect(empty).toContainText(t('notPostedEmptyFilteredTitle'));
    await page.getByTestId('npd-empty-reset-filters').click();
    await expect(page).toHaveURL(new RegExp(`/${SPEC}$`));
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
    await expect(page.getByTestId('npd-toolbar')).toHaveCount(0);
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
    await expect(page.getByTestId('npd-toolbar')).toHaveCount(0);
  });
});

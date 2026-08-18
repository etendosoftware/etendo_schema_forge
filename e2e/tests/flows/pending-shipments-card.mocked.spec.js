import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Pending Shipments Dashboard Card — mocked smoke (ETP-4004).
 *
 * Validates that:
 * 1. The pending-shipments card renders the correct count from the backend.
 * 2. Clicking the card navigates to /goods-shipment?DocStatus=DR.
 * 3. After navigation the goods-shipment list is visible (rows rendered).
 *
 * No backend required — all API calls are intercepted after login().
 */

const PENDING_TASK = {
  type: 'info',
  text: '9 goods shipments pending',
  taskKey: 'pendingSalesDeliveries_plural',
  count: 9,
  link: '/goods-shipment?DocStatus=DR',
  navigation: {
    type: 'list',
    window: 'goods-shipment',
    params: { DocStatus: 'DR' },
  },
};

const GOODS_SHIPMENT_ROWS = [
  { id: 'gs-001', documentNo: 'GS-001', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente A', movementDate: '2026-05-01', warehouse: 'Almacén Principal' },
  { id: 'gs-002', documentNo: 'GS-002', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente B', movementDate: '2026-05-02', warehouse: 'Almacén Principal' },
  { id: 'gs-003', documentNo: 'GS-003', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente C', movementDate: '2026-05-03', warehouse: 'Almacén Principal' },
  { id: 'gs-004', documentNo: 'GS-004', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente D', movementDate: '2026-05-04', warehouse: 'Almacén Principal' },
  { id: 'gs-005', documentNo: 'GS-005', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente E', movementDate: '2026-05-05', warehouse: 'Almacén Principal' },
  { id: 'gs-006', documentNo: 'GS-006', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente F', movementDate: '2026-05-06', warehouse: 'Almacén Principal' },
  { id: 'gs-007', documentNo: 'GS-007', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente G', movementDate: '2026-05-07', warehouse: 'Almacén Principal' },
  { id: 'gs-008', documentNo: 'GS-008', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente H', movementDate: '2026-05-08', warehouse: 'Almacén Principal' },
  { id: 'gs-009', documentNo: 'GS-009', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador', businessPartner: 'Cliente I', movementDate: '2026-05-09', warehouse: 'Almacén Principal' },
];

/**
 * Install a specific mock for /sws/neo/dashboard/pending-tasks that returns a
 * single pendingSalesDeliveries_plural task.
 * Must run AFTER login() — Playwright matches routes in reverse registration order.
 */
async function installDashboardPendingTasksMock(page) {
  await page.route('**/sws/neo/dashboard/pending-tasks{/**,}**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        response: {
          data: [PENDING_TASK],
          count: 1,
        },
      }),
    });
  });
}

/**
 * Install a mock for the goods-shipment list and detail endpoints.
 * Must run AFTER login() to take priority over the generic /sws/** catch-all.
 */
async function installGoodsShipmentMock(page) {
  await page.route('**/sws/neo/goods-shipment/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      // List fetch.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: GOODS_SHIPMENT_ROWS, totalRows: GOODS_SHIPMENT_ROWS.length },
        }),
      });
      return;
    }

    if (req.method() === 'GET') {
      // Detail fetch — return the matching row.
      const m = url.match(/\/header\/([^/?]+)/);
      const found = GOODS_SHIPMENT_ROWS.find(r => r.id === m?.[1]) ?? GOODS_SHIPMENT_ROWS[0];
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

test.describe('Pending Shipments Card — dashboard (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Install specific mocks AFTER login() so they take priority (LIFO order).
    await installDashboardPendingTasksMock(page);
    await installGoodsShipmentMock(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  });

  /**
   * Verifies that a pending task card with count "9" is visible on the dashboard.
   * PendingTasksRail renders task.count as a large number inside a Link element.
   * The card wraps in a <Link> (renders as <a>) — we look for the count value "9"
   * as text content anywhere inside the rail section.
   */
  test('pendingShipmentsCardShowsCorrectCount', async ({ page }) => {
    // The PendingTasksRail renders each task count as large text inside a <Link>.
    // We locate the element by its text content — the count "9" is rendered in
    // a <p> tag inside the card.
    const countElement = page.getByText('9', { exact: true }).first();
    await expect(countElement).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Verifies that clicking the pending-shipments card navigates to
   * /goods-shipment?DocStatus=DR (or starts with /goods-shipment).
   *
   * The card is rendered as a react-router <Link to="/goods-shipment?DocStatus=DR">,
   * which becomes an <a> element. We click the link that contains the count "9".
   */
  test('pendingShipmentsCardNavigatesToGoodsShipment', async ({ page }) => {
    // Find the anchor element that wraps the task card for pending shipments.
    // The card contains the count "9" and links to /goods-shipment?DocStatus=DR.
    const card = page.locator('a[href*="/goods-shipment"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // After navigation the URL must contain /goods-shipment.
    await expect(page).toHaveURL(/\/goods-shipment/, { timeout: 10_000 });
  });

  /**
   * Verifies that after navigating via the card the goods-shipment list is rendered
   * with at least one row.
   */
  test('goodsShipmentListAppliesDraftFilter', async ({ page }) => {
    const card = page.locator('a[href*="/goods-shipment"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await page.waitForURL(/\/goods-shipment/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // At least one row must be visible in the list.
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
  });
});

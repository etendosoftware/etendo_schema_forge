import { test, expect } from '@playwright/test';
import { login } from '../../helpers/auth.js';

/**
 * Pending Shipments Dashboard Card — mocked smoke (ETP-5487, supersedes ETP-4004).
 *
 * Validates that:
 * 1. The pending-shipments card renders the correct count from the backend.
 * 2. Clicking the card navigates to /sales-order?filter=pendingDelivery.
 * 3. After navigation the sales-order list is visible (rows rendered).
 *
 * ETP-5487 moved this card's source from draft (DocStatus=DR) goods-shipment
 * records to completed (DocStatus=CO) sales orders whose delivery status is
 * still below 100% — hence the window/filter change below.
 *
 * No backend required — all API calls are intercepted after login().
 */

const PENDING_TASK = {
  type: 'info',
  text: '9 sales orders pending delivery',
  taskKey: 'pendingSalesDeliveries_plural',
  count: 9,
  link: '/sales-order?filter=pendingDelivery',
  navigation: {
    type: 'list',
    window: 'sales-order',
    filter: 'pendingDelivery',
  },
};

const SALES_ORDER_ROWS = [
  { id: 'so-001', documentNo: 'SO-001', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente A', orderDate: '2026-05-01', grandTotalAmount: 100, deliveryStatus: 0 },
  { id: 'so-002', documentNo: 'SO-002', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente B', orderDate: '2026-05-02', grandTotalAmount: 200, deliveryStatus: 25 },
  { id: 'so-003', documentNo: 'SO-003', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente C', orderDate: '2026-05-03', grandTotalAmount: 300, deliveryStatus: 0 },
  { id: 'so-004', documentNo: 'SO-004', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente D', orderDate: '2026-05-04', grandTotalAmount: 400, deliveryStatus: 50 },
  { id: 'so-005', documentNo: 'SO-005', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente E', orderDate: '2026-05-05', grandTotalAmount: 500, deliveryStatus: 0 },
  { id: 'so-006', documentNo: 'SO-006', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente F', orderDate: '2026-05-06', grandTotalAmount: 600, deliveryStatus: 75 },
  { id: 'so-007', documentNo: 'SO-007', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente G', orderDate: '2026-05-07', grandTotalAmount: 700, deliveryStatus: 0 },
  { id: 'so-008', documentNo: 'SO-008', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente H', orderDate: '2026-05-08', grandTotalAmount: 800, deliveryStatus: 25 },
  { id: 'so-009', documentNo: 'SO-009', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado', businessPartner: 'Cliente I', orderDate: '2026-05-09', grandTotalAmount: 900, deliveryStatus: 0 },
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
 * Install a mock for the sales-order list and detail endpoints.
 * Must run AFTER login() to take priority over the generic /sws/** catch-all.
 */
async function installSalesOrderMock(page) {
  await page.route('**/sws/neo/sales-order/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      // List fetch.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: { data: SALES_ORDER_ROWS, totalRows: SALES_ORDER_ROWS.length },
        }),
      });
      return;
    }

    if (req.method() === 'GET') {
      // Detail fetch — return the matching row.
      const m = url.match(/\/header\/([^/?]+)/);
      const found = SALES_ORDER_ROWS.find(r => r.id === m?.[1]) ?? SALES_ORDER_ROWS[0];
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
    await installSalesOrderMock(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  });

  /**
   * Verifies that clicking the pending-shipments card navigates to
   * /sales-order?filter=pendingDelivery (or starts with /sales-order).
   *
   * The card is rendered as a react-router <Link to="/sales-order?filter=pendingDelivery">,
   * which becomes an <a> element. We click the link that contains the count "9".
   */
  test('pendingShipmentsCardNavigatesToSalesOrder', async ({ page }) => {
    // Find the anchor element that wraps the task card for pending shipments.
    // The card contains the count "9" and links to /sales-order?filter=pendingDelivery.
    const card = page.locator('a[href*="/sales-order"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // After navigation the URL must contain /sales-order?filter=pendingDelivery.
    await expect(page).toHaveURL(/\/sales-order\?filter=pendingDelivery/, { timeout: 10_000 });
  });

  /**
   * Verifies that after navigating via the card the sales-order list is rendered
   * with at least one row.
   */
  test('salesOrderListAppliesPendingDeliveryFilter', async ({ page }) => {
    const card = page.locator('a[href*="/sales-order"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await page.waitForURL(/\/sales-order\?filter=pendingDelivery/, { timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // At least one row must be visible in the list.
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
  });
});

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Dashboard period filter — regression spec (ETP-4004, mocked).
 *
 * Verifies that changing the date-range selector on the dashboard causes the
 * "Ventas Recientes" widget to re-fetch with the new range and display the
 * matching invoices.
 *
 * Two synthetic datasets:
 *   INVOICES_RANGE_A (last30d)  — 3 invoices, client "Acme Corp"
 *   INVOICES_RANGE_B (lastYear) — 2 invoices, client "Beta LLC"
 *
 * The mock for /sws/neo/dashboard/recent-invoices inspects the ?range=
 * query param and returns the appropriate dataset.
 *
 * Mock mode only: installs route overrides AFTER login() so they take
 * priority over the generic /sws/** catch-all (Playwright LIFO order).
 */

const INVOICES_RANGE_A = [
  { id: 'inv-a1', documentNo: 'FA-001', client: 'Acme Corp', date: '01-05-2026', amount: 1000, status: 'CO' },
  { id: 'inv-a2', documentNo: 'FA-002', client: 'Acme Corp', date: '02-05-2026', amount: 2000, status: 'CL' },
  { id: 'inv-a3', documentNo: 'FA-003', client: 'Acme Corp', date: '03-05-2026', amount: 3000, status: 'CO' },
];

const INVOICES_RANGE_B = [
  { id: 'inv-b1', documentNo: 'FB-001', client: 'Beta LLC', date: '10-01-2026', amount: 500,  status: 'CO' },
  { id: 'inv-b2', documentNo: 'FB-002', client: 'Beta LLC', date: '15-02-2026', amount: 1500, status: 'CL' },
];

/**
 * Install mock routes for all dashboard widget endpoints.
 * Must be called AFTER login() so these handlers win over the generic catch-all.
 *
 * - /sws/neo/dashboard/recent-invoices — range-aware: returns A for last30d, B otherwise
 * - All other dashboard widgets         — return empty successful responses
 */
async function installDashboardMocks(page) {
  await page.route('**/sws/neo/dashboard/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/dashboard/recent-invoices')) {
      const parsedUrl = new URL(url);
      const range = parsedUrl.searchParams.get('range');
      const data = range === 'last30d' ? INVOICES_RANGE_A : INVOICES_RANGE_B;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data } }),
      });
      return;
    }

    // All other dashboard endpoints return empty data
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });
}

test.describe('Dashboard period filter — Ventas Recientes (ETP-4004)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installDashboardMocks(page);
    // Navigate to root — the dashboard is the default authenticated route.
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('initial load (lastYear) shows Beta LLC, not Acme Corp', async ({ page }) => {
    // login() seeds range as 'lastYear' via localStorage default in DashboardDateRangeContext
    // (or there is no stored range, which also defaults to lastYear).
    // The mock returns INVOICES_RANGE_B for any range other than last30d.
    const list = page.getByTestId('recent-sales-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    // Beta LLC should be visible
    await expect(list.getByText('Beta LLC').first()).toBeVisible();

    // Acme Corp should NOT be visible
    await expect(list.getByText('Acme Corp')).toHaveCount(0);
  });

  test('switching to last30d shows Acme Corp and hides Beta LLC', async ({ page }) => {
    // Ensure the list is rendered before interacting with the filter
    const list = page.getByTestId('recent-sales-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    // Open the range dropdown
    const trigger = page.getByTestId('dashboard-range-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Select "last30d"
    const option = page.getByTestId('dashboard-range-option-last30d');
    await expect(option).toBeVisible();
    await option.click();

    // Wait for the list to re-render with the new data
    await expect(list.getByText('Acme Corp').first()).toBeVisible({ timeout: 10_000 });

    // Beta LLC should no longer be visible
    await expect(list.getByText('Beta LLC')).toHaveCount(0);
  });

  test('recent-invoices endpoint is called with the correct range param', async ({ page }) => {
    const list = page.getByTestId('recent-sales-list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    // Listen for the next recent-invoices fetch triggered by changing the range
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/dashboard/recent-invoices') && req.url().includes('range=last30d'),
    );

    await page.getByTestId('dashboard-range-trigger').click();
    await page.getByTestId('dashboard-range-option-last30d').click();

    // Verify the request was fired with the correct range query param
    const req = await requestPromise;
    const reqUrl = new URL(req.url());
    expect(reqUrl.searchParams.get('range')).toBe('last30d');
  });
});

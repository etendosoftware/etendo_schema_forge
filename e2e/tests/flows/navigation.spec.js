import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Navigation flow tests.
 * Selectors discovered via agent-browser on 2026-03-18.
 */

test.describe('Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard loads after login', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
  });

  test('dashboard shows quick-action links', async ({ page }) => {
    await expect(page.getByTestId('quick-action-sales-order-new')).toBeVisible();
    await expect(page.getByTestId('quick-action-sales-invoice-new')).toBeVisible();
    await expect(page.getByTestId('quick-action-contacts-new')).toBeVisible();
  });

  test('quick-action link navigates to window', async ({ page }) => {
    await page.getByTestId('quick-action-sales-order-new').click();
    await expect(page).toHaveURL(/sales-order\/new/, { timeout: 5_000 });
    await expect(page.getByTestId('detail-view')).toBeVisible();
  });

  test('browser back/forward works', async ({ page }) => {
    // Dashboard -> sales-order -> back -> forward
    await page.getByTestId('quick-action-sales-order-new').click();
    await expect(page).toHaveURL(/sales-order\/new/);

    await page.goBack();
    await expect(page).toHaveURL(/dashboard/);

    await page.goForward();
    await expect(page).toHaveURL(/sales-order\/new/);
  });
});

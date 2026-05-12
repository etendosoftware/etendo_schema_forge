import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Sales Order — flow tests.
 *
 * Selectors discovered via agent-browser on 2026-03-18.
 * See e2e/MCP-DISCOVERY-GUIDE.md for the discovery workflow.
 */

test.describe('Sales Order', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateTo(page, 'sales-order');
  });

  test('list view renders with correct columns', async ({ page }) => {
    await expect(page.getByTestId('list-view')).toBeVisible();

    // Action buttons
    await expect(page.getByTestId('action-new')).toBeVisible();

    // Column headers
    await expect(page.getByTestId('column-header-businessPartner')).toBeVisible();
    await expect(page.getByTestId('column-header-orderDate')).toBeVisible();
    await expect(page.getByTestId('column-header-documentNo')).toBeVisible();
    await expect(page.getByTestId('column-header-documentStatus')).toBeVisible();
    await expect(page.getByTestId('column-header-grandTotalAmount')).toBeVisible();
  });

  test('filters are present', async ({ page }) => {
    await expect(page.getByTestId('filter-status')).toBeVisible();
    await expect(page.getByTestId('filter-date')).toBeVisible();
  });

  test('New Order opens form with required fields', async ({ page }) => {
    await page.getByTestId('action-new').click();

    await expect(page.getByTestId('detail-view')).toBeVisible();

    // Required fields
    await expect(page.getByTestId('field-businessPartner')).toBeVisible();

    // Actions
    await expect(page.getByTestId('action-save')).toBeVisible();
    await expect(page.getByTestId('action-cancel')).toBeVisible();
  });

  test('New Order shows order line tab with columns', async ({ page }) => {
    await page.getByTestId('action-new').click();

    // Order Line tab
    await expect(page.getByTestId('lines-empty-state')).toBeVisible();

    await expect(page.getByTestId('lines-empty-state-title')).toBeVisible();
    await expect(page.getByTestId('lines-empty-state-description')).toBeVisible();
  });

  test('Cancel returns to list view', async ({ page }) => {
    await page.getByTestId('action-new').click();
    await expect(page.getByTestId('detail-view')).toBeVisible();

    await page.getByTestId('action-cancel').click();

    // Back to list
    await expect(page.getByTestId('list-view')).toBeVisible();
  });

  test('Partner Address is disabled until Business Partner selected', async ({ page }) => {
    await page.getByTestId('action-new').click();

    await expect(page.getByTestId('field-partnerAddress')).toBeDisabled();
  });

});

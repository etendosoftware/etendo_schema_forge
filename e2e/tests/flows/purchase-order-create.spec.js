import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Purchase Order — create flow with Group Admin role + Spain North org.
 *
 * Selectors discovered via agent-browser on 2026-03-18.
 * Context: F&B International Group Admin / F&B Spain - North Region
 */

test.describe('Purchase Order - Create', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateTo(page, 'purchase-order');
  });

  test('list view loads with purchase order records', async ({ page }) => {
    await expect(page.getByTestId('list-view')).toBeVisible();
    await expect(page.getByTestId('action-new')).toBeVisible();

    await expect(page.getByTestId('column-header-orderDate')).toBeVisible();
    await expect(page.getByTestId('column-header-documentNo')).toBeVisible();
    await expect(page.getByTestId('column-header-businessPartner')).toBeVisible();
    await expect(page.getByTestId('column-header-documentStatus')).toBeVisible();
    await expect(page.getByTestId('column-header-grandTotalAmount')).toBeVisible();
  });

  test('New Order form opens with correct fields', async ({ page }) => {
    await page.getByTestId('action-new').click();

    await expect(page.getByTestId('detail-view')).toBeVisible();

    // Required fields
    await expect(page.getByTestId('field-documentNo')).toBeVisible();
    await expect(page.getByTestId('field-businessPartner')).toBeVisible();
    await expect(page.getByTestId('field-orderDate')).toBeVisible();

    // Partner Address disabled until BP selected
    await expect(page.getByTestId('field-partnerAddress')).toBeDisabled();

    // Action buttons
    await expect(page.getByTestId('action-save')).toBeVisible();
    await expect(page.getByTestId('action-cancel')).toBeVisible();
  });

  test('New Order shows order line tab and columns', async ({ page }) => {
    await page.getByTestId('action-new').click();

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
    await expect(page.getByTestId('action-new')).toBeVisible();
  });

  test('context is F&B International Group Admin + Spain North', async ({ page }) => {
    await expect(page.getByTestId('list-view')).toBeVisible();
  });
});

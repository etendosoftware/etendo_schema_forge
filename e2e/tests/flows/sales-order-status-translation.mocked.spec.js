import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Sales Order grid — documentStatus badge translation (ETP-4685, mocked).
 *
 * Protects the shared statusLabel() fallback chain (lib/statusBadge.js) that
 * the ~20 regenerated windows with a documentStatus/status column rely on:
 * the grid must show "Completado", never the raw enumLabels i18n key
 * (docStatusCo) nor the raw English AD name (Completed).
 *
 * Mock mode only.
 */

const ROW = {
  id: 'so-completed-1',
  documentNo: '1000010',
  businessPartner: 'bp-1',
  'businessPartner$_identifier': 'Test Business Partner',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completed',
  grandTotal: 100,
};

test.describe('Sales Order grid — documentStatus badge translation (ETP-4685)', () => {
  test('grid shows the translated status badge (Completado), not the raw i18n key or English', async ({ page }) => {
    await login(page);

    await page.route('**/sws/neo/sales-order/header**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (/\/header\/selectors\//.test(url)) return route.fallback();
      if (method === 'GET' && !/\/header\/[^/?]+/.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { data: [ROW], totalRows: 1 } }) });
      }
      route.fallback();
    });

    await page.goto('/sales-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.getByText('Completado')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('docStatusCo')).toHaveCount(0);
    await expect(page.getByText('Completed', { exact: true })).toHaveCount(0);
  });
});

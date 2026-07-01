import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Purchase Invoice — Type Filter (subset pills)  ETP-4036
 *
 * Validates the three-tab subset filter on the purchase-invoice list:
 *   "Todos" (all) / "Facturas" (AP Invoice) / "Notas de crédito" (AP CreditMemo)
 *
 * Mock mode only — no backend required.
 * The subset filter buttons are identified via data-testid="filter-{label.toLowerCase()}"
 * (convention standardised in ETP-4208, originally added in ETP-4036).
 */

const AP_INVOICE_ROWS = [
  {
    id: 'inv-001',
    orderReference: 'FAC-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'transactionDocument$_identifier': 'AP Invoice',
    'businessPartner$_identifier': 'Vendor A',
    grandTotalAmount: 1000,
    invoiceDate: '2026-01-10',
  },
  {
    id: 'inv-002',
    orderReference: 'FAC-002',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'transactionDocument$_identifier': 'AP Invoice',
    'businessPartner$_identifier': 'Vendor B',
    grandTotalAmount: 2000,
    invoiceDate: '2026-01-15',
  },
];

const AP_CREDITMEMO_ROWS = [
  {
    id: 'cn-001',
    orderReference: 'NC-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'transactionDocument$_identifier': 'AP CreditMemo',
    'businessPartner$_identifier': 'Vendor A',
    grandTotalAmount: 500,
    invoiceDate: '2026-02-01',
  },
];

const ALL_ROWS = [...AP_INVOICE_ROWS, ...AP_CREDITMEMO_ROWS];

async function installListMock(page) {
  await page.route('**/sws/neo/purchase-invoice/header**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      // List fetch — return all rows; client-side rowFilter handles tab filtering
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: ALL_ROWS, totalRows: ALL_ROWS.length } }),
      });
      return;
    }

    if (req.method() === 'GET') {
      // Detail fetch
      const m = url.match(/\/header\/([^/?]+)/);
      const found = ALL_ROWS.find(r => r.id === m?.[1]) ?? ALL_ROWS[0];
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

test.describe('Purchase Invoice — subset filter tabs (ETP-4036)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page);
    await page.goto('/purchase-invoice');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  /**
   * Comprehensive flow: verify all three tabs render, each tab filters correctly,
   * and "Todos" restores the full set. One test to avoid browser startup overhead × N.
   */
  test('all three tabs present, each filters rows correctly, Todos restores all', async ({ page }) => {
    const listView = page.getByTestId('list-view');
    await expect(listView).toBeVisible();

    // ── Verify the three subset filter buttons are rendered ──────────────────
    const allTab = page.getByTestId('filter-all');
    const invoicesTab = page.getByTestId('filter-invoicestab');
    const creditNotesTab = page.getByTestId('filter-creditnotestab');

    await expect(allTab).toBeVisible();
    await expect(invoicesTab).toBeVisible();
    await expect(creditNotesTab).toBeVisible();

    // ── "Todos" is active by default: all 3 rows are visible ─────────────────
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-001' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-002' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'NC-001' })).toBeVisible();

    // ── Click "Facturas": only AP Invoice rows remain ─────────────────────────
    await invoicesTab.click();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-001' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-002' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'NC-001' })).toHaveCount(0);

    // ── Click "Notas de crédito": only AP CreditMemo rows remain ─────────────
    await creditNotesTab.click();
    await expect(page.locator('tbody tr').filter({ hasText: 'NC-001' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-001' })).toHaveCount(0);
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-002' })).toHaveCount(0);

    // ── Click "Todos": all rows return ────────────────────────────────────────
    await allTab.click();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-001' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-002' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'NC-001' })).toBeVisible();
  });
});

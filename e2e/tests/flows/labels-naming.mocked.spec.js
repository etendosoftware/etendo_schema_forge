import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Labels & naming — mocked smoke (ETP-4017).
 *
 * Validates the three label/naming fixes:
 *   JB-06  accounting report titles (es_ES)
 *   JO-06  "Cuenta contable de gastos" for vendor block in contacts
 *   IV-08  "Fecha de presupuesto" for sales-quotation DateOrdered
 *
 * Mock mode only. login() seeds a fake token + generic /sws/** mock; this
 * spec installs more specific routes AFTER login() so they win (Playwright
 * matches routes in reverse registration order). Default app locale is
 * es_ES (see useLocaleState.DEFAULT_LOCALE), so we assert the Spanish copy.
 */

// ─── JB-06 — Accounting reports (es_ES titles) ──────────────────────────────

const REPORT_MANIFEST = [
  {
    id: 'balance-sheet',
    category: 'finance',
    type: 'listing',
    orientation: 'portrait',
    outputs: ['pdf', 'xlsx'],
    title: { en_US: 'Balance Sheet', es_ES: 'Balance de Situación' },
  },
  {
    id: 'report-journal-entries',
    category: 'finance',
    type: 'grouped-listing',
    orientation: 'landscape',
    outputs: ['pdf', 'xlsx'],
    title: { en_US: 'Journal Entries', es_ES: 'Diario de Asientos' },
  },
  {
    id: 'report-trial-balance',
    category: 'finance',
    type: 'listing',
    orientation: 'landscape',
    outputs: ['pdf', 'xlsx'],
    title: { en_US: 'Trial Balance', es_ES: 'Balance de Sumas y Saldos' },
  },
];

async function installReportMocks(page) {
  await page.route('**/api/reports', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(REPORT_MANIFEST),
    });
  });

  // Avoid actually rendering each report (no jsreport in CI). Return an
  // empty preview HTML so the iframe path resolves cleanly.
  await page.route('**/api/reports/*/render', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><!-- 0 records --></body></html>',
    });
  });
}

test.describe('JB-06 — accounting reports use the new Spanish names', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installReportMocks(page);
    await page.goto('/report-viewer');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('catalog shows the three reports with their new es_ES titles', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Balance de Situación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Diario de Asientos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Balance de Sumas y Saldos' })).toBeVisible();

    // Regression guards — the legacy Spanish labels must not appear.
    await expect(page.getByText('Balance General', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Asientos Contables', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Balance de Comprobación', { exact: true })).toHaveCount(0);
  });

  test('selecting a report keeps the new es_ES title in the viewer header', async ({ page }) => {
    await page.getByRole('button').filter({ hasText: 'Balance de Situación' }).first().click();
    await page.waitForURL(/report=balance-sheet/, { timeout: 5_000 }).catch(() => {});
    // The ReportViewer sets the page meta title via useSetPageMeta; assert the
    // title text appears at least once in the viewer chrome.
    await expect(page.getByText('Balance de Situación').first()).toBeVisible();
  });
});

// ─── JO-06 — Vendor account label in contacts ───────────────────────────────

const CONTACT_RECORD = {
  id: 'bp-jo06',
  searchKey: 'JO06',
  name: 'Vendor & Customer Test',
  customer: true,
  vendor: true,
};

async function installContactsMock(page) {
  await page.route('**/sws/neo/contacts/businessPartner{/**,}**', (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && /\/businessPartner\/[^/?]+/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [CONTACT_RECORD] } }),
      });
    }
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [CONTACT_RECORD], totalRows: 1 } }),
      });
    }
    return route.fallback();
  });
}

test.describe('JO-06 — contacts vendor account label', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installContactsMock(page);
    await page.goto(`/contacts/${CONTACT_RECORD.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Financial tab shows "Cuenta contable de gastos" for the vendor block', async ({ page }) => {
    const financialTab = page.getByRole('button', { name: 'Financiero', exact: true });
    await expect(financialTab).toBeVisible();
    await financialTab.click();
    // The vendor field renders inside the EntityForm with key "pOFinancialAccount".
    // ETP-4600 unified this FK field onto CreatableSearchSelect, whose wrapper div
    // carries no `field-<key>` testid — only the sibling <Label htmlFor={f.key}>
    // (rendered by EntityForm itself) surfaces the field's LABEL text; the chip
    // (`field-pOFinancialAccount-chip`) or combobox input show the VALUE, not the
    // label. Assert against the label element directly, same pattern as IV-08 below.
    const vendorLabel = page.locator('label[for="pOFinancialAccount"]');
    await expect(vendorLabel).toBeVisible();
    await expect(vendorLabel).toContainText('Cuenta contable de gastos');

    // Customer block should still read "Cuenta" (not "Account" — locale es_ES).
    const customerLabel = page.locator('label[for="account"]');
    await expect(customerLabel).toBeVisible();
    await expect(customerLabel).toContainText('Cuenta');
    // And specifically not the new vendor label, to guard against a copy/paste
    // of the override into the customer block.
    await expect(customerLabel).not.toContainText('Cuenta contable de gastos');
  });
});

// ─── IV-08 — Sales-quotation order-date label ───────────────────────────────

const QUOTATION_ROW = {
  id: 'quo-iv08',
  documentNo: 'PV-001',
  documentStatus: 'DR',
  'businessPartner$_identifier': 'Test BP',
  orderDate: '2026-01-15',
  grandTotalAmount: 100,
};

async function installQuotationMock(page) {
  await page.route('**/sws/neo/sales-quotation/quotation{/**,}**', (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && /\/quotation\/[^/?]+/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [QUOTATION_ROW] } }),
      });
    }
    if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [QUOTATION_ROW], totalRows: 1 } }),
      });
    }
    return route.fallback();
  });
}

test.describe('IV-08 — sales-quotation order-date label', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installQuotationMock(page);
  });

  test('list column header reads "Fecha de presupuesto"', async ({ page }) => {
    await page.goto('/sales-quotation');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const header = page.getByTestId('column-header-orderDate');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Fecha de presupuesto');
    // Regression guards: the legacy local override and the unspecific AD label
    // must not surface in the column header.
    await expect(header).not.toContainText('Fecha cotización');
    await expect(header).not.toContainText('Fecha de pedido');
  });

  test('detail form field label reads "Fecha de presupuesto"', async ({ page }) => {
    await page.goto(`/sales-quotation/${QUOTATION_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The testid is on the <input>, which has no text content (only `value`).
    // The visible label is rendered as a sibling <label for="orderDate"> — query it directly.
    const dateField = page.getByTestId('field-orderDate');
    await expect(dateField).toBeVisible();

    const dateLabel = page.locator('label[for="orderDate"]');
    await expect(dateLabel).toContainText('Fecha de presupuesto');
    await expect(dateLabel).not.toContainText('Fecha cotización');
  });
});

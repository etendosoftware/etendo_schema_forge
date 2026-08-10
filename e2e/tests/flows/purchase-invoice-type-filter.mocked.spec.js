import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Purchase Invoice — Type Filter (subset pills)  ETP-4036 / ETP-4737
 *
 * Validates the three-tab subset filter on the purchase-invoice list, per the
 * CURRENT `subsetFilters` config in artifacts/purchase-invoice/decisions.json:
 *   "allTab" (Todos) / "invoicesTab" (Facturas — documentCategory=API AND NOT
 *   rectificativa) / "rectificativeInvoicesTab" (Facturas rectificativas —
 *   etsgIsRectificative=true OR documentCategory=APC).
 *
 * Mock mode only — no backend required.
 * The subset filter buttons are identified via data-testid="filter-{label.toLowerCase()}"
 * (convention standardised in ETP-4208, originally added in ETP-4036).
 *
 * The mocked list-GET route parses and honors the `criteria` query param
 * (equals / notEqual, plus the AdvancedCriteria OR the "rectificativa" tab
 * emits) so tab narrowing can be asserted against real rendered rows, not
 * just the outgoing request shape — see product-advanced-filter.mocked.spec.js
 * for the same pattern.
 */

const AP_INVOICE_ROWS = [
  {
    id: 'inv-001',
    orderReference: 'FAC-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'transactionDocument$_identifier': 'AP Invoice',
    'transactionDocument$documentCategory': 'API',
    'transactionDocument$etsgIsRectificative': false,
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
    'transactionDocument$documentCategory': 'API',
    'transactionDocument$etsgIsRectificative': false,
    'businessPartner$_identifier': 'Vendor B',
    grandTotalAmount: 2000,
    invoiceDate: '2026-01-15',
  },
];

const AP_RECTIFICATIVE_ROWS = [
  {
    id: 'cn-001',
    orderReference: 'NC-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    'transactionDocument$_identifier': 'AP CreditMemo',
    'transactionDocument$documentCategory': 'APC',
    'transactionDocument$etsgIsRectificative': true,
    'businessPartner$_identifier': 'Vendor A',
    grandTotalAmount: 500,
    invoiceDate: '2026-02-01',
  },
];

const ALL_ROWS = [...AP_INVOICE_ROWS, ...AP_RECTIFICATIVE_ROWS];

/**
 * Minimal server-side criteria evaluator for the mocked list GET — only
 * supports what THIS spec's subsetFilters actually emit (equals / notEqual,
 * plus the AdvancedCriteria OR wrapper the "rectificativa" tab uses).
 */
function rowMatchesCriteriaNode(row, node) {
  if (!node) return true;
  if (node._constructor === 'AdvancedCriteria') {
    const combinator = node.operator === 'or' ? 'some' : 'every';
    return (node.criteria || [])[combinator]((c) => rowMatchesCriteriaNode(row, c));
  }
  const { fieldName, operator, value } = node;
  const raw = row[fieldName];
  const matches = typeof value === 'boolean'
    ? Boolean(raw) === value
    : String(raw ?? '') === String(value ?? '');
  if (operator === 'notEqual') return !matches;
  // equals (and anything else this spec doesn't emit) falls through as equals.
  return matches;
}

function filterRowsByCriteria(rows, criteriaRaw) {
  if (!criteriaRaw) return rows;
  let criteria;
  try {
    criteria = JSON.parse(criteriaRaw);
  } catch {
    return rows;
  }
  if (!Array.isArray(criteria)) criteria = [criteria];
  return rows.filter((r) => criteria.every((node) => rowMatchesCriteriaNode(r, node)));
}

async function installListMock(page) {
  await page.route('**/sws/neo/purchase-invoice/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();

    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      // List fetch — apply the same criteria the real backend would honor,
      // so clicking a subset filter tab actually narrows the mocked rows.
      const parsed = new URL(url);
      const rows = filterRowsByCriteria(ALL_ROWS, parsed.searchParams.get('criteria'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
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
    const allTab = page.getByTestId('filter-alltab');
    const invoicesTab = page.getByTestId('filter-invoicestab');
    const rectificativeInvoicesTab = page.getByTestId('filter-rectificativeinvoicestab');

    await expect(allTab).toBeVisible();
    await expect(invoicesTab).toBeVisible();
    await expect(rectificativeInvoicesTab).toBeVisible();

    // ── "Todos" is active by default: all 3 rows are visible ─────────────────
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-001' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-002' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'NC-001' })).toBeVisible();

    // ── Click "Facturas": only AP Invoice rows remain ─────────────────────────
    await invoicesTab.click();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-001' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'FAC-002' })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'NC-001' })).toHaveCount(0);

    // ── Click "Facturas rectificativas": only rectificativa rows remain ──────
    await rectificativeInvoicesTab.click();
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

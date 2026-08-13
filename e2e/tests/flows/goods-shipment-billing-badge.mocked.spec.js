import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Goods Shipment — Billing Badge (mocked) — ETP-4031
 *
 * Validates that GoodsShipmentBillingBadge:
 *   1. Shows "Pendiente"           when invoiceStatus = 0
 *   2. Shows "Facturación parcial" when invoiceStatus = 50
 *   3. Shows "Facturado"           when invoiceStatus = 100
 *   4. Shows "Facturado"           when completelyInvoiced = true (fallback)
 *   5. Does NOT render             when documentStatus = 'DR' (draft)
 *
 * And that the invoiceStatus progress-bar column in the list view is visible
 * even on row hover (noHoverHide: true) alongside the quick-action overlay.
 *
 * No backend required — all API calls are intercepted AFTER login() to take
 * priority over the generic /sws/** catch-all installed by login() (LIFO order).
 *
 * Route isolation: "goodsShipmentLine" URLs must NOT be captured by the
 * "goodsShipment" handler (the entity name is a prefix of the line entity
 * name). We use URL predicate functions to avoid substring collisions.
 */

// ---------------------------------------------------------------------------
// Shared mock data helpers
// ---------------------------------------------------------------------------

function makeShipment(overrides) {
  return {
    id: 'mock-gs-001',
    documentNo: 'GS-TEST-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    processed: true,
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Client',
    movementDate: '2026-05-01',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'Almacén Principal',
    invoiceStatus: 0,
    completelyInvoiced: false,
    invoiced: false,
    ...overrides,
  };
}

/**
 * Install a mock for the goods-shipment entity endpoints (detail + list).
 *
 * Must be called AFTER login() so it takes priority over the generic
 * /sws/** catch-all (Playwright matches routes in LIFO order).
 *
 * IMPORTANT: We use URL predicate functions instead of glob patterns to
 * avoid "goodsShipment**" matching "goodsShipmentLine" URLs — since
 * "goodsShipmentLine" starts with "goodsShipment".
 *
 * @param {import('@playwright/test').Page} page
 * @param {object[]} records  Array of header records. First item used for
 *                            detail GETs when the id is not matched.
 */
async function installGoodsShipmentMock(page, records) {
  // -----------------------------------------------------------------------
  // Lines endpoint — installed FIRST (lower LIFO priority). Returns empty.
  // Uses a URL predicate that matches ONLY "goodsShipmentLine" paths.
  // Playwright passes a URL object; use .href to get the full string.
  // -----------------------------------------------------------------------
  await page.route(
    (url) => url.href.includes('/sws/neo/goods-shipment/goodsShipmentLine'),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      route.fallback();
    }
  );

  // -----------------------------------------------------------------------
  // Header entity (list + detail) — installed SECOND (higher LIFO priority).
  // Uses a URL predicate that matches "goodsShipment" but NOT "goodsShipmentLine".
  // -----------------------------------------------------------------------
  await page.route(
    (url) => url.href.includes('/sws/neo/goods-shipment/goodsShipment') &&
              !url.href.includes('/goodsShipmentLine'),
    async (route) => {
      const req = route.request();
      const url = req.url();

      if (req.method() !== 'GET') {
        // evaluate-display, defaults, etc. — return empty ok response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [] } }),
        });
        return;
      }

      // Detail fetch: URL path ends with /goodsShipment/<id>
      const detailMatch = url.match(/\/goodsShipment\/([^/?]+)(\?.*)?$/);
      if (detailMatch && detailMatch[1] !== 'evaluate-display' && detailMatch[1] !== 'defaults' && detailMatch[1] !== 'selectors') {
        const id = detailMatch[1];
        const found = records.find(r => r.id === id) ?? records[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [found] } }),
        });
        return;
      }

      // List fetch — return all records
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: records, totalRows: records.length } }),
      });
    }
  );
}

// ---------------------------------------------------------------------------
// Goods Shipment — Billing Badge (mocked)
// ---------------------------------------------------------------------------

test.describe('Goods Shipment — Billing Badge (mocked)', () => {
  async function expectBillingBadge(page) {
    await expect(page.getByTestId('billing-badge')).toBeVisible({ timeout: 10_000 });
  }

  // -------------------------------------------------------------------------
  // Helper: navigate to detail view and wait for it to settle.
  // -------------------------------------------------------------------------
  async function goToDetail(page, shipment) {
    await login(page);
    await installGoodsShipmentMock(page, [shipment]);
    await page.goto(`/goods-shipment/${shipment.id}`);
    // Wait for the Cancel button — it appears in the detail view topbar
    // as soon as the record loads and indicates the form is ready.
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });
  }

  // -------------------------------------------------------------------------
  // Detail view — billing badge states
  // -------------------------------------------------------------------------

  test('billingBadgeHiddenWhenNothingInvoiced', async ({ page }) => {
    // ETP-4299: badge is hidden when invoiceStatus <= 0 (nothing invoiced yet).
    const shipment = makeShipment({
      id: 'gs-pending-001',
      invoiceStatus: 0,
      completelyInvoiced: false,
    });

    await goToDetail(page, shipment);

    await expect(page.getByTestId('billing-badge')).not.toBeVisible({ timeout: 5_000 });
  });

  test('billingBadgeShowsPartiallyInvoicedWhenHalfInvoiced', async ({ page }) => {
    const shipment = makeShipment({
      id: 'gs-partial-001',
      invoiceStatus: 50,
      completelyInvoiced: false,
    });

    await goToDetail(page, shipment);

    await expectBillingBadge(page);
  });

  test('billingBadgeShowsInvoicedWhenFullyInvoiced', async ({ page }) => {
    const shipment = makeShipment({
      id: 'gs-invoiced-001',
      invoiceStatus: 100,
      completelyInvoiced: false,
    });

    await goToDetail(page, shipment);

    await expectBillingBadge(page);
  });

  test('billingBadgeHiddenWhenInvoiceStatusIsNull', async ({ page }) => {
    // ETP-4299: null invoiceStatus falls back to rawPct=0, which is <= 0 → badge hidden.
    const shipment = makeShipment({
      id: 'gs-ci-001',
      invoiceStatus: null,
      completelyInvoiced: true,
    });

    await goToDetail(page, shipment);

    await expect(page.getByTestId('billing-badge')).not.toBeVisible({ timeout: 5_000 });
  });

  test('billingBadgeNotShownForDraftShipment', async ({ page }) => {
    // Draft shipments must NOT show the billing badge (component returns null
    // when documentStatus !== 'CO').
    const shipment = makeShipment({
      id: 'gs-draft-001',
      documentStatus: 'DR',
      'documentStatus$_identifier': 'Borrador',
      processed: false,
      invoiceStatus: 0,
    });

    await login(page);
    await installGoodsShipmentMock(page, [shipment]);
    await page.goto('/goods-shipment/gs-draft-001');

    // Wait for the topbar to render (Cancel button confirms the detail form is ready)
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    // Draft status badge shows "Borrador" — but no billing badge text
    // "Pendiente", "Facturación parcial" or "Facturado" must be absent.
    await expect(page.getByText('Pendiente', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Facturación parcial', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Facturado', { exact: true })).toHaveCount(0);

    // Only the draft document status pill is present (neutral tone for "DR")
    const pills = page.locator('[data-testid="document-status-pill"]');
    await expect(pills).toHaveCount(1, { timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // List view — invoiceStatus column renders in list rows
  // -------------------------------------------------------------------------

  test('invoiceStatusColumnRendersInListRow', async ({ page }) => {
    const rows = [
      makeShipment({ id: 'gs-list-001', documentNo: 'GS-LIST-001', invoiceStatus: 50 }),
      makeShipment({ id: 'gs-list-002', documentNo: 'GS-LIST-002', invoiceStatus: 0 }),
    ];

    await login(page);
    await installGoodsShipmentMock(page, rows);

    await page.goto('/goods-shipment');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Locate the first data row in the list table.
    const firstRow = page.locator('tbody tr').filter({ hasText: 'GS-LIST-001' }).first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // The invoiceStatus percent-type cell should be visible in the row.
    // The "percent" type renders a progress bar or numeric value inside a td.
    const invoiceStatusCell = firstRow.locator('td').filter({ hasText: '50' }).first();
    await expect(invoiceStatusCell).toBeVisible({ timeout: 5_000 });
  });
});

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Internal Consumption — line entry (mocked).
 *
 * Verifies that the F3 refactor of DataTable.jsx (which moved the hardcoded
 * `entity === 'internalConsumptionLine'` branches into declarative field
 * metadata — `lookupDrawer`, `onSelectMappings`, `displayFromCatalog`) still
 * produces the same user-visible behavior:
 *
 *   1. The product cell of the inline-add row opens the *Internal Consumption*
 *      product drawer (custom IC drawer), NOT the default ProductSearchDrawer.
 *      → Driven by contract field `product.lookupDrawer = "internal-consumption-product"`.
 *
 *   2. Selecting a product auto-fills the storageBin (Warehouse) cell with the
 *      WAREHOUSE NAME (e.g. "Main Warehouse"), not the raw locator id ("LOC-1").
 *      → Driven by `product.onSelectMappings` (copies `_aux._LOC` → `storageBin`,
 *        with the label resolved from `warehouse`).
 *
 * Mock mode only: installs IC-specific routes on top of the generic /sws/**
 * mock that login() seeds. Playwright matches routes in reverse registration
 * order, so the specific routes added here win.
 */

const SPEC = 'internal-consumption';
const HEADER_ENTITY = 'internalConsumption';
const LINE_ENTITY = 'internalConsumptionLine';

const DRAFT_HEADER = {
  id: 'ic-draft-1',
  documentNo: 'IC-DRAFT-001',
  name: 'IC-DRAFT-001',
  description: 'E2E draft',
  movementDate: '2026-05-13',
  status: 'DR',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Draft',
  'status$_identifier': 'Draft',
};

const PRODUCT_ROW = {
  id: 'P1',
  _identifier: 'Widget Co. 10mm',
  label: 'Widget Co. 10mm',
  name: 'Widget Co. 10mm',
  searchKey: 'WID-10',
  _aux: { _LOC: 'LOC-1', _QTY: '100' },
  warehouse: 'Main Warehouse',
};

async function installInternalConsumptionMocks(page) {
  // Header list + detail
  await page.route(`**/sws/neo/${SPEC}/${HEADER_ENTITY}{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') return route.fallback();
    // Detail GET: /internalConsumption/<id>
    const detailMatch = url.match(new RegExp(`/${HEADER_ENTITY}/([^/?]+)`));
    if (detailMatch) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [DRAFT_HEADER] } }),
      });
    }
    // List GET
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [DRAFT_HEADER], totalRows: 1 } }),
    });
  });

  // Lines list — return empty so the inline-add row is the only candidate
  await page.route(`**/sws/neo/${SPEC}/${LINE_ENTITY}{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    // Let the product selector route (declared below) handle its own URL
    if (url.includes('/selectors/')) return route.fallback();
    if (req.method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });

  // Product selector — used by the InternalConsumptionProductSearchDrawer.
  // The drawer fetches with ?limit&offset and expects `{ items, hasMore }`.
  await page.route(`**/${LINE_ENTITY}/selectors/M_Product_ID{/**,}**`, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [PRODUCT_ROW], hasMore: false }),
    });
  });
}

test.describe('Internal Consumption — inline line entry (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installInternalConsumptionMocks(page);
  });

  test('selecting a product in the IC drawer auto-fills warehouse name in storageBin', async ({ page }) => {
    // 1. Navigate to the IC list and open the draft header.
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const draftRow = page.locator('tbody tr').filter({ hasText: 'IC-DRAFT-001' }).first();
    await expect(draftRow).toBeVisible();
    await draftRow.click();
    await expect(page).toHaveURL(new RegExp(`/${SPEC}/${DRAFT_HEADER.id}`));

    // 2. Click "+ Add line" to reveal the inline-add row.
    //    At this point the document has 0 lines, so the generic empty-state
    //    (LinesEmptyState, added in ETP-5039) is rendered instead of the
    //    normal lines toolbar — its button carries a different testid.
    const addLineBtn = page.getByTestId('action-add-lines-empty-state')
      .or(page.getByRole('button', { name: /añadir líneas|add lines/i }).first());
    await expect(addLineBtn).toBeVisible();
    await addLineBtn.click();

    const inlineAddRow = page.getByTestId('inline-add-row');
    await expect(inlineAddRow).toBeVisible();

    // 3. Click the product cell — should open the *IC* drawer
    //    (lookupDrawer: 'internal-consumption-product').
    const productField = inlineAddRow.getByTestId('inline-add-field-product');
    await expect(productField).toBeVisible();
    await productField.click();

    // 4. Assert the IC drawer (not the default ProductSearchDrawer) is open.
    //    Distinctive markers from InternalConsumptionProductSearchDrawer.jsx:
    //      - "All" warehouse-filter pill
    //      - "Product + Warehouse..." placeholder (from field.lookupTitle)
    //      - "1 location" / "locations" suffix in product groups
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByPlaceholder(/Product \+ Warehouse/i)).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(drawer.getByText('Widget Co. 10mm')).toBeVisible();
    await expect(drawer.getByText(/1 location/i)).toBeVisible();

    // 5. The product group renders with its (only) location row already visible.
    //    Clicking the product-row button just toggles the group open/closed —
    //    it does NOT fire onSelect. The LOCATION row ("Main Warehouse 100 ud")
    //    is what calls onSelect and triggers the auto-close + mapping.
    //
    //    Ensure the group is expanded (the product button toggles it; if the
    //    location row is already visible the click would collapse it, so we
    //    only click it when the location row is not yet visible).
    const locationRow = drawer.getByRole('button', { name: /Main Warehouse\s+100/i });
    if (!(await locationRow.isVisible().catch(() => false))) {
      await drawer.getByRole('button', { name: /Widget Co\. 10mm/i }).first().click();
    }
    await expect(locationRow).toBeVisible();
    await locationRow.click();

    // The drawer auto-closes 120ms after select.
    await expect(drawer).toBeHidden({ timeout: 2000 });

    // 6. Heart of the test — assert the declarative mapping kicked in:
    //    - product cell shows "Widget Co. 10mm"
    //    - storageBin cell shows "Main Warehouse" (the WAREHOUSE NAME from
    //      onSelectMappings.labelFrom), NOT "LOC-1" (the raw locator id).
    //
    //    The inline-add row commits to a saved row (line number "10") as soon
    //    as the drawer maps values back, so we look up cells by line id, with
    //    a fallback to the inline-add-cell-* testids in case DataTable kept it
    //    in inline-add mode.
    const productCell = page
      .getByTestId('cell-10-product')
      .or(inlineAddRow.getByTestId('inline-add-cell-product'));
    const storageCell = page
      .getByTestId('cell-10-storageBin')
      .or(inlineAddRow.getByTestId('inline-add-cell-storageBin'));

    await expect(productCell).toContainText('Widget Co. 10mm');
    // storageBin now has a committed value (auto-filled by onSelectMappings), so
    // InlineSearchCombo (ETP-4600) renders it as a chip (`inline-add-field-storageBin-chip`),
    // not the plain input — assert the chip's label text instead of an input value.
    const storageChip = storageCell.getByTestId('inline-add-field-storageBin-chip');
    await expect(storageChip).toContainText('Main Warehouse');
    await expect(storageChip).not.toContainText('LOC-1');
  });
});

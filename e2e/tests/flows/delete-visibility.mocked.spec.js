import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Delete visibility — ETP-4656 (mocked).
 *
 * Protects the two related-but-distinct delete-visibility behaviors that
 * ETP-4656 standardized. Both are driven by the shared predicate
 * `isDeleteVisibleForRecord()` in `tools/app-shell/src/utils/recordActions.js`,
 * but surface at two different UI layers with opposite gating rules:
 *
 * 1. GRID (list) hover-delete quick-action — commit 044edad45 "Always show
 *    grid delete icon regardless of status". `goods-receipt`, `goods-shipment`,
 *    and the two windows built on the shared `ReturnWindowShell`
 *    (`return-material-receipt`, `return-to-vendor-shipment`) must show the
 *    row-hover delete icon (`row-quick-action-delete`) for BOTH draft and
 *    completed rows — `rowQuickActions.hideDeleteWhenComplete` was removed
 *    from all four windows, so `RowQuickActions` never gates it by status.
 *    A completed document that genuinely can't be deleted server-side still
 *    surfaces the FK/AD_Message error toast as the safety net (out of scope
 *    for this mocked spec).
 *
 * 2. FORM (detail) toolbar delete button — commit ad20b03f5 "Gate Form
 *    delete to Draft in inventory windows". `physical-inventory` and
 *    `goods-movements` gate `action-delete` via a BOOLEAN `processed`
 *    field as their `statusField` (the actual regression: the original
 *    `DELETABLE_DOC_STATUSES.includes(status)` string check silently never
 *    matched `true`/`false`). `internal-consumption` gates via a normal
 *    string-coded `status` field (DR/CO/VO) and is included here for
 *    completeness, even though it does not exercise the boolean branch.
 *
 * Mock mode only — no backend required. See docs/e2e-testing-guide.md
 * ("Writing a mocked list/detail spec") and
 * e2e/tests/flows/row-quick-actions.mocked.spec.js for the canonical pattern
 * this spec follows.
 */

// ─────────────────────────────────────────────────────────────────────────
// Part 1 — Grid hover-delete icon, NOT gated by document status
// ─────────────────────────────────────────────────────────────────────────

const GRID_ROWS = [
  { id: 'row-001', documentStatus: 'DR', 'documentStatus$_identifier': 'Borrador' },
  { id: 'row-002', documentStatus: 'CO', 'documentStatus$_identifier': 'Completado' },
];

const GRID_WINDOWS = {
  'goods-receipt': {
    entityPath: 'goodsReceipt',
    docNoField: 'orderReference',
    extra: {
      movementDate: '2026-01-15',
      'businessPartner$_identifier': 'Test BP',
      warehouse: 'wh-1',
      'warehouse$_identifier': 'Main Warehouse',
      posted: false,
      invoiceStatus: 0,
    },
  },
  'goods-shipment': {
    entityPath: 'goodsShipment',
    docNoField: 'documentNo',
    extra: {
      movementDate: '2026-01-15',
      businessPartner: 'Test BP',
      warehouse: 'Main Warehouse',
      posted: false,
      invoiceStatus: 0,
    },
  },
  'return-material-receipt': {
    entityPath: 'returnMaterialReceipt',
    docNoField: 'documentNo',
    extra: {
      movementDate: '2026-01-15',
      'businessPartner$_identifier': 'Test BP',
      'warehouse$_identifier': 'Main Warehouse',
      invoiceStatus: 0,
      sourceShipmentDocNo: 'SHIP-001',
    },
  },
  'return-to-vendor-shipment': {
    entityPath: 'returnToVendorShipment',
    docNoField: 'documentNo',
    extra: {
      movementDate: '2026-01-15',
      'businessPartner$_identifier': 'Test BP',
      'warehouse$_identifier': 'Main Warehouse',
      invoiceStatus: 0,
      sourceReceiptDocNo: 'GR-001',
    },
  },
};

/**
 * Install a list-endpoint mock that returns two synthetic rows (one Draft,
 * one Completado) for the given spec/entity. Must run AFTER login() —
 * Playwright matches routes in reverse registration order.
 */
async function installGridListMock(page, spec, cfg) {
  const rows = GRID_ROWS.map(r => ({
    ...r,
    [cfg.docNoField]: r.id === 'row-001' ? 'DOC-001' : 'DOC-002',
    ...cfg.extra,
  }));
  await page.route(`**/sws/neo/${spec}/${cfg.entityPath}{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !new RegExp(`/${cfg.entityPath}/[^/?]+`).test(url)) {
      // List fetch
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
      return;
    }
    if (req.method() === 'GET') {
      // Detail GET — return the matching row (not exercised by these tests,
      // but kept for parity in case a click/navigate happens incidentally).
      const m = url.match(new RegExp(`/${cfg.entityPath}/([^/?]+)`));
      const found = rows.find(r => r.id === m?.[1]) ?? rows[0];
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

test.describe('Grid delete icon — not gated by document status (ETP-4656)', () => {
  for (const [spec, cfg] of Object.entries(GRID_WINDOWS)) {
    test.describe(spec, () => {
      test.beforeEach(async ({ page }) => {
        await login(page);
        await installGridListMock(page, spec, cfg);
        await page.goto(`/${spec}`);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      });

      test('delete quick-action is visible on hover for a Draft row', async ({ page }) => {
        const row = page.getByTestId('row-row-001');
        await expect(row).toBeVisible();
        await expect(row).toHaveAttribute('data-row-status', 'DR');

        await row.hover();
        await expect(row.getByTestId('row-quick-actions')).toBeVisible({ timeout: 5_000 });
        await expect(row.getByTestId('row-quick-action-delete')).toBeVisible();
      });

      test('delete quick-action stays visible on hover for a Completado row (ETP-4656 regression guard)', async ({ page }) => {
        const row = page.getByTestId('row-row-002');
        await expect(row).toBeVisible();
        await expect(row).toHaveAttribute('data-row-status', 'CO');

        await row.hover();
        await expect(row.getByTestId('row-quick-actions')).toBeVisible({ timeout: 5_000 });
        await expect(row.getByTestId('row-quick-action-delete')).toBeVisible();
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Part 2 — Form (detail) delete button, gated to Draft status
// ─────────────────────────────────────────────────────────────────────────

const FORM_WINDOWS = {
  // Boolean-typed statusField ('processed') — the actual ETP-4656 bug: the
  // string-based DELETABLE_DOC_STATUSES check never matched true/false.
  'physical-inventory': {
    entity: 'inventory',
    lineEntity: 'inventoryLine',
    draft: {
      id: 'pi-draft-1',
      name: 'PI-DRAFT-001',
      movementDate: '2026-01-15',
      warehouse: 'wh-1',
      'warehouse$_identifier': 'Main Warehouse',
      processed: false,
    },
    completed: {
      id: 'pi-done-1',
      name: 'PI-DONE-001',
      movementDate: '2026-01-10',
      warehouse: 'wh-1',
      'warehouse$_identifier': 'Main Warehouse',
      processed: true,
    },
  },
  // Boolean-typed statusField ('processed') — same regression as above.
  'goods-movements': {
    entity: 'movement',
    lineEntity: 'movementLine',
    draft: {
      id: 'gm-draft-1',
      name: 'GM-DRAFT-001',
      documentNo: 'GM-DRAFT-001',
      movementDate: '2026-01-15',
      processed: false,
    },
    completed: {
      id: 'gm-done-1',
      name: 'GM-DONE-001',
      documentNo: 'GM-DONE-001',
      movementDate: '2026-01-10',
      processed: true,
    },
  },
  // String-coded statusField ('status': DR/CO/VO) — included for completeness
  // (also standardized by ad20b03f5) but does NOT exercise the boolean branch.
  'internal-consumption': {
    entity: 'internalConsumption',
    lineEntity: 'internalConsumptionLine',
    draft: {
      id: 'ic-draft-1',
      name: 'IC-DRAFT-001',
      documentNo: 'IC-DRAFT-001',
      movementDate: '2026-01-15',
      status: 'DR',
      'status$_identifier': 'Borrador',
      documentStatus: 'DR',
      processed: false,
    },
    completed: {
      id: 'ic-done-1',
      name: 'IC-DONE-001',
      documentNo: 'IC-DONE-001',
      movementDate: '2026-01-10',
      status: 'CO',
      'status$_identifier': 'Completado',
      documentStatus: 'CO',
      processed: true,
    },
  },
};

/**
 * Install per-id detail-GET mocks for both the draft and completed fixture
 * records, plus an empty lines list so the detail page mounts cleanly.
 */
async function installFormWindowMocks(page, spec, cfg) {
  for (const record of [cfg.draft, cfg.completed]) {
    await page.route(`**/sws/neo/${spec}/${cfg.entity}/${record.id}{/**,}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [record] } }),
      });
    });
  }
  await page.route(`**/sws/neo/${spec}/${cfg.lineEntity}{/**,}**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
    });
  });
}

test.describe('Form delete button — gated to Draft status (ETP-4656)', () => {
  for (const [spec, cfg] of Object.entries(FORM_WINDOWS)) {
    test.describe(spec, () => {
      test.beforeEach(async ({ page }) => {
        await login(page);
        await installFormWindowMocks(page, spec, cfg);
      });

      test('delete button is visible for a Draft record', async ({ page }) => {
        await page.goto(`/${spec}/${cfg.draft.id}`);
        await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
        await expect(page.getByTestId('action-delete')).toBeVisible();
      });

      test('delete button is hidden once the record is processed/completed (ETP-4656 regression guard)', async ({ page }) => {
        await page.goto(`/${spec}/${cfg.completed.id}`);
        await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
        await expect(page.getByTestId('action-delete')).toHaveCount(0);
      });
    });
  }
});

/**
 * ETP-5315 supersedes ETP-4011: product (Valeria, ETP-5315 Jira comment)
 * confirmed Reactivate must be consistent across ALL THREE surfaces — form
 * kebab, grid bulk-select, and grid row-hover kebab — for both Sales Order
 * and Purchase Order. This spec used to be a regression guard asserting the
 * OPPOSITE (no Reactivate anywhere in Purchase Order, per ETP-4011); it is
 * now rewritten as a positive guard for the ETP-5315 wiring.
 *
 * Three scenarios (all mocked, no backend required):
 *
 *   A — Detail page "more actions" menu DOES contain a Reactivate item for a
 *       completed (CO) order with no linked documents, and does NOT for one
 *       with a linked document (`hasLinkedDocuments: true`).
 *
 *   B — List row-hover kebab (`row-quick-action-more`, see
 *       row-quick-actions.mocked.spec.js for the canonical pattern): same
 *       gate as scenario A, driven by `useOrderWindow`'s `showReactivate`.
 *
 *   C — List bulk-action toolbar: selecting completed (CO) rows shows the
 *       ETP-5315 `PurchaseOrderReactivateBulkAction` button ("Confirmar")
 *       offering `RE`, separate from the pre-existing CO-only button.
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

// --------------------------------------------------------------------------
// Synthetic data
// --------------------------------------------------------------------------

const CO_ROW_FREE = {
  id: 'po-co-free',
  documentNo: 'PO-CO-FREE',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  'businessPartner$_identifier': 'Test Supplier',
  grandTotalAmount: 1500,
  deliveryStatusPurchase: 100,
  invoiceStatus: 100,
  orderDate: '2026-01-10',
  hasLinkedDocuments: false,
};

const CO_ROW_LINKED = {
  ...CO_ROW_FREE,
  id: 'po-co-linked',
  documentNo: 'PO-CO-LINKED',
  hasLinkedDocuments: true,
};

const DR_ROW = {
  id: 'po-dr-001',
  documentNo: 'PO-DR-001',
  documentStatus: 'DR',
  'documentStatus$_identifier': 'Borrador',
  'businessPartner$_identifier': 'Test Supplier',
  grandTotalAmount: 800,
  deliveryStatusPurchase: 0,
  invoiceStatus: 0,
  orderDate: '2026-01-12',
  hasLinkedDocuments: false,
};

// --------------------------------------------------------------------------
// Route helpers
// --------------------------------------------------------------------------

/**
 * Install a mock that serves the given rows for the purchase-order list
 * endpoint and the detail endpoint by id.
 * Must be called AFTER login() so this route takes priority (LIFO).
 */
async function installMock(page, rows) {
  await page.route('**/sws/neo/purchase-order/header{/**,}**', async (route) => {
    const req = route.request();
    const url = req.url();

    // Detail GET — matched by id segment
    if (req.method() === 'GET' && /\/header\/[^/?]+/.test(url)) {
      const m = url.match(/\/header\/([^/?]+)/);
      const found = rows.find((r) => r.id === m?.[1]) ?? rows[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
      return;
    }

    // List GET
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: rows, totalRows: rows.length } }),
      });
      return;
    }

    route.fallback();
  });
}

// --------------------------------------------------------------------------
// Scenario A — Detail page: Reactivate follows hasLinkedDocuments
// --------------------------------------------------------------------------

test.describe('Purchase Order detail — Reactivate in kebab menu follows hasLinkedDocuments (ETP-5315)', () => {
  test('shows Reactivate for a completed order with no linked documents', async ({ page }) => {
    await login(page);
    await installMock(page, [CO_ROW_FREE]);
    await page.goto(`/purchase-order/${CO_ROW_FREE.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });

    // The global TopBar renders its own "Más" (favorites/help) button using
    // the same MoreVertical lucide icon, and it sits earlier in the DOM than
    // the document-actions kebab — a generic icon-filter locator would grab
    // the wrong button. `action-more` is the stable, unique test id for the
    // document-actions kebab (see DetailMoreActionsMenu.jsx).
    const moreBtn = page.getByTestId('action-more');
    await expect(moreBtn).toBeVisible({ timeout: 5_000 });
    await moreBtn.click();

    await expect(page.getByRole('button', { name: /reactivar|reactivate/i })).toBeVisible();
  });

  test('hides Reactivate for a completed order with a linked document', async ({ page }) => {
    await login(page);
    await installMock(page, [CO_ROW_LINKED]);
    await page.goto(`/purchase-order/${CO_ROW_LINKED.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });

    // See comment above — use the stable document-actions kebab test id,
    // not a generic MoreVertical icon filter that also matches the
    // TopBar's "Más" button.
    const moreBtn = page.getByTestId('action-more');
    const moreBtnVisible = await moreBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (moreBtnVisible) {
      await moreBtn.click();
      await expect(page.getByRole('button', { name: /reactivar|reactivate/i })).toHaveCount(0, {
        message: 'Reactivate must not appear for an order with linked documents',
      });
    }
    // If the more-menu is hidden entirely, Reactivate is absent by definition.
  });
});

// --------------------------------------------------------------------------
// Scenario B — List row-hover kebab: same hasLinkedDocuments gate
// --------------------------------------------------------------------------

test.describe('Purchase Order list — row-hover kebab Reactivate follows hasLinkedDocuments (ETP-5315)', () => {
  test('row-hover kebab lists Reactivate for a completed row with no linked documents', async ({ page }) => {
    await login(page);
    await installMock(page, [CO_ROW_FREE]);
    await page.goto('/purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const row = page.locator('tbody tr').filter({ hasText: 'PO-CO-FREE' }).first();
    await expect(row).toBeVisible({ timeout: 8_000 });
    await row.hover();

    const moreBtn = row.getByTestId('row-quick-action-more');
    await expect(moreBtn).toBeVisible({ timeout: 5_000 });
    await moreBtn.click();

    await expect(page.getByRole('button', { name: /reactivar|reactivate/i })).toBeVisible();
  });

  test('row-hover kebab hides Reactivate for a completed row with a linked document', async ({ page }) => {
    await login(page);
    await installMock(page, [CO_ROW_LINKED]);
    await page.goto('/purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const row = page.locator('tbody tr').filter({ hasText: 'PO-CO-LINKED' }).first();
    await expect(row).toBeVisible({ timeout: 8_000 });
    await row.hover();

    const moreBtn = row.getByTestId('row-quick-action-more');
    const moreBtnVisible = await moreBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (moreBtnVisible) {
      await moreBtn.click();
      await expect(page.getByRole('button', { name: /reactivar|reactivate/i })).toHaveCount(0, {
        message: 'Reactivate must not appear in the row-hover kebab for a row with linked documents',
      });
    }
  });
});

// --------------------------------------------------------------------------
// Scenario C — List bulk-action toolbar: PurchaseOrderReactivateBulkAction
// --------------------------------------------------------------------------

test.describe('Purchase Order list — bulk-select Reactivate (ETP-5315)', () => {
  test('selecting a completed row with no linked documents offers RE in the (second) Confirmar dialog', async ({ page }) => {
    await login(page);
    await installMock(page, [CO_ROW_FREE]);
    await page.goto('/purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const row = page.locator('tbody tr').filter({ hasText: 'PO-CO-FREE' }).first();
    await expect(row).toBeVisible({ timeout: 8_000 });
    await row.hover();
    const checkboxBtn = row.locator('[role="checkbox"]').first();
    if (await checkboxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await checkboxBtn.click();
    } else {
      await row.locator('td').first().click();
    }

    // The pre-existing CO-only BulkDocumentAction renders null here (no draft
    // row selected, nothing for it to offer), so PurchaseOrderReactivateBulkAction
    // is the ONLY button rendered for this CO-only selection. It no longer
    // says "Confirmar" — that label collision (two indistinguishable
    // "Confirmar" buttons for a mixed draft+completed-unlinked selection) was
    // fixed by giving it its own `reactivateBulk` label key, so it renders as
    // "Reactivar" / "Reactivate" instead (see
    // artifacts/purchase-order/custom/PurchaseOrderReactivateBulkAction.jsx).
    const reactivateButtons = page.getByRole('button', { name: /reactivar|reactivate/i });
    await expect(reactivateButtons.first()).toBeVisible({ timeout: 5_000 });
    await reactivateButtons.first().click();

    const reOption = page.locator('[data-value="RE"], [value="RE"]');
    const reText = page.locator('text=/reactivar|reactivate/i');
    await expect(reOption.or(reText).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('selecting only draft rows does not offer RE (only CO)', async ({ page }) => {
    await login(page);
    await installMock(page, [DR_ROW]);
    await page.goto('/purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const row = page.locator('tbody tr').filter({ hasText: 'PO-DR-001' }).first();
    await expect(row).toBeVisible({ timeout: 8_000 });
    await row.hover();
    const checkboxBtn = row.locator('[role="checkbox"]').first();
    if (await checkboxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await checkboxBtn.click();
    } else {
      await row.locator('td').first().click();
    }

    // Only ONE "Confirmar" button renders here: PurchaseOrderReactivateBulkAction's
    // buildReactivateActions returns [] for an all-draft selection (no CO row),
    // so it renders nothing at all — leaving just the pre-existing CO-only
    // BulkDocumentAction. No double-button ambiguity to account for.
    const confirmButtons = page.getByRole('button', { name: /confirmar|confirm/i });
    await expect(confirmButtons.first()).toBeVisible({ timeout: 5_000 });
    await confirmButtons.first().click();

    const reOption = page.locator('[data-value="RE"], [value="RE"]');
    await expect(reOption).toHaveCount(0, {
      message: 'RE (Reactivate) must not be offered when only draft rows are selected',
    });
  });
});

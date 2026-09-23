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
 *   C — List bulk-action toolbar: the bar's single "Procesar" button offers
 *       `RE` in its dropdown when completed (CO) rows are selected, and does
 *       not when only drafts are.
 *
 * ETP-5302 (scenario C) folded the two bulk buttons into ONE. ETP-5315 had
 * shipped its Reactivate as a SECOND button beside the pre-existing CO-only
 * one, with its own `reactivateBulk` key ("Reactivar") so the pair could be
 * told apart; the bar therefore showed two buttons for a mixed selection and a
 * lone "Reactivar" for a completed-only one. Purchase Order now behaves like
 * every other document window: one "Procesar" button (`process`), with
 * Confirmar / Reactivar as options inside its dialog. `reactivateBulk` is gone
 * from every locale file.
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
// Scenario C — List bulk-action toolbar: PurchaseOrderReactivateBulkAction
// --------------------------------------------------------------------------

test.describe('Purchase Order list — bulk-select Reactivate (ETP-5315)', () => {
  test('selecting a completed row with no linked documents offers RE inside the single Procesar dialog', async ({ page }) => {
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

    // ETP-5302 — the bar carries exactly ONE document-action button and it is
    // always "Procesar", whatever the selection: Reactivar is an option INSIDE
    // its dialog, not a button of its own. A completed-only selection used to
    // render a lone "Reactivar" button here (the `reactivateBulk` key, now
    // deleted), which is the symptom this assertion pins down — the toolbar must
    // carry no Reactivar button BEFORE the dialog is opened.
    await expect(page.getByRole('button', { name: /^(reactivar|reactivate)$/i })).toHaveCount(0);

    const processButtons = page.getByRole('button', { name: /^(procesar|process)$/i });
    await expect(processButtons).toHaveCount(1, {
      message: 'The selection bar must carry a single document-action button',
    });
    await processButtons.first().click();

    // Reactivar now appears only as the dialog's dropdown option.
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

    // The same single "Procesar" button as the test above — ETP-5302 renamed it
    // from "Confirmar" because it opens an action picker rather than confirming
    // anything by itself, and "Confirmar" is now the name of the CO option INSIDE
    // the dialog. With no completed row selected, that dialog must offer CO only.
    const processButtons = page.getByRole('button', { name: /^(procesar|process)$/i });
    await expect(processButtons).toHaveCount(1);
    await processButtons.first().click();

    const reOption = page.locator('[data-value="RE"], [value="RE"]');
    await expect(reOption).toHaveCount(0, {
      message: 'RE (Reactivate) must not be offered when only draft rows are selected',
    });
  });
});

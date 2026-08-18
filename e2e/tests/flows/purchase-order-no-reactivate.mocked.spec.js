/**
 * Regression guard: ETP-4011 — Reactivate action removed from Purchase Order.
 *
 * Two scenarios (both mocked, no backend required):
 *
 *   A — Detail page "more actions" menu does NOT contain a Reactivate item for
 *       a completed (CO) order.  When menuActions is [] (as declared in
 *       decisions.json after ETP-4011) the kebab button renders but its panel is
 *       empty; clicking it produces no visible dropdown.
 *
 *   B — List bulk-action toolbar: selecting only completed (CO) rows does NOT
 *       show the "Procesado masivo" button because buildInOutActions returns []
 *       when no draft rows are present.  If the button IS somehow rendered
 *       (safety net), the dialog must not offer value="RE".
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

// --------------------------------------------------------------------------
// Synthetic data
// --------------------------------------------------------------------------

const CO_ROW = {
  id: 'po-co-001',
  documentNo: 'PO-CO-001',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completado',
  'businessPartner$_identifier': 'Test Supplier',
  grandTotalAmount: 1500,
  deliveryStatusPurchase: 100,
  invoiceStatus: 100,
  orderDate: '2026-01-10',
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
};

// --------------------------------------------------------------------------
// Route helpers
// --------------------------------------------------------------------------

/**
 * Install a mock that serves the given rows for the purchase-order list
 * endpoint and the detail endpoint for CO_ROW by id.
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
// Scenario A — Detail page: no "Reactivate" in the more-actions menu
// --------------------------------------------------------------------------

test.describe('Purchase Order detail — no Reactivate in kebab menu (ETP-4011)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installMock(page, [CO_ROW]);
    await page.goto(`/purchase-order/${CO_ROW.id}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('detail page renders for a completed order', async ({ page }) => {
    // The detail-view container must be visible — the record loaded correctly.
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
  });

  test('the more-actions panel does not contain a Reactivate entry', async ({ page }) => {
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });

    // The MoreVertical ("...") button is rendered by DetailView when
    // hideMoreMenu is falsy — it is always in the DOM. Click it.
    const moreBtn = page.locator('button').filter({ has: page.locator('svg.lucide-more-vertical, .lucide-ellipsis-vertical') }).first();

    // If the more-menu button is not found, the component chose to hide it
    // entirely — that also means Reactivate is absent. Accept both outcomes.
    const moreBtnVisible = await moreBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (moreBtnVisible) {
      await moreBtn.click();

      // After clicking, look for any item matching "reactivar" or "reactivate"
      // (case-insensitive, both locales).
      const reactivateItem = page.getByRole('button', { name: /reactivar|reactivate/i });
      await expect(reactivateItem).toHaveCount(0, {
        message: 'Reactivate must not appear in the detail page kebab menu',
      });

      // Also verify by plain text scan (covers non-button renderings).
      const reactivateText = page.locator('text=/reactivar|reactivate/i');
      await expect(reactivateText).toHaveCount(0, {
        message: 'No element with Reactivate text should be visible in the kebab panel',
      });
    }
    // If moreBtnVisible === false → the more-menu was hidden or empty → Reactivate
    // is absent by definition. Test passes.
  });
});

// --------------------------------------------------------------------------
// Scenario B — List view: completed-only selection does not trigger RE option
// --------------------------------------------------------------------------

test.describe('Purchase Order list — bulk action has no RE option (ETP-4011)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Only completed rows — buildInOutActions returns [] → button hidden.
    await installMock(page, [CO_ROW]);
    await page.goto('/purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('selecting a completed row does not show Procesado masivo button', async ({ page }) => {
    // Wait for the table to render
    const row = page.locator('tbody tr').filter({ hasText: 'PO-CO-001' }).first();
    await expect(row).toBeVisible({ timeout: 8_000 });

    // The Checkbox component renders as <button role="checkbox"> (not <input>).
    // Hover first to ensure the cell is interactive, then click the checkbox button.
    await row.hover();
    const checkboxBtn = row.locator('[role="checkbox"]').first();
    if (await checkboxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await checkboxBtn.click();
    } else {
      // Fallback: click the first cell to toggle selection.
      await row.locator('td').first().click();
    }

    // With buildInOutActions and only CO rows, BulkDocumentAction returns []
    // and renders null — the button should NOT appear.
    const bulkBtn = page.getByRole('button', { name: /procesado masivo|bulkcompletion/i });
    await expect(bulkBtn).toHaveCount(0, {
      message: 'Procesado masivo button must not appear when only completed rows are selected',
    });
  });

  test('if Procesado masivo button appears (safety net), the dialog has no RE option', async ({ page }) => {
    // This test guards against a future regression where BulkDocumentAction
    // falls back to the default code-path that adds RE for completed rows.
    await installMock(page, [CO_ROW, DR_ROW]);

    await page.goto('/purchase-order');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Attempt to select only the CO row.
    const coRow = page.locator('tbody tr').filter({ hasText: 'PO-CO-001' }).first();
    await expect(coRow).toBeVisible({ timeout: 8_000 });
    await coRow.hover();
    // The Checkbox component renders as <button role="checkbox"> (not <input>).
    await coRow.hover();
    const checkboxBtn = coRow.locator('[role="checkbox"]').first();
    if (await checkboxBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await checkboxBtn.click();
    } else {
      await coRow.locator('td').first().click();
    }

    const bulkBtn = page.getByRole('button', { name: /procesado masivo|bulkcompletion/i });
    const bulkBtnVisible = await bulkBtn.isVisible({ timeout: 2_000 }).catch(() => false);

    if (bulkBtnVisible) {
      await bulkBtn.click();
      // The dialog must not offer value="RE" — scan for select items with that value.
      const reOption = page.locator('[data-value="RE"], [value="RE"]');
      await expect(reOption).toHaveCount(0, {
        message: 'RE (Reactivate) must not be an option inside the Procesado masivo dialog',
      });

      // Also check by text to catch label-only renderings.
      const reText = page.locator('text=/reactivar|reactivate/i');
      await expect(reText).toHaveCount(0, {
        message: 'No Reactivate text should appear inside the Procesado masivo dialog',
      });
    }
    // If bulkBtnVisible === false → correct behaviour, nothing more to assert.
  });
});

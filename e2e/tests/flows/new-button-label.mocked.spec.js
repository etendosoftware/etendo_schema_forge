import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { listView } from '../helpers/selectors.js';

/**
 * New-button contextual label — smoke (mocked).
 *
 * Validates that the "+ Nuevo" button in each list view shows the window-
 * specific translated label (`windows[entityLabel].newLabel`) instead of the
 * generic "Nuevo" fallback.
 *
 * Labels come from es_ES.json → windows section:
 *   Sales Order      → "Nuevo pedido"
 *   Purchase Order   → "Nuevo pedido"
 *   Sales Invoice    → "Nueva factura"
 *   Physical Inventory → "Nuevo inventario"
 *
 * Mock mode only: a minimal list endpoint returning empty data is enough —
 * we only care that the button renders with the correct label, not that rows
 * are present. The generic /sws/** mock seeded by login() returns empty lists
 * for everything else, so we install a narrow override only when needed.
 */

const WINDOWS = [
  { spec: 'sales-order',        expectedLabel: 'Nuevo pedido'    },
  { spec: 'purchase-order',     expectedLabel: 'Nuevo pedido'    },
  { spec: 'sales-invoice',      expectedLabel: 'Nueva factura'   },
  { spec: 'physical-inventory', expectedLabel: 'Nuevo inventario' },
];

/**
 * Install a minimal list-endpoint mock for the given spec.
 * Returns an empty data array — we only need the list view to mount.
 * Must run AFTER login() so it takes precedence (Playwright matches routes
 * in reverse registration order, last wins).
 */
async function installEmptyListMock(page, spec) {
  await page.route(`**/sws/neo/${spec}/header{/**,}**`, async (route) => {
    const req = route.request();
    const url = req.url();

    // List GET — return empty payload so the ListView mounts.
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
      return;
    }

    // Anything else (detail GET, POST, …) — fall through to the generic mock.
    route.fallback();
  });
}

for (const { spec, expectedLabel } of WINDOWS) {
  test.describe(`New-button label — ${spec}`, () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
      await installEmptyListMock(page, spec);
      await page.goto(`/${spec}`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    test(`shows "${expectedLabel}" in the action-new button`, async ({ page }) => {
      const newBtn = page.getByTestId(listView.newButton);
      await expect(newBtn).toBeVisible({ timeout: 10_000 });
      await expect(newBtn).toContainText(expectedLabel);
    });
  });
}

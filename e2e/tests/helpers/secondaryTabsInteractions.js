// @covers tools/app-shell/src/components/contract-ui/DetailTabStrip.jsx
/**
 * Shared secondary-tab interaction helpers for `maxDetailLines`-capped
 * secondary tabs (customer/vendor accounting, product accounting, etc.).
 *
 * These specs (`contacts-accounting.mocked.spec.js`,
 * `product-pricing.mocked.spec.js`, and any sibling secondary-tab spec)
 * exercise the SAME empty-state Add Line interaction — this module owns
 * that sequence so the flow specs share one implementation instead of
 * copy-pasting it.
 */
import { expect } from '@playwright/test';

/**
 * Click the "+" trigger rendered by `secondaryTabEmptyState` (DetailView.jsx)
 * when a `table-form` secondary tab has zero rows.
 *
 * With zero rows, SecondaryTableTab renders `secondaryTabEmptyState`
 * instead of the AddLineButton (`action-add-line`) — its own "+" trigger
 * calls the identical `onAddLineClick` handler, so clicking it opens the
 * same inline add-line form.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {number} [opts.timeout] Visibility timeout for the empty state (ms).
 * @returns {Promise<void>}
 */
export async function clickEmptyStateAddLine(page, { timeout = 8_000 } = {}) {
  const emptyState = page.getByTestId('secondary-tab-empty-state');
  await expect(emptyState).toBeVisible({ timeout });
  await emptyState.getByRole('button').click();
}

/**
 * Open a Form View bottom tab by its key, whether the tab is currently a button in the
 * strip or tucked into the "More" overflow menu.
 *
 * The Form View strip (DetailTabStrip) shows at most 4 tabs plus a "More" menu, and the
 * fourth button is a dynamic slot: picking a hidden tab from the menu promotes it into the
 * slot and the tab that was there drops into the menu; picking a fixed tab resets the slot.
 * So which tabs are buttons depends on the click history AND on the available width — a spec
 * must never assume `tab-<key>` is visible. This helper resolves it at call time:
 *   - `tab-<key>` visible  -> click it;
 *   - otherwise            -> open `detail-tab-more` and click `detail-tab-more-item-<key>`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key Tab key exactly as in the testid suffix (`lines`, `custom:attachments`, ...).
 * @param {object} [opts]
 * @param {number} [opts.timeout] How long to wait for the strip to expose the tab (ms).
 * @returns {Promise<void>}
 */
export async function openFormViewTab(page, key, { timeout = 10_000 } = {}) {
  const tab = page.getByTestId(`tab-${key}`);
  const moreTrigger = page.getByTestId('detail-tab-more');
  // Either the tab is a button or the menu that holds it must be there.
  await expect(tab.or(moreTrigger).first()).toBeVisible({ timeout });
  if (await tab.isVisible()) {
    await tab.click();
    return;
  }
  await moreTrigger.click();
  const item = page.getByTestId(`detail-tab-more-item-${key}`);
  await expect(item).toBeVisible({ timeout });
  await item.click();
}

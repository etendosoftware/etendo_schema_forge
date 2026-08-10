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

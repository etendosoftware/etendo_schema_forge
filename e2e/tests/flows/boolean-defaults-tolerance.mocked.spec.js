import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Boolean default shape tolerance on the new-record form — ETP-4793 (mocked).
 *
 * NEO's `/defaults` endpoint used to return the SAME boolean column in two
 * different JSON shapes depending on which spec asked for it: `true` in one and
 * the raw Etendo storage encoding `"Y"` in another (and, for other columns, the
 * inversion of that). Five producers write into the `defaults` map and only one
 * of them coerced its value, so the shape depended on which producer happened to
 * fill a given field — legacy callouts, in particular, hand back `"Y"`/`"N"`.
 * `canonicalizeBooleanDefaults` in `NeoDefaultsService` now normalizes all of
 * them to real JSON booleans.
 *
 * The React side needs no change — and this spec is what proves that claim and
 * keeps it true. Two independent layers hand-roll the same tolerance:
 *
 *   1. `EntityForm.renderCheckboxField` — `=== true || === 'Y' || === 'true'`
 *      (a bare `!!value` would be wrong here: `!!'N'` is `true`).
 *   2. the generated `displayLogic` predicates in `AssetCategoryForm.jsx`, which
 *      gate four dependent fields on `record.depreciate === true || === 'Y'`.
 *
 * Neither may be "simplified" away while any endpoint the form reads can still
 * emit a string — normalization runs in `NeoDefaultsService` only, so a window
 * fed by a different path would regress silently. This spec pins both layers by
 * feeding the form all four shapes and asserting the checkbox state and the
 * dependent-field visibility that follows from it.
 *
 * `asset-group / assetCategory / depreciate` is the target because it is the
 * lightest editable boolean that is BOTH rendered as a form checkbox and used as
 * a `displayLogic` source. (The invoice windows that exhibited the original
 * inconsistency cannot host this test: every boolean header field there is
 * `form: false`, so no checkbox renders at all.)
 *
 * Mock mode only. Requires the dev server WITHOUT `VITE_MOCK` (`make dev`, not
 * `make dev-mock`) — `VITE_MOCK=true` replaces `window.fetch` before any request
 * exists and silently bypasses `page.route()`.
 */

const DEFAULTS_URL = '**/sws/neo/asset-group/assetCategory/defaults';

/**
 * Serves `/defaults` with `depreciate` in the given JSON shape.
 *
 * Registered AFTER login() on purpose: Playwright matches routes in reverse
 * registration order, so this must be installed after the helper's generic
 * `**\/sws/**` catch-all (which would otherwise answer with an empty list).
 */
async function installDefaultsMock(page, depreciate) {
  await page.route(DEFAULTS_URL, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ defaults: { name: 'E2E Category', depreciate } }),
    });
  });
}

async function openNewForm(page) {
  await page.goto('/asset-group');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.getByTestId('action-new').click();
  await page.waitForURL('**/asset-group/new', { timeout: 5_000 });
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 8_000 });
}

// [shape sent by /defaults, human-readable name, expected checked state]
const SHAPES = [
  [true, 'boolean true (post-ETP-4793 canonical form)', true],
  ['Y', 'string "Y" (raw Etendo storage encoding)', true],
  [false, 'boolean false (post-ETP-4793 canonical form)', false],
  ['N', 'string "N" (raw Etendo storage encoding)', false],
];

test.describe('Boolean default shape tolerance (ETP-4793) — mocked', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const [shape, description, expectedChecked] of SHAPES) {
    test(`renders depreciate as ${expectedChecked ? 'checked' : 'unchecked'} for ${description}`, async ({ page }) => {
      await installDefaultsMock(page, shape);
      await openNewForm(page);

      const checkbox = page.getByTestId('field-depreciate');
      await expect(checkbox).toBeVisible();
      // aria-checked is driven by the same guarded expression the SVG tick is,
      // so asserting it covers the visual state too.
      await expect(checkbox).toHaveAttribute('aria-checked', String(expectedChecked));
    });

    test(`gates the dependent fields ${expectedChecked ? 'open' : 'closed'} for ${description}`, async ({ page }) => {
      await installDefaultsMock(page, shape);
      await openNewForm(page);

      // depreciationType/calculateType carry a generated displayLogic of
      // `record.depreciate === true || record.depreciate === 'Y'`. This is the
      // second hand-rolled guard and the one most likely to be regenerated.
      const dependent = page.getByTestId('field-depreciationType');
      if (expectedChecked) {
        await expect(dependent).toBeVisible();
      } else {
        await expect(dependent).toHaveCount(0);
      }
    });
  }

  test('flipping the checkbox from a string "N" default reveals the dependent fields', async ({ page }) => {
    // Guards against a half-fix that reads the string on load but then compares
    // the toggled value against the string shape again: the click must hand
    // `onChange` a real boolean, not "Y".
    await installDefaultsMock(page, 'N');
    await openNewForm(page);

    const checkbox = page.getByTestId('field-depreciate');
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('field-depreciationType')).toHaveCount(0);

    await checkbox.click();

    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('field-depreciationType')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Date default shape tolerance on the new-record form — ETP-4793 / IMP-16 (mocked).
 *
 * Sibling of boolean-defaults-tolerance.mocked.spec.js: the same class of bug on
 * the other primitive type. NEO's `/defaults` used to leak Etendo's UI date
 * pattern (`dd-MM-yyyy`) for some producers while others emitted ISO;
 * `canonicalizeDateDefaults` in `NeoDefaultsService` now rewrites every date-only
 * property to `yyyy-MM-dd` and every datetime to `yyyy-MM-dd'T'HH:mm:ss`.
 *
 * The frontend already tolerates the legacy shape in `normalizeDefaultValue`
 * (`useEntity.js`), and that is the layer this spec pins. Why it matters more
 * here than for booleans: `parseCalendarDate` falls through to `new Date(str)`,
 * which reads a bare `MM-dd-yyyy`. So an UNCONVERTED `dd-MM-yyyy` does not render
 * empty — for any day <= 12 it silently renders the day and month **swapped**.
 * That is the same lenient-reparse failure mode that put corrupt rows in the
 * database (IMP-16 §3.6), just on the display side.
 *
 * The fixture date is deliberately 5 November 2026: both halves are <= 12, so a
 * regression is a wrong date on screen rather than a blank field, and the two
 * assertions below can actually tell them apart (05/11 vs 11/05).
 *
 * Mock mode only. Requires the dev server WITHOUT `VITE_MOCK` (`make dev`, not
 * `make dev-mock`) — `VITE_MOCK=true` replaces `window.fetch` before any request
 * exists and silently bypasses `page.route()`.
 */

// 5 November 2026, in the two shapes /defaults has been observed to emit.
const LEGACY_SHAPE = '05-11-2026';        // Etendo UI pattern (dd-MM-yyyy), pre-IMP-16
const CANONICAL_SHAPE = '2026-11-05';     // ISO date-only, what NEO emits now
// What DateField shows for that date under es_ES (dd/mm/yyyy).
const EXPECTED_DISPLAY = '05/11/2026';
// What it would show if the legacy shape reached parseCalendarDate unconverted
// (new Date('05-11-2026') is read as MM-dd-yyyy → 11 May 2026).
const SWAPPED_DISPLAY = '11/05/2026';

/**
 * @param page      Playwright page
 * @param orderDate either the value itself, or a getter returning it (so a single
 *                  test can serve two shapes across two navigations without
 *                  unrouting — unrouteAll would also drop login()'s /sws/**
 *                  catch-all and let the fake token hit the real backend).
 */
async function installQuotationMocks(page, orderDate) {
  const currentOrderDate = () => (typeof orderDate === 'function' ? orderDate() : orderDate);
  await page.route('**/sws/neo/sales-quotation/quotation', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route('**/sws/neo/sales-quotation/quotation/defaults', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ defaults: { orderDate: currentOrderDate() } }),
    });
  });
}

async function openNewQuotation(page) {
  await page.goto('/sales-quotation/new');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  // Gate on the field itself: sales-quotation renders through its own generated
  // page, which does not expose the generic `detail-view` testid.
  // 20s, not the usual 8s: on a cold dev server vite compiles this window's chunk
  // on first request, and with several workers hitting it at once 8s is not enough
  // (the pre-existing required-field-validation spec flakes the same way).
  await expect(page.getByTestId('field-orderDate')).toBeVisible({ timeout: 20_000 });
}

test.describe('Date default shape tolerance (ETP-4793 / IMP-16) — mocked', () => {
  test.beforeEach(async ({ page }) => {
    // Pin the locale: the assertion is on a locale-formatted display value, and
    // DateField reads the same 'schema-forge-locale' key the app writes.
    await page.addInitScript(() => {
      localStorage.setItem('schema-forge-locale', 'es_ES');
    });
    await login(page);
  });

  for (const [shape, description] of [
    [CANONICAL_SHAPE, 'ISO yyyy-MM-dd (what NEO emits post-IMP-16)'],
    [LEGACY_SHAPE, 'legacy dd-MM-yyyy (Etendo UI pattern)'],
  ]) {
    test(`renders 5 Nov 2026 for ${description}`, async ({ page }) => {
      await installQuotationMocks(page, shape);
      await openNewQuotation(page);

      const dateInput = page.getByTestId('field-orderDate');
      await expect(dateInput).toBeVisible();
      await expect(dateInput).toHaveValue(EXPECTED_DISPLAY);
      // Explicit: not the day/month swap a lenient reparse would produce.
      await expect(dateInput).not.toHaveValue(SWAPPED_DISPLAY);
    });
  }

  test('both shapes agree on the rendered date', async ({ page }) => {
    // Guards against a "fix" that makes each shape parse without making them
    // mean the same day — the whole point of canonicalization.
    let served = CANONICAL_SHAPE;
    await installQuotationMocks(page, () => served);

    await openNewQuotation(page);
    const fromCanonical = await page.getByTestId('field-orderDate').inputValue();

    served = LEGACY_SHAPE;
    await openNewQuotation(page);
    const fromLegacy = await page.getByTestId('field-orderDate').inputValue();

    expect(fromCanonical).not.toBe('');
    expect(fromLegacy).toBe(fromCanonical);
  });
});

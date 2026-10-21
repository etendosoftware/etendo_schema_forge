/**
 * Shared mock of the Subscription Plan Catalog (`GET /sws/go/plans`, ETP-5046) for the specs that
 * drive the `/upgrade` checkout.
 *
 * The upgrade page keeps its submit DISABLED until this catalog has loaded with at least one plan
 * (`canCheckout` in UpgradePage.jsx). The generic `**\/sws/**` stub from `login()` answers any
 * other GET with an empty list, which the page reads as an empty catalog ("no plans for sale"), so
 * every spec that clicks `upgrade-submit` needs this route. Register it AFTER `login()`: Playwright
 * resolves routes LIFO, and the catch-all would otherwise win.
 *
 * A single plan is auto-selected, which is the v1 catalog.
 */

/** Shaped exactly like the server answers — note there is no provider price id; it never sends one. */
export const PRODUCTIVE_PLAN = {
  planKey: 'productive-monthly',
  name: 'Productive',
  description: 'A second tenant for real work',
  displayPrice: '49.00',
  currency: 'EUR',
  billingInterval: 'month',
};

export async function installPlansMock(page, plans = [PRODUCTIVE_PLAN]) {
  await page.route('**/sws/go/plans', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plans }),
    });
  });
}

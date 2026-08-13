/**
 * Shared route-mock helpers for the "confirm document" E2E flows.
 *
 * These specs (sales-order, purchase-order, and any other document with a
 * ConfirmModal) all need the SAME header route handler on top of the generic
 * `**\/sws/**` catch-all that login() seeds. This module owns that handler so
 * the flow specs share one implementation instead of copy-pasting it.
 */

/**
 * Install the header GET/PATCH route the ConfirmModal flow depends on.
 *
 * ETP-4468 — Confirm now calls handleSave() (a PATCH/PUT) BEFORE running the
 * confirm/convert steps. Without an explicit echo here, the request falls
 * through to the generic `**\/sws/**` catch-all in auth.js, which replies with a
 * synthetic `{ id: 'e2e-record-id', ... }` (no NEO envelope, wrong id).
 * useEntity's refetchAfterSave then refetches by that fake id, gets back an
 * empty record via the catch-all's GET fallback, and that garbage overwrites
 * `editing`/`selected` — losing `documentStatus` and flipping `isDraft` to
 * false, which unmounts the ConfirmModal mid-flow. Echoing the real record back
 * on PATCH/PUT (exactly like a real backend would) keeps the refetch consistent
 * so the modal survives the save-before-confirm step.
 *
 * Playwright matches routes in REVERSE registration order, so install this
 * AFTER login() — the specific header route then wins over the generic stub.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {string} opts.spec      Spec/entity slug in the URL (e.g. 'sales-order').
 * @param {string} opts.recordId  The header record id to match and echo.
 * @param {object} opts.record    The record object returned by GET and echoed by PATCH/PUT.
 * @param {string} [opts.entity]  URL entity segment after the spec (defaults to 'header').
 * @returns {Promise<void>}
 */
export async function installHeaderConfirmMock(page, { spec, recordId, record, entity = 'header' }) {
  await page.route(`**/sws/neo/${spec}/${entity}/${recordId}`, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [record] } }),
      });
      return;
    }
    if (method === 'PATCH' || method === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [{ ...record }] } }),
      });
      return;
    }
    await route.continue();
  });
}

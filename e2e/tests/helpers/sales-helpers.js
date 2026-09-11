import { clickBpOptionWithAddress } from './purchase-helpers.js';

/**
 * sales-helpers.js — shared fixtures/guards for the real-backend SALES specs.
 *
 * The purchase side already stopped trusting grid/dropdown position: see
 * `ensureVendorSetup()` in purchase-helpers.js, whose own doc says it is a
 * "find-or-create/repair, never 'whatever the first row happens to be'" because the
 * position-0 approach "depended on grid ordering and on whatever data a previous run
 * left behind". The sales specs never got that treatment and kept picking
 * `[data-testid^="option-businessPartner-"] … .first()`, which is what broke them all
 * at once once an earlier spec left address-less contacts behind (ETP-5283).
 */

/**
 * Picks a customer from the open businessPartner dropdown that has an address, so the BP
 * callout can derive `partnerAddress` and `action-save-draft` actually becomes enabled.
 *
 * Thin sales-side name for `clickBpOptionWithAddress`, which lives beside the location
 * lookup it uses and is shared with the purchase path (`selectVendorBP` without a named
 * fixture). One implementation, two vocabularies — the full rationale is on that
 * function.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<string>} the id of the customer that was clicked
 */
export async function selectCustomerWithAddress(page, options) {
  return clickBpOptionWithAddress(page, options);
}

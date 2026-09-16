import { parseBoolean } from '@/lib/parseBoolean.js';

/**
 * Whether a saved product is missing the cost it is expected to have (ETP-5245).
 *
 * Without an `M_Costing` row the costing engine throws `@NoStandardCostDefined@` the first time
 * the product is shipped, received or counted — long after the person who created it has moved
 * on. The Product window therefore WARNS while the record is still in front of that person.
 *
 * Advisory, not a gate. This predicate also drove a hard save-block in `useEntity`'s save gate;
 * that block was removed by product decision, because a missing cost was stopping edits that
 * have nothing to do with costing — renaming a product, ticking `Active` — and a product created
 * from a document line is born in exactly this state. The condition is still worth surfacing, so
 * `ProductCostBanner` keeps reading it; nothing refuses a save because of it.
 *
 * Applies to EVERY product type. It originally covered only stocked `Item` products (the shape
 * the costing engine values, and the one the ticket described), but the rule was widened by
 * product decision: a cost is now expected on services, expenses and resources too, so the copy
 * no longer mentions stock either. The narrower reading is preserved in git history if it ever
 * needs to come back.
 *
 * Never true while the product is being created: the Costing tab needs a saved record to hang
 * its lines from (`requireSavedRecord`), so a brand-new product cannot possibly have one yet and
 * warning about it there would be noise.
 *
 * @param {string} specName the window's spec name; anything but `product` is inert
 * @param {object} record the product record, as returned by the backend
 * @returns {boolean} true when the record is a saved product with no cost defined
 */
export function isProductMissingRequiredCost(specName, record) {
  if (specName !== 'product' || !record) return false;
  // Only an already-saved record: see the note above about the create deadlock.
  if (!record.id || record.id === 'new') return false;
  // `etgoHasCost` is emitted by ProductDefaultsHandler on the single-record GET. Treat an absent
  // flag as "has a cost": a backend that does not send it must never block saving.
  if (record.etgoHasCost === undefined || record.etgoHasCost === null) return false;
  return parseBoolean(record.etgoHasCost) !== true;
}

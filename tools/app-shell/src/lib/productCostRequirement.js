import { parseBoolean } from '@/lib/parseBoolean.js';

/**
 * Whether a product must have a cost defined before it can be saved (ETP-5245).
 *
 * Without an `M_Costing` row the costing engine throws `@NoStandardCostDefined@` the first time
 * the product is shipped, received or counted — long after the person who created it has moved
 * on. The Product window therefore warns while the record is still in front of that person, and
 * refuses to save until a cost line exists.
 *
 * Applies to EVERY product type. It originally covered only stocked `Item` products (the shape
 * the costing engine values, and the one the ticket described), but the rule was widened by
 * product decision: a cost is now expected on services, expenses and resources too, so the copy
 * no longer mentions stock either. The narrower reading is preserved in git history if it ever
 * needs to come back.
 *
 * Deliberately NOT applied while creating the product: the Costing tab needs a saved record to
 * hang its lines from (`requireSavedRecord`), so blocking the first save would make a product
 * impossible to create at all.
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

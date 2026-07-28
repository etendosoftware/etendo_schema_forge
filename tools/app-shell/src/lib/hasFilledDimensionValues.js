import { resolveIdentifier } from './resolveIdentifier.js';

/**
 * True when at least one of `fields` has a value on `row` — used to switch the
 * "Add dimensions" hover action to "Edit dimensions" once a line already has
 * dimension values set (ETP-4610).
 */
export function hasFilledDimensionValues(row, fields) {
  return fields.some(f => Boolean(resolveIdentifier(row, f.key)));
}

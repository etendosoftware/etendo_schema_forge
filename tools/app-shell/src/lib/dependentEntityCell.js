/**
 * Decide how one CSV cell should be handed to `resolveOrAutoCreateDependentEntity` when a
 * window exposes a SINGLE column for a dependent entity (a category) instead of the
 * separate code/name columns it used to.
 *
 * The resolver treats its three inputs very differently:
 *   - `code`          → exact, case-sensitive match against the record's searchKey; when
 *                       nothing matches it is ALSO used verbatim as the new record's code.
 *   - `fallbackValue` → collapses into `name`, so it only ever matches by name, and an
 *                       auto-create derives the code via `deriveCodeFromName`
 *                       ("Distribución Especial" → "DISTRIBUCION_ESPECIAL").
 *
 * So neither input alone serves one merged column: `fallbackValue` cannot resolve a cell
 * holding a code (it tries to CREATE "CLIENTS", which then trips the key-conflict guard
 * against the existing record actually keyed CLIENTS), and `code` would make every
 * auto-created record take the raw display name as its code.
 *
 * Probing the already-fetched record list first keeps both behaviours: a cell that IS an
 * existing code resolves through the code path, anything else stays a name.
 *
 * @param {string} cell Raw cell text.
 * @param {Array<{searchKey?:string, value?:string, code?:string}>} existingRecords
 *   The same list handed to the resolver — no extra fetch.
 * @returns {{code:string}|{fallbackValue:string}} Spread straight into the resolver call.
 */
export function asDependentEntityInput(cell, existingRecords = []) {
  const trimmed = String(cell ?? '').trim();
  const matchesExistingCode = existingRecords.some(
    (record) => String(record.searchKey ?? record.value ?? record.code ?? '').trim() === trimmed,
  );
  return matchesExistingCode ? { code: trimmed } : { fallbackValue: trimmed };
}

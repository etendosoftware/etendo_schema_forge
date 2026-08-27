/**
 * Resolve a free-text CSV cell into the code AD actually stores for a List
 * (`AD_Ref_List.value`) or Yes/No column.
 *
 * The import pipeline has no generic mechanism for this. `matchEntity` FK resolution
 * (`resolveForeignKeys.js`) goes through simSearch against a DAL **entity name**, and an
 * AD reference list is not an entity — so a column like `EM_OBTIK_Tax_ID_Key` (values
 * '1'…'7') or `ProductType` ('I'/'S'/'E'/'R'/'O') can only be resolved by mapping the
 * human text a user actually types ("NIF", "Servicio") onto its code. Each descriptor
 * declares its own synonym table; this module owns the matching rules so contacts and
 * product can't drift apart.
 *
 * Matching is accent- and case-insensitive with collapsed whitespace, mirroring
 * `mapColumns.js`'s own `normalizeHeader` so a cell behaves like a header does: "Servicio",
 * "servicio" and "SERVICIO" are the same value, and so are "Compañía" and "compania".
 *
 * NOTE: the raw row reaches a descriptor unmodified — `ImportDialog` passes
 * `entry.row` straight to `buildOperations` and never substitutes resolved values — so
 * this runs at operation-build time, per row, not during the preview.
 */

/** Accent-stripped, lower-cased, whitespace-collapsed form used for every comparison. */
export function normalizeCodedInput(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Match one cell against a `{ code: [synonym, …] }` table.
 *
 * The code itself is always accepted, so a CSV exported from Etendo (which carries raw
 * codes) round-trips without needing a synonym entry for every value.
 *
 * @returns {{status:'blank'}|{status:'resolved',code:string}|{status:'invalid'}}
 *   'blank' is deliberately distinct from 'invalid': an empty cell means "the row says
 *   nothing about this field", which must fall back to the column's default rather than
 *   fail the row — the exact distinction whose absence caused ETP-4995's P0 blocker.
 */
export function resolveCodedValue(raw, acceptedByCode) {
  if (raw == null || String(raw).trim() === '') return { status: 'blank' };
  const normalized = normalizeCodedInput(raw);
  for (const [code, synonyms] of Object.entries(acceptedByCode)) {
    if (normalizeCodedInput(code) === normalized) return { status: 'resolved', code };
    if ((synonyms || []).some((synonym) => normalizeCodedInput(synonym) === normalized)) {
      return { status: 'resolved', code };
    }
  }
  return { status: 'invalid' };
}

/**
 * Human-readable list of what a column accepts, for the row-level error message a user
 * sees in the review queue — e.g. `1 (NIF), 2 (NOI), …`. Without this the user only ever
 * learns a value was rejected, never which ones would have worked.
 */
export function describeAcceptedValues(acceptedByCode) {
  return Object.entries(acceptedByCode)
    .map(([code, synonyms]) => (synonyms?.length ? `${code} (${synonyms[0]})` : code))
    .join(', ');
}

/**
 * Resolve one AD-coded cell into the value the column stores, or fail the row.
 *
 * Blank falls back to the column's own AD default — a row that says nothing about a field
 * must not be rejected. An unrecognized value fails THIS row with a message naming what the
 * column accepts, instead of letting the backend answer with an opaque 400.
 *
 * @throws {Error} when the cell holds something the column cannot store.
 */
export function resolveCodedCellOrThrow(raw, acceptedByCode, { defaultCode, fieldLabelKey, fieldLabelFallback, translate }) {
  const resolution = resolveCodedValue(raw, acceptedByCode);
  if (resolution.status === 'blank') return defaultCode;
  if (resolution.status === 'resolved') return resolution.code;
  const accepted = describeAcceptedValues(acceptedByCode);
  const field = typeof translate === 'function' ? translate(fieldLabelKey) : fieldLabelFallback;
  const message = typeof translate === 'function'
    ? translate('importErrorInvalidCodedValue', { value: raw, field, accepted })
    : `"${raw}" is not a valid value for "${fieldLabelFallback}". Accepted values: ${accepted}.`;
  throw new Error(message);
}

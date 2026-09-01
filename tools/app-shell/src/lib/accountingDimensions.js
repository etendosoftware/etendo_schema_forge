/**
 * Accounting-dimension gating for contract-driven forms.
 *
 * A window's generated field descriptors carry the AD column they came from, which is enough to
 * recognise an accounting dimension without any per-window configuration: the same three columns
 * mean the same three dimensions everywhere in Etendo (the authoritative mapping lives in Core's
 * `DimensionDisplayUtility.columnDimensionMap`).
 *
 * Only the dimensions Etendo GO actually exposes as document dimensions are listed. `C_BPartner_ID`
 * is deliberately absent: on a matching rule the contact is a *matching criterion*, and on the
 * finacc transaction form it is documented as always visible — gating it by the chart of accounts
 * would hide a field that is not really a dimension in these surfaces.
 */
export const DIMENSION_KEY_BY_COLUMN = Object.freeze({
  C_PROJECT_ID: 'project',
  C_COSTCENTER_ID: 'costcenter',
  M_PRODUCT_ID: 'product',
});

/** The dimension key a field descriptor represents, or `null` when it is not a dimension. */
export function dimensionKeyOf(field) {
  const column = field?.column;
  if (!column) return null;
  return DIMENSION_KEY_BY_COLUMN[String(column).toUpperCase()] ?? null;
}

/** True when at least one descriptor is an accounting dimension (i.e. gating is worth a request). */
export function hasDimensionFields(fields) {
  return (fields ?? []).some(f => dimensionKeyOf(f) !== null);
}

/**
 * Drops the dimension fields whose dimension is not active.
 *
 * Fails **open**: while `activeDimensions` is unknown (`null`/`undefined` — the request has not
 * resolved, or it failed) every field is kept, the same policy `useAccountingDimensionFields` uses
 * for the display-logic route. Hiding a field the user configured is worse than briefly showing one
 * they cannot use.
 */
export function filterByActiveDimensions(fields, activeDimensions) {
  if (!Array.isArray(activeDimensions)) return fields;
  const active = new Set(activeDimensions);
  return (fields ?? []).filter(f => {
    const key = dimensionKeyOf(f);
    return key === null || active.has(key);
  });
}

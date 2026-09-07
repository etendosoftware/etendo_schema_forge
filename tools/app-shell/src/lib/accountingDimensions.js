/**
 * Accounting-dimension gating for contract-driven forms.
 *
 * A window's generated field descriptors carry the AD column they came from, which is enough to
 * recognise an accounting dimension without any per-window configuration: the same columns mean the
 * same dimensions everywhere in Etendo (the authoritative mapping lives in Core's
 * `DimensionDisplayUtility.columnDimensionMap`).
 *
 * `C_BPartner_ID` used to be deliberately absent, on the grounds that "on a matching rule the contact
 * is a matching criterion". That was wrong: the engine only ever matches on `textPattern` (see
 * `MatchRuleEngine#matches`) — the rule's contact is *assigned* to the movement it generates, exactly
 * like project, cost centre and product. So it is gated like them (ETP-4950 QA round). The other half
 * of that note still holds: on the New Movement form the contact is a first-class field, and it stays
 * ungated there because that form does not route its contact through this filter.
 */
export const DIMENSION_KEY_BY_COLUMN = Object.freeze({
  C_PROJECT_ID: 'project',
  C_COSTCENTER_ID: 'costcenter',
  M_PRODUCT_ID: 'product',
  C_BPARTNER_ID: 'bpartner',
});

/**
 * The subset that makes a form worth asking the backend about.
 *
 * `C_BPartner_ID` is excluded ON PURPOSE: it appears on dozens of windows that do not implement
 * `?action=activeDimensions`, and letting it trigger the fetch would fire a request that 404s on all
 * of them. A form that carries a real dimension already triggers the fetch, and once the answer is in
 * `filterByActiveDimensions` gates the contact too.
 */
const FETCH_TRIGGER_COLUMNS = Object.freeze(['C_PROJECT_ID', 'C_COSTCENTER_ID', 'M_PRODUCT_ID']);

/** The dimension key a field descriptor represents, or `null` when it is not a dimension. */
export function dimensionKeyOf(field) {
  const column = field?.column;
  if (!column) return null;
  return DIMENSION_KEY_BY_COLUMN[String(column).toUpperCase()] ?? null;
}

/** True when at least one descriptor is an accounting dimension (i.e. gating is worth a request). */
export function hasDimensionFields(fields) {
  return (fields ?? []).some(f => {
    const column = f?.column;
    return column ? FETCH_TRIGGER_COLUMNS.includes(String(column).toUpperCase()) : false;
  });
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

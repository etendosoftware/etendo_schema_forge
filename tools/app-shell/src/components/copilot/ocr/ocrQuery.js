/**
 * Search URLs for the OCR lookups — vendor, vendor address, product, tax.
 *
 * None of them may carry a raw HQL predicate (`_neoWhere`). A query string like
 * `name = 'ACME' and active = true` is exactly what the production edge WAF blocks as SQL
 * injection: every lookup answered 403 in production while working locally, where there is
 * no WAF. The vendor was never auto-matched, the vendor picker listed nothing, and the invoice
 * was posted without `partnerAddress` and died on the C_Invoice NOT NULL constraint.
 *
 * Two shapes are safe, and they are the two the rest of the app already sends in production:
 *   - a NEO selector (`.../<entity>/selectors/<COLUMN>`) takes the typed text as a plain `q`;
 *   - a CRUD list takes SmartClient `criteria=<JSON>`, the same parameter `useEntity` sends
 *     for every grid filter.
 */

const SELECTOR_SEGMENT = '/selectors/';

/**
 * Sibling spec URL: `<host>/sws/neo/purchase-invoice` → `<host>/sws/neo/<spec>`.
 * Same derivation `deriveContactsApiBase` uses for the contacts spec.
 */
export function deriveSpecBase(apiBaseUrl, spec) {
  if (!apiBaseUrl) return `/sws/neo/${spec}`;
  return apiBaseUrl.replace(/\/[^/]+$/, `/${spec}`);
}

/**
 * `<spec base>/<entity>/selectors/<column>`, derived from the host spec URL.
 */
export function deriveSelectorUrl(apiBaseUrl, spec, entity, column) {
  return `${deriveSpecBase(apiBaseUrl, spec)}/${entity}${SELECTOR_SEGMENT}${column}`;
}

export function isSelectorUrl(url) {
  return String(url || '').includes(SELECTOR_SEGMENT);
}

/**
 * Active records whose name contains `text` (case-insensitive), as a CRUD `criteria` value.
 */
export function buildNameSearchCriteria(text) {
  const criteria = [{ fieldName: 'active', operator: 'equals', value: true }];
  const trimmed = String(text ?? '').trim();
  if (trimmed) criteria.unshift({ fieldName: 'name', operator: 'iContains', value: trimmed });
  return { _constructor: 'AdvancedCriteria', operator: 'and', criteria };
}

/**
 * Full search URL for either endpoint shape.
 *
 * @param {string} url      selector URL or CRUD list URL
 * @param {object} options
 * @param {string} [options.query]  text the user typed / the OCR extracted
 * @param {number} [options.limit]
 * @param {object} [options.params] extra plain params (selector context such as `isVendor`)
 */
export function buildSearchUrl(url, { query, limit, params } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value != null && value !== '') search.set(key, String(value));
  }
  const trimmed = String(query ?? '').trim();
  if (isSelectorUrl(url)) {
    if (trimmed) search.set('q', trimmed);
  } else {
    search.set('criteria', JSON.stringify(buildNameSearchCriteria(trimmed)));
  }
  if (limit != null) search.set('limit', String(limit));
  return `${url}?${search.toString()}`;
}

/**
 * Rows of either response shape, normalized to `{ id, name }`. A selector answers
 * `{ items: [{ id, label }] }`, a CRUD list `{ response: { data: [...] } }`.
 */
export function readSearchRows(json) {
  if (Array.isArray(json?.items)) {
    return json.items
      .filter((item) => item?.id)
      .map((item) => ({ ...item, name: item.name ?? item.label ?? item._identifier ?? item.id }));
  }
  const data = json?.response?.data ?? json?.data ?? [];
  return Array.isArray(data) ? data : [];
}

/**
 * ETP-5525 — cross-spec invalidation of the shared record cache after a successful write.
 *
 * `useEntity` invalidates only its OWN spec after a mutation. But some specs carry values
 * the backend derives from OTHER specs' documents: the order header's `needsPrimaryDoc` /
 * `needsInvoiceDoc` annotations (ETP-5295) are computed from its shipments and invoices. Writing one of those child documents (edit a line, confirm, void, delete, create
 * an invoice from it…) changes the order's answer, yet the order record cached a few seconds
 * earlier stays "fresh" for `recordStaleTime` (30 s) and is served on the next client-side
 * arrival — e.g. through a Related Documents chip — with the old flags, so the order's
 * "Gestionar envío" button stayed hidden until a full reload.
 *
 * The map below is the ONE place that declares those dependencies: a successful non-GET
 * request whose URL targets a spec on the left marks every cached query of the specs on the
 * right stale, so the next read refetches. It is applied centrally by `useApiFetch`, so every
 * hook-based write path (generic `useEntity`, `useDocumentAction`, confirm modals, custom
 * window actions) is covered without touching each call site. Over-invalidation is the safe
 * direction: a stale mark costs at most one extra GET on the next read.
 *
 * Add an entry when a new spec starts showing values derived from another spec's documents.
 * Only the Sales side is declared (ETP-5525 is a Sales ticket): the Purchase equivalent
 * (`goods-receipt` / `purchase-invoice` → `purchase-order`) is owned by the Purchase cell and
 * is just two more entries here.
 *
 * ETP-5571 adds a second map, `WRITE_INVALIDATES_ENTITIES`, for caches keyed by entity rather
 * than by spec — see its own comment below.
 */
export const WRITE_INVALIDATES_SPECS = Object.freeze({
  'goods-shipment': Object.freeze(['sales-order']),
  'sales-invoice': Object.freeze(['sales-order']),
});

/**
 * ETP-5571 — cache entities (not specs) whose entries a write to the spec on the left makes
 * stale. Selector option pages are cached under `entity: 'selector'` (`CreatableSearchSelect`,
 * `SelectorInput`) for `catalogStaleTime` (5 min), keyed by the selector URL of the document
 * that shows them — so they carry no spec of their own that `WRITE_INVALIDATES_SPECS` could
 * name. Renaming a contact in Contactos therefore left every document's Contacto selector
 * serving the old name until a full reload.
 *
 * `contacts → selector` marks EVERY cached selector page stale, not only the Contacto ones:
 * a selector entry does not say which table its options come from, and a stale mark costs at
 * most one extra GET the next time a selector is opened. Deliberately scoped to `contacts`;
 * other master-data specs are added here when a ticket needs them.
 */
export const WRITE_INVALIDATES_ENTITIES = Object.freeze({
  contacts: Object.freeze(['selector']),
});

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True for a request method that can change server state. Defaults to GET like `fetch`. */
export function isWriteMethod(method) {
  return !READ_METHODS.has(String(method || 'GET').toUpperCase());
}

/**
 * Specs whose cache a write to `url` makes stale — matched by whole path segment, so a
 * `goodsShipment` entity or a `?criteria=goods-shipment` query value never matches.
 *
 * @param {string} url the request URL (relative or absolute, base already prepended)
 * @returns {string[]} de-duplicated spec names, empty when the URL writes to no mapped spec
 */
export function specsInvalidatedByWrite(url) {
  return dependentsByPathSegment(url, WRITE_INVALIDATES_SPECS);
}

/**
 * Cache entities whose entries a write to `url` makes stale — same whole-path-segment matching
 * as `specsInvalidatedByWrite`, so a `?bp=contacts` query value or a `contactsX` segment never
 * matches.
 *
 * @param {string} url the request URL (relative or absolute, base already prepended)
 * @returns {string[]} de-duplicated entity names, empty when the URL writes to no mapped spec
 */
export function entitiesInvalidatedByWrite(url) {
  return dependentsByPathSegment(url, WRITE_INVALIDATES_ENTITIES);
}

function dependentsByPathSegment(url, map) {
  if (typeof url !== 'string' || !url) return [];
  const path = url.split(/[?#]/, 1)[0];
  const result = new Set();
  for (const segment of path.split('/')) {
    const dependents = Object.hasOwn(map, segment) ? map[segment] : null;
    if (dependents) dependents.forEach((name) => result.add(name));
  }
  return [...result];
}

/**
 * Marks the dependent specs and cache entities of a successful write stale in `cache`. No-op
 * without a cache (no DataProvider mounted), for read methods, and for URLs that target no
 * mapped spec.
 *
 * @param {{ invalidate: (pattern: object) => number } | null | undefined} cache
 * @param {{ url: string, method?: string }} request
 */
export function invalidateAfterWrite(cache, { url, method } = {}) {
  if (!cache || !isWriteMethod(method)) return;
  for (const spec of specsInvalidatedByWrite(url)) {
    cache.invalidate({ spec });
  }
  for (const entity of entitiesInvalidatedByWrite(url)) {
    cache.invalidate({ entity });
  }
}

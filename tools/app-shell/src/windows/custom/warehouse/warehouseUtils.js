// A product with no cost line arrives with etgoCost / etgoValuation = null. That is NOT the same
// as a cost of 0: the first means "no cost defined" and the second is a real cost. Keep the
// difference all the way to the screen (ETP-5555), so only null renders the "—" placeholder.
function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Deduplicate M_Storage_Detail rows by product, summing qtyOnHand and etgoValuation.
 * The unit cost (etgoCost) is per-product, identical across bins, so it is taken as-is
 * (not summed) — cost × total qty always reconciles with the summed valuation.
 *
 * `cost` and `valuation` stay `null` while no row of the product carries a value (a product with
 * no cost line), and a real 0 stays 0. Only the numeric rows are summed into the valuation.
 *
 * Returns ALL aggregated products, including zero and negative quantities — no qty
 * filter is applied here. Each consumer has a different intended semantic (show
 * non-zero stock, count non-zero stock, or count strictly-positive stock for a KPI),
 * so the qty predicate must be applied explicitly at each call site.
 */
export function aggregateProducts(rows, uomMap = {}) {
  const map = new Map();
  for (const row of rows) {
    const id = row.product ?? 'unknown';
    const label = row['product$_identifier'] ?? id;
    const uomId = row.uOM ?? '';
    const uom = uomMap[uomId] ?? row['uOM$_identifier'] ?? uomId;
    const qty = Number(row.quantityOnHand) || 0;
    const valuation = numberOrNull(row.etgoValuation);
    const cost = numberOrNull(row.etgoCost);
    if (map.has(id)) {
      const product = map.get(id);
      product.qty += qty;
      if (valuation !== null) product.valuation = (product.valuation ?? 0) + valuation;
      if (product.cost === null) product.cost = cost;
    } else {
      map.set(id, { id, label, uom, qty, valuation, cost });
    }
  }
  return Array.from(map.values());
}

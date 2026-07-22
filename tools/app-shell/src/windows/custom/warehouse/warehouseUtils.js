/**
 * Deduplicate M_Storage_Detail rows by product, summing qtyOnHand and etgoValuation.
 * The unit cost (etgoCost) is per-product, identical across bins, so it is taken as-is
 * (not summed) — cost × total qty always reconciles with the summed valuation.
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
    const valuation = Number(row.etgoValuation) || 0;
    const cost = Number(row.etgoCost) || 0;
    if (map.has(id)) {
      map.get(id).qty += qty;
      map.get(id).valuation += valuation;
    } else {
      map.set(id, { id, label, uom, qty, valuation, cost });
    }
  }
  return Array.from(map.values());
}

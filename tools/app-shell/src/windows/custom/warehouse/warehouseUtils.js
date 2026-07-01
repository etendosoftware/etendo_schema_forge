/** Deduplicate M_Storage_Detail rows by product, summing qtyOnHand and etgoValuation. */
export function aggregateProducts(rows, uomMap = {}) {
  const map = new Map();
  for (const row of rows) {
    const id = row.product ?? 'unknown';
    const label = row['product$_identifier'] ?? id;
    const uomId = row.uOM ?? '';
    const uom = uomMap[uomId] ?? row['uOM$_identifier'] ?? uomId;
    const qty = Number(row.quantityOnHand) || 0;
    const valuation = Number(row.etgoValuation) || 0;
    if (map.has(id)) {
      map.get(id).qty += qty;
      map.get(id).valuation += valuation;
    } else {
      map.set(id, { id, label, uom, qty, valuation });
    }
  }
  return Array.from(map.values()).filter(p => p.qty > 0);
}

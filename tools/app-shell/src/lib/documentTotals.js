/**
 * computeDocumentTotals — pure aggregation for DocumentTotalsPanel.
 *
 * Returns null for any total that cannot be computed because the required
 * lineConfig fields are missing or the lines array is empty.
 *
 * @param lines         - array of line row objects (hook.children)
 * @param pendingLine   - optional in-progress add-row values (live snapshot)
 * @param editingLine   - optional sidebar editing values (live snapshot)
 * @param lineConfig    - { qtyField, priceField, discountField, grossField }
 * @param totalDiscountPct - optional document-level discount percentage (0–100)
 */

// Product id of the ETGO_DTO total-discount line (com.etendoerp.go). When
// this product appears in the line list, the discount is already materialised
// in the lines and the panel must NOT re-apply the etgoTotalDiscount factor
// (otherwise we double-count the discount; see ETP-4015).
export const ETGO_DTO_PRODUCT_ID = 'E4BC94E71D664E73A066DAF78BF39DB3';

/**
 * Decides which total-discount percentage the panel should apply client-side.
 *
 * <p>If the document already carries an ETGO_DTO line in its line list, the
 * server already materialised the discount inside the lines, so the panel
 * must pass `0` to {@link computeDocumentTotals} — applying the factor on
 * top would double-count the discount (ETP-4015 regression).
 *
 * <p>Otherwise the header's {@code etgoTotalDiscount} (or the optional
 * fallback) is returned so the panel applies the factor in real time as the
 * user edits the lines.
 *
 * @param data    - the header record (may be null/undefined)
 * @param lines   - the current line list (may be null/undefined)
 * @param fallback - optional explicit value passed by the parent component;
 *                  used when {@code data[totalsField]} is missing
 * @param totalsField - the header field that carries the discount pct
 *                      (defaults to "etgoTotalDiscount")
 */
export function resolveTotalDiscountPct(data, lines, fallback = 0, totalsField = 'etgoTotalDiscount') {
  const hasMaterialisedDiscountLine = (lines ?? []).some(
    (l) => l && l.product === ETGO_DTO_PRODUCT_ID,
  );
  if (hasMaterialisedDiscountLine) return 0;
  const fromHeader = data?.[totalsField];
  return Number(fromHeader ?? fallback ?? 0);
}

// Bank-style rounding to 2 decimal places for monetary amounts.
// Used to keep the grand total equal to the sum of the displayed (rounded)
// subtotal and tax — see computeDisplayGrandTotal below.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const NULL_TOTALS = {
  grossSubtotal: null,
  netSubtotal: null,
  grandTotal: null,
  discountAmt: null,
  taxAmt: null,
  totalDiscountAmt: null,
};

function applyEditingLine(lines, editingLine) {
  if (!editingLine?.id) return lines;
  return lines.map(l => l.id === editingLine.id ? { ...l, ...editingLine } : l);
}

function collectLines(lines, pendingLine, editingLine) {
  const safeLines = lines || [];
  const effectiveLines = applyEditingLine(safeLines, editingLine);
  return pendingLine ? [...effectiveLines, pendingLine] : effectiveLines;
}

function sumGross(lines, qtyField, priceField) {
  return lines.reduce((sum, line) => {
    const qty = parseFloat(line[qtyField] ?? 0) || 0;
    const price = parseFloat(line[priceField] ?? 0) || 0;
    return sum + qty * price;
  }, 0);
}

function sumNet(lines, qtyField, priceField, discountField) {
  return lines.reduce((sum, line) => {
    const qty = parseFloat(line[qtyField] ?? 0) || 0;
    const price = parseFloat(line[priceField] ?? 0) || 0;
    const disc = discountField ? (parseFloat(line[discountField] ?? 0) || 0) : 0;
    return sum + qty * price * (1 - disc / 100);
  }, 0);
}

function sumGrossField(lines, grossField) {
  return lines.reduce((sum, line) => sum + (parseFloat(line[grossField] ?? 0) || 0), 0);
}

// grandTotal is the sum of the rounded (displayed) subtotal and tax — NOT
// round(exact_subtotal + exact_tax). This matches the accounting/legal
// convention used by Etendo Classic and AEAT-compliant invoices: the printed
// total must equal the visible "subtotal" plus "tax" lines, with no 1-cent
// double-rounding drift (e.g. 37.224 + 3.7224 → displayed 37.22 + 3.72 = 40.94,
// not round(40.9464) = 40.95).
function computeDisplayGrandTotal(baseGrandTotal, netSubtotal, taxAmt, factor) {
  if (baseGrandTotal == null) return null;
  if (netSubtotal == null) return round2(baseGrandTotal * factor);
  return round2(netSubtotal * factor) + round2(taxAmt);
}

export function computeDocumentTotals(
  lines,
  pendingLine,
  editingLine,
  lineConfig,
  totalDiscountPct = 0,
) {
  if (!lineConfig) return NULL_TOTALS;

  const { qtyField, priceField, discountField, grossField } = lineConfig;
  const allLines = collectLines(lines, pendingLine, editingLine);
  const canSumLines = !!(qtyField && priceField);

  const grossSubtotal = canSumLines ? sumGross(allLines, qtyField, priceField) : null;
  const netSubtotal = canSumLines ? sumNet(allLines, qtyField, priceField, discountField) : null;
  // baseGrandTotal: sum of line-level grossField (includes tax, before total discount).
  const baseGrandTotal = grossField ? sumGrossField(allLines, grossField) : null;

  const discountAmt = (grossSubtotal != null && netSubtotal != null)
    ? grossSubtotal - netSubtotal
    : null;

  // Total discount amount applied on top of per-product discounts.
  // When a total discount is active, scale both grandTotal and taxAmt
  // proportionally: taxAmt_new = taxAmt_base × (1 − pct/100).
  const pct = Math.max(0, Math.min(100, totalDiscountPct || 0));
  const factor = 1 - pct / 100;
  const totalDiscountAmt = (netSubtotal != null) ? netSubtotal * pct / 100 : null;

  const taxAmt = (baseGrandTotal != null && netSubtotal != null)
    ? (baseGrandTotal - netSubtotal) * factor
    : null;

  const grandTotal = computeDisplayGrandTotal(baseGrandTotal, netSubtotal, taxAmt, factor);

  return { grossSubtotal, netSubtotal, grandTotal, discountAmt, taxAmt, totalDiscountAmt };
}

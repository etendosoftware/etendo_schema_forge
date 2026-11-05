/**
 * ETP-6080 — numbers behind the interactive report's visuals: the KPI strip and the magnitude bars.
 * Pure, so they are unit-tested apart from the components.
 */

const topLevel = (rows) => {
  const ids = new Set(rows.map((r) => r.node_id));
  return rows.filter((r) => !r.isFormula && (!r.parentId || !ids.has(r.parentId)));
};

function totals(lines, key) {
  let income = 0;
  let expenses = 0;
  for (const r of lines) {
    const v = Number(r[key]) || 0;
    if (v > 0) income += v;
    else expenses -= v;
  }
  const result = income - expenses;
  return { income, expenses, result, margin: income ? (result / income) * 100 : null };
}

/**
 * Ingresos / Gastos / Resultado / Margen from the top-level lines of a result report. Amounts are
 * already shown with the sign the reader expects (revenue +, expenses −), so a positive top line is
 * income and a negative one an expense; the formula subtotals are skipped (they would count twice).
 * shortcut: a line is income or expense by its own sign in each period; a report whose lines flip
 * sign between periods would move them between cards — fine for P&L, revisit for other reports.
 */
export function reportKpis(rows = []) {
  const lines = topLevel(rows);
  return { current: totals(lines, 'amount'), ref: totals(lines, 'amount_ref') };
}

/**
 * Whether a KPI's change is good news. Expenses going up is bad; the rest is good when it grows.
 * Returns 'improves' / 'worsens' / null, the vocabulary of the rows' own `trend`.
 */
export function kpiTrend(key, current, ref) {
  if (current == null || ref == null || current === ref) return null;
  const grew = current > ref;
  return (key === 'expenses' ? !grew : grew) ? 'improves' : 'worsens';
}

/**
 * Bar width (0..1) of a row: its weight within its parent, or, for a top-level line, within the
 * largest top-level line. null for formula rows and zero amounts (no bar).
 */
export function rowShares(rows = []) {
  const byId = new Map(rows.map((r) => [r.node_id, r]));
  const topMax = Math.max(0, ...topLevel(rows).map((r) => Math.abs(Number(r.amount) || 0)));
  const shares = new Map();
  for (const r of rows) {
    const v = Math.abs(Number(r.amount) || 0);
    if (r.isFormula || !v) continue;
    const parent = r.parentId && byId.get(r.parentId);
    const base = parent && !parent.isFormula ? Math.abs(Number(parent.amount) || 0) : topMax;
    if (base) shares.set(r.node_id, Math.min(1, v / base));
  }
  return shares;
}

/** Bar width of each split part: its weight within the parts' total. */
export function splitShares(parts = []) {
  const total = parts.reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0);
  return parts.map((p) => (total ? Math.abs(Number(p.amount) || 0) / total : 0));
}

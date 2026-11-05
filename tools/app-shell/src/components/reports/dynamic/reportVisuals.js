/**
 * ETP-6080 — numbers behind the interactive report's visuals: the KPI strip and the magnitude bars.
 * Pure, so they are unit-tested apart from the components.
 */

const topLevel = (rows) => {
  const ids = new Set(rows.map((r) => r.node_id));
  return rows.filter((r) => !r.isFormula && (!r.parentId || !ids.has(r.parentId)));
};

const isAccount = (r) => /^\d/.test(r?.value ?? '');

/**
 * The pieces the headline figures add up: the first account level under each line (an account whose
 * parent is a heading), plus the top-level lines with no account under them.
 * shortcut: income/expense by Spanish PGC group (7 / 6), the chart this product's P&L is built on;
 * any other account, and a line with no accounts, goes by its own sign — give the contract an
 * explicit mapping when another chart needs it.
 */
function kpiPieces(rows) {
  const byId = new Map(rows.map((r) => [r.node_id, r]));
  const topOf = (r) => {
    let cur = r;
    while (cur.parentId && byId.has(cur.parentId)) cur = byId.get(cur.parentId);
    return cur;
  };
  const accounts = rows.filter((r) => isAccount(r) && !isAccount(byId.get(r.parentId)) && !topOf(r).isFormula);
  const covered = new Set(accounts.map((r) => topOf(r).node_id));
  const group = (r) => ({ 7: 'income', 6: 'expense' }[r.value[0]] ?? null);
  return [
    ...accounts.map((r) => ({ row: r, kind: group(r) })),
    ...topLevel(rows).filter((r) => !covered.has(r.node_id)).map((r) => ({ row: r, kind: null })),
  ];
}

function totals(pieces, key) {
  let income = 0;
  let expenses = 0;
  for (const { row, kind } of pieces) {
    const v = Number(row[key]) || 0;
    // A credit on an expense account (a refund) lowers expenses; it is not income.
    if (kind === 'income' || (!kind && v > 0)) income += v;
    else expenses -= v;
  }
  const result = income - expenses;
  return { income, expenses, result, margin: income ? (result / income) * 100 : null };
}

/**
 * Ingresos / Gastos / Resultado del ejercicio / Margen of a result report. Amounts come signed as
 * the reader expects (income +, expense −), so Resultado = Ingresos − Gastos is the sum of the
 * lines; the formula subtotals are skipped (they would count twice).
 */
export function reportKpis(rows = []) {
  const pieces = kpiPieces(rows);
  return { current: totals(pieces, 'amount'), ref: totals(pieces, 'amount_ref') };
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

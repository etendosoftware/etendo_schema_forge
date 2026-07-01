// Generic client-side evaluator for the AdvancedFilterBuilder condition tree.
// The builder (contract-ui/AdvancedFilterBuilder) only emits the filter object
// — it has no evaluator of its own — so each list (movements, statements) feeds
// its in-memory rows through here.
//
// Filter object shape (emitted by AdvancedFilterBuilder):
//   { rowOperator: 'and' | 'or', conditions: [{ field, operator, value }] }

const lc = (v) => (v == null ? '' : String(v).toLowerCase());
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Numeric comparison with the shared "both sides must be numbers" guard. */
const numCmp = (test) => (raw, value) => {
  const a = num(raw);
  const b = num(value);
  return a != null && b != null && test(a, b);
};

/** Normalizes an `inSet` value (array, or comma-separated string) to an array. */
const toSet = (value) => (Array.isArray(value)
  ? value
  : String(value ?? '').split(',').map((s) => s.trim()));

/**
 * Operator → predicate dispatch table. Each handler receives
 * `(raw, value, field)` and returns whether the row matches.
 */
export const OPERATORS = {
  iContains:    (raw, value) => lc(raw).includes(lc(value)),
  iNotContains: (raw, value) => !lc(raw).includes(lc(value)),
  iEquals:      (raw, value) => lc(raw) === lc(value),
  iNotEqual:    (raw, value) => lc(raw) !== lc(value),
  isNull:       (raw) => raw == null || raw === '',
  isNotNull:    (raw) => raw != null && raw !== '',
  equals:       (raw, value) => (Array.isArray(value)
    ? value.map(lc).includes(lc(raw))
    : lc(raw) === lc(value)),
  notEqual:     (raw, value) => (Array.isArray(value)
    ? !value.map(lc).includes(lc(raw))
    : lc(raw) !== lc(value)),
  inSet:        (raw, value) => toSet(value).map(lc).includes(lc(raw)),
  greaterThan:    numCmp((a, b) => a > b),
  greaterOrEqual: numCmp((a, b) => a >= b),
  lessThan:       numCmp((a, b) => a < b),
  lessOrEqual:    numCmp((a, b) => a <= b),
  between: (raw, value, field) => {
    const [a, b] = Array.isArray(value) ? value : [];
    const isDate = field === 'date' || /date/i.test(field);
    const r = isDate ? Date.parse(raw) : num(raw);
    const lo = isDate ? Date.parse(a) : num(a);
    const hi = isDate ? Date.parse(b) : num(b);
    return r != null && !Number.isNaN(r) && r >= lo && r <= hi;
  },
};

/** Evaluates a single condition against a row. */
export function matchesCondition(row, { field, operator, value }) {
  const handler = OPERATORS[operator];
  // Unknown / incomplete operator → don't filter out.
  return handler ? handler(row[field], value, field) : true;
}

/**
 * Filters `rows` against an advanced-filter value object. `and` → every
 * condition must match; `or` → at least one. A null/empty filter returns the
 * input unchanged.
 *
 * @param {Array<object>} rows
 * @param {object|null} filter
 * @param {(row: object) => object} [deriveRow] optional projection applied to
 *   each row before evaluation (e.g. to add a derived field the columns expose).
 */
export function applyConditions(rows, filter, deriveRow = (r) => r) {
  if (!filter || !Array.isArray(filter.conditions) || filter.conditions.length === 0) {
    return rows;
  }
  const complete = filter.conditions.filter((c) => c && c.field && c.operator);
  if (complete.length === 0) return rows;

  const isOr = filter.rowOperator === 'or';
  return rows.filter((m) => {
    const row = deriveRow(m);
    return isOr
      ? complete.some((c) => matchesCondition(row, c))
      : complete.every((c) => matchesCondition(row, c));
  });
}

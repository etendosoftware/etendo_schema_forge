const OPERATORS = {
  equals: (value, expected) => value === expected,
  notEquals: (value, expected) => value !== expected,
  in: (value, expected) => Array.isArray(expected) && expected.includes(value),
  notIn: (value, expected) => Array.isArray(expected) && !expected.includes(value),
  gt: (value, expected) => Number(value) > Number(expected),
  gte: (value, expected) => Number(value) >= Number(expected),
  lt: (value, expected) => Number(value) < Number(expected),
  lte: (value, expected) => Number(value) <= Number(expected),
};

function matchesExpectation(value, expected) {
  if (Array.isArray(expected)) return OPERATORS.in(value, expected);
  if (expected !== null && typeof expected === 'object') {
    return Object.entries(expected).every(([op, opVal]) => {
      const fn = OPERATORS[op];
      return fn ? fn(value, opVal) : false;
    });
  }
  return OPERATORS.equals(value, expected);
}

/**
 * Evaluate a decisions.json field-condition map against a record.
 * Every top-level field must match (AND) for the condition to hold.
 *
 *   evaluateFieldCondition(true, data)                        // always matches, regardless of record
 *   evaluateFieldCondition({ documentStatus: 'DR' }, data)
 *   evaluateFieldCondition({ documentStatus: ['DR', 'CO'] }, data)
 *   evaluateFieldCondition({ quantity: { gt: 100 } }, data)
 *
 * The literal `true` shape exists for windows whose consuming flag (e.g. the detail-view-only
 * `hidePrintWhen`) needs an unconditional match without falling back to a sibling flag that
 * would also affect an unrelated surface (e.g. the list view's own `hidePrint`) — see
 * `docs/decisions-reference.md` ("Print Visibility") for the concrete case this was added for.
 */
export function evaluateFieldCondition(condition, record) {
  if (condition === true) return true;
  if (!condition || typeof condition !== 'object') return false;
  const safeRecord = record ?? {};
  return Object.entries(condition).every(([field, expected]) =>
    matchesExpectation(safeRecord[field], expected));
}

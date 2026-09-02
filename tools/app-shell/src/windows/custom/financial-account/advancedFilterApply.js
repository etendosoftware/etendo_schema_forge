// Generic client-side evaluator for the AdvancedFilterBuilder condition tree.
// The builder (contract-ui/AdvancedFilterBuilder) only emits the filter object
// — it has no evaluator of its own — so each list (movements, statements) feeds
// its in-memory rows through here.
//
// Filter object shape (emitted by AdvancedFilterBuilder):
//   { rowOperator: 'and' | 'or', conditions: [{ field, operator, value }] }
//
// Operators are dispatched through THREE tables, picked by the filter column's
// resolved mode (see `applyConditions`'s `columnsByKey` argument and `tableFor`):
//
//   date    → DATE_OPERATORS    calendar-day comparisons
//   numeric → NUMBER_OPERATORS  numeric comparisons, decimal-tolerant equality
//   *       → OPERATORS         string/enum predicates (the historical table)
//
// Before ETP-4956 there was only the third table, so a date condition went
// through the string/numeric predicates: `equals` compared the raw
// "2026-09-01T00:00:00Z" against the picker's "2026-09-01" (never equal), and
// `lessThan`/`greaterThan` ran both sides through `parseFloat`, where
// `parseFloat('2026-09-01') === 2026` — i.e. EVERY date collapsed to its year
// and "Before"/"After" could not discriminate at all.

import { parseCalendarDate } from '@/lib/dateOnly';
import { resolveFilterMode } from '@/lib/gridQuery';

/** Case-insensitive string projection. Trims so a stray leading/trailing space
 * in the typed value (or in the stored data) never silently kills a match. */
const lc = (v) => (v == null ? '' : String(v).trim().toLowerCase());

/**
 * Number projection that accepts BOTH decimal separators.
 *
 * The builder normalizes numeric input to canonical dot-decimal before
 * emitting, but a filter preset saved before that landed can still carry a
 * comma-decimal string, so parse defensively here too.
 */
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null || v === '') return null;
  const n = parseFloat(normalizeDecimal(String(v)));
  return Number.isFinite(n) ? n : null;
};

/**
 * Collapses a human-typed number to canonical dot-decimal.
 *
 * With both separators present the LAST one is the decimal (es-ES
 * "1.646,49", en-US "1,646.49"); with a single separator it is the decimal
 * unless the trailing group is exactly three digits, which reads as a
 * thousands group ("1,646" → 1646).
 */
function normalizeDecimal(str) {
  const s = str.trim().replace(/\s/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot === -1 && lastComma === -1) return s;

  let decimalAt;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalAt = Math.max(lastDot, lastComma);
  } else {
    const only = lastDot !== -1 ? lastDot : lastComma;
    // A single separator followed by exactly 3 digits is a thousands group.
    decimalAt = /^\d{3}$/.test(s.slice(only + 1)) ? -1 : only;
  }

  const intPart = (decimalAt === -1 ? s : s.slice(0, decimalAt)).replace(/[.,]/g, '');
  const fracPart = decimalAt === -1 ? '' : s.slice(decimalAt + 1).replace(/[.,]/g, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/** Numeric comparison with the shared "both sides must be numbers" guard. */
const numCmp = (test) => (raw, value) => {
  const a = num(raw);
  const b = num(value);
  return a != null && b != null && test(a, b);
};

/** Calendar-day timestamp, or null when the value isn't a parseable date. */
const dayTime = (v) => parseCalendarDate(v)?.getTime() ?? null;

/** Calendar-day comparison with a "both sides must be dates" guard. */
const dayCmp = (test) => (raw, value) => {
  const a = dayTime(raw);
  const b = dayTime(value);
  return a != null && b != null && test(a, b);
};

/** Decimal places in a user-typed number, floored at 2 (the display scale). */
function comparisonScale(value) {
  const decimals = normalizeDecimal(String(value ?? '')).split('.')[1]?.length ?? 0;
  return Math.min(Math.max(decimals, 2), 6);
}

/**
 * Numeric equality at the precision the user actually typed (min. 2 decimals,
 * the scale amounts are rendered at).
 *
 * The generic `equals` compares strings, so a stored 1646.4867 — displayed as
 * "1.646,49 €" — never matched a typed "1646.49". Comparing both sides rounded
 * to the typed scale makes the filter agree with what the grid shows.
 */
const numEquals = (raw, value) => {
  const a = num(raw);
  const b = num(value);
  if (a == null || b == null) return false;
  const factor = 10 ** comparisonScale(value);
  return Math.round(a * factor) === Math.round(b * factor);
};

/** Normalizes an `inSet` value (array, or comma-separated string) to an array. */
const toSet = (value) => (Array.isArray(value)
  ? value
  : String(value ?? '').split(',').map((s) => s.trim()));

/**
 * "Empty" for a column that stores an absent amount as 0.
 *
 * The statements grid renders `Number(totalOut) > 0 ? amount : '—'`, so 0 and
 * null are visually identical there. `emptyWhenZero: true` on such a column
 * makes "Is empty" match exactly the rows that display "—" (ETP-4956).
 */
const isBlank = (raw, col) => (col?.emptyWhenZero
  ? !(Number(raw) > 0)
  : raw == null || String(raw).trim() === '');

/**
 * Operator → predicate dispatch table for string / enum / identifier columns.
 * Each handler receives `(raw, value, field)` and returns whether the row
 * matches.
 */
export const OPERATORS = {
  iContains:    (raw, value) => lc(raw).includes(lc(value)),
  iNotContains: (raw, value) => !lc(raw).includes(lc(value)),
  iStartsWith:  (raw, value) => lc(raw).startsWith(lc(value)),
  iEquals:      (raw, value) => lc(raw) === lc(value),
  iNotEqual:    (raw, value) => lc(raw) !== lc(value),
  isNull:       (raw) => raw == null || String(raw).trim() === '',
  isNotNull:    (raw) => raw != null && String(raw).trim() !== '',
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
    // Legacy field-name heuristic, kept for the no-metadata fallback path.
    // With column metadata the date/number tables below take precedence.
    const isDate = field === 'date' || /date/i.test(field);
    const r = isDate ? Date.parse(raw) : num(raw);
    const lo = isDate ? Date.parse(a) : num(a);
    const hi = isDate ? Date.parse(b) : num(b);
    return r != null && !Number.isNaN(r) && r >= lo && r <= hi;
  },
};

/**
 * Date columns. Operator set offered by the builder for `mode: 'date'`:
 * equals / lessThan ("Before") / greaterThan ("After") / between / null checks.
 *
 * All comparisons go through `parseCalendarDate`, which reads the `yyyy-MM-dd`
 * prefix and rebuilds the Date with the LOCAL constructor — so a stored
 * "2026-09-01T00:00:00Z" stays September 1st west of UTC instead of rolling
 * back a day (the ETP-4850 class of bug).
 */
export const DATE_OPERATORS = {
  isNull:      OPERATORS.isNull,
  isNotNull:   OPERATORS.isNotNull,
  equals:      dayCmp((a, b) => a === b),
  // A row with no date genuinely "is not" the given date, so — unlike the
  // ordering operators, which cannot place an absent value — notEqual keeps the
  // permissive semantics the generic string table had.
  notEqual:    (raw, value) => !DATE_OPERATORS.equals(raw, value),
  lessThan:       dayCmp((a, b) => a < b),
  lessOrEqual:    dayCmp((a, b) => a <= b),
  greaterThan:    dayCmp((a, b) => a > b),
  greaterOrEqual: dayCmp((a, b) => a >= b),
  between: (raw, value) => {
    const [from, to] = Array.isArray(value) ? value : [];
    const r = dayTime(raw);
    const lo = dayTime(from);
    const hi = dayTime(to);
    return r != null && lo != null && hi != null && r >= lo && r <= hi;
  },
};

/**
 * Number columns. Same comparison operators as the generic table, but
 * `equals`/`notEqual` compare NUMERICALLY at the typed precision instead of
 * comparing strings.
 */
export const NUMBER_OPERATORS = {
  isNull:      OPERATORS.isNull,
  isNotNull:   OPERATORS.isNotNull,
  equals:      numEquals,
  // See the DATE_OPERATORS.notEqual note: an absent amount is not equal to any
  // number, matching the previous generic-table behaviour.
  notEqual:    (raw, value) => !numEquals(raw, value),
  greaterThan:    OPERATORS.greaterThan,
  greaterOrEqual: OPERATORS.greaterOrEqual,
  lessThan:       OPERATORS.lessThan,
  lessOrEqual:    OPERATORS.lessOrEqual,
  between: (raw, value) => {
    const [from, to] = Array.isArray(value) ? value : [];
    const r = num(raw);
    const lo = num(from);
    const hi = num(to);
    return r != null && lo != null && hi != null && r >= lo && r <= hi;
  },
};

/**
 * Picks the operator table for a column.
 *
 * Resolution goes through `resolveFilterMode` — the SAME helper the
 * AdvancedFilterBuilder uses to decide which operators to offer — so the
 * evaluator can never disagree with the UI about a column's kind. That matters
 * beyond `type: 'number'`: `amount`, `percent` and `signedDelta` all resolve to
 * the numeric mode, and honouring an explicit `col.filterMode` is the
 * documented escape hatch for a `custom` column.
 */
function tableFor(col) {
  if (!col) return OPERATORS;
  const mode = resolveFilterMode(col);
  if (mode === 'date') return DATE_OPERATORS;
  if (mode === 'numeric') return NUMBER_OPERATORS;
  return OPERATORS;
}

/**
 * Evaluates a single condition against a row.
 *
 * @param {object} row
 * @param {{ field: string, operator: string, value: unknown }} condition
 * @param {Record<string, { type?: string, emptyWhenZero?: boolean }>} [columnsByKey]
 *   filter-column metadata keyed by field; when absent every operator falls
 *   back to the generic string table (historical behaviour).
 */
export function matchesCondition(row, { field, operator, value }, columnsByKey = null) {
  const col = columnsByKey?.[field] ?? null;

  // Null checks need the column to know whether a stored 0 counts as empty.
  if (operator === 'isNull') return isBlank(row[field], col);
  if (operator === 'isNotNull') return !isBlank(row[field], col);

  const handler = tableFor(col)[operator] ?? OPERATORS[operator];
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
 * @param {Record<string, { type?: string, emptyWhenZero?: boolean }>} [columnsByKey]
 *   filter-column metadata, so operators dispatch by declared type instead of
 *   guessing from the value's shape or the field's name.
 */
export function applyConditions(rows, filter, deriveRow = (r) => r, columnsByKey = null) {
  if (!filter || !Array.isArray(filter.conditions) || filter.conditions.length === 0) {
    return rows;
  }
  const complete = filter.conditions.filter((c) => c && c.field && c.operator);
  if (complete.length === 0) return rows;

  const isOr = filter.rowOperator === 'or';
  return rows.filter((m) => {
    const row = deriveRow(m);
    return isOr
      ? complete.some((c) => matchesCondition(row, c, columnsByKey))
      : complete.every((c) => matchesCondition(row, c, columnsByKey));
  });
}

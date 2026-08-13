// Advanced ("by conditions") filter for the payment Invoices table — reuses the
// generic AdvancedFilterBuilder from contract-ui (the same component the Sales
// Order / list grids use) and filters the in-memory invoice array CLIENT-SIDE.
// The builder only emits the condition tree; it has no evaluator of its own.
//
// Filter object shape (emitted by AdvancedFilterBuilder):
//   { rowOperator: 'and' | 'or', conditions: [{ field, operator, value }] }

import { ESTADOS, estadoOf } from './paymentData';

/**
 * Filterable column metadata for the AdvancedFilterBuilder. Types drive the
 * operator set (string → contains/is, amount → numeric comparisons, date →
 * before/after/between, enum → is/in-set). Labels are Spanish literals to match
 * the table headers (this component is not yet i18n-keyed).
 */
export function buildInvoiceFilterColumns() {
  const estadoLabels = Object.fromEntries(ESTADOS);
  return [
    { key: 'no',       label: 'Nº factura',           type: 'string' },
    // 'selector' → identifier mode in the builder: a checkbox multi-picker that
    // lists the available values (from the loaded invoices) so the user can
    // filter by several at once (e.g. Efectivo + Transferencia, or two contacts).
    { key: 'metodo',   label: 'Método de pago',       type: 'selector' },
    { key: 'bp',       label: 'Contacto',             type: 'selector' },
    { key: 'venc',     label: 'Vencimiento',          type: 'date' },
    { key: 'fecha',    label: 'Fecha de la factura',  type: 'date' },
    { key: 'estado',   label: 'Estado de vencimiento', type: 'enum', enumLabels: estadoLabels },
    { key: 'total',    label: 'Importe facturado',    type: 'amount' },
    { key: 'expected', label: 'Importe esperado',     type: 'amount' },
    { key: 'pend',     label: 'Pendiente',            type: 'amount' },
  ];
}

/** Fields whose raw value is a dd/MM/yyyy string and must be compared as dates. */
const DATE_FIELDS = new Set(['venc', 'fecha']);

const lc = (v) => (v == null ? '' : String(v).toLowerCase());
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** "dd/MM/yyyy" → epoch ms (local midnight); NaN when unparseable. */
function dmyToMs(s) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s || ''));
  return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : NaN;
}
/** ISO "yyyy-MM-dd" (date-input value) → epoch ms (local midnight); NaN when empty. */
function isoToMs(s) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
}

/** Numeric comparison with the shared "both sides must be numbers" guard. */
const numCmp = (test) => (raw, value) => {
  const a = num(raw);
  const b = num(value);
  return a != null && b != null && test(a, b);
};

/** Date comparison: raw is dd/MM/yyyy, value is the ISO date-input string. */
const dateCmp = (test) => (raw, value) => {
  const a = dmyToMs(raw);
  const b = isoToMs(value);
  return !Number.isNaN(a) && !Number.isNaN(b) && test(a, b);
};

const toSet = (value) => (Array.isArray(value)
  ? value
  : String(value ?? '').split(',').map((s) => s.trim()));

/**
 * Operator → predicate dispatch. Date-capable operators branch on whether the
 * field is a date column (dd/MM/yyyy raw) or a numeric one.
 */
const OPERATORS = {
  iContains:    (raw, value) => lc(raw).includes(lc(value)),
  iNotContains: (raw, value) => !lc(raw).includes(lc(value)),
  iStartsWith:  (raw, value) => lc(raw).startsWith(lc(value)),
  iEquals:      (raw, value) => lc(raw) === lc(value),
  iNotEqual:    (raw, value) => lc(raw) !== lc(value),
  isNull:       (raw) => raw == null || raw === '',
  isNotNull:    (raw) => raw != null && raw !== '',
  equals: (raw, value, field) => {
    if (DATE_FIELDS.has(field)) return dmyToMs(raw) === isoToMs(value);
    if (Array.isArray(value)) return value.map(lc).includes(lc(raw));
    return lc(raw) === lc(value);
  },
  notEqual:     (raw, value) => (Array.isArray(value)
    ? !value.map(lc).includes(lc(raw))
    : lc(raw) !== lc(value)),
  inSet:        (raw, value) => toSet(value).map(lc).includes(lc(raw)),
  greaterThan:    (raw, value, field) => (DATE_FIELDS.has(field) ? dateCmp((a, b) => a > b) : numCmp((a, b) => a > b))(raw, value),
  greaterOrEqual: numCmp((a, b) => a >= b),
  lessThan:       (raw, value, field) => (DATE_FIELDS.has(field) ? dateCmp((a, b) => a < b) : numCmp((a, b) => a < b))(raw, value),
  lessOrEqual:    numCmp((a, b) => a <= b),
  between: (raw, value, field) => {
    const [a, b] = Array.isArray(value) ? value : [];
    if (DATE_FIELDS.has(field)) {
      const r = dmyToMs(raw); const lo = isoToMs(a); const hi = isoToMs(b);
      return !Number.isNaN(r) && !Number.isNaN(lo) && !Number.isNaN(hi) && r >= lo && r <= hi;
    }
    const r = num(raw); const lo = num(a); const hi = num(b);
    return r != null && lo != null && hi != null && r >= lo && r <= hi;
  },
};

/** Adds the derived `estado` field used by the due-state enum filter. */
function withDerivedFields(invoice) {
  return { ...invoice, estado: estadoOf(invoice) };
}

function matchesCondition(row, { field, operator, value }) {
  const handler = OPERATORS[operator];
  return handler ? handler(row[field], value, field) : true;
}

/**
 * Filters the invoices array against an advanced-filter value object.
 * `and` → every condition must match; `or` → at least one. A null/empty filter
 * returns the input unchanged.
 */
export function applyInvoiceAdvancedFilter(invoices, filter) {
  if (!filter || !Array.isArray(filter.conditions) || filter.conditions.length === 0) {
    return invoices;
  }
  const complete = filter.conditions.filter((c) => c && c.field && c.operator);
  if (complete.length === 0) return invoices;

  const isOr = filter.rowOperator === 'or';
  return invoices.filter((inv) => {
    const row = withDerivedFields(inv);
    return isOr
      ? complete.some((c) => matchesCondition(row, c))
      : complete.every((c) => matchesCondition(row, c));
  });
}

// Advanced ("by conditions") filter for the Movements tab — reuses the generic
// AdvancedFilterBuilder from contract-ui, but filters the in-memory movements
// array CLIENT-SIDE (the builder only emits the condition tree, it has no
// evaluator of its own).
//
// Filter object shape (emitted by AdvancedFilterBuilder):
//   { rowOperator: 'and' | 'or', conditions: [{ field, operator, value }] }

import { MOVEMENT_STATUS_CONFIG } from './movementStatusConfig';
import { applyConditions } from './advancedFilterApply';

/**
 * The user-facing status families (5), de-duplicated from the 8 backend codes.
 * Each family keeps the i18n key so the enum dropdown shows one entry per family.
 */
const STATUS_FAMILY_KEYS = (() => {
  const seen = new Map();
  for (const cfg of Object.values(MOVEMENT_STATUS_CONFIG)) {
    if (!seen.has(cfg.labelKey)) seen.set(cfg.labelKey, cfg.labelKey);
  }
  return [...seen.keys()];
})();

/**
 * Filterable column spec, WITHOUT the translated labels.
 *
 * Kept label-free so the type metadata can be derived without a `ui`
 * translator: the client-side evaluator dispatches operators by declared type
 * (`MOVEMENT_FILTER_COLUMNS` below) and must be callable from plain modules and
 * tests. `buildMovementFilterColumns` decorates this with `ui()` labels for the
 * builder UI.
 *
 * Status is filtered over a derived `statusFamily` field (the label key) so the
 * dropdown shows one option per family instead of all 8 raw codes.
 */
const COLUMN_SPEC = [
  { key: 'date',         labelKey: 'financeAccountMovementsColDate',        type: 'date' },
  // 'selector' → identifier mode: "Is" / "Is not" render a checkbox
  // multi-picker listing the values present in the movements, while
  // "Contains" / "Starts with" stay free-text. Used for every column whose
  // values are a BOUNDED set the user picks from rather than types — a payment
  // document number or a GL item is impossible to match exactly by hand
  // (ETP-4956). `description` deliberately stays 'string': its values are
  // free prose, so a picker would list one option per row.
  { key: 'documentNo',   labelKey: 'financeAccountMovementsColDocument',    type: 'selector' },
  { key: 'contact',      labelKey: 'financeAccountMovementsColContact',     type: 'selector' },
  { key: 'description',  labelKey: 'financeAccountMovementsColDescription', type: 'string' },
  // `required` drops the "Is empty" / "Is not empty" operators (see
  // getOperatorsForColumn in AdvancedFilterBuilder): every movement resolves to
  // a status family, so those two could only ever match zero rows.
  { key: 'statusFamily', labelKey: 'financeAccountMovementsColStatus',      type: 'enum', enumKeys: STATUS_FAMILY_KEYS, required: true },
  { key: 'trxType',      labelKey: 'financeAccountMovementsColType',        type: 'enum', enumKeys: ['BPD', 'BPW', 'BF'] },
  { key: 'glItem',       labelKey: 'financeAccountMovementsColGlItem',      type: 'selector' },
  { key: 'amount',       labelKey: 'financeAccountMovementsColAmount',      type: 'number' },
  { key: 'balance',      labelKey: 'financeAccountMovementsColBalance',     type: 'number' },
];

/** i18n keys for the `trxType` enum options, by code. */
const TRX_TYPE_LABEL_KEYS = {
  BPD: 'financeAccountMovementsTypeBPD',
  BPW: 'financeAccountMovementsTypeBPW',
  BF:  'financeAccountMovementsTypeBF',
};

/**
 * Column metadata the client-side evaluator needs, keyed by field: the declared
 * type (so date/number operators dispatch correctly) and any per-column filter
 * flags. Label-independent, hence safe to build once at module load.
 */
export const MOVEMENT_FILTER_COLUMNS = Object.fromEntries(
  COLUMN_SPEC.map(({ key, type, emptyWhenZero }) => [key, { type, emptyWhenZero }]),
);

/**
 * Derives the user-facing status label key for a movement's raw payment status.
 */
export function movementStatusLabelKey(paymentStatus) {
  return MOVEMENT_STATUS_CONFIG[paymentStatus]?.labelKey ?? null;
}

/** Resolves an enum column's `{ code: label }` map through the `ui` translator. */
function enumLabelsFor(col, ui) {
  if (!col.enumKeys) return undefined;
  return Object.fromEntries(
    col.enumKeys.map((code) => [code, ui(TRX_TYPE_LABEL_KEYS[code] ?? code)]),
  );
}

/**
 * Builds the filterable column metadata for the AdvancedFilterBuilder, with
 * labels/enum labels resolved through the provided `ui` translator.
 */
export function buildMovementFilterColumns(ui) {
  return COLUMN_SPEC.map((col) => {
    const enumLabels = enumLabelsFor(col, ui);
    return {
      key: col.key,
      label: ui(col.labelKey),
      type: col.type,
      ...(enumLabels ? { enumLabels } : {}),
      ...(col.emptyWhenZero ? { emptyWhenZero: true } : {}),
      ...(col.required ? { required: true } : {}),
    };
  });
}

/** Adds the derived `statusFamily` field used by the status filter column. */
export function withDerivedFields(movement) {
  return { ...movement, statusFamily: movementStatusLabelKey(movement.paymentStatus) };
}

/**
 * Filters the movements array against an advanced-filter value object.
 * Delegates evaluation to the shared {@link applyConditions}, projecting each
 * movement through {@link withDerivedFields} so the `statusFamily` column works.
 */
export function applyAdvancedFilter(movements, filter) {
  return applyConditions(movements, filter, withDerivedFields, MOVEMENT_FILTER_COLUMNS);
}

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
 * Derives the user-facing status label key for a movement's raw payment status.
 */
export function movementStatusLabelKey(paymentStatus) {
  return MOVEMENT_STATUS_CONFIG[paymentStatus]?.labelKey ?? null;
}

/**
 * Builds the filterable column metadata for the AdvancedFilterBuilder, with
 * labels/enum labels resolved through the provided `ui` translator.
 *
 * Status is filtered over a derived `statusFamily` field (the label key) so the
 * dropdown shows one option per family instead of all 8 raw codes.
 */
export function buildMovementFilterColumns(ui) {
  const trxTypeLabels = {
    BPD: ui('financeAccountMovementsTypeBPD'),
    BPW: ui('financeAccountMovementsTypeBPW'),
    BF: ui('financeAccountMovementsTypeBF'),
  };
  const statusLabels = Object.fromEntries(
    STATUS_FAMILY_KEYS.map((key) => [key, ui(key)]),
  );

  return [
    { key: 'date',         label: ui('financeAccountMovementsColDate'),        type: 'date' },
    { key: 'documentNo',   label: ui('financeAccountMovementsColDocument'),    type: 'string' },
    // 'selector' → identifier mode: a checkbox multi-picker listing the contacts
    // present in the movements, so the user can filter by one or several.
    { key: 'contact',      label: ui('financeAccountMovementsColContact'),     type: 'selector' },
    { key: 'description',  label: ui('financeAccountMovementsColDescription'), type: 'string' },
    { key: 'statusFamily', label: ui('financeAccountMovementsColStatus'),      type: 'enum', enumLabels: statusLabels },
    { key: 'trxType',      label: ui('financeAccountMovementsColType'),        type: 'enum', enumLabels: trxTypeLabels },
    { key: 'glItem',       label: ui('financeAccountMovementsColGlItem'),      type: 'string' },
    { key: 'amount',       label: ui('financeAccountMovementsColAmount'),      type: 'number' },
    { key: 'balance',      label: ui('financeAccountMovementsColBalance'),     type: 'number' },
  ];
}

/** Adds the derived `statusFamily` field used by the status filter column. */
function withDerivedFields(movement) {
  return { ...movement, statusFamily: movementStatusLabelKey(movement.paymentStatus) };
}

/**
 * Filters the movements array against an advanced-filter value object.
 * Delegates evaluation to the shared {@link applyConditions}, projecting each
 * movement through {@link withDerivedFields} so the `statusFamily` column works.
 */
export function applyAdvancedFilter(movements, filter) {
  return applyConditions(movements, filter, withDerivedFields);
}

// Advanced ("by conditions") filter for the Imported Statements tab — same
// generic AdvancedFilterBuilder + client-side evaluator used by the Movements
// tab. Statement rows already carry plain fields (status is a string code), so
// no row projection is needed.

import { applyConditions } from './advancedFilterApply';

const STATEMENT_STATUS_KEYS = {
  DRAFT:      'financeAccountStatementsStatusDraft',
  PENDING:    'financeAccountStatementsStatusPending',
  PARTIAL:    'financeAccountStatementsStatusPartial',
  RECONCILED: 'financeAccountStatementsStatusReconciled',
};

/**
 * Filterable column spec, WITHOUT the translated labels — see the twin comment
 * in movementAdvancedFilter.js for why the labels are kept out of it.
 *
 * `totalOut` / `totalIn` carry `emptyWhenZero`: the grid renders
 * `Number(totalOut) > 0 ? amount : '—'` (StatementsTable.jsx), so an absent
 * amount arrives as 0 and looks identical to null. Without the flag "Is empty"
 * matched none of the rows that visibly show "—" (ETP-4956). Deliberately NOT
 * set on `lineCount`, where 0 is a real value.
 */
const COLUMN_SPEC = [
  { key: 'documentNo',      labelKey: 'financeAccountStatementsColDocumentNo',      type: 'string' },
  { key: 'name',            labelKey: 'financeAccountStatementsColName',            type: 'string' },
  { key: 'fileName',        labelKey: 'financeAccountStatementsColFileName',        type: 'string' },
  { key: 'notes',           labelKey: 'financeAccountStatementsColNotes',           type: 'string' },
  { key: 'importDate',      labelKey: 'financeAccountStatementsColImportDate',      type: 'date' },
  { key: 'transactionDate', labelKey: 'financeAccountStatementsColTransactionDate', type: 'date' },
  { key: 'lineCount',       labelKey: 'financeAccountStatementsColLines',           type: 'number' },
  { key: 'totalOut',        labelKey: 'financeAccountStatementsColOut',             type: 'number', emptyWhenZero: true },
  { key: 'totalIn',         labelKey: 'financeAccountStatementsColIn',              type: 'number', emptyWhenZero: true },
  // `required`: a statement always carries one of the four status codes, so the
  // "Is empty" / "Is not empty" operators are dropped (getOperatorsForColumn).
  { key: 'status',          labelKey: 'financeAccountStatementsColStatus',          type: 'enum', enumKeys: Object.keys(STATEMENT_STATUS_KEYS), required: true },
];

/**
 * Column metadata the client-side evaluator needs, keyed by field. See
 * MOVEMENT_FILTER_COLUMNS for the rationale.
 */
export const STATEMENT_FILTER_COLUMNS = Object.fromEntries(
  COLUMN_SPEC.map(({ key, type, emptyWhenZero }) => [key, { type, emptyWhenZero }]),
);

/**
 * Builds the filterable column metadata for the AdvancedFilterBuilder on the
 * statements list, with labels/enum labels resolved through `ui`.
 */
export function buildStatementFilterColumns(ui) {
  return COLUMN_SPEC.map((col) => ({
    key: col.key,
    label: ui(col.labelKey),
    type: col.type,
    ...(col.enumKeys
      ? { enumLabels: Object.fromEntries(col.enumKeys.map((code) => [code, ui(STATEMENT_STATUS_KEYS[code])])) }
      : {}),
    ...(col.emptyWhenZero ? { emptyWhenZero: true } : {}),
    ...(col.required ? { required: true } : {}),
  }));
}

/** Filters the statements array against an advanced-filter value object. */
export function applyAdvancedFilter(statements, filter) {
  return applyConditions(statements, filter, undefined, STATEMENT_FILTER_COLUMNS);
}

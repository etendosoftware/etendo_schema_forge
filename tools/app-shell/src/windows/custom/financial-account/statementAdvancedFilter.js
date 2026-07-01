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
 * Builds the filterable column metadata for the AdvancedFilterBuilder on the
 * statements list, with labels/enum labels resolved through `ui`.
 */
export function buildStatementFilterColumns(ui) {
  const statusLabels = Object.fromEntries(
    Object.entries(STATEMENT_STATUS_KEYS).map(([code, key]) => [code, ui(key)]),
  );

  return [
    { key: 'documentNo',      label: ui('financeAccountStatementsColDocumentNo'),      type: 'string' },
    { key: 'name',            label: ui('financeAccountStatementsColName'),            type: 'string' },
    { key: 'fileName',        label: ui('financeAccountStatementsColFileName'),        type: 'string' },
    { key: 'notes',           label: ui('financeAccountStatementsColNotes'),           type: 'string' },
    { key: 'importDate',      label: ui('financeAccountStatementsColImportDate'),      type: 'date' },
    { key: 'transactionDate', label: ui('financeAccountStatementsColTransactionDate'), type: 'date' },
    { key: 'lineCount',       label: ui('financeAccountStatementsColLines'),           type: 'number' },
    { key: 'totalOut',        label: ui('financeAccountStatementsColOut'),             type: 'number' },
    { key: 'totalIn',         label: ui('financeAccountStatementsColIn'),              type: 'number' },
    { key: 'status',          label: ui('financeAccountStatementsColStatus'),          type: 'enum', enumLabels: statusLabels },
  ];
}

/** Filters the statements array against an advanced-filter value object. */
export function applyAdvancedFilter(statements, filter) {
  return applyConditions(statements, filter);
}

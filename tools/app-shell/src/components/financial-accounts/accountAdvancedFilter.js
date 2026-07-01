// Advanced ("by conditions") filter for the Accounts list — same generic
// AdvancedFilterBuilder + client-side evaluator used by the Movements and
// Imported Statements tabs. Account rows already carry plain fields, so no row
// projection is needed.

import { applyConditions } from '@/windows/custom/financial-account/advancedFilterApply';
import { ACCOUNT_TYPE } from './tokens';

/**
 * Builds the filterable column metadata for the AdvancedFilterBuilder on the
 * accounts list, with labels/enum labels resolved through `ui`. Reuses the same
 * i18n keys as the table headers.
 */
export function buildAccountFilterColumns(ui) {
  const typeLabels = {
    [ACCOUNT_TYPE.BANK]: ui('financeAccountsTypeBank'),
    [ACCOUNT_TYPE.CASH]: ui('financeAccountsTypeCash'),
    [ACCOUNT_TYPE.CARD]: ui('financeAccountsTypeCard'),
  };

  return [
    { key: 'name',           label: ui('financeAccountsColAccount'), type: 'string' },
    { key: 'type',           label: ui('financeAccountsColType'),    type: 'enum', enumLabels: typeLabels },
    { key: 'currentBalance', label: ui('financeAccountsColBalance'),  type: 'number' },
    { key: 'pendingCount',   label: ui('financeAccountsColPending'),  type: 'number' },
  ];
}

/** Filters the accounts array against an advanced-filter value object. */
export function applyAccountAdvancedFilter(accounts, filter) {
  return applyConditions(accounts, filter);
}

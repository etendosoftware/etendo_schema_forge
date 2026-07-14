/**
 * Shared C_ElementValue.AccountType (AD_Ref_List) code → i18n label key map.
 *
 * Values verified against the DB (ad_ref_list joined to ad_column for
 * C_ElementValue.AccountType): A - Asset, E - Expense, L - Liability,
 * M - Memo, O - Owner's Equity, R - Revenue. Column is mandatory, default 'E'.
 *
 * Used by both AccountTreeView (filter dropdown + visible column) and
 * NewAccountModal (sub-account creation selector) so the code↔label mapping
 * never drifts between the two.
 */
export const ACCOUNT_TYPE_UI_KEYS = {
  A: 'accountTypeAsset',
  E: 'accountTypeExpense',
  L: 'accountTypeLiability',
  M: 'accountTypeMemo',
  O: 'accountTypeOwnersEquity',
  R: 'accountTypeRevenue',
};

export function accountTypeLabel(ui, code) {
  const key = ACCOUNT_TYPE_UI_KEYS[code];
  return key ? ui(key) : (code ?? '');
}

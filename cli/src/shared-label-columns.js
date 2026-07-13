/**
 * Shared label set (ETP-4300).
 *
 * AD columns whose labels are requested by a LITERAL `t('<Column>')` /
 * `useLabel` call inside shared / cross-window components — i.e. NOT through the
 * active window's contract. Per-window slices (labels.js) only cover the columns
 * of their own window, so these would have no label source once the monolith's
 * `fields` section leaves the boot bundle. They are therefore merged into every
 * `core.<locale>.json` so they resolve everywhere.
 *
 * Derivation (re-run when adding/removing a literal label reference in shared code;
 * post-split, shared components live in BOTH repos — the host app and the published
 * app-shell-core source in the sibling schema_forge_core checkout):
 *   grep -rhoE "\bt\(['\"][A-Z][A-Za-z0-9_]*['\"]" \
 *     tools/app-shell/src ../schema_forge_core/packages/app-shell-core/src \
 *     --include=*.jsx --include=*.js | grep -vE 'generated|__tests__' \
 *     | sed -E "s/t\(['\"]//;s/['\"]//" | sort -u
 *
 * Over-inclusion is cheap (a handful of label strings in core); a missing column
 * silently regresses that label to the contract's raw English text once the boot
 * bundle drops `fields`, so prefer keeping any literal reference here.
 */
export const SHARED_LABEL_COLUMNS = [
  'A_Asset_ID',
  'Amortizationamt',
  'Amortization_Percentage',
  'C_BPartner_ID',
  'C_Tax_ID',
  'Customer',
  'Description',
  'EM_Etgo_Discount',
  'IsBillTo',
  'IsShipTo',
  'Line_Gross_Amount',
  'M_Product_ID',
  'Name',
  'PriceList',
  'QtyInvoiced',
  'Value',
  'Vendor',
  'Weight',
];

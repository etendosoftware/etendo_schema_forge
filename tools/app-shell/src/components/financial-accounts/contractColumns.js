// Contract-driven column source for the financial-account custom window.
//
// The window's STRUCTURE stays hand-written (layoutType: "custom"), but its
// field-level configuration is declarative: `artifacts/financial-account/
// decisions.json` declares per-field visibility (`grid`) and order
// (`gridOrder`); `resolve-curated.js --window financial-account --write`
// re-emits the contract this module reads. Adding/hiding/reordering a grid
// column is a decisions edit + regen — no JSX change.
//
// Cell RENDERING stays in each table via a per-field renderer registry,
// because cells are bespoke (payment links, badges, posting dots). Synthetic
// columns (running balance, signed amount, txns chip) are NOT contract-driven:
// they are computed by the NEO handlers, not AD columns.
import contract from '@generated/financial-account/contract.json';

/**
 * Grid columns an entity declares in the window contract: fields with
 * `grid: true` AND an explicit `gridOrder`, sorted by it. The explicit
 * gridOrder opt-in keeps extraction defaults from leaking columns into the
 * custom tables.
 *
 * @param {string} entityName - contract entity key (e.g. 'transaction')
 * @returns {Array<{ name: string, label: string, type?: string }>}
 */
export function getContractGridColumns(entityName) {
  const fields = contract?.frontendContract?.entities?.[entityName]?.fields ?? [];
  return fields
    .filter((f) => f.grid === true && f.gridOrder != null)
    .sort((a, b) => a.gridOrder - b.gridOrder)
    .map((f) => ({ name: f.name, label: f.label ?? f.name, type: f.type }));
}

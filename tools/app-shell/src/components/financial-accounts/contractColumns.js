// Contract-driven column source for the financial-account window's tables.
//
// `artifacts/financial-account/decisions.json` declares, per field, whether it is
// a grid column (`grid`), its order (`gridOrder`), its header i18n key
// (`gridLabelKey`) and which cell renderer it uses (`cellType`);
// `make regen ONLY=financial-account SKIP_EXTRACT=1` re-emits the contract this
// module reads. Adding, hiding, reordering, relabelling or re-rendering a column
// is a decisions edit + regen — no JSX change.
//
// The cell COMPONENTS stay hand-written (they are bespoke: bank avatars, PSD2
// affordances, chunked IBANs, posting dots). What `cellType` makes declarative is
// the BINDING — which column gets which renderer — not the rendering itself.
// Runtime-injected columns that have no AD column behind them (produced by a
// NeoHandler's afterHandle) are declared as `entities.<e>.virtualFields[]` in
// decisions.json and arrive here like any other. This window no longer has one:
// its last virtual field, the accounts list's "Por conciliar", became the
// EM_ETGO_Pending_Count stored computed column so the grid can sort on it.
import contract from '@generated/financial-account/contract.json';

/**
 * Grid columns an entity declares in the window contract: fields with
 * `grid: true` AND an explicit `gridOrder`, sorted by it. The explicit
 * gridOrder opt-in keeps extraction defaults from leaking columns into the
 * custom tables.
 *
 * `column` (the AD column name) matters beyond bookkeeping: it is what
 * `resolveColumnLabel` feeds the AD dictionary, so omitting it made every header
 * fall through to the raw technical field name.
 *
 * @param {string} entityName - contract entity key (e.g. 'transaction')
 * @returns {Array<{ name: string, column?: string, label: string, type?: string,
 *   gridLabelKey?: string, cellType?: string, columnType?: string }>}
 */
export function getContractGridColumns(entityName) {
  const fields = contract?.frontendContract?.entities?.[entityName]?.fields ?? [];
  return fields
    .filter((f) => f.grid === true && f.gridOrder != null)
    .sort((a, b) => a.gridOrder - b.gridOrder)
    .map((f) => ({
      name: f.name,
      column: f.column,
      label: f.label ?? f.name,
      type: f.type,
      gridLabelKey: f.gridLabelKey,
      cellType: f.cellType,
      columnType: f.columnType,
    }));
}

/**
 * Fields an entity declares for the expandable "more info" panel (the row a
 * table expands to show extra read-only detail, e.g. the account movements'
 * accounting dimensions): fields with `dimensionsPanel: true`, sorted by
 * `seq`. Same decisions-driven contract as `getContractGridColumns` — a field
 * is added to, removed from, reordered, or relabelled in the panel via a
 * `decisions.json` edit + regen, no JSX change.
 *
 * @param {string} entityName - contract entity key (e.g. 'transaction')
 * @returns {Array<{ name: string, column?: string, label: string, type?: string,
 *   gridLabelKey?: string }>}
 */
export function getContractPanelFields(entityName) {
  const fields = contract?.frontendContract?.entities?.[entityName]?.fields ?? [];
  return fields
    .filter((f) => f.dimensionsPanel === true)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((f) => ({
      name: f.name,
      column: f.column,
      label: f.label ?? f.name,
      type: f.type,
      gridLabelKey: f.gridLabelKey,
    }));
}

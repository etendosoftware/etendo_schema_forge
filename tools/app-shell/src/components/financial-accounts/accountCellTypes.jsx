// Cell renderers for the Cuentas list, keyed by the `cellType` each field declares in
// `artifacts/financial-account/decisions.json`.
//
// WHY A WINDOW-SCOPED REGISTRY AND NOT ONE OF THE SHARED ONES:
//   - `contract-ui/listModalCells.jsx` is wired only to `ListModalWindow`, i.e. to
//     windows declaring `layoutType: "list-modal"`. Its 7 renderers reach the grid
//     because `buildListModalColumns` emits `cellType` into the column descriptor;
//     the standard `DataTable` path never forwards `cellType` at all. (The reference
//     doc calls cellType "generic to any grid" — it is not.)
//   - `contract-ui/DataTable.cellRenderers.jsx` is keyed by column TYPE (string, amount,
//     date…) and is generic across every window; these three cells are account-specific
//     (bank avatar, PSD2 affordance, chunked IBAN) and do not belong there.
// So AccountsHeaderTable resolves `cellType` itself, off the contract, against this map.
// That needs no change in the published generator — `cellType` already survives
// decisions → contract (generate-contract.js).
//
// The naming mirrors the generator's own window-specific cellTypes
// (`depreciationProgress`, `taxRate`, `taxScope`).
//
// This file lives under `tools/app-shell/src/` on purpose: vitest's `include` is
// `src/**`, so a registry placed in the artifact's `custom/` dir would not be collected.
import { NameCell, TypeCell, BalanceCell, CountryCell } from './AccountsTable/accountColumns.jsx';
import { ReconcilePill } from './ReconcilePill.jsx';

/* eslint-disable react/prop-types */

/**
 * cellType → (row, ctx) => ReactNode.
 *
 * `ctx` carries what a cell cannot get from the row alone:
 *   - `ui`          the i18n resolver
 *   - `onConnect`   starts the PSD2 connect flow for an account
 *   - `onReconcile` deep-links to the account's reconciliation tab
 *
 * An unknown cellType resolves to undefined, and AccountsHeaderTable then leaves the
 * column without a `render`, so DataTable falls back to its generic type-based
 * renderer. Degradation, never a crash.
 */
export const ACCOUNT_CELL_TYPES = {
  accountName: (row, ctx) => <NameCell
    account={row}
    ui={ctx.ui}
    onConnect={ctx.onConnect}
    data-testid="NameCell__c4cfe9" />,

  accountType: (row, ctx) => <TypeCell account={row} ui={ctx.ui} data-testid="TypeCell__c4cfe9" />,

  accountCountry: (row) => <CountryCell account={row} data-testid="CountryCell__c4cfe9" />,

  accountBalance: (row) => <BalanceCell account={row} data-testid="BalanceCell__c4cfe9" />,

  // The whole row navigates to the detail, so the pill swallows its own click —
  // otherwise reconciling would also open the account.
  reconcilePill: (row, ctx) => (
    <span onClick={(e) => e.stopPropagation()} role="presentation" className="inline-flex">
      <ReconcilePill
        pendingCount={row.pendingCount}
        onClick={() => ctx.onReconcile(row)}
        data-testid="ReconcilePill__c4cfe9" />
    </span>
  ),
};

/**
 * cellType for columns that cannot declare one themselves.
 *
 * `appendVirtualFields` (resolve-curated.js) copies a closed 10-key whitelist from a
 * `virtualFields[]` entry, and `cellType` is not in it — so `pendingCount` reaches the
 * contract without one. Drop this map if that whitelist ever widens.
 */
export const VIRTUAL_FIELD_CELL_TYPES = {
  pendingCount: 'reconcilePill',
};

/** The cellType a contract column should render with, declared or inferred. */
export function resolveCellType(col) {
  return col.cellType ?? VIRTUAL_FIELD_CELL_TYPES[col.name];
}

# Chart of Accounts

## Intent
Maintain the account master used by finance users and provide a quick, read-only review of each account's debit, credit, and current balance from the same window.

## What this window should allow
- Browse the account list from the Finance menu.
- Search accounts by code, name, and account type.
- Create subaccounts from the custom tree toolbar using the selected parent account; the generic Create New list action is hidden.
- Open an existing account and update those same setup fields, except protected parent-like subaccounts whose 8-digit code ends in `0000`.
- Delete an account through the standard generated entity flow.
- Review debit, credit, and balance values in the list as accounting outputs, not as manually editable form inputs.
- Filter the tree by code, name, account type, or active status using the toolbar filter row — matches auto-expand their ancestor folders; non-matching branches are hidden.
- Deactivate or reactivate an existing subaccount directly from the tree via an inline toggle (protected `0000`-suffixed placeholder subaccounts cannot be toggled).
- Toggle whether the account is active directly from the tree row; the form's own `isActive` control follows the same live-toggle behavior rather than staying read-only.

## Interaction model
- Route: `/chart-of-accounts` for the list and `/chart-of-accounts/:recordId` for record detail.
- Visibility: visible from the Finance menu as **Chart of Accounts**.
- Implementation type: generated window route loaded from the app-shell window registry.
- Window shape: single-entity window for `elementValue`, with a custom grouped tree table (`AccountTreeView.jsx`) replacing the generated list table.
- Record detail titles use the account code (`searchKey`) rather than the internal record id.
- The tree renders the FULL Etendo Classic account hierarchy as nested, expandable folders — matching Classic's "Combinación de cuentas" grouped view exactly. For example, account `20000000` nests 6 levels deep: `A` (Heading: ACTIVO) → `A.A` (Heading) → `A.A.I` (Heading) → `200` (Account) → `2000` (Breakdown) → `20000000` (Subaccount). Every folder is collapsed by default; expand/collapse state is persisted to `localStorage` (`sf.chartOfAccounts.expandedFolderIds`) so navigating away to another window and back restores exactly what the user left open.

## Reactive behavior and dependencies
- There is no visible parent/child interaction because the window only exposes the `account` entity.
- `Parent Account` is the only cross-record dependency in the form. It is rendered as a search-based foreign-key field, so users can link an account to another account, but no catalog preload, hierarchy browser, or auto-filtering behavior is visible in the current generated assets. In the custom subaccount-creation modal (`NewAccountModal.jsx`), the parent selector is a searchable combobox (`AccountBadgeSelect`) rather than a plain list, and Account Type now defaults from the selected parent/sibling account's existing type instead of always defaulting to Expense.
- Debit, credit, and balance appear only in the table and are read-only in the contract, so the current surface behaves as account setup plus financial review rather than as a balance-editing screen.
- No dependent selectors, status-driven actions, totals, discounts, tax reactions, or line-level recalculations are visible in the current evidence.
- New subaccount creation is handled by the custom modal. The action is always available; when a branch or account row is selected, the modal defaults the parent selector from that row, and otherwise it opens with no parent selected.
- Account Type values are rendered from AD list translations extracted from `AD_REF_LIST_TRL`, so raw AD values (`A`, `E`, `L`, `M`, `O`, `R`) display consistently in English and Spanish.
- Parent-like posting subaccounts with an 8-digit code ending in `0000` are protected. The form renders Code, Name, Description, and Account Type as read-only for existing protected records (`readOnlyLogic: "@ProtectedParentLikeSubaccount@='Y'"` in `decisions.json`, backed by `ChartOfAccountsHandler.isProtectedParentLikeSubaccount`), and the backend rejects creating or modifying those codes. These leaves are technically `issummary='N'` (real DB leaves) but still function as placeholders under their breakdown group — the tree view marks them with a lock icon (`account-tree-locked-<id>`) even though they remain clickable for read-only viewing. Real subaccounts (e.g. `20000001`) are unaffected and stay fully editable.
- The tree's full hierarchy comes from a per-leaf `ancestors` array (root-to-leaf, `{value, name, elementLevel}`) injected by `ChartOfAccountsHandler`, built by walking the client's `AD_TreeNode`/`AD_Tree` ("`<ClientName> Element Value`", `ad_table_id = 188`). `elementLevel` mirrors `C_ElementValue.ElementLevel` (`E` Heading, `C` Account, `D` Breakdown, `S` Subaccount). The legacy 2-level `parentCode4`/`parentCode4Name` fields are still injected for backward compatibility with `NewAccountModal`'s parent selector and as a fallback if `ancestors` is ever absent.
- **Full-dataset self-fetch (bug fix):** `ListView.jsx` only ever hands the tree one paginated page of leaves (`hook.items`, capped at `BATCH_SIZE`) and does not forward `hasMore`/`loadMore` to the `Table` it renders — a scroll-triggered "load more" also can't work for a collapsed-by-default tree, and a tree needs the complete leaf list upfront just to know which root headings exist. This previously made entire top-level roots (e.g. `PYG`, `O`) silently disappear whenever no leaf under them landed in the first page — confirmed live on a tenant with 659 leaf accounts across 4 roots, where only 2 roots ever rendered. `AccountTreeView` now fetches its own complete leaf dataset directly (`GET {apiBaseUrl}/elementValue?_startRow=0&_endRow=9999`, same pattern already used by `NewAccountModal`'s parent selector) on mount and again after every new sub-account is saved, and renders that instead of the paginated `data` prop once it resolves. A small spinner + label appears in the toolbar while the fetch is in flight; on failure it falls back to the `data` prop and shows an error toast (`accountTreeFetchError`) instead of crashing or silently truncating the tree. When `apiBaseUrl` is not supplied (e.g. direct unit tests that only pass `data`), the component skips the self-fetch and renders `data` unchanged.
- **Tree-native filter (bug fix):** The generic "Filtros" advanced-filter builder is designed to trigger backend-paginated re-fetches, which doesn't fit this component — it already self-fetches and holds the complete dataset in memory, so a backend-filtered response never actually reaches the rendered tree. `AccountTreeView` marks its columns `filterable: false` (so the generic builder's field picker no longer lists `searchKey`/`name`/`accountType`/`active` as choosable fields — the Filtros button itself remains, it simply has nothing tree-specific left to filter by) and instead owns a small filter row (code/name text search + account-type + active selects) that filters the already-materialized tree in JS via `filterTree`, auto-expanding ancestor folders of any match and hiding branches with no matching descendant.

## Gap assessment
- A chart-of-accounts screen often carries stricter accounting semantics such as deleting accounts with activity or account-type-specific behavior. Those rules are not visible in the current contract or generated UI, so they remain gaps or open ambiguities.
- The presence of a `Parent Account` field suggests hierarchical setup, but the current evidence does not show how hierarchy depth, rollups, or parent eligibility are enforced.
- The custom subaccount-creation modal (`NewAccountModal.jsx`) renders `Account Type` as a required dropdown sourced from `ACCOUNT_TYPE_UI_KEYS`, defaulting from the selected parent/sibling account's existing type (falling back to Expense (`E`), the AD column default, when no parent/sibling type can be resolved).
- The balance columns show useful review data, but no evidence here explains whether they are point-in-time totals, ledger-derived live balances, period-sensitive balances, or mock/demo placeholders outside real backend data.

## Manual verification
1. Open `/chart-of-accounts` from the Finance menu and confirm the list loads through the generated window route.
2. Confirm the table shows only SearchKey, Name, and Account Type — Debit, Credit, and Balance are no longer rendered as visible columns.
3. Search by Code, Name, and Account Type.
4. Create an account and confirm the editable fields are limited to Code, Name, Account Type, and optional Parent Account.
5. Open an existing account at `/chart-of-accounts/:recordId` and confirm the detail view matches the same maintenance scope.
6. Verify that debit, credit, and balance are review-only values and are not editable in the form.
7. Check whether the UI allows changing `isActive`; it is now a live toggle both on the tree row and in the generated form (see steps 18-19 below for the tree-row toggle flow).
8. If hierarchical accounting behavior is expected, try assigning a parent account and confirm whether any validation or restrictions actually exist.
9. Open an existing `xxxx0000` subaccount such as `10000000` or `10100000` and confirm the editable setup fields render as read-only, and that the tree row shows a lock icon.
10. Try to create a new `xxxx0000` subaccount and confirm the backend rejects it.
11. Expand a leaf account's full folder path (e.g. `A` → `A.A` → `A.A.I` → `200` → `2000`) and confirm each level renders as its own nested, expandable folder matching Etendo Classic's "Combinación de cuentas" grouped view — not a flat 4-digit group.
12. Confirm a real subaccount not ending in `0000` (e.g. `20000001`) shows no lock icon and remains fully editable.
13. Confirm the tree loads fully collapsed on first visit. Expand a folder path down to a specific account, navigate to another window, then return to Chart of Accounts and confirm the same folders are still expanded (and everything else still collapsed).
14. On a tenant with accounts under all 4 root headings (Asset, Liability, Revenue, Memo/Other), confirm all 4 roots appear in the tree — not just the ones with leaves in the first paginated batch.
15. Type a code fragment into the tree's filter box and confirm only matching leaves (and their ancestor folders, auto-expanded) remain visible.
16. Clear the filter and confirm the tree returns to whatever manual expand/collapse state was set before filtering — not the auto-expanded filter state.
17. Open "New Sub-account" from a selected leaf row and confirm the parent-account field is a searchable combobox, and confirm Account Type pre-fills to match the parent/sibling account's type.
18. Toggle an existing subaccount's Active switch off, confirm the tree PATCHes and the row updates; toggle it back on.
19. Confirm the Active toggle is disabled (not just visually locked) for a protected `0000`-suffixed placeholder leaf.

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `chart-of-accounts` in the Finance menu.
- `tools/app-shell/src/windows/registry.js` maps `chart-of-accounts` to the generated window loader.
- `artifacts/chart-of-accounts/generated/web/chart-of-accounts/index.jsx` implements a generated single-entity list/detail flow for `account`.
- `artifacts/chart-of-accounts/generated/web/chart-of-accounts/AccountForm.jsx` shows the editable setup fields and the `isActive` checkbox, now editable rather than read-only.
- `artifacts/chart-of-accounts/generated/web/chart-of-accounts/AccountTable.jsx` shows the list columns and supported filters, including read-only financial review columns for debit, credit, and balance.
- `artifacts/chart-of-accounts/contract.json` defines one `account` entity, no child entities, GET/POST/PUT/DELETE endpoints, supported filters for `code`, `name`, and `accountType`, and a test manifest covering field presence, field types, searchable filters, frontend visibility, and backend-only system fields.
- `tools/app-shell/src/windows/custom/chart-of-accounts/AccountTreeView.jsx` — `buildGroupedTree()` builds the full N-level nested folder tree from each leaf's `ancestors` array (falling back to the legacy 2-level `parentCode4` grouping when `ancestors` is absent), and `AccountTreeRow` renders the lock icon for protected `0000`-suffixed leaves.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/ChartOfAccountsHandler.java` — `loadTreeData`/`buildAncestorChain` walk `AD_TreeNode` for the client's `"<ClientName> Element Value"` tree and inject `ancestors` + `elementLevel` per leaf in `applyHierarchyMetadata`.
- `tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/AccountTreeView.vitest.jsx` covers both the legacy 2-level grouping and the full ancestor-chain nested tree, the `0000`-suffix lock-icon rule (locked, not locked, and virtual-folder-never-locked cases), expand/collapse persistence across unmount/remount (including a corrupt-`localStorage` fallback), and the full-dataset self-fetch (fetch fired with the correct URL/headers, all 4 roots rendered from the fetched data even when the paginated `data` prop only carries 2, self-fetch skipped when `apiBaseUrl` is absent, graceful fallback + error toast on fetch failure, and refetch-after-save).
- `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/handlers/ChartOfAccountsHandlerTest.java` covers `buildAncestorChain` (root node, node-exclusion, six-level PGC example, circular-reference cap, and JSON-null fallback for missing values).
- `tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/AccountTreeView.vitest.jsx` additionally covers the expand-all recursion fix (every nested level opens, not just the first two), the tree-native filter (filtering by code/name/account-type/active with ancestor auto-expand, and reverting to the manual expand/collapse state on clear), and the active/inactive toggle (checked/unchecked rendering, the PATCH request and its rollback-on-failure, the toggle being disabled for protected `0000`-suffixed leaves, and never rendering on virtual folder rows).
- `tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/NewAccountModal.vitest.jsx` additionally covers the searchable parent-account selector (search input rendering and live filtering of options) and the Account Type default (from the selected leaf record, and from an existing sibling leaf when the parent is a group heading).

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.

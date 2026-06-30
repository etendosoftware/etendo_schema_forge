# ETP-4097 — Cross-domain plan: PSD2 / Salt Edge bank connection in the Accounts UI

## Summary

Wire the PSD2 / Salt Edge bank connection into the Etendo Go **Accounts** UI (T3). A NEO Headless
bridge (`FinancialAccountPsd2Handler`, `@Named("financial-account-psd2")`) re-exposes the Salt Edge
protocol as headless actions (connect / accounts / providers / link / createAndLink / reconnect /
disconnect / sync / import-settings), reusing the PSD2 module's public static helpers. The account
selection and success steps are native app-shell UI; only the bank login is an external popup.

Follow-up UX work on the same branch: a unified **Edit account** modal (merging the former
"Edit account" + "Edit PSD2 connection"), a per-account **Sync statements** action wired to the
existing PSD2 statement fetch, account-row hover actions (edit / sync) with tooltips, sidebar
"pending" simplification, and remembering the bank chosen at offline creation so a later connect
preselects it.

The current branch also carries the post-push regeneration that keeps the impacted contracts in
sync after the NEO/config updates: regenerated `contract.json` / `contract.mcp.json` outputs for
the affected document windows, the `payment-out` generated header, the AD snapshot refresh, and
the onboarding map note documenting the PSD2 sync step. Those files are mechanical fallout from the
same accounts/PSD2 feature and are intentionally reviewed together.

## Domains touched

| Repo | Changes |
|------|---------|
| `schema_forge` (frontend + tooling) | `app-shell-core` locales (`en_US`/`es_ES`): PSD2 strings. `platform-change`: hooks (`usePsd2Actions`, `usePsd2ConnectFlow`, `useAccountMutations`), `pages` (`FinancialAccountsPage`, `Psd2CallbackPage`, `App` route), `components/financial-accounts` (`AccountRowMenu`, `AccountsSidebar`, `AccountsTable/*`, `SyncStatusInline`), layout wiring (`TopBar`, `AppLayout`). `window:financial-account`: custom window components (`EditAccountModal` unified, `NewAccountWizard`, `ImportedStatementsTab`, `StatementsToolbar`, `Psd2ConnectFlowUI`). Mechanical fallout in the same branch: regenerated contracts/MCP contracts for `financial-account`, `payment-out`, `purchase-order`, `purchase-invoice`, `sales-order`, `sales-invoice`, `sales-quotation`, `return-to-vendor`, `return-from-customer`, `contacts`, and `user`; `payment-out/generated/web/payment-out/HeaderPage.jsx`; `cli/cache/ad-snapshot.json`; and `docs/etendo-ad/onboarding-and-datafixes-map.md`. |
| `com.etendoerp.go` (runtime) | `FinancialAccountPsd2Handler` NEO bridge (`@Named("financial-account-psd2")`) + `ETGO_SF_SPEC`/`ETGO_SF_ENTITY` sourcedata. `FinancialAccountsPageHandler` emits `psd2Connected`. `FinancialAccountHandler` offline-create remembers the chosen Salt Edge provider (`psd2Provider` FK). `FinancialAccountSupport` helper. Sync delegates to the PSD2 per-account fetch; connect preselects the account's known bank. |
| `com.etendoerp.psd2.bank.integration` (PSD2 module) | Additive only: `createSaltEdgeConnection(apiKey, returnToUrl[, Provider])` overloads + shared `buildAndConnect`; `disconnect` exposed as public static; per-account statement fetch extracted to `SaltEdgeAccountLinkHelper.fetchAccountTransactions` (reused by the `GetTransactions` button and the bridge). |

These are one feature: the bridge only works end-to-end with the PSD2 module's exposed statics and
the SPA flow on the schema_forge side.

## Tests

- `tools/app-shell` vitest: PSD2 hooks/flows + financial-account components. Some suites need
  updating for the unified modal / new dependencies (`usePsd2Actions` under `AuthProvider`) —
  delegated to the test generator.
- `make domain-boundary-check BASE=origin/epic/ETP-3504 LABELS="cross-domain-approved,scope:vertical-slice,scope:platform-change,scope:generator-change"`
  to validate that the branch ships with the required cross-domain plan.
- `com.etendoerp.go` JUnit: `FinancialAccountPsd2HandlerTest` (connect/accounts/link/status/
  disconnect/reconnect/sync) — run by the user.
- E2E: financial-account mocked specs cover the offline create + connect entry points.

## Rollback

Revert `feature/ETP-4097` in all three repos. DB-side: restore the previous `ETGO_SF_SPEC`/
`ETGO_SF_ENTITY` sourcedata (drop the `financial-account-psd2` spec) and re-import; no schema/DDL
change was introduced (the provider link reuses the existing `EM_Psd2_Provider_ID` column), so no
`export.database` rollback is required beyond removing the bridge spec rows.

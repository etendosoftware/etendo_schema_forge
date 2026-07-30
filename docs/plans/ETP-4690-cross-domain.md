# ETP-4690 — Cross-domain plan

**Feature:** Rename the "PSD2" vocabulary to "bank connection" in everything Etendo Go
owns — user-facing copy, i18n keys, frontend identifiers, Java classes and the NEO
Headless bridge spec.

"PSD2" is the name of an EU regulation (Payment Services Directive 2). It leaked out of
the integration module's technical vocabulary into the text end users read (*Conectar
PSD2*, *Conecta tu banco vía PSD2*, *Realizado vía PSD2*), which means nothing to a
customer — and it under-describes the feature, since the same flow also connects cards
via Salt Edge.

This PR touches the Schema Forge app-shell (locales, hooks, pages, custom window
components, e2e fixtures) and the `com.etendoerp.go` module (Java handlers, onboarding
service, NEO sourcedata, migration script).

## Scope boundary — what deliberately keeps the PSD2 name

`com.etendoerp.psd2.bank.integration` is a **separate repository**
(`bitbucket.org/koodu_software`) and is out of scope. Everything mechanically derived
from it is left untouched, because those strings are mirrors of its DB columns and AD
records and renaming them would break the mapping:

- Tables `PSD2_FINACC_CONNECTION`, `PSD2_PROVIDER`, `PSD2_PIS_PAYMENT`; the 16
  `EM_PSD2_*` columns; the `PSD2` DB prefix.
- Derived DAL property names in `contract.json` / `contract.mcp.json` /
  `decisions.json`: `pSD2ConnectionStatus`, `pSD2ImportFromDate`, `psd2Provider`,
  `psd2GenerateBankPayment`, `psd2ApiKey`, … — and the 27 matching
  `ETGO_SF_FIELD.JAVA_QUALIFIER` records.
- AD display-logic tokens `@PSD2_ClientHasApiKey@`, `@PSD2_HasConnections@`,
  `@PSD2_FAIsBank@`, `@EM_PSD2_Connection_Status@`, …; AD reference `PSD2_Provider`;
  AD_Process `PSD2_GetBankStatements`.
- SQL in `cli/src/data-fixes/sql/*R14*.sql` / `*R15*.sql` and its guard test.
- Java DAL calls (`getPSD2*`, `setPsd2Provider`, `isPSD2IsBankTransfer`), imports of
  `com.etendoerp.psd2.bank.integration.*`, the `build.gradle` dependency and
  `pipelines/jenkinsExtraModules.txt`.

Consequence: **`artifacts/**` needed no edits at all** — neither contracts nor generated
output. `npx sf-validate-pipeline --scope=financial-account` stays clean.

Also deliberately left alone: `docs/plans/psd2-dependency-cross-domain.md` (and the
"PSD2 dependency — `EM_Psd2_Generate_Bank_Payment`" sections that link to it). That doc
records the dependency on the *external module*, so its name is accurate; renaming it
would be misleading and would break 8 inbound relative links for no gain.

## Domains touched

### `repo-infra` / i18n

- `tools/app-shell/src/locales/{en_US,es_ES,es_AR}.json` — 52 keys renamed
  (`financeAccountsPsd2*` → `financeAccountsBankConnection*`,
  `financeAccountsConnectPsd2` → `financeAccountsConnectBank`,
  `financeAccountStatementsPsd2Sync` → `financeAccountStatementsBankConnectionSync`);
  21 user-visible values reworded. The stale `es_AR`-only key
  `financeAccountsMenuEditPsd2` (absent from `en_US`/`es_ES`) was deleted.

### `window:financial-account` (hand-written custom window — no contract pipeline)

- `hooks/usePsd2Actions.js` → `hooks/useBankConnectionActions.js`
- `hooks/usePsd2ConnectFlow.js` → `hooks/useBankConnectionFlow.js`
- `pages/Psd2CallbackPage.jsx` → `pages/BankConnectionCallbackPage.jsx`
- `windows/custom/financial-account/Psd2ConnectFlowUI.jsx` → `BankConnectionFlowUI.jsx`
  (+ `Psd2AccountSelectModal` → `BankConnectionAccountSelectModal`)
- `EditAccountModal.jsx` — `Psd2ConnectionSection` → `BankConnectionSection`,
  `Psd2Panel` → `BankConnectionPanel`, `usePsd2Connection` → `useBankConnection`
- Props/state across `FinancialAccountsPage`, `AccountsTable`, `AccountRowMenu`,
  `SyncStatusInline`, `ImportedStatementsTab`, `StatementsToolbar`:
  `onPsd2Action` → `onBankConnectionAction`, `psd2Flow` → `bankConnectionFlow`,
  `psd2Synced` → `bankConnectionSynced`, `psd2Connected` → `bankConnected`,
  `psd2Pending` → `bankConnectionPending`
- ~30 `data-testid` values `psd2-*` → `bank-connection-*`

### Runtime contracts (changed on both sides in this one delivery)

| Old | New |
| --- | --- |
| SPA route `financial-account/psd2-callback` | `financial-account/bank-connection-callback` |
| localStorage `psd2:lastConnectionId` | `bankConnection:lastConnectionId` |
| popup name `psd2-connect` | `bank-connection-connect` |
| postMessage type `psd2-connected` | `bank-connection-connected` |
| error sentinel `PSD2_TIMEOUT` | `BANK_CONNECTION_TIMEOUT` |
| JSON API keys `psd2Connected` / `psd2Pending` | `bankConnected` / `bankConnectionPending` |
| NEO spec + `@Named` `financial-account-psd2` | `financial-account-bank-connection` |

### Backend (com.etendoerp.go — parallel repo, same branch)

- `FinancialAccountPsd2Handler.java` → `FinancialAccountBankConnectionHandler.java`
  (`@Named("financial-account-bank-connection")`, new `CALLBACK_PATH`)
- `FinancialAccountPsd2Support.java` → `FinancialAccountBankConnectionSupport.java`
- `OnboardingPsd2SyncService.java` → `OnboardingBankConnectionSyncService.java`;
  `schedulePsd2StatementSync()` → `scheduleBankConnectionStatementSync()`; the
  `AD_Process_Request` description no longer says "PSD2"
- `EtendoGoJwtServlet` — `PROGRESS_PSD2_SYNC = "psd2Sync"` →
  `PROGRESS_BANK_CONNECTION_SYNC = "bankConnectionSync"`, `schedulePsd2Sync()` →
  `scheduleBankConnectionSync()`
- `FinancialAccountsPageHandler`, `PaymentRegistrationService` — JSON keys
  `bankConnected` / `bankConnectionPending` (the SQL still selects `em_psd2_*`)
- Log and exception copy naming *our* feature reworded; `FIELD_PSD2_PROVIDER =
  "psd2Provider"` and `PSD2_PROCESS_KEY = "PSD2_GetBankStatements"` keep both name and
  value — they name external things
- `src-db/database/sourcedata/ETGO_SF_SPEC.xml` + `ETGO_SF_ENTITY.xml` — `NAME`,
  `DESCRIPTION`, `JAVA_QUALIFIER` updated on the two fixed-ID records
  (`39C8096CCA3D49969EF46D33BB075D58`, `6FC45AC1A1EA437D96F2871FD71DD242`)
- `migrationscripts/system/V1785200564_rename_psd2_spec_to_bank_connection.sql` (new) —
  applies the same rename to existing installations

### Docs

- `docs/generated-custom-windows/financial-account.md`, `financial-accounts-page.md`,
  `purchase-invoice.md` — renamed symbols, file paths and UI labels
- `docs/etendo-ad/onboarding-and-datafixes-map.md`,
  `docs/etendo-ad/tenant-remediation-knowledge.md` — renamed Java symbols
- Dated plan records (`ETP-4097-cross-domain.md`, `2026-05-21-bank-reconciliation-*`,
  `docs/superpowers/plans/2026-06-30-*`) left as historical records

## Tests

- `tools/app-shell` Vitest — **517 files / 9578 tests pass**, 1 skipped. Includes the
  two source-reading guard tests, which assert the exact export signature, import line,
  `data-testid` strings and postMessage literal, and were updated in lockstep:
  `pages/__tests__/BankConnectionCallbackPage.test.js` and
  `windows/custom/financial-account/__tests__/BankConnectionFlowUI.test.js`
- `make test` (CLI / node) — pass
- `npx sf-validate-pipeline --scope=financial-account` — **OK, 0 violations**
- Playwright mocked specs — `financial-account-{create,detail,new-transaction}` and
  `financial-accounts-page` fixtures now emit `bankConnected`
- Java: 8 renamed test classes (`FinancialAccountBankConnectionHandler*Test`,
  `OnboardingBankConnectionSyncServiceTest`, `BankConnectionHandlerTestSupport`)

## Rollback

Pure rename, no data model change. `git revert` the two commits (one per repo) and
re-run `./gradlew export.database`. For an installation that already applied the
migration script, run the inverse UPDATE on the two `ETGO_SF_*` rows — the primary keys
are unchanged, so nothing else references the old names.

## Notes

- **Atomic deploy.** The SPA route, the Java `CALLBACK_PATH`, the `@Named` qualifier and
  the `bankConnected` JSON keys are cross-repo contracts. Deployed out of order,
  connecting a bank breaks; a user mid-consent during the deploy has to retry.
- **The `pSD2` casing.** Four casings exist in the tree (`PSD2`, `psd2`, `Psd2`,
  `pSD2`) and the `pSD2` form belongs almost exclusively to the untouchable derived DAL
  names. Every rename here was done identifier by identifier — a case-insensitive
  blanket replace would corrupt the contracts.
- **Still open (functional decision):** `cpPisViaLabel` was changed from *"Realizado vía
  PSD2"* to *"Realizado vía banco"*. This badge marks payments initiated through PIS;
  the wording should be confirmed with functional before release.

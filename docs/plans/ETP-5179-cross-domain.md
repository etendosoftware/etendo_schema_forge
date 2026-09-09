# Cross-domain plan — ETP-5179: PSD2 empty account list explains its cause

**Ticket:** ETP-5179 (branch `feature/ETP-5179`, both repos) · **Type:** bugfix
**Scope label:** `cross-domain-approved`

Connecting a USD Financial Account to a PSD2 bank that only exposes EUR accounts raised the same
generic toast ("No se encontraron cuentas bancarias compatibles para esta conexión") as a wrong
account type or an account already linked elsewhere. The connection *was* correctly refused — the
missing part was the explanation. This is a single, narrow bugfix; it spans domains only because a
diagnosis that starts in a Java handler has to end as a translated string in the SPA, and because
the repo's documentation policy requires the window guide to move with the behaviour it describes.

## What changed

`FinancialAccountBankConnectionHandler.handleAccounts` chained its three filters
(`filterAccountsByFAType` → `filterUnlinkedAccounts` → `filterAccountsByCurrency`) by reassigning a
single variable, so once the list came back empty the stage that emptied it was unrecoverable. Each
stage now keeps its own array and `putEmptyDiagnosis` adds a machine-readable `emptyReason` to the
HTTP 200 payload (`noAccounts` / `typeMismatch` / `allLinked` / `currencyMismatch`), plus
`accountCurrency` for the one reason that takes a parameter. The first stage that emptied the list
wins. The SPA maps the code to its own label.

A code rather than an `AD_Message` (which is what Classic's `AisConnectionCallback` uses): those
`com.etendoerp.psd2.bank.integration` rows ship with `istranslated='N'`, so Core resolves them to
English unless the environment imported the translation pack, and their `%s` templates never
interpolate because `OBMessageUtils.getI18NMessage` substitutes `%0` only. Full reasoning in the
window guide and in `docs/i18n-guide.md`.

## Domains touched (maps to the detected scopes)

- **platform-change** (8 files) — `tools/app-shell/src/hooks/useBankConnectionActions.js`
  (forwards the two new fields, deliberately un-defaulted) and `useBankConnectionFlow.js`
  (`NO_ACCOUNTS_REASON_KEYS` + `noAccountsMessage`), their two `.vitest.jsx` suites, the three
  locale files, and the new locale-parity suite
  `tools/app-shell/src/locales/__tests__/etp5179-psd2-no-accounts-keys.vitest.js`.
- **window:financial-account** (1 file) — `docs/generated-custom-windows/financial-account.md`, the
  guide for the window whose bank-connection flow this changes. Documentation only; no
  `artifacts/financial-account/` file is touched, so no contract, no regen, no push to NEO.
- **repo-infra** (1 file) — `docs/i18n-guide.md`, a note recording when to return a structured code
  instead of adding a `backendErrors.js` matcher.
- **com.etendoerp.go** (sibling repo, lockstep) —
  `src/com/etendoerp/go/schemaforge/FinancialAccountBankConnectionHandler.java` and its
  `FinancialAccountBankConnectionHandlerQueryTest`.

## What it does NOT change

- **No status-code or flow change.** Still HTTP 200 with `{accounts: []}` in every case; the
  connection is refused exactly as before. Only the payload gains two optional fields.
- **No change to `com.etendoerp.psd2.bank.integration`.** `filterAccountsByCurrency` and its
  siblings are used exactly as they were.
- **No pipeline surface.** No `decisions.json`, no `contract.json`, no generated file, no generator.
- **Backwards compatible in both directions.** An unknown or absent `emptyReason` degrades to the
  pre-existing generic label, so the SPA keeps working against a backend that predates this change.

## Tests / verification

- **Backend** — 6 new tests in `FinancialAccountBankConnectionHandlerQueryTest`, one per reason plus
  the cascade (a USD FA emptied by the type filter reports `typeMismatch`, not `currencyMismatch`)
  and the non-empty case (neither key present, `providerName` still resolved). All assert HTTP 200.
  A new `stubFilters` helper stubs each of the three filters with its own array; the existing
  `passThroughFilters` returns the same array from all three and cannot express which one emptied
  the list. Left untouched.
- **Frontend** — 64 tests green across the three suites. Written test-first and confirmed red before
  the fix (10 failures, each for the intended reason). No regressions: 1354 vitest in
  `src/hooks` + `src/locales`, 2036 `node:test`.
- **Locale parity** — the new suite asserts the three labels plus the generic fallback in all three
  locales, and that `{currency}` appears exactly once (`useUI` interpolates with `String.replace`
  and a string pattern, which substitutes the first occurrence only).
- **Live** — reproduced and confirmed on the running app: a USD account against a EUR-only bank now
  toasts "No se encontraron cuentas en USD en el banco seleccionado. La conexión no puede
  establecerse.", and no selection modal opens (CP-1 and CP-2).

## Rollback

Revert the two commits, one per repo, on `feature/ETP-5179`. They are independent in the safe
direction: reverting only the frontend leaves the backend sending two fields nobody reads (harmless,
the payload is additive); reverting only the backend leaves the frontend falling through to the
generic label, which is exactly the pre-ETP-5179 behaviour. No DB migration, no configuration, no
regeneration is involved either way.

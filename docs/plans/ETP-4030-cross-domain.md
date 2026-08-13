# ETP-4030 Cross-Domain Plan

## Scope

This PR intentionally spans the invoice exchange-rate feature end to end: the two
supporting currency windows, the two invoice windows that consume them, the
generator support those windows require, and the shared app-shell plumbing that
renders them. These pieces are mechanically interdependent and would produce
broken intermediate states if split.

Dominios (domains):

- `window:conversion-rates`: new Finance window — the general conversion-rate
  catalog the completion guard consults; auto-downloaded rates lock as `Synced`.
- `window:conversion-rate-downloader-log`: new Settings window — read-only audit
  log of the automated downloader runs that populate the catalog above.
- `window:purchase-invoice`: adds the **Exchange Rates** secondary tab
  (`secondaryTabs.exchangeRates`) and the completion currency guard.
- `window:sales-invoice`: same exchange-rate secondary tab and completion guard.
- `generator-change`: `cli/src/generate-contract.js` / `cli/src/generate-frontend.js`
  learn to emit secondary-tab `readOnlyLogic` (the `@DocumentStatus@!='DR'` gate),
  plus the matching generator tests (`eval-tab-readonly`, `secondary-tab-readonly-logic`).
- `platform-change`: shared `contract-ui` consumers of that generated metadata —
  `DetailView.jsx` (rate⇄foreignAmount live refresh via the NEO `{response:{data:[…]}}`
  unwrap, secondary-tab inline callouts, parent-currency seeding), the new
  `evalTabReadOnly.js` helper, `DataTable.jsx` (`seedValues` for non-editable
  add-row columns), `App.jsx`, `menu.json`, and `windows/registry.js` registering
  the two new windows.
- `root-global-sensitive`: `cli/cache/ad-snapshot.json` — the offline AD snapshot
  must include the two new windows so the CI `regen-check FROM_CACHE=1` run stays
  idempotent.

## Reason

ETP-4030 is a single feature: let an invoice in a foreign currency carry a
document conversion rate and refuse completion when no rate exists. The generator
must emit the secondary-tab read-only metadata, the shared `DetailView`/`DataTable`
must consume it and keep `rate`/`foreignAmount` in sync, and the two new windows
supply the rate catalog and its sync log that the runtime guard reads. Shipping
any slice alone leaves the others referencing metadata, menu entries, or generated
output that does not yet exist. The offline AD snapshot is regenerated in the same
PR because `make regen-check FROM_CACHE=1` (the CI gate) diffs generated output
against it and would fail if it lagged the new windows. The runtime behavior
(completion block + server-side recompute) lives in the paired `com.etendoerp.go`
PR #437; the two PRs share the `feature/ETP-4030` branch name.

## Tests

- `cd tools/app-shell && npx vitest run src/components/contract-ui` — 258 tests
  covering `DetailView`, `DataTable` (incl. the new `DataTable.seededAddRow.vitest.jsx`
  seeded add-row regression), and the contract-ui suite.
- `node --test cli/test/eval-tab-readonly.test.js cli/test/secondary-tab-readonly-logic.test.js`
  — generator emission of secondary-tab read-only logic.
- `make regen-check FROM_CACHE=1` — offline regeneration of all windows is
  idempotent against the committed artifacts and `ad-snapshot.json`.
- `node cli/src/check-window-docs.js --base origin/epic/ETP-3504 --head HEAD` —
  window-doc freshness for the four touched windows.
- `make domain-boundary-check BASE=origin/epic/ETP-3504 LABELS=cross-domain-approved PR_BODY_FILE=docs/plans/ETP-4030-cross-domain.md`
  — this gate, with the approval label and plan.
- Paired runtime PR (`com.etendoerp.go` #437):
  `./gradlew test --tests com.etendoerp.go.schemaforge.InvoiceExchangeRateHandlerTest --tests com.etendoerp.go.schemaforge.InvoiceExchangeRateValidatorTest`
  in `etendo_core`.

## Rollback

- Revert the Schema Forge commits on `feature/ETP-4030`. The two new windows are
  additive (new `artifacts/` dirs + `menu.json` entries); reverting removes their
  menu items and routes cleanly, and existing windows fall back to the prior
  generated output.
- Revert the paired `com.etendoerp.go` PR #437 if the runtime completion guard and
  rate recompute must be rolled back (that logic lives entirely in the runtime repo).
- Restore the previous `cli/cache/ad-snapshot.json`; generated artifacts are
  reproducible afterwards with `make regen FROM_CACHE=1`.
- No database export or destructive migration is included in this Schema Forge PR.

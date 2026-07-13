# ETP-4402 Cross-Domain Plan

**Ticket:** ETP-4402 — "[Etendo Go] Ventanas y solapas de contabilidad requeridas para el módulo contable"

## Why this is one change, not several

Every domain touched by this branch exists to deliver a single functional
requirement: **the accounting module needs an "Accounting" tab, wired to real
GL account fields, on every master window it depends on.** The window list
(`product`, `tax`, `assets`, `asset-group`, `business-partner-category`,
`contacts`) is not six unrelated features bundled together — it is the same
`decisions.json` pattern (`window.secondaryTabs` / `detailEntity` + accounting
field classification) applied uniformly across every window the ticket names.
The non-window scopes below are mechanically required by that same change,
not independent work:

- `generator-change` / `platform-change` are needed only because one of the
  six windows (`business-partner-category`) is new and must be registered
  with the pipeline and wired into the app shell.
- `repo-infra` is a knowledge-base update produced by the tenant-remediation
  work done as part of this same ticket (see below).

## Domains touched

| Domain | Files | Reason |
|--------|-------|--------|
| `window:product` | `artifacts/product/{contract.json,contract.mcp.json,decisions.json,generated/web/product/*}`, `docs/generated-custom-windows/product.md` | New Accounting tab (`detailEntity`, GL account fields classified) |
| `window:tax` | `artifacts/tax/{contract.json,contract.mcp.json,decisions.json,generated/web/tax/*}`, `docs/generated-custom-windows/tax.md` | New Accounting tab |
| `window:assets` | `artifacts/assets/{contract.json,contract.mcp.json,decisions.json,generated/web/assets/AssetsPage.jsx}`, `docs/generated-custom-windows/assets.md` | New Accounting tab |
| `window:asset-group` | `artifacts/asset-group/{contract.json,contract.mcp.json,decisions.json}`, `docs/generated-custom-windows/asset-group.md` | New Accounting tab |
| `window:business-partner-category` | `artifacts/business-partner-category/{contract.json,contract.mcp.json,decisions.json,generated/web/business-partner-category/*}`, `docs/generated-custom-windows/business-partner-category.md` | **New window** — master (`C_BP_Group`) + inline-editable Accounting detail (`C_BP_Group_Acct`) |
| `window:contacts` | `artifacts/contacts/{contract.json,contract.mcp.json,decisions.json,generated/web/contacts/*}`, `docs/generated-custom-windows/contacts.md` | New Customer + Vendor Accounting tabs on the Business Partner window |
| `generator-change` | `cli/config/regen-windows.json`, `core-maps/ad-menu-cache.json` | Register the new `business-partner-category` window and its menu entry so pipeline/regen tooling recognizes it |
| `platform-change` | `tools/app-shell/src/App.jsx`, `tools/app-shell/src/locales/{en_US,es_ES}.json`, `tools/app-shell/src/menu.json`, `tools/app-shell/src/windows/registry.js` | Wire the new window's mock-data import, i18n labels (EN/ES — includes the "Grupos de Terceros" → "Categoría de Contacto" rename), menu entry, and registry entry |
| `repo-infra` | `docs/etendo-ad/onboarding-and-datafixes-map.md`, `docs/etendo-ad/tenant-remediation-knowledge.md` | Living knowledge-base docs updated by the tenant-remediation work (data-fix + onboarding fix) done under this ticket |
| `unknown` | `cli/src/data-fixes/sql/20260701T120000Z__R9-bp-category-seed.sql` | Corrective data-fix (`R9-bp-category-seed`): seeds/renames default BP Categories (Cliente/Proveedor/Acreedor) for existing tenants |
| `unknown` | `docs/generated-custom-windows/INDEX.md` | Index entry for the new `business-partner-category` window doc |

**Companion repo:** `com.etendoerp.go` carries a separate `feature/ETP-4402`
branch (separate PR, not part of this repo's boundary check) with the
preventive-onboarding counterpart: five new `@Named` `NeoHandler` beans
(Product / Tax / Customer / Vendor / BusinessPartnerCategory accounting
handlers) plus `OnboardingAccountingWiringService.java` and
`OnboardingDefaultCustomerService.java` changes, so brand-new tenants get the
same default BP Categories and correct GL account wiring at provisioning
time, not just existing tenants via the data-fix above.

## Tests / verification performed

- `make regen ONLY=<window>` run for every touched window (`product`, `tax`,
  `assets`, `asset-group`, `business-partner-category`, `contacts`); the
  Window Change Integrity Protocol steps (contract integrity check, generated
  import-path check, `addLineFields` check) were run and passed for each.
- **Corrective path:** `cli/src/data-fixes/run.js --fix R9-bp-category-seed`
  applied against client GOClient (`802509E12436405C86BA1FD5B1DF508C`) after a
  `pg_dump` backup; verified via DB query that BP Group accounts resolved
  correctly. The fix is idempotent — every statement is guarded by
  `WHERE`/`NOT EXISTS` conditions on natural keys (`value`, `c_element_id` +
  `value`), so a re-run is a no-op.
- **Preventive path:** a brand-new test client (`acreedortest`, later
  re-verified with `acreetest2`) was provisioned end-to-end through the real
  onboarding flow and manually verified in the running app
  (`goclean.localhost:3100`). This caught a real bug — a silent 0-row account
  override caused by a trigger-cascade visibility gap across sequential
  onboarding queries in Java — fixed in
  `OnboardingAccountingWiringService.java` (merged via commit `c5ba1dd7` in
  `com.etendoerp.go`).
- Confluence "Contabilidad | Test Plan" page (pageId `5049843714`), Group 12
  (TC-51–60), documents full manual test coverage for this ticket, including
  live-verification notes for the bug found and fixed above.
- `node cli/src/validate-pipeline.js` (via `npx sf-validate-pipeline`) run
  clean for all touched artifacts.

## Known accepted limitation (tracked separately, out of scope here)

The **Accounting** tab cannot be forced to always render last in tab order
without modifying CODEOWNERS-gated core files. Per
`docs/generated-custom-windows/product.md`: `secondaryTabs` entries are
always appended before `customPanelTabs` entries by `resolveSecondaryTabDefs`
(`cli/src/generate-frontend.js`), and there is no `decisions.json`-level
switch to invert that order — fixing it properly touches
`generate-frontend.js` / `DetailView.jsx`. A Jira task (**ETP-4415**) was
created and assigned to Valentín Vivaldi to track this as future generator
work.

## Rollback plan

**Schema Forge side:** revert the `feature/ETP-4402` merge commit on
`epic/ETP-3504`. All changes are additive `decisions.json`/generated-artifact/
doc changes plus one new window registration — no destructive migrations.
The `R9-bp-category-seed.sql` data-fix is idempotent but is **not**
auto-reverted by a code rollback — if the seeded BP Categories/account
overrides need to be undone for already-fixed tenants, that requires a
follow-up corrective data-fix (out of scope for this document to author,
noted here only for awareness).

**com.etendoerp.go side:** revert the corresponding merge commit. The new
`NeoHandler` beans are additive `@Named` beans, inert unless their qualifier
is referenced by an `ETGO_SF_ENTITY.Java_Qualifier` row, and the onboarding
changes only affect newly provisioned clients going forward — no impact on
already-provisioned tenants from a code-only rollback.

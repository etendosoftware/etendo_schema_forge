# ETP-6098 — Split the Spanish localization out of `com.etendoerp.go`

Plan detail for [ETP-6098](https://etendoproject.atlassian.net/browse/ETP-6098) (planning story,
epic ETP-5339). The Jira issue holds the summary and the checklist; this file holds the detail
behind every decision. Keep both in step.

## Goal and acceptance

- `com.etendoerp.go` (the core) must not depend on the Spanish localization. Everything Spanish
  moves to a new module, `com.etendoerp.go.es`, which depends on `go`. A future Argentina
  localization is `com.etendoerp.go.ar` on the same extension points.
- **Guiding rule: the system must behave exactly the same.** Same URLs and endpoints, same API JSON
  (property names included), same message keys, same `@Named` / `javaQualifier`, same AD and Schema
  Forge row IDs, same role access, same onboarding step order. Only the owning module of each
  artifact and the Java package of the moved classes change.
- **Acceptance of the split:** `go` installs, builds and starts on a database with no Spanish
  module, verified in the local environment `go-sin-es` (tanda 10).

### Decision rule ("the Argentina test")

> Would this exist the same way for an Argentinian customer? Yes → core (`go`). No, or it would be
> different → `com.etendoerp.go.es`.

Hints: it names a Spanish body, law or format (AEAT, SII, TicketBAI, Verifactu, Modelo
303/349/390, VIES, NIF/CIF); it depends on a Spanish module; it loads Spanish data (AEATSII, PGC);
it hard-codes the country (`"ES"`). Grey zone: when the concept is generic but the implementation
is Spanish, the mechanism stays in the core and the implementation goes to the localization,
joined by an SPI.

An **SPI** is an interface the core defines for a country-dependent need (for example "validate a
tax id"); each localization implements it and CDI injects whatever is installed. It is the same
mechanism `NeoHandler` uses.

## Strategy chosen: core = `go`, localization = `com.etendoerp.go.es`

The alternative (a new core module `com.etendoerp.etendoai.core`, with business and SaaS left in
`go`) was discarded.

| | A: new core `etendoai.core` | B (chosen): `go` core + `go.es` |
|---|---|---|
| Driver | Platform vs business | Country (Spain now, Argentina later) |
| Java classes moved | ~480 (package rename) | ~50 |
| Core classes needing an SPI | ~40, incl. splitting `EtendoGoJwtServlet`, the onboarding chain and the MCP router | ~20 |
| Tables renamed | 11 (`ETGO_*` → `ETAI_*`) | 0 |
| `EM_` columns migrated | 2 | 0 |
| Data migration | Yes (tokens, sessions, usage, emails, batch jobs) | No |
| API contract changes | Yes | No |
| schema_forge / schema_forge_core impact | ~105 files (`ETGO_SF_*`) | `push-to-neo` / `neo-writer` (`module` key) |
| Incremental | Hard | Natural |

A module owns exactly one DB prefix (`AD_MODULE_DBPREFIX_UNIQUE_TRG`) and a message key must start
with its module prefix (`AD_MESSAGE_TRG`). Keeping `ETGO` in `go` is what avoids renaming 30 tables
and 55 `EM_ETGO_*` columns on ERP tables (renaming an `EM_` column renames its DAL property and the
API JSON field).

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Strategy B (above) | 5–10× smaller, no data migration, incremental, matches the real driver |
| D2 | Prefix `ETGO` stays in `go` | Moving it renames far more and changes the API |
| D3 | `C_INVOICE.EM_ETGO_TBAI_STATUS` stays in `go` with the same name; `ETGO_GET_TBAI_STATUS` becomes tolerant to TicketBAI being absent (same technique as `ETGO_GET_DELIVERY_STATUS`) | Only option with no API change; with TicketBAI installed it returns the same as today |
| D4 | `ETGO_*` messages used by Spanish code stay in `go` with the same key | Moving them changes keys returned by the API |
| D5 | Spanish Schema Forge rows only change `AD_MODULE_ID`, declared with a `module` key in `decisions.json` | Same IDs and content; survives re-push; validated by the pipeline |
| D6 | GOClient dataset moves to `.es` behind `OnboardingDatasetProvider` | Spanish data (PGC, taxes, `AEATSII_*`); same classpath path, same result |
| D7 | Installation: one instance uses the module | Install `.es` there in the same deploy, and in local-env / CI |
| D8 | New module `com.etendoerp.go.es`; `com.etendoerp.go.localization.es.data` is not touched and keeps only what it has today | Code does not belong in a data module; moving the reference dataset risks reapplying it |
| D9 | Repo `etendosoftware/com.etendoerp.go.es`, distributed as source like `go`, **not published to Maven** | Same way `go` reaches CI and deploys |
| D10 | DB prefix `ETGOES` (`ETGLES` is taken by `.es.data`) | Only the TicketBAI index uses it for now (`ETGOES_TBAISYNC_INVOICE_IDX`) |
| D11 | Language stays in the core; only country-dependent code goes to `.es` | An Argentinian customer also reads Spanish |
| D12 | Frontend out of scope, except `"module": "es"` in the decisions and the `push-to-neo` / `neo-writer` change | The goal is the Java module |
| D13 | Tests move with their class; `testsupport` stays in `go` and `.es` uses it in place (modules are built together inside `etendo_core`) | No publishing; verify in tanda 1 |
| D14 | Tax Report Launcher is treated as Spanish, moved in tanda 4 with `AbstractFiscalHandler` | Only the Spanish fiscal models use it |
| D15 | SPI list (below) | |
| D16 | Default country comes from the preference `ETGO_DefaultCountry`: `go` defines the property, `.es` inserts the System row with `ES` | Replaces hard-coded `"ES"`; read with a direct `AD_Preference` query (like `FiscalTestModeResolver`), cached |
| D17 | `com.etendoerp.sampledata.go` depends on `.es` instead of `go`; `com.etendoerp.go.template` is untouched | sampledata carries Spanish taxes and columns |
| D18 | Acceptance test is a local environment `go-sin-es` first, CI later | |
| D19 | Modules are updated and merged together in every repo (one merge block per tanda) | No version ranges or deploy ordering needed |

### SPIs

| SPI (working name) | Purpose | Core caller | `.es` implementation | Tanda |
|---|---|---|---|---|
| `NeoBuiltInEndpoint` registry | Endpoints contributed by a localization | `NeoBuiltInEndpointHandler` | Modelo 303/349/390 endpoints | 4 |
| `FiscalSubmissionHook` | What happens to an invoice when completed | Sales and purchase invoice header handlers | SII, TicketBAI | 5 |
| `InvoiceFiscalExtension` | Fiscal defaults, callouts and guards on invoices | `AbstractInvoiceHeaderHandler`, `InvoiceCalloutHelper`, `NeoBackgroundDefaultsService`, `InvoiceReactivationGuard`, `CorrectInvoiceHandler`, `RectificativeSupport`, `CompletedInvoiceWriteFence` | SII, TBAI, Verifactu, SIF rules | 5 |
| `PrintableExtension` | Extra data on a printed document | `NeoPrintableCommons` | Verifactu QR | 5 |
| `NeoCertificateProvider` | Digital certificates | `NeoCertificateHelper` | SIF | 5 |
| `TaxIdValidator` | Validate and normalize a tax id per country | `BusinessPartnerHandler`, `OrganizationInformationHandler`, `SignupRequest`, `ContactsLocationAddressHandler`, `ReceiverTaxIdCheck`, `EtendoGoJwtServlet` | NIF/NIE/CIF, `bptaxidkey` | 6 |
| `SelectorPolicy` via CDI | Selector policies contributed by a localization | `NeoSelectorPolicy` (today a fixed `List.of(new …)`) | `InvoiceLineTaxSifSelectorPolicy` | 7 |
| `RoleAccessContribution` | Windows/processes granted by template roles | `TemplateRoleWindowAccess`, `RoleAccessMatrix` | SII, TBAI, Verifactu, Tax Report windows | 7 |
| `OnboardingStep` | Ordered onboarding steps | `OnboardingProvisioningChain` (today 13 hard-coded `new`) | SII fiscal data, test mode | 8 |
| `OnboardingDatasetProvider` | Onboarding template dataset | `OnboardingSourceFiles` and onboarding services | GOClient | 8 |
| `CountryLocalization` | Country registry: code, currency, language, tax-id validation, pool | `SignupOptions`, `TenantPoolConfig`, onboarding | Spain | 8 |

Common rules: with no implementation installed the core behaves as a customer with no
localization (nothing fails for a missing implementation); explicit order where it matters (pin
the current 13-step onboarding order with a test before touching it); each contract is closed in
the PR of its tanda.

### The 17 core classes with something Spanish

- Covered by SPIs: `AbstractInvoiceHeaderHandler`, `CorrectInvoiceHandler`, `InvoiceCalloutHelper`,
  `InvoiceReactivationGuard`, `NeoBackgroundDefaultsService`, `SignupRequest`,
  `CompletedInvoiceWriteFence`, `ReceiverTaxIdCheck`.
- Stay in the core (language, not country): `EmailMessages`, `NeoHints`.
- Generalized: `OrganizationCountrySupport` ("which country is the organization").
- Moved with GOClient: `OnboardingSampleDataDefinition`.
- Country list from `CountryLocalization`: `SignupOptions`.
- Hard-coded `"ES"` replaced by `ETGO_DefaultCountry`: `FinancialAccountCountrySupport`,
  `OnboardingOrgInfoService`, `PaidProvisioningService`, `TenantPoolConfig`.

## Inventory

### Module and Gradle dependencies (move from `go` to `.es` in tanda 2)

- `AD_MODULE_DEPENDENCY`: Tax Report 390 (`aeat390.es`), Etendo Go Spanish Fiscal Taxes Data
  (`go.localization.es.data`), TicketBAI, Legal Representative (`organization.representative.es`).
- `build.gradle`: `localization.spain.extensions`, `bulk.posting.es_es`.
- PSD2 (SaltEdge) is European, stays in the core.

### Java

~50 classes move: `Fiscal303/349/390*`, `FiscalAeat*`, `FiscalDecl*` Spanish parts, `Sii*`,
`Tbai*`, `Verifactu*`, `SifSubRecordAttachments`, `MarkSubsanationHandler`,
`SpanishTaxIdValidator`, `SiiConfigDeactivateHandler`, `TbaiConfigSequenceHandler`,
`OnboardingFiscalDataSetupService`, `OnboardingForceTestModeService`.

### Database (nothing renamed except one index)

| Object | Action |
|---|---|
| Index `EM_ETGO_TBAISYNC_INVOICE_IDX` on `TBAI_SYNCINVOICE` | Move to `.es` as `ETGOES_TBAISYNC_INVOICE_IDX` (no data) |
| `ETGO_GET_TBAI_STATUS` + `C_INVOICE.EM_ETGO_TBAI_STATUS` | Stay in `go`; function made tolerant (D3); computed-column dependency rows on TBAI tables move to `.es` |
| `ETGO_GET_DELIVERY_STATUS` | Stays (already reads `em_etsg_isrectificative` tolerantly) |
| `AEATSII_CAUSE_EXEMPTION` (24 rows) | `AD_MODULE_ID` → `.es` |
| `ETGO_FISCAL_DECL`, `ETGO_FISCAL_DECL_INCIDENT` | Stay as the generic fiscal-declaration base |
| The other 54 `EM_ETGO_*` columns, all `ETGO_*` tables, functions, triggers, view | Stay in `go` |

### Schema Forge configuration (`ETGO_SF_SPEC/ENTITY/FIELD`)

Tables stay in `go`; Spanish rows only change `AD_MODULE_ID`. Mandatory: they point at windows,
tabs and columns of Spanish modules.

- Whole Spanish windows: 6 specs, 30 entities, ~896 fields.
- Spanish fields inside core windows: ~286 (mostly the invoice `header`: 73 SII, 69 Verifactu, 30
  TicketBAI; also `tax`, `product`, business partners).
- `module` key in `decisions.json` at root (spec), entity and field level, inherited field → entity
  → spec, default `go`. A child's module must equal its parent's or depend on it (`go` → `es` is
  valid, `es` → `go` is not). `"es"` resolves to `com.etendoerp.go.es` through a configured map,
  looking the `AD_MODULE_ID` up by `javapackage`.
- `push-to-neo` / `neo-writer` (schema_forge_core) write each row's `ad_module_id` from the
  resolved value. Today they assign one module per run (`SF_MODULE_ID`, default `go`) and
  overwrite `ad_module_id` on update, so re-pushing a core window would pull the Spanish fields
  back into `go`.
- Pipeline validation: fail when a spec/entity/field points at an AD object of a localization
  module and is not marked with that `module`.
- Not caught by that validation: a core entity whose `javaQualifier` names a `NeoHandler` living in
  `.es`. `go-sin-es` catches it.

### Other modules depending on `go`

- `com.etendoerp.go.template`: nothing Spanish; untouched.
- `com.etendoerp.sampledata.go` (GOClient for `install.source`, 112 files with Spanish taxes and
  columns): depends on `.es` instead of `go` from tanda 2.
- Debt: two GOClient copies that already diverge (`go/referencedata/sampledata/GOClient`, 121
  files; `sampledata.go`, 112). Not unified here.

## Execution: progressive migration in tandas

People are working in `go`, so the split goes in small tandas, each deployable alone with no
observable change.

**Rule of every tanda**

- One PR in `go` (adds the SPI, deletes what moves) and one in `com.etendoerp.go.es` (adds the
  implementation); plus `schema_forge` / `schema_forge_core` when configuration moves.
- All PRs of a tanda use **the same branch name** and enter the same merge block together.
- Before each tanda, check active branches (unmerged, commits in the last 30 days) touching the
  files that move; coordinate or wait; announce the moved files to the team.
- Moving a file to another repo restarts its git history in `.es`; an open branch that edits a
  moved file gets a modify/delete conflict and must port its change to `.es`.

Active branches on 2026-11-05: 18 in `go`, none touching Spanish code or data. Core classes that
get an SPI and are touched: `EtendoGoJwtServlet` (ETP-5053, ETP-5628, ETP-5743, ETP-5806),
`OnboardingProvisioningChain` (ETP-5870), `ContactsLocationAddressHandler` (ETP-5806). Two touch
the big sourcedata XMLs.

| Tanda | What | Core touched | Active branches at risk |
|---|---|---|---|
| 1 | Create repo `etendosoftware/com.etendoerp.go.es` with an empty module (`AD_MODULE`, prefix `ETGOES`, depends on `go`, `build.gradle` with no Spanish dependency, basic workflows) and wire it into every pipeline that brings `go` (below). Nothing moves; `go` keeps its dependencies. | None (CI and scripts) | 0 |
| 2 | Dependencies: `go` drops the Spanish ones and `.es` declares them; `com.etendoerp.sampledata.go` depends on `.es`. Start measuring with `go-sin-es`. | `AD_MODULE_DEPENDENCY`, `build.gradle` | 0 |
| 3 | Spanish data: `ETGO_SF_*` / AD rows (`AD_MODULE_ID`, `module` key), TBAI index, `AEATSII_CAUSE_EXEMPTION`, computed-column rows on TBAI tables. PR in `schema_forge_core` (`push-to-neo` / `neo-writer`). | sourcedata XML | 2 |
| 4 | Fiscal models 303/349/390 (~35 classes, Tax Report Launcher, `AbstractFiscalHandler`) + endpoint SPI | `NeoBuiltInEndpointHandler` | 0 |
| 5 | SII, TicketBAI, Verifactu (handlers, submission on complete, QR, SIF certificates) | Invoice headers, `NeoPrintableCommons`, `InvoiceReactivationGuard`, `CorrectInvoiceHandler`, `CompletedInvoiceWriteFence`, `NeoCertificateHelper` | 0 |
| 6 | Tax id validator and tax id type | `BusinessPartnerHandler`, `OrganizationInformationHandler`, `SignupRequest`, `ContactsLocationAddressHandler`, `ReceiverTaxIdCheck` | 1 (ETP-5806) |
| 7 | SIF tax selector policy, role access to Spanish windows | `NeoSelectorPolicy`, `TemplateRoleWindowAccess`, `RoleAccessMatrix` | 0 |
| 8 | GOClient, Spanish onboarding steps, `ETGO_DefaultCountry`, country registry | `OnboardingProvisioningChain`, `OnboardingSourceFiles`, `tasks.gradle`, `SignupOptions`, `TenantPoolConfig`, services with `"ES"` | 1 (ETP-5870) |
| 9 | The Spanish bits left in `EtendoGoJwtServlet` | `EtendoGoJwtServlet` | 4 (last, coordinated) |
| 10 | `go-sin-es` green (acceptance) | — | — |

**Hidden dependency during tandas 2–9.** From tanda 2 `go` no longer declares the Spanish modules
but still has code, rows or an index using them until tanda 9. It works because `.es` is always
installed with `go` (joint deploy), `update.database` loads the data of all installed modules with
foreign keys disabled (order between modules does not matter, only that they are installed)
[INFERENCE: standard Openbravo/Etendo `update.database` behaviour, not observed in a log here],
and smartbuild compiles all installed modules together. Risk: compiling or publishing `go` alone
fails while it has Spanish imports.

### Tanda 9 in detail: `EtendoGoJwtServlet`

~8000 lines serving `/sws/go/*` (login, signup, onboarding, purchases, plans); the most shared
class. It stays in `go`; three Spanish bits leave it:

| What | Where (approx.) | Replacement |
|---|---|---|
| NIF validation on signup and onboarding (`SpanishTaxIdValidator` when country is `ES`) | ~5254, ~6508 | `TaxIdValidator` (tanda 6) |
| Default country `"ES"` when the form omits it (`optString(FIELD_COUNTRY_CODE, "ES")`) | ~5292, ~6360 | `ETGO_DefaultCountry` (tanda 8) |
| Direct `new OnboardingFiscalDataSetupService()` / `OnboardingForceTestModeService()` and the test-mode revert on going productive | ~481–494, ~4480 | `OnboardingStep` (tanda 8) |

By tanda 9 the SPIs exist; only 5–6 call sites change. Verification: signup/onboarding tests give
the same result with `.es` installed (invalid NIF rejected with the same error, default country
Spain); in `go-sin-es` signup works with no NIF validation and no default country.

## Tanda 1 in detail: wiring the repo into every pipeline

### Jenkins (`com.etendoerp.jenkins.pipelines`, Bitbucket)

`etendo-go/go/Jenkinsfile`, `etendo-go/schemaforge/Jenkinsfile`,
`etendo-go/experimental/ExperimentalJenkinsfile` and `ExperimentalSchemaForgeJenkinsfile` do not
clone by themselves: they call `etendo-go/utils/cloneModules.groovy`. The merge block pipeline does
not clone modules. One change in `cloneModules.groovy` covers all of them.

How `cloneModules.groovy` picks branches today:

| Step | Branch |
|---|---|
| `etendo_core` | PR branch if it exists in core, else the epic, else `epic/ETP-3504` |
| The PR's repo (`go` or `etendo_schema_forge`) | The PR commit |
| The sibling repo (`go` ↔ `schema_forge`), `checkoutSiblingModule` | PR branch → epic → `develop` (or `main` for hotfix / PRs into `main`) |
| Extras from `jenkinsExtraModules.txt` | `git clone --branch epic/ETP-3504`, then PR branch → epic. **Never `develop`.** |

**`.es` cannot be an extra.** The extras clone runs `git clone --branch epic/ETP-3504`; a repo
without that branch makes the clone fail and stops the pipeline. `.es` must be a **sibling**, like
`schema_forge`.

Draft change (branch `feature/ETP-6098` in the Jenkins repo, not pushed), in
`cloneModules.groovy`:

1. PRs from `go` and from `schema_forge`: clone `com.etendoerp.go.es` into
   `etendo_core/modules/com.etendoerp.go.es` and pick its branch with `checkoutSiblingModule`
   (PR branch → epic → `develop`/`main`). Guarded with `git ls-remote`: while the repo does not
   exist the pipelines behave exactly as today, so the change can merge before the repo is created.
2. Case 3, PRs from `com.etendoerp.go.es`: clone it at the PR commit, `go` and `schema_forge` as
   siblings.
3. `STACK_INFO` line and `ETENDO_GO_ES_BRANCH` / `ETENDO_GO_ES_HASH`, like `go` and `schema_forge`.

Still to do on the Jenkins side for case 3: register the `.es` repo webhook in the `go` and
experimental jobs and review their `regexpFilterExpression`. Tests: the `go` Jenkinsfile runs
`com.etendoerp.go.*`, which already matches `com.etendoerp.go.es.*`. Sonar and coverage only
measure `GO_MODULE_DIR`; enough for tanda 1.

### Deploy pipelines (`com.etendoerp.jenkins.pipelines/etendo-go-staging/`)

These live on branch `feature/ETP-3604` of the Jenkins repo, not on `develop` (on 2026-11-12:
116 commits ahead and 279 behind `develop`). They do not use `cloneModules.groovy`: each one
updates a checkout that stays on a build server and then deploys it.

Jobs read on 2026-11-12 with `make jenkins` (skill `jenkins`):

| File | Job (instance `jenkins-go`) | Trigger | How it brings `go` today | How it brings the extras |
|---|---|---|---|---|
| `JenkinsfileProduction` → `remote-production/update-code.sh` | `etendo-prod` (production) | Push to `main` | Clone or update on `GO_BRANCH` (`main`) | `jenkinsExtraModules.txt` on `epic/ETP-3504` |
| `JenkinsfileExperimental` | `etendo-go-experimental` (experimental) | Push to `develop` | Clone or update on `GO_BRANCH` (`develop`) | `jenkinsExtraModules.txt` on `epic/ETP-3504` |
| `JenkinsfileDatafixes` | `etendo-datafixes` | Manual | Does not bring modules | — |
| `Jenkinsfile`, `JenkinsfileStaging` | **None** on `jenkins-go` | — | (`JenkinsfileStaging` pins `go` to `epic/ETP-3504`) | — |

After the extras, each flow resets every other git repo under `modules/` to its current branch
(`MANAGED_MODS` lists the ones it skips).

Change for tanda 1, in `JenkinsfileExperimental` and `remote-production/update-code.sh` (the two
wired to a job; `Jenkinsfile` and `JenkinsfileStaging` only if they turn out to be used): right
after `go`, clone or update `com.etendoerp.go.es` into
`${ETENDO_DIR}/modules/com.etendoerp.go.es` on **the same branch as `go`**, falling back to
`develop` (`main` in production) when `.es` does not have it; add it to `MANAGED_MODS`; skip it
with a message while the repo does not exist (`git ls-remote`), so the change can merge before the
repo is created. Not through `jenkinsExtraModules.txt` (pinned to the epic).

The earlier open question about staging pinning `go` to `epic/ETP-3504` only applies if
`JenkinsfileStaging` is in use; no job on `jenkins-go` runs it. Confirm with the team whether it
is dead code.

The jobs cannot be moved off `feature/ETP-3604` (confirmed with the team on 2026-11-12), so this
change is a PR **into `feature/ETP-3604`**, separate from the `cloneModules.groovy` PR into
`develop`. Draft: branch `feature/ETP-6098-deploy` of the Jenkins repo (local worktree
`etendo_develop/com.etendoerp.jenkins.pipelines-ETP-6098-deploy`, not pushed), changing
`remote-production/update-code.sh` and `JenkinsfileExperimental`. While `.es` (or its `main` /
`develop` branch) does not exist the step is skipped, so it can merge first; once `.es` is on the
build server, an unreachable branch stops the deploy instead of shipping a stale copy.

What else the production deploy needs:

- The `.es` repo has `main` and `develop` from day one, and `etendobot` can read it (the deploy
  clones with its token).
- **Merge order.** `etendo-prod` fires on the push to `main` of `com.etendoerp.go` and takes the tip
  of every module at that moment; `.es` has no webhook to it. In each merge block, merge `.es`
  **before** `go`, or the deploy ships the new `go` with the old `.es`. Same for `develop` and
  `etendo-go-experimental`. (Adding a `.es` webhook instead would start a second ~1 h deploy.)
- The delta toolchain (`etendo-go-architecture/scripts`, `generate-delta.sh`) already handles a
  module that is not in the production `AD_MODULE` yet (`detect-changed-modules.py`: "not yet in
  DB (new module)"), so the first deploy installs `.es` through the normal delta.
  [INFERENCE: read in the script, not exercised; tanda 1 on experimental is the proof.]

**Jobs that do not run the Jenkins repo's `develop`:** the CI change in `cloneModules.groovy`
(merged to `develop`) reaches `etendo-go-tests`, `schema-forge-tests` and the merge block jobs,
but not `experimental-etendo-go-tests` (`feature/ETP-6069`) nor
`experimental-schema-forge-tests` (`feature/ETP-5951`). Those branches must take it, or the jobs
move back to `develop`, before tanda 1 is accepted.

### GitHub Actions in `go` and `schema_forge`

| Pipeline | File | Change |
|---|---|---|
| `go` mini-pipeline, full pipeline pilot | `go/.github/workflows/mini-pipeline.yml`, `full-pipeline-pilot.yml`, action `etendo-env` | They clone `jenkinsExtraModules.txt` with "PR branch, else the core branch (epic)". Same problem as Jenkins: clone `.es` as a sibling with fallback `develop`/`main`, not through the extras list. |
| Offline regen check | `offline-regen-check.yml` in `go` and `schema_forge` | Also clone `.es` (needed from tanda 3; do it now) |
| Deploy to staging | `go/.github/workflows/deploy-staging.yml` | Copy `.es` into `etendo_core/modules/com.etendoerp.go.es`, same branch as `go` |
| Deploy to experimental | `ExperimentalJenkinsfile` | Covered by `cloneModules.groovy` (the image is built from what was cloned) |
| Developer tooling | `schema_forge/scripts/modules-policy.json`, `checkout-modules.js`, `check-modules.js`, `merge-block-check.sh` | Add `.es` as `base` |
| Merge block and branches | `merge-block-helper` agent | Add `.es` as a repo of the merge block (its own workflows: next section) |

### CI of the `.es` repo: copy `go`'s workflows once

When the repo is created, copy the GitHub Actions of `go` (`develop`) with the scripts they call,
as every other repo of the organisation does (each keeps its own copies; there is no shared sync).
Later changes to `go`'s workflows are ported by hand when needed.

| Group | Workflows (and what they need) | How |
|---|---|---|
| Generic, no reference to `go` | `git-police`, `branch-merge-policy`, `base-branch-health`, `auto-reviewer`, `xml-order-check`, `hooks-verification` (+ `.githooks/`, `scripts/verify-hooks-trailer.sh`), `back-merge-main` (+ `scripts/back-merge-main.sh`) | Copied as they are |
| With their checker script | `test-hygiene`, `test-cells`, `unit-test-classification`, `extension-guardrails` (+ their `scripts/*.py` / `*.sh` and the scripts' tests; the guardrails allowlist starts empty in `.es`) | Copied as they are |
| Need adapting | `mini-pipeline` (the PR's repo is `.es` at the PR commit, `go` and `schema_forge` as siblings PR branch → epic → `develop`/`main`; own Sonar project key), `full-pipeline-pilot` (paths and coverage of `.es`; uses `go`'s `etendo-env` action from the cloned `go`) | Copied and edited |
| Already generated from `schema_forge` | `offline-regen-check` | `make sync-regen-check-workflow` also writes the `.es` copy (needed from tanda 3) |
| Not for `.es` | `build-jsreport` (jsreport image of `go`), `deploy-staging` (disabled; deploys are in Jenkins) | — |

Outside the files, set up in the new repo: secrets used by those workflows (`ETENDOBOT_TOKEN`,
`NEXUS_USER` / `NEXUS_PASSWORD`, `BITBUCKET_SSH_KEY`, `SONAR_*`, `DOCKERHUB_*`, `OPENAI_API_KEY`;
not checked whether they are organisation or repository secrets), branch protection on `main` and
`develop` with the same required checks as `go`, and the Sonar project.

### Tanda 1 acceptance

1. A test PR with the same branch in `go` and `.es`: the `go` mini-pipeline and the `go` Jenkins
   job clone `.es` on that branch.
2. The schema_forge Jenkins job, experimental and the staging deploy bring `.es`.
3. In staging and experimental `com.etendoerp.go.es` shows as installed (`AD_MODULE`) and everything
   works the same.
4. With no branch of its own in `.es`, every pipeline falls back to `develop`, never to the epic.
5. `.es` has the same PR checks as `go`, written by the `make` target; its `--check` mode passes.

This is the tanda that most needs team coordination (shared Jenkins repo, `go` and `schema_forge`
workflows).

## Acceptance environment `go-sin-es`

- A local-env with `etendo_core` and `go` only: no `.es`, no `sampledata.go`, no Spanish modules
  (delete their copies under `<env>/modules`), clean `install` (not `update.database` on a DB that
  ever had them).
- Must give: install with no FK or missing-column errors, smartbuild, Tomcat start, SPA and MCP
  answering, core tests green.
- Used from tanda 2 as a progress measure; green in tanda 10. Plus a local script listing Spanish
  imports and Spanish-pointing rows in `go`.
- To confirm when building it: that local-env does a clean install rather than reusing a snapshot
  with Spanish modules; what happens to the GOClient seed of the GO plugin. A CI job is decided
  later.

## Open items

- Review the ~50-class list and the SPI callers before tanda 4.
- Validate that the tolerant `ETGO_GET_TBAI_STATUS` returns the same as today with TicketBAI.
- Check how `go` is published today (compiling `go` alone fails from tanda 2 to 9).
- Before/after equivalence: full suite plus a comparison of NEO discovery / OpenAPI, Schema Forge
  config served by the API, role access and the MCP tool catalogue, with the Spanish modules
  installed.
- Create one execution task per tanda (1 to 10); coordinate tanda 1 with the team.

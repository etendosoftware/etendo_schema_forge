# Onboarding & Data-Fixes — Where things live and how to extend them

**Audience:** Remedy (and any future run) — read this FIRST when touching tenant onboarding or authoring a corrective data-fix. Path-first, terse, queryable.

**Companions:**
- `docs/etendo-ad/tenant-remediation-knowledge.md` — living knowledge base (table quirks, corrected misinterpretations, DB facts). This map links into it.
- `docs/etendo-ad/onboarding-gaps.md` — the field findings + verified idempotent SQL per gap (A1…E1).
- `.claude/agents/tenant-fixer.md` — full runner/ledger design.

> **Repos.** Onboarding Java lives in the **`com.etendoerp.go`** module (`{etendo_root}/modules/com.etendoerp.go/`, Etendo root = parent of this repo). The data-fixes framework lives in **this repo** (`schema_forge`). Both share branches (currently `feature/ETP-4215`).

---

## 0. Two-front policy (MANDATORY for every onboarding-provisioning gap)

**Any defect where a tenant ends up missing provisioning data that onboarding should have created is fixed on BOTH fronts — never just one:**

1. **① Preventive — fix the onboarding process** so NEW tenants are born clean.
   The fix lives in `com.etendoerp.go` (the live service chain in `EtendoGoJwtServlet`, see §1), not in a step class (§2 is not wired). This is the root-cause fix: it stops the gap from ever appearing again.
2. **② Corrective — author a static `.sql` data-fix** (this repo, `cli/src/data-fixes/sql/`) so tenants that were **already onboarded** with the gap get repaired. The fix must be **frozen** (literal values baked in, no runtime dependency on GOClient existing in the DB) and **idempotent** (`NOT EXISTS` / `WHERE NOT` guards → safe to re-run).

**Why both:** the preventive fix does nothing for the tenants already in production with the gap; the corrective fix does nothing to stop the next onboarding from reproducing it. Shipping only one leaves half the fleet broken.

**Keep the two in lockstep.** When the same logic appears on both fronts (e.g. A2's six `*_acct` `INSERT … SELECT` statements — bp_group, product_category, bp_customer, bp_vendor, product, **tax** — live in `OnboardingAccountingWiringService.provisionEntityPostingAccounts`), the column lists, defaults source, org-inheritance and idempotency guards must match one-for-one. The five non-tax statements mirror `R1-chart-of-accounts.sql` step 11/11a–11e; the tax one (`TAX_ACCT_SQL`) reads the **system** tax catalog (`ad_client_id='0'`, since `C_TAX`/`C_TAXCATEGORY` are no longer per-client) and its corrective twin is the standalone **`R7-tax-accounts`** fix (joins the tenant's real schema(s), so it covers both freshly-charted and already-charted tenants). Note the lockstep relationship in both files' comments so a future edit to one is mirrored in the other.

**Worked examples (both fronts done):** A2 (per-entity `*_acct`), C1 (period-control flags), C2 (`c_periodcontrol` backfill), C2a/C2b (calendar moniker + dangling calendar). See `docs/plans/onboarding-gaps-remediation-plan.md` for the per-gap table.

**Boundary:** a gap that is purely about *existing-tenant* state with no onboarding-process cause (rare) may be corrective-only — but state that explicitly and say why the preventive front is N/A. The default is both.

### Gap-closing workflow — mandatory order

Every gap fix produces three deliverables that **must ship in the same PR**:

1. **Choose timestamp T** — a UTC string after all existing `.sql` files in `cli/src/data-fixes/sql/` (e.g. `20260619T120000Z`). This value appears in two places: the filename and the CUT constant.
2. **Write `<T>__R<n>-<slug>.sql`** — corrective fix for legacy tenants. `@check` + `@apply`, both scoped to `:client_id`, both idempotent.
3. **Write `Onboarding<Thing>Service.java`** + wire it in `ensureOnboardingDataset` — preventive fix so new tenants are born clean.
4. **Bump `ONBOARDING_PROVISIONED_THROUGH`** in `OnboardingBaselineService.java` to T (ISO-8601). Update the "Current watermark" comment.

**Ordering rule:** the `.sql` can ship alone (safe — legacy tenants get fixed, new tenants hit `@check → SKIPPED_NOT_NEEDED`). The CUT bump **must never** ship without its `.sql` already in the repo — that would silently skip the fix for new tenants who actually need it.

**Result:** legacy tenants → runner applies the `.sql`. New tenants → onboarding provisions correctly, runner skips via watermark.

---

## 1. Onboarding — the LIVE path (the one that actually runs)

> **CRITICAL (corrected 2026-06-11):** The live onboarding path is the **service chain inside `EtendoGoJwtServlet`**, NOT the `OnboardingStep` classes. The `OnboardingStep` abstraction (section 2) is real and unit-tested but **NOT wired into any production path**. Writing an `OnboardingStep` alone changes nothing at runtime.

**Entry point:** `POST /sws/go/onboarding` → `EtendoGoJwtServlet.handleOnboarding(...)`
File: `modules/com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoJwtServlet.java`

Flow inside `handleOnboarding` (approx. lines):
| Line | Call | What it does |
|---|---|---|
| ~778 | `handleOnboarding(...)` | method start |
| ~814 | `resolveOrCreateClient(...)` (~960) | create/find the AD_Client → `clientId` |
| ~825 | `ensureOrganization(...)` (~1027) | create the org |
| ~831 | `resolveOrganizationId(clientId)` | → `orgId` |
| ~839 | **`ensureOnboardingDataset(...)` (~1074)** | **the provisioning service chain (below)** |
| ~844 | **`EtendoGoDalHelper.commitDalChanges("onboarding", log)`** | **single commit — all-or-nothing** |
| ~845 | `findAccountForCommittedOnboarding(...)` | post-commit account lookup |
| ~850–852 | `sendProgress("finalize", …)` + `sendFinalResult(writer, true, …)` | stream "Environment ready" |
| ~854–859 | `catch` → `EtendoGoDalHelper.rollbackDalChanges("onboarding", e, log)` | rollback on any failure |

**The provisioning service chain** — `ensureOnboardingDataset(writer, clientId, orgId, importRequired, adminUserId, adminRoleId)` (~line 1074) calls, in order:

| Order | Servlet helper (line) | Backing service (file under `…/onboarding/`) | OnboardingStep sibling (not live) |
|---|---|---|---|
| 1 | `importOnboardingDataset` (~1095) | `OnboardingDatasetImportService.java` | `SeedReferenceDataStep` (approx) |
| 2 | `generateOnboardingSequences` (~1112) | `OnboardingSequenceGeneratorService.java` | `CreateDocTypesStep` (approx) |
| 3 | `markOrgReady` (~1131) | `OnboardingMarkOrgReadyService.java` | `MarkOrgReadyStep` |
| 4 | `setupFiscalData` (~1148) | `OnboardingFiscalDataSetupService.java` | — (D1 legal-entity area) |
| 5 | `ensureDefaultCustomer` (~1165) | `OnboardingDefaultCustomerService.java` | — |
| 6 | `schedulePsd2Sync` | `OnboardingPsd2SyncService.java` **(WIRED LIVE 2026-06-28)** | — (no step; non-fatal + post-commit, see note) |
| 7 | `registerBaseline` (~1202) | `OnboardingBaselineService.java` **(WIRED LIVE 2026-06-11)** | — (no step; service is the single source) |

Each helper: sends `sendProgress(... IN_PROGRESS)`, calls its service, sends `done`, returns `true`; on exception sends `PROGRESS_ERROR` + `sendFinalResult(false, …)` and returns `false` (which aborts `ensureOnboardingDataset`, so the outer `catch`/rollback fires).

Service files (all in `modules/com.etendoerp.go/src/com/etendoerp/go/onboarding/`):
- `OnboardingDatasetImportService.java`
- `OnboardingSequenceGeneratorService.java`
- `OnboardingMarkOrgReadyService.java`
- `OnboardingFiscalDataSetupService.java`
- `OnboardingDefaultCustomerService.java`
- `OnboardingPsd2SyncService.java` — **step 6, wired live 2026-06-28** (creates one daily `AD_Process_Request` per client that runs PSD2 `Get Bank Statements` ~03:00–06:00, so Salt Edge-connected accounts auto-import statements; see the deviation note below)
- `OnboardingBaselineService.java` — **step 7, wired live 2026-06-11** (stamps the data-fix `BASELINE`; single source of truth — there is no `RegisterBaselineStep`, it was removed to avoid duplicating the SQL)

> **PSD2-sync deviations from the helper pattern (step 6):** `schedulePsd2Sync` is intentionally **non-fatal** — it always returns `true` and swallows errors (logging + `done` "skipped"), because the automatic statement sync is a convenience that must never block tenant onboarding. PSD2 is a hard dependency of `com.etendoerp.go` (`build.gradle` → `com.etendoerp:psd2.bank.integration`), so the AD_Process `PSD2_GetBankStatements` is expected to exist; the service still resolves it **by search key via DAL** (it is module sourcedata, not an importable Java symbol — never hardcode its UUID) and only `warn`-skips if it is missing (an unconfigured/partially-`update.database`d DB). It also has a **post-commit companion**: `OnboardingPsd2SyncService.activateSchedule(clientId)` is called in `handleOnboarding` **right after `commitDalChanges`** (not inside the chain), because the Quartz scheduler reads the `AD_Process_Request` row on its own DB connection, which cannot see uncommitted rows. If that immediate activation fails, the row's `SCH` status means Etendo's scheduler still picks it up on the next initialization. This is **not** a corrective data-fix gap, so it does **not** bump `ONBOARDING_PROVISIONED_THROUGH`.

> **Baseline exception to the helper pattern:** `registerBaseline` (~1202) deliberately does NOT catch-and-return-false. A genuine SQL error **propagates** so `handleOnboarding`'s outer `catch` performs a clean `rollbackDalChanges`; swallowing it would poison the shared transaction and abort the otherwise-successful commit. The expected `ON CONFLICT DO NOTHING` → 0-rows outcome never throws (DETECTED conserved). See `OnboardingBaselineService` javadoc for the full failure-semantics contract.

> **Dataset-only provisioning (no service needed) — payment methods & terms (ETP-4341).** Pure master data that the dataset import (step 1) already whitelists in `OnboardingDatasetDefinition` does NOT need a new `Onboarding<Thing>Service` — extend the GOClient sampledata XML and it ships to every new tenant via `importOnboardingDataset` (and to anyone re-importing the sample data). The default payment methods (Efectivo, Transferencia bancaria, Cheque, Tarjeta) and terms (Inmediato/I, 30D, 60D, 90D) live in `modules/com.etendoerp.go/referencedata/sampledata/GOClient/{FIN_PAYMENTMETHOD,C_PAYMENTTERM}.xml`; the seeded **Caja**/**Cuenta de Banco** accounts get their method links in `FIN_FINACC_PAYMENTMETHOD.xml`. (Term translations exist in `C_PAYMENTTERM_TRL.xml` for completeness but are **intentionally NOT imported** — `C_PAYMENTTERM_TRL` is excluded from `OnboardingDatasetDefinition`; the base `C_PAYMENTTERM.NAME` already carries the Spanish text. See `testDefinitionExcludesPaymentTermTranslations`.) **Runtime side:** accounts the user creates later (any time, via the Neo `financial-account` window) are auto-linked to the methods for their type (C→Efectivo, B→Transferencia/Cheque/Tarjeta, CA→Tarjeta) by `FinancialAccountHandler.afterHandle` — matched by method name, first method = default, idempotent. Because the dataset XML is the single source, there is no separate corrective `.sql` for this one.

### THE clean extension point — adding a new provisioning action

Add it as a **final step in `ensureOnboardingDataset`, AFTER `ensureDefaultCustomer` and BEFORE the `commitDalChanges("onboarding")` at ~line 844**, so it commits atomically with provisioning and rolls back if anything fails.

**Recipe:**
1. **Write a service** `Onboarding<Thing>Service.java` next to the others. Public method like `void doThing(String clientId, String orgId, String adminUserId, String adminRoleId)`. Use OBDal; throw on failure (let the servlet handle rollback). For inserts that must be conditional/idempotent against a UNIQUE constraint, use native SQL `INSERT … ON CONFLICT … DO NOTHING` via `OBDal.getInstance().getConnection()` + `PreparedStatement` (pattern: `OAuth2Servlet`), PK from SQL `get_uuid()` — never hand-typed.
2. **Add a servlet helper** `boolean do<Thing>(PrintWriter writer, String clientId, String orgId, String adminUserId, String adminRoleId)` mirroring `markOrgReady` (~1131): progress IN_PROGRESS → call service → progress done → `return true`; `catch` → progress error + `sendFinalResult(false)` → `return false`.
3. **Wire it last** in `ensureOnboardingDataset` (~1092): after `ensureDefaultCustomer(...)`, `if (!do<Thing>(...)) return false;` (and `return true;` becomes the final line).
4. **Construct the service** as a field next to `onboardingMarkOrgReadyService` etc. (~lines 127–135).
5. No AD schema change ⇒ plain compile/deploy. (`export.database` only if you also touched AD metadata.)

> **BASELINE registration is the worked example of this recipe (DONE 2026-06-11).** Implemented as `OnboardingBaselineService` + the `registerBaseline` helper, wired as step 6 before the commit. It is the **single source of truth** — the earlier `RegisterBaselineStep.java` was **removed** (it duplicated the same INSERT and, like the other 8 steps, was never wired). The only deviation from the recipe: a genuine error propagates instead of being caught (see the "Baseline exception" note above) — because this action runs last on the shared transaction.

---

## 2. Onboarding — the `OnboardingStep` abstraction (NOT live yet)

A clean, fully-unit-tested step pipeline that **no production class assembles**. Useful contract, but inert until wired.

- **Interface:** `OnboardingStep.java` — `String name()` + `void execute(OnboardingContext ctx) throws OnboardingStepException`.
- **9 step classes** in `…/onboarding/steps/`:
  `CreateClientStep → CreateClientAdminStep → CreateOrgStep → CreateOrgAdminStep → CreateRoleStep → CreateDocTypesStep → SeedReferenceDataStep → MarkOrgReadyStep` (8 classes).
> **Note:** there is NO baseline step here — the baseline is live via the service chain (`OnboardingBaselineService`, §1 step 6), not this abstraction. A `RegisterBaselineStep` briefly existed but was removed to avoid duplicating the service's SQL. The 8 steps above remain inert.
- **The ONLY assembler is a test:** `src-test/src/com/etendoerp/go/onboarding/OnboardingTest.java` (~line 219) builds `List<OnboardingStep>` by hand and does `for (step : steps) step.execute(ctx)`. There is **no** `new XStep()` / `List<OnboardingStep>` / orchestrator in `src/`. **Writing a step does NOT wire it in.**

**`OnboardingContext` getters** (input, file `OnboardingContext.java`): `getClientName`, `getOrgName`, `getAdminUser`, `getAdminPassword`, `getCurrencyCode`, `getLanguageCode`, `getCountryCode`.

**`OnboardingState` getters** (accumulated state, inherited by the context, file `OnboardingState.java`): `getCurrencyId`, **`getClientId`**, **`getOrgId`**, `getClientAdminUserId`, `getOrgAdminUserId`, `getRoleId`, `getWarehouseId`, `getCalendarId`, `getPriceListSalesId`, `getPriceListPurchaseId`, `getFinancialAccountId`, `getProductCategoryId`, `getTaxCategoryId` (each has a matching setter).
> `ctx.getClientId()` is the new-tenant id (what `MarkOrgReadyStep` uses; the live `OnboardingBaselineService` takes the equivalent `clientId` directly).

---

## 3. Data-fixes framework — add a fix in 2 minutes

**Location (this repo):** `cli/src/data-fixes/`
- `run.js` — the runner (Node). `parse-fix.js` — header/section parser.
- `sql/` — the `.sql` catalog. `sql/README.md` — authoring rules (canonical).

**File naming:** `<YYYYMMDDThhmmssZ>__<slug>.sql` — UTC timestamp prefix ⇒ lexical sort = chronological order. `fix_id` = filename without `.sql`. Onboarding-gap fixes carry their `Rn` label in `@id` (e.g. `…__R3-periodcontrol.sql`).

**Format:** header `@id` / `@gap` / `@risk` / `@type` (`sql` default, or `webhook`) / `@description`, then `@check` and `@apply` (or `@webhook: <Name>` instead of `@apply` for `@type: webhook`).

**The non-negotiable rules:**
1. **Tenant scope `:client_id`** — every statement in BOTH `@check` and `@apply` must filter `ad_client_id = :client_id`. `:org_id` secondary. (Runner inlines these as validated AD-id literals so multi-statement `@apply` works.)
2. **Two-layer idempotency** — `@check` gates whether to run; `@apply` is ALSO guarded (`WHERE NOT EXISTS`). `@check` returns ≥1 row ⇒ needed; 0 rows ⇒ `SKIPPED_NOT_NEEDED`, `@apply` never runs.
3. **Immutable once applied** — never rename/edit a shipped `.sql`.
4. **Strict date watermark** — the runner applies only fixes whose timestamp is `>` the tenant's watermark (newest PROCESSED fix or its baseline) and never looks back. **⇒ date a NEW fix with a timestamp AFTER the latest already-shipped fix**, or it sits below the watermark and is never picked up.
5. **No-downgrade ledger guard** — an existing `APPLIED`/`MANUALLY_FIXED` row is never overwritten by a later `SKIPPED_NOT_NEEDED`/`FAILED`.

**Transaction model:** one tx per fix — `@apply` statements + the ledger `INSERT(APPLIED)` commit together; on error → rollback, then a separate tx writes `FAILED`. Fail-fast halts that tenant's chain only.

### Ledger `ETGO_DATA_FIX_HISTORY` (System-owned)
Every row: `ad_client_id='0'`, `ad_org_id='0'`, tenant in `remediated_client_id` (so the System Administrator sees all tenants in one grid). UNIQUE `etgo_dfh_tenant_fix_un (remediated_client_id, fix_id)`. `fix_id='__baseline__'` is the per-tenant cutoff sentinel.

| Status | Written by | Meaning |
|---|---|---|
| `BASELINE` | **onboarding** (preventive front; `applied_utc=ONBOARDING_PROVISIONED_THROUGH`) | tenant born clean; only fixes newer than the CUT apply. **NOT `now()`** — the CUT is a hardcoded constant in `OnboardingBaselineService` that must be bumped when a new gap is closed preventively. |
| `DETECTED` | **runner Phase-0 sweep** (`applied_utc='2026-01-01'`) | legacy tenant, never remediated; all fixes are candidates |
| `APPLIED` | runner `@apply` success | fix ran, `rows_affected` set |
| `SKIPPED_NOT_NEEDED` | runner when `@check` returns 0 | fix not needed; advances watermark |
| `FAILED` | runner on error (separate tx) | retried next run; halts this tenant's chain |
| `MANUALLY_FIXED` | `--mark-fixed` (operator) | resolved out-of-band; counts as success |

> `BASELINE` and `DETECTED` are mutually exclusive per tenant: a freshly-onboarded tenant already has `BASELINE`, so the sweep skips it. The onboarding insert uses `ON CONFLICT DO NOTHING` ⇒ if a `DETECTED` row already exists it is **conserved**.

### Commands
```bash
node cli/src/data-fixes/run.js --dry-run                  # report what would run (runs @check, no writes)
node cli/src/data-fixes/run.js                            # apply across all real tenants
node cli/src/data-fixes/run.js --client <clientId>        # one tenant
node cli/src/data-fixes/run.js --fix <fix_id>             # force ONE fix (ignores chain order + cutoff)
node cli/src/data-fixes/run.js --fix <fix_id> --client <clientId>
node cli/src/data-fixes/run.js --mark-fixed --client <clientId> --fix <fix_id> --reason "what was done by hand"
```

### Copy-paste skeleton `.sql`
```sql
-- @id: R<n>-<slug>
-- @gap: <A1|A2|B1|C1|C2|D1|E1>
-- @risk: <low|medium|high>
-- @type: sql
-- @description: one-line human description

-- @check
-- Returns >=1 row when the fix IS needed. 0 rows => SKIPPED_NOT_NEEDED.
SELECT 1
FROM ad_org o
WHERE o.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM <target_table> t
    WHERE t.ad_client_id = :client_id AND t.<key> = o.<key>
  );

-- @apply
INSERT INTO <target_table> (ad_client_id, ad_org_id, ... )
SELECT :client_id, o.ad_org_id, ...
FROM ad_org o
WHERE o.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM <target_table> t
    WHERE t.ad_client_id = :client_id AND t.<key> = o.<key>
  );
```

---

## 4. The two fronts, paired (per gap)

Both fronts must be closed. Preventive = where it goes in onboarding so new tenants are born clean; Corrective = the idempotent `.sql` for existing tenants (verified SQL in `onboarding-gaps.md`).

| Gap | Symptom | ① Preventive insertion point (onboarding) | ② Corrective `.sql` (gap → @id) |
|---|---|---|---|
| **A1** | Posting fails — chart of accounts missing (~1790 `c_elementvalue`) | New accounting `*Service` in the chain (per `docs/proposals/initial-organization-setup-accounting.md`); NOT `AccountingPackageCloner` (it does taxes/combinations, not the chart) | `R1` — clone chart from GOOrg source client; guard `NOT EXISTS (c_element_id, value)` |
| **A2** | "Account Not Defined" — `*_acct` empty | Same accounting service: populate from `c_acctschema_default` | `R2` — per-schema accounting defaults |
| **B1** | "Lines org does not depend on header org"; `AD_ORG_TREE` empty | ✅ `OnboardingMarkOrgReadyService.provisionOrgTree` — defensive idempotent insert of the 2 rows on the DAL session connection, after `AD_Org_Ready` (whose own tree INSERT runs on a separate `DalConnectionProvider` connection that cannot see the just-flushed org, leaving the tree empty) | ✅ `R1` step 12 — insert the 2 `AD_ORG_TREE` rows |
| **B2** | Chart of accounts flat — `AD_TREENODE` empty (broken Balance/P&L roll-ups; posting unaffected) | ✅ `OnboardingAccountingWiringService.provisionElementTreeNodes` — reads bundled `AD_TREENODE.xml` (tree `D937…`, `org='0'`), bridges source `C_ELEMENTVALUE` ids → account `value` via bundled `C_ELEMENTVALUE.xml`, resolves against the tenant's own accounts by `value` (source ids don't survive import; `value` is the stable key), inserts idempotent (`NOT EXISTS`) on the tenant EV tree | ✅ `R1` step 13 — 1790 `AD_TREENODE` inserts via the runner's `@uuid_<srcid>@` placeholder scheme |
| **C1** | Period-control flags on `ad_org` unset | A service before period creation: set `isperiodcontrolallowed='Y'`, `ad_periodcontrolallowed_org_id`, `c_calendar_id`, `ad_inheritedcalendar_id` | part of `R3` |
| **C2** | Open/Close Period Control empty; `c_periodcontrol` missing (~504/yr) | Same as C1 (flags set before periods) | `R3-periodcontrol` — backfill `c_periodcontrol` |
| **D1** | SII fields empty; `AD_GET_ORG_LE_BU` returns NULL | `OnboardingMarkOrgReadyService` / `OnboardingFiscalDataSetupService` recompute LE columns after `AD_Org_Ready` (ETP-4177) | `R-legalentity` — recompute denormalized LE columns |
| **E1** | Session org stuck at `'0'`/`*` | `CreateOrgAdminStep`/`CreateClientAdminStep` analogue in the live chain set `AD_User.ad_org_id` | `R-userorg` — `UPDATE AD_User.ad_org_id` |
| **F1** | Default customer (`c_bpartner.value='ONBOARDING_DEFAULT_CUSTOMER'`) has no currency, no address — cannot be bill-to/ship-to on a Sales Invoice — and no linked contact | ✅ `OnboardingDefaultCustomerService.ensureDefaultCustomerCurrency` (defaults `bp_currency_id` to EUR when missing) + `ensureDefaultCustomerLocation` (creates `C_LOCATION` + `C_BPARTNER_LOCATION`, country reused from an existing client location) + `ensureDefaultCustomerContact` (creates/links an `AD_USER` contact to the BP and its address) | ✅ `R4-default-customer-location` — set currency to EUR if missing, insert address, then link any existing unlinked contact / insert one if none |
| **F2** | Organization `AD_ORGINFO` has no location (`c_location_id` NULL) — the dataset import creates the org-info row but unlocated, so the **tax engine cannot resolve taxes** for the org. The web onboarding form gathers a country/address but earlier endpoint versions dropped it (`parseOnboardingRequest` ignored `countryCode`/`address`; `buildOnboardingPayload` never sent `address`) | ✅ `OnboardingOrgInfoService.ensureOrgInfo` — finds/creates `AD_ORGINFO` for the onboarding org and links a `C_LOCATION` with a country, defaulting to Spain (ISO `ES`) when the form sends none; uses the form's `countryCode`/`address` now that the endpoint reads them (`OnboardingRequestData.countryCode/address`) and the SPA sends them (`onboardingApi`/`onboardingState` payload) | ✅ `R6-org-info-location` — insert a Spain-located `C_LOCATION`, link the existing unlocated `AD_ORGINFO` (or insert one if absent); validated on Prueba13 |
| **(baseline)** | — | **`OnboardingBaselineService` (step 6, LIVE)** — stamps the `BASELINE` row (preventive counterpart to the sweep's `DETECTED`) | n/a (the runner's Phase-0 sweep handles legacy tenants) |

> Field-verified SQL and exact column quirks for each gap live in `onboarding-gaps.md` and `tenant-remediation-knowledge.md`. The "Recommended Order of Operations" (onboarding-gaps.md §"Recommended Order of Operations") is the canonical manual sequence A1–C2.

---

*Maintained by Remedy. When a fact here is corrected, supersede it with a dated note in `tenant-remediation-knowledge.md` and update the relevant row above.*

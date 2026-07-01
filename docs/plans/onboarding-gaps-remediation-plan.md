# Onboarding Gaps — Issue-by-Issue Remediation Plan

**Status:** active — started 2026-06-12 (ETP-4215)
**Goal:** close every Etendo GO onboarding provisioning gap on BOTH fronts, one issue at a time:
- **① Preventive** — fix the onboarding so NEW tenants are born clean.
- **② Corrective** — a **static** data-fix `.sql` for tenants that already exist (e.g. `Gapp`).

**Source-of-truth principle (decided 2026-06-12):** clone from the **GOClient dataset XML** (`modules/com.etendoerp.go/referencedata/sampledata/GOClient/`), NOT from the live DB. In production GOClient may be absent or in a non-clean state. The corrective `.sql` must be **generated once from the XML and frozen** (literal values baked in), so it carries no runtime dependency on GOClient existing in the DB.

**Companion docs:**
- `docs/etendo-ad/onboarding-gaps.md` — curated field findings (A1…E1), being corrected with verified facts as we go.
- `docs/etendo-ad/onboarding-gaps-research-notes.md` — raw research notes (ES), the input for this plan.
- `docs/etendo-ad/onboarding-and-datafixes-map.md` — where onboarding code + data-fixes live and how to extend them.

---

## Reference tenants (this environment)

| Role | Name | `ad_client_id` |
|---|---|---|
| Template (full config) | **GOClient** | `802509E12436405C86BA1FD5B1DF508C` |
| New tenant via GO onboarding (has all gaps) | **Gapp** | `DE75F54AE0DA45729F78BCF2EE3C62D6` |
| Gapp org | `Gapp` | `764471746F6A4293A1C18567148415E1` |

> The research notes use `TaxesClient`/`TaxesOrg` — same role as Gapp here.

---

## How the onboarding dataset import works (verified in code)

```
referencedata/sampledata/GOClient/*.xml   (118 files — source of truth)
        │  build: prepareOnboardingSampledata (tasks.gradle)
        │  → copies ALL xml to classpath + regenerates index.txt (all 118)
        ▼
WebContent/WEB-INF/classes/com/etendoerp/go/onboarding/sampledata/GOClient/ + index.txt
        │  runtime: OnboardingDatasetNormalizer.buildDatasetXml(orgId)
        │  → reads index.txt, FILTERS by OnboardingDatasetDefinition.INCLUDED_TABLES,
        │     preserves source IDs, strips AD_CLIENT_ID, remaps AD_ORG_ID (0→0, else→targetOrg)
        ▼
DataImportService.importDataFromXML(client, org, xml)  → remaps IDs, resolves intra-doc FKs
```

- **The only runtime filter is `INCLUDED_TABLES`** (in `OnboardingDatasetDefinition.java`). All 118 XML files are bundled; a table is imported iff it's in that set.
- **Live onboarding path** = service chain in `EtendoGoJwtServlet.handleOnboarding` (`ensureOnboardingDataset`), NOT the inert `OnboardingStep` classes. Import is step 1 (`OnboardingDatasetImportService`).
- The `OnboardingStep`/`steps/` classes are **not wired** into any production path (only assembled by a test).

### Accounting mechanism that does NOT apply

`GoInitialOrgSetupAccountingHandler` + `AccountingPackageCloner/Resolver/Validator`:
- Hook of the **core `InitialOrgSetup`** process (manual window), NOT the GO onboarding servlet → never ran for Gapp.
- Clones from a ready legal-with-accounting org **in the same client** (DB-based); for a brand-new client there's no source → returns error. Cannot bootstrap the first org.
- Clones taxes / tax categories / tax zones / tax accounts + derived combinations only — **NOT** the chart (`c_element`/`c_elementvalue`), `c_acctschema_default/_gl`, or `*_acct`.
- Verdict: independent mechanism, no conflict, do not touch for the gap work.

---

## Gap A1 — Chart of accounts (General Ledger) — IN PROGRESS

### Verified DB state (2026-06-12)

| Table | GOClient | Gapp | XML rows |
|---|---|---|---|
| `c_acctschema` | 1 | **0** | 1 |
| `c_acctschema_table` | 30 | **0** | 30 |
| `c_acctschema_element` | 5 (OO,AC,PR,BP,PJ) | **0** | 5 |
| `c_acctschema_gl` | 1 | **0** | 1 |
| `c_acctschema_default` | 1 | **0** | 1 |
| `c_element` | 2 | **0** | 2 |
| `c_elementvalue` | 3580 | **0** | 3580 |
| `c_elementvalue_trl` | — | — | 7160 |
| `c_validcombination` | 657 | **0** | 657 |
| `ad_org_acctschema` | 1 | **0** | 1 |

**Corrections to the field report:**
1. **Gapp has ZERO accounting rows — not even `c_acctschema`.** The GO onboarding servlet creates **no ledger at all**. (The report's "UI creates c_acctschema" referred to the manual flow.) ⇒ A1 must provision the **whole ledger + chart**, not just "populate the rest".
2. **GOClient has TWO 1790-account trees** (3580 total), not 1790:
   - `BB9B64C5B6534A40A36F7C0F45C2CC0B` **"Arbol de cuentas GO"** → **wired to the AC dimension** (active chart). Default AC account = `F6E34E7202DD4F81B4A8BD13A989DC2E` = **`90030 - Cuenta por defecto`**.
   - `91D04C02EF8F4975B9E4F5E07543B6EA` "GOOrg Account Tree" → second tree, **orphaned**.
3. **The orphan tree is fully isolated** (verified): all 657 combinations use BB9B; AC dimension uses BB9B; `fact_acct` has 0 references to orphan values; `c_acctschema_default` columns reference `c_validcombination` (all BB9B). ⇒ **safe to exclude from both fronts.**

### Org ownership (verified 2026-06-12) — decisive
| Data | `ad_org_id` | Meaning |
|---|---|---|
| Wired tree `BB9B` + 1790 values | **`'0'`** | active chart is **client-level** (shared) |
| `c_acctschema`, `c_validcombination` (657), `c_acctschema_default/_gl/_element/_table`, account `90030` | **`'0'`** | whole ledger config is client-level |
| Orphan tree `91D04` + 1790 values | **GOOrg** | the only **org-specific** chart row (= the orphan) |
| `ad_org_acctschema` (org↔schema link) | **GOOrg** | the only org-specific row we NEED |

**Consequences:**
- The active chart is `org='0'` → the normalizer keeps it at `'0'` → imported as a **client-level chart for Gapp** (shared across its orgs). Correct.
- The only org-specific row imported is `ad_org_acctschema` → normalizer remaps GOOrg → **Gapp's org** (exactly "use the org created for Gapp"). Onboarding already passes Gapp's `orgId` (`resolveOrganizationId(clientId)` → `importDataset(clientId, orgId)`).
- The orphan tree is `org=GOOrg` → if imported it would be remapped to Gapp's org → junk. Must be excluded.

### Decision (2026-06-12)
**Provision only the wired tree (`BB9B…`, 1790 accounts, all `org='0'`)** + its 657 combinations + 5 dimensions + gl + default + acctschema + acctschema_table + `ad_org_acctschema` (org-specific → Gapp org). Exclude the orphan tree.
**Single-tree enforcement = ignore the orphan tree at runtime, NEVER modify the dataset** (user 2026-06-12: "no me elimines cosas del dataset … si queres ignorar ese account tree bueno"). The source XML stays intact; `OnboardingDatasetNormalizer` skips the org-specific (`AD_ORG_ID != '0'`) `C_ELEMENT` row at import time and cascades the skip to its `C_ELEMENTVALUE` rows and their `C_ELEMENTVALUE_TRL` translations (see `AccountElementTreeFilter`). The wired tree (`BB9B…`, all `org='0'`) is the only chart imported. ~~Earlier approach (trim the XML) was reverted per user instruction.~~

### Account tree (AD_TREE / AD_TREENODE) — verified 2026-06-12
| Fact | Value |
|---|---|
| GOClient `c_element.ad_tree_id` | `D937…` (EV tree "GOClient Element Value", client=GOClient) |
| Each tenant already has its OWN EV tree | e.g. Gapp `9CB9…` "Gapp Element Value" (auto-created at client creation) |
| `ad_treenode` rows in GOClient's EV tree | 3581 (the chart hierarchy) |
| `ad_treenode` rows in Gapp's EV tree | 1 (root only — empty) |
| `AD_TREE` / `AD_TREENODE` in onboarding import | EXCLUDED |
| `c_element.ad_tree_id` nullable | YES |

**Decisions (2026-06-12):**
- ~~**Hierarchy = flat chart, posting only.** Do NOT provision `AD_TREENODE`.~~ **REVERSED 2026-06-16 (Gap B2):** the flat chart breaks tree-walking reports (Balance Sheet, P&L) and summary-account roll-ups, so the `AD_TREENODE` hierarchy IS now provisioned on **both fronts**. Posting was never affected (combinations reference element values directly). See the **Gap B2** section below.
- **`c_element.ad_tree_id` must point at the TENANT's own EV tree, never GOClient's** (no cross-tenant refs). Preventive: strip `AD_TREE_ID` at normalization + re-point post-import. Corrective: `SELECT` the tenant's EV tree in the insert.

### Gap B2 — account-element tree hierarchy (AD_TREENODE) — DONE both fronts (2026-06-16)
The imported chart arrives flat: 1790 accounts, no parent/child placement (`AD_TREE`/`AD_TREENODE` excluded from import). Reconstructed from GOClient's source EV tree `D937…`.
- **① Preventive (onboarding):** `OnboardingAccountingWiringService.wireAccountElementTree` now calls `provisionElementTreeNodes`. It reads the bundled `AD_TREENODE.xml` (filtered to tree `D937…`, `ad_org_id='0'`) and bridges the source `C_ELEMENTVALUE` ids → account `value` via the bundled `C_ELEMENTVALUE.xml`, then resolves each `value` against the tenant's own accounts (the source ids do NOT survive the import; `value` is the only stable join key — verified unique across all 1790 accounts). Inserts `AD_TREENODE` rows on the tenant's EV tree, idempotent (`NOT EXISTS`), parent unresolved → attached to root. No new shipped file — reuses the sampledata XML already staged on the classpath by `prepareOnboardingSampledata`.
- **② Corrective (data-fix):** step 13 of `R1-chart-of-accounts.sql` — 1790 transformed `AD_TREENODE` inserts using the runner's `@uuid_<srcid>@` placeholder scheme (the runner mints a fresh per-tenant id per label, preserving intra-set FKs). org-specific orphan-tree nodes dropped; every node resolves to a kept account.
- **Why two mechanisms:** the data-fix runner has the `@uuid_` placeholder scheme; live onboarding does not (Etendo's importer mints its own ids), so onboarding joins by `value` instead. Same resulting hierarchy.

### Scope of tables (A1 set)
`C_ACCTSCHEMA`, `C_ACCTSCHEMA_TABLE`, `C_ACCTSCHEMA_ELEMENT`, `C_ACCTSCHEMA_GL`, `C_ACCTSCHEMA_DEFAULT`, `C_ELEMENT`, `C_ELEMENTVALUE`, `C_ELEMENTVALUE_TRL`, `C_VALIDCOMBINATION`, `AD_ORG_ACCTSCHEMA`.

### ① Preventive (onboarding) — DONE (code complete, pending build/QA)
1. **Chart tables added to `OnboardingDatasetDefinition.INCLUDED_TABLES`** — `AD_ORG_ACCTSCHEMA`, `C_ACCTSCHEMA`, `C_ACCTSCHEMA_DEFAULT/_ELEMENT/_GL/_TABLE`, `C_ELEMENT`, `C_ELEMENTVALUE`, `C_ELEMENTVALUE_TRL`, `C_VALIDCOMBINATION`.
2. **Orphan tree ignored at runtime (dataset untouched)** — single-tree enforcement = option (b). The GOClient sampledata XML is **never modified**. `OnboardingDatasetNormalizer.AccountElementTreeFilter` drops the org-specific `C_ELEMENT` row (`AD_ORG_ID != '0'`) during normalization and cascades to its `C_ELEMENTVALUE` + `C_ELEMENTVALUE_TRL` rows (relies on alphabetical source-file order, guaranteed by the providers). Net effect at import: `C_ELEMENT 2→1`, `C_ELEMENTVALUE 3580→1790`, `C_ELEMENTVALUE_TRL 7160→3580` — same volume reduction as the reverted trim, but with the source dataset intact. Covered by `OnboardingDatasetNormalizerTest.testNormalizerExcludesOrgSpecificAccountElementTree`. ~~Earlier trim script (`trim-orphan-account-tree.js`) was run then reverted (`git restore`) and the script deleted per user instruction.~~
3. **Org-wiring step** — new `OnboardingAccountingWiringService` (a) sets `ad_org.c_acctschema_id` (general ledger) to the imported schema, (b) defensively ensures the `AD_ORG_ACCTSCHEMA` link, (c) re-points the imported chart element at the tenant's own EV tree (`wireAccountElementTree`). Wired into `EtendoGoJwtServlet.ensureOnboardingDataset` as `wireAccounting(...)` (new `PROGRESS_ACCOUNTING` step), runs right after dataset import, only when `importRequired`. Calendar/period wiring deliberately deferred to C1.
4. **Tree-ref strip** — `OnboardingDatasetDefinition.STRIPPED_FIELDS_BY_TABLE` strips `C_ELEMENT.AD_TREE_ID` (table-aware `isStrippedColumn`), consumed by `OnboardingDatasetNormalizer.shouldSkipColumn(entity, …)`. The element imports tree-less; the wiring step sets the tenant's tree.
- **Verify after build:** new tenant gets `ad_org.c_acctschema_id` set, `ad_org_acctschema` link to Gapp's org, single wired chart (1790 accounts), posting resolves.
- **Risk:** performance — importing 1790 elementvalues + 657 combinations + 3580 TRLs through Hibernate inside the onboarding transaction (halved vs. both trees).

### ② Corrective (static data-fix) — design locked, NOT yet built
- Build a **generator script** (Node, `cli/`) that reads the GOClient chart XML and emits a **frozen** `.sql` data-fix. Since the dataset is no longer trimmed, the generator filters to the wired tree itself (keep only `C_ELEMENT` rows with `AD_ORG_ID = '0'`, then their values/TRLs — same cascade the normalizer applies at runtime). The `.sql` content is frozen; the **PKs are generated at apply time with `get_uuid()`** — nothing is copied from GOClient (user: "los ids tienen que ser generados en el momento … no tienen que haber referencias cruzadas entre los clientes"). GOClient source-ids appear in the SQL **only as transient join tokens** inside a temp id-map; no GOClient id is ever inserted.
- **Mechanism (verified against `run.js`):** `@apply` runs as ONE transaction (`BEGIN…runBody…COMMIT`); `runBody` sends the whole multi-statement body via node-pg simple-query → a `CREATE TEMP TABLE _a1_idmap (...) ON COMMIT DROP` persists across statements in that tx. `:client_id` is inlined as a validated literal. On any failure → full ROLLBACK for that tenant + chain halts (other tenants independent). This already satisfies "si falla para un client, corta y rollbackea".
- **Shape:** (1) `CREATE TEMP TABLE _a1_idmap(tbl,src,newid)`, (2) populate with `get_uuid()` per source row per table (guarded by the same NOT-EXISTS as `@check` → second idempotency layer), (3) `INSERT … SELECT` each table joining `_a1_idmap` for PK + intra-set FKs.
- **Table order:** C_ELEMENT → C_ELEMENTVALUE → C_ELEMENTVALUE_TRL → C_ACCTSCHEMA → C_ACCTSCHEMA_ELEMENT/_GL/_DEFAULT/_TABLE → C_VALIDCOMBINATION → AD_ORG_ACCTSCHEMA. Skip `C_ELEMENTVALUE_OPERAND` (flat chart; not in preventive set either).
- **Tenant-resolved refs (NOT from XML):** `c_element.ad_tree_id` → tenant EV tree (`SELECT … WHERE ad_client_id=:client_id AND treetype='EV'`); chart/schema rows at `ad_org_id='0'` (client-level, matches source); `ad_org_acctschema` + `ad_org.c_acctschema_id` → the tenant's onboarding org.
- **OPEN — org resolution for the corrective:** the runner binds `:org_id='0'` (system), so the SQL must resolve the tenant's real org itself. Need to confirm the rule (e.g. non-'0' org of the client; legal-entity / ready org; or all non-'0' orgs lacking a GL).
- Filter the generator to the wired tree only — read `C_ELEMENT` rows with `AD_ORG_ID='0'` (the `BB9B…` element), skip the org-specific orphan, then cascade to its values/TRLs. (The XML is intact, so the generator must apply this filter, mirroring the normalizer.)

### Org wiring gap (verified 2026-06-12) — dataset import alone is NOT enough
`ad_org` carries the org's general-ledger + calendar/period columns, and **`AD_ORG` is excluded from the dataset import** → these are never set by importing the schema:

| `ad_org` column | GOOrg | Gapp | Owner |
|---|---|---|---|
| `c_acctschema_id` (general ledger) | set | **empty** | **A1** — must wire to the imported schema |
| `c_calendar_id` | set | **empty** | C1 |
| `ad_inheritedcalendar_id` | set | **empty** | C1 (critical for `c_period_trg`) |
| `isperiodcontrolallowed` | `Y` | **`N`** | C1 |
| `ad_periodcontrolallowed_org_id` | self | **empty** | C1 |

⇒ **A1 preventive front = dataset import (schema + chart) + a small org-wiring step** that sets `ad_org.c_acctschema_id` and creates the `ad_org_acctschema` link (mirrors `AccountingPackageCloner.wireOrganization`). The calendar/period columns belong to C1.

Live org creation: `EtendoGoJwtServlet.ensureOrganization` (the inert `CreateOrgStep` uses core `InitialOrgSetup`, but it's not the live path). Confirmed: the live chain creates no ledger (Gapp = 0 rows everywhere).

### Open items
- [x] ~~Single-tree enforcement~~ → runtime exclusion in the normalizer (option b); **dataset XML untouched** (user instruction — no deletions from the dataset).
- [x] ~~Where the org-wiring step lives~~ → new `OnboardingAccountingWiringService`, called as a `wireAccounting` step in the servlet chain.
- [ ] **Build + QA the preventive front** (user controls build): export.database not needed (no DB-config change); needs a fresh-tenant onboarding run to confirm chart + GL wiring.
- [ ] **Corrective front (static SQL generator)** — NEXT.

---

## Gap A2 — Per-entity posting accounts (`*_acct`) — BOTH FRONTS DONE

### Problem (verified in research notes, 2026-06-09)
Etendo's posting engine (`AcctServer`) does NOT fall back to `c_acctschema_default`
to resolve the accounts of BP groups, product categories, or individual
BPs/products. Posting an invoice fails with `Account Not Defined For …` (or
`IllegalStateException` for the per-BP/product lookups) unless dedicated rows
exist in `c_bp_group_acct`, `m_product_category_acct`, `c_bp_customer_acct`,
`c_bp_vendor_acct`, `m_product_acct`.

### ② Corrective — DONE (appended to R1, step 11)
Per user (2026-06-16): the A2 inserts live at the **end of the R1 `@apply`** so
they run in the **same transaction** as the chart and SELECT the default
accounts straight out of the `c_acctschema_default` / `c_validcombination` rows
R1 just created for the same schema (token `@uuid_C06B…@`, same id within the body).

Design (verified against the DB, 2026-06-16):
- One `INSERT … SELECT` per table, one row per existing tenant entity. PKs are
  minted with `get_uuid()` at apply time (row count is dynamic → no `@uuid_<srcid>@`
  labels), still zero cross-client references.
- `ad_org_id` is **inherited from each source entity** (`g/c/bp/p.ad_org_id`), NOT
  forced to `'0'` — mirrors GOClient, where `*_acct` rows carry the org of the
  entity they describe (mix of `'0'` and the operative org). (The research-note
  drafts that hard-coded `'0'` were corrected.)
- Each insert is guarded by `NOT EXISTS (entity, schema)` → safe to re-run.
- Default-account columns are copied from the single `c_acctschema_default` row;
  the NOT-NULL acct columns (`v_liability_acct`, `writeoff_acct`, `p_revenue_acct`,
  `p_expense_acct`, `p_cogs_acct`) are always populated in the shipped default
  (verified — zero NULLs across GOClient's entities).
- **Validated** end-to-end: column existence in source+target, SELECT shape +
  zero NOT-NULL violations against GOClient's real schema, and a real
  `INSERT … SELECT` in a rolled-back transaction (2 `c_bp_group_acct`, 5
  `m_product_acct` rows). Runner dry-run on a schema-less tenant → `WOULD_APPLY`.

### ① Preventive — DONE (in `OnboardingAccountingWiringService`)
**Revised (2026-06-16):** the earlier "no-op at onboarding" assumption was wrong.
The onboarding dataset import **does** bring in BP groups, product categories and
products (`C_BP_GROUP`, `M_PRODUCT_CATEGORY`, `M_PRODUCT` are in
`OnboardingDatasetDefinition.INCLUDED_TABLES`), and `OnboardingDefaultCustomerService`
creates a default customer BP — but the import never carries the derived `*_acct`
posting rows. So a new tenant is born with the same A2 gap the corrective fixes.

Fix: `OnboardingAccountingWiringService.provisionEntityPostingAccounts(client, ledger)`
runs right after `rebrandImportedChartNames` (so the imported ledger + its
`c_acctschema_default` defaults already exist) and before `flushChanges()`. It
executes **six `INSERT … SELECT` statements**, kept in lockstep with the
corrective fronts (identical column lists, `NOT EXISTS` idempotency guards,
`ad_org_id` inherited from each source entity, `get_uuid()` PKs, defaults copied
from the single `c_acctschema_default` row). Five mirror **R1 step 11** (bp_group,
product_category, bp_customer/vendor, product). The sixth (`TAX_ACCT_SQL`)
provisions `c_tax_acct` (`t_due_acct` / `t_credit_acct`) for every tax — without
it, posting a sales/purchase invoice fails with `OBException: Account could not be
found`. Taxes are no longer per-client: `C_TAX` and `C_TAXCATEGORY` were **removed
from `INCLUDED_TABLES`** because they are now provisioned at **system level**
(`ad_client_id = '0'`) and shared by every tenant, so `TAX_ACCT_SQL` reads the
system tax catalog (`t.ad_client_id = '0'`). Its corrective twin is the standalone
**`R7-tax-accounts`** fix (not R1 step 11f), which joins the tenant's real schema(s)
and therefore covers both freshly-charted and already-charted tenants in one body.
Implemented as native SQL
(`createNativeQuery(...).setParameter("clientId"/"schemaId")`) because it is a
set-based copy, not a DAL-object workflow. Idempotent → re-running onboarding
never double-inserts.

**Out of scope (still open):** entities created *after* onboarding (a BP or
product added later through the UI) still need their `*_acct` row at creation
time. That is an **entity-creation hook** (`NeoHandler` / event handler) — a
separate concern the research notes flag, not covered by either A2 front here.

---

## Remaining gaps (queued — same two-front structure)

| Gap | Area | Preventive front | Corrective front |
|---|---|---|---|
| A2 | `*_acct` tables (bp_group, product_category, bp_customer/vendor, product, **tax**) | ✅ `OnboardingAccountingWiringService.provisionEntityPostingAccounts` (post-import; 5 stmts mirror R1 step 11, `TAX_ACCT_SQL` reads system taxes `ad_client_id='0'`) — entity-creation hook for post-onboarding entities still open | ✅ `*_acct` in `R1-chart-of-accounts.sql` step 11; **`c_tax_acct` owned by standalone `R7-tax-accounts`** (2026-06-17) which joins the tenant's real schema(s) + system tax catalog, covering both no-schema (post-R1) and has-schema tenants. Dry-run validated 653 rows on SantiCorp |
| B1 | `AD_ORG_TREE` empty | ✅ `OnboardingMarkOrgReadyService.provisionOrgTree` — defensive idempotent insert of the 2 rows on the DAL session connection after `AD_Org_Ready` (its own tree INSERT runs on a separate connection that can't see the just-flushed org → tree stayed empty) | ✅ `R1-chart-of-accounts.sql` step 12 (2 rows, `NOT EXISTS` guarded) |
| C1 | period-control flags on `ad_org` | ✅ `OnboardingPeriodControlService` (`wirePeriodControl` step, after `wireAccounting`) | ✅ `UPDATE ad_org` in `R3-periodcontrol.sql` |
| C2 | `c_periodcontrol` missing (**516** = 43 docbasetypes × 12 periods) | ✅ `C_PERIODCONTROL` added to `INCLUDED_TABLES` (auto-packaged via `prepareOnboardingSampledata`) | ✅ 516-row backfill in `R3-periodcontrol.sql` |
| C2a | imported calendar carried "GOOrg"/"GO" moniker instead of client name | ✅ `OnboardingPeriodControlService.rebrandImportedCalendarName` (shared `OnboardingSourceMoniker`) | ✅ corrective already names it `@name_client@ Calendar` |
| C2b | dataset shipped a 2nd dangling client-level (`AD_ORG_ID='0'`) calendar with 0 periods (fiscal analogue of the orphan account tree) | ✅ `OnboardingDatasetNormalizer.DanglingCalendarFilter` drops client-level fiscal rows at import (no XML deletion) | ✅ corrective only inserts the operative calendar |
| C2c | imported periods kept the source snapshot's fixed open-prefix (Jan–Apr) instead of year-to-date | ✅ **RESOLVED & live-verified (Prueba12, 2026-06-16)** — `OnboardingPeriodControlService.openPeriodsThroughCurrentMonth` opens every period whose start date ≤ today (dynamic), leaves later periods never-opened. Fixed a latent bug: it walked the lazy child collections (`Year#getFinancialMgmtPeriodList`, `Period#getFinancialMgmtPeriodControlList`) which come back empty in the same transaction as the `DataImportService` XML import, so the loop touched nothing and the import's Jan–Apr snapshot survived (observed on Prueba10/Prueba11). Now resolves periods + period-control via direct `OBCriteria` queries (`resolveCalendarPeriods` by year, `resolvePeriodControls` by period). Prueba12 confirmed Jan–Jun open (May/Jun `touched=true`, all 43 docbasetype controls `periodstatus='O'`), Jul–Dec never-opened. | ✅ `R3-periodcontrol.sql` opens a static prefix through June (frozen 2026-06, hand-built from the GOClient sampledata XMLs). Note: R3 only fires when the org has **no** `c_periodcontrol` at all, so tenants onboarded before the preventive fix (Prueba10/11) keep the wrong open-state — a dedicated `R5-period-open-state` corrective is still needed for them |
| D1 | NULL legal-entity columns (ETP-4177) | recompute after AD_Org_Ready | `.sql` recompute |
| E1 | session org stuck at `'0'` | set `AD_User.ad_org_id` at creation | `.sql` UPDATE |
| F1 | default customer has no `C_BPARTNER_LOCATION` (cannot be bill-to/ship-to) and no linked `AD_USER` contact | ✅ `OnboardingDefaultCustomerService.ensureDefaultCustomerLocation` (`C_LOCATION` + `C_BPARTNER_LOCATION`, country reused from an existing client location, fallback any active country) + `ensureDefaultCustomerContact` (creates a contact, or links an existing unlinked one) | ✅ `R4-default-customer-location.sql` — BP found via `value='ONBOARDING_DEFAULT_CUSTOMER'`; insert address → link existing unlinked contact → insert contact if none; per-row guards, idempotent (validated on Prueba9 + Prueba8) |
| F2 | org `AD_ORGINFO` has no location (`c_location_id` NULL) → **tax engine can't resolve org taxes**; the web form's country/address was being dropped end-to-end (`parseOnboardingRequest` ignored `countryCode`/`address`; SPA payload never sent `address`) | ✅ **RESOLVED (2026-06-16)** — `OnboardingOrgInfoService.ensureOrgInfo` (new `wireOrgInfo` step after `setupFiscalData`): finds/creates the onboarding org's `AD_ORGINFO` and links a `C_LOCATION` with a country, defaulting to Spain (`ES`) when the form omits it. End-to-end fixed: SPA sends `address` (`buildOnboardingPayload` + `runOnboardingStream`), endpoint reads `countryCode`/`address` into `OnboardingRequestData`, threaded through `ensureOnboardingDataset` | ✅ `R6-org-info-location.sql` — insert a Spain-located `C_LOCATION`, link the existing unlocated `AD_ORGINFO` (UPDATE) or insert one (INSERT, PK = `ad_org_id`, `taxid='?'`); per-row guards, idempotent (validated on Prueba13, rolled back) |

> C2 number reconciled (2026-06-16): this environment has **43** docbasetypes (`ad_ref_list` of `C_DocType DocBaseType`, ad_reference `183`) × 12 periods = **516** rows (GOOrg confirmed). The 504 figure (42×12) in gaps.md was stale.

# Plataforma Backlog Sweep — Quick Wins (2026-07-23)

## Source

JQL filter (Jira, `etendoproject.atlassian.net`):

```
labels = "plataforma"
AND assignee IN (empty, currentUser())
AND status NOT IN (Done, "In Review", "In Progress")
```

31 issues, all in status **TBD**, all unassigned, all under the same epic: **ETP-3504 — "Etendo Next (New New UI)"**.

## Plan

1. Create one new Jira task under **ETP-3504**, label `plataforma`, to act as the grouping/umbrella task for this first sweep (delegated to Clerk).
2. Select a first batch of **quick wins** from the list below (small, contained, low-risk fixes).
3. Each quick win gets its own feature branch/PR, and merges into the umbrella task's branch (not directly into the epic) — same pattern as the merge-block workflow.
4. Once the batch is merged, the umbrella task's branch/PR goes to the epic in a single pass.

## Full backlog (31 issues)

### Security Hardening series (14 — sequential, NOT quick wins, large multi-part initiative)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4569 | Task | Major | [Assessment] Revalidar hallazgos, threat model y decisiones de arquitectura |
| ETP-4568 | Task | Major | [Backend 1/3] Corregir formula injection en todos los exports CSV |
| ETP-4570 | Task | Major | [Backend 2/3] Implementar autorización centralizada de adjuntos |
| ETP-4571 | Task | Major | [Backend 3/3] Endurecer uploads, downloads y cache de respuestas NEO |
| ETP-4572 | Task | Major | [Delivery 1/3] Definir CSP Report-Only y monitoreo de violaciones |
| ETP-4573 | Task | Major | [Delivery 2/3] Automatizar CloudFront Response Headers Policy |
| ETP-4574 | Task | Major | [Delivery 3/3] Activar CSP y security headers en producción |
| ETP-4575 | Task | Major | [Auth 1/2] Implementar sesión backend, CSRF, rotación y logout |
| ETP-4576 | Task | Major | [Auth 2/2] Migrar frontend de Bearer localStorage a sesión cookie |
| ETP-4577 | Task | Major | [Telemetry 1/2] Implementar gateway central de sanitización |
| ETP-4578 | Task | Major | [Telemetry 2/2] Migrar proveedores y documentar data egress |
| ETP-4579 | Task | Major | [Verification] Ejecutar security re-test y actualizar reporte |
| ETP-4557 | Task | Major | [SECURITY 3/7] Integrate core validation across forms, inline grids, and imports |
| ETP-4558 | Task | Major | [SECURITY 4/7] Enforce declarative validation authoritatively in NEO Headless |
| ETP-4561 | Task | Major | [SECURITY 7/7] Characterize and harden HTML and URL output sinks |

### Candidate quick wins (bugs / small, contained fixes)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4560 | Bug | Minor | [SECURITY 6/7] Neutralize spreadsheet formula injection in NEO server CSV exports |
| ETP-4559 | Bug | Minor | [SECURITY 5/7] Neutralize spreadsheet formula injection in client-generated CSV files |
| ETP-4326 | Bug | Minor | Fix 500 in aging-receivable NEO report handler: NPE in core AgingDao |
| ETP-4258 | Bug | Minor | Callout SL_Depreciate del asset group pisa defaults de calculateType/depreciate en create de activos |
| ETP-4280 | Bug | Minor | Agente no puede crear cuenta financiera de tipo tarjeta — error opaco sin diagnóstico |
| ETP-4278 | Task | Major | Poblar campo prompt en specs contacts y financial-account para diferenciar bankAccount vs account |
| ETP-4287 | Task | Major | Mark GET-only entities explicitly in MCP discovery [gaps G3/G20] |

### MCP / agentic gaps (larger, needs scoping — not quick wins by default)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4601 | Task | Major | Report: compare Holded MCP vs Etendo GO MCP to identify gaps |
| ETP-4289 | Task | Major | Seed test data for empty MCP specs (Round 3 unevaluable specs) |
| ETP-4285 | Task | Major | Expose document workflow actions semantically via MCP [gaps G6/G9] |
| ETP-4279 | Task | Major | Corregir expectativa de agente sobre tipos de cuenta financiera (el dominio soporta 3, no 2) |
| ETP-4254 | Task | Major | Limpiar specs NEO de entidades no agénticas y definir criterios de exposición |
| ETP-4242 | Task | Major | No existe spec de escritura (W) para entidades del ERP |

### UX (larger, needs scoping — not quick wins by default)

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4582 | Task | Major | [Shared UX Findings][Platform 1/2] Harden selectors, draft state, CRUD feedback and document-line UI |
| ETP-4580 | Task | Major | [Contacts UX][CO-04-04][Depends on ETP-4554] Unify selected-address visual states |

### Other

| Key | Type | Priority | Summary |
|---|---|---|---|
| ETP-4151 | Task | Major | Store transactional email document downloads in S3 |

## Status

- [x] Umbrella Jira task created: **ETP-4657** (epic ETP-3504, label `plataforma`)
- [x] Jira housekeeping (2026-07-23): ETP-4657, ETP-4560, ETP-4559, ETP-4326 assigned to Sebastian Barrozo and transitioned TBD → In Progress (2-hop workflow: TBD → Defined → In Progress). Remaining 4 quick wins left untouched (still TBD, unassigned) until started.
- [x] Quick-win batch confirmed with user (all 7 candidates)
- [x] Umbrella branch created: `feature/ETP-4657`, from `feature/ETP-4554` @ `77973325e` (not pushed, no PR yet — ETP-4554 has ongoing work this sweep needs to sit on top of)
- [x] ETP-4560 (1/7 quick wins) implemented, tested, and committed:
  - Repo `com.etendoerp.go`, branch `feature/ETP-4560` (from `epic/ETP-3504` @ `18cff42b`), commit `cc80139a`.
  - Repo `etendo_schema_forge`, branch `feature/ETP-4560` — no changes needed (fix is Java-only), branch is identical to `feature/ETP-4657`.
  - First delivery from the external agent was REJECTED on review (missed `\n` and leading-whitespace-before-marker trigger cases, nothing committed, "tests passed" claim unverifiable). Fixed directly by the coordinator instead of a second round-trip; verified GREEN: `NeoCsvExportServiceTest` 9/9 (`etendo_core/build/test-results/test/TEST-com.etendoerp.go.schemaforge.NeoCsvExportServiceTest.xml`).
  - `com.etendoerp.go` `feature/ETP-4657` created from `epic/ETP-3504` @ `18cff42b` (Clerk-2), `feature/ETP-4560` merged in as a clean fast-forward → HEAD `cc80139a`. Local only, not pushed yet.
  - **User decision (2026-07-23), later RETRACTED same day:** briefly asked for chained/stacked PRs per quick win — retracted minutes later ("fue mala mi indicación"). **Final rule: ONE PR per repo total (the umbrella branch's own PR to the epic, see below); every quick win merges locally into `feature/ETP-4657`, no PR of its own.** See [[feedback_chained_prs_for_quickwin_batches]] (marked superseded).
  - **Umbrella branches pushed + draft tracking PRs opened in all 3 repos** (2026-07-23), each labeled `merge-block` (Git Police requirement for a merge-block branch PR'd straight to `epic/*` — see [[project_merge_block_label_git_police]]):
    - `schema_forge_core`: `feature/ETP-4657` @ `10314ee71` (from `feature/ETP-4554`) — PR [#69](https://github.com/etendosoftware/schema_forge_core/pull/69), draft, hooks clean, no bypass needed.
    - `etendo_schema_forge`: `feature/ETP-4657` @ `77973325e` on origin — PR [#945](https://github.com/etendosoftware/etendo_schema_forge/pull/945), draft, label applied.
    - `com.etendoerp.go`: push blocked by 4 pre-existing env-only integration test failures (`MappingNotFoundException: Table.hbm.xml` — Hibernate model not on classpath locally; unrelated to ETP-4560, whose own unit test passed 9/9). **User explicitly authorized `git push --no-verify`**, scoped to this repo/branch/sweep only. Done: pushed @ `cc80139a`, `merge-block` label applied, PR [#764](https://github.com/etendosoftware/com.etendoerp.go/pull/764) open (draft).
    - **Process incident (self-reported, contained):** Clerk-2's first `--no-verify` attempt ran with a stale cwd and accidentally executed against `etendo_schema_forge` instead of `com.etendoerp.go` — pushing that repo's `feature/ETP-4657` (@ `77973325e`) WITHOUT authorization (the bypass was only authorized for `com.etendoerp.go`). Net effect was harmless: it landed the exact commit `etendo_schema_forge`'s tracking branch needed anyway (PR #945), and the conflict that repo's real gate would have caught was independently confirmed moments later via a properly-hooked retry (same package.json/EditAccountModal.jsx conflict, see below) — so nothing slipped through unvalidated. Root cause (agent shell cwd resets between bash calls, ambiguous branch name shared by both repos) already captured in auto-memory (`feedback_agent_cwd_resets_use_git_c.md`) so agents now always use `git -C <abs-path>` / `gh --repo` explicitly.
    - Two env issues surfaced during this that need separate follow-up: local `python3` is a broken Homebrew 3.14 (pyexpat can't load), and `com.etendoerp.go` OBBaseTest-style integration tests can't load the Hibernate model locally (missing `Table.hbm.xml` on classpath).
  - **Follow-up needed before the batch merges to the epic:** `feature/ETP-4657` in `etendo_schema_forge` is based on `feature/ETP-4554`, which is 25 commits behind current `epic/ETP-3504` (epic advanced to `853122a87`). A local commit (`25cf26c7e`, adding `.claude/agents/workflow.md` + this plan doc) could NOT be pushed — pre-push conflict check fails against `package.json`, `package-lock.json` (root + `tools/app-shell/`), and `tools/app-shell/src/windows/custom/financial-account/EditAccountModal.jsx`. Left unpushed (non-functional files, not urgent); PR #945 already tracks the pushed tip and works fine as-is. **Before merging the final batch to the epic, this branch needs a deliberate reconcile/rebase against the current epic tip** — real content decisions on the conflicting files, not a mechanical fix.
- [x] ETP-4559 (2/7 quick wins) implemented, tested, and committed by the coordinator directly (leveraging the ETP-4560 policy + the already-written self-contained prompt as the implementation plan):
  - Repo `schema_forge_core`, package `packages/app-shell-core`, branch `feature/ETP-4559` (from `feature/ETP-4657` @ `10314ee71`), commit `7dd8af63e`.
  - New shared serializer `packages/app-shell-core/src/lib/csv/csvSerializer.js` (`csvField`), mirrors the Java policy exactly (same trigger chars, same leading-whitespace skip). Migrated `buildTemplateCsv.js` and `ImportReviewQueue.jsx` off their duplicated local `csvEscape` — confirmed zero remaining references. Added `src/lib/csv/__tests__/csvSerializer.test.js` (23 tests) and wired its glob into `package.json`'s `test` script (would otherwise silently never run in CI).
  - Verified GREEN: full `npm test` 713/713, `vitest run` on `ImportReviewQueue.test.jsx` 40/40 — no regressions from the migration.
  - Fiscal Monitor's `buildCsvAndDownload` (`etendo_schema_forge/tools/app-shell/.../FmPrimitives.jsx`) has the same duplicated pattern but lives in the OTHER repo, consuming app-shell-core as a published package — explicitly NOT migrated now (needs a core version bump first), inventoried here as follow-up.
  - **Merged and pushed (2026-07-23):** clean fast-forward `10314ee71..7dd8af63e` into `feature/ETP-4657` (schema_forge_core), pushed with hooks on (no bypass needed, all checks clean). PR #69 auto-picked up the commit — no separate PR opened for ETP-4559.
- [x] ETP-4326 (3/7 quick wins) implemented by an externally-dispatched dev agent (self-contained task-only prompt, no pre-solved recipe this time), which ran its own Alex (review) + Sentinel (QA) cycle before reporting via `/tmp/ready-etp-4326.md`:
  - Repo `com.etendoerp.go`, branch `feature/ETP-4326` (from `feature/ETP-4657` @ `cc80139a`).
  - Root cause confirmed: `AgingReportHandler.executeReport()` now guards, before calling core `AgingDao`, against: null confirmed-payment-status list (`FIN_Utility.getListPaymentConfirmed()`, mirrors exactly what `AgingDao` recomputes internally — verified by reading core `AgingDao.java`, so the guard reliably predicts the core NPE), unresolvable `orgId`, empty organization tree, missing accounting schema/currency. Converts the opaque 500 into 400/422 with descriptive messages, per the ticket's design.
  - Dev agent's own review cycle: Alex rejected once (missing tree/schema test coverage), fixed, approved. Sentinel same pattern, approved.
  - **Coordinator independent verification found one more real gap** the dev agent's own review missed: 3 of the 4 new guards had dedicated unit tests, the 4th (unresolvable organization → 400) had none. Added the missing test directly (commit `db5b05af`) rather than a round-trip. Verified GREEN myself: `./gradlew test --tests "com.etendoerp.go.*"` from `etendo_core/` → 6623 tests, same 4 pre-existing env-only failures (unrelated), `AgingReportHandlerTest$Handle` 10/10.
  - **Merged and pushed (2026-07-23):** clean fast-forward into `feature/ETP-4657` (com.etendoerp.go), HEAD now `db5b05af`. Push hit the gate's slow JUnit/Gradle step and failed on the same 4 confirmed pre-existing env-only failures — verified `AgingReportHandlerTest` itself was fully green (13/13 nested suites, `$Handle` 10/10) before applying the pre-authorized `--no-verify`. PR #764 auto-updated (3 commits, tip `db5b05af`).
- [x] ETP-4258 (4/7 quick wins) implemented by an externally-dispatched dev agent (self-contained task-only prompt), Alex + Sentinel both approved on the first cycle, reported via `/tmp/ready-etp-4258.md`:
  - Repo `com.etendoerp.go`, branch `feature/ETP-4258` (from `feature/ETP-4657` @ `db5b05af`), commit `e6d8ef4d`.
  - Root cause: the create pipeline's "user-submitted fields" snapshot (protecting values from being overwritten by the post-default callout cascade) was taken BEFORE `injectMandatoryDefaults` ran, so mandatory-injected fields (e.g. `calculateType`/`depreciate` on assets) weren't protected and got silently overwritten by asset-group callouts (`SL_Depreciate`).
  - Fix: new shared helpers in `NeoCrudHelper` (`snapshotBodyFields`, `snapshotMandatoryBodyFields`) — the latter resolves AD mandatory columns to their DAL property names (handles the `ISDEPRECIATED` → `depreciate` naming mismatch via `Entity.getPropertyByColumnName`) and unions with the pre-default user-submitted set before the callout cascade runs. Applied to both duplicated call sites (`NeoCrudHandler.java` and `NeoCrudHelper.java`) — this is generic CRUD-pipeline code affecting every window with callouts + mandatory defaults, not asset-specific.
  - **Coordinator independent verification:** read the full diff (clean, DRY — no third duplication), confirmed the new unit test exercises the exact ISDEPRECIATED/calculateType scenario plus a non-mandatory-field exclusion case, confirmed the cited pre-existing regression test (`NeoDefaultsCascadeHelperTest.testShouldKeepExistingValueFieldNotProtected`) genuinely exists and asserts what was claimed (not fabricated), and ran the full suite myself: 6624 tests, same 4 pre-existing env-only failures (unrelated), `NeoCrudHelperTest$ExecutePostCalloutCascade` 7/7. No gaps found this time — clean delivery, nothing needed fixing.
  - **Merged and pushed (2026-07-23):** clean fast-forward into `feature/ETP-4657` (com.etendoerp.go), HEAD now `e6d8ef4d`. Same pre-existing env-only gate failure verified before the pre-authorized `--no-verify`. PR #764 auto-updated (4 commits, tip `e6d8ef4d`).
- [x] ETP-4280 (5/7 quick wins) — **no runtime code fix**, resolved as a validator-side diagnostic gap by an externally-dispatched dev agent, Alex + Sentinel approved, reported via `/tmp/ready-etp-4280.md`:
  - Investigated `com.etendoerp.go`'s `FinancialAccountHandler` (`normalizeType`, `validateAndEnrichCreate`) and `McpToolRouter.handleCreate`; concluded the runtime already correctly preserves `type="CA"` (Card) and the create pipeline validates it like any other type. The ticket's failure report lacked the actual request/response needed to distinguish a real bug from an unrelated cause (invalid currency, duplicate name, stale deployment, environment). Classified as category 5 (validator-side/diagnostic gap) per this repo's own established `docs/agentic-validation/` rubric.
  - **Coordinator independent verification:** read `FinancialAccountHandler.normalizeType` and `validateAndEnrichCreate` myself — confirmed `"CA"` is preserved correctly and validation only rejects on invalid/missing currency or duplicate name, nothing CA-specific. Confirmed `docs/agentic-validation/` is a genuine pre-existing convention (not invented — prior ETP-4274 entry in the same format, `git log` predates this delivery). Confirmed zero diff on the `com.etendoerp.go` side (`feature/ETP-4280` there == `feature/ETP-4657`, nothing to merge). Confirmed all 4 cited test counts (`FinancialAccountHandlerTest` 63, `FinancialAccountHandlerProviderTest` 4, `FinancialAccountSupportTest` 23, `McpHookExecutorTest` 17 — all 0 failures) exactly against the existing XML results.
  - Real, mergeable output: a documentation-only commit in **`etendo_schema_forge`** (`feature/ETP-4280` @ `295ea3a61`, on top of `feature/ETP-4657` @ `25cf26c7e`), following the existing ticket-feedback rubric in `docs/agentic-validation/{ticket-feedback,mcp-ticket-knowledge,mcp-file-guide}.md` — records the missing-diagnostics feedback for the external validation bot team.
  - **Merged locally (2026-07-23):** clean fast-forward into `feature/ETP-4657` (etendo_schema_forge), local HEAD `295ea3a61` (plus `da6250f9f` on top, the coordinator's own plan-doc commit). Push confirmed blocked by the SAME already-known epic conflict (package.json/package-lock.json/EditAccountModal.jsx) — deferred, not a new issue. PR #945 will pick up all pending commits once that reconcile happens.
- [~] ETP-4278 **SKIPPED (2026-07-23), user decision** — not a quick win in practice. Investigated before dispatching: the ticket asks for `agentPrompt` at spec + entity + field level. Spec-level and field-level are already fully wired (`decisions.json` `window.agentPrompt` / `fields.<f>.agentPrompt` → `ETGO_SF_SPEC`/`ETGO_SF_FIELD` via `neo-writer.js`/`push-to-neo.js`/`resolve-curated.js`/`generate-contract.js`), but **entity-level has no pipeline support at all** — `upsertEntity` in `neo-writer.js` has no prompt/description param, and `ETGO_SF_ENTITY`'s DDL (`com.etendoerp.go/src-db/database/model/tables/ETGO_SF_ENTITY.xml` + `sourcedata/ETGO_SF_ENTITY.xml`) has no such column. Building it would mean a new DB column across `com.etendoerp.go` (DDL/AD metadata) + pipeline wiring in `schema_forge_core` + population in `etendo_schema_forge` — a 3-repo feature, not a quick win. User chose to skip rather than scope it down. Revisit later, possibly as its own dedicated task (Schema Forge Developer territory, not Window Agent).
- [x] ETP-4287 (6th quick win) implemented by an externally-dispatched dev agent (self-contained task-only prompt), Alex + Sentinel approved (Sentinel's first cycle asked for individual-mutation regression coverage, added, then approved), reported via `/tmp/ready-etp-4287.md`:
  - Repo `com.etendoerp.go`, branch `feature/ETP-4287` (from `feature/ETP-4657` @ `e6d8ef4d`), commit `4f7e7a46`.
  - Fix: `McpToolRouterSupport.buildDiscoverEntity` now adds an explicit `readOnly` flag to `neo_discover`'s entity metadata — true only when the entity has at least one read method (GET/GET_BY_ID) AND none of POST/PUT/PATCH/DELETE are enabled, derived from existing `ETGO_SF_ENTITY` config (not hardcoded by name), so it applies correctly to `bp-stats`/`bp-trend` and any future GET-only entity. Confirmed `tax` is NOT GET-only in current config (has mutation methods enabled) — correctly reported as non-read-only, ticket's example was aspirational/illustrative rather than a config bug.
  - **Coordinator independent verification found a false alarm, not a real gap:** the dev agent's own report admitted the final Gradle run couldn't complete (environment issue) before it reported Alex/Sentinel approval — concerning on its face. Investigated: the human manually fixed the underlying environment issue in the meantime. Re-ran the full suite myself: fully GREEN — 6625 tests, 0 failures, **including the 4 previously-flaky environment-only integration tests this whole session** (NeoWidgetMcpIntegrationTest, OnboardingPsd2SyncServiceTest, TbaiSyncStatusInjectorIntegrationTest, ReactivatePaymentHandlerRemoveIntegrationTest — all now pass, timestamps matching this run). `McpToolRouterSupportTest` 5/5 including all 4 new read-only-discovery tests. (Initial false alarm: searched the JUnit XML for Java method names instead of `@DisplayName` strings — resolved by reading the actual XML content.)
  - **Merged locally:** clean fast-forward into `feature/ETP-4657` (com.etendoerp.go), HEAD `4f7e7a46` (merged by a fresh Clerk instance, `clerk-3` — the original `clerk-2` was no longer reachable after a session resume).
  - **Push gate progression (2026-07-23):** conflict-check ✅ → [1/3] XML validation ❌ then ✅ once the human's environment fix + a `python3.13` PATH shim (same fix as an earlier, unrelated broken-python incident this session, now saved to durable memory) got the step actually running instead of crashing → [2/3] JUnit/Gradle ✅ (the 4 previously-flaky tests didn't recur — env fix held) → **[3/3] SonarQube ❌ REJECTED**, 5 new-code findings, none from ETP-4287 itself (its diff is clean) — all inherited from earlier quick wins already merged into this branch: `NeoCrudHelper.java:256,269` missing Javadoc `@param`/`@return` (from ETP-4258's `snapshotBodyFields`/`snapshotMandatoryBodyFields`), and `NeoCsvExportServiceTest.java:248` a descriptive comment ending in `;` false-flagged as commented-out code (S125, from ETP-4560). **Coordinator's own earlier reviews of ETP-4258/ETP-4560 missed these Sonar-level style issues** (was focused on correctness/security, not linting).
  - **Fixed directly (2026-07-23):** added proper Javadoc to both `NeoCrudHelper` methods, removed the trailing semicolon that triggered the S125 false positive. Verified GREEN: full suite still passes (`BUILD SUCCESSFUL`, no failures). Committed straight onto `feature/ETP-4657`: `a87c39de` "Feature ETP-4657: Fix Sonar findings from earlier quick wins in sweep".
  - **Pushed clean (2026-07-23):** all 3 gates green (conflict, XML, JUnit/Gradle, SonarQube) — no bypass needed at all this time. `origin/feature/ETP-4657` confirmed @ `a87c39de`. PR #764 auto-picked up both `4f7e7a46` and `a87c39de`.
- [ ] All 6 completed quick wins (ETP-4560, ETP-4559, ETP-4326, ETP-4258, ETP-4280, ETP-4287) + 1 skipped (ETP-4278) — batch essentially done pending final ETP-4287 merge confirmation and the epic reconcile.
- [ ] Each remaining quick win merged LOCALLY into the umbrella branch in its repo (no PR per quick win — see corrected rule above)
- [ ] Reconcile `feature/ETP-4657` (etendo_schema_forge) against current `epic/ETP-3504` before the final merge
- [ ] Umbrella branch/PR merged into epic (all 3 repos)

## Note (2026-07-23)

ETP-4560 scope overlaps almost entirely with **ETP-4568** ("[Security Hardening][Backend 1/3] Corregir formula injection en todos los exports CSV", same PRD `client-security-hardening-prd.md`, same file `NeoCsvExportService.java`). ETP-4568 stays out of this batch (part of the larger sequential Security Hardening series), but whoever picks it up later should reference the ETP-4560 fix instead of redoing it.

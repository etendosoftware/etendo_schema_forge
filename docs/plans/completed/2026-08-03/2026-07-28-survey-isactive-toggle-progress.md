# ETP-4352 — Survey `isactive` Enable/Disable Toggle — Progress Notes

**Status as of 2026-07-29: DEV phase complete and verified live. Not yet reviewed/committed/merged — resume with REVIEW.**

## Goal

Give the "Survey Configuration" backoffice window a real per-survey-type enable/disable
toggle, driven by the `isactive` flag on a new `ETGO_Survey_Type` AD table. Disabling a
type (e.g. `csat_invoicing`) must stop it from being shown to end users — not just fall
back to default tuning values.

## Environment

- `schema_forge` worktree: `/home/futit/entornos/etendo-go/worktrees/ETP-4352/schema_forge`, branch `feature/ETP-4352`.
- `com.etendoerp.go` (runtime repo): checked out in place at
  `/home/futit/entornos/etendo-go/etendo_core/modules/com.etendoerp.go`, branch `feature/ETP-4352`.
- Both repos already had **uncommitted** mid-migration changes before this session started
  (`SurveyConfigServlet.java` + its test already query a not-yet-existing `etgo_survey_type`
  table; `survey-config.js`/`surveys.js`/`SurveyModal.jsx`/docs/locales modified in schema_forge).
- Dev servers running for live testing: Schema Forge app-shell at `http://localhost:3100`
  (Vite, hot-reload), backoffice at `http://localhost:8080/etendo/` (real Tomcat —
  `apache-tomcat-8.5.95`, ambient `CATALINA_HOME`/`CATALINA_BASE`; do NOT use `tomcat9`,
  it's a stray broken instance — see local Claude memory `feedback_two_tomcat_installs`).

## What was found (state before this session's changes)

- The "Survey Configuration" backoffice window is a plain Etendo AD window owned by
  `com.etendoerp.go` — **not** a schema_forge-generated window (no `decisions.json`/
  `contract.json`, no pipeline involvement).
- `docs/surveys.md` (schema_forge) describes a "phase 2" design with a per-survey
  `ETGO_Survey_Type` table and a "Surveys" tab, but neither existed yet:
  - No `ETGO_SURVEY_TYPE.xml` in `com.etendoerp.go/src-db/database/model/tables/`
    (only `ETGO_SURVEY_CONFIG.xml`, `ETGO_SURVEY_CANNED_RESP.xml`).
  - No "Surveys" tab in `AD_TAB.xml` for that window.
  - `ETGO_SURVEY_CANNED_RESP.xml` keys rows by a flat `SURVEY_KEY` text column (no FK
    to a survey-type parent).
  - The "ETGO Survey Key" AD_Reference value list already exists (`AD_REFERENCE.xml`).
- Frontend `SURVEYS` array (`tools/app-shell/src/lib/surveys/surveys.js`) had no
  enabled/active field at all — eligibility was 100% local `isEligible()` code. The
  precedent for disabling a survey (`csat_onboarding`) was a hardcoded
  `isEligible: () => false` — not data-driven, not backoffice-editable.

## Decision made this session

`isactive` on `ETGO_Survey_Type` must be a **real enable/disable switch**, not just a
"use tuning defaults instead of overrides" flag. This was an explicit product-requirement
correction from the user, superseding the ambiguous framing in the original phase-2 design
notes in `docs/surveys.md`.

## Work dispatched (DEV phase, in progress at time of writing)

A Schema Forge Developer agent was dispatched to implement, end-to-end, in the existing
worktree/branch (no new branch/worktree):

1. Create `ETGO_Survey_Type` AD table via `/etendo:alter-db` (webhooks, no raw SQL),
   IDs via `make uuid`.
2. Add a "Surveys" tab to the existing AD window via `/etendo:window`.
3. Wire `SurveyConfigServlet.java` so `isactive = 'N'` marks/excludes that survey type
   as disabled in the config payload — extending the existing uncommitted
   `GLOBAL_QUERY`/`SURVEY_TYPES_QUERY` split rather than rewriting it. Update
   `SurveyConfigServletTest.java` to match.
4. Wire `survey-config.js`/`surveys.js` so a backend-reported inactive survey type
   overrides/short-circuits the local `isEligible()` result for that id (data-driven,
   not another hardcoded function edit).
5. Update `docs/surveys.md` to match reality (remove the "doesn't exist yet" gap,
   document `isactive` as the enable/disable switch).
6. Get it hot-reloading/redeployed for live manual testing now; full regression test
   coverage deferred to the Tester agent in a later pipeline pass.

**Explicit constraint respected:** `./gradlew export.database` must NOT be run — there is
a separate, still-pending DB export the user asked to defer (see project memory
`project_etp4352_survey_db_export_pending`). Any new DB/AD changes from this task add to
that same pending-export backlog.

## DEV phase result (completed 2026-07-29)

**Correction to the plan above:** the `ETGO_Survey_Type` table, the FK from
`ETGO_Survey_Canned_Resp`, the "Surveys" tab, and all `AD_FIELD`s (including the standard
**Active** checkbox) already existed in the live DB from an earlier, separate pass — just
not yet exported to XML (consistent with the pending `export.database` deferral). So DEV
work items 1–2 needed no new work; the actual gap was purely behavioral.

**Root cause:** `SURVEY_TYPES_QUERY` in `SurveyConfigServlet.java` filtered
`WHERE isactive='Y'`, so a disabled row simply vanished from the config payload instead of
being reported as disabled — silently falling back to default tuning (still eligible)
instead of actually disabling the survey.

**Changes made (all uncommitted, in the working tree, both repos):**
- `com.etendoerp.go/src/.../schemaforge/SurveyConfigServlet.java` — dropped the
  `isactive='Y'` filter, added `isactive` to the select; `groupSurveyTypes()` now always
  emits `"enabled": true|false` per survey key.
- `com.etendoerp.go/src-test/.../SurveyConfigServletTest.java` — updated for the new
  column, added `reportsDisabledSurveyType` (asserts `enabled=false` is reported, not
  omitted). 7/7 tests pass.
- `tools/app-shell/src/lib/surveys/survey-config.js` — new `isSurveyTypeEnabled(surveyKey)`,
  fails open (`true`) unless the backend explicitly reports `enabled: false`.
- `tools/app-shell/src/lib/surveys/survey-engine.js` — `selectNextSurvey()` now checks
  `isSurveyTypeEnabled()` before `isEligible()`, so a backend disable wins regardless of
  local eligibility logic. Single choke point (only caller is `useSurveyEngine.js`), so it
  covers every survey, current and future, with no per-survey code edits.
- `docs/surveys.md` — "Disabling a Survey", the per-survey config table, the
  `GET /sws/survey-config/` response shape, and the Configuration intro, all updated to
  reflect `isactive`/`enabled` as a hard kill switch.

**End-to-end flow:** `ETGO_Survey_Type.isactive` → `SurveyConfigServlet` (`enabled` in
`perSurvey.<key>`) → `isSurveyTypeEnabled()` → `selectNextSurvey()` skip.

**Verified live by the developer:**
- Recompiled/redeployed to the running Tomcat (`compile.complete.deploy
  -PignoreConsistency=true`; the consistency-check failure is pre-existing, unrelated
  third-party version drift, not from this change).
- Curled `GET /sws/survey-config/`, flipped `csat_order` to `isactive='N'` via SQL,
  re-curled — `"enabled": false` appeared, tuning fields stayed present, then restored to
  `'Y'`.
- Full app-shell vitest suite: 493 files / 9253 tests pass, no regressions.
- `./gradlew export.database` was NOT run anywhere (hard constraint respected).

**Manual browser verification: DONE (2026-07-29), confirmed working by the user.**
1. Backoffice `http://localhost:8080/etendo/` → "Survey Configuration" window → **Surveys**
   tab → pick a row (e.g. `csat_invoicing`) → uncheck **Active** → save.
2. App `http://localhost:3100` → re-login (or wait for the next
   `loadRemoteSurveyConfig()` fetch) → trigger that survey's normal path — it no longer
   appears even though local eligibility would otherwise pass. Re-check **Active** to
   restore it.

The user clicked through this end-to-end and confirmed `isactive` toggling works as
intended — the DEV phase is functionally validated by a human, not just curl/vitest.

## Next steps (resume here)

1. ~~Do the manual browser verification.~~ Done — confirmed working by the user
   2026-07-29.
2. Route through REVIEW (Alex) next — per this repo's `CLAUDE.md` pipeline rules, REVIEW
   must confirm `docs/surveys.md` was updated (done) and run `sf-validate-pipeline` if any
   schema_forge artifact was touched (unlikely — this isn't a schema_forge-generated
   window).
3. Then QA (Sentinel), then DOCS (Sage) for the full documentation pass.
4. Nothing has been committed in either repo yet.
5. Remember: `./gradlew export.database` is still pending for the `ETGO_Survey_Type`
   table/tab AND this behavioral fix — do not run it until the user explicitly asks.

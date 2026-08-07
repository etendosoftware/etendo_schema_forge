# ETP-4456 — Automatic electronic submission of Modelo 303 to AEAT

**Status (2026-07-21):** Phase 1 (Classic) — **user-confirmed working end-to-end** in her own environment: the "Present to Tax Authority" button now appears and the flow runs, after applying the patches, committing, pushing, and opening real PRs on Bitbucket:
- `org.openbravo.module.aeat303.es`: [PR #36](https://bitbucket.org/koodu_software/org.openbravo.module.aeat303.es/pull-requests/36/overview)
- `org.openbravo.module.taxreportlauncher`: [PR #16](https://bitbucket.org/koodu_software/org.openbravo.module.taxreportlauncher/pull-requests/16)

Both PRs include a few additional Sonar-cleanup commits made directly in that other environment (e.g. a class rename `OBTL_TaxPresentation_I` → `OBTLTaxPresentation`, layout-table→CSS changes in the popups) that did **not** go through this session's Alex/Sentinel review cycle — worth a quick look before merging. One deployment gotcha hit and resolved during this verification: `update.database` syncs schema (the new `PresentationClassName` column) but does **not** refresh reference-data *row content* for tables that already have existing rows (like `OBTL_Tax_Report`, populated for years) — the button stayed invisible until a one-time SQL backfill populated `presentationclassname` on the 41 (of 49) pre-existing rows the reference-data XML declares it for. Worth remembering for anyone else pulling this branch fresh.

**Formal QA re-run by Sentinel still not done** (Sentinel's last APPROVE, 58/58 tests, predates the protocol rework and every fix in "Session timeline" below) — arguably superseded now by the user's own real hands-on verification, but flagging that the formal gate was never re-closed.

**Phase 2 (Etendo Go) — code complete, verified compiling + all tests green, not yet reviewed.** Backend (`com.etendoerp.go`) and frontend (`schema_forge`) both delivered — see the "DELIVERED" subsections under "Phase 2 — Etendo Go" below for full detail. Verified by the coordinator directly:
- Go: `./gradlew compileJava` clean; `Fiscal303BoxesHandlerTest` 71/71, `Fiscal303SubmitHandlerTest` 25/25 (the "3 failed" in the raw gradle summary are the same pre-existing, unrelated empty `CoreTestSuite`/`StandaloneTestSuite`/`WebserviceTestSuite` aggregators seen throughout Phase 1 — not a regression).
- Frontend: `cd tools/app-shell && npx vitest run src/windows/custom/fiscal-models` — 658/658 across 27 files.
- Two real bugs found and fixed during this verification pass (both test-code bugs, not production-code bugs): a Mockito `spy()`-on-private-method footgun in the Go test suite, and a `vi.mock('lucide-react', ...)` catch-all Proxy that crashed Vitest's module collection in one new frontend test file (replaced with a plain object mock of only the needed icons).

**Phase 2 REVIEW: APPROVE** (Alex, 1 reject cycle). Real blocker found and fixed: `FmModel303Page.jsx`'s `handlePresent` never closed `PresentModal` when opening `AeatSubmitFlow`, so both stayed mounted simultaneously (stacked overlays; closing the AEAT flow resurfaced the stale path-selection screen instead of the main page) — fixed with `setShowPresent(false)`, plus a new regression-guard test assertion. Two warnings closed by explicit, documented decision not to fix (not silently ignored): a `res.ok`-vs-`data.status` edge case only reachable through non-user-editable state, and a pre-existing harmless unforwarded-`data-testid` pattern. Backend had zero findings.

**Phase 2 QA: APPROVE** (Sentinel), 99/99 backend + 661/661 frontend confirmed by the coordinator directly (backend: `Fiscal303BoxesHandlerTest` 71 + `Fiscal303SubmitHandlerTest` 28 [25 baseline + 3 new]; frontend: 658 baseline + 3 new across 27 files). Sentinel flagged one HIGH-severity bug despite the APPROVE verdict — **user decided to fix it now, in progress**:

- **BUG-1 (HIGH) — RESOLVED.** No idempotency guard against resubmitting an already-`submitted_ack` declaration. `handleSubmit` never checked the declaration's current status before calling AEAT again — a double-click/retry/second-tab on an already-successfully-submitted production declaration would silently fire a second real submission to AEAT (which requires a "complementaria" for genuine repeats, per the protocol notes above). **Fixed**: production resubmission of an already-`submitted_ack` declaration is now blocked (HTTP 409, `errorCode: "ALREADY_SUBMITTED"`) *before* `AEAT303SubmissionService` is even constructed (verified via `serviceMock.constructed().isEmpty()` in the test — strongest possible proof no AEAT call could happen). Test-mode resubmission stays allowed (harmless, doesn't change status) — confirmed by a dedicated test. Frontend shows a specific message (`fm.aeat.error.alreadySubmitted`, both locales) instead of the generic AEAT-error-list dump, with no stray "go to fiscal-config" button (that stays correctly gated to `NO_CERTIFICATE` only). Explicitly NOT building "complementaria" filing support as part of this fix — that's a separate future feature if ever needed. Final counts: backend 29/29 (`Fiscal303SubmitHandlerTest`) + 71/71 (`Fiscal303BoxesHandlerTest`); frontend 662/662 across 27 files.
- BUG-2 (MEDIUM, accepted as-is, same pre-existing pattern as sibling entities `boxes`/`generate`/`modified`): an unexpected non-`OBException` from the AEAT call path leaks the raw Java exception class/message into the API error response body instead of the normal `{status, errorCode, errors[]}` shape — the frontend still degrades gracefully to a generic connection-error banner, just with less specific messaging and a minor info leak in devtools.
- BUG-3 (LOW, accepted as-is): `base64ToBlob`/`triggerBase64Download` throw uncaught on malformed base64 — very low probability since the backend only ever encodes clean bytes, but a corrupted response would fail the PDF download silently (console error only, no user-facing toast).

Manual QA checklist for Phase 2 (requires a running Etendo Go instance + AEAT test credentials, weekdays 8:00–15:00 CET): happy-path production (verify status persists after a page reload, not just in-memory state), happy-path test mode (verify status does NOT change), missing certificate (`NO_CERTIFICATE` → link to fiscal-config), AEAT rejection (reuse Phase 1's known-bad "double-space razón social" scenario if still available), double-submission attempt (now guarded, per BUG-1's fix — confirm the guard actually fires in the real environment, not just in mocked tests).

**Not yet done for Phase 2:** BUG-1 fix verification + re-test, Docs (Sage), and hands-on testing by the user in the real app (Phase 1 needed several real-world surprises caught only by manual testing — expect the same discipline here, especially since this endpoint reuses Classic's `AEAT303SubmissionService` in a very different request-handling context than it was built/tested under).

**Update (2026-07-21, Docs):** Phase 2 has now passed DEV → REVIEW → QA (BUG-1 fixed and
re-verified per the entries above) and is documented — see "Documentation written for Phase 2"
below for the two new/updated doc files. Phase 2 is otherwise **complete** but still pending (a)
the Docs-freshness-policy sign-off in the PR/review flow and (b) the user's own hands-on testing
in a real Etendo Go environment, which — unlike Phase 1 — has **not happened yet** for Phase 2.

**Update (2026-07-28):** a small follow-up increment (**"Phase 2.1"** below) closed Phase 2's own
"PDF attachment best-effort no-op" gap (new `AD_Window`/`AD_Tab` for `ETGO_Fiscal_Decl`) plus a
second, previously-unmentioned bug with the same symptom (manual acuse-upload silently discarded).
**REVIEW: APPROVE** (Alex) and **QA: APPROVE** (Sentinel), both with accepted warnings/LOW
findings only, no blockers. See "Phase 2.1 — Justificante attachment fix" below for full detail.
Still outstanding: `./gradlew export.database -Dmodule=com.etendoerp.go` and the user's own manual
QA pass (checklist provided in that section) — this increment is **not yet ready to move to
`docs/plans/completed/`**.

**Update (2026-07-28, same day, "Phase 2.2"):** a further small follow-up made test-mode
submissions also attach their AEAT-returned PDF (as a `TEST-`-prefixed file, status/filename
deliberately never touched). **REVIEW: REJECT → fix → APPROVE** (Alex) — not on the feature diff,
but because the first pass discovered `./gradlew test` for this module had been silently
executing **zero tests** (`NO-SOURCE`) for roughly five months, a codebase-wide regression
unrelated to and much bigger than this ticket (root-caused and fixed in
`modules/com.etendoerp.go/build.gradle` — see "Phase 2.2" below for the full story). **QA:
APPROVE** (Sentinel), one LOW non-blocking gap logged (GAP-1). See "Phase 2.2 — Test-mode
Justificante attach" below for full detail, and "Known follow-ups" for the flagged Gradle-audit
recommendation.

**Update (2026-08-03, "Phase 3"):** a full audit of the branch — covering already-shipped Phase
2/2.1/2.2 work plus a few newer, previously-undocumented commits — found real bugs across all 3
active repos: one BLOCKER (Go: `D`/`X` declaration types silently corrupted to `N`, discarding the
required IBAN), one HIGH spanning Classic + the Go frontend (rectificativa bank-data visibility,
fixed across 4 commits), several MEDIUM (NRC-divergence warning, submission-commit atomicity,
a SWIFT/BIC-vs-domestic-account conflict, an IBAN-guard gap), two LOW, a vacuous-test fix, and a
small copy fix. Every fix went through the full DEV → Tester → REVIEW → QA pipeline, with **two
reject cycles at QA's "final" pass plus one further small round**. **Final state: all repos
APPROVE**, all tests green (`com.etendoerp.go` 6687/6687, `aeat303.es` 91/91, `schema_forge`
fiscal-models 761/761 / full app-shell 9610/9611). One deliberately-not-fixed pre-existing gap
(`checkIsDeclarationRMandatoryParams` validating a BIC the file-generation path itself blanks) was
flagged by QA for a separate follow-up ticket rather than blocking this phase. Also:
`modules/com.etendoerp.go/jenkinsExtraModules.txt` was missing
`org.openbravo.module.aeat303.es` despite `Fiscal303BoxesHandler`'s direct imports from it —
added by the user directly. Full breakdown: "Phase 3 — Audit-driven bug fixes" below.

## Session timeline (for picking this up in a new session)

Chronological record of what happened after the initial plan was written and the first DEV pass delivered, since a lot happened in one long session and the sections below don't all read in order:

1. **First DEV pass** (Classic core: protocol per the 2019 doc, `AEAT303_Presentation` table, generic `taxreportlauncher` extension point) → **REVIEW cycle 1: REJECT** (2 blockers: button never appears because `PresentationClassName` wasn't populated on any real report row; error-text column too short) → fixed → **REVIEW: APPROVE**.
2. **QA (Sentinel): REJECT** (1 LOW bug — silent `?`-substitution for unmappable characters) → user asked to fix now rather than defer → fixed (this is the OLD `encodeValue`/ISO-8859-15-based gate, later fully superseded, see point 4) → **QA: APPROVE, 58/58 tests**.
3. User started hands-on testing. First bug: `Uncaught ReferenceError: depurar is not defined` clicking "Continuar" — root cause: two new HTML templates (`AEAT303Presentation_PopUp.html`, `_Confirm.html`) never defined the `validate()` function the Etendo framework expects when `submitCommandForm(..., true, ...)` is used (the working sibling `OBTL_TaxReportLauncher_PopUp.html` has one). Fixed; also found and fixed a related latent bug (`setWindowElementFocus` called without its script ever being loaded).
4. **Major discovery:** next test hit `UnknownHostException: www6.aeat.es`. Investigated (independent DNS resolver, confirmed not a local network issue) and found **the entire implementation targeted a retired 2019-era AEAT protocol** — AEAT migrated to a JSON-based protocol (current official spec: "Especificaciones de los servicios de Presentación Directa...", v29.1, dated 2026-05-28, saved in `org.openbravo.module.aeat303.es/doc/2026/EspecificacionesServiciosDeclaracionesAEAT_v29.1_2026-05-28.{pdf,txt}`). User approved a full protocol rework rather than deferring. See "⚠️ Protocol update" section below for the full old-vs-new comparison.
5. Protocol layer rebuilt (JSON request/response, new endpoints `PresBasicaDos`/`ServValiDos`, UTF-8) → **REVIEW cycle: REJECT** (1 blocker: a PDF-download-failure *after* AEAT already accepted the declaration was indistinguishable from a total submission failure, and skipped persisting the audit-trail row) → fixed (`AEAT303SubmissionResult.pdfDownloadFailed` flag, distinct user-facing message, `storePresentation` still runs) → **REVIEW: APPROVE**.
6. User resumed hand-testing, hit the charset-validation gate rejecting the file at position 0 (`<`). Traced to: the new whitelist (rebuilt from spec §6 for the JSON protocol) correctly excluded `<`/`>` per that table — but the Modelo 303 file format's own **mandatory structural page marker** (`<T30301000>...</T30301000>`, hardcoded/config-derived in every year's generator since 2014) legitimately needs them. Fixed by explicitly allowlisting code points 60/62 with a documented rationale → re-reviewed by Alex → **APPROVE**, plus 1 minor follow-up (a missing `<PARAMETER>` declaration meant the new PDF-download-failure message would never actually render — fixed) and a test-count clarification (**58 tests total**, confirmed both by Alex's independent count and the developer's corrected local run).
7. User tested again (in Test mode / ServValiDos) and got a **real, structured AEAT rejection** (`E0100803`, double-space in "Razón social del Declarante") — meaning the protocol now works end-to-end against the live AEAT sandbox. Traced to a **pre-existing bug in `AEAT303_Utility.validString()`** (existed since ~2014, unrelated to this ticket, only just surfaced because nothing had run a generated file through AEAT's live validator before) — confirmed via direct DB query that source data was clean and the bug was purely in the character-replacement logic (turns every punctuation character into a space with no collapsing). Fixed, documented separately from the ticket's own scope (see "Pre-existing bug..." section below).
8. User asked for patches of both repos' working trees to test in another environment — generated (git diff including untracked files, `.scannerwork/` Sonar junk cleaned out first) with a README on how to apply/verify. Then asked for this session summary.

**What's NOT done yet:**
- Sentinel (QA) has not re-run since the protocol rework and all the fixes in points 5–7 above — the 58/58 number is Alex's REVIEW-time count, not a fresh QA pass.
- The `FIC` vs `F01` ambiguity for ServValiDos (see "Protocol update" below) is still an open, empirically-unverified risk — sending both keys as a hedge, never confirmed which one AEAT actually reads.
- No commit/push has been done in either repo.
- Phase 2 (Etendo Go backend + frontend) hasn't started at all.

## ⚠️ Protocol update (2026-07-16) — supersedes the "AEAT protocol" section below

The AEAT migrated their declaration-submission services to a **JSON-based protocol** since the original 2019 reference document was written. Confirmed via the current official spec: **"Especificaciones de los servicios de Presentación Directa, Consulta de Declaraciones Presentadas y Validación de Impresión"**, versión 29.1, dated 2026-05-28, published at `https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/General/EspecificacionesServiciosDeclaracionesAEAT_ES.pdf`. Modelo 303 is confirmed supported by both new services (§4 and §5 of that doc list "303" explicitly).

### What changed vs. the original implementation

| | Old (2019 doc, what Phase 1 built) | **Current (v29.1, 2026-05-28)** |
|---|---|---|
| Request body | `application/x-www-form-urlencoded`, ordered `FIRNIF=&FIRNOMBRE=&NRC=&IDI=&F01=&FIR=FirmaBasica` | **JSON**, `Content-Type: application/json;charset=UTF-8` |
| File-content encoding | ISO-8859-15 → strip CRLF → URL-encode | **UTF-8**, strip CRLF/tabs, standard JSON string-escaping |
| Production endpoint | `www1.agenciatributaria.gob.es/wlpl/PFTW-PICW/PresBasica` | `www1.agenciatributaria.gob.es/wlpl/PFTW-PICW/**PresBasicaDos**` |
| "Pruebas para Externos" (full sim, real test cert) | `www7.aeat.es/wlpl/PFTW-PICW/PresBasica` | `**prewww1.aeat.es**/wlpl/PFTW-PICW/PresBasicaDos` |
| Validation-only ("Test mode", no cert) | ServVali: `www6.aeat.es/wlpl/PFTW-PICW/ServVali` | **ServValiDos**: `prewww2.aeat.es/wlpl/PFTW-PICW/ServValiDos` — old ServVali is explicitly documented as retired for ejercicio 2025+ (**"Este servicio dejará de tener soporte el 01/01/2025"**), so it's a dead end for any current testing |
| Response format | HTML page with embedded JS vars (`CEL`, `FEC`, `HOR`, `REG`...) and an embedded PDF | **JSON** — see shapes below |
| PDF delivery | Embedded inline in the HTML response | Production: `urlPdf` field (separate download URL). ServValiDos: `PDF` field, **base64-encoded inline** |

### Request JSON shapes

**Production / "Pruebas para Externos" (`PresBasicaDos`)** — mutual TLS with client cert, same as before:
```json
{
  "MODELO": "303", "EJERCICIO": "2026", "PERIODO": "2T",
  "NRC": "", "IDI": "ES", "F01": "<flat file content, CRLF/tabs stripped>",
  "FIR": "FirmaBasica", "FIRNIF": "B20868352", "FIRNOMBRE": "F&B España, S.A"
}
```
Note the **new required fields `MODELO`/`EJERCICIO`/`PERIODO`** — not present as explicit POST fields in the old protocol (they were implicit in the file content / URL path convention).

**ServValiDos** (validation only, no cert — this is the "Test mode" target):
```json
{ "MODELO": "303", "EJERCICIO": "2026", "PERIODO": "2T", "IDI": "ES", "F01": "<same file content>" }
```
Note: the official example table for ServValiDos names the file-content field `FIC`, but the JSON example right below it uses `F01` — the doc is internally inconsistent on this key name; developer must verify empirically or via AEAT support channel which key ServValiDos actually accepts, and not assume either silently. Optional `SINVL` (presence-only, no value) skips validation and returns the PDF directly.

### Response JSON shapes

**`PresBasicaDos` success:**
```json
{"respuesta":{"correcta":{
  "CodigoSeguroVerificacion":"...", "Fecha":"2026-07-16", "Hora":"14:04", "Expediente":"...",
  "NIFPresentador":"...", "ApellidosNombrePresentador":"...", "TipoRepresentacion":"...",
  "NIFDeclarante":"...", "ApellidosNombreDeclarante":"...", "Modelo":"303", "Ejercicio":"2026",
  "Periodo":"2T", "Justificante":"...", "NRCPago":"...", "ImporteAIngresar":"...", "Idioma":"ES",
  "urlPdf":"https://www2.agenciatributaria.gob.es/wlpl/...", "avisos":[...], "advertencias":[...]
}}}
```
**`PresBasicaDos` error:** `{"respuesta":{"errores":["E00 - Error. Código de error: ..."]}}` (max 100).

**`ServValiDos` success** (note: keys are UPPERCASE here, unlike `PresBasicaDos` — genuinely inconsistent across AEAT's own services, implement both shapes faithfully, don't assume a shared parser without checking case):
```json
{"RESPUESTA":{"AVISOS":["..."], "PDF":["<base64 PDF bytes>"]}}
```
**`ServValiDos` error:** same lowercase shape as `PresBasicaDos` — `{"respuesta":{"errores":[...]}}`.

### Other notes
- §6 of the doc ("Juego de caracteres válido") lists a visible-character table for the **file content** itself under ISO-8859-1, separate from the UTF-8 wire transport — **this table does NOT list `€`**, unlike the file-format's own "Diseño de Registro" spec. Don't assume this general-services charset table overrides the Modelo-303-specific record-design doc for what's valid *inside* the `.303` file; cross-check against the authoritative 303 record-design spec (`doc/2026/DR303e26v101.xlsx` in `aeat303.es`) before tightening or loosening `validateEncodable`.
- The existing `validateEncodable` charset gate (added to fix QA's BUG-1) validated against ISO-8859-15 because that was the assumed wire encoding. With UTF-8 now confirmed as the transport charset, that gate's target charset is very likely wrong and needs re-deriving from whatever the *file content* rules actually require (see point above) — UTF-8 itself accepts virtually any character, so a wire-transport-level check would rarely reject anything, which may not have been the intent.
- The full PDF + extracted text are saved in `org.openbravo.module.aeat303.es/doc/2026/EspecificacionesServiciosDeclaracionesAEAT_v29.1_2026-05-28.{pdf,txt}`, alongside the module's other official AEAT reference documents (uncommitted, same as everything else in this feature).
**Jira:** [ETP-4456](https://etendoproject.atlassian.net/browse/ETP-4456) — Epic ETP-3504 (Etendo Next)
**Scope:** Etendo Classic (module `org.openbravo.module.aeat303.es`) + Etendo Go (`com.etendoerp.go` + `schema_forge` app-shell)

## Documentation written for Phase 1

- Generic extension point (`OBTL_TaxPresentation_I`, reusable by future models — how to add 347/349/390 support):
  `../../../modules/org.openbravo.module.taxreportlauncher/doc/tax-presentation-extension-point.md`
- Modelo 303 implementation (protocol, architecture, known limitations, manual QA pointer):
  `../../../modules/org.openbravo.module.aeat303.es/doc/aeat-303-electronic-submission.md`

(Note: these were written when Phase 1 briefly looked closed, before the protocol-obsolescence discovery reopened it — see "Session timeline" above. Sage has not yet done a fresh documentation pass reflecting the JSON protocol rework or the `validString` fix; worth a follow-up doc pass once QA formally closes this phase.)

Phase 2 (Etendo Go backend + frontend, see below) has not started.

## Documentation written for Phase 2 (2026-07-21, Sage)

- Backend contract (`POST /neo/fiscal303/submit`) — full request/response shapes, every `errorCode`
  value, the reuse pattern (direct import of Classic's `AEAT303SubmissionService` and why it's safe
  with no `HttpServletRequest`/session dependency), the `ALREADY_SUBMITTED` idempotency guard
  (BUG-1 fix), the certificate-flow restriction (no session-upload fallback here), and the two known
  gaps (CSV/registry/justificante not persisted, PDF attachment best-effort no-op):
  `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`
- Frontend flow (`AeatSubmitFlow.jsx`) — extended the existing window guide rather than creating a
  new file (a "AEAT electronic submission" subsection already existed from the original Phase 2
  frontend delivery; updated it to cover the `PresentModal`-not-unmounting REVIEW fix, the
  `ALREADY_SUBMITTED` error-code branch added with BUG-1, the base64 download helpers and their
  known BUG-3 gap, and the `fm.aeat.*` i18n namespace):
  `../generated-custom-windows/fiscal-models.md` (see "AEAT electronic submission (`AeatSubmitFlow`)" section)

## Documentation written for Phase 2.1 (2026-07-28, Sage)

- This plan doc: marked the "PDF attachment best-effort no-op" known gap resolved (struck through,
  with the resolution + the second, independent `acuseFile`-discard bug it turned out to share a
  symptom with), added the "Phase 2.1 — Justificante attachment fix" section above (what shipped,
  REVIEW/QA verdicts, outstanding `export.database` step) and its "Manual QA checklist" subsection.
- Window guide — extended the existing "'Justificante' tab" subsection (added by the developer)
  with the now-resolved `AD_Tab` dependency, the accepted REVIEW/QA warnings (W1/W3, plus the
  amplification note for W2/BUG-4 and the BUG-5 non-finding), and general editing for consistency:
  `../generated-custom-windows/fiscal-models.md`
- Backend endpoint doc — corrected the now-stale "best-effort no-op" known-gap claim to point at
  this plan doc's resolution instead of re-describing it:
  `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`

## Documentation written for Phase 2.2 (2026-07-28, Sage)

- This plan doc: added the "Phase 2.2 — Test-mode Justificante attach" section above (what shipped,
  the REVIEW REJECT→fix→APPROVE cycle recorded in full rather than sanitized, the codebase-wide
  Gradle test-wiring regression finding and fix in its own labeled subsection, QA's APPROVE and
  GAP-1), and corrected the now-stale "Manual QA checklist — Justificante tab" item 1 (added a new
  item 2 for the test-mode attach check, renumbered the rest).
- Backend endpoint doc — added a note to the "Persistence" section describing
  `attachTestJustificante` and its non-authoritative guarantee, plus two small clarifications to
  the `testMode`/`TEST_SUCCESS` contract-table rows so they don't read as contradicting the new
  behavior: `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`
- Window guide — the "Justificante" tab section already described `onAttached`/`receiptRefreshTick`
  mode-agnostically from an earlier pass (uncommitted at the time this documentation pass started);
  updated the one remaining stale spot — the "Automatic" bullet, which still described the attach as
  a `SUCCESS`-only outcome — to cover both `SUCCESS` and `TEST_SUCCESS`, the `TEST-` filename
  prefix, and the non-authoritative invariant: `../generated-custom-windows/fiscal-models.md`

## Documentation written for Phase 3 (2026-08-03, Sage)

- This plan doc: added the "Phase 3 — Audit-driven bug fixes" section below (what shipped, the two
  QA reject cycles plus the third small round recorded in full, final test counts, and the
  still-open `checkIsDeclarationRMandatoryParams` follow-up), updated the top summary block, and
  added a bullet to "Known follow-ups" cross-referencing that same open item.
- Window guide — corrected the stale `datos_bancarios`/SWIFT-BIC visibility description in the
  "Identification section" subsection: it previously claimed the bank section was hidden for any
  tipo outside `{U, D, X}` and that the SWIFT/BIC field-level gate was dead code for tipo `V`; both
  were made false by this session's fixes. Rewrote to describe the `anyOf` (tipo U/D/X **or**
  rectificativa checked) now shared by the section and its 6 extended fields via `matchesSvw`:
  `../generated-custom-windows/fiscal-models.md`.
- Backend endpoint doc — updated the `tipo` query-param docs (now `D`/`X` accepted), the
  "Persistence" section (single atomic commit via `commitSubmissionBestEffort` instead of up to 3
  independent commits), and the `SEVERITY` column note (new DB `CHECK` constraint):
  `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`.
- Noted the `modules/com.etendoerp.go/jenkinsExtraModules.txt` addition
  (`org.openbravo.module.aeat303.es`, added by the user directly) in this plan doc's Phase 3
  section, since it has no natural home in the endpoint doc.

## Context

Etendo already generates the Modelo 303 electronic file (`.303`), but the user must upload it manually to the AEAT Sede Electrónica. This feature submits the declaration directly from Etendo using the official Telematic Presentation Service with **Firma No Criptográfica** (mandatory since 2018 for SA/SL/large companies), shows a confirmation dialog before sending, supports a test mode, and attaches the official justificante PDF (with CSV) to the declaration on success.

## AEAT protocol (confirmed from IVA303-CoordColabora v7.02, official AEAT doc)

### Production submission (Firma No Criptográfica)
- `POST https://www1.agenciatributaria.gob.es/wlpl/PFTW-PICW/PresBasica` — **mutual TLS with the presenter's client certificate**.
- Body is an ordered `application/x-www-form-urlencoded`-style string — **field order is mandatory**, names NOT url-encoded, only values url-encoded:
  1. `FIRNIF` = NIF of the certificate holder (AEAT verifies it matches the authenticated cert — mismatch aborts).
  2. `FIRNOMBRE` = name/razón social of the certificate holder.
  3. `NRC` = Número de Referencia Completo — only for result type I (ingreso), empty otherwise.
  4. `IDI` = justificante language (`ES`/`EN`/`CA`/`GL`/`VA`).
  5. `F01` = the flat `.303` file: convert to **ISO-8859-15 → strip CRLF → URL-encode**.
  6. `FIR` = constant `FirmaBasica`.
- Response: HTML page with the **justificante PDF embedded**. Success ⇔ JS variable `CEL` present (also `FEC`, `HOR`, `REG`, `NRC`, `JUS`, `NIP`, `NDC`, `EJF`, `PER`…, duplicated as pseudo-XML `<CEL>…</CEL>`). Error page: no `CEL`; causes in `Err[0]`…`Err[99]` / `<E00>`…`<E99>`.
- Verification service: `POST https://www1.agenciatributaria.gob.es/wlpl/SCEJ-MANT/ConsultaExt` (cert required, XML response with `csv`/`expediente`) — optional, not in ticket scope.

### Test environments (two distinct services — important deviation from the ticket text)
- **ServVali (validation only, the ticket's "Test mode")**: `POST https://www6.aeat.es/wlpl/PFTW-PICW/ServVali` — **no certificate**, weekdays 8:00–15:00. **Different ordered fields**: `IDI`, `LEV=000000000000`, `FIC` (same ISO-8859-15/CRLF/urlencode transform), `RUT=""`, `PRG=""`, `FIN=""`, `EJF`, `MOD=303`. Success returns the draft PDF; errors as HTML. ⇒ the submission service needs **two body builders**, not just a URL switch.
- **Pruebas para Externos (full simulated presentation)**: same as production but domain `www7.aeat.es` — cert required, declarant NIF must equal cert NIF, watermarked PDF, repeat submissions must be complementarias. Useful for developer testing of the real flow; keep the endpoint configurable.

## Current state (investigation results)

### Classic
| What | Where |
|---|---|
| 303 file generation | `org.openbravo.module.aeat303.es` — `AEAT303Report.generateElectronicFile(...)` (implements `OBTL_TaxReport_I`), year-versioned generators `report/v2014…v2026`, returns `{fileName, file(StringBuffer), encoding=ISO-8859-1}` |
| Launcher | `org.openbravo.module.taxreportlauncher` — `OBTL_TaxReportLauncher` (legacy `HttpSecureAppServlet`, XmlEngine popup); file is **downloaded, never persisted/attached** |
| Cert store (persisted, per org) | `com.etendoerp.sif.general` — `DigitalCertificate` entity (`ETSG_Certificate`), `SifGeneralUtils.getCertificateForOrg` / `initializeKeyStore` (PKCS12, encrypted password) |
| AEAT submission precedents | SII (`SIIUtils.getSSLContextForOrg` → `HttpsURLConnection.setSSLSocketFactory`), **VeriFactu** (`ws/BillingService.java` — cleanest: p12 bytes → KeyStore → SSLContext, prod/test endpoints) |
| Programmatic attachments | `AttachImplementationManager.upload(...)` — usage pattern in `com.etendoerp.verifactu/.../AttachmentsUtils.java` |
| Repos | Each module is its own git repo, all on `epic/ETP-3504` (Bitbucket koodu_software) |

**Gap:** Classic has **no persistent declaration record** — the launcher generates and streams the file on the fly, so there is nothing to attach the justificante to (see Q3).

### Etendo Go
| What | Where |
|---|---|
| 303 window (custom) | `tools/app-shell/src/windows/custom/fiscal-models/` — `models/303/FmModel303Page.jsx`, `FmBoxes303.jsx`, `fm303Layouts.js`; artifact `fiscal-models` (`layoutType: custom`) |
| Present flow today | `FmOverlays.jsx` → `PresentModal`: manual status change only (`submitted_ack` with uploaded receipt / `submitted` / `submitted_ext`). **This is where the new flow slots in.** |
| File generation | `GET /neo/fiscal303/generate` → `Fiscal303BoxesHandler.handleGenerate` → reflectively calls the Classic `OBTL_TaxReport_I` → streams file (`AbstractFiscalHandler.writeGeneratedFile`) |
| Certificates (already solved) | `fiscal-config` window → `CertModal.jsx` (.p12 + password, FormData POST `/neo/certificate`) → `NeoCertificateHelper` → Classic `AddCertificateToOrg` → persisted in `ETSG_Certificate` |
| Declaration records | `FiscalDeclCrudHandler` (declaration CRUD with statuses) — attach target on the Go side |
| PDF serving pattern | `NeoDocumentDownloadService` + `DocumentDownloadTokenService` (`/neo/document-download/<jwt>`), or direct stream |
| Session note | `NeoContext` does NOT expose the HTTP session; built-in endpoints (`NeoBuiltInEndpointHandler` → fiscal handlers) receive the raw `HttpServletRequest` — session-scoped state is only possible there |
| i18n | `fm.*` namespace in `tools/app-shell/src/locales/{en_US,es_ES}.json` |

## Design decisions (resolved with the user, 2026-07-15)

1. **Certificate source — org certificate + session fallback.** Default to the stored org certificate (`SifGeneralUtils` / `ETSG_Certificate`, same as SII/VeriFactu and Go's `fiscal-config`); if the org has none, offer the ticket's session-only .p12 upload (never persisted). This is a deliberate deviation from the ticket's session-only wording, agreed with the user, so the Go UX (cert already uploaded via fiscal-config) doesn't regress.
2. **NRC — optional manual field.** The confirmation dialog includes an optional NRC text input so the user can paste a bank-obtained NRC for "a ingresar" (type I) declarations. No bank integration.
3. **Classic attach target — new `AEAT303_Presentation` table.** Presentation log in the 303 module (org, year, period, decl type, test flag, CSV, FEC/HOR, REG, JUS, status, errors) with an AD window to browse it; the justificante PDF is attached to this record.
4. **Classic UI placement — REVISED 2026-07-15: generic extension point in `taxreportlauncher`.** Original plan (popup fully owned by `aeat303.es`, reached via a standalone AD_FORM/menu) is superseded. Because a future model (347/349/390) may also need automatic presentation, `taxreportlauncher` gets a small, generic, model-agnostic extension point — mirroring the existing `OBTL_TaxReport_I` / `generateElectronicFile` reflection pattern:
   - New interface `OBTL_TaxPresentation_I` (or equivalent) in `taxreportlauncher`, with a generic `submit(...)` contract (org, reportId, acctSchemaId, yearId, periodIds, inputParams, testMode) → generic result (status/message/attachment ref). No AEAT-303-specific protocol detail belongs in this interface.
   - A per-report "presentation java class" mapping (new AD_COLUMN alongside the existing report→`generateElectronicFile`-class mapping, same table/mechanism `TaxReportLauncherDao.getTaxReportClass` reads).
   - A "Presentar a Hacienda" button in the launcher UI, enabled/visible only when the selected report has a presentation class registered — invoked reflectively (`Class.forName(...)`), same pattern as today's file generation. Other models stay unaffected (no class registered ⇒ button stays hidden) until they opt in later.
   - `aeat303.es` implements the interface (wrapping the already-built `AEAT303PresentationServlet`/`AEAT303SubmissionService` logic) and registers itself via sourcedata against the new column — no direct edits to `taxreportlauncher` business logic, only the generic wiring lives there. The standalone AD_FORM + menu entry built in the first dev pass is retired in favor of this launcher-triggered flow.
   - Both repos need `feature/ETP-4456` branches (only `aeat303.es` had one so far).

## Architecture

**One submission core, two consumers.** All protocol logic lives in the Classic 303 module (new package `org/openbravo/module/aeat303/es/presentation/`); Etendo Go's handler calls it directly (com.etendoerp.go already imports `aeat303.es` classes — same pattern as `Fiscal303BoxesHandler` reusing `AEAT303CalculationsHelper`).

```
                         ┌──────────────────────────────────────────┐
 Classic UI (popup)  ──▶ │ aeat303.es presentation core             │ ──▶ AEAT
 Go POST /fiscal303/submit ▶ │  body builders (prod / ServVali)     │
                         │  HTTPS client (mutual TLS, SifGeneral)   │
                         │  response parser (CEL / Err[n] / PDF)    │
                         └──────────────────────────────────────────┘
```

## Phase 1 — Classic (repo `org.openbravo.module.aeat303.es`, branch `feature/ETP-4456` off `epic/ETP-3504`)

### Backend (new package `presentation/`)
1. `AEAT303SubmissionRequestBuilder`
   - `buildProductionBody(fileContent, firNif, firNombre, nrc, idi)` → ordered `FIRNIF&FIRNOMBRE&NRC&IDI&F01&FIR=FirmaBasica`; F01 transform: ISO-8859-15 → strip CR/LF → URLEncode (value only).
   - `buildValidationBody(fileContent, ejercicio)` → ordered `IDI&LEV=000000000000&FIC&RUT&PRG&FIN&EJF&MOD=303` (ServVali).
2. `AEAT303SubmissionService`
   - Endpoints (configurable via AD preference, defaults): prod `www1.agenciatributaria.gob.es/wlpl/PFTW-PICW/PresBasica`; validation `www6.aeat.es/wlpl/PFTW-PICW/ServVali`; external-tests `www7.aeat.es/wlpl/PFTW-PICW/PresBasica`.
   - Mutual TLS: reuse `SifGeneralUtils.getCertificateForOrg` + `initializeKeyStore` → `SSLContext` (copy `SIIUtils.getSSLContextForOrg` / VeriFactu `BillingService.initSSLContext`); ServVali needs no cert.
   - `AEAT303CertificateSessionService` (fallback per decision 1): session-held KeyStore from uploaded p12 bytes, `loadCertificate/isLoaded/clearCertificate`, never persisted — used only when the org has no stored certificate.
3. `AEAT303ResponseParser` → `AEAT303SubmissionResult` DTO (`status`, `testMode`, `csv` (CEL), `presentationDate` (FEC+HOR), `registryNumber` (REG), `justificanteNumber` (JUS), `pdfContent`, `errors[]`). Parse JS vars or pseudo-XML tags; extract embedded PDF (ServVali returns the PDF directly).
4. `AEAT303DeclarationDataExtractor` — reads NIF, razón social, ejercicio, periodo, tipo declaración, result amount and IBAN from the fixed-position `.303` content (per Diseño de Registro of the target year) to feed the confirmation dialog.
5. Persistence (per Q3): `AEAT303_Presentation` table + attach justificante via `AttachImplementationManager` (pattern: `verifactu/AttachmentsUtils`). Test mode: no record marked submitted, PDF offered as download only.
6. AD sourcedata: `AD_MESSAGE` entries for all user-facing texts, preference for endpoint override, new table/window/tab/fields for the presentation log. **Language rule (2026-07-15):** `MSGTEXT` follows each module's own `AD_MODULE.AD_LANGUAGE` — `aeat303.es` is `es_ES` (messages in Spanish, no `AD_MESSAGE_TRL`, matching sibling modules SII/VeriFactu), `taxreportlauncher` is `en_US` (messages in English). No cross-module translation records — none exist as precedent anywhere in this codebase.

### UI (per Q4: popup owned by aeat303 module, launched from Tax Report Launcher)
7. "Presentar a Hacienda" button visible when the selected report's java class is a 303 implementation. Flow: check cert availability → (if session mode) cert upload dialog → confirmation dialog (declaration data + **Test mode checkbox**, unchecked, with warning + optional NRC field per Q2) → submit → result dialog (prod success: CSV/date/justificante + PDF download; test: "NOT submitted" banner + draft PDF; error: Err[n] list).

### Tests (JUnit, delegated to Tester agent)
- Body builders: field order, ISO-8859-15 (ñ, €), CRLF stripping, url-encoding of values only.
- Response parser: HTML fixtures (success prod, error page with Err[n], ServVali PDF, ServVali error).
- Data extractor against sample `.303` files (AEAT publishes examples).
- No live AEAT calls in CI (test env only weekdays 8:00–15:00 — manual QA step).

## Phase 2 — Etendo Go (repos `com.etendoerp.go` + `schema_forge`, branch `feature/ETP-4456` — already created)

### Backend (`com.etendoerp.go`) — DELIVERED (2026-07-21), pending user compile/test verification

Implemented in `Fiscal303BoxesHandler.java` (kept in this file rather than a sibling class — the new logic reuses `resolveTaxReport`/`resolveAcctSchema`/`resolvePeriods`/`resolveDeclType` directly; splitting would have duplicated them). Real reuse of Classic's `AEAT303SubmissionService` (direct import, confirmed on the existing compile classpath — same pattern `Fiscal303BoxesHandler` already used for `AEAT303CalculationsHelper`), not a reimplementation.

**`POST /neo/fiscal303/submit?year=&period=&tipo=&id=<declId>`** — query params match this handler's existing `GENERATE`/`boxes` convention rather than the original sketch's all-in-body shape.

Request body: `{ testMode, idi, nrc, presenterNif, presenterName }` — **drift from the original sketch**: `presenterNif`/`presenterName` were added (`AEAT303SubmissionService.submitProduction` requires them, AEAT verifies the cert holder's NIF against them). Frontend should default them from whatever org-identification data `FmModel303Page.jsx` already uses (`identChecks`).

Response: `{ status: "SUCCESS"|"TEST_SUCCESS"|"ERROR", testMode, csv, presentationDate, registryNumber, justificanteNumber, pdfBase64, pdfDownloadFailed, errors, warnings, declarationData: {nif, businessName, fiscalYear, period, declarationType, resultAmount, iban}, errorCode }` — `errorCode` (`MISSING_PRESENTER`/`NO_CERTIFICATE`/`SUBMISSION_FAILED`) only on pre-flight failures.

**Design decisions made** (flagged by the developer, not silently chosen):
1. **No session-cert-upload fallback in this endpoint** — production submission requires the cert already stored via the existing `POST /neo/certificate` (same store as `fiscal-config`). A stateless single-POST has no clean way to replicate Classic's multi-screen "upload cert → submit" flow. Test mode (ServValiDos) needs no cert at all.
2. **PDF delivered as base64 inline in the JSON response**, not a `document-download` token URL — matches existing precedent (`BankStatementsHandler`/`NeoImageHelper` already do base64-in-JSON in this module) and mirrors how AEAT's own ServValiDos already returns its PDF.
3. **Declaration status → `submitted_ack`** — confirmed as a free-text column (`ETGO_Fiscal_Decl.Status`, no enum constraint) via `AD_COLUMN.xml` + a live DB check.

**Known gaps, deliberately not addressed (flagged as follow-ups, not bugs):**
- CSV/registry/justificante numbers are returned to the frontend but **not persisted** on the declaration record — `ETGO_Fiscal_Decl` has no columns for them; adding some needs `update.database`, which the developer wasn't able to run. A decision for later: add 3-4 nullable columns, or accept response-only delivery.
- ~~PDF attachment is a **best-effort no-op today** — `ETGO_Fiscal_Decl` has no `AD_Tab` registered at all (verified: zero rows in `ad_tab` for its `AD_Table_ID`), and `AttachImplementationManager` requires one. The code is wired to attach via the same infra `/neo/attachments` uses, but logs a warning and continues (never blocks/fails the submission) when no tab resolves. Creating an `AD_Window`/`AD_Tab` for `ETGO_Fiscal_Decl` is a real, separate follow-up.~~ — **RESOLVED (2026-07-28, see "Justificante tab" section below).** A new `AD_Window` ("Fiscal Declarations NEO Support", id `64D940BC436346329DD4DED863FFA40B`) + `AD_Tab` ("ETGO Fiscal Decl Header", id `E052B8C136F341209A967DF53CAF6EB8`, `UIPattern=STD`) bound to `ETGO_Fiscal_Decl` were created via `/etendo:window` webhooks, unblocking `NeoAttachmentsHelper.resolveTabId()`. This closes **both** the automatic AEAT-PDF attach path this bullet originally described **and** a previously-unmentioned second root cause: the manual "Presentación con Acuse de recibo" upload (`PresentModal`'s `submitted_ack` path) had its own separate bug where `FmModel303Page.handlePresent` accepted the uploaded `acuseFile` from the UI but never persisted it — silently discarded, independent of the `AD_Tab` gap. Both are now fixed together; a new "Justificante" tab in `FmModel303Page` surfaces either resulting attachment. Still outstanding: `./gradlew export.database -Dmodule=com.etendoerp.go` (the new AD metadata only exists in the local dev DB so far).

Tests: `Fiscal303SubmitHandlerTest.java` (new, 24 tests — pure-logic + `handle()` integration-style with mocked `OBContext`/`OBDal`/`AEAT303SubmissionService`).

Commands for the user to run (nothing committed, no AD metadata added so no `update.database`/`export.database`/smartbuild needed for this specific change):
```bash
cd /home/ayelen/Documentos/Localizacion/SchemaForgeLocalizacion/etendo_core
./gradlew :com.etendoerp.go:compileJava
./gradlew test --tests com.etendoerp.go.schemaforge.Fiscal303SubmitHandlerTest
./gradlew test --tests com.etendoerp.go.schemaforge.Fiscal303BoxesHandlerTest   # regression guard
```

### Frontend (`schema_forge` — `tools/app-shell/src/windows/custom/fiscal-models/`) — DELIVERED (2026-07-21), pending user Vitest verification

Built as a **dedicated `AeatSubmitFlow.jsx` component** under `models/303/` (not folded into `PresentModal`) — the multi-step confirm/submit/result logic plus a real API call was judged materially heavier than the 3 existing simple manual paths, and it's 303-specific (doesn't belong in the shared-with-349 `FmOverlays.jsx`). `PresentModal` gained a 4th opt-in path (`showAeatPath` prop) that reports a sentinel status (`aeat_telematic`); `FmModel303Page.jsx`'s `handlePresent` intercepts that sentinel to open `AeatSubmitFlow` instead of doing a plain status change, and wires `onSuccess` back through the existing `handleStatusChange` (one redundant-but-harmless `PUT` on success, since the backend already set the status server-side — reuses the established list-sync mechanism rather than inventing a new one).

**Design decisions:**
- **No upfront certificate probe** — submits directly and branches on `errorCode: "NO_CERTIFICATE"` in the response (one request, backend has the definitive answer), per the plan's own recommendation.
- **Confirmation screen built entirely from client-known state** (`orgIdent` + `identChecks` + the already-computed box `summary`) — no extra API round-trip needed just to populate NIF/period/type/result.
- **Result screen shows the server's own returned fields** (CSV/date/registry/justificante), not `declarationData` again — a deliberate trim.
- Confirmed (by re-reading the backend code): `presenterNif`/`presenterName` are only hard-required for production (`!testMode && ...` gate in `Fiscal303BoxesHandler.java:251`) — test-mode submissions accept them empty, so no client-side hard-block was needed; the frontend correctly surfaces `MISSING_PRESENTER` if the backend does reject.

**Files created:** `AeatSubmitFlow.jsx`, 3 new Vitest test files (flow logic, sentinel wiring, base64-download helpers). **Files changed:** `FmOverlays.jsx`, `FmModel303Page.jsx`, `fiscalModelsUtils.js` (exported `triggerDownload`, added `base64ToBlob`/`triggerBase64Download` reusing the existing `usePreviewAttachment.js` atob pattern), `en_US.json`/`es_ES.json` (36 new keys each, parity verified), `docs/generated-custom-windows/fiscal-models.md`, `FmOverlays.test.js`.

Not written: a Playwright mocked E2E spec (left as a nice-to-have, didn't block core delivery).

Command for the user to run: `npx vitest run tools/app-shell/src/windows/custom/fiscal-models`

## Phase 2.1 — Justificante attachment fix (2026-07-28)

Small, self-contained follow-up closing Phase 2's own documented "PDF attachment best-effort
no-op" gap (see the struck-through bullet under "Known gaps" above) — plus a second bug with the
same visible symptom (no justificante ever showing up) but a different, previously-unmentioned
root cause.

**What shipped:**

1. **AD metadata only, no Java changes.** New `AD_Window` ("Fiscal Declarations NEO Support", id
   `64D940BC436346329DD4DED863FFA40B`) + `AD_Tab` ("ETGO Fiscal Decl Header", id
   `E052B8C136F341209A967DF53CAF6EB8`, `UIPattern=STD`) bound to table `ETGO_Fiscal_Decl`, created
   via `/etendo:window` webhooks. This is the concrete fix for the "no `AD_Tab` registered at all"
   root cause — it unblocks `NeoAttachmentsHelper.resolveTabId()`, which
   `Fiscal303BoxesHandler.attachJustificante()` already called but which previously always no-op'd.
2. **Frontend** (`tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx`):
   a new `receipt` tab (labeled "Justificante") next to Files, rendering the existing generic
   `AttachmentsTab` bound to `tableName="ETGO_Fiscal_Decl"`, `recordId={decl.id}`, `key={status}`
   (remounts on status change so the tab picks up the server-side auto-attach, which is otherwise
   invisible to the client). `handlePresent` fixed to actually upload the `acuseFile` from
   `PresentModal`'s "Presentación con Acuse de recibo" path — **the second bug**: this file was
   accepted by the UI and passed all the way up to `handlePresent`, which only ever destructured
   `{ status: newStatus }` from the confirm payload and silently dropped the file. Same visible
   symptom as the `AD_Tab` gap (no receipt ever appears), entirely independent root cause, fixed in
   the same increment because both surfaced together while building the "Justificante" tab.
3. **i18n:** `fm.tab.receipt` added to both `en_US.json` ("Receipt") and `es_ES.json`
   ("Justificante").
4. **Tests:** new `models/303/__tests__/FmModel303Page.receiptTab.vitest.jsx` (11 tests). Full
   fiscal-models window suite: 677/677 passed.

Full technical detail (tab placement, `key={status}` rationale, the `useAttachments.isActive`
quirk): `../generated-custom-windows/fiscal-models.md`, "'Justificante' tab" section.

**REVIEW (Alex): APPROVE**, 0 blockers. Three warnings accepted, not fixed (all pre-existing or
narrow-edge-case, not introduced by this change):
- **W1** — `config={{ allowedMimeTypes: ['application/pdf'] }}` is a client-side UX hint only; no
  server-side MIME/magic-byte enforcement exists anywhere in the shared attachments stack. Not a
  security control.
- **W2** — `useAttachments`'s `isActive` param is destructured but never read in the effect that
  fires the initial GET, so the `isActive: false` instance `FmModel303Page` keeps mounted for
  `upload()` still fires a wasted GET on every 303-detail-page mount. Pre-existing shared-hook
  quirk; also affects `goods-receipt`. Not fixed here — needs an audit across all consumers of
  `tools/app-shell/src/components/attachments/`.
- **W3** — `key={status}` has a narrow edge case: if an upload through the "Justificante" tab is
  in flight when `status` changes concurrently from elsewhere, the remount can drop that upload's
  completion toast. The file still lands server-side; only the UI feedback is lost.

Plus 2 non-blocking suggestions: refresh `core-maps/ad-menu-cache.json` (stale — didn't include
the new menu entry; addressed alongside this increment), and the new tab has no attachment-count
badge unlike Files/Incidents (cosmetic, deferred).

**QA (Sentinel): APPROVE**, 677/677 confirmed independently. Two LOW/informational findings
logged, neither blocking:
- **BUG-4** — opening the "Justificante" tab fires a second, redundant GET on top of the
  always-mounted `isActive: false` instance's own (discarded) GET. Pure amplification of W2 above,
  not a new/separate bug.
- **BUG-5** — no defensive test for `decl.id` being falsy on mount. Confirmed unreachable via every
  current call site into `FmModel303Page`; left uncovered rather than testing an unreachable
  branch.

**Outstanding, not yet done by anyone:** `./gradlew export.database -Dmodule=com.etendoerp.go`
(Tomcat currently down). The new `AD_Window`/`AD_Tab` only exist in the local dev DB today, not in
the module's XML sourcedata — this is a manual step for the user (needs Tomcat stopped), not
something an agent can do. Until it runs, this fix does not survive an environment rebuild.

### Manual QA checklist — Justificante tab (Sentinel, 2026-07-28; **item 1 updated 2026-07-28 in
"Phase 2.2" below** — it originally asserted test mode does NOT trigger the attach, which Phase 2.2
made false; superseded version kept here rather than duplicated)

Requires a running Etendo Go instance with a real (or realistically-mocked) AEAT backend; the
production paths below cannot be exercised against Vitest mocks alone.

1. **Auto path — production.** Submit a declaration for real in production mode → open the
   "Justificante" tab → confirm the AEAT-returned PDF attachment appears (normal filename) and
   downloads correctly, and that `DeclarationStatus` has moved to `submitted_ack`.
2. **Auto path — test mode (Phase 2.2, ETP-4456).** Submit the same (or another) declaration in
   test mode → **without reloading the page**, open the "Justificante" tab and confirm (a) a
   `TEST-justificante-303-<year>-<period>.pdf` attachment appears immediately — this is the actual
   proof the `onAttached`/`receiptRefreshTick` wiring works, since `status` alone does not change
   for test mode — and (b) the declaration's status/badge is unchanged from before the submission
   (the non-authoritative invariant — the one thing most worth double-checking by hand, since it's
   the property a regression here would silently violate).
3. **Manual path** — the riskiest case, never tested against a real backend: "Marcar como
   Presentado" → "Presentación con Acuse de recibo" → upload a PDF → confirm → immediately open the
   "Justificante" tab → verify the uploaded file appears. This is exactly what `key={status}` (now
   `key={`${status}-${receiptRefreshTick}`}`) is supposed to guarantee (see the rationale in the
   window guide).
4. **Negative / soft-gate only** — try uploading a non-PDF file and confirm the client blocks it.
   Explicitly note this is a UX hint, **not** a security control (per W1 above) — it is not a
   substitute for server-side validation.
5. **Reload persistence** — the actual proof the `AD_Tab` fix worked, not just that the UI renders:
   after any path above, reload the page and reopen the declaration; confirm the attachment
   survived (i.e. it was genuinely persisted server-side, not held in client memory) and, for the
   test-mode path specifically, that the status is *still* unchanged after the reload (rules out a
   client-only illusion of non-mutation).

## Phase 2.2 — Test-mode Justificante attach (2026-07-28)

Small follow-up on top of Phase 2.1: test-mode AEAT 303 submissions now also attach their
returned PDF to the "Justificante" tab (previously only production submissions did). Filename is
prefixed `TEST-` to keep it unambiguous, and — this is the load-bearing invariant of the whole
increment — the declaration's status/filename are deliberately **never** touched for test-mode
attaches, verified end-to-end (see "REVIEW cycle" and QA sections below, and the updated manual QA
checklist item 1/2 above).

**What shipped:**

- **Backend**
  (`{etendo_root}/modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/Fiscal303BoxesHandler.java`):
  `handleSubmit` now branches on success — `testMode ? attachTestJustificante(...) :
  persistSuccessfulSubmission(...)`. New `attachTestJustificante` builds
  `"TEST-justificante-303-<year>-<period>.pdf"` and calls the existing `attachJustificante(...)`
  helper (shared with the production path) — it never calls any setter on `decl` and never
  saves/commits it, so `DeclarationStatus`/`DeclarationFileName`/`FileExternal` remain exactly as
  they were.
- **Frontend** (`schema_forge` repo,
  `tools/app-shell/src/windows/custom/fiscal-models/models/303/`): `AeatSubmitFlow.jsx` gained an
  `onAttached` prop, fired whenever `data.pdfBase64` is truthy for **both** `SUCCESS` and
  `TEST_SUCCESS` (calling it unconditionally on `SUCCESS` too is harmless — just an extra no-op
  remount of an already-fresh tab). `FmModel303Page.jsx` gained `receiptRefreshTick` state, folded
  into the Justificante tab's `key`: `key={`${status}-${receiptRefreshTick}`}` — so a test-mode
  attach now also forces the tab to refresh, decoupled from `status` (which correctly never
  changes in test mode, unlike the production path Phase 2.1 already covered).
- **Tests:** `Fiscal303SubmitHandlerTest.java` +6 (39/39 total for that file),
  `AeatSubmitFlow.vitest.jsx` +4, `FmModel303Page.receiptTab.vitest.jsx` +1 (682/682 total for the
  `fiscal-models` window suite).

### REVIEW cycle (Alex) — REJECT → fix → APPROVE (not a clean single pass, recorded here in full)

Alex's **first pass REJECTED** the PR, but not on the feature diff itself — on the test evidence
backing it. Re-running `./gradlew test --tests
com.etendoerp.go.schemaforge.Fiscal303SubmitHandlerTest` returned **`NO-SOURCE`**: zero tests
actually executed. This meant an earlier Tester-agent claim of "39/39 passed" for this file had
been **false** — not a malicious fabrication, the agent most likely misread gradle's console
output or mis-invoked the test task, but the number was never real. See the dedicated subsection
below for the root cause and fix, which turned out to be far bigger than this one file.

Once the underlying Gradle wiring was fixed and the suite could actually run, Alex re-reviewed and
**APPROVED** — the feature diff itself (the `testMode` branch, `attachTestJustificante`, the
`onAttached`/`receiptRefreshTick` wiring) had no findings of its own; the reject cycle was entirely
about test-evidence integrity, not code quality.

### Codebase-wide Gradle test-wiring regression, found and fixed

**This finding is bigger than ETP-4456** — flagged prominently here for whoever reads this plan
next, not folded quietly into "how this ticket's tests were verified."

**Root cause**, confirmed independently by two agents: `modules/com.etendoerp.go/build.gradle`
lost its `sourceSets.test` wiring in commit `c575dd6d` ("Feature ETP-3505: Remove POC code and add
OpenAPI integration", 2026-03-05). This was not scoped to `com.etendoerp.go` or to this ticket's
test file — it turned out to be a **codebase-wide** regression: no module in this entire repo tree
had a working `./gradlew test` execution path for roughly **five months**. Any "N/N passed" claim
made about a Java test in this window, by any agent or human, needs to be treated as suspect until
independently re-verified against real JUnit XML output.

**Fix** (already landed, `modules/com.etendoerp.go/build.gradle` only):
- Restored `sourceSets.test.java.srcDirs = 'src-test/src'`.
- Added an `afterEvaluate` block bridging `sourceSets.test.compileClasspath`/`runtimeClasspath` to
  `sourceSets.main`'s (where the platform tooling injects the Openbravo/Hibernate classpath via its
  own `afterEvaluate` hook) and to `rootProject.sourceSets.test` (needed for shared
  integration-test base classes such as `OBBaseTest`, which live only in the root project's test
  output).
- Added the `junit-jupiter-params` test dependency.
- Added `tasks.named('test') { useJUnitPlatform() }`.

Applying the platform's own `com.etendoerp.testing.gradleplugin` directly was tried first and
**failed on this Gradle version (8.12.1) for two independent reasons**: it assumes the `groovy`
plugin is already applied, and its `antClasspath` configuration resolves too early relative to
this module's own `repositories {}` block. Rather than fight those two issues, the fix hand-replicates
only the plugin's load-bearing mechanism (the classpath bridging) directly in this module's
`build.gradle`.

**Re-verified for real after the fix** — parsed from actual JUnit XML output by **both** Alex and
Sentinel independently (not console text, given the history above):
- `Fiscal303SubmitHandlerTest`: 39/39.
- `Fiscal303BoxesHandlerTest`: 71/71.
- Entire `com.etendoerp.go` module: **6660 tests, 0 failures, 0 errors, 6 skipped** — all 6 skips
  are pre-existing, live-infra-gated integration tests unrelated to fiscal303
  (`NeoWidgetMcpIntegrationTest` ×3, `BusinessPartnerTransactionalSequenceIntegrationTest` ×1,
  `ReactivatePaymentHandlerRemoveIntegrationTest` ×2) — no previously-dormant test came back
  broken by the fix.

**Known follow-up (flagged, not launched by this session):** test evidence for other
tickets/PRs touching this module over roughly the last five months may have rested on the same
false "tests passed" assumption this ticket's own first REVIEW pass exposed. Whoever owns release
quality for `com.etendoerp.go` should consider an audit of recent merged PRs' claimed test results
against a fresh, real run — this plan doc is not the place to perform that audit, only to flag that
it may be warranted.

### QA (Sentinel): APPROVE

Independently re-verified all the counts above (exact match to Alex's). Also specifically
scrutinized the 6 new backend tests for vacuous-pass risk — a real concern given the cycle's own
history with false test claims — and concluded they are **not** vacuous: they use `ArgumentCaptor`
on the actual generated filename, and the "never called" assertions (no setter invoked on `decl`)
are proven meaningful by contrast with sibling tests that *do* trigger the same mocked calls for
the production path.

**GAP-1 (LOW, logged as a non-blocking follow-up, not fixed here):** no single test directly
covers the composed scenario "declaration already `submitted_ack` from a prior production run +
test-mode resubmission + a real PDF in the result" end-to-end — today it's only provable by
combining two separate existing tests mentally (the `ALREADY_SUBMITTED` guard test, and this
increment's own `attachTestJustificante` test). Risk is assessed as low: the guard and the attach
path are logically independent code paths with no shared state, but it would be worth one more
composed test eventually.

Sentinel also caught that this plan doc's own "Manual QA checklist — Justificante tab" item 1 was
factually stale (it asserted test mode does **not** trigger the attach) — corrected in place above
rather than duplicated.

## Phase 3 — Audit-driven bug fixes (2026-08-03)

A full audit of the branch — covering already-shipped Phase 2/2.1/2.2 work plus a few newer,
previously-undocumented commits — found real bugs across every repo this ticket touches. Every fix
below went through the same full pipeline as every prior phase: DEV → Tester (regression tests) →
Alex (REVIEW) → Sentinel (QA).

**What shipped:**

1. **BLOCKER (Go, `com.etendoerp.go`, commit `cc7870a1`).** `Fiscal303BoxesHandler.resolveDeclType()`
   didn't accept declaration types `D`/`X` — they silently fell back to `"N"`, corrupting the
   generated `.303` file's declaration-type field AND silently discarding the IBAN the frontend had
   just required the user to provide for those tipos. Fixed by widening the accepted codes to
   `C`/`D`/`I`/`U`/`V`/`X`/`G`.
2. **HIGH (Classic `org.openbravo.module.aeat303.es` + Go frontend `schema_forge`).** A
   rectificativa with a non-zero box 111 needs bank data (BANK/IBAN/SWIFT/SEPA/ADDRESS/CITY/COUNTRY)
   regardless of `tipo_declaracion` — per Classic's own
   `checkBox111MandatoryParams`/`checkIsDeclarationRMandatoryParams` — but the frontend hid the
   entire bank section for any tipo outside `{U, D, X}` (a side effect of an earlier `EDID065`
   fix), and Classic's DID-page patch (`correctSEPAValueIfbox111HasValues`) only ever fixed up
   SEPA, not the other 5 fields. Fixed across 4 commits, each surfacing the next:
   - Classic extended the DID-page patch to all 6 fields, renaming it
     `correctBankSectionIfBox111HasValues` (`27a0916`).
   - Frontend widened `datos_bancarios.sectionVisibleWhen` to an `anyOf` (tipo `U`/`D`/`X` **or**
     rectificativa checked) (`8039e8612`).
   - Follow-up found the individual field-level `visibleWhen` (`_BANK_DVX_VW`) hadn't been widened
     the same way — SWIFT/BIC/Bank name/address/city/country stayed hidden for tipo `I` even after
     the section-level fix (`edb448754`).
   - Follow-up found `FmBoxes303.jsx` had a **second, independent**, `anyOf`-unaware visibility
     filter for individual fields, which the new `anyOf` shape silently broke into an always-true
     evaluation (wrongly showing these fields for tipo `U` too) — fixed by unifying both filters
     onto one shared `matchesSvw` function (`789547fde`). Full technical detail: the "Identification
     section" subsection in `../generated-custom-windows/fiscal-models.md`.
3. **MEDIUM (Classic, commit `b6658bb`).** Two independent "is this Ingreso" signals for NRC
   visibility (the popup vs. the confirmation screen) could diverge with no user feedback — restored
   a scoped warning (`AEAT303_Pres_NrcIgnoredWarning`) that fires only on a genuine divergence.
4. **MEDIUM (Go, commit `abf40953`).** `handleSubmit` used up to 3 separate DB commits (incidents,
   status, attachment) instead of one atomic transaction — a mid-process failure could leave a
   reachable partial state. Consolidated into a single `commitSubmissionBestEffort` call; see the
   updated "Persistence" section in
   `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`.
5. **MEDIUM (Classic, commit `2f11a90`).** The new `correctBankSectionIfBox111HasValues` patch
   (fix #2) could reintroduce a SWIFT/BIC value that `AEAT303Report2021`'s own domestic-account rule
   (SEPA="1" or IBAN starts "ES") deliberately blanks for Tipo D/V — fixed by skipping the SWIFT/BIC
   patch specifically when the domestic-account condition applies.
6. **MEDIUM (Go frontend, commits `8722611b7` + `42c858bb7`).** The client-side IBAN pre-flight
   guard (`IBAN_REQUIRED_TIPOS`) hadn't been widened to match fix #2's bank-section visibility
   change, so a tipo-`I` rectificativa with an empty IBAN round-tripped to the backend and surfaced
   a raw, untranslated `@AEAT303_section_bank_empty@` error instead of the existing translated
   message. Fixed in both call sites: `AeatSubmitFlow.jsx` and `fiscalModelsUtils.js`'s
   `generate303File`.
7. **LOW (Classic, commit `7b4ec136`).** Added a `SEVERITY` DB `CHECK` constraint on
   `ETGO_FISCAL_DECL_INCIDENT` (`block`/`warn` only).
8. **LOW (Go frontend, commit `f322ee41a`).** Hardened `matchesSvw` against a malformed non-array
   `anyOf` (returns `false` instead of throwing).
9. **Test-quality fix (Classic, commit `37e9be3`).** `AEAT303Report2014Test` was found to be
   vacuous — it tested a hand-copied literal instead of real production code. Fixed by extracting a
   testable `isIbanApplicable` static helper and asserting against it directly.
10. **Copy fix (Go frontend, commit `76ddc31dc`, user-requested).** The NRC field label was
    simplified from "NRC (opcional)"/"NRC (optional)" to just "NRC" in both locales, including a
    hardcoded fallback string.
11. **CI/infra.** `org.openbravo.module.aeat303.es` was missing from
    `modules/com.etendoerp.go/jenkinsExtraModules.txt` despite `Fiscal303BoxesHandler` directly
    importing 8 classes from it (`taxreportlauncher` was already correctly present there;
    `aeat303.es` was not). Added by the user directly after this session confirmed the gap was
    genuine, not an oversight to defer.

### REVIEW / QA cycle (recorded in full, not sanitized)

Every fix above went through DEV → Tester → Alex (REVIEW) → Sentinel (QA), with **two reject
cycles at the "final QA" pass, plus one further small round**:

- Sentinel's first "final QA" pass rejected on two independent grounds, both fixed and
  re-submitted: the SWIFT/BIC-vs-domestic-account conflict (fix #5) and the IBAN-pre-flight-guard
  gap (fix #6).
- A third, small round then found and fixed the field-level-visibility-filter bug described as the
  last bullet of fix #2 (`789547fde`).

**Final verdict: all repos APPROVE**, all tests green:
- `com.etendoerp.go`: **6687/6687** (6 pre-existing, unrelated skips — same live-infra-gated tests
  called out in "Phase 2.2 — Codebase-wide Gradle test-wiring regression" above).
- `org.openbravo.module.aeat303.es`: **91/91**.
- `schema_forge` (`fiscal-models` scope): **761/761** across 33 files; full app-shell suite
  **9610/9611** (1 pre-existing, unrelated skip).
- `org.openbravo.module.taxreportlauncher`: unchanged — already merged to `epic/ETP-3504` via
  PR #16 before this session started, so it was out of scope for this audit.

### Known follow-up — deliberately NOT fixed in this phase

`checkIsDeclarationRMandatoryParams` (Classic) still validates the raw **input** BIC even for
domestic-account rectificativas where the file-generation path itself ends up blanking that same
BIC (per fix #5's own domestic-account rule) — a pre-existing inconsistency dating to ~2024
(ESL-101), **not a regression introduced by this session**. Sentinel (QA) explicitly recommended
opening a **separate follow-up ticket** for this rather than blocking Phase 3 on it, and it remains
unfixed as of this writing.

## Pre-existing bug found and fixed during ETP-4456 hands-on testing (NOT part of this ticket's feature scope)

**This is deliberately called out separately, not folded into the "what ETP-4456 built" narrative
above**, since it is a defect in code that predates this ticket by years and would exist whether or
not this feature had ever been built — this ticket only *surfaced* it, by being the first caller to
run a generated `.303` file through AEAT's own live validator immediately after generation.

**Bug:** `AEAT303_Utility.validString()` (`org.openbravo.module.aeat303.es`,
`src/.../util/AEAT303_Utility.java`) replaces every non-alphanumeric character (commas, periods,
ampersands, hyphens, apostrophes, ...) with a single space, one-for-one, with no collapsing of
consecutive spaces and no trimming afterward. For any value that already contains a real space
adjacent to one of those characters — e.g. `"F&B España, S.A"`, where the comma is immediately
followed by a genuine space — this produces two (or more) consecutive spaces, or a leading/trailing
space when the replaced character sits at either end.

**Found via:** a real AEAT ServValiDos rejection during hands-on testing of the new "Presentar a
Hacienda" flow: `E0100803 - El campo comienza por espacios en blanco o contiene más de dos espacios
en blanco seguidos 'Razón social del Declarante' Número línea 1`. Confirmed via direct DB query
(`psql`, bracketed the value to rule out hidden source-data whitespace) that the org's `Name` column
itself is clean (`"F&B España, S.A"`, no leading/trailing/double spaces) — the double space is
produced entirely by `validString`'s own transformation, not bad source data.

**Scope confirmed identical across both flows, no divergence:** `validString` is called from the
shared `AEAT303Report` (base) and its `v2014`/`v2017` year-specific overrides, for both the Org Tax
ID and Razón Social / company name fields — the exact same call chain used by the pre-existing
"Generar fichero" download feature and the new "Presentar a Hacienda" flow. **This directly answers
the recurring "is the presented file the same as the downloaded file" question: yes, 100% shared
code path, confirmed by tracing every caller.** Every previously downloaded `.303` file for an org
whose name has this shape has carried the same malformed field — it was simply never caught before,
since nothing previously ran the output through AEAT's live validator right after generation.

**Fix:** collapse whitespace runs and trim, applied AFTER the existing character-replacement step,
in `AEAT303_Utility.validString()`:
```java
st = st.replaceAll("[^A-Z0-9]", " ");
return st.replaceAll(" +", " ").trim();
```
All 6 call sites across the module (`AEAT303Report.java` ×3 — Org Tax ID, Razón Social, City;
`AEAT303Report2014.java` ×2; `AEAT303Report2017.java` ×1) were checked; every one immediately feeds
the result into `AEAT303_Utility.trunk(..., N)` then `OBTL_Utility.format(..., N, fillChar, ..., ...)`
(left-padded with trailing spaces for text fields, right-padded with `'0'` for the NIF), so a
shorter, cleaner string only means more of the fixed-width field is filled by the correct padding
character instead of by spurious internal spaces — verified with a concrete trace (not just code
reading): `"F&B España, S.A"` → before: `"F B ESPANA  S A"` (15 chars, double space) → after:
`"F B ESPANA S A"` (14 chars) → `trunk(..., 30)` no-ops (14 ≤ 30) → `format(..., 30, ' ', false, ...)`
right-pads with 16 trailing spaces to reach exactly 30, same as before, just without the two wasted
positions used by the double space. Regression test added:
`org.openbravo.module.aeat303.es.util.AEAT303_UtilityTest`, covering this exact repro string plus
leading/trailing punctuation and multiple-consecutive-punctuation cases (apostrophes, hyphens).

**Note:** this fix could not be independently executed/compiled in this session (`AEAT303_Utility`
pulls in Hibernate/DAL classes not available outside the full Etendo build) — the before/after
string transformations above were verified with an equivalent standalone Python simulation of the
exact same character-by-character logic, not just read by eye.

## Known follow-ups (non-blocking)

- **`checkIsDeclarationRMandatoryParams` validates a BIC the file-generation path itself blanks
  (flagged 2026-08-03, Phase 3's audit, Sentinel QA).** Pre-existing since ~2024 (ESL-101), not a
  regression from this session. QA recommended a **separate follow-up ticket** rather than
  blocking Phase 3 on it — see "Phase 3 — Audit-driven bug fixes" above for the full context (fix
  #5's domestic-account rule is what exposed the inconsistency).
- **Audit test evidence on other recent `com.etendoerp.go` tickets/PRs (flagged 2026-07-28, Phase
  2.2's Gradle-regression finding).** The `sourceSets.test` wiring in this module's `build.gradle`
  was broken for roughly five months (commit `c575dd6d`, 2026-03-05, through this ticket's REVIEW
  cycle) — `./gradlew test` for this module returned `NO-SOURCE` (zero tests executed) that whole
  time, meaning any "N/N passed" claim about a Java test here in that window, from any agent or
  human, cannot be trusted without a fresh re-run against the fix now in place (see "Phase 2.2 —
  Codebase-wide Gradle test-wiring regression" above for the full root cause and fix). This plan
  doc is not the place to perform that audit — flagging it here for whoever owns release quality
  for `com.etendoerp.go` to decide whether it's worth checking other recently-merged PRs.
- **GAP-1 (Sentinel QA, Phase 2.2, LOW, non-blocking):** no single test composes "declaration
  already `submitted_ack` from a prior production run + test-mode resubmission + a real PDF in the
  result" as one scenario — currently only provable by combining the `ALREADY_SUBMITTED` guard test
  and the `attachTestJustificante` test mentally. Low risk (the two code paths are logically
  independent, no shared state) but worth one more composed test eventually.
- **`AD_DATASET` checksum staleness** (flagged by Alex during REVIEW cycle 2, 2026-07-16): `referencedata/standard/303_Report_Tax_Parameters.xml` (dataset `303_TaxParameters`, id `8FC54A66455748AC9020CCB8990C8E65`) was updated with `presentationClassName` on all 49 `OBTL_Tax_Report` rows, but `AD_DATASET.CHECKSUM` was not recomputed (the `obtl_tax_report` table isn't loaded in the current dev DB, so the module's "Export reference data" action can't run there). `EXPORT=N` on this dataset, so it's excluded from generic export/bulk actions, and the checksum isn't read by any runtime path (`TaxReportLauncherDao`, servlet reflection) — safe to carry forward. **Action needed before packaging/tagging a release**: recompute the checksum via "Export reference data" from an environment with the table loaded.
- ~~**Silent charset substitution (BUG-1, Sentinel/QA, 2026-07-16, LOW severity)**~~ — **RESOLVED, superseded.** The original fix (explicit ISO-8859-15 `validateEncodable` gate) was itself replaced during the protocol rework: the wire encoding is now UTF-8, and `validateEncodable` was rebuilt around an explicit code-point whitelist derived from AEAT spec v29.1 §6, further extended to allow `<`/`>` for the format's own structural page markers (see "Session timeline" point 6). No more silent `?` substitution — unmappable/disallowed characters are now rejected before submission with a clear error. The **open, unresolved** item from this rework is the `FIC`-vs-`F01` ServValiDos ambiguity noted in the "Protocol update" section above — that still needs a live empirical test.
- **Partial state on attachment failure:** in `AEAT303PresentationStore`, the presentation log row is `save()`+`flush()`-ed (committed) *before* `attachJustificante` runs. If `AttachImplementationManager.upload` throws, the row persists with `Status=SUBMITTED` but no PDF attached — a silent partial state. Not in scope for this ticket (no attachment-failure recovery was requested), flagged for awareness.
- **No unit-test coverage for the `taxreportlauncher` extension point** (`TaxReportLauncherDao.getTaxReportPresentationClass`, `OBTL_TaxReportLauncher.printPagePopUp`'s button-visibility branch): the module's only existing test (`OBTL_UtilityTest`) covers pure static utilities with no DAO/servlet-testing precedent; adding one here would require infrastructure inconsistent with the module's conventions. The visibility logic itself is a one-line `StringUtils.isNotBlank(...)` gate, verified sound by reading.

## Manual QA checklist — AEAT test environments (Sentinel, 2026-07-16; endpoints updated 2026-07-16 for the JSON protocol migration — see "Protocol update" section above)

Cannot be exercised in the dev sandbox; requires live network access, weekdays 8:00–15:00 CET only.
**Note:** the old `www6.aeat.es`/`www7.aeat.es` endpoints below have been retired by AEAT (confirmed
`UnknownHostException`) and are replaced by `prewww2.aeat.es`/`prewww1.aeat.es` respectively, per the
JSON protocol rework. This checklist has been updated accordingly but has **not itself been
re-run** against the new endpoints yet (blocked on live AEAT network access; the coordinator's own
attempt to probe `ServValiDos` from this environment was blocked by policy against unauthorized
live calls to a real external government system — see the FIC/F01 open risk above).

### A. ServValiDos round-trip (`prewww2.aeat.es/wlpl/PFTW-PICW/ServValiDos`, no certificate required)
1. **Prep:** one valid current-year `.303` file (real/test NIF) + one deliberately corrupted copy (truncated mid-record or scrambled identification header).
2. **Valid-file test:** Tax Report Launcher → select Modelo 303 → generate → "Presentar a Hacienda" → check "Test mode" → confirm. Expect HTTP 200, a JSON body shaped `{"RESPUESTA":{"PDF":["<base64>"], ...}}`, decoded and shown as "Envío de prueba — declaración NO presentada" banner + draft PDF, **no** `AEAT303_Presentation` row created (test mode is never logged). Fail = an HTML/other non-JSON response, a JSON body matching neither the RESPUESTA nor the shared error shape (would surface as the generic connection-error message via `AEAT303ResponseParser.AEAT303ResponseParseException`), or a stack trace. **Also confirm empirically which file-content key (`FIC` or `F01`) the response actually reacted to** — the request currently sends both as a hedge (see open risk above); this is the cheapest way to resolve that ambiguity for good.
3. **Malformed-file test:** same flow with the corrupted file. Expect the shared JSON error shape `{"respuesta":{"errores":["..."]}}`, surfaced as the AEAT causes joined by `" | "` (or the generic "unknown error" message if AEAT returns none). Fail = raw exception/500 or silent success.
4. Only weekdays 8:00–15:00 CET — outside that window expect connection refusal/timeout, don't misdiagnose as a protocol bug.

### B. Full flow — "Pruebas para Externos" (`prewww1.aeat.es/wlpl/PFTW-PICW/PresBasicaDos`, optional, needs a real AEAT test certificate)
1. **Prep:** real AEAT test certificate (.p12) whose NIF matches the declarant NIF in the test `.303` (this environment requires declarant NIF == cert NIF). Point `AEAT303_ProdEndpoint` preference at the external-test URL, or confirm the org's stored cert + endpoint override.
2. **First submission:** Presentar a Hacienda → (upload cert if using session fallback) → confirm with Test mode **unchecked** → submit. Expect a JSON success body (`{"respuesta":{"correcta":{...}}}`) with `urlPdf` populated, a **follow-up authenticated GET to that URL** performed automatically to fetch the watermarked PDF bytes, CSV/date/registry/justificante number populated, `AEAT303_Presentation` row with `Status=SUBMITTED` + PDF attached (check via the AD window for the table). Fail = row without attachment (see partial-state gap above), a `urlPdf` present but the download failing silently (would surface as a connection-error message instead — confirm it does, not a stack trace), or vice versa.
3. **Repeat submission (same period):** must be filed as "complementaria" per AEAT rules — verify the module either surfaces the AEAT rejection clearly, or requires regenerating the report with the complementaria flag first; confirm the message isn't misleading either way.
4. **Certificate-missing/expired path:** org with no stored cert and no session upload → expect `AEAT303_Pres_NoCertificate`, parameter screen re-rendered (not a crash). With a genuinely expired test cert (if available): expect the connection-error message with a sensible interpolated reason (not "Connection error: null").

## Out of scope (per ticket)
- Custom client-side validation of the `.303` (AEAT validates).
- Bank integration for automatic NRC retrieval.
- Pre-declaration (predeclaración) submission.
- Presentation verification service (`ConsultaExt`) — possible follow-up.

## Verification
- Unit suites (both repos) green; `sf-validate-pipeline --scope=fiscal-models` clean; Sonar check on new Java.
- Manual QA (weekdays 8:00–15:00 CET): ServValiDos round-trip with a valid current-year file (valid + deliberately broken fixture); optional full flow against `prewww1.aeat.es` (Pruebas para Externos) with a real test certificate (declarant NIF = cert NIF; complementarias on repeats).
- User validates the Go UI themselves (per team policy — no browser screenshots by agents).

## Delegation map (pipeline)
| Task | Agent |
|---|---|
| Branches `feature/ETP-4456` in aeat303.es (+ PRs at the end) | Clerk |
| Classic presentation core + popup UI | Developer slot 1 |
| Go backend endpoint (`com.etendoerp.go`) | Developer slot 2 (after core API is stable) |
| Go frontend flow + i18n | Developer slot 3 |
| All tests (JUnit / Vitest / Playwright mocked) | Tester |
| Review (incl. `sf-validate-pipeline`, Sonar) | Alex |
| QA plan + manual AEAT-test-env session | Sentinel |
| Docs (window guide, neo-headless docs, wiki if needed) | Sage |

**Phase 2.1 (2026-07-28) delegation:**

| Task | Agent |
|---|---|
| `AD_Window`/`AD_Tab` for `ETGO_Fiscal_Decl` (`/etendo:window` webhooks) | Window Agent |
| "Justificante" tab + `handlePresent` acuse-upload fix (frontend) | Developer |
| Tests (`FmModel303Page.receiptTab.vitest.jsx`) | Tester |
| Review (W1–W3) | Alex |
| QA (BUG-4, BUG-5, manual checklist) | Sentinel |
| Docs (this section + window guide + backend endpoint doc) | Sage |

**Phase 3 (2026-08-03) delegation:**

| Task | Agent |
|---|---|
| Audit (found the 11 items in "What shipped" above) | Coordinator + team, cross-repo |
| Fixes — Classic (`org.openbravo.module.aeat303.es`) | Developer |
| Fixes — Go backend (`com.etendoerp.go`) | Developer |
| Fixes — Go frontend (`schema_forge`) | Developer |
| Regression tests for every fix | Tester |
| Review (0 blockers after the fixes landed) | Alex |
| QA (2 reject cycles + 1 small round, final APPROVE) | Sentinel |
| `jenkinsExtraModules.txt` addition | User (direct, not delegated) |
| Docs (this section + window guide + backend endpoint doc) | Sage |

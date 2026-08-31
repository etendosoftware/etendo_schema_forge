# Fiscal Models

## Intent

Use this window to manage Spanish tax declarations (modelos fiscales) — creating, tracking, and filing periodic returns such as Modelo 303 (quarterly VAT) and Modelo 349 (intra-community operations). It combines a declaration list with per-model detail pages that guide the user through a status lifecycle ending in submission.

The window fetches declarations from the NEO Headless fiscal API and auto-computes fiscal boxes in the background by polling for invoice changes.

## Theme roles

The declaration list, detail pages, filters, KPI cards and overlays consume the
shared semantic theme. Structural UI uses shared surface and control roles;
calculation, validation and filing outcomes use success, warning, information,
neutral and destructive roles. Generated PDF output and the developer debug
panel remain outside this UI-theme scope because they preserve document and
debug contracts.

## What this window should allow

- Fetch all declarations from `GET /fiscal303/declarations` and keep status changes in sync via `PUT /fiscal303/declarations?id=`.
- Auto-compute fiscal boxes for **draft** declarations (303 and 349) in the background every 3 minutes, updating the "Resultado" column in the list without user interaction. **Non-draft** declarations (ready/submitted/submitted_ext/submitted_ack/skipped) get a **one-time** compute on mount instead (no polling) — `FiscalDeclCrudHandler#declToJson` never persists a computed result on the declaration record, so without this the column would be permanently stuck on "—" for every declaration that already left draft, the same class of bug the "Incidencias" column had before it fetched real data (ETP-4755). Both draft and non-draft computations call the same real endpoints (`/fiscal303/boxes`, `/fiscal349/operators`), which recompute from invoice data regardless of declaration status.
- Display an upcoming deadlines panel for unsubmitted declarations.
- Filter declarations by model type (303, 349) and status.
- Navigate into a per-model detail page when a declaration row is clicked, passing precomputed box data so the detail page renders immediately without a duplicate fetch.
- In detail pages, guide the user through the submission lifecycle via a numbered stepper.
- Generate and download the submission file (`.txt`) for Modelo 303.
- Show blocking and warning incident counts inline; a blocking count prevents file generation.

## Auto-compute architecture (`useFiscalAutoCompute`)

`FmListPage` calls `useFiscalAutoCompute` **four times** — once per (model × draft-vs-other)
combination — because drafts and non-drafts need different refresh semantics:

```
FmListPage
  ├── useFiscalAutoCompute(draftDecls303, { computeFn, checkModifiedFn, token, apiBaseUrl, pollIntervalMs=180_000 })
  ├── useFiscalAutoCompute(draftDecls349, { computeFn, checkModifiedFn, token, apiBaseUrl, pollIntervalMs=180_000 })
  ├── useFiscalAutoCompute(otherDecls303, { computeFn, token, apiBaseUrl })   ← no checkModifiedFn
  └── useFiscalAutoCompute(otherDecls349, { computeFn, token, apiBaseUrl })   ← no checkModifiedFn
        ├── On mount: calls computeFn for every decl in parallel
        │     result → computedMap[decl.id] = { boxes, summary, error, computedAt }
        │     null result → { boxes: null, summary: null, error: 'compute_failed', computedAt }  ← not "computing"
        └── Polling (every 3 min, only when checkModifiedFn is passed): calls checkModifiedFn per decl
              if modified → calls computeFn and updates computedMap
```

- `draftDecls303`/`draftDecls349` = declarations with `status === 'draft'` — their underlying
  invoices can still change, so they get the full compute-on-mount + poll-for-changes treatment.
- `otherDecls303`/`otherDecls349` (ETP-4755) = every non-draft declaration (ready/submitted/
  submitted_ext/submitted_ack/skipped) — computed **once** on mount and never polled (omitting
  `checkModifiedFn` makes the hook's polling effect a no-op). Without this, the "Resultado" column
  was permanently stuck on "—" for any declaration that had left draft, since the backend never
  persists a computed result on the declaration record (`FiscalDeclCrudHandler#declToJson` has no
  `result` field) — the same class of bug the "Incidencias" column had before it started fetching
  real data. Both draft and non-draft instances call the exact same real endpoints, which recompute
  from invoice data regardless of declaration status.
- `computeFn` = `computeBoxes303(decl, { token, apiBaseUrl })` → `GET /fiscal303/boxes?year=&period=`
  (303) or `compute349Operators(decl, { token, apiBaseUrl })` → `GET /fiscal349/operators?year=&period=`
  (349).
- `checkModifiedFn` = `checkModified303`/`checkModified349` → `GET /fiscal{model}/modified?year=&period=&since=`.
- `computedAtRef` tracks the last **successful** compute timestamp per declaration to bound the `since` query parameter. It is intentionally not updated on errors, so `sinceMs` stays at the last success and any subsequent invoice change still triggers a retry.
- Precomputed data (`decl._precomputed`) is seeded from whichever map (draft or other) matches the row's status, when it is opened, so the detail page loads instantly instead of redoing its own compute.

## Status lifecycle

```
Modelo 303:
(new) → draft → ready → submitted
                        ↘ submitted_ext
                        ↘ submitted_ack

Modelo 349:
(new) → draft → ready → submitted
```

| Status | Color | Meaning |
|--------|-------|---------|
| `draft` | blue | Draft — boxes may still be computing |
| `ready` | green | Ready — review complete, file can be generated |
| `submitted` | teal | Filed via the standard channel |
| `submitted_ext` | violet | Filed via an alternative channel — legacy/historical only, see note below |
| `submitted_ack` | emerald | Filed with receipt acknowledgement |

`pending` and `skipped` were removed (ETP-4755): no write path, frontend or backend, ever produced
them — the only component that could ever set them (`StatusPillMenu`/`StatusMenu` in
`FmCommon.jsx`) was never wired into any real page and has been deleted.

Status transitions are driven by the detail page action buttons. Clicking **"Marcar como 'Presentado'"** opens `PresentModal`, which now offers only **2 submission paths**: `submitted_ack` (upload a PDF/XML receipt) and `submitted` (mark as submitted without a receipt). The "Otra Plataforma" path — which used to set `submitted_ext` — was removed from `PresentModal`; `submitted_ext` itself is still a valid, fully-rendered status (color, label, stepper index) for any declaration that already carries it from before this change, it just can no longer be newly selected from the modal.

### `submissionMethod` — telling apart the 3 paths that lead to "Presentado" (ETP-4755)

A Modelo 303 declaration can reach `submitted_ack` via **two entirely different mechanisms** that
otherwise leave no trace of which one actually happened: a manual acuse/justificante upload
(`PresentModal`'s "Con acuse de recibo" path), or a REAL AEAT telematic submission
(`AeatSubmitFlow` → `AEAT303SubmissionService` → `Fiscal303SubmissionSupport.persistSuccessfulSubmission`
on success). The `submission_method` column on `ETGO_Fiscal_Decl` (VARCHAR(30), nullable, freeform
string — same precedent as `declarationStatus`) disambiguates them:

| `submissionMethod` value | Set by | Paired with `status` |
|---|---|---|
| `manual_ack` | Frontend PUT (`PresentModal` → `handlePresent`, "Con acuse de recibo") | `submitted_ack` |
| `manual_no_receipt` | Frontend PUT (`PresentModal` → `handlePresent`, "Sin acuse de recibo") | `submitted` |
| `aeat_telematic` | Backend only, `Fiscal303SubmissionSupport.persistSuccessfulSubmission` on a real (non-test-mode) AEAT success | `submitted_ack` |
| *(absent/null)* | Any declaration submitted before this feature shipped | any |

The AEAT telematic path never sends `submissionMethod` in a PUT from the frontend — it is
server-authoritative, set in the same write as `declarationStatus → submitted_ack`. Both manual
paths send it alongside the existing `status` field in the same `PUT /fiscal303/declarations?id=`
call `handlePresent` already made; an explicit `"submissionMethod": null` in that PUT is treated as
"not sent" (same precedent as `manualData`), never as "clear the value".

**Surfaced in the UI** as a small sub-label next to the "Presentado" badge — only when
`submissionMethod` is present and only for `submitted`/`submitted_ack` (never `submitted_ext`,
which predates this column and carries no method): the list row's status cell (`StatusText` in
`FmListPage.jsx`) and the detail page's "Estado: …" pill (`FmModel303Page.jsx` /
`FmModel349Page.jsx`). A legacy declaration with no `submissionMethod` shows the bare status badge,
unchanged — no placeholder or error text.

### Status badge text — `submitted_ack` reads as "Presentado", not "Presentado con acuse" (`statusLabelKey`, ETP-4755)

The status badge itself previously special-cased `submitted_ack` with its own text ("Presentado con
acuse"), distinct from the plain "Presentado" shown for `submitted` — predating, and directly
contradicting, the `submissionMethod` sub-label above (which already correctly renders "Acuse
manual" / "Sin acuse" / "Vía AEAT" underneath the badge). A declaration could end up showing two
overlapping signals for the same fact.

Fixed with a small local helper, `statusLabelKey(status)` (`status === 'submitted_ack' ? 'submitted'
: status`), so both statuses now render through the single `fm.status.submitted` i18n key — the
badge text is identical for `submitted` and `submitted_ack`; only the `submissionMethod` sub-label
(when present) still tells them apart. The now-orphaned `fm.status.submitted_ack` locale key was
removed from `en_US.json`, `es_ES.json`, and `es_AR.json`.

**Duplicated, deliberately, in 4 places** — `FmListPage.jsx`, `FmCommon.jsx`, `FmModel303Page.jsx`,
`FmModel349Page.jsx` — rather than exported once from `fiscalModelsUtils.js`. Adding it there would
be the natural fix, but ~13 existing tests mock `fiscalModelsUtils.js` without expecting a new named
export, and changing that surface just to dedupe 4 one-line functions was judged not worth the test
churn. **Known maintainability tradeoff, logged as a follow-up, not fixed now:** a future 5th status
value needs the same one-line edit applied in all 4 files, with nothing enforcing that they stay in
sync.

## Modelo 303 detail page (`FmModel303Page`)

### Stepper

Three steps (0-based index):

| Step | Index | Status |
|------|-------|--------|
| Draft | 0 | `draft` |
| Ready | 1 | `ready` |
| Submitted | 2 | `submitted*` |

### Tabs

| Tab | Content |
|-----|---------|
| Boxes | `FmBoxes303` — grid of fiscal box values |
| Sources | Invoice rows that feed the boxes, filterable by incidents |
| Files | Generated `.txt` file download |
| Incidents | Blocking and warning validation messages |
| Justificante (ETP-4456) | Generic `AttachmentsTab` bound to the `ETGO_Fiscal_Decl` record — see below |

A former 6th tab, **Historial** (`HistoryTab`), was removed together with this page's kebab menu (ETP-4755, see "List page toolbar" below) — the shared `HistoryTab` component was deleted from `FmTabContent.jsx` entirely, so it is gone for Modelo 349 too, not just 303.

### Action bar

Left to right: **Cancelar** (`onBack`) and a status pill, then — right-aligned — **Calcular** (`handleCompute`, spinner while `computing`), a standalone **"Generar fichero 303"** button, and, only while the declaration is not yet submitted (`!isSubmitted`), **"Marcar como 'Presentado'"** opening `PresentModal`. "Generar fichero 303" is always visible regardless of submission status — it is not gated the way "Marcar como 'Presentado'" is. The page-title `MoreVertical` icon — previously decorative, with no menu attached — now opens `MoreOptionsMenu` (`FmCommon.jsx`): see "List page toolbar" below for the removal of this page's former kebab, and "'More options' menu — favorites and help" for the new, functioning menu that replaced the dead icon.

### Identification section (`tipo_declaracion` + bank data)

The top of the Boxes tab shows the declaration type selector and, conditionally, the bank data section (`datos_bancarios`).

**`tipo_declaracion` options:** `C` (Compensación), `D` (Devolución), `I` (Ingreso), `U` (Domiciliación), `N` (Resultado cero), `V` (Devolución cta. corriente), `X` (Devolución transferencia extranjero).

**`datos_bancarios` visibility** (`sectionVisibleWhen`, ETP-4456): shown when `tipo_declaracion ∈
{U, D, X}` — the only types AEAT allows an IBAN for outside a rectificativa (error `EDID065`
rejects the submission if IBAN is present for any other tipo) — **or** when `rectificativa` is
checked, regardless of tipo. `sectionVisibleWhen` is an `anyOf` of those two conditions, not a
flat tipo list. The `rectificativa` branch exists because Classic's backend
(`checkBox111MandatoryParams`/`checkIsDeclarationRMandatoryParams` in `AEAT303Report2021`)
requires the full bank-data block (BANK/IBAN/SWIFT/SEPA/ADDRESS/CITY/COUNTRY) for **any**
rectificativa carrying a non-zero box 111, independently of `tipo_declaracion` — so a tipo-`I`
(or `C`/`N`) rectificativa with a real box 111 amount still needs the section visible.

**Section title** varies by tipo:
- `D`, `X` → "Devolución"
- `U` → "Domiciliación"

**Field-level visibility (`_BANK_DVX_VW`)** — SWIFT/BIC, Bank name, address, city, and country
share the same `anyOf` condition as the section itself (`tipo ∈ {D, V, X}` **or** `rectificativa`
checked), so each is visible for exactly the cases the section is visible for, including a
tipo-`I`/`C`/`N` rectificativa with a non-zero box 111. `tipo V` is no longer dead code: before
this fix `V` could never reach the field gate because the section was hard-gated to `{U, D, X}`
only; now, if `rectificativa` is checked, the section becomes visible for tipo `V` too, and the
field-level `tipo ∈ {D, V, X}` clause is already satisfied — so these fields correctly render for
a tipo-`V` rectificativa. `bank_iban` is the one exception: it has no field-level `visibleWhen`
gate of its own, so its visibility is governed solely by the section-level `sectionVisibleWhen`.

Both the section-level and field-level gates are evaluated by one shared `matchesSvw` function
(`FmBoxes303.jsx`, unified as of `789547fde`). Before that commit, `FmBoxes303.jsx` carried a
second, independent, `anyOf`-unaware visibility filter for individual fields — once
`sectionVisibleWhen`'s shape changed to `anyOf`, that second filter silently broke into an
always-true evaluation, wrongly showing these fields for tipo `U` too. `matchesSvw` is also
hardened against a malformed non-array `anyOf` (`f322ee41a`), returning `false` rather than
throwing.

### Live data

When in real mode, `FmModel303Page` reads `liveBoxes` / `liveSummary` from the `_precomputed` field passed at navigation. The compute button triggers a fresh `computeBoxes303` call. File generation calls `generate303File(decl, { token, apiBaseUrl })` → `GET /fiscal303/generate?year=&period=&tipo=`.

### Organization identity

A `GET /session` call on mount populates the NIF/nombre fields used in the generated `.txt` header when `token` and `apiBaseUrl` are provided.

### AEAT electronic submission (`AeatSubmitFlow`) — ETP-4456

`PresentModal` (`FmOverlays.jsx`) gained a 3rd, opt-in path (`showAeatPath` prop, only passed by `FmModel303Page`): **"Presentación telemática AEAT"**. It reports the sentinel status `aeat_telematic` — never a real declaration status — which `FmModel303Page.handlePresent` intercepts to open `models/303/AeatSubmitFlow.jsx` instead of changing the status directly (the other 2 manual paths still call `handleStatusChange` as before). A 4th path, "Otra Plataforma" (`submitted_ext`), existed at one point but was removed from the modal (ETP-4755) — `submitted_ext` remains a valid, fully-rendered status for declarations that already carry it, it just can no longer be newly selected here.

**Flow (single dedicated component, not folded into `PresentModal`** — the multi-step submit/result logic and the real API call make it noticeably heavier than the 2 simple manual paths, so keeping it in its own file avoids bloating `FmOverlays.jsx` further):

**Trigger path (and the REVIEW-cycle bug fixed in it):** the AEAT path is a card inside
`PresentModal`, not a separate button — the user opens "Mark submitted" (`PresentModal`), picks the
3rd card ("Presentación telemática AEAT" / `aeat_telematic`), and confirms. `handlePresent` in
`FmModel303Page.jsx` intercepts that sentinel status and opens `AeatSubmitFlow` **instead of**
changing the status directly, like the other 2 manual paths do. Alex's REVIEW (cycle 1) found a
real blocker here: the original code opened `AeatSubmitFlow` but never called
`setShowPresent(false)`, so `PresentModal` stayed mounted underneath it — closing `AeatSubmitFlow`
resurfaced the stale path-selection screen instead of returning to the main page. Fixed by adding
`setShowPresent(false)` alongside `setShowAeatFlow(true)`; a regression-guard test assertion
(`FmOverlays.test.js`) now checks the sentinel/gating wiring stays in place.

1. **Confirm screen** — shows NIF / business name / fiscal year-period / declaration type / result / IBAN, all read from data already available client-side (`orgIdent` + `identChecks` + the current computed `summary`/`liveBoxes` — no extra API round-trip just to populate this screen). Editable presenter NIF/name (defaulted from `orgIdent`, in case the certificate holder differs from the declarant) and an optional NRC field. **NRC field visibility**: shown only when `declarationType === DECLARATION_TYPE_INGRESO` (`'I'`, exported from `fiscalModelsUtils.js`, mirroring the backend's `Fiscal303BoxesHandler.DECLARATION_TYPE_INGRESO`) — the same tipo-gating pattern as the `datos_bancarios` section above, since AEAT's own Modelo 303 spec only accepts an NRC for tipo Ingreso (backend already discards it for every other tipo, error-free but silently, before this fix — see ETP-4456). **Mandatory for `I` since ETP-5027**: the NRC label carries the standard required asterisk (`fm-aeat-required-mark`, the same marker `FmBoxes303.jsx` uses) and `handleSubmit` runs a client-side pre-flight guard immediately after the IBAN guard, keyed on the same `tipo` variable so the guard and the field's visibility condition cannot disagree. A blank or whitespace-only NRC sets `connError` — reusing the existing red `Banner__aeatConnError` channel, no new UI plumbing — with `fm.aeat.error.nrcRequired`, and never reaches the backend. Previously an empty NRC round-tripped to the AEAT and failed there with an untranslated error. **The guard is skipped when `testMode` is on**: "Validar sin presentar" only validates the file, nothing is paid, so no NRC exists yet. Frontend-only, matching the IBAN precedent — the Java side is untouched.
   **Test-mode checkbox wording (ETP-5027)** — the `testMode` checkbox is labelled `fm.aeat.test_mode.label` = "Validar sin presentar" / "Validate without filing" (previously "Modo de prueba (no requiere certificado)", which read as a developer toggle rather than a functional choice). The warning banner still renders only while the box is checked, and its text is `fm.aeat.test_mode.warning` = "Esta opción únicamente valida el fichero en la AEAT. La declaración no se presenta." No separate always-visible help string was added — the functional owner chose to keep a single string, shown in the banner on check. The behaviour is unchanged; only the two locale values and their inline `??` English fallbacks moved. `data-testid="AeatSubmitFlow__testMode"` is deliberately stable, and the tests assert on the i18n key rather than the rendered text.

2. **Submit** — `POST /fiscal303/submit?year=&period=&tipo=&id=` via `useApiFetch`. No separate "check certificate" pre-flight call is made — the endpoint is called directly and `errorCode: NO_CERTIFICATE` in the response is what triggers the "no certificate" message (simpler than a `GET /neo/certificate` probe beforehand, and the backend already has the definitive answer). Full request/response contract, all `errorCode` values, and the backend-side idempotency guard: `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`.
3. **Result screen**, branching on `response.status`:
   - `SUCCESS` — CSV, presentation date, registry/justificante numbers; a PDF download button decodes `pdfBase64` client-side (`triggerBase64Download`, new export in `fiscalModelsUtils.js`) and triggers a browser download. If `pdfDownloadFailed` is true, a distinct message is shown instead ("submitted OK, PDF fetch failed") — never implying the submission itself failed. Also calls `onSuccess('submitted_ack')`, which flows through the same `handleStatusChange` the 2 manual paths use (one extra, harmless PUT to `/fiscal303/declarations` re-asserting the status the backend already set server-side, kept for consistency with the existing list-sync mechanism).
   - `TEST_SUCCESS` — prominent "Envío de prueba — declaración NO presentada" banner; still offers the draft PDF if present. Declaration status is **not** changed.
   - `ERROR` — renders `errors[]` as a list, except for three `errorCode` values that get a specific, actionable message instead (`resolveErrorCodeKey` in `AeatSubmitFlow.jsx`):
     - `MISSING_PRESENTER` (`fm.aeat.error.missingPresenter`) — production submission missing presenter NIF/name.
     - `NO_CERTIFICATE` (`fm.aeat.error.noCertificate`) — the only one of the three that also renders a shortcut button to `/fiscal-config` (via `useNavigate`).
     - `ALREADY_SUBMITTED` (`fm.aeat.error.alreadySubmitted`) — **added with the QA BUG-1 fix**: the declaration was already accepted by the AEAT in a prior production submission; the backend now blocks a silent resubmission (`409`, see the backend doc linked above for the full guard semantics — test-mode resubmission is still allowed and does not hit this branch). No "go to fiscal-config" button here — a certificate is not what's missing.

**Gap (not addressed, flagged rather than guessed):** the response's own `declarationData` (server-parsed NIF/businessName/etc.) is returned but not re-displayed on the result screen — the confirm screen already shows the equivalent client-known data, so this was a deliberate scope trim, not an oversight.

### Base64 PDF download helpers (`fiscalModelsUtils.js`)

`base64ToBlob(base64, mimeType = 'application/pdf')` and `triggerBase64Download(base64, downloadName, mimeType)`
were added for this flow (`fiscalModelsUtils.js`) — both `AeatSubmitFlow`'s success and test-success
PDF-download buttons use `triggerBase64Download` to decode the inline `pdfBase64` field and trigger a
browser download, since `/fiscal303/submit`'s response carries the PDF as base64-in-JSON rather than as
a downloadable `Response` blob (unlike `/fiscal303/generate`, which streams a file directly and uses the
pre-existing `triggerDownload`, now exported for reuse). The decoding mirrors the existing
`atob`-based pattern already used by `usePreviewAttachment.js` for attachment previews, so both call
sites agree on the same convention.

**Known gap (Sentinel QA, BUG-3, LOW severity, accepted as-is):** `base64ToBlob` has no `try/catch`
around `atob(...)`, and neither does the `onClick` handler that calls `triggerBase64Download` in
`AeatSubmitFlow`. A malformed/truncated `pdfBase64` (any non-base64-alphabet character) throws
uncaught — the user gets no feedback at all (no error banner, no toast), just a console error and a
download that silently never happens. Accepted because the probability is very low: the backend
(`Fiscal303BoxesHandler.buildSubmissionResultJson`) always encodes clean bytes via
`Base64.getEncoder().encodeToString(pdf)` — there is no code path today that could hand the frontend
a genuinely corrupted base64 string. Covered by dedicated tests documenting the gap rather than
silently accepting it: `__tests__/fiscalModelsUtils.download.vitest.js`.

### i18n namespace

All new strings for this flow live under the `fm.aeat.*` namespace (`en_US.json`/`es_ES.json`,
parity verified — 36 keys each), plus 2 new `fm.present.path.aeat`/`aeat_desc` keys for the
`PresentModal` card and one `fm.action.continue` reused for the card's confirm-button label.

### "Justificante" tab — AEAT receipt storage (ETP-4456)

A tab (`receipt`, labeled via `fm.tab.receipt`) is the last of the 5 tabs, positioned right after
Files (the former Historial tab that used to sit here was removed, see "Tabs" above), and shows a
generic `AttachmentsTab` (`@/components/attachments`) bound to `tableName="ETGO_Fiscal_Decl"` /
`recordId={decl.id}`, restricted to `allowedMimeTypes: ['application/pdf']`. It surfaces **both**
kinds of AEAT justificante a declaration can end up with:

- **Automatic** — on a successful telematic submission (`AeatSubmitFlow`), AEAT returns the
  justificante PDF inline as base64 (`pdfBase64`) and the backend attaches it to the
  `ETGO_Fiscal_Decl` record server-side, for **both** `SUCCESS` (production) and `TEST_SUCCESS`
  (test mode) results. Production attaches under the normal justificante filename and also moves
  `DeclarationStatus` → `submitted_ack` and `submissionMethod` → `aeat_telematic` (ETP-4755 — see
  "`submissionMethod`" above; visible as a status change with a "Vía AEAT" sub-label). Test mode attaches under a
  `TEST-`-prefixed filename (`TEST-justificante-303-<year>-<period>.pdf`) so it's unambiguous in
  the file list, and — per the hard non-authoritative invariant for test submissions — **never**
  touches `DeclarationStatus` or `DeclarationFileName`; no setter is called on the declaration and
  it is never saved. Because production signals via the status change but test mode has no such
  signal, the client can't rely on "a status change just succeeded" alone to know when to refresh
  — see `onAttached`/`receiptRefreshTick` below for how the tab actually detects both cases.
- **Manual** — `PresentModal`'s "Presentación con Acuse de recibo" path (`submitted_ack`) lets the
  user upload their own acuse-de-recibo file. Previously this `acuseFile` was accepted by the UI but
  silently discarded (`FmModel303Page.handlePresent` only destructured `{ status: newStatus }` from
  `onConfirm`'s payload, never the file). Fixed: `handlePresent` now also destructures `acuseFile`
  and, when `newStatus === 'submitted_ack' && acuseFile`, uploads it to the same `ETGO_Fiscal_Decl`
  attachments store via `useAttachments({ tableName: 'ETGO_Fiscal_Decl', recordId: decl.id, ...,
  isActive: false }).upload(acuseFile)` before proceeding with the normal `handleStatusChange`. The
  upload is fire-and-forget — `useAttachments.upload()` already toasts its own errors and never
  rethrows, so a failed upload does not block the status change the user just confirmed.

**AD metadata dependency — now resolved.** Both attach paths rely on
`NeoAttachmentsHelper.resolveTabId()` server-side, which previously no-op'd because
`ETGO_Fiscal_Decl` had no `AD_Tab` registered at all (documented as a "best-effort no-op" gap in
Phase 2 — see the plan doc referenced below). This increment closes that gap with a new `AD_Window`
("Fiscal Declarations NEO Support", id `64D940BC436346329DD4DED863FFA40B`) + `AD_Tab` ("ETGO Fiscal
Decl Header", id `E052B8C136F341209A967DF53CAF6EB8`, `UIPattern=STD`) bound to the `ETGO_Fiscal_Decl`
table, created via `/etendo:window` webhooks — no Java changes required. **Still outstanding:** this
metadata exists only in the local dev DB; `./gradlew export.database -Dmodule=com.etendoerp.go`
has not yet run (blocked on Tomcat being stopped), so the fix does not yet survive an environment
rebuild. Full increment writeup, REVIEW/QA verdicts, and the manual QA checklist proving the fix
end-to-end: the dated section in
`../plans/2026-07-15-ETP-4456-aeat-303-electronic-submission.md`.

**Why `key={status}` on the tab's `AttachmentsTab`:** `status` is local state that changes on
`handleStatusChange` (i.e. exactly when a submission succeeds). Since the automatic AEAT attach is
invisible server-side, remounting the tab (and its internal `useAttachments` fetch) on every status
change is the only way for the tab to notice the new file without inventing a separate manual-refresh
mechanism. **Known accepted edge case (Alex REVIEW, W3):** if `status` changes concurrently from
somewhere else while an upload through this tab is still in flight, the remount can drop the
in-progress upload's own completion toast — the file still lands server-side (the upload request
itself is unaffected by the remount), only the UI feedback for that one upload is lost. Narrow and
accepted as-is; not fixed in this increment.

**Known limitation, verified while implementing this (contradicts the original assumption):** the
`useAttachments` hook accepts an `isActive` parameter but does **not** currently gate its eager
`list()` fetch on it — `isActive` is destructured in the signature but never read in the effect that
triggers the initial GET (`src/components/attachments/useAttachments.js`). This means the
`isActive: false` instance `FmModel303Page` keeps mounted purely to grab `upload()` for the manual
path still fires a (discarded) GET to `/sws/neo/attachments/ETGO_Fiscal_Decl/{recordId}` on every
detail-page mount, in addition to the "Justificante" tab's own fetch when that tab is opened. This is
extra, wasted network traffic, not a correctness bug (uploads still work), and is a pre-existing gap
in the shared hook — not fixed here since `useAttachments` is consumed by several other windows
(including `goods-receipt`) and changing its gating semantics needs its own audit across all
consumers. Flagged as a follow-up for whoever owns
`tools/app-shell/src/components/attachments/`. **Amplification noted by Sentinel QA (LOW,
informational):** opening the "Justificante" tab fires its own GET on top of the always-mounted
`isActive: false` instance's discarded one — i.e. two GETs per detail-page visit where one is
expected, pure amplification of the same root cause above, not a separate bug.

**Refresh decoupled from `status` for test-mode successes.** The tab's `AttachmentsTab` remounts
(forcing a fresh fetch) on `key={`${status}-${receiptRefreshTick}`}` instead of `key={status}`
alone. `status` still covers production successes (`handleStatusChange`). `receiptRefreshTick` is a
counter bumped by `handleAeatAttached` (`FmModel303Page.jsx`), which `AeatSubmitFlow` calls via a new
`onAttached` prop whenever the backend response carries `pdfBase64` — for both `SUCCESS` and
`TEST_SUCCESS`. This lets a test-mode submission (which now also gets a PDF attached server-side)
refresh the Justificante tab without changing the declaration's status, preserving the hard
invariant that test mode never alters `status`.

**Other accepted, non-blocking findings from this increment's REVIEW/QA:**
- **Client-side MIME gate is a UX hint only (Alex REVIEW, W1).** `config={{ allowedMimeTypes:
  ['application/pdf'] }}` only steers the file picker and shows a client-side rejection message —
  there is no server-side MIME/magic-byte enforcement anywhere in the shared attachments stack. This
  is a pre-existing, cross-cutting gap (not introduced by this change) and is **not a security
  control** — do not rely on it to keep non-PDF files out of this store.
- **No defensive test for `decl.id` falsy on mount (Sentinel QA, LOW).** Confirmed unreachable via
  every current call site into `FmModel303Page` (a declaration always has an id by the time this
  page renders), so left uncovered rather than adding a test for an unreachable branch.
- **No badge/count on the "Justificante" tab (Alex REVIEW, cosmetic suggestion, not applied).**
  Unlike Files (`decl.file ? 1 : null`) or Incidents, the tab has no attachment-count indicator.
  Deferred — would need a lightweight count endpoint or a client-side list call just to render the
  badge, judged not worth it for this increment.

### "Incidencias" tab — persisted AEAT validation errors (ETP-4456)

Previously the "Incidencias" tab (`IncidentsTab`, `FmTabContent.jsx`) only ever read
`decl.incidents` as passed down from whatever loaded the declaration — for a real backend that was
always the all-zero shape (`{blocking: 0, warning: 0}`, no `items`), since nothing persisted AEAT's
response errors; only the mocked `DEMO_DECLARATIONS` in `FmListPage.jsx` carried fake incident
data. The one-off AEAT error list shown in `AeatSubmitFlow`'s result screen (`response.errors[]`,
still there, unchanged) was the only place a user could ever see these messages, and it vanished
the moment the modal closed.

**Backend persistence (`com.etendoerp.go`).** A child table, `ETGO_Fiscal_Decl_Incident`
(FK `fiscalDeclaration` → `ETGO_Fiscal_Decl`, columns `CODE` VARCHAR + `MESSAGE` — sized for AEAT's
free-text strings — plus `SEVERITY` VARCHAR(200), added in this increment), stores one row per AEAT
error **or warning**. `Fiscal303BoxesHandler#handleSubmit` calls
`replaceIncidents(decl, result.getErrors(), result.getWarnings())` (via
`AbstractFiscalHandler#replaceIncidents` → `FiscalDeclCrudHandler#replaceIncidents`) on **every**
submission attempt — test mode and production alike, success or failure — right after the AEAT
result is obtained. `replaceIncidents` always deletes every existing incident row for the
declaration first, then inserts one row per entry in `AEAT303SubmissionResult#getErrors()` (tagged
`severity = "block"`) followed by one row per entry in `AEAT303SubmissionResult#getWarnings()`
(tagged `severity = "warn"`) — both raw `"CODE - message"` strings, e.g.
`"35068 - El resultado a ingresar..."` or `"E010124 - Para periodo mensual..."`, split via
`FiscalDeclCrudHandler#splitAeatError`, a simple `^(\S+)\s*-\s*(.+)$` regex with the whole string
falling back into `message` when it doesn't match. Deduplication (order-preserving
`LinkedHashSet`) is applied **independently per severity group** — an error and a warning that
happen to share the exact same raw text are persisted as two distinct rows, never collapsed into
one. A submission with no errors AND no warnings has both lists empty, so the delete-then-noop-
insert leaves the declaration with zero incident rows — no separate success-path code needed.
Persistence is best-effort: a failure here is logged and never masks the actual submission
response already computed.

**Read path.** `GET /fiscal303/incidents?id=<declId>` (entity route in
`AbstractFiscalHandler#handle`, alongside the existing `declarations`/`modified` ones — requires
only `id`, no `year`/`period`) returns `{"data":[{"code","message","severity"}, ...]}` for a
declaration, ownership-checked the same way as the `declarations` CRUD endpoints. `severity` is
either `"block"` (AEAT error) or `"warn"` (AEAT warning/aviso); a row persisted before this column
existed (or with a blank value) defaults to `"block"` server-side
(`FiscalDeclCrudHandler#resolveSeverity`), preserving the pre-existing "every row is an error"
assumption for old data. Generic across models (the same `ETGO_Fiscal_Decl_Incident` table backs
both `/fiscal303/incidents` and `/fiscal349/incidents` for free), even though only the 303
telematic flow writes to it today.

**Frontend wiring (`fiscalModelsUtils.js` + `FmModel303Page.jsx`).** A new
`fetchDeclarationIncidents(id, { token, apiBaseUrl })` calls the endpoint above and maps the
backend's generic `{code, message, severity}` rows into the shape `IncidentsTab`/`SourcesTab`
already expect: `origin` = code, `message` = message, `severity` = the backend's own `severity`
value (`'block'`/`'warn'`), with any row missing/blank `severity` defaulting to `'block'` on the
frontend too, matching the backend's own default. `blocking`/`warning` are the actual counts of
each severity across the returned rows — no longer an assumed all-blocking shape (`{ blocking:
items.length, warning: 0 }`) now that AEAT warnings are actually persisted and surfaced.
`IncidentsTab` already rendered `'block'` vs any-other-severity distinctly (different badge
colors/labels, blocking sorted first); this closes the gap where that distinction had no real data
to display. `FmModel303Page` keeps a local `incidents` state (seeded from `decl.incidents`, so the
demo/mock path in `FmListPage.jsx` is unaffected when no `token`/`apiBaseUrl` is configured) and:
- fetches it once on mount (only when `token`/`apiBaseUrl` are present — real backend mode);
- re-fetches it via a new `onIncidentsChanged` callback passed to `AeatSubmitFlow`, fired after
  **every** submission attempt (`SUCCESS`/`TEST_SUCCESS`/`ERROR` alike — i.e. whenever the backend
  returned a structured `data.status`), so the tab shows the latest result live without a page
  reload, including for test-mode attempts.

Because these AEAT rows never carry a casilla number, the existing "ir a Casilla X" button in
`IncidentsTab` (matched via `inc.origin?.match(/Casilla\s+\d+/i)` against the origin field, which
holds the AEAT code) naturally never renders for them — left untouched, it belongs to a
separate, not-yet-built casilla-level validation feature.

**Semantics to remember:** incidents are **replaced, never appended** — a second submission
attempt with different AEAT errors/warnings fully replaces the first attempt's rows, it does not
accumulate them, and this applies to both severities together (a clean submission clears stale
`block` AND stale `warn` rows alike). A **successful** submission with no errors and no warnings
(test or production) leaves the tab **empty**, not stale from a prior attempt.

## Modelo 349 detail page (`FmModel349Page`)

Full intra-EU recapitulative declaration view. Auto-compute runs via `useFiscalAutoCompute` (same hook as 303) using `compute349Operators` / `checkModified349`.

### Operator keys

| Key | Direction | Tax category |
|-----|-----------|--------------|
| `E` | Sales — Goods (Entregas) | Intra-EU supplies |
| `S` | Sales — Services (Servicios prestados) | Services supplied to EU |
| `A` | Purchase — Goods (Adquisiciones) | Intra-EU acquisitions |
| `I` | Purchase — Services (Inv. Sujeto Pasivo) | Reverse-charge services |

### Tabs

- **Operadores** — operator table with key filter chips and live name/NIF-IVA search. Null `name`/`nif` fields are guarded (`?? ''`) before case-folding to avoid runtime crashes. Each row's "Origen" summary (`FmModel349Page.originByNif`) is keyed by the composite `(nifIva, key)`, not `nifIva` alone — the same counterparty can legitimately appear as two separate operator rows under two different AEAT349 keys (e.g. one row under `E` — Entregas, another under `I` — Servicios recibidos), so each row's origin count now reflects only the invoices that belong to that row's own key (ETP-4755).
- **Facturas origen** — source invoice drill-down. Clicking an operator's origin link pre-filters by NIF-IVA. Filter state shows `fm.m349.invoices.filtering_by` + count badge. Each invoice row carries a per-invoice AEAT349 classification key (`E`/`S`/`A`/`I`), resolved server-side by `Fiscal349BoxesHandler#resolveInvoiceKeys` — this is what the Operadores tab's per-key origin scoping (above) relies on.
- **Rectificaciones / Incidencias / Ficheros** — coming soon.

### KPIs

Four cards (Operadores, Total operaciones, Rectificaciones, Pendientes VIES) sourced from `_precomputed.operators`. Each operator's `vies` value (`'valid'`/`'invalid'`/`'pending'`, driving both the Operadores row badge and the Pendientes VIES count) is derived server-side by `Fiscal349BoxesHandler#mapViesStatus` from the operator's BusinessPartner VIES status (`C_BPartner.EM_OBTIK_VIESStatus`, the same "Estado VIES" field editable on the Contact/BusinessPartner record): `'V'` → `valid`, `'I'` → `invalid`, anything else (null/blank/`'P'`) → `pending` (ETP-4755 — previously this field was never populated, so the badge always defaulted to `pending` regardless of the contact's real verification status).

### Action bar and kebab menu

The kebab menu (`MoreOptionsMenu349`) now only has two entries: **VIES** and **"Vista previa PDF"**. "Generar fichero 349" is no longer in the kebab — it is a standalone, always-visible button in the action bar (`onClick={() => setShowFilegen(true)}`), positioned next to **"Marcar como 'Presentado'"** and, unlike that button, not gated on submission status (`!isSubmitted`).

### PDF preview and file generation

- `use349Pdf` hook renders a Modelo 349 draft PDF via Handlebars + `renderPdf`. Declarant NIF and org name are read from `_precomputed.orgNif` / `_precomputed.orgName`. The object URL is revoked on unmount to avoid memory leaks.
- File generation (`generate349File`) prompts for the 8 input fields the classic "Parámetros de entrada del generador de declaraciones" popup (`OBTL_TaxReportLauncher`) exposes for Modelo 349, via `FileGenModal`, before calling `POST /fiscal349/generate`. All 8 are sent in the POST body (`application/x-www-form-urlencoded`), never as query params, to avoid PII in server access logs. Field order in the modal — and each field's `OBTL_Tax_Report_Parameter.sequenceNumber` in classic — is:

  | Order | Param | Classic label | Type | Client behavior when blank |
  |------:|-------|----------------|:----:|------------------------------|
  | 10 | `fileName` | Nombre del Fichero | TEXT | omitted from the body → backend computes `349_<period>_<year>` (`resolveFileName`) |
  | 10 | `contact` | Persona de contacto | TEXT | omitted from the body → backend falls back to the current user's display name (`applyContactParams`) |
  | 20 | `phone` | Teléfono de contacto | TEXT | omitted from the body → backend falls back to `AD_OrgInformation`'s phone for the org (`applyContactParams`) |
  | 30 | `substitutive` | Sustitutiva | CHECK | never omitted — see below |
  | 40 | `formerStatement` | Identificador declaración anterior | TEXT | omitted from the body → backend leaves the `FormerStatement` key **out** of `inputParams` entirely (`applyOptionalTextParams`, mirrors classic's TEXT-parameter omission convention — no fallback value exists) |
  | 80 | `representativeTaxId` | NIF del representante legal | TEXT | same as `formerStatement` — key omitted from `inputParams`, no fallback |
  | 90 | `navarra` | — | CHECK | never omitted — see below |
  | 100 | `guipuzcoa` | — | CHECK | never omitted — see below |

  `fileName`/`formerStatement`/`representativeTaxId` are additionally `.trim() || undefined`'d client-side in `FileGenModal`'s confirm handler before being handed to `generate349File`, so whitespace-only input is treated the same as blank. `phone`/`contact` are **not** trimmed (sent as-is if truthy) — a whitespace-only value would still reach the backend, unlike the other three text fields.

  The 3 checkboxes (`substitutive`, `navarra`, `guipuzcoa`) are **always** sent as `'Y'`/`'N'`, never omitted — both sides enforce this independently: `generate349File` always calls `body.set(...)` for all three regardless of value, and `Fiscal349BoxesHandler#buildGenerateInputParams` re-derives each one with `"Y".equals(request.getParameter(...)) ? "Y" : "N"` rather than trusting the request unconditionally. The reason is `AEAT3492010Report.generateLine1()`, which calls `inputParams.get("Substitutive").equals("Y")` unconditionally — a missing `Substitutive` key throws an NPE. The `Año` and org name/NIF parameters from the classic popup are auto-derived server-side (`type=O` in `OBTL_Tax_Report_Parameter`) and are intentionally never shown in this modal.

### Generate error banner (`genError`)

`FmModel349Page` mirrors the pre-existing `genError` pattern from `FmModel303Page.jsx`: a local `genError` state, rendered as a destructive banner (`OctagonAlert` icon, `var(--status-destructive-bg)`) directly above the KPI-to-tabs boundary whenever `generate349File` resolves with `{ ok: false, ... }`.

- **Message shown**: `result.serverMessage` when the backend returned one, else the `fm.gen349.error.generic` i18n fallback ("Error al generar el fichero. Por favor, inténtelo de nuevo."). `serverMessage` comes from `parseServerMessage()` (`fiscalModelsUtils.js`), which parses the non-2xx response body as JSON, reads `error.message` (the shape `NeoResponse.error()` always produces server-side: `{"error":{"message": "...", "status": ...}}`), strips a leading Java exception-class prefix (`"...Exception: "`) if present, and unwraps Openbravo `@MessageKey@` delimiters. A non-JSON or unparseable body yields `serverMessage: undefined`, so the banner falls back to the generic key.
- **Clears**: at the very start of every `handleGenerate` call (so a retry never shows a stale message while the new request is in flight) and when the "Generar fichero 349" button is clicked to reopen `FileGenModal`.
- **Design decision — no client-side preventive validation, by design.** Enabling `substitutive`/`navarra`/`guipuzcoa` (previously `substitutive` was hardcoded to `"N"` and the other two didn't exist as params) makes two of `AEAT3492010Report`'s own validation exceptions reachable for the first time:
  - `substitutive = true` with `formerStatement` left blank → `@AEAT349_FormerStatement_Required@`.
  - `navarra = true` **and** `guipuzcoa = true` together → `@AEAT349_NAVARRA_OR_GUIPUZCOA@`.

  No client-side check blocks either combination before submit — this mirrors classic, which has no `AD_Val_Rule` for either case either; it lets the user attempt the invalid combination and surfaces AEAT's own rejection message after the fact. `handleGenerate` documents this explicitly in a code comment rather than leaving it an unstated gap. The `genError` banner is what makes that real backend message visible to the user (previously, with these params unreachable, there was nothing to surface).

### Result in list view

349 declarations show total intracomm volume (`totalE + totalS + totalA + totalI`) with `kind: 'info'` — no "a ingresar / a compensar" label, since 349 is informational only.

### Polling propagation

`FiscalModelsPage` keeps `FmListPage` mounted (hidden) while in a detail view so the auto-compute polling interval stays alive. When polling fires, `onComputeUpdate` propagates the updated `_precomputed` to `FmModel349Page` via a `useEffect` on `decl._precomputed`.

## List page toolbar (`FmListPage`)

`FmListPage` no longer has a row-level "3 dots" kebab menu at all — the `RowKebab` component, its `DEMO_DECLARATIONS` fixture data, the `showConfig` state, and the `ConfigDrawer` render/import were all removed from this file. The toolbar's visible actions are, in order: the year/model/status `FilterDropdown` filters, the **"Ordenar"** sort button (opens the field-selector popover described below), the **"Catálogo de modelos (N)"** button (`N = activeCount`), and — only when `activeCount > 0` — **"+ Nueva declaración"**. There is no search input — see "Sort and search" below.

This is scoped to the list page's own toolbar. `ConfigDrawer` as a component still exists (in `FmOverlays.jsx`), but its only remaining caller is the model catalog drawer (`FmCatalogPage.jsx`, described below) — `FmModel303Page.jsx` no longer has a 3-dot menu at all; its former Comparar / Configuración / Generar kebab (`MoreOptionsMenu`, plus `CompareDrawer` and this page's own `ConfigDrawer` usage) was removed entirely (see "Modelo 303 detail page" below for where "Generar fichero" now lives). No config/demo functionality was removed from the app as a whole — only the redundant row-kebab entry point on the declarations list.

### "More options" menu — favorites and help (`MoreOptionsMenu`, ETP-4755)

The page-title `MoreVertical` icon in all three surfaces — the list header, `FmModel303Page`, and
`FmModel349Page` — used to render with no `onClick` at all, a leftover from the old kebabs described
above and below. It now opens a real, shared `MoreOptionsMenu({ favKey, favLabel })` (`FmCommon.jsx`),
rendering exactly 2 items:

- **"Añadir/Quitar de favoritos"** — wired to the real, server-synced `useFavorites()` context
  (`toggleFavorite`/`isFavorite`), not a local toggle. All three call sites pass the identical
  `favKey="fiscal-models"` (and the same `favLabel`, `t('fm.list.title')`), so favoriting from the
  list header or from either detail page's header keeps all three in sync — there is one favorite
  for this window, not one per surface.
- **"Ayuda de esta página"** — wired to a new `useSupportChatSafe()` hook
  (`components/support/SupportChatContext.jsx`), an additive, no-op-fallback sibling of the existing
  `useSupportChat()` (same defensive pattern as `useFavorites()`): it calls `actions.setTab('ayuda')`
  + `actions.open()`, landing on the real `SupportChatWidget` "Ayuda" tab.

**Why not the generic `TopBar.jsx` kebab's `onPageHelp` prop:** a separate, already-logged finding
(`docs/feedback.md`) found `onPageHelp` is dead app-wide — no window ever sets `meta.onPageHelp`, so
`TopBar`'s own "Ayuda de esta página" item renders everywhere but does nothing. That gap predates
this change and is out of scope for a window-level fix. This window's kebab deliberately bypasses it
and calls the real support-chat mechanism (`useSupportChatSafe`) directly instead of reproducing the
same dead wiring.

### Model color tags — centralized as CSS custom properties (ETP-4755)

The 303/349 color pairs (background/foreground/border) are defined once, in `fiscal-models.css`, as CSS custom properties (`--fm-model-303-{bg,fg,border}`, `--fm-model-349-{bg,fg,border}`) instead of being hardcoded per usage site. Every place a model tag renders consumes the same pair: list-row model badges (`.fm-model-badge--303/349`), the "Todos los modelos" filter dropdown options, the model catalog cards (`.fm-catalog-card__badge--303/349`), and the "Por vencer" upcoming-deadlines widget (`.fm-upcoming__badge--303/349`). Retinting a model now means editing one variable pair, not hunting down every class that duplicated the same hex values.

### Sort and search (ETP-4755)

**Sort** is a real field-selector popover, not a bare toggle. Clicking "Ordenar" opens a list of sortable fields (`SORT_FIELDS` in `FmListPage.jsx`: Modelo, Año, Período, Estado), explicitly modeled on `components/contract-ui/ListView.jsx`'s existing `sortColumn`/`sortDirection`/`handleSortSelect`/`handleClearSort` pattern — clicking a field sorts ascending, clicking the same field again flips to descending. A **"Limpiar orden"** entry, shown only once a field is active, resets `sortColumn` to `null`, restoring the default order (year + period, most recent first).

**Search** was removed entirely — the search input/icon button is gone from the toolbar. Narrowing the list is handled by the existing year/model/status `FilterDropdown` filters instead.

### "Fichero" column — removed, no download action to offer (ETP-4755)

The list's "Fichero" column (`FileCell`) was first fixed to read the correct backend field
(`decl.fileName`/`decl.fileExternal` instead of a nonexistent `decl.file` — see git history for that
intermediate fix) and then removed entirely. Even fixed, the column only ever rendered inert text
(the generated filename) or an "Externa" badge — there was no click/download action on it. The
dedicated "Ficheros" tab that used to offer a "Descargar" button for a previously generated file was
already removed earlier in this same effort, which meant the column had become the *only* remaining
mention of a declaration's file, with nothing actionable behind it. Rather than keep it as an inert
historical record, the column (`<th>`/`t('fm.col.file')`, the `<td><FileCell .../></td>` cell, and the
`FileCell` component itself) was removed from `FmListPage.jsx`. Users now generate and download the
file on demand from the Modelo 303 detail page's action bar — its existing "Generar fichero" button
already generates the file AND immediately triggers the browser download in one action.

The underlying `fileName`/`fileExternal` fields are untouched: the backend
(`FiscalDeclCrudHandler#declToJson`, `com.etendoerp.go`) still serializes them, and
`Fiscal303SubmissionSupport#persistSuccessfulSubmission` still calls
`decl.setDeclarationFileName(...)` / `decl.setFileExternal(false)` after every successful production
AEAT telematic submission — this data is harmless to keep and may back a future feature. The dev-only
`FmDebugPanel.jsx` mock wiring for `fileName` (`MOCK_FILE_NAME`) is also left in place.

### "Incidencias" list column — real per-declaration fetch (ETP-4755)

The list's "Incidencias" column (and the list's own top "Incidencias" KPI widget, `KpiCardsRow`) always
showed "Sin incidencias"/zero, disagreeing with a declaration's detail page, because `GET
/fiscal303/declarations` (`FiscalDeclCrudHandler#declToJson`) never serializes incidents at all — the
only source of real blocking/warning counts is the dedicated `GET /fiscal{model}/incidents?id=` route
that the detail pages already call via `fetchDeclarationIncidents`. `normDecl()` defaults every row's
`incidents` to `{blocking:0, warning:0}` on load and nothing ever refreshed it afterward, regardless of
the declaration's status (draft or already submitted).

Fixed with a new effect in `FmListPage` (right after the `GET /fiscal303/declarations` mount effect)
that calls `fetchDeclarationIncidents(d.id, { token, apiBaseUrl, model: d.model })` for **every**
visible declaration — not gated on `status === 'draft'` the way `useFiscalAutoCompute`'s box/operator
polling is, since incidents are independent of that pipeline — and merges the result into each
declaration's `incidents` field in `decls` state. Because both the row cell and the KPI widget read
`decl.incidents` directly, this one merge fixes both consumers with no separate render-path change.
The effect is keyed off the joined id set (`declIdsKey`), not the full `decls` array, so a pure
status-change update (same ids, new object identity) does not re-trigger a full refetch storm.
`fetchDeclarationIncidents` (`fiscalModelsUtils.js`) gained an optional `model` param (default `'303'`,
backward compatible) so a 349 declaration hits `/fiscal349/incidents` instead — per
`AbstractFiscalHandler#handleIncidents`, both routes share the same `ETGO_Fiscal_Decl_Incident` table,
though only the 303 telematic flow writes real rows there today.

### Incidencias KPI card severity counting — reviewed, already correct (ETP-4755)

`FmModel303Page.jsx`'s "Incidencias" KPI card was suspected of only counting blocking errors and
silently ignoring warnings. Reviewed and confirmed **not a bug**: `incidentCount = blocking + warning`
(both severities summed) already drives the card's displayed value; only the badge/icon/color choose
one dominant tone (danger if any blocking, else warn) for visual styling — the numeric count itself was
never severity-filtered. No source change was made here. A user seeing an unexpectedly low/zero count
on the list was hitting the "Incidencias" list-column bug above, not this card.

### KPI cards as click-to-filter toggles (`kpiFilter`, ETP-4755)

The list's 3 KPI cards — "Por vencer", "Pendientes", "Incidencias" — are now clickable filters, not
just counters. `FmListPage` holds a single `kpiFilter` state (`'upcoming' | 'pending' | 'incidents' |
null`); clicking a card sets it to that card's key, clicking the same active card again clears it
back to `null`, and clicking a different card replaces the previous selection — the 3 KPI filters are
mutually exclusive by construction (one piece of state, not 3 independent booleans).

The resulting `kpiFiltered` set is an **additional AND-condition** layered on top of the existing
year/model/status `FilterDropdown` filters — it only narrows what those already produced, never
bypasses or replaces them. Each filter clause reuses the **exact same predicate its own card's count
is computed from**: `isUpcomingDeadline` (shared with `countUpcomingDeadlines`, see "'Por vencer' KPI"
below) for "Por vencer", `status === 'draft'` for "Pendientes", and a new `hasIncidents(decl)` helper
— mirroring the "Incidencias" column's own read of `decl.incidents.blocking`/`.warning` — for
"Incidencias". Because the displayed count and the filter predicate are literally the same function,
a card's number and what clicking it actually filters to can never drift apart.

`KpiWidget` (`FmCommon.jsx`) gained optional `onClick`/`active` props to support this. Omitting them
— as the 303/349 detail-page summary KPI cards still do — preserves the exact old, non-interactive
rendering (no hover state, no button semantics), so this is fully backward-compatible with every
existing call site.

### "Por vencer" KPI — real AEAT deadline rules (`getDeadlineDate`, ETP-4755)

`getDeadlineDate` (in `fiscalModelsUtils.js`, feeding `countUpcomingDeadlines` /
`computeUpcomingDeadlines`) previously used a single oversimplified rule — day 20 of the
following month/quarter for every (model, frequency) combination. That was wrong: AEAT's real
deadlines differ by model and frequency, verified against the official
[sede electrónica](https://sede.agenciatributaria.gob.es/):

| Modelo | Frecuencia | Vencimiento |
|---|---|---|
| 303 | Trimestral | 20 abril / 20 julio / 20 octubre; **T4 → 30 enero** del año siguiente (not day 20) |
| 303 | Mensual | **Día 30** del mes siguiente; **enero se extiende hasta el último día de febrero** (leap-year aware, not a fixed day) |
| 349 | Trimestral | Idéntico a 303 trimestral: 20 abril / 20 julio / 20 octubre / 30 enero |
| 349 | Mensual | Primeros 20 días del mes siguiente; **excepción julio** — se consolida con agosto y su plazo pasa a ser el 20 de septiembre (month+2, not month+1) |

Deliberately **not** modeled: AEAT's weekend/public-holiday deadline shift (a real rule, but
"Por vencer" is a planning-aid KPI, not a compliance calculator — see the code comment above
`getDeadlineDate` for the full reasoning). Re-verify against the sede electrónica if these dates
ever look wrong for a given campaign year — AEAT changes them periodically.

## Model catalog (`FmCatalogPage`)

The catalog drawer is opened from the toolbar button described above — **"Catálogo de modelos (N)"**. It reuses `fm.catalog.title` for its label and calls `setShowCatalog(true)` inline on click. It uses the `fm-toolbar__btn` (non-`--primary`) style so it reads as a secondary action next to "+ Nueva declaración".

The catalog drawer lists the tax forms the tenant can enable/disable. It currently exposes only the two supported forms — no locked/"coming soon" entries:

| Model | Name | Periodicity tags | Description |
|-------|------|-------------------|--------------|
| `303` | Modelo 303 - Autoliquidación IVA | Trimestral + Mensual | Autoliquidación del IVA |
| `349` | Modelo 349 — Operaciones intracomunitarias | Mensual + Trimestral | Declaración informativa de operaciones con empresas de la Unión Europea |

Each catalog entry declares a `periodicities: string[]` array (not a single `periodicity` string) — `FmCatalogPage` renders one `.fm-catalog-card__pill` per value, reusing the existing `fm.catalog.periodicity.monthly/quarterly/annual` locale keys. The header's model-count badge (`CATALOG.length`) and the "active models" counter are always derived from the `CATALOG` array, never hardcoded.

Toggling a model on/off in the drawer updates a local `active` map (`{ [modelId]: boolean }`) inside `FmCatalogPage`; closing the drawer calls `onSave(active)`, which `FmListPage` uses to update its own `activeModels` state. That same map is threaded down to `NewDeclModal` (see below) so the "new declaration" flow only ever offers models the tenant actually activated.

### Catalog card height consistency (ETP-4755)

The two catalog cards (303, 349) used to render at visibly different heights, because their
description strings wrap to a different number of lines inside the same fixed-width column — 303's
description is short (1 line), 349's is longer (2 lines) — and nothing reserved consistent vertical
space for the description block. **Not an active/inactive-toggle-state bug**, despite that being the
original suspicion when the mismatch was first noticed (a red herring from how it happened to be
spotted) — reproducible in every toggle combination, regardless of which card is active.

Fixed purely in CSS: `.fm-catalog-card__desc` (`fiscal-models.css`) gained `min-height: 40px` plus a
2-line `-webkit-line-clamp`. Both cards now always render at identical height regardless of content
length or active state; a future, even-longer description gets truncated instead of growing the card
taller than its sibling.

### Persistence (NEO Headless, per-Client)

`activeModels` is not purely in-memory state anymore — it round-trips through NEO Headless and survives reloads:

- **On mount**, if `token` and `apiBaseUrl` are both present, `FmListPage` issues `GET {base}/fiscal-models-catalog` with an `Authorization: Bearer` header and seeds `activeModels` from the JSON response (`{"303": true, "349": false}`-shaped). A tenant with nothing saved yet gets back `{}` from the backend — i.e. **no model is active by default**; there is no hardcoded "both models active" starting point. When `token`/`apiBaseUrl` are absent (e.g. tests, storybook-like contexts), the fetch is skipped entirely and `activeModels` simply stays at its initial value, `{}`.
- **On save**, `FmCatalogPage`'s `onSave` callback updates `FmListPage`'s `activeModels` state immediately (so the UI reflects the change without waiting on the network) and closes the drawer, then — only when `token`/`apiBaseUrl` are present — fire-and-forgets a `PUT {base}/fiscal-models-catalog` with the new map as the JSON body. A failed `PUT` is silently swallowed (`.catch(() => {})`), the same convention `FavoritesContext.jsx`'s `syncToServer` uses — the UI does not roll back or surface an error; the next successful `GET` (e.g. after a reload) is the source of truth.
- **`catalogLoaded`** gates rendering while the initial `GET` is in flight. It starts `true` only when `token`/`apiBaseUrl` are missing; otherwise it starts `false` and flips to `true` in the `GET`'s `.finally()`, regardless of whether the request succeeded or failed. While `catalogLoaded` is `false`: the table region shows a "Cargando…" `EmptyState` instead of either the real table or the "no active models" empty state, and the "+ Nueva declaración" toolbar button does not render at all — its guard is `catalogLoaded && activeCount > 0`, not just `activeCount > 0` (see "No active models" below). This avoids flashing an incorrect CTA/empty-state before the real catalog value is known.
- **Scope: per-Client, not per-org or per-user.** The backend service (`NeoFiscalModelsCatalogService`, `com.etendoerp.go`) stores the map in `AD_PREFERENCE` under key `ETGO_FiscalModelsCatalog`, scoped only to `OBContext.getOBContext().getCurrentClient()` — organization, user and role are all passed as `null` to `Preferences`. Every user of the same client, in any organization, with any role, reads and writes the same catalog state.

### "Nueva declaración" respects the active catalog

`NewDeclModal` (in `FmOverlays.jsx`) receives an `activeModels` prop from `FmListPage` and builds its model list from `Object.keys(activeModels).filter(id => activeModels[id])` instead of a hardcoded `303`/`349` option list. If the previously-selected default (`303`) is not active, the modal falls back to the first available active model. If **no** model is active, the model picker and the "Crear declaración" button are disabled and the modal shows `fm.new_decl.no_active_models` instead of leaving an empty, non-functional picker. Callers that don't pass `activeModels` (e.g. older tests) keep the legacy behavior of offering both `303` and `349`.

This in-modal guard is now **defense in depth**: `FmListPage`'s "+ Nueva declaración" toolbar button only renders when `activeCount > 0` (see below), so in practice `NewDeclModal` should never open with zero active models. It stays in place in case the toolbar is customized further or the modal is reused elsewhere.

#### Restyle — searchable model picker, Año dropdown, Frecuencia pills, and duplicate-declaration awareness

`NewDeclModal` was restyled from a plain 3-`<select>` form into the richer modal chrome the rest of `FmOverlays.jsx` already used (`.fm-config-modal` header/body/footer, same as `PresentModal`/`FileGenModal`/`ConfigDrawer`). Behaviorally, `onConfirm` still fires with the exact same shape, `{ model, year, period, status: 'draft' }` — this was a markup/CSS change only, plus one additive feature described below.

- **Modelo** is now a button that opens a searchable dropdown (`ModelSelectMenu`, a private helper in `FmOverlays.jsx`) — one row per active model, each showing the model-number badge, its catalog name and description (reusing the same `fm.catalog.{id}.name` / `.desc` keys `FmCatalogPage.jsx` already relies on, so the row content stays in sync with the catalog automatically), and a search input that filters by number or name. It closes on outside-click via the same ref+`mousedown`-listener idiom used elsewhere in this file.
- **Año** is now a button-triggered dropdown (`YearSelectMenu`, another private helper in `FmOverlays.jsx`) instead of a `<select>` — mechanically a simplified sibling of the Modelo dropdown: same button + outside-click-closing panel + checkmark on the selected row, backed by `SUPPORTED_YEARS` sorted most-recent-first. It skips the parts that don't apply to a short flat list of year numbers — no search input, no chip, no subtitle — just the year label and, on the selected row, a checkmark.
- **Frecuencia** is a new segmented pill control (Trimestral/Mensual) that drives which **Período** grid is shown: 4 quarter buttons (`T1`–`T4`) or a 6×2 grid of month buttons (`01`–`12`). Switching frequency resets the selected period to the first value of the new list.
- **Duplicate-declaration awareness — disabled, no message (updated)**: `NewDeclModal` accepts an optional `existingDeclarations` prop — `FmListPage` passes its own `decls` state. Any period button that already has a declaration for the currently selected model+year renders grayed out with a small dot badge (`.fm-newdecl-period-btn--existing` + `.fm-newdecl-period-btn__dot`) **and is disabled** (real HTML `disabled` attribute — it cannot be clicked or selected). There is **no message of any kind** about it: the warning banner this modal used to show (`fm.new_decl.duplicate_warning`, "Si continúas, se creará una complementaria") was removed entirely, because that copy is factually wrong for many cases (AEAT renamed the concept to "rectificativa" for periods from Q3‑2024/Sept‑2024 onward, and even for older periods a correction is only valid when it favors the Treasury) and because a duplicate submission 500s server-side today (`FmListPage.jsx`'s `handleNewDecl` swallows the failure in an empty `.catch(() => {})`). Disabling the period, without explaining why, is a deliberate stopgap until the complementaria/rectificativa flow gets proper data-model and business-rule support — this UI path can no longer submit a duplicate period, so it no longer exercises that broken backend flow. A `useEffect` keeps the selection off a disabled period automatically: on mount, and on every model/year/frequency change, if the selected period became disabled it jumps to the first still-available period for the current frequency. If **every** period of the current frequency already has a declaration, the "Crear declaración" CTA itself becomes disabled (`allPeriodsTaken`) — still with no explanatory message, per the same "no message" rule. `existingDeclarations` is optional and defaults to "no existing declarations" when omitted, so every caller that predates this feature is unaffected.
- The footer shows a live "Se creará como Modelo {N} · {período} {año}" preview (`fm.new_decl.will_create_as` / `fm.new_decl.preview`) next to Cancelar / **Crear declaración** (`fm.new_decl.create_cta` — renamed from the generic `fm.action.create` key the button used before this restyle).

### No active models — hides the CTA and shows a dedicated empty state

`FmListPage` derives `activeCount = Object.values(activeModels).filter(Boolean).length` and uses it for two UX guards:

- **"+ Nueva declaración" toolbar button is not rendered at all** (not just disabled) when `activeCount === 0` — there is nothing productive to create until a model is enabled.
- **Table region shows a dedicated empty state** — `EmptyState` with only `title = fm.list.empty_no_active_models` ("No hay modelos activos. Configúralos desde el Catálogo de modelos."). It no longer renders a `cta` button: the always-visible "Catálogo de modelos (N)" toolbar button (see above) already covers that action, so a second, redundant "open catalog" entry point inside the empty state was removed. The `fm.list.empty_no_active_models_cta` locale key still exists in `en_US.json`/`es_ES.json` — it is simply unused in source now. This message takes priority over the generic `fm.list.empty` state even when `filtered` still holds stale rows from before all models were deactivated — the check is `activeCount === 0`, evaluated before `filtered.length === 0`.

The full precedence in the table region is: `!catalogLoaded` (the "Cargando…" loading state — see Persistence above) → `activeCount === 0` (this empty state) → `filtered.length === 0` (generic `fm.list.empty`) → the real table.

### Active catalog gates the declarations list, not just the create flow

`activeModels` (the catalog's per-model enabled/disabled map) now filters what the list shows, not only what "Nueva declaración" offers:

- `activeDecls = decls.filter(d => activeModels[d.model])` is computed first, before any user-facing filter (model/year/status).
- `modelYearFiltered` — and therefore `filtered`, the row table, and `KpiCardsRow` — derives from `activeDecls`, not the raw `decls` array.
- `modelOptions` (the "Todos los modelos" filter dropdown) is filtered to `.filter(opt => activeModels[opt.value])`, so a deactivated model's option disappears from the dropdown along with its declarations.

Practical effect: deactivating a model in the catalog immediately hides all of its existing declarations from the list and KPI cards, and removes it from the model filter — nothing is deleted, and reactivating the model in the catalog makes its declarations reappear.

### Downstream consumer outside this window: the sales/purchase-invoice "Correctiva del 349" gate (ETP-4755)

`GET /fiscal-models-catalog` (see "Persistence" above) is a generic, per-client endpoint — not
scoped to the `fiscal-models` spec — so it is reachable cross-spec.
`tools/app-shell/src/windows/custom/sales-invoice/ReversedInvoicesPanel.jsx` — the shared component
behind both `sales-invoice`'s and `purchase-invoice`'s "Rectificaciones" tab — now calls this same
endpoint (mirroring how its own `YearPickerSelect` already calls the cross-spec
`/fiscal-calendar/year`) and only shows its "Correctiva del 349" checkbox panel (plus the dependent
AEAT year/period/base-amount fields) when a local `model349Active` flag — derived from the fetch,
mirroring `FmListPage`'s own `activeModels`/`catalogLoaded` shape — confirms `349: true`.

**Fail-closed in every failure mode**, mirroring `NewDeclModal`'s own convention: hidden while the
fetch is loading, on a non-200 response, on a network error, and on a malformed/missing-key JSON
body — never a flash of visible-then-hidden. The read-only "Modelo 349" grid-column badge
(`CorrectivaBadge`) is explicitly **not** gated — it keeps showing regardless of catalog state; only
the interactive checkbox is affected. Full write-up of the invoice-side behavior:
`purchase-invoice.md`'s "Factura Rectificativa" section.

**Known non-blocking follow-up:** toggling 349 off does not clear or warn about an already-`true`
`aEAT349IsCorrective` value on existing invoice lines — the checkbox simply becomes invisible while
the underlying data (and the read-only grid badge) stays intact.

## Key files

| File | Role |
|------|------|
| `FiscalModelsPage.jsx` | Root — routes between list and per-model detail |
| `FmListPage.jsx` | Declaration table, toolbar, auto-compute wiring |
| `FmCatalogPage.jsx` | Model catalog drawer — enable/disable tax forms, drives `activeModels` |
| `useFiscalAutoCompute.js` | Background compute + polling hook |
| `fiscalModelsUtils.js` | `computeBoxes303`, `checkModified303`, `generate303File`, `fetchDeclarationIncidents` (ETP-4456), formatters, deadline logic |
| `models/303/FmModel303Page.jsx` | Modelo 303 detail — boxes, sources, stepper, file gen |
| `models/303/FmBoxes303.jsx` | Box grid renderer |
| `models/303/fm303Layouts.js` | Box layout definition (sections, rows, labels) |
| `models/303/AeatSubmitFlow.jsx` | AEAT electronic submission flow (ETP-4456) — confirm/submit/result, `POST /fiscal303/submit` |
| `models/349/FmModel349Page.jsx` | Modelo 349 detail |
| `FmCommon.jsx` | Shared components: `NumberedStepper`, `ResultPill`, `SummaryCard` |
| `FmOverlays.jsx` | Modals and drawers: `PresentModal` (2 manual paths + opt-in `aeat_telematic` sentinel path), `FileGenModal`, `NewDeclModal`, `ConfigDrawer` |
| `FmDebugPanel.jsx` | Developer panel (keystroke-activated) for testing with fixture data |

## NEO Headless endpoints

| Method | Path | Used by |
|--------|------|---------|
| `GET` | `/fiscal303/declarations` | FmListPage — fetch all declarations |
| `PUT` | `/fiscal303/declarations?id=` | FmListPage — persist status change |
| `GET` | `/fiscal-models-catalog` | FmListPage — fetch the active-models catalog on mount (per-Client); also consumed cross-spec by `ReversedInvoicesPanel.jsx` (sales-invoice/purchase-invoice) to gate the "Correctiva del 349" checkbox — see "Downstream consumer" above |
| `PUT` | `/fiscal-models-catalog` | FmListPage, via `FmCatalogPage`'s `onSave` — persist the active-models catalog (per-Client) |
| `GET` | `/fiscal303/boxes?year=&period=` | `computeBoxes303` |
| `GET` | `/fiscal303/modified?year=&period=&since=` | `checkModified303` |
| `GET` | `/fiscal303/generate?year=&period=&tipo=` | `generate303File` |
| `POST` | `/fiscal303/submit?year=&period=&tipo=&id=` (body: testMode, idi, nrc, presenterNif, presenterName) | `AeatSubmitFlow` — AEAT electronic submission (ETP-4456) |
| `GET` | `/fiscal303/incidents?id=` | `fetchDeclarationIncidents` — persisted AEAT validation errors for the "Incidencias" tab (ETP-4456) |
| `GET` | `/session` | FmModel303Page — org NIF/nombre for file header |
| `GET` | `/fiscal349/operators?year=&period=` | `compute349Operators` — returns operators + invoices + orgNif/orgName |
| `GET` | `/fiscal349/modified?year=&period=&since=` | `checkModified349` |
| `POST` | `/fiscal349/generate` (body: year, period, phone, contact, fileName, substitutive, formerStatement, representativeTaxId, navarra, guipuzcoa) | `generate349File` |

All query parameters are built with `URLSearchParams` to ensure correct encoding.

**Error response shape (`/fiscal349/generate` and siblings).** A non-2xx response from any `AbstractFiscalHandler`-based endpoint (including `/fiscal349/generate`) carries a JSON body of the shape `{"error":{"message": "<text>", "status": <int>}}` — the standard `NeoResponse.error()` envelope, same for every NEO Headless endpoint, not something specific to this feature. On the frontend, `generate349File` treats any `!res.ok` as failure: it reads the response text, feeds it through `parseServerMessage()` to extract and clean `error.message` (see "Generate error banner" above for the exact parsing steps), and returns `{ ok: false, error: 'http_<status>', serverMessage }` instead of throwing — `handleGenerate` in `FmModel349Page.jsx` is what turns that into the visible `genError` banner. A network-level failure (fetch throws) returns `{ ok: false, error: 'network' }` with no `serverMessage`, which also falls back to the generic banner text.

# Fiscal Models

## Intent

Use this window to manage Spanish tax declarations (modelos fiscales) — creating, tracking, and filing periodic returns such as Modelo 303 (quarterly VAT) and Modelo 349 (intra-community operations). It combines a declaration list with per-model detail pages that guide the user through a status lifecycle ending in submission.

The window fetches declarations from the NEO Headless fiscal API and auto-computes fiscal boxes in the background by polling for invoice changes.

## What this window should allow

- Fetch all declarations from `GET /fiscal303/declarations` and keep status changes in sync via `PUT /fiscal303/declarations?id=`.
- Auto-compute fiscal boxes for Modelo 303 draft declarations in the background every 3 minutes, updating the result column in the list without user interaction.
- Display an upcoming deadlines panel for unsubmitted declarations.
- Filter declarations by model type (303, 349) and status.
- Navigate into a per-model detail page when a declaration row is clicked, passing precomputed box data so the detail page renders immediately without a duplicate fetch.
- In detail pages, guide the user through the submission lifecycle via a numbered stepper.
- Generate and download the submission file (`.txt`) for Modelo 303.
- Show blocking and warning incident counts inline; a blocking count prevents file generation.

## Auto-compute architecture (`useFiscalAutoCompute`)

```
FmListPage
  └── useFiscalAutoCompute(decls, { computeFn, checkModifiedFn, token, apiBaseUrl, pollIntervalMs=180_000 })
        ├── On mount: calls computeFn for every decl in parallel
        │     result → computedMap[decl.id] = { boxes, summary, error, computedAt }
        │     null result → { boxes: null, summary: null, error: 'compute_failed', computedAt }  ← not "computing"
        └── Polling (every 3 min): calls checkModifiedFn per decl
              if modified → calls computeFn and updates computedMap
```

- `computeFn` = `computeBoxes303(decl, { token, apiBaseUrl })` → `GET /fiscal303/boxes?year=&period=`
- `checkModifiedFn` = `checkModified303(decl, sinceMs, { token, apiBaseUrl })` → `GET /fiscal303/modified?year=&period=&since=`
- `computedAtRef` tracks the last **successful** compute timestamp per declaration to bound the `since` query parameter. It is intentionally not updated on errors, so `sinceMs` stays at the last success and any subsequent invoice change still triggers a retry.
- Precomputed data (`decl._precomputed`) is seeded from `computedMap` when a row is opened, so the detail page loads instantly.

## Status lifecycle

```
Modelo 303:
(new) → draft → ready → submitted
                        ↘ submitted_ext
                        ↘ submitted_ack
          ↓
        skipped  (can be set from any non-submitted state)

Modelo 349:
(new) → pending → draft → ready → submitted
```

| Status | Color | Meaning |
|--------|-------|---------|
| `pending` | orange | Pending — initial state for Modelo 349 before drafting begins |
| `draft` | blue | Draft — boxes may still be computing |
| `ready` | green | Ready — review complete, file can be generated |
| `submitted` | teal | Filed via the standard channel |
| `submitted_ext` | violet | Filed via an alternative channel |
| `submitted_ack` | emerald | Filed with receipt acknowledgement |
| `skipped` | grey | Intentionally skipped |

Status transitions are driven by `StatusPillMenu` inline in the list and by the detail page action buttons.

## Modelo 303 detail page (`FmModel303Page`)

### Stepper

Three steps (0-based index):

| Step | Index | Status |
|------|-------|--------|
| Draft | 0 | `draft` |
| Ready | 1 | `ready` |
| Submitted | 2 | `submitted*` |

(`skipped` uses index `-1` — no step is highlighted.)

### Tabs

| Tab | Content |
|-----|---------|
| Boxes | `FmBoxes303` — grid of fiscal box values |
| Sources | Invoice rows that feed the boxes, filterable by incidents |
| Files | Generated `.txt` file download |
| Incidents | Blocking and warning validation messages |
| Justificante (ETP-4456) | Generic `AttachmentsTab` bound to the `ETGO_Fiscal_Decl` record — see below |

### Identification section (`tipo_declaracion` + bank data)

The top of the Boxes tab shows the declaration type selector and, conditionally, the bank data section (`datos_bancarios`).

**`tipo_declaracion` options:** `C` (Compensación), `D` (Devolución), `I` (Ingreso), `U` (Domiciliación), `N` (Resultado cero), `V` (Devolución cta. corriente), `X` (Devolución transferencia extranjero).

**`datos_bancarios` visibility** (`sectionVisibleWhen`): shown only when `tipo_declaracion ∈ {U, D, X}` — the only types AEAT allows an IBAN for (error `EDID065` rejects the submission if IBAN is present for any other tipo, e.g. `I`). Hidden for `C`, `I`, `N`, `V`.

**Section title** varies by tipo:
- `D`, `X` → "Devolución"
- `U` → "Domiciliación"

**SWIFT/BIC field** is only shown when `tipo ∈ {D, V, X}` (`_BANK_DVX_VW`) — note `V` can never actually reach this since the whole section is now gated to `{U, D, X}`; left as dead code pending a separate decision on `V`'s bank-field requirements.

### Live data

When in real mode, `FmModel303Page` reads `liveBoxes` / `liveSummary` from the `_precomputed` field passed at navigation. The compute button triggers a fresh `computeBoxes303` call. File generation calls `generate303File(decl, { token, apiBaseUrl })` → `GET /fiscal303/generate?year=&period=&tipo=`.

### Organization identity

A `GET /session` call on mount populates the NIF/nombre fields used in the generated `.txt` header when `token` and `apiBaseUrl` are provided.

### AEAT electronic submission (`AeatSubmitFlow`) — ETP-4456

`PresentModal` (`FmOverlays.jsx`) gained a 4th, opt-in path (`showAeatPath` prop, only passed by `FmModel303Page`): **"Presentación telemática AEAT"**. It reports the sentinel status `aeat_telematic` — never a real declaration status — which `FmModel303Page.handlePresent` intercepts to open `models/303/AeatSubmitFlow.jsx` instead of changing the status directly (the other 3 manual paths still call `handleStatusChange` as before).

**Flow (single dedicated component, not folded into `PresentModal`** — the multi-step submit/result logic and the real API call make it noticeably heavier than the 3 simple manual paths, so keeping it in its own file avoids bloating `FmOverlays.jsx` further):

**Trigger path (and the REVIEW-cycle bug fixed in it):** the AEAT path is a card inside
`PresentModal`, not a separate button — the user opens "Mark submitted" (`PresentModal`), picks the
4th card ("Presentación telemática AEAT" / `aeat_telematic`), and confirms. `handlePresent` in
`FmModel303Page.jsx` intercepts that sentinel status and opens `AeatSubmitFlow` **instead of**
changing the status directly, like the other 3 manual paths do. Alex's REVIEW (cycle 1) found a
real blocker here: the original code opened `AeatSubmitFlow` but never called
`setShowPresent(false)`, so `PresentModal` stayed mounted underneath it — closing `AeatSubmitFlow`
resurfaced the stale path-selection screen instead of returning to the main page. Fixed by adding
`setShowPresent(false)` alongside `setShowAeatFlow(true)`; a regression-guard test assertion
(`FmOverlays.test.js`) now checks the sentinel/gating wiring stays in place.

1. **Confirm screen** — shows NIF / business name / fiscal year-period / declaration type / result / IBAN, all read from data already available client-side (`orgIdent` + `identChecks` + the current computed `summary`/`liveBoxes` — no extra API round-trip just to populate this screen). Editable presenter NIF/name (defaulted from `orgIdent`, in case the certificate holder differs from the declarant) and an optional NRC field. **NRC field visibility**: shown only when `declarationType === DECLARATION_TYPE_INGRESO` (`'I'`, exported from `fiscalModelsUtils.js`, mirroring the backend's `Fiscal303BoxesHandler.DECLARATION_TYPE_INGRESO`) — the same tipo-gating pattern as the `datos_bancarios` section above, since AEAT's own Modelo 303 spec only accepts an NRC for tipo Ingreso (backend already discards it for every other tipo, error-free but silently, before this fix — see ETP-4456). Not mandatory even for `I` (no blocking validation).
2. **Submit** — `POST /fiscal303/submit?year=&period=&tipo=&id=` via `useApiFetch`. No separate "check certificate" pre-flight call is made — the endpoint is called directly and `errorCode: NO_CERTIFICATE` in the response is what triggers the "no certificate" message (simpler than a `GET /neo/certificate` probe beforehand, and the backend already has the definitive answer). Full request/response contract, all `errorCode` values, and the backend-side idempotency guard: `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`.
3. **Result screen**, branching on `response.status`:
   - `SUCCESS` — CSV, presentation date, registry/justificante numbers; a PDF download button decodes `pdfBase64` client-side (`triggerBase64Download`, new export in `fiscalModelsUtils.js`) and triggers a browser download. If `pdfDownloadFailed` is true, a distinct message is shown instead ("submitted OK, PDF fetch failed") — never implying the submission itself failed. Also calls `onSuccess('submitted_ack')`, which flows through the same `handleStatusChange` the 3 manual paths use (one extra, harmless PUT to `/fiscal303/declarations` re-asserting the status the backend already set server-side, kept for consistency with the existing list-sync mechanism).
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

A 6th tab (`receipt`, labeled via `fm.tab.receipt`) sits between Files and History and shows a
generic `AttachmentsTab` (`@/components/attachments`) bound to `tableName="ETGO_Fiscal_Decl"` /
`recordId={decl.id}`, restricted to `allowedMimeTypes: ['application/pdf']`. It surfaces **both**
kinds of AEAT justificante a declaration can end up with:

- **Automatic** — on a successful telematic submission (`AeatSubmitFlow`), AEAT returns the
  justificante PDF inline as base64 (`pdfBase64`) and the backend attaches it to the
  `ETGO_Fiscal_Decl` record server-side, for **both** `SUCCESS` (production) and `TEST_SUCCESS`
  (test mode) results. Production attaches under the normal justificante filename and also moves
  `DeclarationStatus` → `submitted_ack` (visible as a status change). Test mode attaches under a
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

**Backend persistence (`com.etendoerp.go`).** A new child table, `ETGO_Fiscal_Decl_Incident`
(FK `fiscalDeclaration` → `ETGO_Fiscal_Decl`, columns `CODE` VARCHAR + `MESSAGE` — sized for AEAT's
free-text error strings), stores one row per AEAT error. `Fiscal303BoxesHandler#handleSubmit`
calls `replaceIncidents(decl, result.getErrors())` (via the new
`AbstractFiscalHandler#replaceIncidents` → `FiscalDeclCrudHandler#replaceIncidents`) on **every**
submission attempt — test mode and production alike, success or failure — right after the AEAT
result is obtained. `replaceIncidents` always deletes every existing incident row for the
declaration first, then inserts one row per entry in `AEAT303SubmissionResult#getErrors()` (a raw
`"CODE - message"` string per error, e.g. `"35068 - El resultado a ingresar..."` or
`"E010124 - Para periodo mensual..."`, split via `FiscalDeclCrudHandler#splitAeatError`, a simple
`^(\S+)\s*-\s*(.+)$` regex with the whole string falling back into `message` when it doesn't
match). A successful submission has an empty error list, so the delete-then-noop-insert leaves the
declaration with zero incident rows — no separate success-path code needed. Persistence is
best-effort: a failure here is logged and never masks the actual submission response already
computed.

**Read path.** `GET /fiscal303/incidents?id=<declId>` (new entity route in
`AbstractFiscalHandler#handle`, alongside the existing `declarations`/`modified` ones — requires
only `id`, no `year`/`period`) returns `{"data":[{"code","message"}, ...]}` for a declaration,
ownership-checked the same way as the `declarations` CRUD endpoints. Generic across models (the
same `ETGO_Fiscal_Decl_Incident` table backs both `/fiscal303/incidents` and `/fiscal349/incidents`
for free), even though only the 303 telematic flow writes to it today.

**Frontend wiring (`fiscalModelsUtils.js` + `FmModel303Page.jsx`).** A new
`fetchDeclarationIncidents(id, { token, apiBaseUrl })` calls the endpoint above and maps the
backend's generic `{code, message}` rows into the shape `IncidentsTab`/`SourcesTab` already expect:
`origin` = code, `message` = message, `severity` = `'block'` — AEAT itself draws no
warning/blocking distinction, and `'block'` is the only sensible single default since every row
represents a failed/invalid submission attempt that must be resolved (matches how `IncidentsTab`
already renders any non-`'block'` severity as a plain warning). `FmModel303Page` keeps a local
`incidents` state (seeded from `decl.incidents`, so the demo/mock path in `FmListPage.jsx` is
unaffected when no `token`/`apiBaseUrl` is configured) and:
- fetches it once on mount (only when `token`/`apiBaseUrl` are present — real backend mode);
- re-fetches it via a new `onIncidentsChanged` callback passed to `AeatSubmitFlow`, fired after
  **every** submission attempt (`SUCCESS`/`TEST_SUCCESS`/`ERROR` alike — i.e. whenever the backend
  returned a structured `data.status`), so the tab shows the latest result live without a page
  reload, including for test-mode attempts.

Because these AEAT errors never carry a casilla number, the existing "ir a Casilla X" button in
`IncidentsTab` (matched via `inc.origin?.match(/Casilla\s+\d+/i)` against the origin field, which
now holds the AEAT code) naturally never renders for them — left untouched, it belongs to a
separate, not-yet-built casilla-level validation feature.

**Semantics to remember:** incidents are **replaced, never appended** — a second submission
attempt with different AEAT errors fully replaces the first attempt's rows, it does not
accumulate them. A **successful** submission (test or production) leaves the tab **empty**, not
stale from a prior failed attempt.

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

- **Operadores** — operator table with key filter chips and live name/NIF-IVA search. Null `name`/`nif` fields are guarded (`?? ''`) before case-folding to avoid runtime crashes.
- **Facturas origen** — source invoice drill-down. Clicking an operator's origin link pre-filters by NIF-IVA. Filter state shows `fm.m349.invoices.filtering_by` + count badge.
- **Rectificaciones / Incidencias / Ficheros / Historial** — coming soon.

### KPIs

Four cards (Operadores, Total operaciones, Rectificaciones, Pendientes VIES) sourced from `_precomputed.operators`.

### PDF preview and file generation

- `use349Pdf` hook renders a Modelo 349 draft PDF via Handlebars + `renderPdf`. Declarant NIF and org name are read from `_precomputed.orgNif` / `_precomputed.orgName`. The object URL is revoked on unmount to avoid memory leaks.
- File generation (`generate349File`) prompts for contact name and phone via `FileGenModal` before calling `POST /fiscal349/generate`. Contact/phone are sent in the request body to avoid PII in server logs.

### Result in list view

349 declarations show total intracomm volume (`totalE + totalS + totalA + totalI`) with `kind: 'info'` — no "a ingresar / a compensar" label, since 349 is informational only.

### Polling propagation

`FiscalModelsPage` keeps `FmListPage` mounted (hidden) while in a detail view so the auto-compute polling interval stays alive. When polling fires, `onComputeUpdate` propagates the updated `_precomputed` to `FmModel349Page` via a `useEffect` on `decl._precomputed`.

## Key files

| File | Role |
|------|------|
| `FiscalModelsPage.jsx` | Root — routes between list and per-model detail |
| `FmListPage.jsx` | Declaration table, toolbar, auto-compute wiring |
| `useFiscalAutoCompute.js` | Background compute + polling hook |
| `fiscalModelsUtils.js` | `computeBoxes303`, `checkModified303`, `generate303File`, `fetchDeclarationIncidents` (ETP-4456), formatters, deadline logic |
| `models/303/FmModel303Page.jsx` | Modelo 303 detail — boxes, sources, stepper, file gen |
| `models/303/FmBoxes303.jsx` | Box grid renderer |
| `models/303/fm303Layouts.js` | Box layout definition (sections, rows, labels) |
| `models/303/AeatSubmitFlow.jsx` | AEAT electronic submission flow (ETP-4456) — confirm/submit/result, `POST /fiscal303/submit` |
| `models/349/FmModel349Page.jsx` | Modelo 349 detail |
| `FmCommon.jsx` | Shared components: `NumberedStepper`, `ResultPill`, `StatusPillMenu`, `SummaryCard` |
| `FmOverlays.jsx` | Modals and drawers: `PresentModal` (3 manual paths + opt-in `aeat_telematic` sentinel path), `FileGenModal`, `ConfigDrawer`, `CompareDrawer` |
| `FmDebugPanel.jsx` | Developer panel (keystroke-activated) for testing with fixture data |

## NEO Headless endpoints

| Method | Path | Used by |
|--------|------|---------|
| `GET` | `/fiscal303/declarations` | FmListPage — fetch all declarations |
| `PUT` | `/fiscal303/declarations?id=` | FmListPage — persist status change |
| `GET` | `/fiscal303/boxes?year=&period=` | `computeBoxes303` |
| `GET` | `/fiscal303/modified?year=&period=&since=` | `checkModified303` |
| `GET` | `/fiscal303/generate?year=&period=&tipo=` | `generate303File` |
| `POST` | `/fiscal303/submit?year=&period=&tipo=&id=` (body: testMode, idi, nrc, presenterNif, presenterName) | `AeatSubmitFlow` — AEAT electronic submission (ETP-4456) |
| `GET` | `/fiscal303/incidents?id=` | `fetchDeclarationIncidents` — persisted AEAT validation errors for the "Incidencias" tab (ETP-4456) |
| `GET` | `/session` | FmModel303Page — org NIF/nombre for file header |
| `GET` | `/fiscal349/operators?year=&period=` | `compute349Operators` — returns operators + invoices + orgNif/orgName |
| `GET` | `/fiscal349/modified?year=&period=&since=` | `checkModified349` |
| `POST` | `/fiscal349/generate` (body: year, period, phone, contact) | `generate349File` |

All query parameters are built with `URLSearchParams` to ensure correct encoding.

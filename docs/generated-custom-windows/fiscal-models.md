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

## Interaction model

- Route: `/fiscal-models` (list, `FmListPage`); model detail pages render inline within the same route (no separate URL) via `FmModel303Page`/`FmModel349Page`.
- Implementation type: `layoutType: "custom"` — loaded from `customLoaders` in `tools/app-shell/src/windows/registry.js`.
- Breadcrumb — list page: `Finanzas / Modelos Fiscales` (`` `${ui('finance')} / ${ui('fm.breadcrumb.section')}` ``, `FmListPage.jsx`).
- Breadcrumb — Modelo 303/349 detail pages: `Finanzas / Modelos Fiscales / Modelo 303 - {periodLabel}` (es_ES) / `Finance / Fiscal Models / Form 303 - {periodLabel}` (en_US) (`FmModel303Page.jsx`), and the equivalent for 349 (`FmModel349Page.jsx`) — 3 segments, consistent between both models. ETP-4945 replaced 3 independently hardcoded, mutually inconsistent breadcrumbs (a raw Spanish literal `Tesorería` on all three pages, with 303 at 2 segments and 349 at 3), and introduced the shared `ui('finance')` / `ui('fm.breadcrumb.section')` keys reused across all three surfaces so the "Modelos Fiscales" segment can't drift between the list and its two detail pages again. ETP-5338 fixed a follow-on bug ETP-4945 left in place: the "Modelo 303"/"Modelo 349" segment itself (and the matching page-title text) was still a raw hardcoded Spanish literal even under `en_US` — now resolved via the shared `fm.config.m303.title` / `fm.config.m349.title` keys (already used by the catalog config section header), which is also why the English segment reads "Form 303", not "Model 303" — "Form" is this codebase's established translation of AEAT's "Modelo" (see `fm.catalog.303.name` / `fm.config.m303.title`).

## Auto-compute architecture (`useFiscalAutoCompute`)

`FmListPage` calls `useFiscalAutoCompute` **six times** — once per (model × draft-vs-other-vs-
submitted) combination — because drafts, non-draft/non-submitted declarations, and submitted-family
declarations each need different refresh semantics:

```
FmListPage
  ├── useFiscalAutoCompute(draftDecls303,     { computeFn, checkModifiedFn,          token, apiBaseUrl, pollIntervalMs=180_000 })
  ├── useFiscalAutoCompute(draftDecls349,     { computeFn, checkModifiedFn,          token, apiBaseUrl, pollIntervalMs=180_000 })
  ├── useFiscalAutoCompute(otherDecls303,     { computeFn,                          token, apiBaseUrl })   ← no checkModifiedFn
  ├── useFiscalAutoCompute(otherDecls349,     { computeFn,                          token, apiBaseUrl })   ← no checkModifiedFn
  ├── useFiscalAutoCompute(submittedDecls303, { computeFn, checkModifiedFn: neverModifiedFn, token, apiBaseUrl })   ← ETP-5438
  └── useFiscalAutoCompute(submittedDecls349, { computeFn, checkModifiedFn: neverModifiedFn, token, apiBaseUrl })   ← ETP-5438
        ├── On mount: calls computeFn for every decl in parallel
        │     result → computedMap[decl.id] = { boxes, summary, error, computedAt }
        │     null result → { boxes: null, summary: null, error: 'compute_failed', computedAt }  ← not "computing"
        └── Polling (every 3 min, only when checkModifiedFn is passed): calls checkModifiedFn per decl
              if modified → calls computeFn and updates computedMap
```

- `draftDecls303`/`draftDecls349` = declarations with `status === 'draft'` — their underlying
  invoices can still change, so they get the full compute-on-mount + poll-for-changes treatment.
- `otherDecls303`/`otherDecls349` (ETP-4755, narrowed by ETP-5438) = every non-draft,
  **non-submitted-family** declaration (`ready`/`skipped`) — computed **once** on mount and never
  polled (omitting `checkModifiedFn` makes the hook's polling effect a no-op). Without this, the
  "Resultado" column was permanently stuck on "—" for any declaration that had left draft, since
  the backend never persists a computed result on the declaration record
  (`FiscalDeclCrudHandler#declToJson` has no `result` field) — the same class of bug the
  "Incidencias" column had before it started fetching real data. Draft, non-submitted, and
  submitted-family instances all call the exact same real endpoints, which recompute from invoice
  data regardless of declaration status — which is exactly why the submitted-family bucket needs
  its own, separate freeze (see below).
- `snapshotMap` (ETP-5438) = every submitted-family declaration that carries a persisted
  `submittedSnapshot` — the snapshot itself is its computed result, spread into the non-draft map;
  no hook ever receives it, so it is never computed.
- `submittedDecls303`/`submittedDecls349` (ETP-5438) = every **legacy** declaration whose `status`
  is in the submitted family (`submitted`/`submitted_ext`/`submitted_ack`) but that has **no**
  snapshot (presented before snapshots existed) — carved out of the `other*`
  buckets above so a presented declaration gets its one bootstrap compute and is then **frozen**:
  see "Freeze once presented — recalculation/re-presentation guard (ETP-5438)" below for the full
  rationale (`neverModifiedFn`, `getCachedFiscalCompute`, and the backend defense-in-depth).
- `computeFn` = `computeBoxes303(decl, { token, apiBaseUrl })` → `GET /fiscal303/boxes?year=&period=`
  (303) or `compute349Operators(decl, { token, apiBaseUrl })` → `GET /fiscal349/operators?year=&period=`
  (349).
- `checkModifiedFn` = `checkModified303`/`checkModified349` → `GET /fiscal{model}/modified?year=&period=&since=`.
- `computedAtRef` tracks the last **successful** compute timestamp per declaration to bound the `since` query parameter. It is intentionally not updated on errors, so `sinceMs` stays at the last success and any subsequent invoice change still triggers a retry.
- Precomputed data (`decl._precomputed`) is seeded from whichever map (draft, other, or submitted) matches the row's status, when it is opened, so the detail page loads instantly instead of redoing its own compute.

## Freeze once presented — recalculation/re-presentation guard (ETP-5438)

This is the primary deliverable of ETP-5438: once a Modelo 303 or Modelo 349 declaration reaches a
**submitted-family** status (`submitted`, `submitted_ext`, `submitted_ack`), it must behave as a
closed, immutable record — nothing in this window may keep recomputing its boxes/operators from
current invoice data, regenerate its file, or re-present it. Root cause: `computeBoxes303`
(`GET /fiscal303/boxes`) and `compute349Operators` (`GET /fiscal349/operators`) always recompute
from **whatever invoices exist right now**, regardless of who calls them or when — there was no
concept of "this declaration is done" anywhere in the compute path, so an invoice added or removed
after presentation silently changed what "Resultado" showed for an already-filed declaration
("sigue tomando facturas aun presentada"). Fixed by **persisting a snapshot at submission**: the
moment a declaration enters the submitted family, the backend stores the exact boxes/operators
payload on the declaration record, and from then on every reader (backend reads, list, detail)
serves that snapshot instead of recomputing. The backend also rejects every write — file
generation, re-presentation, telematic resubmission — for **both** models — "en todos los modelos
tiene que funcionar de la misma manera" (explicit product decision). Declarations presented before
the snapshot existed (legacy) have none and keep an earlier, weaker once-per-browser-session freeze
(see "Legacy fallback" below); by product decision there is no data-fix for them.

**Trigger.** The same `SUBMITTED_STATUSES` set gates every layer, duplicated deliberately per
language/file rather than shared (same tradeoff as `statusLabelKey` above — see "Duplicated,
deliberately, in 4 places"): `{'submitted', 'submitted_ext', 'submitted_ack'}`. `submitted_ext` is
included even though it can no longer be newly selected from `PresentModal` — a legacy declaration
that already carries it is just as frozen as one presented through either currently-selectable path.

### Submission snapshot — the source of truth (`ETGO_Fiscal_Decl.Submitted_Snapshot`)

- **Column.** `Submitted_Snapshot` (TEXT/CLOB, nullable, AD `FIELDLENGTH` 1,000,000, module
  `com.etendoerp.go`, property `submittedSnapshot` — `FiscalDeclCrudHandler.PROPERTY_SUBMITTED_SNAPSHOT`,
  `FiscalDecl#setSubmittedSnapshot`). The column first shipped with `FIELDLENGTH` 2000, which the
  entity validator enforces on `set` — real snapshots failed (ETP-5438 QA BUG-1).
  `MANUAL_DATA` was not reused: it holds the user's manual inputs, which are merged on top of the
  computed figures, not the figures themselves.
- **Contents — figures only, size-bounded.** The snapshot is the `GET /fiscal303/boxes` (303) or
  `GET /fiscal349/operators` (349) payload for the declaration's `(org, year, period)` with every
  per-invoice array replaced by its row count (`AbstractFiscalHandler#computeSubmittedSnapshot`,
  the single place it is built; per model via `snapshotExcludedLists`):
  - 303 keeps `boxes` + `summary`; `sources` (the per-invoice drilldown) becomes `sourceCount`.
  - 349 keeps `operators` (one row per intra-community partner), `summary`,
    `rectificativeSummary` (fixed E/S/A/I totals), `orgNif`/`orgName`; `invoices` and
    `rectifications` become `invoiceCount` / `rectificationCount`. Before they are dropped, the
    operators' "Origen" counts are folded into each operator row as `originPurchases` /
    `originSales` (`Fiscal349BoxesHandler#foldPerInvoiceAggregates`, same `nif|key` grouping as
    the frontend's `originByNif` / `originByRectification`) — one pair per partner, still bounded.

  Why: a period can hold tens of thousands of invoices, and the snapshot is also returned by every
  `GET /fiscal303/declarations` (the list), so keeping per-invoice rows would grow without bound.
  Product decision: once presented nothing is recalculated — what was there at submission stays —
  and invoice-level detail is simply not kept for those declarations.
- **Taken when a declaration enters the submitted family from a non-submitted status**, computed
  server-side through the same code path the read endpoint uses
  (`computeSubmittedSnapshot` over `AbstractFiscalHandler#computeLivePayload`, with the org resolved by `resolveEffectiveOrg`
  exactly as the read resolves it), in the same request and transaction as the status change:
  - manual Registrar/Presentar, both models — `FiscalDeclCrudHandler#applySubmittedSnapshotTransition`
    on `PUT /fiscal303/declarations` (also on a `POST` that creates a declaration straight into
    a submitted status). Every declaration PUT goes through `/fiscal303/declarations` whatever its
    model, so `AbstractFiscalHandler.linkSubmittedSnapshotProviders` (called by
    `NeoBuiltInEndpointHandler`) routes the compute to the handler owning the declaration's model.
    The PUT response echoes the snapshot (`{"ok":true,"submittedSnapshot":{…}}`), and
    `FiscalModelsPage` carries it into the detail view and the list patch, so a just-presented
    declaration freezes without a refetch; the detail page's `handlePresent` also applies it at
    once (`applyComputeResult` on 303, `applyOperatorsResult` on 349), so the figures on screen
    are exactly the frozen ones.
  - AEAT telematic filing (303) — `Fiscal303SubmissionSupport#handleSubmit` computes it after
    generating the `.303` file and **before** calling the AEAT; `persistSuccessfulSubmission`
    stores it with the `submitted_ack` status in the single commit. The snapshot is validated
    against the entity's own property (`FiscalDeclCrudHandler#validateSubmittedSnapshot`) before
    the AEAT is contacted, so one the column would reject fails as `SNAPSHOT_FAILED` with nothing
    filed; should storing it still fail after the filing, the declaration keeps
    `submitted_ack`/`aeat_telematic` without a snapshot (served live, like a legacy one) rather
    than a half-written record. Test mode takes none. The
    frontend sends no status PUT afterwards (it would be a `409`): `FiscalModelsPage` re-reads the
    declaration to pick the snapshot up — see "AEAT electronic submission" below. The 303 detail
    page applies a snapshot that arrives after mount this way through a dedicated effect keyed on
    `decl.submittedSnapshot` (display only, no compute — QA BUG-2).
- **Fails closed.** If the snapshot cannot be computed, the submission fails and nothing is written:
  the PUT answers `500` with a message ("its figures could not be computed"); the telematic path
  answers `500` `SNAPSHOT_FAILED` without contacting the AEAT. The detail pages roll their
  optimistic "Presentado" back and toast `fm.action.present_error`. A declaration is never
  presented without its snapshot (a model with no snapshot support — neither 303 nor 349 — simply
  presents without one).
- **Reactivation clears it.** "Reactivar declaración" (submitted → `draft`) sets it to `null`; a
  later re-presentation takes a fresh one. A submitted → submitted transition never reaches this
  point (`rejectRepresentation` answers `409` first), and `generate` stays blocked for submitted
  declarations, so it never needs the snapshot.
- **Reads.** `declToJson` exposes it as `submittedSnapshot` (parsed object, or `null` when absent
  or unparseable — never `{}`, which would freeze a declaration on no figures).
  `GET /fiscal303/boxes` / `GET /fiscal349/operators` (`AbstractFiscalHandler#snapshotOrCompute`)
  return the snapshot as-is (no `sources`/`invoices`/`rectifications`, re-serialized through
  `JSONObject`) when the **latest** declaration for the natural key
  (highest `DECL_SEQ`, same rule as `findLatestDeclarationStatus`) is submitted and has one — the
  compute is never reached. Submitted without a snapshot (legacy), draft and ready declarations
  compute live, exactly as before.

### Frontend

- **List page (`FmListPage.jsx`).** A submitted declaration with a `submittedSnapshot` is served from
  it: `snapshotMap` feeds the snapshot straight into `computedMapOther303Merged`/`349Merged`
  (spread last, so it always wins), so "Resultado" goes through the exact same derivation as a
  live compute (303: box 71 re-derived with the row's `manualOverrides`; 349: E/S/A/I totals) and
  the row is opened with the snapshot as `_precomputed`. Such a declaration is handed to no
  `useFiscalAutoCompute` instance and never touches `sessionStorage`. Reactivating a row clears its
  `submittedSnapshot` locally, so the draft computes live again. The "resultado cero" vs "sin
  resultado" distinction of a 0.00 result reads `sourceCount` when the snapshot has no `sources`.
  **Hidden for snapshot-served declarations:** the 303 detail's "Facturas" tab and the 349 detail's
  "Facturas origen"/"Rectificaciones" tabs show `fm.snapshot.invoice_detail_not_kept` ("El detalle
  por factura no se conserva en las declaraciones presentadas.") instead of a list, with the kept
  counts as tab badges; nothing recomputes to fill them. The 349 operators' "Origen" column reads
  the folded `originPurchases`/`originSales` (`formatOrigin` falls back to them when the invoice
  rows are absent). Legacy submitted, draft and ready
  declarations are unchanged. **Legacy fallback** (no snapshot):
  `submittedDecls303`/`submittedDecls349` are carved out of the
  pre-existing `otherDecls303`/`otherDecls349` buckets (see "Auto-compute architecture" above) into
  their own two `useFiscalAutoCompute` instances, passed `checkModifiedFn: neverModifiedFn` — a
  function that always resolves `false`. This is the deliberate mechanism, not an oversight:
  *omitting* `checkModifiedFn` (like `otherDecls303`/`349` do) makes the hook's mount effect skip
  its cache-consult branch entirely and unconditionally recompute from live data on every mount —
  which is exactly the ETP-5438 root cause, because `FmListPage` never truly unmounts (it stays
  mounted so polling keeps running) but its `decls` array reference still changes on every
  declarations refetch, e.g. right after presenting a *different* declaration — re-triggering a
  fresh live recompute for every already-submitted one on the list. Passing `neverModifiedFn`
  instead makes the hook trust its own `sessionStorage` cache: a never-before-computed submitted
  declaration still gets exactly one bootstrap compute (so "Resultado" is never stuck on "—",
  ETP-4755), and every mount after that first one reuses the cached result — network-free, so
  nothing here can pick up an invoice added/removed after submission for the rest of the browser
  session. The bootstrap depends on `GET /fiscal303/boxes` and `GET /fiscal349/operators` staying
  available for submitted declarations (see "Backend" below): an earlier ETP-5438 iteration
  returned `409` there too, which made every cold cache (new tab, reload, another browser/user)
  render "Error de cálculo" in "Resultado" (or "…" while in flight).
  A failed bootstrap is never cached (the hook only writes a non-`null` result), so the list
  retries it on the next declarations refetch rather than freezing an error. The resulting
  `computedMapSubmitted303`/`349` maps are unioned with `computedMapOther303`/`349` into
  `computedMapOther303Merged`/`computedMapOther349Merged` — `getComputedForDecl` only needs "the
  non-draft compute for this decl.id", it does not care which of the two hooks produced it.
- **Session cache (`useFiscalAutoCompute.js`, legacy fallback only).** `getCachedFiscalCompute(declId)` reads back the
  last payload this hook cached for one declaration, keyed `fiscal_ac_v3_<declId>` in
  `sessionStorage`, without issuing a network call — `null` when nothing was ever cached this
  session. `setCachedFiscalCompute(declId, result)` is its write-side counterpart (same key, same
  `{ result, computedAt }` shape; a `null` result is ignored so a failed compute is never frozen).
  Together they let a detail page reuse whatever `FmListPage`'s submitted-family bucket already
  computed, and — on a cold cache — store its own one-time compute where the list will find it.
- **Detail pages (`FmModel303Page.jsx` / `FmModel349Page.jsx`).** Both pages compute
  `isSubmitted = SUBMITTED_STATUSES.includes(status)` and use it as the single gate for two
  independent things:
  - The mount-time auto-compute effect first checks `isSubmitted && decl.submittedSnapshot`: when
    present it applies the snapshot through the same helper a live compute uses
    (`applyComputeResult` on 303 — saved `manualOverrides` merged and box 71 re-derived exactly as
    before; `applyOperatorsResult` on 349) and returns — no compute call, no session cache, and
    it wins over any stale cache entry.
  - **Legacy fallback** (submitted, no snapshot): the effect (the ETP-4755 "auto-compute on mount
    when the list didn't hand us `_precomputed`" fix) branches on `isSubmitted` **before** ever
    calling `handleCompute()`: when true, it calls `getCachedFiscalCompute(decl.id)` first and applies
    the cached snapshot if one exists (via the same `applyComputeResult` helper "Calcular" uses on
    303; `applyOperatorsResult` on 349) — zero network calls. Only when nothing is cached (cold
    session: new tab, reload, another browser/user, no `_precomputed` handed down) does it run
    `computeSubmittedOnce()`: ONE call to the same compute function the page already uses
    (`computeBoxes303` with `noMockFallback: true`, so a failed call resolves `null` instead of
    freezing the demo mock figures — the option only has an effect when `apiBaseUrl` is set; with
    no backend configured the demo mock is still returned; `compute349Operators`, which already
    resolves `null` on failure), then
    `setCachedFiscalCompute(decl.id, result)` so later mounts and the list's "Resultado" column
    freeze on the same payload. It is display-only: nothing is persisted and `manualOverrides`
    (hydrated from the saved declaration) are only merged in, never rewritten. A failed compute
    leaves the tabs empty and caches nothing.
  - **Stale-response cancellation.** The mount effect's cleanup flips a `cancelled` flag that
    `computeSubmittedOnce(isCancelled)` checks after its request resolves. A response that lands
    after unmount, or after `decl.id` changed (the page re-rendered for another declaration),
    is still written to the session cache under the id it was **computed for** (captured before
    the request), but is never painted into the page and does not reset the `computing` spinner
    of whatever declaration is now shown.
  - **Legacy trade-off (only for declarations presented before the snapshot existed).** Their
    freeze lives in the browser session, not on the record, so a cold session recomputes from the
    invoice data **as it is at that moment** — if an invoice of a presented period was changed
    after presentation, a fresh tab shows the new figures (and then freezes them for that
    session). Accepted by product decision (no data-fix); every declaration presented after this
    change is frozen on its persisted snapshot instead and cannot drift.
  - Every action that could mutate or regenerate a submitted declaration is wrapped in
    `{!isSubmitted && (...)}` in the action bar: **Guardar**, **Calcular**, **"Generar fichero
    303"/"Generar fichero 349"**, and **"Registrar/Presentar"**. Once a declaration is submitted,
    the action bar reduces to just **Cancelar** and the status pill. `handleGenerate` on both pages
    also re-checks `isSubmitted` at its own top (belt-and-braces, same double-check pattern already
    used for `missingRequiredFields`) and toasts `fm.validation.already_submitted` if reached
    anyway — the real defense-in-depth for a direct/malformed call is server-side (see below).

### Backend (`com.etendoerp.go`) — defense-in-depth

The frontend gates above are UI-only; a raw/direct call to NEO Headless (or a future frontend
regression) is not stopped by any of them. Every entry point that could recompute or re-file an
already-presented declaration has its own, independent, server-side guard:

- **Generate — `AbstractFiscalHandler#guardNotAlreadySubmitted(orgId, year, period,
  model)`**, shared by both models. Applied to the `generate` (file generation) entity **only**:
  the pure-read `boxes` (303) and `operators` (349) entities are deliberately **not** gated — they
  serve the persisted snapshot (see above), and for legacy declarations the frontend's
  once-per-session compute needs them on a cold cache (an earlier ETP-5438 iteration
  also gated the reads and broke "Resultado" and the detail KPIs/tabs for every submitted
  declaration opened in a new session). Looks up
  `FiscalDeclCrudHandler#findLatestDeclarationStatus(clientId, orgId, model, year, period)` — the
  status of the **most recent** declaration (highest `DECL_SEQ`) for that natural key, not just any
  match, because a period can legitimately have more than one declaration (the rectificativa flow):
  an older, already-submitted declaration for the same period must not block a fresh rectificativa
  draft's own file generation. If that latest declaration's status is in
  `FiscalDeclCrudHandler.SUBMITTED_STATUSES`, it throws `AlreadySubmittedException`; no-op
  (returns normally) when no declaration exists yet for the natural key. Both
  `Fiscal303BoxesHandler#dispatch` and `Fiscal349BoxesHandler#dispatch` call it as the first thing
  in their `generate` branch, and `AbstractFiscalHandler#runDispatch` catches
  `AlreadySubmittedException` specifically — before the generic `catch (Exception e)` — turning it
  into a clean `409 Conflict` instead of letting it bubble up as a generic `500`.
- **Re-presentation (PUT) — `FiscalDeclCrudHandler#rejectRepresentation`.** Blocks a
  `PUT /fiscal{303,349}/declarations?id=` whose body sets `status` to a value in
  `SUBMITTED_STATUSES` when the declaration's **current** status is already in
  `SUBMITTED_STATUSES` — i.e. only a submitted-family → submitted-family transition is rejected.
  A normal, first-time presentation (`draft`/`ready` → submitted-family) is unaffected, and so is
  the separate "Reactivar declaración" transition back to `draft`, which
  `rejectTelematicReactivation` already guards on its own, narrower terms (blocking reactivation
  only for `submission_method === 'aeat_telematic'`). Deliberately model-agnostic: the same
  `ETGO_Fiscal_Decl` table and PUT path serve both models, and "you cannot re-present an
  already-presented declaration" is not specific to either one.
- **AEAT telematic resubmission — `Fiscal303SubmissionSupport#rejectResubmissionOrMissingPresenter`
  (Modelo 303 only, see below).** This guard predates ETP-5438 (it already blocked a naive
  double-click/network-retry resubmission) but was narrower — `submitted_ack`-only. Widened under
  this ticket, by explicit user decision ("la presentación telemática debería funcionar igual que
  los otros casos"), to the full `SUBMITTED_STATUSES` family, matching every other guard in this
  section. It fires only for a **production** (non-`testMode`) call — `ServValiDos` test-mode
  validations never change declaration status, so re-validating an already-submitted declaration
  stays allowed and harmless. On trip, it responds `409` with `ALREADY_SUBMITTED` and never
  constructs `AEAT303SubmissionService` at all (a QA regression test asserts this explicitly). This
  is a distinct, narrower concern from `guardNotAlreadySubmitted` above — idempotency of a real AEAT
  filing action, not "must not silently recompute/regenerate" — which is why `Fiscal303BoxesHandler`
  deliberately does **not** call `guardNotAlreadySubmitted` for its `submit` entity; the dedicated
  guard here already covers it.
- **Modelo 349 has no telematic submission path — a legitimate asymmetry, not a gap.** Unlike
  Modelo 303 (`AeatSubmitFlow` → `AEAT303SubmissionService`), Modelo 349 only ever reaches a
  submitted status through `PresentModal`'s two manual paths (`submitted`/`submitted_ack` via the
  PUT path above) — there is no `AeatSubmitFlow`/`AEAT349SubmissionService` equivalent, no real AEAT
  telematic filing call to guard, and so no `rejectResubmissionOrMissingPresenter` counterpart to
  widen. `Fiscal349BoxesHandler#dispatch` has no `submit` entity at all (only `operators`,
  `generate`, `validate-vies`, and the modified-check fallback) — 349's `generate` is already fully
  covered by the shared `guardNotAlreadySubmitted` above (its `operators` read is intentionally
  open, like 303's `boxes`), which is model-agnostic and needed no 349-specific work.

Regression tests: `Fiscal303BoxesHandlerTest`/`Fiscal349BoxesHandlerTest` (the `AlreadySubmittedException`
→ `409` path for `generate`; `testDispatch{Boxes,Operators}ServesSnapshotWithoutComputingWhenSubmitted`
— snapshot returned, compute never called; `testDispatch{Boxes,Operators}ComputesLiveWhenSubmittedWithoutSnapshot`
— legacy live compute; `testDispatchBoxesComputesLiveWhenLatestIsDraft`), `FiscalDeclCrudHandlerTest`
"submission snapshot" group (taken on 303 and 349 manual presentation and echoed, failure → `500`
with nothing written, cleared on reactivation, untouched without a status change, `declToJson`
exposure, `findLatestSubmittedSnapshot`), `AbstractFiscalHandlerTest` (provider routed by model,
unknown model → no snapshot, compute failure propagates), `Fiscal303SubmitHandlerTest`
(telematic snapshot persisted; `SNAPSHOT_FAILED` never calls the AEAT; test mode takes none), the
frontend `FmListPageAutoCompute` snapshot group, the `FmModel303Page`/`FmModel349Page`
`submittedFreeze` snapshot groups and `presentRollback` suites, `persistDeclarationStatus` and
`FiscalModelsPage.statusChange` (snapshot echoed into the list patch), plus the legacy-path suites: the frontend `FmModel303Page.submittedFreeze` / `FmModel349Page.submittedFreeze`
Vitest suites (cache hit → zero compute calls; cold cache → exactly one compute, shown and written
to the session cache; a failed cold compute caches nothing and is not retried; a late response for
a previous `decl.id` is cached under its own id but never painted (303); a response resolving
after unmount still freezes the cache (349)), `useFiscalAutoCompute.invalidate.vitest.js`
(`setCachedFiscalCompute` writes the key the hook reads, the hook restores it without calling
`computeFn` when `checkModifiedFn` answers `false`, and a `null` result or id is ignored),
`fiscalModelsUtils.additional.test.js` ("computeBoxes303 — noMockFallback": `null` on a
non-ok response or a thrown fetch, mock figures still returned when the option is omitted),
`FiscalDeclCrudHandlerTest` (`rejectRepresentation`,
`findLatestDeclarationStatus`'s "latest wins" semantics across a rectificativa's multiple
declarations), and `Fiscal303SubmitHandlerTest` (the widened `SUBMITTED_STATUSES` resubmission
guard, and the assertion that `AEAT303SubmissionService` is never constructed once it trips).

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

Status transitions are driven by the detail page action buttons. Clicking **"Registrar/Presentar"** (renamed from "Marcar como 'Presentado'" — ETP-5229 item #10, see the "Action bar" and "AEAT electronic submission" sections below) opens `PresentModal`, which offers **3 paths on Modelo 303** (`submitted_ack`, `submitted`, and the opt-in `aeat_telematic` sentinel card) and **2 on Modelo 349** (`submitted_ack`, `submitted` — 349 never passes `showAeatPath`). The "Otra Plataforma" path — which used to set `submitted_ext` — was removed from `PresentModal`; `submitted_ext` itself is still a valid, fully-rendered status (color, label, stepper index) for any declaration that already carries it from before this change, it just can no longer be newly selected from the modal.

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

## "Resultado" label — shared `deriveResultKind` (ETP-5187)

The list page (`FmListPage.jsx`) and the Modelo 303 detail page (`FmModel303Page.jsx`) used to
derive the "Resultado" badge's kind independently: the list page had a correct, live
`getResultKind(r)` reading the freshly-computed `summary.result`, while the detail page read
`decl.result?.kind` — a field the backend never populates (`FiscalDeclCrudHandler#declToJson` has
no `result` key), so the detail page's KPI card fell through to the generic "Resultado" sub-label
every time, regardless of what the list showed for the same declaration a moment earlier.

Both are now wired to one shared function, `deriveResultKind(summary, { hasInvoices })`
(`fiscalModelsUtils.js`), which also fixes a real gap neither screen distinguished before: a
declaration whose boxes net to exactly `0.00` looked identical whether it had invoices behind it
or was a genuinely empty/new declaration. The rules (fixed, not open for further nuance —
deliberately do **not** try to disambiguate "a compensar" vs "a devolver" via `tipo_declaracion`):

| `summary.result` | `hasInvoices` | Kind | Label |
|---|---|---|---|
| `< 0` | — | `C` | "A compensar/devolver" (one combined label) |
| `> 0` | — | `I` | "A ingresar" (unchanged) |
| `= 0` | `true` | `zero` (new) | "Resultado cero" |
| `= 0` | `false` | `N` | "Sin resultado" (unchanged) |
| no finite result yet | — | `null` | caller's own generic fallback (unchanged) |

`hasInvoices` is read from the same computed payload both screens already have: the `sources`
array `computeBoxes303`/`Fiscal303BoxesHandler#buildResponse` returns alongside `boxes`/`summary`
(`computed.sources` in `FmListPage.jsx`, `liveSources ?? decl.sources` in `FmModel303Page.jsx`).

**Locale changes** (`en_US.json`/`es_ES.json`/`es_AR.json`): `fm.result.C` was repointed from "A
compensar"/"To offset" to the combined "A compensar/devolver"/"To offset/refund" — grepped first
for other consumers of `fm.result.C`/`fm.result.V` before touching either; both were fiscal-models
label keys only. `fm.result.V` ("A devolver"/"To refund") is now dropped — it had no code
reference anywhere (only ever read via the locale files themselves), since this window never
disambiguated compensar/devolver via `tipo_declaracion` in the first place. New key
`fm.result.zero` = "Resultado cero"/"Zero result". While touching this key group, `fm.result.N`'s
English string was also corrected from the mismatched "Zero result" (it means "Sin resultado", not
a zero amount) to "No result" — "Zero result" now correctly belongs to the new `zero` kind instead.

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

Left to right: **Cancelar** (`onBack`) and a status pill, then — right-aligned — **Guardar** (`Save`/`Loader2` icon, `handleSave` — ETP-5338, leftmost of the right-aligned group, replacing an earlier go-back button that used to sit next to Cancelar, see below), **Calcular** (`handleComputeClick` — persists any pending `identChecks`/`manualOverrides` edit via the same `persistEditableFields()` helper Guardar uses, then triggers the actual box recompute via `handleCompute`; spinner while `computing`), a standalone **"Generar fichero 303"** button, and a single **"Registrar/Presentar"** button (renamed from "Marcar como 'Presentado'" — ETP-5229 item #10) opening `PresentModal`, which on this page passes `showAeatPath` so its 3rd card ("Presentación telemática AEAT" / `aeat_telematic`) is available — see "AEAT electronic submission" below for how that card routes into `AeatSubmitFlow`. There is deliberately no separate standalone AEAT button in the action bar; a brief ETP-5229 iteration split it into one, but the modal was reunified with a single renamed trigger instead. **All four of these buttons — Guardar, Calcular, "Generar fichero 303", and "Registrar/Presentar" — are wrapped `{!isSubmitted && ...}` (ETP-5438): once the declaration reaches a submitted-family status, the action bar reduces to just Cancelar and the status pill.** "Generar fichero 303" used to be unconditionally visible regardless of submission status before this fix — see "Freeze once presented — recalculation/re-presentation guard (ETP-5438)" above for the full rationale and the matching backend guard. The page-title `MoreVertical` icon — previously decorative, with no menu attached — now opens `MoreOptionsMenu` (`FmCommon.jsx`): see "List page toolbar" below for the removal of this page's former kebab, and "'More options' menu — favorites and help" for the new, functioning menu that replaced the dead icon.

**Guardar's position (ETP-5338 pt.6).** Guardar briefly landed in the old go-back slot (left, next to Cancelar) when it first replaced go-back, then moved into the right-aligned primary-action group — leftmost of it, before "Calcular" — to match `saveActions.jsx`'s established Save-before-Confirm ordering convention used by every AD-window's generic DetailView toolbar. It is not grouped with Cancelar: Cancelar discards/navigates away, Guardar persists and stays, and the two are visually separated by the `flex: 1` spacer between the left-aligned pair (Cancelar + status pill) and the right-aligned action cluster.

**"Guardar" replaces the earlier go-back button (ETP-5338 pivot).** The button in this slot started life as a go-back affordance (`ArrowLeft` icon, `handleGoBack`) that flushed pending edits and then navigated back to the list, same as "Cancelar" but data-safe. Product later decided the correct affordance here is a genuine **Save** — matching the rest of Etendo Go's Save-button convention (icon swap to a spinning `Loader2` while saving, disabled while saving, `toast.success`/`toast.error` feedback; see `saveActions.jsx`'s shared Save/Confirm buttons) — that persists the current data and **stays on the same declaration view**, rather than one more way to navigate away. `handleSave` is hidden entirely once the declaration is submitted (`!isSubmitted`, same gate as "Calcular"/"Registrar-Presentar") since there is nothing left to save on a filed declaration.

The underlying data-safety problem is the same one go-back was hardened against, and `handleSave` reuses the exact same machinery — only the final navigation step is gone. **Note:** the next few paragraphs (through "Known related exposure") describe the mechanics as they existed under the original debounced-autosave design; that design was later removed entirely — see "Architecture pivot" below for the current, autosave-free behavior:

- **Cancelar** (`onClick={onBack}`) unmounts the page immediately. The debounced `identChecks`/`manualOverrides` autosave effect's own cleanup then runs `clearTimeout(manualDataSaveTimer.current)` — a pending, not-yet-fired save is discarded, never sent. This is the "Cancelar always reverts" behavior users were routing around by switching windows and back.
- **Guardar** (`handleSave`) clears that same pending timer itself and force-flushes the same `PUT` the debounce would eventually have sent, then reports the outcome via toast — but it never calls `onBack`, so the user always ends up back on the same declaration, saved or not.

**Edit committed but never sent — the "field still had focus" bug (ETP-5338 Bug 2, still fixed, now under Guardar).** Reported as: type into a text field (e.g. "Nº de justificante"), don't tab away, click the button in this slot — reopen the declaration and the old value is still there. The field's `onChange` DOES commit every keystroke straight into `identChecks`/`manualOverrides` React state (none of these inputs has a blur handler; focus is a red herring), so that part was never the problem. The real cause is a second, EARLIER edit's autosave still being in flight when the button is clicked: `persistManualDataQueued` (the shared `useRecordWriteQueue`) is single-flight per record — calling it while a write is already open only QUEUES the new snapshot and returns immediately, it does not wait for the eventual replay. The original `handleGoBack` called `onBack?.()` right after that queueing, unmounting the page — and the queue's own `mountedRef` guard (correct for every other caller of that hook) then abandoned the queued replay once the in-flight write finally settled, discarding the newer edit with no error anywhere. Fix (unchanged by the pivot to Guardar): `await`s `useRecordWriteQueue`'s own `waitUntilIdle(recordId)` before building and flushing its own snapshot (read directly from current `identChecks`/`manualOverrides` state, not from the `manualDataLatest` mirror a separate `useEffect` maintains, closing that indirection too). See `FmModel303Page.save.vitest.jsx`'s "does not drop an edit queued behind an in-flight write" test.

**Hardened against a queued-replay race (ETP-5338 review follow-up).** The first fix had this handler await ONE in-flight promise captured by value (a `manualDataInFlight` ref set by `writeManualData`). Review found that interleaving fragile: if the captured promise settled in the exact same tick the write queue's own replay logic reassigns the tracked in-flight write to a NEW promise (arming a queued edit), awaiting only the old reference would resume the handler while the replay was still genuinely open. This exact interleaving cannot happen from a real click vs. a real network response — browser task-boundary semantics prevent it — but the bug class ("edit silently dropped because of the write queue") had already shipped twice on this file, so it was hardened rather than left resting on that implicit guarantee. `useRecordWriteQueue` now exposes `waitUntilIdle(recordId)`, which loops — re-reading its own in-flight/queued state after every await — until the record has no write in flight and nothing queued behind it, instead of trusting one promise reference. `handleSave` uses it directly (twice — once before rebuilding its own snapshot, once again after issuing its own flush, so it reads back its OWN write's result and not a stale one); the `manualDataInFlight` ref and the promise-identity trick it depended on are gone. The new API is purely additive to the hook (`ContactsFinancialPanel`, `ProductPriceBar`, `AmortizationLinesTable` keep calling `persist` exactly as before). See `useRecordWriteQueue.vitest.jsx`'s "waitUntilIdle (ETP-5338 review follow-up)" suite, which forces the race directly.

A second review pass on this same hardening found the single-key loop above was not the whole story: when more than one field key is queued for the same record (e.g. a caller persisting two distinct fields, like `ProductPriceBar`'s `standardPrice`/`listPrice`), `persist`'s replay loop clears its in-flight/queued state for the record BETWEEN replaying one queued field and starting the next — a real tick in which `waitUntilIdle` could have resumed early, before the later field in the batch had even started replaying. `useRecordWriteQueue` now tracks that batch explicitly (`replayInProgressRef`, armed before the replay loop starts and cleared only after every queued field for the record has been replayed) and `waitUntilIdle` also waits on that marker, so the guarantee now covers the full queued batch, not just its first entry. `FmModel303Page` is unaffected in practice (`flushManualData` only ever queues the single literal key `'manualData'`), but the hook's own guarantee — and this doc's description of it — now hold for any future multi-field-key adopter too. See `useRecordWriteQueue.vitest.jsx`'s "waits for the entire queued batch, not just the first entry" test.

**Guardar now surfaces failures that go-back used to swallow.** `identChecks`/`manualOverrides` still have no OTHER write path — they only ever persist through this one per-declaration autosave, and Guardar's flush uses exactly that path. But unlike the old go-back (which awaited the flush purely to sequence a safe navigation and never inspected whether it actually succeeded), `handleSave` reads `writeManualData`'s result via `lastManualDataResultRef` after the flush settles and toasts success or failure accordingly — a network failure during Guardar's flush is no longer silently indistinguishable from success. A failed save also leaves `hasPendingManualDataEditRef` set, so clicking Guardar again genuinely retries the write instead of no-op'ing. The background debounced autosave itself is unchanged and stays silent-on-failure by design (nothing appropriate to toast from a timer firing in the background); only the explicit, user-clicked Guardar reports outcome.

**Known related exposure, not fixed here (flagged for follow-up).** `useRecordWriteQueue`'s "abandon the queued replay on unmount" behavior is shared by `ContactsFinancialPanel`, `ProductPriceBar` and `AmortizationLinesTable` too — any of those panels could in principle lose a coalesced edit the same way if its host view unmounts while a write to the same record is in flight. None of them currently has a "flush and wait before leaving" affordance like this page's `handleSave`, and none was audited as part of this fix. The fix here is intentionally scoped to `FmModel303Page.jsx` (per ETP-5338's own scope) rather than changing `useRecordWriteQueue`'s shared contract.

**Architecture pivot — no more debounced autosave (ETP-5338, later in the same ticket).** Everything
described above through "Known related exposure" documents the ORIGINAL debounce-based design
(`manualDataSaveTimer`, an 800ms background autosave effect). That design was subsequently removed
entirely: `identChecks`/`manualOverrides` are now pure local React state until one of two explicit
user actions flushes them — **Guardar** (`handleSave`) or **Calcular** (`handleComputeClick`, which
persists the pending edit via the same path before recomputing) — both funneling through one shared
`persistEditableFields()` helper. **Cancelar** (`handleCancel`) now performs a genuine, network-free
discard: it clears `hasPendingManualDataEditRef` and calls `onBack?.()`, with no timer to race and
nothing in flight it started itself. `useRecordWriteQueue` (`persistManualDataQueued`/
`waitUntilManualDataIdle`) is kept for the same reason as before — Guardar and Calcular can still
race each other, e.g. a Calcular click landing while an earlier Guardar's PUT is still open.

**Closed edge case — a Calcular save queued behind Guardar used to survive Cancelar (ETP-5338,
narrow follow-up to the pivot above).** The new explicit-save design reopened a narrower version of
the original "abandon the queued replay on unmount" guarantee. Scenario: Guardar's PUT is held open
by the server; the user clicks Calcular, whose own `persistEditableFields()` call reaches
`waitUntilManualDataIdle(decl.id)` and pauses there — genuinely "queued" behind Guardar's write,
but NOT via `useRecordWriteQueue`'s internal `queuedRef` (that only coalesces edits arriving after
`persist()`'s own single-flight check trips; here, `persistEditableFields` itself serializes ahead
of that, via its own `waitUntilManualDataIdle` wait). The user then clicks Cancelar, which unmounts
the page before Guardar's PUT resolves. Once Guardar's PUT finally settled, Calcular's
`persistEditableFields()` call resumed from its `await waitUntilManualDataIdle(...)` and went on to
build and flush its own snapshot — a live PUT firing after the user had explicitly clicked Cancelar
expecting a full discard, with no mount-guard anywhere in that resumed code path:
`useRecordWriteQueue`'s existing `mountedRef` check only gated the hook's OWN internal replay logic
(the `finally` block inside `persist()`), not a fresh top-level call to `persist()` arriving later
from a caller's own resumed `await`.

Fix, in `useRecordWriteQueue.js` (`tools/app-shell/src/hooks/useRecordWriteQueue.js`): `persist()`
now checks `mountedRef.current` at its own entry point, immediately after the null/empty-id guard —
not only inside the post-write `finally` block. This refuses to START any new write once the owning
component has unmounted, whether the call is a queued replay the hook armed itself or an entirely
independent call arriving from the caller's own code (exactly `persistEditableFields`'s resumed
`await`). A write that is already past this check when unmount happens (i.e. already in flight) is
left alone — the fix does not abort an in-flight HTTP request, it only stops a NEW one from being
issued after the point of no return. The fix lives in the shared hook, not in `FmModel303Page.jsx`
itself, so it also closes the exposure flagged above for `ContactsFinancialPanel`, `ProductPriceBar`
and `AmortizationLinesTable` — any caller shaped the same way (persist → await idle → build snapshot
→ flush) is covered without having to add its own guard.

Regression coverage: `FmModel303Page.cancelDiscard.vitest.jsx`'s "never fires a Calcular save queued
behind an in-flight Guardar PUT once Cancelar has unmounted the page" reproduces the exact sequence
(Guardar PUT held open → Calcular click queues behind it → Cancelar unmounts → Guardar PUT settles →
asserts no second PUT). Flagged as a first defensive test written alongside the fix, per this
ticket's established pattern — a full audit pass is still expected from Tester. The three
pre-existing single-flight/race regression suites (`useRecordWriteQueue.vitest.jsx`,
`FmModel303Page.explicitSaveSingleFlight.vitest.jsx`, and the rest of this file) were re-run and
still pass unmodified in behavior — the new check only rejects a call that arrives after unmount, it
does not change anything about an already-in-flight write or a same-component queued replay.

**"Presenting a declaration reverts it to draft" (ETP-5338, confirmed bug, root cause — predates the Guardar pivot).** Users reported that clicking the go-back button that used to live in this slot — and the pre-existing Cancelar — right after presenting a 303/349 declaration made it show as `draft` again. The declaration's status was **never actually reverted**: neither that flush nor `Cancelar` ever sends a `status` field (the manualData `PUT` body is `{ manualData }` only — see `persistManualData` in `fiscalModelsUtils.js`), and `FiscalDeclCrudHandler#handleDeclPut` (com.etendoerp.go) only touches `declarationStatus` `if (hasStatus)`, so a manualData-only PUT can never change it server-side either. The real cause is that `FmListPage` "stays mounted at all times" (so `useFiscalAutoCompute` keeps polling) and is therefore **never remounted, and never refetches `decls`,** when the user opens a declaration, presents it, and navigates back — the row it renders is the same `decls` array entry fetched once on mount, still holding the pre-submission status. `FiscalModelsPage`'s `onStatusChange` handler does correctly persist the new status server-side via `persistDeclarationStatus`, but nothing pushed that change into `FmListPage`'s own state. Fix: `FiscalModelsPage` now pushes a one-shot `declStatusPatch={{ id, patch: { status, submissionMethod } }}` down to `FmListPage` right after a successful persist (a fresh object each time, so the effect re-fires even for a repeat status), and `FmListPage` applies it to its `decls` state the same way `handleConfirmReactivate` already patches a row changed in place. If the user re-opens the same declaration from the list right after going back, they now see the correct, current status instead of the stale cached one.

**"Autoliquidación Rectificativa" un-checks itself on Registrar/Presentar (ETP-5338 pt.4, confirmed bug, real root cause).** Reported symptom: check "Autoliquidación Rectificativa" on a duplicate-period declaration, click "Registrar/Presentar" without clicking "Guardar" first, and the checkbox reads unchecked again on reopen — as if processing/presenting the declaration reverted it. The checkbox's own local React state (`identChecks.rectificativa`) was never actually cleared by anything: the real bug is that it was never SENT to the server at all. Unlike `handleComputeClick` ("Calcular"), which always calls `persistEditableFields()` before recomputing, `handlePresent` never flushed pending `identChecks`/`manualOverrides` edits before transitioning the declaration's status. Once `handleStatusChange` flips local `status` to a submitted value, `persistEditableFields` becomes a **permanent no-op** (`if (isSubmitted) return { ok: true }`, unchanged by this fix) — so an edit made right before clicking "Registrar/Presentar", with no intervening "Guardar" click, was not just delayed, it was unrecoverable: there is no later point at which it can still be saved. Every other surface that reads the flag back from persisted `manualData` (reopening the declaration, the list's "Tipo" column — see "Tipo column derivation" above) then correctly shows the server's un-updated value, which reads to the user as "the checkbox unchecked itself".

Fix, in `FmModel303Page.jsx`'s `handlePresent` (now `async`): it `await`s `persistEditableFields()` immediately after the required-field pre-flight check and BEFORE any status transition — for both the 2 manual paths (`submitted`/`submitted_ack`) and the `'aeat_telematic'` sentinel (opening `AeatSubmitFlow`). If the flush fails, the transition is aborted (toast, early return) rather than proceeding and losing the edit permanently — `persistEditableFields` only clears the pending-edit flag on success, so the user can retry via "Guardar" or by clicking "Registrar/Presentar" again. `AeatSubmitFlow`'s own AEAT submission params are read live off the `identChecks` prop regardless (via `applyIdentParams`, see "Identification checkboxes → AEAT params" above), so what actually gets filed with AEAT was never affected by this bug — only the persisted `manualData` copy was; the flush keeps that copy in sync with what is about to be (or was just) filed.

**"Autoliquidación Rectificativa" LOOKS unchecked on an already-submitted declaration, even though the persisted value is `true` (ETP-5338, second, unrelated bug — pure rendering, not data).** Follow-up report after the pt.4 fix above: on a submitted declaration whose `manualData.identification.rectificativa` really is `true` (confirmed — the adjacent "Nº de justificante" text field on the same identification section showed its correct saved value), the checkbox itself still rendered visually unchecked in read-only mode. This is NOT a recurrence of pt.4 and NOT a hydration bug — `identChecks` is seeded correctly from `decl.manualData?.identification` on mount (`FmModel303Page.jsx` line ~220), `identification={{ ...orgIdent, ...identChecks }}` is passed straight through to `FmBoxes303`, and the native `<input type="checkbox">` really did have `checked={true}`/`aria-checked="true"` the whole time — verified with a source-level trace, not just the report. The bug was generic to the shared `Checkbox` component (`@etendosoftware/app-shell-core/components/ui/checkbox.jsx`, consumed here via `tools/app-shell/src/components/ui/checkbox.jsx`), not specific to this window or this field: the checked+disabled visual state used the identical `bg-muted` box class as unchecked+disabled, and the checkmark's `stroke` was hardcoded to `"white"` — invisible against the near-white `--muted` token (96% lightness in the light theme). Every other read-only checkbox in this window (`sin_actividad`, `baja_domiciliacion`, `redeme`, `concurso`, …) shared the exact same risk since they all rendered through the same component.

A component-level fix for this exists in `schema_forge_core` (`packages/app-shell-core/src/components/ui/checkbox.jsx`, commit `a8b8384a0`: checkmark stroke changed to `currentColor` plus a `border-text-disabled` accent on the checked+disabled box class). **That fix is not what fiscal-models ships on.** Publishing it would require bumping `@etendosoftware/app-shell-core` in this repo (see `docs/repo-topology.md`), affects every OTHER consumer of the shared `Checkbox` too, and — critically — would have left fiscal-models with two coexisting checkbox implementations: the (now-fixed) shared `Checkbox` here, and the already-correct hand-rolled checkbox the Sales Invoice SIF tab (`SifTab.jsx`) used all along, which never had this bug because it dims the whole control via `disabled:opacity-50` instead of swapping the box/checkmark colors. The product decision was instead to **consolidate fiscal-models on the SIF tab's implementation**: it was extracted into `tools/app-shell/src/windows/custom/shared/CheckboxField.jsx` (a `<button role="checkbox">`, exported for reuse — `SifTab.jsx` now imports it too, replacing its former inline copy) and every checkbox in both Modelo 303 and Modelo 349 (`FmOverlays.jsx`, `FmListPage.jsx`, `FmModel349Page.jsx`, `FmBoxes303.jsx`, `AeatSubmitFlow.jsx`) was switched from `@/components/ui/checkbox`'s `Checkbox` (or, for `AeatSubmitFlow`'s `testMode` toggle, a raw `<input type="checkbox">`) to `CheckboxField`. Fiscal-models now has exactly one checkbox implementation, and it does not depend on a cross-repo publish to stay correct. The `schema_forge_core` fix (`a8b8384a0`) remains valid for other consumers of the shared `Checkbox`; whether to pursue publishing it is a separate, still-open decision. Two small pre-existing spots were deliberately left alone as out of scope: `FmOverlays.jsx`'s `CfgSection303` (dead code, never rendered) and the "keys" checkboxes in `CfgSection349` (uncontrolled `defaultChecked` placeholders with no `onChange`/state at all) — converting either to `CheckboxField` would mean inventing controlled state that doesn't exist today, which is a behavior change, not the pure visual swap this fix is scoped to.

This also closes a narrower, related gap: `handlePresent` calling `persistEditableFields()` can now race an already-in-flight Calcular/Guardar flush queued behind an earlier one (e.g. Guardar's PUT still open when the user immediately clicks Calcular, then immediately Registrar/Presentar). Both concurrent callers proceed independently — neither is deduped — and `useRecordWriteQueue`'s own single-flight `persist()` (`tools/app-shell/src/hooks/useRecordWriteQueue.js`) correctly serializes them: the second caller's write is coalesced into `queuedRef` and replayed once the first settles, rather than overlapping on the wire. In this specific interleaving that can mean one extra, content-identical PUT (the queued replay) beyond the minimum — harmless (same content, single-flight, no data loss) but a known follow-on effect, not eliminated here; see `FmModel303Page.explicitSaveSingleFlight.vitest.jsx`'s "flushes a queued save before filing the declaration, instead of dropping it" test, which drains every PUT this path can produce rather than asserting an exact count.

**Regression test note:** `FmModel303Page.explicitSaveSingleFlight.vitest.jsx` used to have a test named "drops a queued save when the declaration is submitted while a PUT is open", asserting the OPPOSITE of the fix above — that a save queued behind an in-flight Guardar was dropped once the declaration got filed. That was the same bug from a different angle and has been replaced with "flushes a queued save before filing the declaration, instead of dropping it", which asserts the corrected behavior: the queued edit is flushed (not dropped), and the status transition — and the `onStatusChange` callback — wait for that flush to actually settle. The file's top-of-file "four properties" comment and property (3) were updated to match: (3) now covers only the session-ending case (`token`/`apiBaseUrl` going falsy mid-flight), which is unaffected by this fix and still legitimately drops the queued edit (there is nothing left to flush it to).

**349's final toolbar: Cancelar (left) + Guardar, a deliberate no-op (ETP-5338 pt.5).** `FmModel349Page.jsx` originally got a go-back icon button (`ArrowLeft`, `handleGoBack`, `data-testid="FmModel349Page__goBack"`) next to Cancelar for visual/UX consistency across Modelo detail pages (ETP-5338 pt.1) — functionally identical to "Cancelar", since both just called `onBack` directly. Once the requirement widened to "every fiscal-models declaration gets a Guardar button" (not just 303, which already had an autosave to piggyback on), 349 was re-investigated with that wider bar in mind: a fresh grep of every `useState`/write path in the file confirms it has zero locally-edited, persistable declaration data — `keyFilter`/`searchQuery`/`selected`/`activeTab`/`viesBannerDismissed` are ephemeral view state, `liveOperators`/`liveInvoices`/`liveRectifications`/`liveRectifSummary` are read-only server-computed snapshots, and VIES validation (`handleValidateVies`) already persists its result server-side the instant it runs — there is no staged, unsaved state anywhere on this page. Rather than skip Guardar here (which would break the "every model" requirement) or fake a network call that flushes nothing, 349's `handleSave` is a deliberate **no-op confirmation**: it shows `toast.success(...)` immediately, with no PUT and no loading state, in the right-aligned toolbar position (leftmost of the primary-action group, before "Calcular"). Once Guardar existed, the old go-back button became pure duplication of "Cancelar" — both did the same `onBack` call, sitting side by side — so it was removed entirely: 349's toolbar now has exactly Cancelar on the left and Guardar (plus Calcular/Registrar-Presentar) on the right, no go-back affordance. This is intentionally honest rather than a misleading "unsaved work exists" affordance — clicking Guardar always "succeeds" because there is genuinely nothing that could fail. If 349 ever grows real locally-edited declaration fields, `handleSave` is the handler to wire an actual flush into.

### Sources tab — "Régimen" column removed (ETP-5187)

The `SourcesTab` table (`FmTabContent.jsx`) no longer has a "Régimen" column — neither the
`<th>{t('fm.sources.col.regime')}</th>` header cell nor the per-row `<td><span
className="fm-regime-pill">{r.regime}</span></td>` cell. The functional owner judged the column
not useful for this table; removal is UI-only — the backend (`Fiscal303SourcesSupport.java`) is
untouched, and each source row can still legitimately carry a `regime` field, it's simply not
rendered. The empty-state row's `colSpan` was updated from 9 to 8 to match the remaining column
count, and the now-dead `.fm-regime-pill` CSS rule and the `regime:` demo fields in
`FmDebugPanel.jsx`'s `MOCK_SOURCES` fixture were removed alongside it. The `fm.sources.col.regime`
locale key was dropped from all 3 locale files (`en_US`/`es_ES`/`es_AR`) — grepped first and
confirmed to have no other consumer.

### Sources tab — "Fecha" relabeled to "Fecha Factura" + new "Fecha Contable" column (ETP-5338 pt.5)

The `SourcesTab` table's first column (`fm.sources.col.date`) always rendered `C_Invoice.DateInvoiced`
(invoice date) — confirmed by re-reading `Fiscal303SourcesSupport.java#buildNewInvoiceRow`, which
only ever populated `r.put("date", sdf.format(inv.getInvoiceDate()))`. The header label "Fecha" was
ambiguous next to the also-relevant `C_Invoice.AccountingDate`, so the locale key's value was changed
to "Fecha Factura" (`en_US`: "Invoice Date") in all 3 locale files — the key itself (`fm.sources.col.date`)
was NOT renamed, since it is used exactly once and no other consumer would be affected either way; the
underlying data did not change.

A second column, "Fecha Contable" (`fm.sources.col.accountingDate` / "Accounting Date"), was added
right after it, backed by a NEW backend field: `Fiscal303SourcesSupport.java` now also puts
`r.put("accountingDate", inv.getAccountingDate() != null ? sdf.format(inv.getAccountingDate()) : null)`
— null-guarded because `C_Invoice.AccountingDate` can be null on some invoices (unlike `DateInvoiced`,
which this file has never null-guarded, since it's not nullable at the AD level). No existing nullable
date field in this file was available to copy a guard pattern from, so this is a plain ternary rather
than a shared helper. On the frontend, `SourcesTab` renders it with the SAME `fmtDate()` helper already
used for the invoice-date column — `fmtDate` already treats a falsy input as "no value" and renders
`'—'`, so a null `accountingDate` shows a dash rather than throwing or rendering `Invalid Date`. The
empty-state row's `colSpan` was bumped from 8 to 9 to match the new column count. `FmDebugPanel.jsx`'s
`MOCK_SOURCES` fixture got a matching `accountingDate` field per row (including one explicit `null` to
exercise the blank-render path in manual QA).

### Duplicate-period warning and rectificativa gate (ETP-5187)

A declaration can legitimately be a 2nd (or later) one for the same `(model, year, period)` — the
rectificativa flow: a period was filed early and more invoices arrived later. `FmListPage.jsx`
flags this at select-time (`_hasDuplicatePeriod`, computed off its own `decls` list — true when
another declaration shares this one's model/year/period) and passes it through to whichever detail
page opens, alongside the existing `_precomputed` field.

`FmModel303Page` derives `requiresRectificativa = decl._hasDuplicatePeriod && !identChecks.rectificativa
&& !isSubmitted`. While true:

- A warning banner (`TriangleAlert`, warning colors, positioned like the `genError` banner) tells
  the user another declaration already exists for this period and that "Autoliquidación
  rectificativa" must be checked — `fm.duplicate_period.warning` in all 3 locale files.
- Clicking **"Marcar como 'Presentado'"** does not open `PresentModal` — instead it shows the same
  message as a toast (`sonner`) and returns early. This is the only gate: the checkbox itself is
  never auto-checked for the user, and once it's genuinely checked (or the declaration reaches a
  submitted status), the banner disappears and the button opens `PresentModal` as normal.

The `rectificativa`/`nro_justificante`/`baja_domiciliacion`/`motivo_rectificacion` fields
themselves were **not** rebuilt for this — they already exist and are reachable via the Boxes tab's
"Resultado final" nav section (`fm303Layouts.js`'s `rectificativa` section, `CASILLAS_SECTIONS` in
`FmModel303Page.jsx`); this fix only adds the warning + gate around the existing checkbox.

### Tipo column derivation (ETP-5338)

`FmListPage.jsx`'s "Tipo" list column used to render `decl.type === 'ord' ? 'Ordinaria' :
'Complementaria'` — i.e. it read `DECL_TYPE` (AEAT's genuine ordinaria/complementaria business
value, see `FiscalDeclCrudHandler#declToJson`). No UI flow in this window ever sends
`type: 'com'`; every declaration is created with `DECL_TYPE = 'O'` (see "NEO Headless endpoints"
below), so this column always showed "Ordinaria" — including for declarations the user had
explicitly marked as a rectificativa via the "Autoliquidación Rectificativa" checkbox (see
"Duplicate-period warning and rectificativa gate" above). `decl.type`/`DECL_TYPE` is a real,
independent AEAT concept and was **not** repurposed to fix this — it stays available on the row
for whenever a UI flow legitimately needs to set/show "Complementaria".

The column now derives from the same rectificativa flag the detail page's checkbox writes:
`decl.manualData?.identification?.rectificativa` (persisted by `FmModel303Page.jsx`'s
`identChecks.rectificativa` → `manualData.identification.rectificativa`, already present on list
rows since `declToJson` includes `manualData` on every declaration, not just the one being
edited).

- `rectificativa` truthy → "Tipo" shows `fm.type.rectificative` ("Rectificativa").
- `rectificativa` falsy/absent → "Tipo" shows `fm.type.ordinary` ("Ordinaria"), same as before.
- Modelo 349 declarations have no rectificativa checkbox/field, so `manualData.identification` is
  always empty for them and this column correctly falls back to "Ordinaria" — unchanged from
  before this fix, since 349 also never produced `type: 'com'`.

`fm.type.rectificative` is a new key (all 3 locale files); `fm.type.complementary` is kept as-is
for the reason above, not removed or repurposed.

### Required-field pre-flight gate (ETP-5187)

`fm303Layouts.js` marks exactly 2 fields `required: true`: `tipo_declaracion` (always visible, in
`identificacion`) and `bank_iban` (in `datos_bancarios`, only visible while that section's
`sectionVisibleWhen` matches — tipo `U`/`D`/`X`, or `rectificativa` checked). Before this fix
`required` was purely decorative — it only drove the red asterisk in `FmBoxes303.jsx` (3 call
sites: `{f.required && <span className="fm-aeat-required-mark">`) — nothing checked whether a
required field was actually filled before "Generar fichero 303"/"Marcar como 'Presentado'" hit the
backend. You could leave "Tipo de declaración" on the placeholder and still generate + present.

**Generic gate, not a hardcoded field check:** `fm303Layouts.js` exports `matchesVisibility(svw,
identification)` (the single source of truth for visibility matching, extracted from
`FmBoxes303.jsx`'s own `matchesSvw` — that component now wraps it instead of forking a second
implementation) and `getMissingRequiredFields(year, period, identification)`, which walks the
resolved layout's `identificacion`-family sections, applies `sectionVisibleWhen`/`visibleWhen`, and
returns every `required: true` field that is currently visible AND empty. This reads the exact same
`field.required` flags the asterisk already uses, so a third field marked `required: true` in a
future year's patch is automatically covered by the gate — no gate-side change needed.

`FmModel303Page.jsx` computes `missingRequiredFields = getMissingRequiredFields(decl.year,
decl.period, identChecks)` and checks it — modeled the same way as `requiresRectificativa` above,
a computed array + inline warning + toast-and-return-early on the actions:

- **Inline banner** (same warning styling as the duplicate-period one) whenever
  `missingRequiredFields.length > 0` — `fm.validation.missing_required_banner`.
- **"Generar fichero 303"** — checked both at the button `onClick` (so `FileGenModal303` never
  opens) and again at the top of `handleGenerate` (so a future direct call is still covered) —
  `fm.validation.missing_required_generate`: *"Completá {fields} antes de generar el fichero."*
  ("Complete {fields} before generating the file." in `en_US`).
- **"Marcar como 'Presentado'"** — same double-check pattern on the button `onClick` (before the
  existing `requiresRectificativa` check) and at the top of `handlePresent`, which also covers the
  `'aeat_telematic'` sentinel path (opens `AeatSubmitFlow` instead of changing status directly) —
  `fm.validation.missing_required_present`: *"Completá {fields} antes de marcar la declaración como
  presentada."* All 3 new keys are in `en_US.json`/`es_ES.json`/`es_AR.json` (`es_AR` mirrors
  `es_ES` verbatim, matching this `fm.*` family's existing precedent — see
  `fm.duplicate_period.warning`).

**Backend hardening (defense-in-depth, `com.etendoerp.go`):** `Fiscal303BoxesHandler.resolveDeclType`
used to silently default ANY null/blank/unrecognized `tipo` to `"N"` instead of rejecting it —
and "N" ("Resultado cero"/sin actividad) **is** a real, deliberately-selectable option in
`TIPO_DECLARACION_FIELD.options`, not an internal-only fallback value, so a missing declaration
type was indistinguishable from an explicit "Sin actividad" selection at this layer. This meant a
direct/malformed API call (or any future UI regression bypassing the frontend gate above) was
never rejected — it always looked like a valid zero-result declaration downstream, corrupting the
generated `.303` file's declaration type silently. Fixed by making `N` an explicit member of
`resolveDeclType`'s accepted-code set (alongside the pre-existing `C, D, I, U, V, X`, plus the
legacy `G` alias kept for backward compatibility) and having anything else — null, blank, or an
unrecognized string — throw `IllegalArgumentException` instead of falling through to `"N"`. Both
call paths that reach `resolveDeclType` (`Fiscal303SubmissionSupport#handleGenerate` and
`#handleSubmit`, which both funnel through the shared `generateElectronicFile`) now catch that
specific exception and answer with a clean `400` (`INVALID_DECL_TYPE` for `handleSubmit`'s JSON
error body) instead of the generic 500 the exception would otherwise bubble up to. Since the
frontend gate above already blocks this path through the UI, this is defense-in-depth only.

#### Troubleshooting — `CheckException: Property declSeq does not exist for entity ETGO_Fiscal_Decl` (ETP-5187)

The backend counterpart of the rectificativa flow is a dedicated `decl_seq` DECIMAL(10,0) column on
`ETGO_Fiscal_Decl` (`FiscalDeclCrudHandler.PROPERTY_DECL_SEQ`, `resolveNextDeclSeq`) that
disambiguates multiple declarations for the same `(client, org, model, year, period)` natural key —
see the runtime-module writeup this section is paired with. A first pass at adding that column made
every declaration creation fail with `CheckException: Property declSeq does not exist for entity
ETGO_Fiscal_Decl`, thrown from `Entity.getProperty()` at `decl.set(PROPERTY_DECL_SEQ, ...)` —
**even though the `AD_Column`/`AD_Table` rows were correct, active, and a genuine fresh runtime
model rebuild (`ModelProvider — Building runtime model`) had already run** after a full
`./gradlew smartbuild` + Tomcat restart.

**Root cause — not a build/caching issue, a property-naming mismatch:** Openbravo's dynamic
`Entity`/`Property` model (`org.openbravo.base.model.NamingUtil#getPropertyMappingName`) derives a
column's runtime Java/DAL property name from **`AD_Column.Name`** (the human-readable label, camel-
cased on both `_` and `" "`), **not** from `AD_Column.ColumnName` (the physical DB column name). The
generated entity bean under `src-gen` (`com.etendoerp.go.schemaforge.data.FiscalDecl`) is the
ground truth for this: it names the constant from the exact same derivation, so it always shows the
real registered property name in its javadoc (`Property declarationSequence stored in column
Decl_Seq in table ETGO_Fiscal_Decl`) — check that file first, don't assume the property name mirrors
the column name.

This column's `AD_Column.Name`/`AD_Element.Name` was set to the spelled-out `"Declaration
Sequence"` (consistent with the sibling columns `declarationType`/`declarationStatus`/
`declarationFileName`, all spelled out rather than abbreviated), so the real runtime property is
`declarationSequence` — not the abbreviated `declSeq` that `PROPERTY_DECL_SEQ` was first given
(which would only be correct if the property name mirrored the physical column name `Decl_Seq`
instead of the AD_Element name). **Fix:** `PROPERTY_DECL_SEQ = "declarationSequence"` — a pure
Java string-literal fix, no DB/XML/AD metadata change, no `update.database`, no `smartbuild`
required. A plain recompile (`./gradlew compile.complete`) plus redeploying the compiled classes
into the running Tomcat (`./gradlew build.deploy.class` — or a full app-server restart) is enough.

**General lesson (worth re-checking any time a new `AD_Column` is added to any table across
`etendo_schema_forge`, `schema_forge_core`, or `com.etendoerp.go`):** when writing Java that
references a new column by a hand-rolled `PROPERTY_*` string constant, verify the exact spelling
against the generated `src-gen/.../<Entity>.java` bean's own `PROPERTY_*` constant (or query
`AD_Column.Name` directly) — never assume the property name is a mechanical transform of the DB
column name. A short, spelled-out `AD_Element.Name` and a long/abbreviated physical
`AD_Column.ColumnName` (or vice versa) are common and both valid; only `AD_Column.Name` drives the
Java property name.

#### Known gap — declarations CRUD resolves org differently than boxes/generate/submit

`DECL_SEQ`'s natural key is `(client, org, model, year, period)` (see `resolveNextDeclSeq` above),
and the `org` half of that key comes from `FiscalDeclCrudHandler`'s own org resolution — every one
of its entry points (`handleDeclGet`, `handleDeclPost`, `handleDeclPut`, `handleDeclDelete`, and its
shared incident lookup) reads `OBContext.getOBContext().getCurrentOrganization().getId()` directly,
verified against the current source. This is a **different, narrower** resolution than
`AbstractFiscalHandler#resolveEffectiveOrg()` — the method the boxes/operators/generate/submit
family of endpoints (`Fiscal303BoxesHandler`, `Fiscal349BoxesHandler`, etc.) all call instead:
`resolveEffectiveOrg()` additionally handles a session parked at the `*` (summary/"0") organization
level by falling back to the client's first non-summary leaf org, whereas `FiscalDeclCrudHandler`
has no such fallback and would create/query/delete declarations scoped to org `"0"` verbatim in that
case. **Pre-existing, not introduced or fixed by ETP-5187** — `resolveNextDeclSeq`/`DECL_SEQ` simply
inherited whatever org `handleDeclPost` was already resolving; nothing in this ticket changed that
resolution. Practical impact is narrow (a session actually parked at `*` for a fiscal-models
action), but worth knowing: in that scenario, a declaration's CRUD-side `org` and the org the same
declaration's box/operator computation resolves to via `resolveEffectiveOrg()` need not be the same
value. Flagged as a follow-up, not fixed here.

### Identification section (`tipo_declaracion` + bank data)

The top of the Boxes tab shows the declaration type selector and, conditionally, the bank data section (`datos_bancarios`).

**`tipo_declaracion` options:** `C` (Compensación), `D` (Devolución), `I` (Ingreso), `U` (Domiciliación), `N` (Resultado cero), `V` (Devolución cta. corriente), `X` (Devolución transferencia extranjero).

**`datos_bancarios` visibility** (`sectionVisibleWhen`, ETP-4456, narrowed by the ETP-5393
manual-QA fix): shown when `tipo_declaracion ∈ {U, D, X}` — the only types AEAT allows an IBAN
for outside a rectificativa (error `EDID065` rejects the submission if IBAN is present for any
other tipo) — **or** when `rectificativa` is checked **AND** box 111 (`_box111NonZero`, see
"Manual box overrides") is non-zero, regardless of tipo. `sectionVisibleWhen` is an `anyOf` of
`{tipo ∈ U,D,X}` and an `allOf` of `{rectificativa == true, _box111NonZero == true}` — not a flat
tipo list, and not "rectificativa alone" any more. The `rectificativa` branch exists because
Classic's backend (`checkBox111MandatoryParams`/`checkIsDeclarationRMandatoryParams` in
`AEAT303Report2021`) requires the full bank-data block (BANK/IBAN/SWIFT/SEPA/ADDRESS/CITY/COUNTRY)
for **any** rectificativa carrying a non-zero box 111, independently of `tipo_declaracion` — so a
tipo-`I` (or `C`/`N`) rectificativa with a real box 111 amount still needs the section visible.
**ETP-5393 manual-QA fix:** the original ETP-4456 follow-up gated visibility on "rectificativa
checked" alone (any box 111 value), on the theory that this was a harmless UX-only over-show since
the required-mark already tracked box 111 correctly. Manual QA confirmed that reads as a real bug
from the user's seat: unchecking rectificativa, or clearing box 111 back to 0, left the whole
bank-data block sitting on screen — just without the asterisk — instead of disappearing. Visibility
now tracks the exact same condition as requiredness (see `_BANK_FULL_BLOCK_REQUIRED_WHEN` below),
so the section (and its fields) hide/show together with the required-mark instead of drifting.

**Section title** varies by tipo:
- `D`, `X` → "Devolución"
- `U` → "Domiciliación"

**Field-level visibility (`_BANK_DVX_VW`)** — SWIFT/BIC, Bank name, address, city, and country
share the same `anyOf` condition as the section itself (`tipo ∈ {D, V, X}` **or**
`rectificativa` checked **AND** box 111 non-zero), so each is visible for exactly the cases the
section is visible for, including a tipo-`I`/`C`/`N` rectificativa with a non-zero box 111. `tipo
V` is no longer dead code: before the ETP-4456 fix `V` could never reach the field gate because
the section was hard-gated to `{U, D, X}` only; now, if `rectificativa` is checked and box 111 is
non-zero, the section becomes visible for tipo `V` too, and the field-level `tipo ∈ {D, V, X}`
clause is already satisfied — so these fields correctly render for a tipo-`V` rectificativa.
`bank_iban` is the one exception: it has no field-level `visibleWhen` gate of its own, so its
visibility is governed solely by the section-level `sectionVisibleWhen` — which is exactly why its
`requiredWhen` (condition A OR B, see "Bug E" below) lines up one-to-one with when it can actually
be seen and filled in.

Both the section-level and field-level gates are evaluated by one shared `matchesSvw` function
(`FmBoxes303.jsx`, unified as of `789547fde`). Before that commit, `FmBoxes303.jsx` carried a
second, independent, `anyOf`-unaware visibility filter for individual fields — once
`sectionVisibleWhen`'s shape changed to `anyOf`, that second filter silently broke into an
always-true evaluation, wrongly showing these fields for tipo `U` too. `matchesSvw` is also
hardened against a malformed non-array `anyOf` (`f322ee41a`), returning `false` rather than
throwing.

### Identification checkboxes → AEAT params (`applyIdentParams`) — ETP-5027

`applyIdentParams` (`fiscalModelsUtils.js`) is the single shared function that turns
`identChecks` (the `casillas`/`identificacion` form state) into the HTTP params used by both
the file-generation path (`generate303File`) and the AEAT online-submission path
(`AeatSubmitFlow.jsx`) — so a checkbox is either wired here once, or silently ignored by both
paths. Confirmed wirings, verified against the AEAT303 Java source
(`org.openbravo.module.aeat303.es`, override chain unbroken through `AEAT303Report2025`):

| `identChecks` field | AEAT param | Notes |
|---|---|---|
| `redeme` — "Sujeto pasivo inscrito en el Registro de devolución mensual (art. 30 RIVA)" | `MonthlyRegister` = `'Y'` | `AEAT303Report.java`'s `MONTHLY_REGISTER` constant; box 65 defaults to "not registered" (`2`) unless this is explicitly `Y`. Before ETP-5027 this checkbox updated only local UI state and was never forwarded — checking it produced no effect on the filed declaration (AEAT rejection `35092`/`E010124` on a Devolución with a negative result). |
| `concurso` — "Sujeto pasivo declarado en concurso de acreedores…" | `IsConcurso` = `'Y'` | `AEAT303Report2014`'s `"IsConcurso"` constant, read unchanged through the override chain to `AEAT303Report2025`. Was not forwarded before ETP-5027. |
| `postconcursal` | `ConcursoType` = `'Y'` | `AEAT303Report2014`'s `"ConcursoType"` constant (`preConcursal = !"Y".equals(ConcursoType)`); only meaningful when `concurso` is also checked. Was not forwarded before ETP-5027. |
| `fecha_concurso` (paired with `concurso`) | `ConcursoDate` = `ddMMyyyy` digits, no separators | **Fixed in ETP-5272 pt.7** — see below. Only sent when `concurso === true` and a date is actually present. |

**ConcursoDate — fixed, was silently missing (ETP-5272 pt.7).** `fecha_concurso` was collected and
displayed but never forwarded alongside `IsConcurso`/`ConcursoType` — `applyIdentParams` simply had
no line for it. `AEAT303Report2014.java:350-372`'s `ConcursoDate` handling is unchanged through
`AEAT303Report2025`, but `AEAT303Report2023` and later throw
`@AEAT303_Bad_Bankruptcy_Statement_Date_Format@` when the field is missing/blank on a concurso
declaration, and 2021/2022 silently ship 8 blank spaces into that record slot instead. Fixed with a
new `formatAeatConcursoDate(raw)` helper (`fiscalModelsUtils.js`) that formats the date-only
`fecha_concurso` value (always a plain `yyyy-MM-dd` string from its `<input type="date">`, per
`fm303Layouts.js`) into AEAT's strict `ddMMyyyy` digit format — via the canonical
`parseCalendarDate` (this project's date-only parsing policy), never a hand-rolled `new
Date(string)` parse — and sets `ConcursoDate` in `applyIdentParams` whenever `concurso === true`
and a date actually formats to something (returns `null`, and sends nothing, on
blank/undefined/unparsable input). `fecha_concurso` is also now marked `required: true` in both
`fm303Layouts.js` identification field lists (`BASE` and `_2024_IDENTIFICACION_FIELDS`), so the
gate feeding `getMissingRequiredFields` (see "Required-field pre-flight gate" above) stops a blank
concurso date from reaching this point in the first place — the field was previously optional
despite being conditionally mandatory.

**`dep_aduanero`/`dep_foral` checkboxes — REMOVED entirely (ETP-5272 pt.7), not just left unwired.**
ETP-5027 originally investigated both and left them present-but-unwired (see the evidence below).
ETP-5272 went further and removed both fields (and their `fm.ident.dep_aduanero`/`fm.ident.dep_foral` locale keys) from
`fm303Layouts.js`'s identification sections outright — a UI control with zero effect on the filed
declaration is misleading, not merely incomplete, and both were dead ends confirmed against the
real Classic source (evidence retained below for the historical record):
- **`dep_aduanero`** ("derecho a deducir pago a cuenta de entregas de gasolinas, gasóleos y
  biocarburantes…") — no reference to this concept (`gasolina`/`gasoleo`/`biocarburante`/
  `deposito`) exists anywhere in the AEAT303 Java source across any year override as a checkbox
  input. It corresponds conceptually to the real AEAT record position **box 112**, which Classic
  hardcodes to `0` unconditionally (see "Manual box overrides" above) — there was never a live
  input to wire this checkbox to.
- **`dep_foral`** ("tributa exclusivamente a una Administración tributaria Foral…") — a real
  param, `IVA_IMPORT_ADUANA_HFORAL`, existed and was read from input params in
  `AEAT303Report2018`. Starting with `AEAT303Report2019` (and unchanged through
  `AEAT303Report2021`, with no later override reintroducing it through `AEAT303Report2025`),
  `generatePage1` hardcodes this position to `"2"` (not foral) unconditionally, ignoring any
  input param entirely — confirmed the checkbox has had zero effect on any filed declaration since
  2019.

Both fields were left in place (present-but-unwired) through ETP-5027 and only removed in
ETP-5272 once the functional owner confirmed a UI control with no possible effect should not stay
on the form at all. If either concept is ever reintroduced, it needs a NEW real backend
computation behind it first — reusing the old id/labelKey would misleadingly imply a fix to a
Classic limitation that still exists.

### Box-to-AEAT-param wiring — `BOX_PARAM_MAP` completeness (ETP-5391)

`BOX_PARAM_MAP` (`fiscalModelsUtils.js`) is the box-value counterpart of `applyIdentParams`'s
checkbox table above: it maps an AD box number to the exact AEAT request-param name
`applyBoxParams` forwards it under, on both the file-generation path (`generate303File`) and the
AEAT telematic-submission path (`AeatSubmitFlow.jsx`). A box with no entry here is editable in the
UI but silently dropped — identical failure mode to an unwired `identChecks` checkbox before
ETP-5027.

Four boxes had exactly that gap and are now fixed — all four already existed as editable UI rows
in the (always-visible, not last-period-gated) `resultado_final` section; only their `BOX_PARAM_MAP`
entry was missing:

| Box | AEAT param | Note |
|---|---|---|
| 65 | `ToPublicTreasury` | "Atribuible al Estado" %, `atribuible_estado` row. Also the same value casilla 107 (`territorio_comun`) mirrors in the UI — see "Last-period-only sections" below. `AEAT303Report2014.java:818` and `AEAT303Report2018LastPeriod`'s `commonTerritory()` both read this one key off box 65, so 107 needs no `BOX_PARAM_MAP` entry of its own. |
| 70 | `ComplementaryAmt` | "A deducir" — complementary/rectifying-return amount to deduct, `a_deducir` row. Gated server-side by `IsComplementary=Y` (`AEAT303Report2014.java:946-958`). |
| 76 | `REG_CUOTAS_ART80` | Regularización cuotas art. 80.cinco.5ª LIVA, `reg_cuotas_art80` row (`AEAT303Report2014LastPeriod`). |
| 77 | `IVA_IMPORT_ADUANA` | IVA de importación liquidado por la Aduana pendiente de ingreso, `iva_importacion` row (`AEAT303Report2014LastPeriod`). |

### Live data

When in real mode, `FmModel303Page` reads `liveBoxes` / `liveSummary` from the `_precomputed` field passed at navigation. The compute button triggers a fresh `computeBoxes303` call. File generation calls `generate303File(decl, { token, apiBaseUrl })` → `GET /fiscal303/generate?year=&period=&tipo=`.

### Manual box overrides — shared derivation, mount-time hydration, and KPI/list parity (ETP-5272 pt.6)

`GET /fiscal303/boxes` (`computeBoxes303`, backed by `Fiscal303BoxesHandler`) always computes
purely from **invoice data** — no declaration id, no `manualData` input at all — so its response
never reflects a user's manual box overrides (`decl.manualData.manualOverrides`, persisted only by
an explicit user action — **Guardar** or **Calcular** — via `persistEditableFields()`; see the
"Architecture pivot" note under "Action bar" above — there is no background autosave anymore).
Every consumer that wants the TRUE, override-aware figures
must merge overrides onto the raw response and re-derive the boxes AEAT computes FROM other boxes
(45, 46, 64, 66, 69, 71) — this ticket found and fixed 3 separate places that were reading the raw,
override-blind backend value instead, plus extracted the merge/derive logic itself so the 3rd bug
can't recur as a 4th.

**Shared helpers — `fiscalModelsUtils.js`.** `toBoxArray`, `applyOverrides`, and
`recomputeDerivedBoxes` used to be private, near-duplicated functions living inside
`FmModel303Page.jsx` only. They are now exported from `fiscalModelsUtils.js` — the single source
of truth for "merge `manualOverrides` onto a box set, then re-derive every box the AEAT 303 formula
computes from other boxes" — and `getBoxValue` (reads one box out of the array shape, `null` when
absent, distinct from a present box valued `0`) moved alongside them. `FmModel303Page.jsx` and
`FmListPage.jsx` (the list's own "Resultado" column, see below) both import from this one module
now. **Do not re-implement this merge/derive logic locally in a new caller** — that duplication is
exactly how this bug class happened in the first place; import the shared functions instead.
`recomputeDerivedBoxes`'s formula (mirrors `AEAT303Report2026.java` exactly, see box 111/112 below):

```
box45 = Σ(29,31,33,35,37,39,41,42,43,44)      // total_deducir
box46 = box27 - box45                          // Resultado régimen general
box64 = box46 + box58 + box76
box66 = box64 * (box65 / 100)                  // box65 = territorial split %, defaults to 100
box69 = box66 + box77 - box78 + box68 + box108
box71 = box69 - box70 + box109 - box112        // Resultado de la liquidación (final result)
```

**Bug 1 — mount-time hydration never applied saved overrides.** The mount `useEffect` that seeds
`liveBoxes` from `decl._precomputed` (the raw, override-free payload `FmListPage`'s
`useFiscalAutoCompute` already fetched before this page mounted — see "Auto-compute architecture"
above) used to set `liveBoxes` directly from that raw payload, bypassing `applyOverrides`
entirely. A user's saved manual edits were invisible until they manually clicked "Calcular" to
re-run a fresh compute (which DID go through the merge). Fixed: the mount effect now routes
`decl._precomputed` through the same `applyComputeResult` helper `handleCompute`/"Calcular" use, so
the already-hydrated `manualOverrides` are merged in immediately on open, with **no extra network
call** — this reuses the payload already in hand.

**Bug 2 — the "Resultado" KPI showed box 46, not box 71.** `res.summary.result` (from the backend)
is box 46, "Resultado régimen general" — an intermediate figure under a "standard company"
assumption (100% state attribution via box 65, no territorial split, no manual adjustments). The
real final liquidation result is **box 71**, "Resultado de la liquidación", which correctly
reflects a territorial-split override (box 65) or any other manual input through
`recomputeDerivedBoxes`. `applyComputeResult` now overwrites `summary.result` with
`getBoxValue(mergedBoxes, 71)` (falling back to the raw backend value only if box 71 is somehow
absent), and the KPI card's own live-recompute fallback (`liveBoxSummary`, further down the same
file) had its backing variable renamed `kpi46` → `kpi71` and repointed from `getBoxValue(liveBoxes,
46)` to `getBoxValue(liveBoxes, 71)` for the identical reason.

**Bug 3 — the "Deducible" KPI showed a manual-entry-blind box 45.** Box 45 ("total_deducir") sums
boxes 29,31,33,35,37,39,41,42,43,44 — and 42/43/44 (compensaciones régimen agricultura,
regularización bienes de inversión, prorrata definitiva) are **pure manual entries** the backend
never receives, so the raw `summary.deductible` silently assumed all three were 0. Fixed alongside
Bug 2, in the same `applyComputeResult`: `deductible` is now also re-derived from `mergedBoxes`.
`accrued` (box 27, IVA devengado) needed no such fix — it has no manual-entry inputs anywhere in
its formula.

**Bug 4 (list page) — the list's own "Resultado" column had the same box-46 bug as #2,
independently.** `FmListPage.jsx`'s row-level result computation (`computed.summary.result`, fed
by its own `useFiscalAutoCompute` calls, entirely separate from the detail page's compute) read the
same raw, override-blind backend value. Fixed by importing the same shared
`applyOverrides`/`recomputeDerivedBoxes`/`getBoxValue` trio: the row merges `decl.manualData
?.manualOverrides ?? {}` onto `computed.boxes` and reads box 71, so the list and the detail page
can no longer disagree about the same declaration's result. **`ResultCell` in the same file is dead
code** (not rendered anywhere — the table cell renders `ResultText` instead) and was deliberately
left un-fixed and un-deleted: an existing test (`__tests__/FmListPage.test.js`) asserts on its
source directly and that suite was out of scope for this consolidated fix. If `ResultCell` is ever
reactivated, it must receive the identical override-merge treatment described here — it currently
does not.

**Boxes 111 and 112 — investigated and confirmed correct, not touched.** Both were suspected of a
similar wiring gap during this audit; neither needed a fix, but the investigation is recorded here
so it is not silently reopened later:
- **Box 112** ("Pago a cuenta de entregas de gasolinas… régimen de depósito distinto del
  aduanero") IS a real position in the AEAT `.303` record — confirmed directly in
  `AEAT303Report2026.java` (`org.openbravo.module.aeat303.es`) — but Classic hardcodes it to
  `NumericAmount303(BigDecimal.ZERO)` unconditionally; there is no regime implementation behind it
  in Classic at all, for any year. `recomputeDerivedBoxes` above already treats it as `get(112)`
  (defaults to 0 when absent, exactly matching Classic's own hardcoded zero) in the box 71 formula
  — there is nothing more to wire, because there is no real computation on the other end to wire
  it TO. This is the same underlying AEAT concept the removed `dep_aduanero` checkbox referred to
  (see "Identification checkboxes" above, ETP-5272 pt.7) — both trace back to the same
  never-implemented Classic regime.
- **Box 111** ("Rectificación de cuotas" — used on a rectificativa) is filed **independently** of
  the ordinary box 71 chain — confirmed against `AEAT303Report2014.java`'s
  `checkBox111MandatoryParams`/`checkIsDeclarationRMandatoryParams`, unchanged through the override
  chain to `AEAT303Report2025` (see "Identification section" above, which already documents its
  bank-data visibility gating) — it does not feed into `recomputeDerivedBoxes`'s formula at all,
  by design, matching Classic's own handling. This is expected behavior, not a gap.

### Six bugs found during live QA of a corrective-invoice period (ETP-5393)

Found together while testing period 09/2026 with a sales corrective invoice and a purchase
corrective invoice that happened to share a `documentno` — all four are independent root causes.

**Bug A — Sources tab React key collision.** `FmTabContent.jsx`'s `SourcesTab` keyed each source
row by `r.ref` (the invoice's `documentno`) alone. AR and AP invoice numbering sequences are
independent, so a sales invoice and a purchase invoice can legitimately share the same
`documentno` (confirmed live: two different invoices, one sales one purchase, both `REC-1000000`)
— a genuine React duplicate-key collision, silently dropping one of the two rows from the DOM.
`Fiscal303SourcesSupport.buildNewInvoiceRow` (com.etendoerp.go) already grouped rows internally by
`inv.getId()` (correctly unique) but never put that id into the row map it returns, so the
frontend had no collision-free identifier to key on. Fixed by adding `id: inv.getId()` to the row
map (`Fiscal303BoxesHandler.buildResponse`'s generic per-field serialization loop picks it up
automatically — no separate wiring needed there) and keying `SourcesTab`'s `<tr>` on `r.id ?? r.ref`
(the `?? r.ref` fallback only matters transiently, for a frontend deployed ahead of the backend).
This tab is shared with Modelo 349 (`FmModel349Page.jsx`), so the fix applies to both models, not
just 303.

**Bug B — "IVA deducible"/"Resultado" KPIs show "—" (NaN) instead of a computed value.** A JS
type-coercion bug in the shared box-derivation helper, not a calculation error.
`Fiscal303BoxesHandler.buildResponse` serializes every box value as a JSON **string**
(`BigDecimal#toString`). `toBoxArray` (`fiscalModelsUtils.js`) passed that string straight through
unchanged, so `recomputeDerivedBoxes`'s numeric accumulator did string concatenation the first
time any of boxes `[29,31,33,35,37,39,41,42,43,44]` carried a non-zero string value (e.g.
`0 + "-0.63"` → `"0-0.63"` → `Math.round(Number("0-0.63") * 100)` → `NaN`) — box 45 became `NaN`
and cascaded through 46/64/66/69/71. It surfaced only now because this org's first purchase
invoice with box-33-worthy VAT supplied the first non-zero string operand that triggers the path;
every declaration before it had these boxes genuinely at `0` (a number, from the JS default, not
yet a string). `getBoxValue`'s `??` in `applyComputeResult` does not catch `NaN` (only
`null`/`undefined`), so the correct backend fallback (`res.summary?.deductible`) was never used
either. Fixed by coercing `value` to `Number` inside `toBoxArray` itself (`fiscalModelsUtils.js`)
— the single place both `FmModel303Page.jsx` and `FmListPage.jsx`'s own "Resultado" column consume
box data — plus an explicit `Number.isFinite` guard in both `applyComputeResult`
(`FmModel303Page.jsx`) and the equivalent list-row computation (`FmListPage.jsx`) so a future
numeric regression can't again silently mask the correct backend value behind a plain-looking "—".

**Bug C — no sign validation on editable boxes 111 and 77.** Classic's `AEAT303Report` engine
hard-rejects a negative value for box 111 ("Rectificación – Importe",
`AEAT303Report2024.java:276-278`, `@AEAT303_Negative_Not_Allowed_For_111@`) and box 77 ("IVA a la
importación liquidado por la Aduana pendiente de ingreso", `AEAT303Report2015.java:149-162`,
`@AEAT303_Negative_IVA_IMPORT_ADUANA@`) at file-generation time — these are the only two editable
boxes with such a rule (confirmed by grepping the classic module for every `isNegative()`/`signum()`
check). Go's previsualización had no equivalent check anywhere in the chain. Fixed on both ends:
- **Frontend** (`FmModel303Page.jsx`'s `handleBoxChange`): a negative commit on box 111 or 77 is
  clamped to `0` and surfaces `ui('fm.box.error.negative_not_allowed', { box })` as a toast error
  — the same "make the invalid state structurally impossible" approach already used for the
  box78/box110 clamp (ETP-5338 pt.2, see above). `FmBoxes303.jsx` also sets `min="0"` on these two
  boxes' `<input type="number">` as a UX hint (not the actual enforcement — a browser `min` does
  not block typing or blur).
- **Backend** (`FiscalDeclCrudHandler.handleDeclPut`): a new `rejectNegativeManualBoxes` guard
  inspects `manualData.manualOverrides` for boxes `"111"`/`"77"` and rejects the whole PUT with
  400 if either is negative, leaving the declaration record completely untouched — unlike a
  malformed `manualData` blob (tolerated elsewhere in this handler, see "Manual box overrides"
  above), a negative value on either of these two boxes is a real business-rule violation, not
  something to silently swallow.

**Bug C follow-up — stale draft value reappeared on reopening a box's editor (`FmBoxes303.jsx`).**
Manual QA of the box78 clamp surfaced a pre-existing, unrelated UX bug in the same inline box
editor: type `-12` into an editable cell, let `handleBoxChange` clamp it to `0` on commit, then
click the pencil icon to reopen that same cell — the editor showed the pre-clamp draft `-12`
again instead of the persisted `0`. The cause is `pendingValues` (the editor's in-progress draft
state, keyed by box number): the input's `onBlur`/Enter commit handler cleared `editingCell` but
never deleted the box's own entry from `pendingValues`, so the next time that cell's editor
opened, `renderCellInput`'s `value={pendingValues[boxNum] ?? ...}` preferred the stale leftover
draft over the actual, already-committed value. Fixed with three small helpers threaded through
both the "Boxes" grid and the identification-section box inputs: `clearPendingValue(boxNum)`
deletes a single box's draft; `startEditingCell(boxNum)` calls it before opening the editor (so a
reopen always starts from the current persisted/displayed value); `commitCellEdit(boxNum)` calls
it right after the commit (so a fresh edit never inherits a previous session's draft either).
`Escape` also now routes through `clearPendingValue` instead of leaving the draft in place. This
is a pure input-hygiene fix — it does not change what value ends up persisted, only what the
editor shows the next time it opens.

**Bug D — deleting a draft declaration with incidents failed with a 500.**
`FiscalDeclCrudHandler#handleDeclDelete` calls `OBDal.getInstance().remove(decl)` without first
deleting the declaration's `ETGO_Fiscal_Decl_Incident` rows. The FK `ETGO_FDI_DECL_FK`
(`etgo_fiscal_decl_incident.etgo_fiscal_decl_id → etgo_fiscal_decl.etgo_fiscal_decl_id`) had no
`ON DELETE` behavior (`NO ACTION`), so Postgres rejected the header delete whenever the
declaration had at least one incident row (e.g. after a failed AEAT submission attempt that
reverted to draft) — the user saw an opaque 500 ("No se pudo eliminar la declaración."), and
declarations with zero incidents deleted fine, which is why this went unnoticed. Fixed the same
way as the identical class of bug in `ETGO_INVITATION_USER_FK` (ETP-4830): adding
`onDelete="cascade"` directly to `ETGO_FDI_DECL_FK` in
`src-db/database/model/tables/ETGO_FISCAL_DECL_INCIDENT.xml` — this is `update.database`'s actual
source of truth (forward XML→DB only), so unlike a raw `ALTER TABLE` against the live DB, it is
never reverted by a rebuild. No change was needed in `handleDeclDelete` itself: `OBDal.remove`
issues the same DELETE either way, and Postgres now cascades it to the incident rows. Verified by
running `update.database` locally and confirming `pg_constraint.confdeltype = 'c'` for
`etgo_fdi_decl_fk`, then inserting a draft declaration + incident row and deleting the declaration
directly — the incident row is removed automatically, no FK violation.

**Bug E — `bank_iban` was required unconditionally whenever `datos_bancarios` was visible.**
`fm303Layouts.js`'s `bank_iban` field carried a static `required: true` inside the
`datos_bancarios` section, whose `sectionVisibleWhen` is an `anyOf` of "tipo U/D/X" OR
"rectificativa checked". For tipo U/D/X, AEAT genuinely requires IBAN unconditionally (error
EDID065) — that part was correct and is unchanged. But for a rectificativa filed under any OTHER
tipo (e.g. `I`), Classic's `checkBox111MandatoryParams` only requires the bank fields
(IBAN/BIC/bank/address/city/country/SEPA) when box 111 (Rectificación – Importe) is non-zero — a
rectificativa with box 111 == 0 does not need bank data at all. The static flag ignored box 111
entirely, blocking "Generar fichero"/"Marcar como Presentado" on IBAN even when AEAT itself
wouldn't require it.

Fixed by making `required` conditional:
- `fm303Layouts.js` adds `requiredWhen` support (alongside the existing static `required`) via a
  new `isFieldRequired(f, identification)` helper, and `matchesVisibility` gained `allOf`
  (AND-of-conditions) support alongside its existing `anyOf`. `bank_iban` is now:
  `requiredWhen: { anyOf: [{ tipo_declaracion in [U,D,X] }, { allOf: [rectificativa == true,
  _box111NonZero == true] }] }`.
- `_box111NonZero` is a synthetic key — box values live in `liveBoxes`, not the `identification`
  object `matchesVisibility` reads. `fiscalModelsUtils.js`'s new `withBox111NonZeroFlag(identification,
  liveBoxes)` merges it in; both `FmModel303Page.jsx`'s `getMissingRequiredFields` call site and
  `CasillasTab`'s `identification` prop to `FmBoxes303` route through it, so the pre-flight gate
  and the red-asterisk rendering (`FmBoxes303.jsx`, now calling `isFieldRequired` instead of
  reading `f.required` directly) always agree.
- No server-side duplicate of this specific validation exists in `com.etendoerp.go` today
  (`Fiscal303SubmissionSupport`/`Fiscal303BoxesHandler`/`FiscalDeclCrudHandler` were checked) — the
  backend forwards IBAN/BIC/etc. verbatim to the classic `OBTL_TaxReport_I` engine, which is the
  actual point of AEAT-rule enforcement (rejects with EDID065-class errors at generation time).
  This bug's fix is frontend-only pre-flight UX; no backend change was needed or made.

**Bug E follow-up — SWIFT/BIC and the other bank fields were left out of the fix above.** The
initial Bug E fix only added `requiredWhen` to `bank_iban`. A follow-up review confirmed
`checkIsDeclarationRMandatoryParams`/`checkBox111MandatoryParams` (`AEAT303Report2021`/`2026`)
require the **full** bank-data block — BANK/IBAN/SWIFT/SEPA/ADDRESS/CITY/COUNTRY — under the exact
same condition, not just IBAN; the other 6 fields (`bank_swift_bic`, `bank_nombre`,
`bank_direccion`, `bank_ciudad`, `bank_pais`, `bank_sepa`) had no requiredness at all (only the
field-level `visibleWhen: _BANK_DVX_VW`), so they never got the red asterisk and were never
enforced by `getMissingRequiredFields`, even though AEAT rejects the submission if any of them is
blank under that condition.

Fixed (initial version, since corrected below — see "Bug E follow-up, corrected") by extracting the
shared condition into a single `requiredWhen` and assigning it to all 7 bank fields (`bank_iban`
included, now reading from the same constant instead of its own inline literal). No changes were
needed anywhere else in the chain: `isFieldRequired`/`getMissingRequiredFields` (`fm303Layouts.js`)
and the red-asterisk rendering (`FmBoxes303.jsx`) are already generic over any field carrying
`requiredWhen`, so declaring the condition on the field definition is the only change that was
required — `FmModel303Page.jsx`'s pre-flight gate picks up all 7 fields automatically.

**Bug E follow-up, corrected — the full block was wrongly required for a plain devolución too.**
Manual QA on the fix above found it over-broad: for **condition A alone** (tipo `U`/`D`/`X`, no
rectificativa — a plain devolución/domiciliación), AEAT error EDID065 only requires **IBAN**, not
the full bank block. `checkIsDeclarationRMandatoryParams`/`checkBox111MandatoryParams`'s "full
block" requirement is specific to **condition B** — a rectificativa carrying a non-zero box 111
(`rectificacion_importe`) — independent of `tipo_declaracion`. The single shared
`requiredWhen` (condition A OR B) applied to all 7 fields conflated the two, so a plain tipo `D`
devolución incorrectly demanded SWIFT/BIC/bank name/address/city/country/SEPA in addition to IBAN.

Fixed by splitting the condition into two constants in `fm303Layouts.js`:
- `_BANK_IBAN_REQUIRED_WHEN` — condition A OR B (unchanged from the original Bug E fix) — assigned
  only to `bank_iban`.
- `_BANK_FULL_BLOCK_REQUIRED_WHEN` — condition B ONLY (`{ allOf: [rectificativa == true,
  _box111NonZero == true] }`) — assigned to the other 6 fields (`bank_swift_bic`, `bank_nombre`,
  `bank_direccion`, `bank_ciudad`, `bank_pais`, `bank_sepa`).

Net effect: for a plain tipo `D`/`U`/`X` devolución/domiciliación, only `bank_iban` shows the
required-mark and is enforced by `getMissingRequiredFields`; the other 6 render (still gated by
`_BANK_DVX_VW`) without the asterisk and are not required. The full block becomes mandatory only
once a rectificativa also carries a non-zero box 111 — exactly condition B. One asymmetry is
intentional and unchanged: `bank_iban` has no field-level `visibleWhen` (only the section gate), so
for tipo `U` (Domiciliación) it alone is visible/required — the other 6 stay hidden (and thus never
reported as missing) because `_BANK_DVX_VW` excludes tipo `U` on purpose.

**Bug E follow-up, manual-QA (ETP-5393) — the block stayed VISIBLE after reverting the very
condition that had shown it.** The "corrected" fix above made *requiredness* track condition B
exactly (`_BANK_FULL_BLOCK_REQUIRED_WHEN`), but *visibility* (`_BANK_DVX_VW`'s rectificativa
branch and `datos_bancarios.sectionVisibleWhen`) still gated on "rectificativa checked" alone —
deliberately, on the theory (recorded in the code comment at the time) that this was a "harmless
UX-only over-show" since the asterisk already tracked box 111 correctly. Manual QA on a real
declaration disproved that: check "Autoliquidación Rectificativa", enter a non-zero box 111 → the
bank block appears, as expected. Then either clear box 111 back to 0 (rectificativa still checked)
**or** uncheck rectificativa (tipo not U/D/X) → the required-mark correctly disappears, but the
whole bank-data block stays sitting on screen. From the user's seat this reads exactly like the
"sticky"/non-reactive bug it looks like, even though the underlying `matchesVisibility` evaluation
is itself always freshly recomputed on every render (no memoization or stale caching was involved —
confirmed by direct component-level and full-page RTL rerender tests before this fix).

Fixed by widening the rectificativa branch of `_BANK_DVX_VW` and
`datos_bancarios.sectionVisibleWhen` from `{ field: 'rectificativa', equals: true }` to
`{ allOf: [{ field: 'rectificativa', equals: true }, { field: '_box111NonZero', equals: true }] }`
— i.e. copying `_BANK_FULL_BLOCK_REQUIRED_WHEN`'s exact condition into the visibility gate too, so
visibility and requiredness now hide/show in lockstep. `bank_iban` needed no direct change: it has
no field-level `visibleWhen` of its own and inherits the section's `sectionVisibleWhen`, which after
this fix is `{ anyOf: [{ tipo in U,D,X }, { allOf: [rectificativa, _box111NonZero] }] }` — exactly
`_BANK_IBAN_REQUIRED_WHEN`'s own condition (A OR B), so it is visible in precisely the states it is
required. Regression coverage:
`fm303Layouts.bankVisibilityReactivity.vitest.jsx` drives the real `FmModel303Page` (not a mocked
`FmBoxes303`) through the actual user flow — tab switch, checkbox click, editable-cell edit — to
show the bank block, then revert box 111 to 0 (one test) or uncheck rectificativa (a second test),
and assert the block disappears from the DOM in both cases, not just that the asterisk clears.

**Fixed in this same pass (not pre-existing debt):** narrowing Bug E's visibility condition to
require `_box111NonZero` (above) briefly desynchronized it from TWO IBAN pre-flight guards that
still tested only the OLD, superseded "rectificativa alone" condition —
`generate303File` (`fiscalModelsUtils.js`, the function behind the main "Generar fichero" button,
`FmModel303Page.jsx:535`) and `AeatSubmitFlow.jsx`'s own pre-flight guard (the "Presentar" flow).
Both were stricter than the field they were guarding: a rectificativa with box 111 == 0 correctly
hides/un-requires the bank fields in the UI, but either guard would still demand an IBAN the user
could no longer see or fill in — reachable today as tipo `I` + rectificativa checked + box 111 = 0.
Both guards now call the single shared predicate `isBankIbanRequired(tipo,
withBox111NonZeroFlag(identChecks, liveBoxes))` (`fiscalModelsUtils.js`) — the same condition
`fm303Layouts.js`'s `_BANK_IBAN_REQUIRED_WHEN` uses for the field's own `requiredWhen`/visibility,
so there is one source of truth instead of three independently-hand-copied checks.
`generate303File` and `AeatSubmitFlow` (via a new `liveBoxes` prop threaded from
`FmModel303Page.jsx`) both now have access to the live box 111 value, not just `manualOverrides`.
Covered by `fm303Layouts.bankIbanRequiredWhen.vitest.js` and a regression case reproducing the
exact broken state (tipo `I` + rectificativa + box111=0 no longer blocks generation).

**Bug F — boxes [14][15], [25][26] and [40][41] always rendered blank instead of autocalculating.**
`Fiscal303BoxesHandler.computeBoxes` never populated boxes 14/15 ("Modificación bases y cuotas"),
25/26 ("Modificaciones bases y cuotas del recargo de equivalencia") or 40/41 ("Rectificación de
deducciones") at all — they're absent from every `fillSalesBoxes`/`fillPurchaseBoxes` box-group
call, so the corresponding `fm303Layouts.js` rows (`mod_bases`, `mod_recargo`, `regularizacion`)
always showed empty cells. These rows carry no `editable`/`editableCells` flag, so they were never
manually editable either — Classic (`org.openbravo.module.aeat303.es`) has always computed all
three pairs from corrective/credit-memo invoices only (`InvoiceType.ONLY_MEMO_AND_CORRECTIVE`),
over the SAME TaxRate sets Go already resolves for the "normal" boxes:
- **[14][15]**: union of VAT_SALES_GENERAL ∪ VAT_SALES_EU ∪ VAT_SALES_ISP TaxRates —
  `AEAT303Report2014.java#generateSalesLines`, ~lines 424-513 (`modificacionBICuotaTaxRates`
  accumulator, comment `- Modificación bases y cuotas [14] [15]` at line 509).
- **[25][26]**: the VAT_SALES_EC (recargo equivalencia) TaxRates — same method, ~lines 556-568
  (comment `Modificaciones bases y cuotas del recargo de equivalencia [25] [26]` at line 564).
- **[40][41]**: union of every VAT_PURCHASE group's TaxRates (Normal_Operations,
  Investment_Goods, Import_Goods, Import_Investment_Goods, Intracommunity_Goods,
  Intracommunity_Investments) — `AEAT303Report2014.java#generatePurchaseLines`, ~lines 618-689
  (`rectificacionDeduccionesTaxes` accumulator, comment `Rectificación de deducciones [40] [41]`
  at line 685).

Fixed in `Fiscal303BoxesHandler.java` (`com.etendoerp.go`), server-side only (no data these
formulas need was already missing from Go — every TaxRate list was already being resolved for
other boxes, just not accumulated and re-queried with `ONLY_MEMO_AND_CORRECTIVE`):
- `fillGroupBoxes` now returns the `TaxRate` list it resolved (previously `void`), so callers can
  accumulate a UNION.
- `fillSalesBoxes`/`fillPurchaseBoxes` accumulate `modificacionBases` (general+EU+ISP),
  `ecTaxes`, and `rectificacionDeduccionesTaxes` (all six purchase groups) respectively, and hand
  each union to a new shared helper `fillMemoCorrectiveBoxPair(b, helper, rates, baseBox, taxBox)`
  which calls `helper.calculateAmountsMap(rates, InvoiceType.ONLY_MEMO_AND_CORRECTIVE)` — mirroring
  the classic engine's `InvoiceType.ONLY_NORMAL`-vs-`ONLY_MEMO_AND_CORRECTIVE` split exactly.
- `computeSummaryBoxes`'s `accruedBoxes` array gained `26` (cuota, mod. recargo): box 15 and 24
  were already listed there — always contributing `0` since never populated — but box 26 was
  missing entirely, which would have under-totaled box 27 as soon as it started being non-zero.
  `deductibleBoxes` already listed `41`, so box 45's total needed no change.
- `fm303Layouts.js`'s `mod_bases`/`mod_recargo`/`regularizacion` rows gained comments documenting
  they are intentionally NOT `editable` (backend-computed) — no rendering change was needed since
  they already lacked the `editable` flag.

### Editable-box/field input validation vs. the official AEAT spec (ETP-5438)

An audit cross-referenced every EDITABLE casilla/field in the Modelo 303 window against the
official AEAT "Diseño de registro" for Modelo 303 (v1.01, applies from ejercicio 2026 — the same
spec `fm303Layouts.js`'s `BASE` layout is built from). The spec's own "Nota" footer on every page
defines the field-type legend: `A` (Alfabético), `An` (Alfanumérico — letters/numbers/blanks,
left-aligned), `Num` (Numérico **sin signo** — digits only, **no negative values**), `N` (Numérico
**con signo** — negative allowed, a literal `N` marks a negative value). ETP-5393 Bug C (above) had
already fixed this exact class of gap for boxes 111/77; the audit found it was incomplete.

**Sign-guard gap — 4 more `Num` (unsigned) editable boxes had no negative guard.** Boxes 70
("Resultados a ingresar de anteriores autoliquidaciones"), 78 ("Cuotas a compensar de periodos
anteriores aplicadas"), 109 ("Devoluciones acordadas por la Agencia Tributaria") and 110 ("Cuotas
a compensar pendientes de periodos anteriores") are all declared `Num` in the spec, exactly like
111 and 77, but were left out of `NEGATIVE_NOT_ALLOWED_BOXES` (`fiscalModelsUtils.js`) and its
backend mirror `NEGATIVE_NOT_ALLOWED_BOX_KEYS` (`FiscalDeclCrudHandler.java`). Widened into the
SAME set/mechanism on both ends — no new plumbing:
- **Frontend**: `NEGATIVE_NOT_ALLOWED_BOXES = new Set([111, 77, 70, 78, 109, 110])`. `handleBoxChange`
  (`FmModel303Page.jsx`) already floors any box in this set to `0` and shows the i18n toast — no
  code change needed there, only the set. Box 78 also carries its own, unrelated relative clamp
  (≤ box110, ETP-5338 pt.2) in the same function — the negative-not-allowed floor runs FIRST, on
  the same `value` variable the relative clamp then reads, so a negative box110 commit floors to 0
  before box78's ceiling is computed from it; box78 can never inherit a negative ceiling.
- **Backend**: `NEGATIVE_NOT_ALLOWED_BOX_KEYS = Set.of("111", "77", "70", "78", "109", "110")` in
  `FiscalDeclCrudHandler#rejectNegativeManualBoxes` — same 400-and-leave-record-untouched contract
  as before.

**Alphanumeric (`An`) fields had no length limit at all.** The 6 bank identification fields
(`bank_iban`, `bank_swift_bic`, `bank_nombre`, `bank_direccion`, `bank_ciudad`, `bank_pais`) and
`nro_justificante` (rectificativa/complementaria) were plain `<input type="text">` with no
`maxLength`, despite the spec giving each a fixed record-slot width (IBAN 34, SWIFT-BIC 11, bank
name 70, address 35, city 30, country code 2, nro_justificante 13). `fm303Layouts.js` now declares
`maxLength` on each field (both the current-year rectificativa's `nro_justificante` and the
pre-2023 `_COMPLEMENTARIA_RECTIF_OP` patch's copy); `FmBoxes303.jsx`'s two identification-section
text-input render paths now forward `maxLength={f.maxLength}`. Backend mirror: a new
`rejectOversizedIdentificationFields` guard in `FiscalDeclCrudHandler.handleDeclPut` (same
400-and-leave-untouched contract, reading `manualData.identification` instead of
`manualOverrides`) rejects a PUT whose value for any of these 7 keys exceeds its limit.

**`bank_sepa` is also free text vs. the spec's 4-value enum — out of scope here, tracked
separately.** "Devolución - Marca SEPA" is actually a single-digit `Num` field on the DID page
restricted to `0`/`1`/`2`/`3` (spec's own "Nota 2: Devolución marca SEPA" table: 0 Vacía, 1 Cuenta
España, 2 Unión Europea SEPA, 3 Resto Países), same audit finding as the two gaps above. An initial
fix (converting `bank_sepa` to a `type: 'select'` with those 4 options plus a matching backend
`rejectInvalidBankSepa` guard) was reverted from this ticket — it is being handled under a separate
ticket instead, to avoid two tickets racing on the same field. Do not re-add it here.

Regression tests: `FmModel303Page.negativeBoxClamp.vitest.jsx` (4 new boxes + the box78/box110
interaction), `FmBoxes303.vitest.jsx` and `fm303Layouts.vitest.js` (`maxLength` DOM attributes /
raw layout-data assertions for the 7 alphanumeric fields), and `FiscalDeclCrudHandlerTest.java`
(the widened box111/77 set plus the new oversized-field guard, mirroring the existing 111/77 test
style).

### Last-period-only sections — "Información adicional" (ETP-5391)

The Modelo 303 detail page's "Información adicional" tab (`CASILLAS_SECTIONS`'s `info_adicional`
group in `FmModel303Page.jsx`) now renders two extra sections — matching Classic's own last-period
popup — but **only when the declaration's period is the last of the fiscal year** (`T4` quarterly or
`12` monthly, per `isLastPeriodOfYear`). For any other period they are absent from the layout
entirely: `getLayout303` (`fm303Layouts.js`) filters them out via a dedicated
`LAST_PERIOD_ONLY_SECTIONS` set, the same mechanism box 44 ("prorrata definitiva") already used for
its own last-period-only row. Both sections are plain AEAT-protocol request params forwarded
verbatim by `Fiscal303SubmissionSupport`'s `mergeAeatRequestParams` — no backend change was needed,
same mechanism as every other `BOX_PARAM_MAP`/`IDENT_PARAM_MAP` entry (see "Identification
checkboxes" and "Box-to-AEAT-param wiring" above).

- **`tributacion_territorial`** — the territorial-taxation split, four editable percent boxes plus
  one read-only derived one:
  - Casillas **89 (Álava)**, **90 (Gipuzkoa)**, **91 (Vizcaya)**, **92 (Navarra)** — editable
    percentages, each a plain `BOX_PARAM_MAP` entry (`ALAVA`/`GUIPUZCOA`/`VIZCAYA`/`NAVARRA`) read
    straight from AEAT's `AEAT303Report2018LastPeriod` last-period input params.
  - Casilla **107 (Territorio Común)** is **read-only** and always mirrors casilla **65**
    ("Atribuible al Estado", the always-visible percent box in the `resultado_final` section — see
    "Box-to-AEAT-param wiring" above). It is a `derivedValue: { box: 65, defaultValue: 100 }` row,
    rendered by `FmBoxes303`'s `renderDerivedCell`, not an independently editable field. This is
    deliberate: Classic's own `commonTerritory()` computes 107 from the exact same `ToPublicTreasury`
    value box 65 already carries, so two independently-editable UI fields for the same underlying
    AEAT param used to let a user set them to conflicting values — fixed by making 107 a live mirror
    instead of its own row. `BOX_PARAM_MAP` no longer has a 107 entry; box 65 alone is forwarded.
- **`info_adicional_ultimo_periodo`** — a leading checkbox (`declaracion_terceros`) followed by five
  plain manual-override boxes, all under this section's single heading — no separate title for the
  checkbox, matching Classic's own popup layout, which groups them together:
  - **`declaracion_terceros`** — "Presentación de la declaración anual de operaciones con terceros
    (Modelo 347)" (the Modelo 347 filing-exemption declaration). Rendered via `fm303Layouts.js`'s
    `fields` array on this (row-based, non-`identificacion`) section — `FmBoxes303.jsx` renders a
    leading `section.fields` checkbox ahead of the row grid for exactly this case, reusing the same
    Checkbox markup/behavior the `identificacion`-typed sections already use. Forwarded as the
    literal string param `347TAX_FORM = 'Y'` when checked — **not** through the generic
    `IDENT_PARAM_MAP` boolean-forwarding path the rest of `applyIdentParams` uses, because
    `AEAT303Report2019.java` compares `inputParams.get('347TAX_FORM')` against the literal string
    `'Y'`; the generic path would have sent the string `'true'` and never matched.
  - Five plain `BOX_PARAM_MAP` entries read from `inputParams` by `AEAT303Report2018LastPeriod`/
    `AEAT303Report2021`, exactly like box 44 (prorrata definitiva): casilla **95** (REAGYP — régimen
    especial agricultura/ganadería/pesca), **97** (bienes usados/objetos de arte/antigüedades/objetos
    de colección), **98** (régimen especial de Agencias de Viajes), **127** (operaciones sujetas y
    acogidas a la OSS), **128** (operaciones intragrupo, arts. 78/79 LIVA). Boxes 96 (always
    zero-filled) and 99 (computed from DB) are intentionally NOT exposed as manual inputs here.

**Percent-box validation (65, 89, 90, 91, 92).** Any cell whose column is typed `'percent'` (via
`cellTypes`/`colTypes` in `fm303Layouts.js`) is now clamped to `[0, 100]` and rounded to 2 decimal
places on blur or Enter — `FmBoxes303.jsx`'s `clampPercentValue`, applied in `renderCellInput`'s
`commit` before calling `onBoxChange`. This is the same validation for the pre-existing box 65 field
and the four new last-period territorial boxes; the HTML `max`/`min` attributes alone don't stop
someone typing `150` and tabbing away, so the clamp also runs in JS right before the value commits.

**Routing note (reconciling with box 87 below, ETP-5391 + ETP-5338 pt.2):** casilla 107 and box 87
are both a `cells: [N]` row that *also* declares a `derivedValue`, but they render through two
different paths in `FmBoxes303.jsx`'s `renderRowCell`, split on `derivedValue.treatMissingAsZero`:
- Casilla 107 (no `treatMissingAsZero`) always goes through `renderDerivedCell` — it never reads a
  real value out of `valueMap[107]` (there isn't one; see above), and it **blanks a computed 0**
  rather than showing "0,00" (confirmed for the territorial mirror specifically).
- Box 87 (`treatMissingAsZero: true`) goes through `renderBoxCell`'s own `derivedValue` fallback
  instead (see "Box 87 display-only derivation" below) — that path checks `valueMap[87]` FIRST and
  only computes the formula when it's genuinely empty, and it **shows a computed 0** as "0,00".
Both share the same underlying `computeDerivedValue(dv)` helper for the arithmetic; only the
zero-display and real-value-priority behavior differs, driven entirely by `treatMissingAsZero`.

### Box 87 display-only derivation (`derivedValue` fallback on a real box, ETP-5338 pt.2)

Box 87 ("Cuotas a compensar de períodos previos pendientes para períodos posteriores") is labeled
with the formula `(110 - 78)` right in its AEAT text, but was never populated: `computeBoxes303`
(backend) never returns a value for box 87, and it is deliberately outside
`recomputeDerivedBoxes`'s set (`{45, 46, 64, 66, 69, 71}` — see "Manual box overrides" above)
because AEAT computes and validates 110-78 themselves at submission time. The `.303` file always
uploaded correctly with box 87 blank; this was a **display-only** gap.

Fix, entirely client-side, entirely in the render layer:
- `fm303Layouts.js`'s `cuotas_compensar_post` row (still `cells: [87]`, a real box) now also
  declares `derivedValue: { box: 110, subtractBox: 78, clampMin: 0, treatMissingAsZero: true }`.
- `FmBoxes303.jsx` extracts the `derivedValue` computation (previously inlined only in
  `renderDerivedCell`, used by boxless rows like `importe_devolucion`) into a shared
  `computeDerivedValue(dv)` helper: `valueMap[dv.box]` (optionally `Math.abs`'d), minus
  `valueMap[dv.subtractBox]` when present, floored at `dv.clampMin` when present.
- `renderBoxCell` (the path for rows that DO have a real box number) now falls back to
  `computeDerivedValue(row.derivedValue)` **only when the real box has no value** from
  `valueMap`/`fixedValues`/`defaultValues` — it never overrides a genuine backend/manual value.
  This is a new, generic combination (`cells` + `derivedValue` on the same row) any future box in
  this window can reuse; it is not hardcoded to box 87.

Clamped at 0 because box 87 ("cuotas pendientes de compensar") can by AEAT definition never be
negative.

**Missing-operand semantics — confirmed with the product owner in cycle 2, and DIFFERENT from
`importe_devolucion`'s:**
- Box 110 present, box 78 missing → shows box 110 (missing box 78 treated as 0).
- Box 110 missing, box 78 present → shows `max(0, 0 - box78)` = 0 (missing box 110 treated as 0,
  then clamped).
- Both missing → stays blank (nothing to compute at all — the only blank case for this row).
- Both present → normal `max(0, box110 - box78)`.

This is implemented via a new opt-in flag on the shared helper, `derivedValue.treatMissingAsZero`,
set **only** on box 87's row. **`computeDerivedValue` branches on this flag and every other
`derivedValue` row — in particular `importe_devolucion` (box 71 minus box 70) — keeps the original,
unrelated behavior: a missing operand blanks the whole result, with no zero-defaulting.** Do not
assume the two rows behave the same; they diverge on purpose. (ETP-5338 QA cycle 1 had rejected an
earlier `?? 0` fallback that applied indiscriminately to box 87's subtrahend; that rejection
correctly caught a bug in the *implementation* — a `?? 0` with no "both missing" exception — but the
"stays blank on any missing operand" conclusion it initially shipped with was based on an AEAT
semantics assumption that was never confirmed with the user and turned out to be wrong for box 87.
Cycle 2 corrects it to the rule above, confirmed by the product owner, while leaving
`importe_devolucion` exactly as cycle 1 left it.)

Does **not** touch `manualData`, `recomputeDerivedBoxes`, `applyOverrides`, or anything sent in the
`.303` submission payload — purely a rendering fallback for a value AEAT already computes
independently.

### Box 78 auto-clamped to box 110 (ETP-5338 pt.2, scope extension)

Boxes 110, 78 and 87 are unsigned — casilla 87 clamps to 0 whenever box78 > box110 (see previous
section). box78 ("cuotas de períodos anteriores que se compensan en esta declaración") can never
legitimately exceed box110 ("cuotas pendientes de compensar de períodos anteriores") — there's
nothing to compensate beyond what's actually pending. An earlier iteration of this ticket shipped
an advisory warning banner for this case (see git history at commit `75b033d0c`); the product owner
subsequently replaced that requirement entirely: **box78 is now silently auto-clamped to box110's
value instead of merely warning**, making the invalid state structurally impossible to enter. There
is no warning banner and no submission gate for this relationship.

- The clamp lives in `FmModel303Page.jsx`'s `handleBoxChange` — the single commit path used by
  every editable box in `FmBoxes303.jsx` (`onBoxChange` fires from the box input's `onBlur`/Enter).
  On every box commit it recomputes what box78's effective value would be (`nextBox78`) against
  what box110's effective value would be after this commit (`nextBox110`); if `nextBox78 >
  nextBox110`, box78 is capped to `nextBox110` before being written into both `liveBoxes` (the
  rendered state) and `manualOverrides` (in-memory local state until "Guardar"/"Calcular" explicitly
  persist it — see "Architecture pivot" above; there is no autosave), so a later
  `handleCompute`/"Calcular" recompute — which re-applies `manualOverrides` on top of a fresh
  backend result — doesn't resurrect the un-clamped value).
- **Reactive in both directions**: because the check runs on *every* box commit (not just box78's
  own edit), typing a value into box78 greater than box110 clamps box78 immediately, **and**
  lowering box110 below an already-larger box78 re-clamps box78 downward too, keeping the
  invariant true at all times rather than only at box78's own edit time.
- **Edge case — box110 blank**: if box110 has no value at the time box78 is edited, there is
  nothing to clamp against, so box78 is accepted exactly as typed. The clamp only engages once
  both boxes hold a value.
- Does **not** touch `computeDerivedValue`/`treatMissingAsZero` (the casilla 87 display clamp logic
  stays exactly as shipped) and does **not** add any submission-time gate — the invariant is
  enforced purely at the point of entry.

### Manual box entry — no-op edit no longer wipes the saved value; 2-decimal rounding (ETP-5409)

**Bug 1 — a no-op edit silently wiped the box's saved value.** Reported as: click the pencil to
open a box's inline editor, don't type anything, click away (blur) or press Enter — the box's
previously saved value disappeared. `renderCellInput`'s `onBlur`/`onKeyDown` handlers used to call
`onBoxChange?.(boxNum, pendingValues[boxNum])` unconditionally on every commit attempt.
`pendingValues` only ever gained an entry for `boxNum` if the user actually typed a keystroke
(the input's `onChange`) — so an untouched box had no key there at all, and
`pendingValues[boxNum]` evaluated to `undefined`. That flowed into `FmModel303Page.jsx`'s
`parseBoxInput(undefined)` → `NaN` → `null`, which `applyBoxChange` treats as "remove this box
entirely", silently deleting a previously saved value on a pure no-op edit.

Fix, in `FmBoxes303.jsx`: a new `commitPendingEdit(boxNum)` helper calls `onBoxChange` **only**
when `Object.prototype.hasOwnProperty.call(pendingValues, boxNum)` is true — a presence check, not
a truthiness check, so it correctly distinguishes "never touched this edit session" (no key, skip
the commit) from "user deliberately cleared the field back to `''`" (key present with an empty
string, commits the clear). Both `onBlur` and Enter now route through `commitPendingEdit`; Escape
routes through the sibling `clearPendingValue(boxNum)` instead (discards the draft without
committing, same as before). The draft is always cleared after a commit attempt — successful or
skipped — via `clearPendingValue`, so the next edit session for that box starts clean.

**Bug 2 (found in review) — a stale draft could resurface and clobber a later external
correction.** `pendingValues` used to persist across edit sessions for the same box: if a user
committed "900" for a box, and an unrelated edit elsewhere (e.g. the box78/box110 reactive clamp —
see "Box 78 auto-clamped" above) then corrected that same box's value to "500" via a prop update,
reopening the pencil editor and blurring again with no keystroke would still see the old "900" key
in `pendingValues` and resend it, clobbering the correct "500". Fix: `startEditingCell(boxNum)` —
now wired to every pencil `onClick` — calls `clearPendingValue(boxNum)` before opening the editor,
so each edit session always starts from a clean draft with no leftover key from a previous one.

**Bug 3 — manual box entries had no decimal-place limit.** A manually typed value (e.g.
`123.456789`) used to persist with full float precision, unlike computed/derived box values, which
already round to 2 decimals by construction (`recomputeDerivedBoxes`'s own rounding). Fix:
`fiscalModelsUtils.js`'s pre-existing `roundEur(n)` helper (`Math.round(n * 100) / 100`) is now
exported and reused by `FmModel303Page.jsx`'s `parseBoxInput`, so every manually-typed box value is
capped to 2 decimals at the same choke point that already parses the raw input string — no second
rounding implementation.

None of the three fixes touch `manualData`, `recomputeDerivedBoxes`, `applyOverrides`, the box78/
box110 clamp, or anything sent in the `.303` submission payload — purely the inline-edit commit
path in `FmBoxes303.jsx` and the input-parsing choke point in `FmModel303Page.jsx`. See
`FmBoxes303.vitest.jsx` ("no-op edit" cases), `FmModel303Page.manualEntryRounding.vitest.jsx`, and
the box78 clamp tests (`FmModel303Page.box78Clamp*.vitest.jsx`, unaffected but re-verified) for
coverage.

### Organization identity

A `GET /session` call on mount populates the NIF/nombre fields used in the generated `.txt` header when `token` and `apiBaseUrl` are provided.

### AEAT electronic submission (`AeatSubmitFlow`) — ETP-4456

`PresentModal` (`FmOverlays.jsx`) has a 3rd, opt-in path (`showAeatPath` prop, only passed by
`FmModel303Page`): **"Presentación telemática AEAT"**. It reports the sentinel status
`aeat_telematic` — never a real declaration status — which `FmModel303Page.handlePresent`
intercepts to open `models/303/AeatSubmitFlow.jsx` instead of changing the status directly (the
other 2 manual paths still call `handleStatusChange` as before). A 4th path, "Otra Plataforma"
(`submitted_ext`), existed at one point but was removed from the modal (ETP-4755) —
`submitted_ext` remains a valid, fully-rendered status for declarations that already carry it, it
just can no longer be newly selected here.

**ETP-5229 item #10 — trigger rename, split-and-revert:** the single trigger button/modal was
renamed from "Marcar como 'Presentado'"/"Marcar como presentada" to **"Registrar/Presentar"**
(`fm.action.submit` / `fm.action.present` / `fm.present.title`) — a broader label that covers
both "recording a declaration already filed elsewhere" and "actually filing it via AEAT" in one
picker. Mid-implementation this same item briefly split the AEAT path OUT into its own standalone
button next to "Marcar como 'Presentado'", wired directly to `AeatSubmitFlow` with no modal in
between — that approach was reconsidered and reverted before delivery: there is **no separate
standalone AEAT button** in the action bar, and the 3-path-in-one-modal structure described above
is the final shape. `PresentModal` keeps its `showAeatPath` prop and its `aeat_telematic` card.

**Two-column redesign (ETP-5229 item #10, follow-up — Figma mockup):** `PresentModal`'s body was
restyled from a single stacked-card list into a two-column layout, mirroring the mockup: a left
column **"Registrar presentación"** (`fm.present.register_section.title`/`.desc`) always holds the
2 manual cards (`submitted_ack`, `submitted`), and a right column **"Presentar a la AEAT"**
(`fm.present.aeat_section.title`/`.desc`) holds the `aeat_telematic` card — rendered, with its
vertical separator, **only when `showAeatPath` is true**. On Modelo 349 (which never passes
`showAeatPath`) the modal shows a single full-width left column and no separator, matching the
pre-redesign single-path-set behavior. The per-card icon avatars (`Star`/`Play`/`Landmark`) were
removed; each column now carries one small header icon instead (`FileText` for "Registrar
presentación", `Landmark` for "Presentar a la AEAT"). The modal header subtitle became dynamic —
`"Modelo <model> · <period> <year>"` (reusing `fm.new_decl.preview`'s existing interpolation
pattern and `formatPeriod` from `fiscalModelsUtils.js`) — falling back to the old generic
`fm.present.subtitle` text when `decl` doesn't carry `model`/`year`/`period` (e.g. legacy test
stubs). The modal's `maxWidth` grows from 500px to 760px when the AEAT column is present, 500px
otherwise (widened from an initial 420px/640px pass after visual review found the two-column body
too cramped). None of this touches the underlying `path` selection state, `canConfirm`, or
`handleConfirm` — purely a visual/DOM restructuring, extracted into two new internal helper
components in `FmOverlays.jsx`: `PresentOptionCard` (one selectable card) and `PresentModalColumn`
(icon + heading + description + its stack of cards). The footer's separator rule line was also
dropped for this modal only (`.fm-present-modal .fm-config-modal__footer { border-top: none; }`
in `fiscal-models.css`) — the card area already reads as visually distinct from the footer, so the
divider was redundant; sibling modals (`FileGenModal`, `NewDeclModal`) keep it.

**Flow (single dedicated component, not folded into `PresentModal`** — the multi-step submit/result logic and the real API call make it noticeably heavier than the 2 simple manual paths, so keeping it in its own file avoids bloating `FmOverlays.jsx` further):

**Trigger path (and the REVIEW-cycle bug fixed in it):** the AEAT path is a card inside
`PresentModal`, not a separate button — the user opens "Registrar/Presentar" (`PresentModal`), picks the
3rd card ("Presentación telemática AEAT" / `aeat_telematic`), and confirms. `handlePresent` in
`FmModel303Page.jsx` intercepts that sentinel status and opens `AeatSubmitFlow` **instead of**
changing the status directly, like the other 2 manual paths do. Alex's REVIEW (cycle 1) found a
real blocker here: the original code opened `AeatSubmitFlow` but never called
`setShowPresent(false)`, so `PresentModal` stayed mounted underneath it — closing `AeatSubmitFlow`
resurfaced the stale path-selection screen instead of returning to the main page. Fixed by adding
`setShowPresent(false)` alongside `setShowAeatFlow(true)`; a regression-guard test assertion
(`FmOverlays.test.js`) now checks the sentinel/gating wiring stays in place.

1. **Confirm screen** — shows NIF / business name / fiscal year-period / declaration type / result / IBAN, all read from data already available client-side (`orgIdent` + `identChecks` + the current computed `summary`/`liveBoxes` — no extra API round-trip just to populate this screen). Editable presenter NIF/name (defaulted from `orgIdent`, in case the certificate holder differs from the declarant) and an optional NRC field. **NRC field visibility**: shown only when `declarationType === DECLARATION_TYPE_INGRESO` (`'I'`, exported from `fiscalModelsUtils.js`, mirroring the backend's `Fiscal303BoxesHandler.DECLARATION_TYPE_INGRESO`) — the same tipo-gating pattern as the `datos_bancarios` section above, since AEAT's own Modelo 303 spec only accepts an NRC for tipo Ingreso (backend already discards it for every other tipo, error-free but silently, before this fix — see ETP-4456). **Mandatory for `I` since ETP-5027**: the NRC label carries the standard required asterisk (`fm-aeat-required-mark`, the same marker `FmBoxes303.jsx` uses) and `handleSubmit` runs a client-side pre-flight guard immediately after the IBAN guard, keyed on `localData.declarationType` — deliberately the *stricter* expression, the exact one that controls the field's visibility, rather than the looser `tipo` (`localData.declarationType || decl?.result?.kind || 'N'`) that the IBAN guard uses. With `tipo`, an empty `declarationType` alongside `decl.result.kind === 'I'` would fire the guard against a field the user cannot see, blocking submission with no way to satisfy it. The IBAN guard keeps its own looser shape (out of scope here). A blank or whitespace-only NRC sets `connError` — reusing the existing red `Banner__aeatConnError` channel, no new UI plumbing — with `fm.aeat.error.nrcRequired`, and never reaches the backend. Previously an empty NRC round-tripped to the AEAT and failed there with an untranslated error. **The guard is skipped when `testMode` is on**: "Validar sin presentar" only validates the file, nothing is paid, so no NRC exists yet. Frontend-only, matching the IBAN precedent — the Java side is untouched.
   **Test-mode checkbox wording (ETP-5027)** — the `testMode` checkbox is labelled `fm.aeat.test_mode.label` = "Validar sin presentar" / "Validate without filing" (previously "Modo de prueba (no requiere certificado)", which read as a developer toggle rather than a functional choice). The warning banner still renders only while the box is checked, and its text is `fm.aeat.test_mode.warning` = "Esta opción únicamente valida el fichero en la AEAT. La declaración no se presenta." No separate always-visible help string was added — the functional owner chose to keep a single string, shown in the banner on check. The behaviour is unchanged; only the two locale values and their inline `??` English fallbacks moved. `data-testid="AeatSubmitFlow__testMode"` is deliberately stable, and the tests assert on the i18n key rather than the rendered text.

2. **Submit** — `POST /fiscal303/submit?year=&period=&tipo=&id=` via `useApiFetch`. No separate "check certificate" pre-flight call is made — the endpoint is called directly and `errorCode: NO_CERTIFICATE` in the response is what triggers the "no certificate" message (simpler than a `GET /neo/certificate` probe beforehand, and the backend already has the definitive answer). Full request/response contract, all `errorCode` values, and the backend-side idempotency guard: `../../../modules/com.etendoerp.go/docs/aeat-303-submit-endpoint.md`.
3. **Result screen**, branching on `response.status`:
   - `SUCCESS` — CSV, presentation date, registry/justificante numbers; a PDF download button decodes `pdfBase64` client-side (`triggerBase64Download`, new export in `fiscalModelsUtils.js`) and triggers a browser download. If `pdfDownloadFailed` is true, a distinct message is shown instead ("submitted OK, PDF fetch failed") — never implying the submission itself failed. Also calls `onSuccess('submitted_ack')`, handled by `FmModel303Page#handleTelematicSuccess` — **not** by `handleStatusChange` (ETP-5438): the backend already persisted `submitted_ack`, `submissionMethod: 'aeat_telematic'` and the submission snapshot, and the old extra PUT re-asserting the status became a submitted → submitted transition that `rejectRepresentation` answers with `409`, so the list never learned about the filing. The page updates its own `status`/`submissionMethod` and calls `onSubmittedRemotely(id, 'submitted_ack')`; `FiscalModelsPage#handleSubmittedRemotely` patches the detail view and the list (`declStatusPatch`) immediately, then re-reads the declaration (`fetchDeclaration` → `GET /fiscal303/declarations`, filtered by id) and patches both again with `status`, `submissionMethod` and `submittedSnapshot`, so the list's "Resultado" freezes on the snapshot without a manual reload. No PUT is sent on this path.
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
parity verified — 39 keys each as of ETP-5187, up from the 36 this flow originally shipped with;
the 3 added since are `fm.aeat.action.go_to_organization`, `fm.aeat.error.missingDefaultIae` (both
ETP-4975) and `fm.aeat.reminder.iaeActivity` (ETP-5187) — see "IAE-activity activation reminder"
below), plus 2 new `fm.present.path.aeat`/`aeat_desc` keys for the
`PresentModal` card and one `fm.action.continue` reused for the card's confirm-button label. The
two-column redesign added 4 more keys (parity verified in both locales):
`fm.present.register_section.title`/`.desc` and `fm.present.aeat_section.title`/`.desc` — the
section headings/subtexts above the left and right columns. No new key was needed for the dynamic
subtitle; it reuses `fm.new_decl.preview` verbatim.
**ETP-5229 item #10** renamed the shared trigger keys `fm.action.submit` (303) and
`fm.action.present` (349) plus `fm.present.title` (the modal title) from "Marcar
presentado"/"Marcar como presentada" to **"Registrar/Presentar"** ("Register/Submit" in English)
— no new keys were needed for this, since both flows already read those existing keys. The
short-lived standalone-button key `fm.action.aeat_telematic` (added, then removed, in the same
item's split-and-revert) was deleted from both locale files rather than left dangling.

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
`handleStatusChange`/`handleTelematicSuccess` (i.e. exactly when a submission succeeds). Since the automatic AEAT attach is
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
alone. `status` still covers production successes (`handleTelematicSuccess`). `receiptRefreshTick` is a
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

**Dismissible warning banner (ETP-5229 item #11).** The amber "Resuélvelas antes de generar el
fichero" bar at the top of the tab (`fm.incidents.block_sub`, rendered whenever `blocking > 0 ||
warning > 0`) has a close ("×") button that was never wired to anything — clicking it did
nothing, so the banner was effectively permanent. It is now backed by local component state
(`dismissed`, plain `useState` in `IncidentsTab`) gating the banner's render, mirroring the only
other dismissible-banner precedent in this codebase, `CertExpiryBanner.jsx`
(`tools/app-shell/src/windows/custom/fiscal-config/`), which also uses a session-only local
`useState` rather than `localStorage` — no persisted-dismissal precedent was found anywhere in
the app, so this stays per-session/per-mount, not persisted across reloads. A `useEffect` keyed
on `[blocking, warning]` resets `dismissed` back to `false` whenever either count changes: fixing
an incident (count drops) or a new one appearing (count rises) both re-surface the banner rather
than leaving it silenced by a stale dismissal of a now-different problem set. Known limitation
(accepted, not fixed): if the *set* of incidents changes while the *total count* stays exactly
the same (one resolved, a different one appears in the same submission), the effect's dependency
array won't fire and the banner stays dismissed — judged an acceptable simplification since
`IncidentsTab`'s current props only expose the two counts, not the incident list, to key off of.

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
- **Rectificativas en Operadores (ETP-5027)** — `/fiscal349/operators` now also returns *corrective* operator rows inside the same `operators` array (ordered after all regular rows), plus a sibling `rectificativeSummary` object. Every row carries a `rectificative` boolean (`false` on regular rows, never omitted), so badging needs no `undefined` handling; `isRectificativeOp()` in `FmModel349Page.jsx` only normalizes the boolean/string shapes NEO can emit.
  - **The amounts are signed deltas and are usually NEGATIVE** — a rectification removing 3 units of a 10 EUR product reports `-30`. They are rendered through `formatAmount` (which delegates to the canonical `formatCurrency('EUR', …)`) and are **never** `Math.abs()`'d: a negative subtotal is the expected, valid case, tinted via `.fm-349-amount--negative` for legibility only, not as an error state.
  - Corrective rows are **excluded** from the regular `TotalsCard` per-key totals and from the "Total operaciones" KPI, so their deltas never net off against the regular base. They are summarized separately by `RectificativeSubtotalCard`, rendered as its own card in the same left column under the totals card.
  - **`rectificativeSummary` carries per-key totals ONLY (`totalE`/`totalS`/`totalA`/`totalI`) — there is deliberately no grand `total`, and `RectificativeSubtotalCard` renders no "Total rectificativas" row.** `E`/`S` are *entregas* (sales) and `A`/`I` are *adquisiciones* (purchases); the AEAT never nets one against the other, so `E + S + A + I` is not a quantity that means anything. The first pass did emit it and produced figures like `-32,00 + -5,00 = -37,00`, and would have rendered `0,00` for a `-30` sales correction offset by a `+30` purchase correction (ETP-5027, QA F1). `summary` has always omitted a grand total for the same reason, and both objects now go through the single `Fiscal349BoxesHandler#buildKeyTotals(totalsByKey)` shape. Do not reintroduce the row. A legacy cached payload that still carries `total` is ignored by the card.
  - **No double-counting**: the "Rectificaciones" KPI and tab badge stay fed exclusively by `rectifications`. Corrective *operator* rows describe the same business events and must not bump that count — there is an explicit regression test for this in `FmModel349Page.rectifications.vitest.jsx`.
  - Row identity moved from `op.id` to `rowKey(op)` (`bpId|key|R|<declared period>`): a regular and a corrective row can describe the same operator *and* key, so `bpId` alone is not unique for React keys or row selection.
  - **Corrective rows carry `declaredYear`/`declaredPeriod`, and the declared period is part of `rowKey` (ETP-5027, QA F4).** The DAO groups corrective rows by `(BPId, TaxKey, Year, Period)`, so correcting the same partner's 2025/T1 *and* 2025/T2 sales of goods in one declaration — ordinary AEAT 349 usage — legitimately produces two rows sharing `(bpId, key, rectificative)`. `appendOperators` used to drop `Year`/`Period`, so `bpId|key|R` was identical for both: duplicate React keys, and — because `selected` is keyed by that same string — **ticking one row's checkbox ticked the other**. The subtotals were always arithmetically correct; this was presentation and selection only. Regular rows come from `getTaxBaseAmountPerBusinessPartner`, which groups by `(BPId, TaxKey)` alone and carries no `Year`/`Period`, so the two keys are emitted **only when present** and regular rows keep exactly their previous shape. The `RectificativeBadge` also renders the period (`fm.m349.rectificative_period`, "Rectificativa {period}" / "Corrective {period}", e.g. "Rectificativa 1T 2025") so the two rows are distinguishable on screen, falling back to the plain `fm.m349.rectificative` when the backend sent no period.
  - The existing key filter and name/NIF search need no change — corrective rows flow through the same predicates and are picked up for free (covered by a test).
  - i18n: `fm.m349.rectificative` ("Rectificativa") and `fm.m349.rectif_subtotal.title` ("Subtotal rectificativas"), in both locales. (`fm.m349.rectif_subtotal.total` was removed together with the grand-total row.)
  - **Corrective rows are marked by the `RectificativeBadge` alone — there is no row-background tint.** The first pass also tinted the whole `<tr>` amber (`.fm-349-row--rectificative`); the functional owner reviewed it on screen and rejected it as too heavy across a full-width table, so both the class usage and its CSS rule were removed. Do not reintroduce a row tint. The rows still carry `data-rectificative="true"`, which is a test/selector hook, not styling.
- **Facturas origen** — source invoice drill-down. Clicking an operator's origin link pre-filters by the composite `(nifIva, key)` of the row that was clicked, not by NIF-IVA alone (see the per-key origin scoping above). The active filter is rendered as a removable chip labelled `fm.m349.origin_filter.operator` ("Operador {nif}") with a `fm.m349.origin_filter.clear` clear action, plus a count badge. Each invoice row carries a per-invoice AEAT349 classification key (`E`/`S`/`A`/`I`), resolved server-side by `Fiscal349BoxesHandler#resolveInvoiceKeys` — this is what the Operadores tab's per-key origin scoping (above) relies on.
- **Rectificaciones / Incidencias / Ficheros** — coming soon.

### KPIs

Four cards (Operadores, Total operaciones, Rectificaciones, Pendientes VIES) sourced from `_precomputed.operators`. Each operator's `vies` value (`'valid'`/`'invalid'`/`'pending'`, driving both the Operadores row badge and the Pendientes VIES count) is derived server-side by `Fiscal349BoxesHandler#mapViesStatus` from the operator's BusinessPartner VIES status (`C_BPartner.EM_OBTIK_VIESStatus`, the same "Estado VIES" field editable on the Contact/BusinessPartner record): `'V'` → `valid`, `'I'` → `invalid`, anything else (null/blank/`'P'`) → `pending` (ETP-4755 — previously this field was never populated, so the badge always defaulted to `pending` regardless of the contact's real verification status).

### VIES banner and the "Validar VIES" action (ETP-5027)

The informational banner above the KPIs renders whenever `viesPending > 0` and the user has
not dismissed it. Its **"Validar VIES"** button re-runs the validation for the declaration's
pending NIF-IVAs — before ETP-5027 it was a `<button>` with no `onClick` at all and did nothing.

- **Endpoint**: `POST /neo/fiscal349/validate-vies?year=YYYY&period=PP` → `200 { validated, valid,
  invalid, notEligible, failed, stillPending }`. **POST-only** — the call mutates `C_BPartner` and
  the endpoint answers 405 to a GET. `validated` is every pending operator the call *accounted
  for*, deduplicated by `bpId` (one partner spans several operator rows — one per AEAT key, plus
  rectificative rows — and is checked once).
  `valid + invalid + notEligible + failed + stillPending === validated` **always** holds, and the
  UI relies on that invariant. Note `validated` is not necessarily the "Pendientes VIES" KPI
  value: the KPI counts distinct *NIF-IVA* (`viesIdentity`), the endpoint distinct *partners*.

  The five outcome buckets each imply a **different next action**, which is why they are five and
  not one (ETP-5027, QA F2/F5):

  | Bucket | Meaning | Next action |
  |---|---|---|
  | `valid` / `invalid` | VIES answered conclusively **and** the answer was written back to `C_BPartner` | none |
  | `notEligible` | the partner failed the eligibility gate (`EM_OBTIK_Tax_ID_Key != '2'`, or a blank `taxid`) or no longer exists | **permanent** — fix the partner record; a re-run can never change it |
  | `failed` | VIES answered conclusively but the write-back did not land | transient — retry |
  | `stillPending` | genuinely inconclusive: VIES could not answer (timeout, `MS_MAX_CONCURRENT_REQ`), or the partner was deferred past the batch cap of 25 | transient — retry |

  **`valid`/`invalid` are derived from what was actually PERSISTED, never from the in-memory
  answers.** `persistViesStatuses` returns the ids whose `UPDATE` reported an affected row, and
  anything conclusive that is missing from that set becomes `failed`. Before this, a failed
  `UPDATE` was swallowed by a `log.warn` while the response still said `valid: 20`, so the user
  was told the job was done and then reloaded to 20 still-pending badges. An `UPDATE` matching
  zero rows counts as failed too — same user-visible consequence as a thrown error.

  **`notEligible` must never be folded back into `stillPending`.** The frontend copy for
  `stillPending` invites a re-run; a gate failure fails the same gate on every future click, so
  merging the two produced an unbreakable loop with no explanation. A partner the gate could not
  even *read* (a row-level DB error) is in **neither** bucket — that is transient and falls
  through to `stillPending` so the next click retries it. Row-level errors in both the gate and
  the persist phase are isolated per id: previously the gate's `catch` sat outside its loop, so
  one unreadable row silently discarded every candidate not yet processed.

  `validate349Vies` in `fiscalModelsUtils.js` reads all six through `num()`, which defaults to 0,
  so a payload from a backend predating the split still parses.
  Wrapped by `validate349Vies(decl, { token, apiBaseUrl })` in `fiscalModelsUtils.js`,
  which returns `{ ok: true, ...counts }` or `{ ok: false, error, serverMessage }` — the same
  contract as `generate349File`, including `parseServerMessage()`, because a user-initiated
  button has to say *why* nothing changed (`compute349Operators`'s bare `null` cannot).
- **No DB connection is held during the network phase (ETP-5027, QA F3).** `DalRequestFilter`
  binds the Hibernate session — and with it a pooled JDBC connection — to the request thread for
  the whole request, and `handleValidateVies` runs `computeOperators` (a dozen HQL queries)
  before the VIES calls. Without an explicit release, `invokeAll(…, 120 s)` would block with a
  transaction open and a connection pinned (25 partners over 4 threads is typically ~60 s), so a
  few users clicking the banner at once could exhaust the pool **instance-wide**.
  `Fiscal349BoxesHandler#releaseDalConnection()` therefore does a `flush()` +
  `commitAndClose()` between the gate phase and the network phase; the persist phase then
  re-acquires a fresh session via `OBDal.getInstance().getConnection()`, and
  `DalRequestFilter`'s own end-of-request commit tolerates an already-closed session. This is
  safe because everything still needed is already materialized (a `JSONObject` plus plain-JDBC
  `ViesCandidate` value objects) — no detached entity is touched after the release. Ordering is
  pinned by `testDalConnectionIsReleasedBeforeTheViesPhase`. **Any new DB work added between the
  gate and the network phase re-introduces the pinning** — put it before the release.
- **Double-submission**: the button is `disabled` + `aria-busy` and swaps its label to
  `fm.m349.banner.vies_validating` while in flight, backed by a synchronous
  `validatingViesRef` guard for the window before React commits the state. Each run is a bulk
  of live, rate-limited calls to the member states' services — overlapping runs are what earn a
  `MS_MAX_CONCURRENT_REQ` rejection.
- **Refresh**: on success the handler calls `invalidateFiscalComputeCache(decl.id)` and then
  `handleCompute()`, so the row badges, the "Pendientes VIES" KPI and the banner (all three read
  the same `operators` array) move together. On failure it returns early — the displayed statuses
  are left exactly as they were, never blanked.
- **Why the cache has to be invalidated**: `useFiscalAutoCompute` caches each declaration's
  compute payload in `sessionStorage` (`fiscal_ac_v3_<declId>`) and, on every run of its mount
  effect, restores the cached payload whenever `checkModifiedFn` says nothing changed.
  `checkModified349` only asks whether the period's **invoices** changed, while a VIES
  revalidation updates **business partners** — so it answers `false`, the pre-validation payload
  is restored, and the old VIES badges are repainted over the fresh ones, making the button look
  inert. Bumping the `fiscal_ac_vN_` key version does **not** fix this: a version bump only
  discards payloads written by a *previous build*, whereas the stale entry here was written
  seconds ago by the running build under the current version. The entry must be deleted by id,
  which is what `invalidateFiscalComputeCache` (exported from `useFiscalAutoCompute.js`) does.
  Regression coverage, including the stale repaint itself, is in
  `__tests__/useFiscalAutoCompute.invalidate.vitest.js`.
- **Result feedback** — a `sonner` toast built by `buildViesResultMessage`, **aggregate counts
  only**. There is deliberately no per-error-code breakdown ("why is this one pending?"): classic
  collapses every inconclusive VIES answer into "pending" and GO matches it. Outcomes:

  | Outcome | Channel | es_ES |
  |---|---|---|
  | nothing attempted | `toast.info` | "No había ningún NIF-IVA pendiente de validar" |
  | all valid | `toast.success` | "4 NIF-IVA procesados: 4 válidos" |
  | mixed | `toast.warning` | "4 NIF-IVA procesados: 3 válidos, 1 inválido" |
  | some/all still pending | `toast.warning` | "4 NIF-IVA procesados: 2 válidos, 2 siguen pendientes; puedes volver a intentarlo" |
  | write-back failed | `toast.warning` | "2 NIF-IVA procesados: 1 válido, 1 comprobado pero no se pudo guardar; inténtalo de nuevo" |
  | not eligible for VIES | `toast.warning` | "3 NIF-IVA procesados: 1 válido, 2 no se pueden consultar en VIES (necesitan clave de NIF intracomunitario y NIF-IVA)" |
  | request failed | `toast.error` | `serverMessage`, else "No se pudo ejecutar la validación VIES. Inténtelo de nuevo." |

  Fragment order is fixed and part of the sentence: **valid, invalid, failed, notEligible,
  pending** — conclusive first, then the two actionable buckets, then the retryable one, which
  always closes. Any non-zero bucket other than `valid` keeps the toast off the success channel.

  The headline says "procesados", not "comprobados", because `validated` counts operators the
  call *accounted for*, including the ones it declined to check.

  **`notEligible` names the cause; `stillPending` still does not.** The ineligible bucket points
  at the partner record (it needs an intra-community tax-id key and a VAT number) and
  deliberately offers **no retry**, because retrying can never change it. `stillPending` keeps
  conflating two *transient* outcomes — VIES answered inconclusively (timeout, or the very common
  `MS_MAX_CONCURRENT_REQ`, which France returns on essentially every attempt right now) and the
  partner was deferred past the batch cap of **25 partners per call**. Blaming the VIES service
  would be false for the deferred case, so the copy attributes no cause and offers a re-run and
  nothing more. A non-zero `stillPending` is a routine outcome, not an edge case.
- **Banner sub-copy corrected**: `fm.m349.banner.vies_sub` used to read "Validación VIES
  asíncrona — informativa, no bloqueante". That was factually wrong — `bptaxidkey`'s
  `ViesStatusObserver` calls `ViesService.checkVat()` **synchronously inside the
  business-partner save transaction** (blocking up to the `HttpURLConnection` timeout), and this
  button is synchronous too. It now reads "Consulta en vivo al servicio VIES — informativa, no
  bloquea la declaración" (EN: "Live call to the VIES service — informative, does not block the
  declaration"). What is non-blocking is the *declaration*, not the call.
- **i18n keys added** (all three locales — `en_US`, `es_ES`, `es_AR`):
  `fm.m349.banner.vies_validating`, `fm.m349.vies.result.none`, `.processed_one/_many`,
  `.valid_one/_many`, `.invalid_one/_many`, `.pending_one/_many`, `.failed_one/_many`,
  `.not_eligible_one/_many`, `.error`. Singular/plural pairs are picked in code because
  `useUI()` does `{param}` substitution only — it has no plural rules.

### Action bar and kebab menu

The kebab menu (`MoreOptionsMenu349`) now only has two entries: **VIES** and **"Vista previa PDF"**. "Generar fichero 349" is no longer in the kebab — it is a standalone button in the action bar (`onClick={() => setShowFilegen(true)}`), positioned next to **"Registrar/Presentar"** (renamed from "Marcar como 'Presentado'" — ETP-5229 item #10). Both buttons — along with "Guardar" and "Calcular" — are wrapped `{!isSubmitted && ...}` (ETP-5438): "Generar fichero 349" used to be unconditionally visible regardless of submission status, but is now gated on submission status exactly like "Registrar/Presentar", so the whole primary-action group disappears once the declaration reaches a submitted-family status. See "Freeze once presented — recalculation/re-presentation guard (ETP-5438)" above for the full rationale and the matching backend guard.

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
  - **Software vendor NIF (ETP-5187 point 6):** Modelo 303's and Modelo 390's `OBTL_Tax_Report_Parameter` seed data (`org.openbravo.module.aeat303.es`'s `303_Report_Tax_Parameters.xml` and `org.openbravo.module.aeat390.es`'s `390_Report_Tax_Parameters.xml`, respectively) both hardcode an `EDDNIF`/"NIF Empresa Desarrollo" constant identifying the software vendor, seeded to Openbravo's `B31733934`. **Only Modelo 303 was fixed under ETP-5187** — every `taxReportGroup`'s `constantValue` in `303_Report_Tax_Parameters.xml` was updated via a proper dataset export to Etendo's `B75117705`. **Modelo 390 was deliberately left unfixed** — `390_Report_Tax_Parameters.xml` still carries the old `B31733934` on every `taxReportGroup` row — per an explicit user decision to defer it out of this ticket's scope, not an oversight; do not assume it was fixed alongside 303, and do not edit `aeat390.es`. The Modelo 349 tax report definition (`org.openbravo.module.aeat349.es/referencedata/standard/349_Tax_Parameters.xml`) carries **no such parameter** — verified: no `EDDNIF` searchKey, no hardcoded `constantValue` matching a NIF pattern. Nothing to fix here; both `use349Pdf.js` (PDF preview) and `Fiscal349BoxesHandler#handleGenerate` (real `.349` file, via `OBTL_TaxReport_I#generateElectronicFile`) resolve the declarant's own NIF dynamically and never touch a vendor-identity constant.

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

### Resultado sign-coloring — KPI and list column (`resolveResultColors`, ETP-5236)

The Modelo 303 detail page's "Resultado" KPI (`FmModel303Page.jsx`) and the declarations list's "Resultado" column (`ResultText` in `FmListPage.jsx`) both color the result by the AEAT result kind's sign, through one shared helper — `resolveResultColors(resultKind)` in `fiscalModelsUtils.js` (a `RESULT_COLOR_MAP` lookup): `'I'` (a ingresar — the org owes money) renders green, via the `--status-success-{bg,fg}` tokens; `'V'`/`'C'` (a devolver / a compensar — refundable or offsettable) render blue, via `--status-info-{bg,fg}`; anything else (`'N'`, null) keeps the neutral styling (`hsl(var(--muted))` / `hsl(var(--foreground))`) this always had. `FmModel303Page.jsx` originally carried its own local copy of this mapping (`RESULT_COLOR_MAP`/`resolveResultColors`); it now imports the shared export instead, so the two call sites cannot drift apart. Modelo 349 declarations don't currently produce `I`/`V`/`C` result kinds (see "Result in list view" below), so in the shared list only 303 rows are actually colored by this today — the code path itself is shared across both models, not gated to 303.

### Toolbar filters, KPI badges, and "+ Nueva declaración" — hardcoded Spanish under en_US (ETP-5338)

Reported via manual testing with the English locale selected: the year/model/status
`FilterDropdown` labels ("Todos los años" / "Todos los modelos" / "Todos los estados"), the
"+ Nueva declaración" CTA, the model dropdown option labels ("Modelo 303"/"Modelo 349"), and two
KPI card labels/badges ("Por vencer" / "Esta semana", "Incidencias" / "Requiere revisión") were
Spanish string literals in `FmListPage.jsx`, never routed through `t()`/`useUI()`, so they stayed
in Spanish regardless of the selected locale. All of the corresponding `fm.*` keys already existed
in all 3 locale files (`fm.filter.all_years/all_models/all_statuses`, `fm.action.new_declaration`,
`fm.kpi.upcoming`/`fm.kpi.upcoming_sub`, `fm.m303.kpi.incidents`/`fm.kpi.incidents_sub`,
`fm.config.m303.title`/`fm.config.m349.title`) — this was a "forgot to call the existing key"
regression from rapid iteration, not a missing-translation gap. Fixed by wiring each literal
through the existing `t`/`ui` (`useUI()`) already in scope in `FmListPage.jsx`.

Same fix also covers the row's "Última actualización" date (`normDecl`'s `updatedAt` field): it
was formatted with a hardcoded `toLocaleDateString('es-ES')`, always rendering the Spanish
`DD/MM/YYYY` shape regardless of locale. Now reads the active locale via `useLocaleSwitch()`
(the same hook `components/ui/date-range-popover.jsx` uses) and formats with the BCP-47 tag
derived from it.

**Addendum — Modelo 349's `periodLabel` month name (ETP-5338).** A related but distinct bug found
in the same sweep: `FmModel349Page.jsx`'s breadcrumb/page-title `periodLabel` (`"{year} / {month
name}"`) built its month name with `new Intl.DateTimeFormat(undefined, { month: 'long' })`. Passing
`undefined` as the locale does not fall back to the app's UI locale — it resolves to the
**runtime's/browser's default locale** (typically the OS language), so under an es-language OS the
month name rendered in Spanish ("octubre") even with the in-app language toggle set to English, and
vice versa. Fixed the same way as `normDecl.updatedAt` above: read the active locale via
`useLocaleSwitch()` and convert it to a BCP-47 tag (`appLocale.replace('_', '-')`, defaulting to
`es-ES`) before handing it to `Intl.DateTimeFormat`, so the month name now tracks the UI locale
toggle instead of the host environment.

Modelo 303's period label was checked as part of the same fix and confirmed **unaffected** — it
never calls `Intl.DateTimeFormat` at all. 303 periods are AEAT period codes (`1T`/`2T`/`3T`/`4T`,
monthly codes, etc.), not calendar month numbers, and its label is built by the model-specific
`formatPeriod()` helper, which maps codes to i18n keys directly rather than deriving a month name
from a `Date`. There was no locale leak to fix on 303.

### Sort and search (ETP-4755)

**Sort** is a real field-selector popover, not a bare toggle. Clicking "Ordenar" opens a list of sortable fields (`SORT_FIELDS` in `FmListPage.jsx`: Modelo, Año, Período, Estado), explicitly modeled on `components/contract-ui/ListView.jsx`'s existing `sortColumn`/`sortDirection`/`handleSortSelect`/`handleClearSort` pattern — clicking a field sorts ascending, clicking the same field again flips to descending. A **"Limpiar orden"** entry, shown only once a field is active, resets `sortColumn` to `null`, restoring the default order (year + period, most recent first).

**Search** was removed entirely — the search input/icon button is gone from the toolbar. Narrowing the list is handled by the existing year/model/status `FilterDropdown` filters instead.

### Row hover actions — Edit/Delete/Reactivar (`FmRowActions`, ETP-5187, ETP-5338)

Each **draft** declaration row (`decl.status === 'draft'`) reveals a small Edit/Delete icon pair on
row hover, in a dedicated last column (`<th style={{ width: 72 }} aria-hidden="true" />` /
`<td style={{ position: 'relative' }}>`). A **submitted/submitted_ack** row (excluding
`aeat_telematic` — see below) instead reveals a single **Reactivar** icon in the same column. Any
other row (`submitted_ext`, or a submitted/submitted_ack row filed via `aeat_telematic`) renders the
same empty `<td>` (keeps column alignment) but no icon at all.

`FmRowActions.jsx` is a window-local component — **not** the generic
`components/contract-ui/RowQuickActions.jsx` used by schema-driven windows (sales-invoice, etc.):
that component's hooks (`useDocumentAction`/`useNeoAction`) assume a `specName`/entity backend
contract this fully-custom window (no `decisions.json`/`contract.json`) doesn't have. `FmRowActions`
mirrors its hover-reveal visual language (`.fm-row-actions`/`.fm-row-action-btn` in
`fiscal-models.css`, plain CSS keyed off the existing `.fm-table tbody tr:hover` rule rather than
Tailwind's `group/row` utility) but exposes only the actions this window actually needs — no clone,
no email/send, no kebab menu. Each of the 3 actions (`onEdit`/`onDelete`/`onReactivate`) only
renders when its handler prop is passed — the component has no status awareness of its own, the
caller (`FmListPage`) decides which case a row is in and passes only the matching handler(s). This
is also why an ineligible Reactivar row gets **no button at all**, not a disabled one: `FmListPage`
simply never passes `onReactivate` for it (`{!isDraft && canReactivate(decl) && <FmRowActions
onReactivate={...} .../>}`) — there is no code path that renders a disabled/grayed-out Reactivar
button.

- **Edit** calls the same `onSelect` callback the row's own `onClick` already used, so it's
  identical to clicking the row.
- **Delete** opens the app's one delete-confirmation dialog
  (`components/contract-ui/DeleteConfirmDialog.jsx`, `count={1}`) rather than a hand-rolled confirm
  — it's mounted only while a delete is pending (`{deleteTarget && <DeleteConfirmDialog .../>}`),
  matching this file's own `showNewDecl`/`showCatalog` conditional-mount convention; mounting it
  unconditionally with `open={false}` was tried first and rejected — `DialogContent` reaches for
  lucide-react's `X` icon at render time regardless of `open`, which needlessly drags that
  dependency (and, in tests, an extra icon to mock) into every render of this page. Confirming
  calls `deleteDeclaration(id, { token, apiBaseUrl })` (`fiscalModelsUtils.js`, `DELETE
  /fiscal303/declarations?id=`); on success the row is removed from `FmListPage`'s own `decls`
  state (no refetch), on failure a toast (`fm.list.delete_failed`) is shown and the row stays.
- **Reactivar** (ETP-5338) opens a small non-destructive confirmation dialog
  (`ReactivateConfirmDialog`, a local `FmListPage.jsx` component built from the same `Dialog`
  primitives as `DeleteConfirmDialog` but with its own copy/testids — not that shared component,
  whose title/message are hardcoded to the delete flow), mounted only while a reactivation is
  pending (`{reactivateTarget && <ReactivateConfirmDialog .../>}`, same conditional-mount
  convention). Confirming calls `persistDeclarationStatus(id, 'draft', { token, apiBaseUrl })`
  (`fiscalModelsUtils.js`, `PUT /fiscal303/declarations?id=` with `{ "status": "draft" }`, no
  `submissionMethod` sent); on success the row's `status` is patched to `'draft'` in `FmListPage`'s
  own `decls` state (no refetch — the row immediately re-renders as a draft row, with Edit/Delete
  instead of Reactivar), on failure a toast (`fm.list.reactivate_failed`) is shown and the row
  stays as-is.

**Reactivar eligibility** (`canReactivate(decl)` in `FmListPage.jsx`): `decl.status === 'submitted'
|| decl.status === 'submitted_ack'`, **and** `decl.submissionMethod !== 'aeat_telematic'`.
`submitted_ext` is deliberately excluded — it's a legacy status that predates `submissionMethod`
(the "Otra Plataforma" path that used to produce it was removed from `PresentModal`, see the
Status lifecycle section above) and reactivating it was not requested by ETP-5338. A declaration
with no `submissionMethod` at all (any declaration submitted before ETP-4755 shipped) is treated as
reactivatable — `submissionMethod` is only ever `'aeat_telematic'` when a real AEAT submission set
it, so absence is the safe default, not an ambiguous one.

**Backend defense in depth**: `FiscalDeclCrudHandler#handleDeclDelete` (already existed, wired to
`DELETE /fiscal303/declarations?id=`) rejects (409) deleting anything but a `draft` declaration —
previously it had no status check at all and would delete any declaration regardless of status,
relying entirely on the frontend to only ever show the action for drafts. `#handleDeclPut` (ETP-5338)
now similarly rejects (409) any PUT that sets `status: "draft"` on a declaration whose *currently
stored* `submissionMethod` is `aeat_telematic` — read from the declaration record itself, not from
whatever the request body claims, so this can't be bypassed by a client that simply omits or
falsifies the field. Each of these frontend/backend gate pairs is independent; either gate alone
would have been insufficient.

**Applies to Modelo 349 too, with no model-specific code.** `FmListPage.jsx` renders one shared
table for both models — `canReactivate`, the `isDraft`/hover-column logic and `FmRowActions` never
branch on `decl.model`, and `persistDeclarationStatus`/`deleteDeclaration` always hit
`/fiscal303/declarations?id=<id>` regardless of which model the declaration belongs to (the path
name is legacy; the handler resolves the record by `id` against the generic `ETGO_Fiscal_Decl`
table). On the backend, `FiscalDeclCrudHandler#handleDeclPut`'s `aeat_telematic` guard reads
`PROPERTY_SUBMISSION_METHOD` off the stored record with no model filter either. 349's own status
lifecycle (`draft`/`submitted`/`submitted_ack`) and `submissionMethod` values (`manual_ack`/
`manual_no_receipt` — see "AEAT electronic submission" above: 349's `PresentModal` never passes
`showAeatPath`, so a 349 declaration's `submissionMethod` can never be `aeat_telematic`) line up
with `canReactivate`'s conditions without any adaptation. Practical effect: a submitted/
submitted_ack Modelo 349 row already shows the Reactivar icon and reactivates correctly today,
and — since 349 never produces `aeat_telematic` — the exclusion clause simply never triggers for
it, which is the correct behavior for a model with no telematic-submission concept, not a gap.

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

### IAE-activity activation reminder (ETP-5187, adjacent scope)

A non-blocking heads-up toast reminds the user to configure the organization's default IAE
("Impuesto de Actividades Económicas") activity — required by AEAT303's backend report code
(`org.openbravo.module.aeat303.es`, `AEAT303_Utility.doPreviousChecks`) for the **last period**
of the fiscal year (4T quarterly, or December monthly) — at the two moments the user commits to
a path that will eventually need it, before they ever reach that period:

1. **Activating Modelo 303 in the catalog** (`FmCatalogPage.jsx`'s `toggleModel`) — fires only on
   the inactive → active transition of `303` specifically, never on deactivation and never for
   `349` (which has no such requirement).
2. **Selecting period T4 or 12 in "Nueva declaración"** (`FmOverlays.jsx`'s `NewDeclModal`, the
   period-grid button `onClick`) — fires only when the currently selected model is `303` and the
   clicked period is `T4` (quarterly) or `12` (monthly); it does not fire on `349`, on any other
   period, or on every render/period-list rebuild — only on that specific button click.

Both call the same shared helper, `showIaeActivityReminder(t, navigate)` (exported from
`fiscalModelsUtils.js`), which shows a `sonner` `toast.warning` (`fm.aeat.reminder.iaeActivity`)
whose message is built as one JSX node so the CTA — an underlined, bold text link
(`fm.aeat.action.go_to_organization` — the same CTA label the ETP-4975 hard guard below uses,
rendered the same way there too via the shared `.fm-link-btn`/`.fm-link-btn--bold` CSS classes) —
reads inline at the end of the warning sentence rather than as a separate control, and navigates to
`/organization`, plain — `OrganizationPage.jsx` has no section-anchor/deep-link support yet to land
pre-scrolled at "Actividades del IAE" (see `docs/generated-custom-windows/organization.md`'s own
"Actividades del IAE" section); that would be a follow-up, not implemented here. The same inline,
bold placement is used everywhere else this CTA appears — the `connError` banner in
`AeatSubmitFlow.jsx` (the NRC-required guard, described above under "Confirm screen") and the
`genError` banner in `FmModel303Page.jsx` (the ETP-4975 pre-flight guard, see immediately below).

**This is deliberately a different mechanism from the ETP-4975 hard guard** — `missingIaeGuard`/
`isMissingDefaultIaeActivity` in `AeatSubmitFlow.jsx`/`FmModel303Page.jsx` — fully documented in
`docs/generated-custom-windows/organization.md`'s "Modelo 303 pre-flight guard — both buttons"
section, **not** in this file: this file's only section literally titled "Generate error banner
(`genError`)" is further below, under "Modelo 349 detail page", and covers a distinct, unrelated
concern (`AEAT3492010Report`'s own validation exceptions on the 349 file-generation path) — do not
confuse the two `genError` states, they belong to different pages and different guards. The ETP-4975
guard is authoritative: it runs a real `GET /sws/neo/organization/actividadesDelIae` check right
before "Generar fichero"/"Marcar como Presentado" for the actual last-period declaration, and blocks
the action when nothing qualifies. This reminder never blocks anything and never checks the
backend — it is purely an earlier, informational nudge so the user isn't surprised later by the
hard guard.

### "Nueva declaración" respects the active catalog

`NewDeclModal` (in `FmOverlays.jsx`) receives an `activeModels` prop from `FmListPage` and builds its model list from `Object.keys(activeModels).filter(id => activeModels[id])` instead of a hardcoded `303`/`349` option list. If the previously-selected default (`303`) is not active, the modal falls back to the first available active model. If **no** model is active, the model picker and the "Crear declaración" button are disabled and the modal shows `fm.new_decl.no_active_models` instead of leaving an empty, non-functional picker. Callers that don't pass `activeModels` (e.g. older tests) keep the legacy behavior of offering both `303` and `349`.

This in-modal guard is now **defense in depth**: `FmListPage`'s "+ Nueva declaración" toolbar button only renders when `activeCount > 0` (see below), so in practice `NewDeclModal` should never open with zero active models. It stays in place in case the toolbar is customized further or the modal is reused elsewhere.

#### Restyle — searchable model picker, Año dropdown, Frecuencia pills, and duplicate-declaration awareness

`NewDeclModal` was restyled from a plain 3-`<select>` form into the richer modal chrome the rest of `FmOverlays.jsx` already used (`.fm-config-modal` header/body/footer, same as `PresentModal`/`FileGenModal`/`ConfigDrawer`). Behaviorally, `onConfirm` still fires with the exact same shape, `{ model, year, period, status: 'draft' }` — this was a markup/CSS change only, plus one additive feature described below.

- **Modelo** is now a button that opens a searchable dropdown (`ModelSelectMenu`, a private helper in `FmOverlays.jsx`) — one row per active model, each showing the model-number badge, its catalog name and description (reusing the same `fm.catalog.{id}.name` / `.desc` keys `FmCatalogPage.jsx` already relies on, so the row content stays in sync with the catalog automatically), and a search input that filters by number or name. It closes on outside-click via the same ref+`mousedown`-listener idiom used elsewhere in this file.
- **Año** is now a button-triggered dropdown (`YearSelectMenu`, another private helper in `FmOverlays.jsx`) instead of a `<select>` — mechanically a simplified sibling of the Modelo dropdown: same button + outside-click-closing panel + checkmark on the selected row. It skips the parts that don't apply to a short flat list of year numbers — no search input, no chip, no subtitle — just the year label and, on the selected row, a checkmark. **Restricted to a single selectable year (ETP-5391):** this dropdown is backed by `SELECTABLE_YEARS` (currently `[2026]`), sorted most-recent-first — not by the broader `SUPPORTED_YEARS`. `SUPPORTED_YEARS` (2021-2026) is a separate, wider list that `getLayout303` still uses to resolve the correct historical layout for an EXISTING declaration created in a past year, so those keep opening and rendering correctly; `SELECTABLE_YEARS` only narrows what a user may pick when creating a brand-new one, since AEAT only accepts filings for the current campaign year. `SELECTABLE_YEARS` is intentionally not derived from `SUPPORTED_YEARS` and must be updated by hand (append the new year, `fm303Layouts.js`) whenever a new filing year opens up — past years remain in `SUPPORTED_YEARS` so old declarations never break.
- **Frecuencia** is a new segmented pill control (Trimestral/Mensual) that drives which **Período** grid is shown: 4 quarter buttons (`T1`–`T4`) or a 6×2 grid of month buttons (`01`–`12`). Switching frequency resets the selected period to the first value of the new list.
- **Duplicate-declaration awareness — informational only for any non-draft status, no longer disabled (ETP-5187)**: `NewDeclModal` accepts an optional `existingDeclarations` prop — `FmListPage` passes its own `decls` state. Any period button that already has a declaration for the currently selected model+year still renders with a small dot badge (`.fm-newdecl-period-btn--existing` + `.fm-newdecl-period-btn__dot`, plus a `title` hint, `fm.new_decl.period_existing_hint`) but **is no longer disabled** — the user can select it and create a new declaration for that period. This is the rectificativa flow (filed early, more invoices arrived later for the same period), and blocking it outright was wrong. The previous rationale for disabling it (a duplicate submission 500'd server-side on `ETGO_FISCAL_DECL_UQ`) is fixed on the backend side, with no cap on how many declarations a period can have: `FiscalDeclCrudHandler#resolveNextDeclSeq` (`com.etendoerp.go`) assigns each new declaration the next `DECL_SEQ` ordinal (`MAX(DECL_SEQ) + 1` for the same client/org/model/year/period, or `0` for the first one) — a dedicated, unbounded sequence column, not a repurposing of the `DECL_TYPE` ordinaria/complementaria business field, so a 3rd, 4th or Nth declaration for the same period succeeds exactly like the 2nd (matching the real AEAT/legal rule that there is no limit on rectificativas per period) — see "NEO Headless endpoints" below. The real warning ("you're filing a 2nd declaration for this period, check Autoliquidación rectificativa") lives on the newly created declaration's own detail page instead — see "Duplicate-period warning and rectificativa gate" under "Modelo 303 detail page" above. The `useEffect` that used to jump the selection off a disabled period, and the `allPeriodsTaken`-driven disabling of the "Crear declaración" CTA, were both removed along with the disabling itself. `existingDeclarations` is still optional and defaults to "no existing declarations" when omitted, so every caller that predates this feature is unaffected.
- **Draft periods ARE disabled again — a narrower, status-scoped reversal (ETP-5272 pt.5).** ETP-5187 (above) removed period-disabling entirely; ETP-5272 reintroduces it, but only for a period that already carries a declaration whose `status === 'draft'` — a draft is unfinished, in-progress work, and spawning a 2nd declaration for the exact same period just fragments it instead of the user completing (or deleting) the existing draft first. `NewDeclModal` computes a separate `draftPeriods` set (distinct from the purely-informational `existingPeriods` above, scoped to the same selected `model`+`year`) and, for a period in that set: the button gets `disabled`, its `onClick` returns early, and its `title` hint switches to the distinct `fm.new_decl.period_draft_blocked_hint` ("There's already a draft declaration for this period. Finish or delete it before creating a new one.") instead of the informational `period_existing_hint` — so the user understands *why* this one specific period can't be picked, rather than seeing the same dot-badge hint as a non-draft duplicate. **Any other existing status** (ready/submitted/submitted_ext/submitted_ack) is still the intended rectificativa case from ETP-5187 above and stays exactly as selectable/informational as before — this reversal is scoped to `draft` only, it does not restore the old blanket disabling.
  - **Backend mirror (`com.etendoerp.go`, `FiscalDeclCrudHandler#handleDeclPost`):** a new `hasDraftDeclaration(clientId, orgId, model, year, period)` pre-check runs before `resolveNextDeclSeq`, and answers `409 Conflict` ("A draft declaration already exists for this period — complete or delete it before creating a new one.") when one exists — this is real enforcement, not just a UI nicety: a direct/malformed POST bypassing the frontend gate is still rejected. Deliberately a separate query, not folded into `resolveNextDeclSeq` — that method's own `MAX(DECL_SEQ) + 1` contract is untouched by this feature. Mirrors the existing draft-only guard `handleDeclDelete` already enforces (see "Row hover actions — Edit/Delete" under "List page toolbar" above), but in the opposite direction: delete allows *only* a draft to be removed, creation blocks *only* while a draft already exists.
  - **Frontend error surfacing:** `FmListPage.handleNewDecl`'s create-declaration `.catch()` used to silently swallow the backend's response (a `409`, or any other failure) — the modal just closed with no created row and no explanation. It now shows `toast.error(t('fm.list.new_decl_failed'))` ("The declaration could not be created." / "No se pudo crear la declaración."), mirroring the exact toast pattern already used for delete failures (`fm.list.delete_failed`, see "Row hover actions — Edit/Delete" under "List page toolbar" above).
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

## Known gaps and residual findings (ETP-5272 audit)

Surfaced while investigating points 5–7 above. None of these are bugs being fixed now — they are
recorded here so a future pass doesn't have to rediscover them from scratch.

- **Box 87 ("Cuotas a compensar de períodos previos pendientes para períodos posteriores") — FIXED
  under ETP-5338 pt.2.** It is labeled in `fm303Layouts.js` with the formula `(110 - 78)` right in
  its i18n string (`fm.box.row.cuotas_compensar_post`), and it is confirmed **display-only**: AEAT
  computes and validates 110-78 on their own side at submission time, so the `.303` file always
  uploaded correctly even while the box showed blank. It is still **not** one of the boxes
  `recomputeDerivedBoxes` re-derives (that set stays exactly `{45, 46, 64, 66, 69, 71}` — see
  "Manual box overrides" above) — the fix does not touch `manualData`, `recomputeDerivedBoxes`, or
  the submission payload at all. Instead, the row now declares
  `derivedValue: { box: 110, subtractBox: 78, clampMin: 0, treatMissingAsZero: true }`, and
  `FmBoxes303.jsx`'s `renderBoxCell` falls back to this formula (via the shared
  `computeDerivedValue` helper, also used by `renderDerivedCell` for boxless rows like
  `importe_devolucion`) whenever the real box has no value from
  `valueMap`/`fixedValues`/`defaultValues`. Clamped at 0 because box 87 by AEAT definition
  ("cuotas pendientes de compensar") can never be negative.
  **Confirmed missing-operand rule (cycle 2, corrects cycle 1's assumption):** a missing box 110 or
  box 78 defaults to 0 — box 110 present + box 78 missing shows box 110; box 110 missing + box 78
  present shows `max(0, 0 - box78)` = 0 — and the cell stays blank **only** when both are missing.
  This is scoped to box 87 via the new `derivedValue.treatMissingAsZero` flag; every other
  `derivedValue` row, including `importe_devolucion`, keeps the original "any missing operand blanks
  the result" behavior unchanged. (QA cycle 1 had correctly caught a bug in an earlier `?? 0`
  fallback — it lacked the "both missing → blank" exception — but the "stays blank on any missing
  operand" rule it shipped with afterward was an unconfirmed assumption about AEAT semantics; the
  product owner has now confirmed the rule documented here.)
- **Box 110** has no confirmed path into the box 71 result formula anywhere in
  `recomputeDerivedBoxes` — box 71's actual formula is `box69 - box70 + box109 - box112` (see
  above), which does not reference box 110 at all. If box 110 is supposed to feed into the final
  result through some other box not yet modeled here, that path is currently missing.
- **Boxes 68 and 111 are UI-editable (`editable: true` in `fm303Layouts.js`) in any period or
  declaration condition**, even though their real AEAT purpose is period/rectificativa-specific:
  box 68 (`fm.box.row.reg_anual` — "Exclusivamente para sujetos pasivos que tributan conjuntamente
  a la Administración del Estado y a las Diputaciones Forales. Resultado de la regularización
  anual.", i.e. an annual-regularization figure meaningful only for a specific joint
  State/Diputaciones-Forales taxpayer profile) and box 111 ("Rectificación de cuotas", a
  rectificativa-only concept — see "Manual box overrides" above for its independent-filing
  confirmation). Neither field carries a
  `visibleWhen`/conditional-editable gate tying it to the periods/conditions where it is actually
  meaningful — a user can enter a value in either box on a declaration where it has no real AEAT
  meaning, and nothing in the UI stops them. Not enforced as a restriction today; flagged, not
  fixed.
- **Debounce-vs-navigation race in the 303 autosave — resolved by the ETP-5338 architecture pivot.**
  This entry originally flagged a real race in `FmModel303Page.jsx`'s 800ms debounced
  `persistManualData` effect (pre-existing, confirmed still real while auditing ETP-5272 point 6):
  an edit made less than 800ms before the user navigated away never fired, because the effect's
  `clearTimeout` cleanup discarded the pending write on unmount with no error, toast, or retry. The
  debounced autosave effect no longer exists — see the "Architecture pivot" note under "Action bar"
  above — so this exact race is structurally eliminated: `identChecks`/`manualOverrides` are pure
  local state until an explicit "Guardar"/"Calcular" click flushes them, Cancelar is a network-free
  discard, and the `mountedRef` fix (also documented under "Action bar") closes the narrower
  Calcular-queued-behind-Guardar edge case that survived the pivot. Kept here as a historical record
  rather than deleted, so the original finding isn't silently lost.

## Key files

| File | Role |
|------|------|
| `FiscalModelsPage.jsx` | Root — routes between list and per-model detail |
| `FmListPage.jsx` | Declaration table, toolbar, auto-compute wiring |
| `FmCatalogPage.jsx` | Model catalog drawer — enable/disable tax forms, drives `activeModels` |
| `useFiscalAutoCompute.js` | Background compute + polling hook |
| `fiscalModelsUtils.js` | `computeBoxes303`, `checkModified303`, `generate303File`, `fetchDeclarationIncidents` (ETP-4456), formatters, deadline logic; `toBoxArray`/`applyOverrides`/`recomputeDerivedBoxes`/`getBoxValue` (ETP-5272 pt.6, shared between `FmModel303Page.jsx` and `FmListPage.jsx` — see "Manual box overrides" above) |
| `models/303/FmModel303Page.jsx` | Modelo 303 detail — boxes, sources, stepper, file gen |
| `models/303/FmBoxes303.jsx` | Box grid renderer |
| `models/303/fm303Layouts.js` | Box layout definition (sections, rows, labels) |
| `models/303/AeatSubmitFlow.jsx` | AEAT electronic submission flow (ETP-4456) — confirm/submit/result, `POST /fiscal303/submit` |
| `models/349/FmModel349Page.jsx` | Modelo 349 detail |
| `FmCommon.jsx` | Shared components: `NumberedStepper`, `ResultPill`, `SummaryCard` |
| `FmOverlays.jsx` | Modals and drawers: `PresentModal` (2 manual paths + opt-in `aeat_telematic` sentinel path), `FileGenModal`, `NewDeclModal`, `ConfigDrawer` |
| `FmRowActions.jsx` | Row hover Edit/Delete icons for draft declarations (ETP-5187) — window-local, lighter counterpart to the generic `RowQuickActions` |
| `FmDebugPanel.jsx` | Developer panel (keystroke-activated) for testing with fixture data |

## NEO Headless endpoints

| Method | Path | Used by |
|--------|------|---------|
| `GET` | `/fiscal303/declarations` | FmListPage — fetch all declarations |
| `POST` | `/fiscal303/declarations` (body: model, year, period, status, type) | FmListPage's `handleNewDecl` — creates a declaration. `FiscalDeclCrudHandler#resolveNextDeclSeq` (ETP-5187) assigns the new row the next `DECL_SEQ` ordinal (`MAX(DECL_SEQ) + 1` for the same client/org/model/year/period, or `0` for the first one) — a dedicated, unbounded sequence column added specifically for this uniqueness disambiguation, distinct from `DECL_TYPE` (AEAT's own ordinaria/complementaria business value, still `VARCHAR(1)` CHECKed to `'O'`/`'C'`, exposed as `decl.type` — see "Tipo column derivation (ETP-5338)" below for why the list's "Tipo" column no longer reads this field directly). `ETGO_FISCAL_DECL_UQ` is unique on `(client, org, model, year, period, DECL_SEQ)`, so there is no cap: a 2nd, 3rd, 4th or Nth declaration for the same period always succeeds — matching the real AEAT/legal rule that there is no limit on how many rectificativas can be filed for a period. (An earlier version of this fix repurposed `DECL_TYPE` itself as a 2-slot disambiguator, which capped the system at 2 declarations per period and conflated a real business field with an artificial counter — replaced by the dedicated column above.) **ETP-5272 pt.5:** now answers `409 Conflict` instead, BEFORE reaching `resolveNextDeclSeq`, when a `draft` declaration already exists for the exact same `(client, org, model, year, period)` key — see "Draft periods ARE disabled again" above for the full rationale; a non-draft existing declaration is unaffected and still succeeds via `resolveNextDeclSeq` exactly as described here. |
| `PUT` | `/fiscal303/declarations?id=` | FmListPage — persist status change |
| `DELETE` | `/fiscal303/declarations?id=` | `FmRowActions`' delete action (ETP-5187), via `deleteDeclaration` — rejects (409) deleting anything but a `draft` declaration (defense in depth; the frontend also only ever shows the action for draft rows) |
| `GET` | `/fiscal-models-catalog` | FmListPage — fetch the active-models catalog on mount (per-Client); also consumed cross-spec by `ReversedInvoicesPanel.jsx` (sales-invoice/purchase-invoice) to gate the "Correctiva del 349" checkbox — see "Downstream consumer" above |
| `PUT` | `/fiscal-models-catalog` | FmListPage, via `FmCatalogPage`'s `onSave` — persist the active-models catalog (per-Client) |
| `GET` | `/fiscal303/boxes?year=&period=` | `computeBoxes303` |
| `GET` | `/fiscal303/modified?year=&period=&since=` | `checkModified303` |
| `GET` | `/fiscal303/generate?year=&period=&tipo=` | `generate303File` |
| `POST` | `/fiscal303/submit?year=&period=&tipo=&id=` (body: testMode, idi, nrc, presenterNif, presenterName) | `AeatSubmitFlow` — AEAT electronic submission (ETP-4456). **POST-only**: a GET is answered 405 and never reaches a real AEAT filing (ETP-5027, QA F7) |
| `GET` | `/fiscal303/incidents?id=` | `fetchDeclarationIncidents` — persisted AEAT validation errors for the "Incidencias" tab (ETP-4456) |
| `GET` | `/session` | FmModel303Page — org NIF/nombre for file header |
| `GET` | `/fiscal349/operators?year=&period=` | `compute349Operators` — returns operators (regular + corrective, see ETP-5027 above) + `summary` + `rectificativeSummary` + invoices + rectifications + orgNif/orgName |
| `GET` | `/fiscal349/modified?year=&period=&since=` | `checkModified349` |
| `POST` | `/fiscal349/generate` (body: year, period, phone, contact, fileName, substitutive, formerStatement, representativeTaxId, navarra, guipuzcoa) | `generate349File` |

All query parameters are built with `URLSearchParams` to ensure correct encoding.

**Error response shape (`/fiscal349/generate` and siblings).** A non-2xx response from any `AbstractFiscalHandler`-based endpoint (including `/fiscal349/generate`) carries a JSON body of the shape `{"error":{"message": "<text>", "status": <int>}}` — the standard `NeoResponse.error()` envelope, same for every NEO Headless endpoint, not something specific to this feature. On the frontend, `generate349File` treats any `!res.ok` as failure: it reads the response text, feeds it through `parseServerMessage()` to extract and clean `error.message` (see "Generate error banner" above for the exact parsing steps), and returns `{ ok: false, error: 'http_<status>', serverMessage }` instead of throwing — `handleGenerate` in `FmModel349Page.jsx` is what turns that into the visible `genError` banner. A network-level failure (fetch throws) returns `{ ok: false, error: 'network' }` with no `serverMessage`, which also falls back to the generic banner text.

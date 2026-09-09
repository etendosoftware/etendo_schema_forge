# ETP-5037 Goods Movements Stock Validation Plan

## Status

Implemented (DEV 1-3, DEV 5, DEV 6) and manually verified live. **DEV 4
(reactive source-warehouse revalidation) and the follow-up "Option 1
preventive cap" (live-clamp on the Cantidad field) were built, verified live,
and then deliberately discarded** — see "Discarded: reactive frontend
revalidation" below. Stock sufficiency is validated exclusively at
save/update/process time (DEV 1/2); there is no reactive, per-keystroke or
per-field-change backend round-trip. DEV 5 (Cantidad defaults to `0` on
product selection, not the on-hand quantity) shipped after DEV 4 was
discarded, per a separate request from Valeria in the same design
conversation. DEV 6 (naming the offending product(s) in the "Procesar"
rejection instead of a misleading group count, a locale-neutral detail
separator, and a longer toast duration for process-rejection messages)
followed after the user live-tested the aggregate-rejection wording. Pending
user review before commit — no commit has been made per explicit instruction.

Primary ticket: https://etendoproject.atlassian.net/browse/ETP-5037

## Related evidence

- Window guide: `docs/generated-custom-windows/goods-movements.md` — Gap assessment
  already documents today's state: *"There is no inline stock-availability
  validation, negative-stock prevention, or quantity warnings in the SPA. Those
  remain backend-only."* This plan closes that gap for the GO SPA specifically,
  at save/process time only (see Scope).
- Line write pre-hook (existing pattern to extend):
  `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/GoodsMovementLineHandler.java`
- Shared write-guard pattern to mirror:
  `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/ServiceProductGuard.java`
- Header write/action handler (existing pattern to extend):
  `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/GoodsMovementsHeaderHandler.java`
- Mirror pattern for cumulative-quantity validation before a document completes:
  `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractInvoiceHeaderHandler.java`
  (`validateLineQtyBeforeComplete`, ~lines 967-1046) and
  `AbstractOrderHeaderHandler` (`isActionDocumentActionComplete`, ~lines 152-184)
  for detecting a completion-style action.
- Action dispatch chain (how "Procesar" reaches the classic process today):
  `NeoSubEndpointDispatcher.handleActionSubEndpoint` →
  `NeoHookDispatcher.dispatchWithHooks` (a non-null `NeoResponse` from a header
  handler short-circuits the chain — the default action, which calls
  `NeoProcessService.executeProcess`, never runs) →
  `NeoButtonActionHelper.executeButtonActionCore` → classic `DocAction`
  (`AD_Process_ID = 122`, `M_Movement_Post`).
- Classic completion function — **not to be modified by this plan**:
  `src-db/database/model/functions/M_MOVEMENT_POST.xml` (lines ~307-310 call
  `M_Check_Stock`, which raises `@NotEnoughStocked@ @line@ N` — generic, aborts on
  first failing line) and `M_CHECK_STOCK.xml`. Both stay untouched; Classic UI and
  any non-GO caller keep exactly today's behavior.
- Frontend error plumbing: `tools/app-shell/src/hooks/useEntity.js`
  (`extractErrorMessage`) and `tools/app-shell/src/lib/backendErrors.js`
  (`parseBackendErrorMessage`, `translateBackendError` — already has an entry for
  `GoodsMovementLineHandler`'s Service-product message, plus new entries for the
  two stock messages below).
- Frontend line-save path: `tools/app-shell/src/components/contract-ui/DetailView.jsx`
  (`handleSaveLine`, ~2561-2618) — errors surface via `toast.error(...)`.
- **Correction made during implementation:** `AD_ClientInfo.allownegativestock` is
  **not** the flag that governs whether a movement may leave a source locator
  negative — that flag is only consumed by average-costing logic
  (`CostingUtils.java`). The real per-source-locator override is
  `M_InventoryStatus.overissue` (joined via `M_Locator.M_InventoryStatus_ID`),
  the same flag the classic `M_Check_Stock` PL/pgSQL function reads at
  completion time. All guards below check `overissue` on the **source
  locator actually being validated**, not a client-wide flag.
- Actual implementation files (final state — DEV 4/Option 1 machinery listed
  here was built and then fully removed again; see "Discarded" below):
  - `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/StockAvailabilityGuard.java` —
    `rejectIfInsufficientStock`, `allowsOverissue(Locator)`,
    `onHandQuantity(productId, locatorId)`. Save/process-time only.
  - `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/GoodsMovementProcessGuard.java` —
    DEV 2, cumulative check before "Procesar".
  - `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/GoodsMovementLineHandler.java` —
    wires DEV 1 into `validateWrite`. No `afterCallout` override (removed).
  - `modules/com.etendoerp.go/src-db/database/sourcedata/AD_MESSAGE.xml` —
    `ETGO_InsufficientStockLine` / `ETGO_InsufficientStockProcess` (en/es).
  - `tools/app-shell/src/lib/backendErrors.js` — parameterized matchers for
    both messages.

## Diagnosis

ETP-5037 is a valid UX/observability gap, not a hard functional bug: the system
already blocks completion with insufficient stock (via classic core), but the
message is generic and the check never runs before the user reaches "Procesar".

No real-time stock check exists anywhere in the GO path today. The only
validation is the classic PL/pgSQL completion trigger
(`M_Movement_Post` → `M_Check_Stock`), which:

1. Fires once, only when the document is processed — never on line save, never on
   a field change.
2. Checks only `M_STORAGE_DETAIL.QTYONHAND < 0` after the transaction is already
   inserted, and raises a hardcoded, non-parameterized message:
   `"Insufficient stock: line 10"` — no product, no warehouse, no available/entered
   quantities.
3. Aborts on the **first** failing line (`RAISE_APPLICATION_ERROR`), so with
   several offending lines only one is ever reported and the whole document rolls
   back, forcing a fix-one/retry-one loop.

Separately, `backendErrors.js`/`useEntity.js` have no mapping for the
`NotEnoughStocked` message, so on the rare path where it does leak to the SPA
today it renders as the raw DB string via `toast.error`.

This is a GO-only gap: Classic backoffice users have always seen this raw message
and that is acceptable/unchanged scope. The fix therefore targets the
`com.etendoerp.go` NEO Headless layer exclusively and must not touch the shared
classic PL/pgSQL functions (`M_MOVEMENT_POST.xml`, `M_CHECK_STOCK.xml`), which are
also used by Physical Inventory and Internal Consumption and carry real
regression risk if modified.

**Pre-existing production bug found and fixed as a byproduct of DEV 1.**
`GoodsMovementLineHandler`'s `SPEC` constant was `"goodsMovementLineHandler"`,
but `AbstractNeoHandler.runWriteHook` gates on `context.getSpecName()`, which is
actually `"goods-movements"` (the kebab-case spec name, per
`toSpecName()`/`ETGO_SF_SPEC.NAME`). The mismatch meant **no write-hook logic
had ever executed for this entity in production** — including the pre-existing,
unrelated ETP-4606 Service-product guard. Fixed the constant (and the matching
unit test, which had fabricated the same wrong value, masking the bug in CI
too). This is a real, independent bug fix bundled with ETP-5037 because DEV 1
could not be verified working without it.

**Note on "guardar" vs "procesar" in the ticket's steps.** The ticket's repro
steps and its multi-line "Other test case" both say the error appears when the
user "intenta guardar" (tries to save). Verified in code
(`tools/app-shell/src/hooks/useEntity.js:1630` `handleSave` vs `:1803`
`handleSaveAndProcess`) that the plain header "Guardar" button only persists
header fields and never touches lines or calls `processNow` — lines are already
saved individually as they are added/edited. The raw `"Insufficient stock: line
N"` message the ticket describes can therefore only come from clicking
**Procesar** today (the only path that reaches `M_Check_Stock`); "guardar" in the
ticket is read as colloquial for "attempted to persist/submit", not the specific
gray button. This plan closes the gap either way: DEV 1 makes *saving a single
line* (add or inline edit) itself reject an excessive quantity, matching the
ticket's literal expectation going forward. Because DEV 1 blocks every
individually-excessive line at save time, by the time "Procesar" is reachable
the only remaining failure mode is the cumulative case (lines individually valid,
combined invalid) — exactly what DEV 2 covers. No scenario in the ticket is left
unhandled by this reading.

## Scope

### In scope

- Real-time, descriptive stock-sufficiency validation on every Goods Movement
  line create/update (single-line case), including when only the source
  warehouse changes on an existing line — enforced at **save/PATCH time**, not
  reactively while editing (see Discarded section for why the reactive variant
  was built and then dropped).
- Aggregate stock-sufficiency validation across all lines of a movement at the
  moment "Procesar" is pressed, covering the cumulative case (two or more lines
  individually valid but together exceeding stock at the same source
  warehouse), reported as **one message listing every affected
  product/warehouse combination**.
- Descriptive, translatable (en/es) error messages carrying product, warehouse,
  available quantity, and requested quantity — plus a stable machine-readable
  error code and structured per-violation fields, per the ticket's explicit
  "actionable without human intervention" requirement (agentic-use context).
- Respecting `M_InventoryStatus.overissue` per source locator — no new
  blocking behavior for locators that already opted into overissue (this
  supersedes the initial, incorrect assumption that
  `AD_ClientInfo.allownegativestock` was the governing flag — see the
  Diagnosis correction note).

### Out of scope (discarded / follow-up)

- **Reactive source-warehouse-change revalidation and the Cantidad-field
  preventive cap — built, verified live, then deliberately discarded.** See
  "Discarded: reactive frontend revalidation" below for the full history and
  the reason (excessive backend round-trips: NEO Headless fires a callout
  request on every field edit, including per keystroke on a numeric field, so
  a reactive check on the Cantidad field itself meant one request per digit
  typed). The team decided save/update-time validation (DEV 1/2, already
  proven correct and already the final backstop regardless) is sufficient —
  no reactive frontend layer on top of it.
- Any change to `M_MOVEMENT_POST.xml` / `M_CHECK_STOCK.xml` or other classic
  core PL/pgSQL functions. Classic backoffice behavior is unchanged by this plan.
- Any change to Physical Inventory or Internal Consumption windows, even though
  they share the classic completion functions left untouched here.

## Target behavior

| Scenario | Today | After this plan |
| --- | --- | --- |
| Save/edit a single line whose quantity exceeds available stock at the chosen source warehouse | Silently saved; only fails (generic message) when the whole document is processed | Rejected immediately on save with a descriptive message: *"La cantidad ingresada (25) supera el stock disponible de MON-24HD en ALM-MAD (20 unidades)."* |
| User changes the source warehouse on a line that already has a quantity set, and the new warehouse has less stock | Nothing happens; stale quantity persists until save/Process fails | Nothing happens reactively while editing; the next save/PATCH of that line is rejected by DEV 1 with the descriptive message above (same as any other over-the-limit save) |
| Two+ lines, individually valid, whose combined quantity from the same source warehouse exceeds stock | Process fails with `"Insufficient stock: line N"` for only the first offending line; document rolls back | Pressing "Procesar" is rejected with one message listing every affected product/warehouse combination and the amounts involved; classic `M_Movement_Post`/`M_Check_Stock` are never reached |
| Source locator has `M_InventoryStatus.overissue = Y` | No check applies | No check applies (unchanged — guards short-circuit when the source locator's overissue flag is `Y`) |
| Classic backoffice / direct API write bypassing the GO SPA | Generic `"Insufficient stock: line N"` at Process time | Unchanged (out of scope; classic functions untouched) |

## Implementation Plan

### DEV 1 — `StockAvailabilityGuard`: line-level validation (ticket's minimum-required Option 2, single-line case)

- New class `StockAvailabilityGuard` in
  `com.etendoerp.go.schemaforge`, mirroring `ServiceProductGuard`'s shape
  (static utility, `reject...` method returning `NeoResponse` or `null`).
- Wired into `GoodsMovementLineHandler.validateWrite` (same spot as
  `ServiceProductGuard.rejectIfServiceProduct`, `GoodsMovementLineHandler.java:63-67`),
  so it runs on every line POST/PATCH — including an inline edit that only
  changes the source warehouse or the quantity.
- Resolves the effective product, source `storageBin`, and quantity for the
  request (falling back to the persisted line's values on PATCH the same way
  `resolvePersistedProductId` already does for the Service-product guard, so a
  partial patch — e.g. quantity-only — is checked against the persisted source
  warehouse, and vice versa).
- Skips the check entirely when the source locator's
  `M_InventoryStatus.overissue = 'Y'` (`StockAvailabilityGuard.allowsOverissue`).
- Queries on-hand quantity for `(product, storageBin)` (`M_Storage_Detail`).
- On insufficiency, returns `NeoResponse.error(400, body)` with:
  - a stable `error.code`, e.g. `INSUFFICIENT_STOCK`;
  - a structured `error.details` object: `{ productId, productCode,
    productName, locatorId, locatorName, warehouseName, available, requested }`;
  - a translated `error.message`/`userMessage` built via a new parameterized
    `AD_Message` (`ETGO_InsufficientStockLine`, en/es) formatted per the
    ticket's example text.

### DEV 2 — `GoodsMovementsHeaderHandler`: cumulative validation before "Procesar" (multi-line case, no classic core changes)

- "Procesar" is not a plain PATCH — it calls `POST /.../action/processNow`
  (`NeoEndpointType.ACTION`), dispatched through `NeoHookDispatcher.dispatchWithHooks`,
  which already calls the entity's registered header handler
  (`GoodsMovementsHeaderHandler`, `@Named("goodsMovementsHeaderHandler")`)
  *before* the default action (`NeoButtonActionHelper` → classic `DocAction`).
  Returning a non-null `NeoResponse` from `handle()` stops the classic process
  from ever running.
- Added a new branch in `GoodsMovementsHeaderHandler.handle()`, delegating to
  `GoodsMovementProcessGuard` (still registered under the same bean), gated on
  `NeoEndpointType.ACTION.equals(context.getEndpointType()) &&
  "processNow".equals(context.getFieldName())` — mirroring
  `AbstractOrderHeaderHandler.isActionDocumentActionComplete`.
- Loads the movement's lines via DAL
  (`OBDal.getInstance().get(InternalMovement.class,
  context.getRecordId()).getMovementLineList()`), groups by
  `(productId, sourceLocatorId)`, sums requested quantity per group, and
  compares each group's sum against on-hand stock — same skip-if-source-locator-
  `overissue=Y` rule as DEV 1.
- If any group is insufficient, returns one `NeoResponse.error(400, body)` with
  `error.code = INSUFFICIENT_STOCK` and an `error.details` **array**, one entry
  per offending group (same shape as DEV 1's single entry), plus a
  human-readable `error.message` that lists every affected product/warehouse —
  directly satisfying the ticket's "when there are multiple lines with errors,
  the message must list every case" requirement. Mirrors
  `AbstractInvoiceHeaderHandler.validateLineQtyBeforeComplete` almost exactly.
- `M_MOVEMENT_POST.xml` / `M_CHECK_STOCK.xml` are not modified. They remain the
  last-resort backstop for Classic/API paths that bypass the GO action endpoint
  entirely — out of scope, unchanged behavior.

### DEV 3 — Frontend error rendering (`backendErrors.js`, `DetailView.jsx`)

- Added `backendErrors.js` entries (`matchInsufficientStockLine`,
  `matchInsufficientStockProcess`) recognizing the two `AD_Message` skeletons
  from DEV 1/DEV 2 and re-localizing them client-side (no `AD_Message_Trl` rows
  exist for either — same no-translation-pack root cause as every other
  parameterized matcher in this file).
- Existing `toast.error(...)` rendering path in `DetailView.jsx`'s line-save
  and process-action error handlers already renders a `details` array as a
  readable list; no change needed there beyond the new matchers.

### DEV 5 — Cantidad defaults to 0 on every product selection (Valeria's request, after DEV 4 was discarded)

Unrelated to stock *validation* directly, but adjacent UX feedback from the
same design conversation with Valeria: selecting a product in the "Añadir
línea" drawer was defaulting Cantidad to the **on-hand quantity at the
auto-filled locator** (e.g. picking Fernet at "Almacén Secundario (850 ud)"
set Cantidad to `850`), not to `0`. Root cause: the classic Java callout
`SL_Movement_Product` (`org.openbravo.erpCommon.ad_callouts`) reads the aux
`_QTY` value the frontend already sends along with the product selection
(the on-hand quantity shown in the picker) and echoes it back as
`inpmovementqty` — pre-existing classic behavior, not something this ticket
introduced, and not safe to change directly (that callout is shared by every
caller, classic backoffice included).

Fixed entirely in the GO SPA layer, without touching classic core:

- `artifacts/goods-movements/decisions.json`'s `product` field gained a
  second `onSelectMappings` entry: `{ "value": "0", "to": "movementQuantity" }`
  — alongside the existing `_aux._LOC → storageBin` entry. `onSelectMappings`
  previously only supported reading a value from the selected item (`from`,
  a dot path); extended it to also accept a fixed literal (`value`), a
  small, generic, backward-compatible addition (existing `from`-based
  mappings are unaffected) to `DataTable.jsx`'s `applyOnSelectMappings`
  (add-line form) — refactored to share a new pure resolver,
  `resolveOnSelectMappings(field, item)`, returning `{to, value, label}`
  triples with no React side effects.
- The **same** resolver is now also called from `DetailView.jsx`'s
  `buildInlineRowUpdateHandler` (the persisted-line inline-edit PATCH path),
  applied *after* the callout-derived fields are folded into the PATCH body
  — this is what makes the `0` win over `SL_Movement_Product`'s own returned
  quantity, mirroring how the add-line form's `markTouched` already protects
  a mapped value from being overwritten by the same callout
  (`applyCalloutUpdates`'s touched-field guard). Before this, only the
  add-line form had `onSelectMappings` wired at all — the persisted-line path
  (changing an existing line's product) still showed the on-hand quantity;
  confirmed live and fixed in the same change.
- Verified live end-to-end on both paths, with database confirmation the
  PATCH/POST body itself carried `movementQuantity: 0` (not just the UI):
  add-line save of a new Fernet line at Almacén Secundario persisted
  `movementqty = 0`; changing an already-persisted line's product from
  Cerveza to Fernet (different locators, 300 → 0) persisted `movementqty = 0`
  too.

### DEV 6 — Process-rejection wording named by product, and a longer toast duration

Two follow-up fixes to DEV 2's aggregate "Procesar" rejection, found by the user
live-testing a multi-line, single-product violation (two Fernet lines from the
same warehouse, individually valid, summing over the limit).

- **Named by product, not counted by group.** `GoodsMovementProcessGuard`'s
  `@count@` placeholder counted offending **groups** (distinct
  `(product, locator)` pairs), worded as "N line(s)" — misleading when a
  single group is itself the sum of two or more physical lines: "1 line(s)
  exceed..." reads as if only one line were at fault, when it's really the
  combination. Replaced `@count@` with `@products@`: a comma-separated,
  de-duplicated list of the offending products' labels (e.g. "Fernet" for one
  violation, "Fernet, Cerveza" for two). `ETGO_InsufficientStockProcess`
  updated accordingly (`"...the line(s) of @products@ exceed..."`); DEV 3's
  `matchInsufficientStockProcess` matcher and both locale keys updated to the
  new skeleton. Verified live with a 4-line, 2-product movement (Fernet
  490+5=495>490 and Cerveza 460+5=465>460, same source warehouse): one
  combined toast named both products and listed both violations.
  - **Deployment gotcha (caught live, not a code bug):** after updating both
    the `AD_MESSAGE` row and the Java code that fills it in the same session,
    a `smartbuild` alone was not enough — local (non-Docker) Tomcat does not
    auto-reload, so the old compiled code kept running, calling
    `template.replace("@count@", ...)` against a template that no longer
    contained `@count@` (already updated to `@products@` in the DB). The
    `.replace` silently no-opped, so the raw `@products@` placeholder reached
    the toast unrendered. Resolved by restarting Tomcat; worth remembering
    whenever an `AD_MESSAGE` template and the Java code reading it change in
    the same pass.
  - **Detail separator changed from `@` to parentheses.** The per-violation
    detail segment (`details`, appended after "...stock: ") originally read
    `"Cerveza @ Almacen GO: 465 > 460"` — the `"@"` symbol read as a leftover
    technical artifact once the sentence around it was in natural Spanish.
    Changed to `"Cerveza (Almacen GO): 465 > 460"`, locale-neutral (no word to
    translate) so it still needs no per-locale handling in the frontend
    matcher, consistent with the existing "pass `details` through untranslated"
    design.
- **Longer toast duration for process-rejection messages.** sonner's default
  toast duration (4s) isn't enough to read a combined, multi-product
  insufficient-stock message. Both call sites that toast a process-action
  failure — `useEntity.js`'s `handleProcessFailure` (plain "Procesar") and the
  near-identical duplicated logic inside `handleSaveAndProcess` (draft-mode
  "Save & Complete", used by other windows, not Goods Movements) — now pass
  `{ duration: 8000 }` (`PROCESS_FAILURE_TOAST_DURATION_MS`). Generic infra
  fix, not Goods-Movements-specific, since any window's process rejection can
  carry a message worth 8 seconds to read. Two existing unit tests asserting
  the exact single-argument `toast.error(msg)` call were updated to include
  the new duration argument.

## Discarded: reactive frontend revalidation

A significant portion of this ticket's work (originally "DEV 4" plus a
follow-up "Option 1 preventive cap") built a reactive, no-persist stock check
that fired **while the user was still editing the line**, before any
save/PATCH: changing the source warehouse reset an already-entered quantity to
`0`, and editing the Cantidad field itself clamped it down to the newly
available stock. Both were fully implemented, live-verified end to end
(including the add-line-form vs. persisted-line-edit divergence, the
`overissue` bypass, and cross-window regression checks on Sales Order), and
then **entirely reverted** after a design discussion between the user and
Valeria: the team decided the reactive layer was not worth its cost and that
save/update-time validation (DEV 1/2 above) is sufficient on its own — it was
already the authoritative check and the final backstop regardless of whatever
the reactive layer showed in between.

**Why it was dropped: NEO Headless fires a classic-callout POST on every field
edit, generically, whether or not a real classic callout is assigned to that
column** (`NeoCalloutService.executeCallout` short-circuits with an empty
response either way — this is pre-existing platform behavior, not something
this ticket introduced). For a `<select>`-style field like the source
warehouse, that means one request per selection — acceptable. For a **plain
numeric input** like Cantidad, the frontend fires this same callout on every
`onChange`, i.e. **once per keystroke** — confirmed live via network capture
while typing "999" digit by digit into the Cantidad field. Building the
preventive cap on top of that meant every digit the user typed against a
selected source warehouse triggered its own backend round-trip and on-hand
stock query, for a check that save time already performs exactly once, for
free, as a side effect of the write it was about to do anyway.

**What existed, for institutional memory (all since removed):**
- Backend: `GoodsMovementLineHandler#afterCallout`, dispatching on the
  triggering field (`storageBin` → reset branch, `movementQuantity` → clamp
  branch), both delegating to `StockAvailabilityGuard`.
- Backend: `StockAvailabilityGuard.buildQuantityResetCalloutResponse` (reset to
  `0`, `forceZero: true`) and `buildQuantityClampCalloutResponse` (clamp to
  available, `forceClamp: true`), each pairing a callout `updates` entry with a
  `messages` entry.
- Backend: `NeoCalloutEndpoint.mergeMessagesSection`, a dedicated merge for the
  handler-returned `messages` channel (deliberately scoped to
  `runAfterCalloutHook`, not the shared `applyCascade` path, to avoid reviving
  a separate dead cascade-message channel for every other window).
- Frontend: `lineFieldChange.js`'s `applyQtyZeroGuard` gained an optional
  `forceZeroFields` parameter and a paired `extractForceZeroFields` helper;
  a parallel `extractForceClampFields` helper for the clamp case.
- Frontend: two "trust the field the user just edited" guards had to grow an
  explicit bypass for the clamp case specifically — `DataTable.jsx` (the
  add-line form, which deletes the triggering field from a callout response
  before merging) and `DetailView.jsx`'s `buildInlineRowUpdateHandler` (the
  persisted-line inline-edit path, where "the typed value always wins,
  last-write" unconditionally overwrote the field being edited). This was the
  hardest part of the reset/clamp design: unlike the warehouse-change reset
  (a different field correcting `movementQuantity`), the Cantidad-field clamp
  was self-referential — the same field triggering and being corrected by the
  same callout — which neither guard was built to allow through.
- Frontend: a bug was found and fixed mid-implementation where a not-yet-saved
  "Añadir línea" row didn't visually reflect the backend's reset because the
  add-line form's local state used a second, independent guard
  (`applyCalloutUpdates.js`) that the first fix never reached.
- Frontend: a bug was found and fixed in `useUI()`'s interpolation
  (`text.replace('{key}', value)` — a plain string replace, not global — only
  ever substitutes the *first* occurrence of a repeated placeholder). Not
  fixed in the shared hook itself (out of scope, would affect every message in
  the app); worked around by not repeating the same placeholder twice in the
  clamp message's translation string. This finding stands regardless of the
  clamp feature's removal and may resurface for any future message that
  repeats a variable.
- Two new `AD_Message` rows (`ETGO_InsufficientStockLine`,
  `ETGO_InsufficientStockProcess` — **kept**, still used by DEV 1/DEV 2) and a
  third, `ETGO_QuantityClampedToStock` (**removed**, was only used by the
  discarded clamp).

Everything above was removed cleanly: the backend module compiles
(`smartbuild` green) and its unit tests pass (`GoodsMovementLineHandlerTest`,
`NeoCalloutEndpointTest`, `GoodsMovementsHeaderHandlerTest`, all 0
failures/errors); the frontend's full Vitest suite passes (811 files / 15222
tests, down from 15228 by exactly the 6 now-deleted tests for the removed
`forceZeroFields`/`extractForceZeroFields` behavior — no other test broke).

### REVIEW

- Confirm `StockAvailabilityGuard` and the header-handler branch both correctly
  skip validation when the **source locator's** `M_InventoryStatus.overissue =
  'Y'` — not a client-wide flag.
- Confirm DEV 1's PATCH fallback logic correctly resolves persisted
  product/warehouse/quantity for partial patches (mirroring the existing
  Service-product guard's `resolvePersistedProductId`).
- Confirm DEV 2 groups by `(product, sourceLocator)` — not by line — so two
  lines moving the *same* product from the *same* warehouse to *different*
  destinations are correctly summed together, while lines with different
  source warehouses are evaluated independently.
- Confirm `M_MOVEMENT_POST.xml`/`M_CHECK_STOCK.xml` have zero diff.
- Confirm message copy (en/es) matches the ticket's example format and is
  approved by product/QA.
- Confirm no leftover references to the discarded reactive machinery
  (`afterCallout`, `forceZero`, `forceClamp`, `mergeMessagesSection`,
  `ETGO_QuantityClampedToStock`) remain anywhere in either repo.

### QA

Automated (unit, `GoodsMovementLineHandlerTest` + `lineFieldChange` Jest/Vitest
suites):

- Line save rejected with descriptive message when quantity exceeds available
  stock at the selected source warehouse (single line).
- Line save accepted at exactly the available quantity boundary.
- Line save rejected/accepted correctly based on the **source locator's**
  `overissue` flag (must be accepted regardless of quantity when `Y`).
- Editing an existing line's source warehouse (inline edit) re-triggers DEV 1
  on save and is rejected if the new warehouse lacks stock for the existing
  quantity.
- Two lines, same product + source warehouse, individually valid, whose sum
  exceeds stock: "Procesar" rejected with both lines/amounts listed in one
  message; `M_Movement_Post` never invoked (assert via not-processed state).
- "Procesar" succeeds and behaves exactly as today when all lines are valid.
- `backendErrors.js` renders both the single-line and multi-line message
  shapes correctly, en and es.
- Full suite regression: `npx vitest run` (15222 tests, 811 files) and the
  targeted Java unit tests above, all green with zero new failures after the
  DEV 4/Option 1 removal.

Manual QA — live battery (ticket's own cases; **T** = ticket-specified).
Executed live against `localhost:3100` (test tenant with three GO-org
warehouses: Almacen GO, Almacén Secundario, Almacén Terciario).

| # | Scenario | Result |
| --- | --- | --- |
| T1 | Fernet qty 60 > Almacén Secundario stock (50) → save rejected | ✅ *"La cantidad ingresada (60) supera el stock disponible de SK-003 en Almacén Secundario (50 unidades)."* |
| T1b | Same, UI switched to English | ✅ *"The entered quantity (60) exceeds the available stock of SK-003 in Almacén Secundario (50 units)."* |
| T2 | Two lines, Fernet, both Almacén Secundario → different destinations, qty 30 each (individually valid, sum 60 > 50) → "Process" | ✅ *"Este movimiento no se puede procesar: Las línea(s) de Fernet superan el stock disponible del almacén origen: Fernet (Almacén Secundario): 60 > 50"* — document stayed Draft/unprocessed. Re-verified live after the wording change (naming the product instead of a group count) and the `@` → `(warehouse)` detail-format fix, including a 4-line, 2-product case (Fernet 490+5=495>490 and Cerveza 460+5=465>460 from Almacen GO): the combined message correctly named both products and listed both violations in one toast |
| E9 | Classic backoffice (`localhost:8080/etendocorepg`) Goods Movements — create-line-exceeding-stock-then-process check | ✅ Completed manually by the user. Result: line with Fernet, qty 900, `AT-0-0-0` → `AG-0-0-0` (only 850 on hand at AT-0-0-0), Process shows **`Error: Insufficient stock: line 10`** — the exact old generic message, no product/warehouse/quantity detail, no trace of any ETP-5037 change. Confirms Classic is completely unaffected |

The remaining live-battery cases from the reactive-revalidation work (source-
warehouse-change reset, Cantidad-field clamp, `overissue` bypass on the
reactive path, add-line-form vs. persisted-line divergence, cross-window
Sales Order regression on the shared callout pipeline) all passed at the time
but are no longer applicable — they exercised code that has since been
removed in full. Not retained as QA evidence for the shipped feature; the
historical detail lives in "Discarded: reactive frontend revalidation" above
for anyone reconstructing why the reactive layer was ruled out, not because
it didn't work.

### DOCS

- Update `docs/generated-custom-windows/goods-movements.md`:
  - "Gap assessment" no longer applies as written — replace with a description
    of the new save/process-time validation and the `overissue` dependency.
  - Add a "Design changes — ETP-5037" section (window already has ETP-4529 and
    ETP-5039 sections in this same doc) describing DEV 1-3, and noting the
    reactive layer was built and discarded.
  - Update "Manual verification" with the new stock-validation steps
    (save-time rejection, aggregate rejection before "Procesar").

## Acceptance Criteria

- [x] Saving/editing a line with quantity above available source-warehouse
      stock is rejected immediately with a message naming product, warehouse,
      available quantity, and requested quantity. — verified live, T1/T1b.
- [x] Multiple simultaneously-insufficient lines are reported together in one
      message, not just by line number. — verified live, T2.
- [x] The system still fully blocks completing (processing) a document with
      insufficient stock (unchanged high-level guarantee). — verified live,
      T2 (GO path) and E9 (Classic path, confirmed manually by the user: the
      original generic `Insufficient stock: line 10` message, unchanged).
- [x] Source locators with `M_InventoryStatus.overissue = 'Y'` see no new
      blocking behavior. — verified live via temporary SQL flag flip,
      reverted immediately after.
- [x] `M_MOVEMENT_POST.xml` and `M_CHECK_STOCK.xml` have no diff (`git diff`
      confirms zero changes to either file); Classic backoffice behavior for
      Goods Movements is unchanged — confirmed live by the user (E9): the
      original generic `Insufficient stock: line 10` message, no product,
      warehouse, or quantity detail, no trace of any ETP-5037 change.
- [x] Error responses carry a stable machine-readable code and structured
      per-violation data, not only prose — addressing the ticket's "must be
      identifiable and actionable without human intervention" requirement. —
      confirmed in code: `StockAvailabilityGuard`/`GoodsMovementProcessGuard`
      both set `body.put("code", "INSUFFICIENT_STOCK")` plus a structured
      `details` object/array.
- [x] No reactive frontend revalidation ships — deliberately decided against
      (see Discarded section) in favor of save/process-time-only validation.
- [x] `docs/generated-custom-windows/goods-movements.md` reflects the new
      behavior in the same change.

## Open Questions

**Resolved during implementation:**

- ~~Exact copy for the new `AD_Message`(s)~~ — shipped as
  `ETGO_InsufficientStockLine` / `ETGO_InsufficientStockProcess` (en/es),
  matching the ticket's illustrative example format; pending final
  product/QA copy sign-off, but functionally complete.
- ~~Whether a reactive frontend layer (DEV 4 / Option 1) is worth building~~ —
  resolved no, after building and live-verifying it: NEO Headless's
  per-field/per-keystroke callout pattern makes a reactive check on the
  Cantidad field itself fire once per digit typed, which the team judged not
  worth it given save-time validation already catches everything. See
  "Discarded: reactive frontend revalidation".
- Whether the destination warehouse also needs any check — confirmed no:
  destination has no stock constraint in this domain, only the source locator
  is checked, matching the ticket's literal scope.

**Still open:**

- Check-then-write race: DEV 1/DEV 2 read on-hand stock, then let the write
  proceed — a concurrent movement against the same product/locator between the
  check and the persist could still slip through, same as any check-then-write
  pattern without DB-level locking. Not solved by this plan (would require
  pessimistic locking or a DB constraint, larger scope); classic
  `M_Check_Stock` at completion time remains the final backstop for this
  specific race, unchanged.
- Dropdown exclusion asymmetry (surfaced while testing the now-discarded
  reactive layer): the destination warehouse dropdown already excludes the
  current source value (`excludeValueOf`, per the existing ETP-5039 pattern),
  but the source dropdown does not exclude the current destination value — so
  source == destination is reachable by setting destination first, then
  source second. Not fixed in this pass; worth a small follow-up to apply the
  same `excludeValueOf` symmetrically to the source dropdown. Independent of
  the reactive-layer removal — still a real, standing asymmetry.
- `useUI()`'s interpolation only substitutes the first occurrence of a
  repeated `{placeholder}` in a translation string (plain `String.replace`,
  not global) — found while building (and since removed with) the clamp
  message, but the root cause lives in the shared hook and can affect any
  future message that repeats a variable. Not fixed here (out of scope, would
  need a `schema_forge_core` change); worth a small, low-risk follow-up
  (`replaceAll`/global regex) whenever someone next touches that hook.

## Rollout

1. Ship DEV 1 (line-level guard) first — smallest, most isolated change,
   immediately addresses the ticket's core complaint.
2. Ship DEV 2 (header/process guard) once DEV 1 is verified stable — confirm
   zero diff on classic functions before merging.
3. Ship DEV 3 (frontend error rendering) alongside DEV 1/2 — required for
   either to be visible to users.

## Rollback

- Purely additive on the backend: reverting DEV 1/DEV 2 removes the new guard
  branches and restores today's behavior exactly (classic completion-time-only
  check), since no schema or classic function changes are involved.
- DEV 3 is frontend-only; reverting drops the descriptive rendering, with no
  backend impact.
- No feature flag is proposed given the additive, low-blast-radius nature of
  the change and the existing per-source-locator
  `M_InventoryStatus.overissue` opt-out already acting as a built-in kill
  switch.

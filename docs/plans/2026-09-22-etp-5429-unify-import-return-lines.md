# ETP-5429 (Phase 1 of 2) — Unify the return-flow "import lines" popup into `ImportLinesModal.jsx`

> **Status:** implemented, verified live in the browser (both flows), tests
> rewritten by Tester and green (108/108 targeted, 19142/19142 full `tools/app-shell`
> suite, 0 failures). Docs checked — no update needed. Pending: user go-ahead before
> commit. Living document — updated as work progresses. Covers items **#1 and #2
> only** (see scope note below); items #3/#4 (the "Crear Devolución" wizards) are
> explicitly deferred to a follow-up pass, per the user's instruction.

## Scope (confirmed against Isaías's literal comment on ETP-5178)

Isaías's comment has two independent bullets, each with its own screenshot:

1. *"El pop-up de **importar lineas en albarán de devolución** (tanto de compra como
   de ventas) no es el mismo y sigue manteniendo la lógica anterior. **Deberia
   unificarse el popup.**"* → explicit unification ask. **This is what this phase
   covers.**
2. *"Al igual que en el popup de **crear** albarán de devolución los inputs no son
   los mismos."* → a parallel observation, no explicit "unify" verb. **Deferred —
   not touched in this phase.**

| # | Ventana | Modal | Archivo real |
|---|---|---|---|
| 1 | Compras / Albarán de devolución (`return-to-vendor-shipment`) | "Añadir desde Albarán" | `tools/app-shell/src/windows/custom/return-to-vendor-shipment/ImportFromReceiptModal.jsx` → `ImportReturnLinesModal.jsx` |
| 2 | Ventas / Albarán de devolución (`return-material-receipt`) | "Añadir desde envío" | `tools/app-shell/src/windows/custom/return-material-receipt/ImportFromShipmentModal.jsx` → `ImportReturnLinesModal.jsx` |
| 3 | Compras / Albarán (`goods-receipt`) | "Crear devolución" | `artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx` — **deferred** |
| 4 | Ventas / Albarán (`goods-shipment`) | "Crear devolución" | `artifacts/goods-shipment/custom/ReturnWizard.jsx` — **deferred** |

Both wrappers for #1 and #2 already share **one** component today:
`tools/app-shell/src/components/import-return-lines/ImportReturnLinesModal.jsx`
(347 lines) + `ImportModalFooter.jsx` (39 lines, exports `ImportModalHeader` too).
**Goal: fold that shared component into `ImportLinesModal.jsx`** (the one fixed in
ETP-5178, already used by `sales-invoice`/`purchase-invoice`/`goods-shipment`/
`goods-receipt`), so there is one generic import-lines component total, and delete
`ImportReturnLinesModal.jsx` + `ImportModalFooter.jsx`.

## Full behavioral read-through of `ImportReturnLinesModal.jsx` + `ImportModalFooter.jsx`

Read completely (not skimmed). Key findings, each checked against whether
`ImportLinesModal.jsx` already has an equivalent:

| Behavior | `ImportReturnLinesModal` | `ImportLinesModal` (ETP-5178) | Reconciliation needed |
|---|---|---|---|
| Doc-fetch injection | `config.fetchSourceDocs(base, bpId, headers)` function, **or** a `config.sourceDocsUrl(base, bpId)` URL-template fallback if no function given | `fetchDocuments({ base, headers, bpId, invoiceId })` prop, function-only | Low — the real wrapper (`ImportFromShipmentModal.jsx`) already passes a **function**, not a URL template, so it's already close to `ImportLinesModal`'s shape. Just a prop-name/arg-shape rename. The URL-template fallback path is dead code today (no caller uses it) — drop it, don't port it. |
| Line-fetch injection | Same dual function/URL-template shape as above, `fetchSourceLines` | `fetchLines({ base, headers, docId, sharedContext })` | Same as above — low effort, arg-shape rename. |
| **Auto-select on expand** | **Every line is added to `selected` the moment a document's lines finish loading** (`fetchLines` calls `setSelected` unconditionally over all enriched lines) — confirmed live (expanding a shipment pre-checks its lines) and locked in by test (`ImportReturnLinesModal.spec.jsx`, "shows selected count suffix after expanding a doc and lines load" — comment says "lines will be fetched and auto-selected") | Nothing is pre-selected on expand — user must tick each line explicitly | **Real new capability needed.** `ImportLinesModal` has no such mode. Needs a new prop, e.g. `autoSelectOnExpand: boolean` (default `false`, so the 4 existing ETP-5178 consumers are unaffected), set `true` only by the 2 return-flow wrappers. |
| Zero-qty line filtering | Lines with `movementQuantity <= 0` are silently dropped before being shown at all (`.filter(l => l._maxQty > 0)`) | No such filter — `ImportLinesModal` shows `_alreadyImported` lines too, just greyed out/disabled, never hides them outright | Needs to stay unique to the return flow — likely just keep this filtering **in the wrapper's `fetchSourceLines` callback** (filter before returning to the generic component) rather than adding a new prop to `ImportLinesModal` itself. No component change needed if handled at the wrapper layer. |
| "Already imported" line marking | **Does not exist.** No `_alreadyImported` concept at all. | `line._alreadyImported` → greyed out, disabled checkbox, "ya importado" label | Not a gap to close — return flow apparently doesn't need this (a return line, once its full delivered qty is consumed by a return, would presumably just have `_maxQty = 0` and get filtered out per the row above, rather than shown-disabled). Confirm this assumption holds before finalizing — flagged as an open question below. |
| **Import submit mechanism** | **One batched `POST`** to `config.importActionUrl(base, targetId)` with body `{ lines: [{ sourceLineId, returnQuantity }, ...] }` for every selected line at once; reads back `body.response.data.importedCount`; on `!res.ok` → single `toast.error`, no partial-success path | **N individual `POST`s**, one per selected line (`for (const line of lines) { ... apiFetch(...) ... }`), tracks an `errors` counter across the loop, `toast.warning` on partial failure vs `toast.success` on full success | **This is the deepest structural difference** — not cosmetic. Needs a new `submitMode: 'batch' | 'perLine'` (or simpler: let the caller inject a `submitImport(selectedLinesWithQty) → Promise<{ok, count}>` function instead of `buildLineBody` + implicit per-line loop) so `ImportLinesModal` can support both strategies without hardcoding either. **This is the highest-risk piece of the merge — needs its own careful design pass, most likely the bulk of the actual effort.** |
| Document-list summary column | `config.showAmount` shows `doc.grandTotalAmount` in the **collapsed document row** (one number per doc) | `showPriceColumns` shows **per-line** `unitPrice` + `lineTotal` (two columns, inside the expanded line list) | Different granularity, not a drop-in toggle. Need a distinct prop, e.g. `docSummaryField` (optional, renders a doc-level number in the collapsed row) — orthogonal to `showPriceColumns`, can coexist. |
| Reference quantity column | `CANT.` (read-only, `line._maxQty` = delivered/movement qty) shown next to the editable `CANT. DEVOLUCIÓN` | No reference column at all | New optional prop, e.g. `referenceQtyColumn: { labelKey, }` rendering `line._maxQty` read-only before the editable qty input — straightforward, same conditional-column pattern as `showPriceColumns`. |
| Qty input itself | **The exact ETP-5178 bug** — `onChange` clamps synchronously (`Math.max(qtyStep, Math.min(maxQty, Number(e.target.value) || qtyStep))`), no draft state, no `onBlur`. Also shows native spin-buttons on focus (no `appearance:textfield` hiding). | Fixed — `classifyQtyDraft` + draft state + `onBlur` validation + `qtyMaxAllowed`/`qtyMustBePositive` toasts, spin-buttons hidden. | **This disappears for free** once #1/#2 are migrated onto `ImportLinesModal`'s existing qty-input code — no separate fix needed, it's inherited automatically. |
| Qty floor/step | `qtyStep` prop, default `1`, same `Math.max(qtyStep, ...)` floor semantics as `ImportLinesModal`'s magnitude `> 0` floor | `qtyStep` doesn't exist as a concept — floor is implicitly `1` | Compatible today (both effectively floor at 1). The "should a return qty of 0 be valid" business question from the ETP-5429 ticket is explicitly **out of scope** for this phase too — keep floor behavior unchanged. |
| Re-clamp at import time | `handleImport` **recomputes** `Math.max(qtyStep, Math.min(maxQty, ...))` on every selected line right before building the POST body — a second, redundant clamp on top of the one already enforced by the (buggy) input | `handleImport` trusts `lineQuantities` as-is (already validated via `classifyQtyDraft` at commit time, no re-clamp) | Once the shared qty-input logic is adopted, this redundant re-clamp in the return flow becomes dead code — safe to drop, but confirm no other invariant depends on it. |
| Header/footer | Own `ImportModalHeader`/`ImportModalFooter` components (`ImportModalFooter.jsx`), rendered via `createPortal(..., document.body)` | Inline header/footer markup, no portal (`position: fixed` div rendered in normal component tree) | Visually near-identical (title + × button + bp name subtitle; "N selected"/"select lines" + Cancel/Import buttons). i18n key **names** differ slightly (`selectedLinesCount` + manual `.replace('{count}',...)` vs `ui('selected', {count})` using the hook's built-in interpolation) — cosmetic, reconcile during merge. **Portal handling needs care** — see below. |
| Self-portaling | Always self-portals to `document.body` | Never self-portals, relies on being mounted wherever the caller places it | **Caller-side inconsistency already exists today**: both `ReturnMaterialReceiptBottomPanel.jsx` and `ReturnToVendorShipmentBottomPanel.jsx` have **two render call-sites each** for their wrapper — one renders it plain inline, the other **already wraps it in the caller's own `createPortal(..., document.body)`**. If the merged component stops self-portaling, the plain-inline call sites need the caller to add `createPortal` themselves (cheap, but must not be missed — 2 call sites across 2 files, listed below). |
| Search input | Plain `<input>`, no `data-testid` | Has `data-testid="import-lines-search"` | Cosmetic only. |
| Empty-state messages | `noDocsKey` / `noDocsMatchSearchKey` only (2 states) | `emptyMessageKey` / `noSearchResultsKey` / `allImportedMessageKey` / `noCurrencyMatchMessageKey` (4 states — return flow doesn't need "all imported" or currency-mismatch messaging) | No functional gap — `ImportLinesModal` already has strictly more empty-state keys than needed; the extra ones simply go unused by the return-flow callers. |

## Test coverage inventory

- **`tools/app-shell/src/components/import-return-lines/__tests__/ImportReturnLinesModal.spec.jsx`**
  (164 lines, 10 tests). Covers: title render, loading state, empty state,
  doc-row render, search filter + no-match state, disabled import button when
  nothing selected, **auto-select-on-expand** (explicitly asserted via comment,
  see table above), close button, and the `bpId` absent → no fetch guard.
  **Does NOT cover**: the quantity input at all (no test touches it — this is
  exactly the untested gap that let the bug ship), the batch-import POST body
  shape, the `importedCount`/error-toast paths, `showAmount`, `qtyStep`,
  `dateField`.
- **No dedicated test file for `ImportModalFooter.jsx`** — only exercised
  indirectly through the spec above (title/close-button/disabled-button
  assertions touch it, but nothing asserts on `ImportModalHeader`/
  `ImportModalFooter` in isolation).
- **`ReturnMaterialReceiptBottomPanel.vitest.jsx`** /
  **`ReturnToVendorShipmentBottomPanel.vitest.jsx`** — fully **mock out** the
  wrapper (`vi.mock('@/windows/custom/.../ImportFrom*Modal', ...)`), asserting
  only that it renders with the right `targetId` when the empty-state import
  button is clicked (and `onSave` resolves truthy). **Robust to internal
  changes** — as long as the wrapper keeps accepting the same external props
  (`targetId`, `bpId`, `base`, `headers`, `onClose`, `onSuccess`) and mounts
  when `showModal` is true, these tests won't need touching.

## Exact call sites that must be updated (both wrappers, 2 render sites each)

- `artifacts/return-material-receipt/custom/ReturnMaterialReceiptBottomPanel.jsx`
  lines ~103 (plain, no portal) and ~164 (already `createPortal`-wrapped by the
  caller).
- `artifacts/return-to-vendor-shipment/custom/ReturnToVendorShipmentBottomPanel.jsx`
  — identical symmetric pattern, confirmed via grep (2 call sites, 1 portaled by
  caller, 1 not).

## Decisions (resolved by investigation, not left open)

1. **Import submit mechanism — resolved: support both, no design ambiguity.**
   Only two submit strategies exist in the codebase today (per-line POST loop,
   batch POST) — the unified component must support both since neither can be
   dropped without breaking a real consumer. Implementation: an injectable
   `submitImport(selectedLinesWithQty) → Promise<{ok, count}>` function prop
   that the caller provides — the 4 existing ETP-5178 consumers keep passing
   the equivalent of the current per-line loop (or `ImportLinesModal` keeps its
   built-in per-line loop as the *default* when `submitImport` isn't given, and
   the 2 return-flow wrappers pass a batch-POST `submitImport` instead). No
   further decision needed here — just implementation.

2. **Self-portaling — resolved: the unified component always self-portals to
   `document.body`.** Traced *why* the two call sites in
   `ReturnMaterialReceiptBottomPanel.jsx` (and the symmetric pair in
   `ReturnToVendorShipmentBottomPanel.jsx`) differ: `ReturnReceiptLinesEmptyState`
   (the `linesEmptyState` slot, used when the document has zero lines yet)
   renders the modal with no portal of its own; `ReturnReceiptLineActions` (the
   `detailExtraActions` slot, used once the document already has lines — see
   the in-code comment explaining it exists because `window.maxDetailLines: 0`
   suppresses `DetailView`'s normal add-line area, so this slot re-renders the
   trigger in a different part of the tree) **already wraps the modal in its
   own `createPortal(..., document.body)`**. That's real, deliberate evidence
   that at least one of the two render contexts needed portaling — someone hit
   the problem and fixed it at the call site. Since `ImportReturnLinesModal`
   already self-portals internally today, that caller-side portal is currently
   a harmless no-op (nested portals just both resolve to `document.body`).
   Making the unified component self-port always is strictly safer than
   leaving it caller-responsibility: portaling to `document.body` can only
   *prevent* a stacking/clipping bug, never cause one — so there's no
   real downside, not even for the 4 existing ETP-5178 consumers. Preserves
   current behavior for the 2 return-flow call sites without having to audit
   every ETP-5178 call site's ancestor CSS by hand.

3. **"Already imported" line concept — resolved: no frontend concept needed,
   confirmed via backend SQL (not assumption).** Read
   `ReturnMaterialReceiptHeaderHandler.java`'s `handleAvailableShipmentLines`
   (sales side) in full:
   ```sql
   SELECT l.M_InOutLine_ID, l.M_Product_ID, p.Name AS product_name, l.C_UOM_ID,
     l.MovementQty - COALESCE(ret.ret_qty, 0) AS available_qty
   FROM M_InOutLine l
   JOIN M_Product p ON p.M_Product_ID = l.M_Product_ID
   LEFT JOIN (
     SELECT rl.Canceled_Inoutline_ID, SUM(ABS(rl.MovementQty)) AS ret_qty
     FROM M_InOutLine rl
     JOIN M_InOut rh ON rh.M_InOut_ID = rl.M_InOut_ID
     WHERE rl.Canceled_Inoutline_ID IS NOT NULL AND rh.DocStatus NOT IN ('VO')
     GROUP BY rl.Canceled_Inoutline_ID
   ) ret ON ret.Canceled_Inoutline_ID = l.M_InOutLine_ID
   WHERE l.M_InOut_ID = ?
   AND l.MovementQty > COALESCE(ret.ret_qty, 0)
   ORDER BY l.Line
   ```
   The backend already nets out prior returns (`MovementQty - ret_qty`) and
   **excludes fully-returned lines from the result set entirely**
   (`WHERE l.MovementQty > COALESCE(ret.ret_qty, 0)`) — the frontend never even
   receives them. `ret_qty` sums every non-voided return (`DocStatus NOT IN
   ('VO')`), which notably includes **draft** returns too, not just completed
   ones — a draft already reduces what a second return attempt can take.
   Cross-checked the purchase-side handler,
   `ReturnToVendorShipmentHeaderHandler.java` (lines 211-220 and 259-272): same
   query shape, same netting, same exclusion — fully symmetric between the two
   flows. The frontend's `.filter((line) => line._maxQty > 0)` is therefore a
   harmless, redundant defensive check on top of a guarantee the backend
   already provides, not a masked gap. **No "already imported" UI state is
   needed in the unified component.**

## Implementation (done)

`ImportLinesModal.jsx` (`tools/app-shell/src/components/contract-ui/`) extended with
6 new optional props, all defaulting to the exact previous behavior for its 4
existing invoice-flow consumers:

| Prop | Default | Purpose |
|---|---|---|
| `submitImport({ lines, base, headers, invoiceId, sharedContext }) → Promise<{ok, count, error?}>` | `undefined` | When given, replaces the built-in per-line POST loop with a single caller-provided submit (the return flow's batch POST). `linesEndpoint` is only required when this is absent. |
| `filterZeroQty` | `false` | Drops lines with `_maxQty <= 0` right after fetch (both the lazy `loadLines` path and the eager-load effect). |
| `autoSelectOnExpand` | `false` | Adds every fetched line to `selected` right after `loadLines` populates it — the return flow's "everything pre-checked" behavior. |
| `eagerLoadLines` | `true` | Gates the pre-fetch-all-docs'-lines effect. The return flow sets it `false` to match `ImportReturnLinesModal`'s original lazy-only behavior (no upfront N+1 calls). |
| `showAvailableQtyColumn` | `false` | Renders an extra read-only column (the same `_maxQty` already used as the editable input's ceiling) before the editable qty column. |
| `qtyColumnLabelKey` | `'qty'` | Overrides the editable column's header i18n key — the return flow passes `'returnQty'`. |

Also, unconditionally for **all** consumers (the already-resolved self-portaling
decision): the component now returns `createPortal(..., document.body)` instead of
rendering inline with `position: fixed`. Verified this does not regress the 4
existing invoice-flow consumers (see Live verification below).

Two bonus fixes inherited for free by reusing `ImportLinesModal`'s own helpers
instead of the old component's local ones (not scope creep — same principle as
ETP-5178's fix being "free" for its consumers):
- `fmtDate` now parses `yyyy-MM-dd` via the local-time constructor
  (`parseCalendarDate`-equivalent logic already in `ImportLinesModal`) instead of
  `new Date(rawString)` — the old return-flow component had the exact UTC-midnight
  day-shift bug the project's Date-Only Parsing policy calls out.
- `fmtNum`/reference-qty formatting now uses `'es-ES'` + `useGrouping: true`
  instead of the old component's `toLocaleString(undefined, ...)` (browser-default
  locale, no explicit grouping).

**Files changed:**
- `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx` — extended (see above).
- `tools/app-shell/src/windows/custom/return-material-receipt/ImportFromShipmentModal.jsx` — rewritten to render `ImportLinesModal` (with the new props) instead of `ImportReturnLinesModal`. External prop contract (`targetId`, `bpId`, `base`, `headers`, `onClose`, `onSuccess`) unchanged.
- `tools/app-shell/src/windows/custom/return-to-vendor-shipment/ImportFromReceiptModal.jsx` — same migration, preserving the vendor-scoped `fetchLines` override (`receiptId` + `businessPartner` in the body).
- **Not yet touched:** `ImportReturnLinesModal.jsx` / `ImportModalFooter.jsx` (now orphaned, zero remaining source imports) and the two Vitest spec files that assumed the old `config`-object contract — left in place pending the Tester delegation below, per the Testing section's mandatory-delegation rule and the user's "no tests until live tests pass" instruction.

No i18n work was needed — every key used (`returnQty`, `qtyMaxAllowed`,
`qtyMustBePositive`, `failedToImportLines`, `linesImportedFromShipment`,
`linesImportedFromReceipt`, etc.) already existed in both `en_US.json`/`es_ES.json`
(verified by grep before writing any code).

## Live verification (done, in the browser — `localhost:3100`)

**Return-material-receipt (sales, "Importar desde envío"), contact Juan Perez:**
- Expanding a shipment auto-selects its lines (✅ `autoSelectOnExpand`).
- Reference column ("CANT.") shows the available qty read-only; editable column is
  labeled "CANT. DEVOLUCIÓN" (✅ `showAvailableQtyColumn` + `qtyColumnLabelKey`).
- Typed `1.5` into a qty input character-by-character with **no mid-keystroke
  clamping** — the ETP-5178 fix confirmed inherited.
- Typed `999` (over the max of 23) → on blur, rejected with the correct localized
  toast *"El máximo permitido es 23"*, input reverted to its last valid value — the
  `qtyMaxAllowed` validation path, previously dead code for this flow, now live.
- Selected 3 lines across 2 shipments (1000013, 1000006), clicked "Importar
  seleccionadas (3)" → batch POST succeeded, toast *"Líneas importadas desde
  envío"*, 3 lines created with correct quantities including the decimal `1,5`
  (not truncated), related documents `Envío #1000013` / `Envío #1000006` both
  marked `Completado`.
- Confirmed live the backend-netting finding from the Decisions section above:
  shipment 1000013 showed only 1 available line (Fernet) instead of the 3 it
  originally had — Agua/Cerveza had already been returned in an earlier draft, and
  the backend excluded them from the response entirely, exactly as the SQL read
  predicted.

**Return-to-vendor-shipment (purchase, "Añadir desde Albarán"), contact Proveedor
Mayorista — symmetric flow:**
- Same auto-select, reference column, free-typing behavior confirmed.
- Import succeeded: toast *"Líneas importadas desde el albarán"*, line created with
  `Cant. a devolver: 250` / `Cant. recibida orig.: 250`, related document `Recibo
  #10000007` marked `Completado`.

**Regression check on the 4 original ETP-5178 consumers (sales-invoice "Importar
desde envío", contact Juan Perez):**
- No auto-select (lines render unchecked, matching the pre-change behavior —
  `autoSelectOnExpand` correctly defaults `false` here).
- No reference column, single "CANT." editable column only (unaffected by the new
  return-flow-only props).
- Free-typing (`1.5`) still works exactly as before the createPortal change.
- No console errors in either flow (checked via `read_console_messages`, pattern
  `error|warn`, both after the return-flow and the invoice-flow tests).

## Tests (done — Tester)

Deleted the now-empty `tools/app-shell/src/components/import-return-lines/`
directory entirely (`ImportReturnLinesModal.jsx`, `ImportModalFooter.jsx`, their
old spec) after confirming via grep that nothing outside their own spec/`dist`
build output still imported them. Rewrote
`return-material-receipt/__tests__/ImportFromShipmentModal.spec.jsx` (14 tests)
against the new `ImportLinesModal`-based contract. Created
`return-to-vendor-shipment/__tests__/ImportFromReceiptModal.spec.jsx` (15 tests,
new — no prior spec existed), covering the vendor-scoped `businessPartner` body
param specifically. Extended `contract-ui/__tests__/ImportLinesModal.vitest.jsx`
(75 tests) with a describe block per new prop (`submitImport`, `eagerLoadLines`,
`filterZeroQty`, `autoSelectOnExpand`, `showAvailableQtyColumn` +
`qtyColumnLabelKey`) and fixed ~20 pre-existing tests that broke because the
component now always renders via `createPortal` — RTL's `container` is empty for
portaled content, so those assertions moved to `document.body`.
`ImportLinesModal.realCheckbox.vitest.jsx` (25 tests) needed no changes (already
queried via `screen`, which searches `document.body`).

**Result:** 108/108 targeted tests green. Full `tools/app-shell` vitest suite: 974
files / 19142 tests, 0 failures (2 pre-existing unrelated skips) — confirms no
regression across the 4 original ETP-5178 consumers either. No production bugs
found while writing tests.

## Docs (done — checked, no update needed)

Both `docs/generated-custom-windows/return-material-receipt.md` and
`return-to-vendor-shipment.md` describe the import modal only at the
functional/workflow level (import-only lines, ETP-4462: "Importar desde
envío"/"Añadir desde Albarán" CTA, no manual add). Neither documents the old
component's internal keystroke-clamp quantity behavior or any component-name
internals that this migration changes. No stale references found — no doc update
required under the self-documentation policy (the documented functional contract
is unchanged; only the internal implementation and the input's UX polish changed).

## Not done yet

- No commit made — pending user confirmation per their explicit instruction.
- Items #3/#4 (`ReturnWizard.jsx`/`PurchaseReturnWizard.jsx`) — still explicitly out
  of scope for this phase, come back to them after #1/#2 ship.
- Cost estimate for this phase already given in conversation (~9 base pts / ~14-15h,
  size L) — worth a calibration-log entry now that actuals exist, comparing
  actual vs. estimate.

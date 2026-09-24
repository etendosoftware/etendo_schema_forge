# ETP-5429 (Phase 2 of 2) — Unify the "Crear Devolución" wizards into `CreateReturnWizard.jsx`

> **Status:** implemented, verified live in the browser (both flows, including a
> real backend conflict + fix), tests delegated to Tester (in progress). Covers
> items **#3 and #4** — the "Crear Devolución" wizards on `goods-shipment` (sales)
> and `goods-receipt` (purchase), deferred from Phase 1
> (`2026-09-22-etp-5429-unify-import-return-lines.md`) per the user's explicit
> instruction to handle them separately.

## Scope

Isaías's second bullet on ETP-5178: *"Al igual que en el popup de crear albarán de
devolución los inputs no son los mismos."* — the "Crear Devolución desde
Envío"/"Crear Devolución desde Albarán" 2-step wizards, launched from a completed
`goods-shipment`/`goods-receipt` document to **create** a new return document (as
opposed to Phase 1's "import lines **into** an already-existing return document").
Different workflow, different entry point, but the same duplicated-bug shape:
`ReturnWizard.jsx` (goods-shipment) and `PurchaseReturnWizard.jsx` (goods-receipt)
were near-identical mutual duplicates (same `MiniCheck` helper reimplemented, same
keystroke-clamp qty bug) rather than derivatives of `ImportLinesModal.jsx`.

## Behavioral comparison (full read-through before touching code)

Read both files in full (386 / 336 lines) before designing anything. Identical:
`MiniCheck`, `StepIndicator` (bar the React `key`), the icon SVG, `toggleLine`/
`selectAll`/`deselectAll`, `canProceed`, `documentNo`/`bpName` extraction, the
Reason field, `handleConfirm`'s error/success shape, the footer buttons. Real
differences, all cleanly parametrizable:

1. **Amount column (sales only)** — `ReturnWizard.jsx` fetches the linked sales
   order's header (currency) + lines (unit price) since shipment lines carry no
   price, and renders an Importe column + total in step 2. `PurchaseReturnWizard.jsx`
   has neither.
2. **Auth prop shape** — sales received `token`+`apiBaseUrl` and hand-built
   `Authorization: Bearer` headers with raw `fetch` (violates the CLAUDE.md
   Authenticated-Requests policy); purchase already received `base`+`headers`.
   Confirmed via grep that the sales caller (`GoodsShipmentActions.jsx`) already
   computes both `base` and `headers` locally (lines 32-36) for other calls in the
   same file — trivial to standardize on `base`+`headers` for both.
3. **`Number()`/`Math.abs()` asymmetry** — purchase always cast+abs'd
   `movementQuantity` when seeding `quantities`/`maxQty`; sales did neither (a
   string `movementQuantity` would silently string-concatenate in
   `totalReturnQty`). Found on a second, more rigorous pass after the user
   pushed back asking whether all behaviors were truly accounted for.
4. Cosmetic-only: column width ratios in step 1's `colgroup`, i18n keys, action
   endpoint URL, icon-constant declaration style.

No behavior was left unaccounted for; the user explicitly asked this to be
verified before proceeding, and it was — see the chat record for the full
line-by-line walkthrough.

## Cost

Same pattern as Phase 1: `unify-duplicate-component`(8) + `unit-tests`(2) = 10
base points. Risk: `shared-component-refactor`(+30%) + `ci-quality-gates`(+20%).
Discount: `second-mover-reuse`(−50%) — direct precedent, the identical
generic-component + thin-wrapper shape was just built and validated in Phase 1.
Net ≈ 10 pts, size M (~1 day) — much cheaper than the original XXL/35pt estimate
that bundled all 3 files together before Phase 1 shipped.

## Implementation (done)

- **New:** `tools/app-shell/src/components/contract-ui/CreateReturnWizard.jsx` —
  generic 2-step wizard. Props: `open, onClose, sourceData, lines=[], base,
  headers, onSuccess, onError, titleKey, refLabelKey, docTypeLabelKey,
  docTypeDescriptionKey, createActionUrl(base,id), showAmountColumn=false,
  fetchPrices` (optional). Reuses `ImportLinesModal.jsx`'s `classifyQtyDraft` +
  draft-state + onBlur-validation pattern locally (duplicated, not imported — no
  other shared dependency between the two components). `quantities` always
  seeded via `Math.abs(Number(l.movementQuantity) || 0)` — the safer of the two
  original behaviors, applied uniformly.
- **Rewritten:** `artifacts/goods-shipment/custom/ReturnWizard.jsx` — thin
  wrapper; module-level `fetchPrices` using `apiFetch` from `@/auth/api.js`
  (fixes the raw-`fetch` policy violation) against
  `sales-order/header/{orderId}` + `sales-order/lines?parentId={orderId}`.
  **External contract changed**: now takes `base`+`headers` instead of
  `token`+`apiBaseUrl` — the one call site,
  `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` (~line 293), updated
  to pass `base={base} headers={headers}` (both already computed there).
- **Rewritten:** `artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx` — thin
  wrapper, `showAmountColumn` omitted (defaults false). **External contract
  unchanged** (`receiptData`, `base`, `headers` — the `GoodsReceiptActions.jsx`
  call site needed no edit).

### Bug found and fixed while migrating: error message swallowed on failure

`handleConfirm`'s error path in both original files read
`errBody?.response?.error?.message`, but the real error envelope for this action
(confirmed live via a direct probe) is `{"error":{"message","status"}}` — no
`response` wrapper. The exact same bug class was already found and fixed once in
this codebase, in `useNeoAction.js` under ETP-4706, with an explicit code comment
documenting the `NeoResponse.error(int, String)` envelope. Fixed by mirroring that
hook's fallback chain (`body?.error?.message ?? body?.response?.error?.message ??
body?.response?.message ?? body?.message ?? fallback`) and running the result
through `translateBackendError`/`extractBackendMessageKeys` from
`@/lib/backendErrors.js`, matching the project's established backend-error-i18n
pattern (`ConfirmInOutModal.jsx` uses the identical idiom). User explicitly asked
for this to be fixed with corner cases considered and tested live, not just
patched.

## Live verification (done, in the browser — `localhost:3100`)

- **Sales, shipment 1000013** (already had 2 linked returns from Phase 1 testing):
  wizard opened correctly, only the still-available Fernet line shown (0.5 of 2 —
  live confirmation of the backend-netting finding from Phase 1), free-keystroke
  qty editing (typed `0.2` then `5` character-by-character, no clamp), on-blur
  rejection of an over-max value with the correct toast, step 2 confirm →
  **409 "A return already exists for shipment: ..."** — the real backend
  conflict, not a bug in the migration.
- **Sales, shipment 1000012** (clean): full happy path — step 2 Importe column
  showed `$33,81` (computed live via `fetchPrices` against the linked sales
  order), confirm created return document 1000003 with the correct line and
  related-document link.
- **Purchase, receipt 10000006** (clean): partial selection (deselected 2 of 3
  lines), free-keystroke decimal qty (`12.5`), step 2 correctly has **no**
  Importe column, confirm created purchase-return document 1000012.
- **Purchase, receipt 10000007** (already had a linked draft return): its only
  line was already fully committed to that return, so the wizard's line list was
  empty and "Siguiente" stayed disabled — same backend-netting behavior as
  sales, not reachable as a live 409 repro on the purchase side with current
  data; not forced artificially since the fix lives in fully shared code
  (`handleConfirm`) already verified working on the sales side.
- **Post-fix regression check**: repeated the sales happy path (shipment
  1000010 → return 1000004) after the error-parsing fix to confirm the success
  path was not broken by moving `res.json()` before the `!res.ok` check.
  Re-triggered the 409 case (shipment 1000013) post-fix: toast now shows the
  real message instead of the generic "Request failed (409)".
- No console errors in any of the above.

## Tests (done — Tester)

- **New:** `tools/app-shell/src/components/contract-ui/__tests__/CreateReturnWizard.vitest.jsx`
  (25 tests) — direct coverage of the shared component: no-render-when-closed,
  auto-selection with the defensive `Math.abs(Number(...)||0)` seeding
  (including negative/string/NaN source values), free-keystroke qty editing with
  no clamp, on-blur validation (both toast paths + revert + decimal round-trip),
  Next/Back navigation, `canProceed` gating, `showAmountColumn` on/off, and —
  most importantly — explicit regression coverage for the error-parsing fix:
  the `{error:{message,status}}` 409 envelope surfaces the real sentence, plus
  the no-recognized-shape fallback, the `res.json()`-rejects case, and the
  `response.error.message` nested-envelope case.
- **New:** `tools/app-shell/src/windows/custom/goods-shipment/__tests__/ReturnWizard.vitest.jsx`
  (11 tests) — the sales wrapper, which had zero tests before. Covers wrapper
  delegation, the Amount-column differential vs. purchase, the `createReturn`
  action URL, and `fetchPrices` (no-op without `salesOrder`, both endpoints
  called correctly, resilient to a rejected fetch).
- **Verified unchanged:** `PurchaseReturnWizard.vitest.jsx` (6/6, unaffected by
  the refactor, as predicted) and the two call-site tests
  (`GoodsShipmentActions.vitest.jsx` + `GoodsReceiptActions.vitest.jsx`, 43/43
  combined — both already mock the wizard wrapper entirely, so the `base`/
  `headers` prop-shape change was invisible to them).
- **Deliberate convention deviation, confirmed correct:** Tester did not mirror
  `ImportLinesModal.vitest.jsx`'s `createPortal`-to-`document.body` assertions —
  `CreateReturnWizard.jsx` uses the Radix-backed `@/components/ui/dialog`
  (mocked to plain divs, same as the pre-existing `PurchaseReturnWizard.vitest.jsx`
  convention), not a hand-rolled portal, so that assertion would have been
  meaningless here.
- **Test-infra gotcha documented for future writers:** `formatCurrency()` joins
  the amount and symbol with a literal NBSP; RTL's `getByText` doesn't normalize
  that in a plain-string matcher the way it normalizes rendered `textContent`.
  Tester added a small `findByNormalizedText()` helper in the new spec.

**Result:** 25 + 11 + 6 + 43 = 85 targeted tests green. Full `tools/app-shell`
suite: 976 files / 19178 tests, 0 failures (2 pre-existing unrelated skips). No
production bugs found beyond the one already fixed.

## Not done yet

- No commit made — pending user confirmation, same as Phase 1.

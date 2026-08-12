# ETP-4777 — Fix plan: Form summary Total / Send-PDF Total must match Grid Imp. Total

**Status:** implemented and exhaustively verified (TDD: failing tests → fix → passing tests → live browser verification across Sales/Purchase Order, Sales/Purchase Invoice, Sales Quotation, and Shipments/Receipts, including Draft→Complete transitions, an invoice-created-from-a-discounted-order path, edge cases — 100% line discount, 100% document discount — and a full non-org-currency pass against ETP-4027/4028/4029, see §7). Companion investigation doc: `docs/bug-reports/2026-08-12-form-summary-total-rounding-mismatch.md` (read that first — this plan assumes its findings and does not re-derive them).

## 0. Implementation summary (what actually shipped)

Six commits on `feature/ETP-4777`:
1. Investigation + this plan doc.
2. Failing tests (RED) for `DocumentTotalsPanel` (Case 1/3) and `documentPdf.js`'s `buildOrderData` (Case 2).
3. The fix: `DocumentTotalsPanel.jsx` gained a `persistedTotals` prop, preferred over `computeDocumentTotals` whenever there's no pending line/edit; `LinesBottomSection.jsx` derives it from `data.grandTotalAmount`/`data.summedLineAmount`; `documentPdf.js`'s `buildOrderData` now sources `grandTotal`/`taxAmount` from the persisted header instead of recomputing, matching the pattern already proven correct in `buildInvoiceData`/`buildQuotationData`.
4. A follow-up commit fixing two regressions found during manual browser verification (not caught by the original test scenarios) — see §5.
5. A second follow-up fixing a stale-total bug in `DetailView.jsx`'s discount-% save handler, found while re-verifying §5's fix — see §5.
6. A third follow-up replacing the `isReadOnly`-based raw-vs-discounted heuristic with a self-consistent one (comparing against a fresh recompute) after it broke on an invoice created from an already-discounted order — see §5.

**Turned out simpler than expected:** `documentTotals.js` itself needed zero changes — see §2.

## 5. Four regressions found during manual verification (all fixed, tests added)

Verifying against real Draft documents (multi-line + per-line discount + document discount, matching the ticket's reproduction shape) across every document type surfaced four issues neither the original design nor the first round of tests anticipated:

1. **Typing into the "Descuento total" % input froze the panel.** The % input's `onChange` only updates local `inputPct` state — it never touches `pendingLine`/`editingLine`. `hasPendingEdit` (the flag gating baseline-vs-recompute) didn't know about this, so the panel kept showing the frozen persisted baseline while the user typed, ignoring every keystroke until the `onBlur` PATCH round-tripped. Fix: `hasPendingEdit` now also becomes true whenever `inputPct !== totalDiscountPct` (the prop) — i.e. there's an unsaved discount-% edit in flight.
2. **After the discount-% PATCH resolved, the Total stayed frozen on the stale pre-discount value** — verified live on a Sales Order: typed 30%, backend correctly returned `grandTotalAmount: 418.38`, but the Form kept showing 597,69 € until a full page reload. Root cause: `DetailView.jsx`'s `handleTotalDiscountChange` only applied `hook.handleChange('etgoTotalDiscount', pct)` (an optimistic patch of that one field) after the PATCH — it never refreshed `grandTotalAmount`/`summedLineAmount`, which the backend DID recompute. Once `inputPct` caught up to the (now also-updated) `totalDiscountPct` prop, `hasPendingEdit` went false and the panel trusted the stale baseline. Fix: call `hook.refreshHeaderTotals(currentId)` after the successful PATCH — the same lightweight header re-GET already used elsewhere in `DetailView.jsx` for an analogous case (the `exchangeRates` PATCH handler).
3. **Completing the document with a pending discount initially broke Subtotal/Impuesto (Total stayed correct)** — first fix attempt used `isReadOnly` (`documentStatus !== 'DR'`) to decide whether `summedLineAmount` was still raw (pre-discount) or already net-of-discount (once `TotalDiscountService` materialises the `ETGO_DTO` line at Complete). `resolveTotalDiscountPct`'s own "is there a materialised line?" check can't tell — that line is filtered out of `lines` server-side, so it always reports "not materialised" and returns the full pct regardless.
4. **The `isReadOnly` heuristic from fix #3 broke on a Sales Invoice created from an already-discounted Sales Order** — `InvoiceFromOrderSupport` materialises the discount line **immediately at creation**, so a Draft invoice can already have `summedLineAmount` net-of-discount, contradicting the "Draft ⇒ raw" assumption. Verified live: Subtotal 296,38 + Impuesto 162,02 ≠ Total 478,16. **Final fix:** replaced the `documentStatus`-based guess with a self-consistent check — compare the persisted `netSubtotal` against a *fresh recompute from the current lines' own qty/price/per-line-discount* (`recomputed.netSubtotal`, already computed by `DocumentTotalsPanel` for the live-edit path). If they differ by more than rounding noise, the persisted figure must already be net-of-discount; if they match, it's still raw. This needs no knowledge of document status or materialisation timing at all, and the reconciliation logic moved from `LinesBottomSection.jsx` into `DocumentTotalsPanel.jsx` (where the recompute already lives) — `LinesBottomSection.jsx` now only passes the two raw header fields through.

All four were caught by literally reproducing the ticket's steps in the browser (localhost:3100) against real and newly-created data before declaring the fix done — see §6 for the full verification log.

## 6. Live verification log (localhost:3100)

### 6.1 Purchase Order 1000009 — original reproduction (multi-line, per-line + document discount, Draft → Complete)

| Step | Grid "Imp. Total" | Form panel Total | Subtotal + Impuesto |
|---|---|---|---|
| Draft, 1 line, no discount | 121,00 € | 121,00 € | 100,00 + 21,00 = 121,00 ✓ |
| Draft, 2 lines (15% line discount) + 25% doc discount | 99,23 € | 99,23 € | 82,01 + 17,22 = 99,23 ✓ |
| **After Confirmar (documentStatus → CO)** | 99,23 € (unchanged) | **99,23 €** (was frozen at the pre-Complete value before the fix — Case 3) | 82,01 + 17,22 = 99,23 ✓ |

Before the fix, the equivalent local records (`1000008`, `1000007`, sales order `1000010` — all using tax-exclusive price lists) showed the Form panel Total as **0,00 €** while the Grid showed the real persisted value (e.g. 3.327,50 €) — the same defect the ticket describes, reproduced here in its most extreme local form. Confirmed fixed on all three after the change.

### 6.2 Exhaustive matrix — every document family, both sides, edge cases

All created fresh via the UI and cross-checked Form Total vs Grid "Imp. Total" (and Subtotal+Impuesto internal consistency):

| Document | Scenario | Grid | Form Total | Consistent? |
|---|---|---|---|---|
| Sales Order 1000016 | 3 lines (12%/5%/0% line discounts, mixed qty/price) + 30% doc discount | 597,69 € → **418,38 €** after discount | matches at each step | ✓ (after fix #2 for the live-update-after-PATCH bug) |
| → Sales Invoice 10000020 | Created via "Crear factura" from the Order above (discount line materialised immediately, still Draft) | 478,16 € | 478,16 € (395,17+82,99) | ✓ (after fix #4) |
| Purchase Order 1000011 | Edge case: one line at **100% line discount** | 0,00 € | 0,00 €, no NaN | ✓ |
| Purchase Order 1000011 | Edge case: **100% document discount** on top of a normal line | 0,00 € | 0,00 €, no NaN, no tax row (correctly hidden) | ✓ |
| Purchase Invoice 10000010 | Standalone (not from an order), 1 line 8% discount + 15% doc discount, Draft → Complete | 218,57 € | 218,57 € (180,64+37,93) — 1-cent shift on Complete is the accepted Task 3 tradeoff | ✓ |
| Sales Quotation 1000001 | 1 line + 12% doc discount, Draft → "Enviar a evaluación" (Bajo Evaluación) | 459,99 € | 459,99 € (380,16+79,83), unchanged across the status transition | ✓ |
| Sales Albarán 1000013 | Goods Shipment | — | No totals panel at all (Form or PDF) | ✓ confirmed out of scope, as designed |
| Purchase Albarán (Goods Receipt) | list view | — | No monetary column at all | ✓ confirmed out of scope, as designed |

Case 2 (Send/Preview PDF) for the Order/Invoice above was confirmed via the unit tests added in commit 2 (`documentPdf.buildOrderData.vitest.jsx`) plus cross-checking the live header API response (`grandTotalAmount`) against what `buildOrderData`'s fixed code path now reads — the actual rendered PDF couldn't be visually captured because "Abrir"/opening the generated PDF triggers a new browser window that the automation tooling couldn't attach to (popup not created via the tracked tab group). Not a gap in the fix itself, just in how far the visual proof could be pushed with the available tooling.

### 6.3 New out-of-scope finding — a THIRD confirm-modal-total bug, same family as the one already flagged

The "Confirmar pedido"/"Confirmar presupuesto" modals (`OrderConfirmModal.jsx`/`QuotationConfirmModal.jsx` or equivalent) each show their own preview total, computed independently of both the Form panel and `computeDocumentTotals`:

- Purchase Order 1000009 (25% discount): modal showed **74,42 €** vs the real 99,23 €.
- Sales Order 1000016 (30% discount): modal showed **382,52 €** vs the real 418,38 €.
- Sales Quotation 1000001 (12% discount): modal showed **404,79 €** vs the real 459,99 €.

Three independent confirmations of the same pattern — this is a real, reproducible bug, but it's a fourth/fifth total-display surface not among the ticket's 3 reported cases, and wasn't in this investigation's original scope. Recommend filing a separate ticket ("Confirm modal preview total doesn't match the document's real total") rather than folding it into ETP-4777's fix, since fixing it means auditing yet another set of components (`*ConfirmModal.jsx` per document type) with their own totals logic.

**Branch:** `feature/ETP-4777` (created from `origin/epic/ETP-3504`, no upstream yet).

## 1. Scope

### In scope
- Sales Order, Purchase Order, Sales Invoice, Purchase Invoice, Sales Quotation — the Form summary panel (`DocumentTotalsPanel.jsx`/`LinesBottomSection.jsx`) and the client-rendered Send/Preview PDF (`documentPdf.js`).
- The Draft-window "third formula" for the pending document discount (GET-time `grandTotalAmount * (1 - pct/100)` compensation in `Abstract{Order,Invoice}HeaderHandler.applyTotalDiscountToRecord()`).

### Explicitly out of scope (confirmed in the investigation doc, do not touch)
- Backend triggers (`C_ORDERLINE_TRG2.xml`, `C_INVOICELINE_TRG2.xml`, `C_ORDERTAX_ROUNDING.xml`) — already correct, the reference source of truth.
- Official jsreport print artifacts (`print-sales-order/`, etc.) — already read persisted values.
- ETP-4714 (`hidePrintWhen` on the generic "Imprimir" icon) — orthogonal, no shared files, can land before/after/independently.
- Goods Shipment/Receipt, Returns — no monetary totals exist there.
- Purchase Invoice print/preview — doesn't exist today (`hidePrint: true`, no `usePurchaseInvoicePdf`). Not part of this fix; flag as a separate pre-existing gap if the team wants it built later.
- Header field changes (Price List/Currency/Business Partner) recalculating existing lines — confirmed a non-issue on both Classic and Go.

## 2. Design principle

**Simplified during implementation** (turns out simpler than the original baseline+delta design below): none of the 3 reported cases in the ticket occur while a line is actively being typed/pending — Case 1 (Form ≠ Grid) and Case 3 (stale after Complete) both describe an already-saved document with **no pending edit in progress**. So the fix doesn't need a new "delta" mechanism at all:

1. The last **backend-returned header total** (`grandTotalAmount`, and whatever underlying fields it's derived from — see Task 0 below) is the **authoritative baseline**. It is correct by construction, because it's read straight from `C_Order`/`C_Invoice` columns maintained by the trigger.
2. **When there is no pending/editing line, always show the baseline verbatim** — never call `computeDocumentTotals` in that state. This alone fixes Case 1 (saved Draft) and Case 3 (post-Complete, also no pending line) with zero new arithmetic.
3. **When there IS a pending/editing line** (user actively typing an unsaved row), keep today's existing `computeDocumentTotals(lines, pendingLine, editingLine, ...)` full recompute, unchanged. Nobody has reported this transient in-progress number as wrong — only what's shown once something is saved — so there's no need to build a baseline+delta blending mechanism for it. (If a future ticket asks for the live-typing estimate to also track the baseline more tightly, that's a separate, additive change — not required here.)
4. Every server round-trip that changes the baseline (line save/autosave, header PATCH, `documentAction=CO`, initial load) naturally refreshes it because it's just `data.grandTotalAmount` from the already-fetched header record — no new refetch/sequencing logic needed, `data` is already a prop.
5. `documentPdf.js` (Send/Preview) is **only ever reachable on a non-Draft document** (confirmed: gated by `isCompleted`/`status !== 'DR'` in all 4 windows that have it) — so it needs **no baseline/pending distinction at all**. It should simply render `header.grandTotalAmount`/persisted tax breakdown unconditionally, same as `buildInvoiceData`/`buildQuotationData` already do.

## 3. Decided — transient live-estimate formula (Task 2) and Draft-discount handling (Task 3)

**Live-estimate formula while a line is pending:** keep ETP-4015's convention (`round2(subtotal) + round2(tax)`) for the transient in-progress number. Once the baseline+delta model lands (§2), this formula only has to survive for the few hundred ms between a keystroke and the line's autosave — it's never again the number that stays on screen after save/Complete (that's always the baseline). This avoids re-opening the ETP-4015 discussion and keeps Task 2's diff minimal. See §4 Task 3 for the corresponding decision on the discount-pending window specifically.

## 4. Tasks

### Task 0 — Authoritative fields (resolved by reading the code — no spike needed)

Confirmed directly in source, no live API call needed: the persisted header fields used consistently across the codebase (`ConfirmDocumentModal.jsx`, `CreateInvoiceConfirmModal.jsx`, `PurchaseOrderActions.jsx`, and — critically — `useInvoicePdf.js`/`useQuotationPdf.js`, which already build their PDF totals this way) are:

- `data.grandTotalAmount` — the persisted grand total (maps to `C_Order.GrandTotal`/`C_Invoice.GrandTotal`).
- `data.totalLines` (fallback pattern seen: `header.summedLineAmount ?? header.totalLines`) — the persisted net subtotal (maps to `TotalLines`).
- `taxAmt` is **not** separately exposed — every existing correct consumer derives it client-side as `grandTotal - netAmount` (`useInvoicePdf.js:38`, `useQuotationPdf.js:39`). Reuse that, don't add a new backend field.
- `data.etgoTotalDiscount` — already used by `resolveTotalDiscountPct` (`documentTotals.js:39-46`) to detect whether the discount is materialized as a line yet.

No backend/NEO changes needed for this fix — every field required already exists in the header GET response and is already proven correct by `buildInvoiceData`/`buildQuotationData` (see Task 4).

### Task 1 — `documentTotals.js`: no changes needed

Confirmed while implementing: `computeDocumentTotals()`'s internal formula is unaffected by this fix — it's kept, unchanged, exclusively for the "pending/editing line in progress" case (§2.3), which nobody reported as wrong. Its existing test suite (`documentTotals.test.js`/`.vitest.js`, including the ETP-4015/4017 double-rounding-avoidance tests) stays green with zero edits. This task is a no-op; left here only so the task numbering matches the investigation doc's file list.

### Task 2 — `DocumentTotalsPanel.jsx` / `LinesBottomSection.jsx`: prefer the persisted baseline when nothing is pending

- Add a new prop to `DocumentTotalsPanel`, e.g. `persistedTotals = null` (shape `{ grandTotal, netSubtotal, taxAmt }`), threaded through from `LinesBottomSection.jsx` (which already receives the full header `data` and just needs to compute `{ grandTotal: data?.grandTotalAmount, netSubtotal: data?.totalLines, taxAmt: (data?.grandTotalAmount ?? 0) - (data?.totalLines ?? 0) }` and pass it down — see Task 0 for field names).
- In `DocumentTotalsPanel`: when `persistedTotals` is provided **and** there's no `pendingLine`/`editingLine`, use `persistedTotals.{grandTotal,netSubtotal,taxAmt}` directly instead of calling `computeDocumentTotals`. When a pending/editing line IS present, fall through to the existing `computeDocumentTotals(lines, pendingLine, editingLine, lineConfig, inputPct)` call exactly as today (§2.3) — no blending logic needed.
- This alone fixes **Case 1** (no pending edit → number is always the persisted one, byte-identical to the Grid) and **Case 3** (post-Complete reload also has no pending line, so it now shows the true post-completion total — no more stale pre-confirmation number). No race-condition/sequencing concerns — `persistedTotals` is derived straight from the `data` prop already being passed down on every render, there's no separate fetch/state to get out of sync.
- The Draft-with-pending-discount window (Task 3) needs no special-casing here: `data.grandTotalAmount` at that point already *is* the GET-time-compensated value (per Task 3's decision), so it flows through this same `persistedTotals` path unchanged.

### Task 3 — Draft-discount "third formula": use it as-is (decided)

While `etgoTotalDiscount > 0` and no `ETGO_DTO` line exists yet (pre-Complete), `data.grandTotalAmount` from the GET is **already** `rawTotal * (1 - pct/100)` — a third, server-computed approximation, distinct from the algorithm the trigger uses once the discount line lands at Complete.

**Decision: treat this GET-time-compensated value as the baseline for this window too**, same as any other server-returned total (§2.1). Zero new code beyond "use the baseline as-is" — no client-side replication of `TotalDiscountService.recalculate()`'s per-tax-group math. Rationale:
- It's still a server-computed number, consistent with the "always trust the server, never recompute fiscal math client-side" principle this whole fix is built on.
- The discount genuinely isn't final until Complete in the backend's own data model (no `ETGO_DTO` line exists yet) — a visible one-time adjustment when Completing is an honest reflection of that, not a bug. Classic has an equivalent "numbers can shift on Complete" behavior for other fields (e.g. period-close proration) that users already expect.
- Replicating the per-tax-group synthetic-line math in JS purely to make the Draft-time number match Complete-time would reintroduce exactly the two-implementations-of-fiscal-math risk (Java vs JS) that Root cause #2 already demonstrated is a real, recurring failure mode in this codebase — not worth taking on pre-emptively for a cosmetic smoothing of one transition.

No follow-up ticket is being pre-opened for option (b) (client-side replication) — if real users flag the post-Complete jump as confusing once this ships, revisit then with actual feedback rather than speculatively building it now.

### Task 4 — `documentPdf.js`: fix `buildOrderData()` only (narrower than first thought)

Re-verified directly against source: `documentPdf.js` has **three** independent builder functions, and only one is buggy.

- `buildInvoiceData()` (`useInvoicePdf.js`, Sales Invoice) and `buildQuotationData()` (`useQuotationPdf.js`, Sales Quotation) **already** read `header.grandTotalAmount` / `header.summedLineAmount ?? header.totalLines` directly and derive `taxAmount = grandTotal - netAmount` — exactly the pattern this fix wants everywhere else. **No change needed to either.**
- `buildOrderData()` (`documentPdf.js:276-333`, shared by `useOrderPdf.js`/Sales Order and `usePurchaseOrderPdf.js`/Purchase Order) is the only one still calling `computeDocumentTotals(linesRaw, ...)` for the summary numbers (lines 296-303).

**Fix:** in `buildOrderData()`, replace the `computeDocumentTotals` call's `grandTotal`/`taxAmt` outputs with the same pattern already proven in `buildInvoiceData`/`buildQuotationData`: `const grandTotal = Number(header.grandTotalAmount ?? 0); const netAmount = Number(header.summedLineAmount ?? header.totalLines ?? 0); const taxAmount = grandTotal - netAmount;`. Keep `computeDiscountBreakdown`-equivalent logic (or reuse `computeDocumentTotals`'s `discountAmt`/`grossSubtotal` outputs, still needed for the "descuento por producto" display row) — only the grand total / tax amount need to switch source; per-line rows keep sourcing from `linesRaw` as today. Since this path is unreachable on Draft documents (confirmed for all 4 windows), there's no delta/baseline dance needed here (unlike Task 2) — always use the persisted value, full stop.

### Task 5 — Tests

- Update `tools/app-shell/src/lib/__tests__/documentTotals.test.js`/`.vitest.js` — remove/rewrite cases that pin the old "always recompute from lines" behavior; add cases for the new baseline+delta entry point, including a multi-line/shared-tax-group fixture compared against a real trigger-computed `grandtotal` (pull one from a seeded local doc, don't hand-derive it).
- Update `DocumentTotalsPanel.vitest.jsx` — cover: no pending line (shows baseline verbatim), pending line (shows baseline+delta), post-Complete reload (shows the new baseline, not the stale pre-Complete number — this is the Case 3 regression test), and the race-condition sequencing from Task 2.
- New coverage for `documentPdf.js` — assert it never imports/calls `computeDocumentTotals` for the summary block (a simple `grep`/static-check test, cheap and durable), plus a snapshot-style test confirming rendered totals match the mocked header's persisted fields.
- New coverage for the Task 3 decision — whichever option is chosen, add a fixture with an active `etgoTotalDiscount` in Draft and assert the panel shows exactly what was decided (GET-time-compensated value for option (a)).
- Per `docs/e2e-testing-guide.md`, delegate any Playwright E2E additions to the `test-generator` subagent; this plan doesn't mandate new E2E specs unless QA (Sentinel) asks for one after reviewing.

### Task 6 — Rollout

- No `decisions.json`/generated-window changes are needed (this is generic `tools/app-shell/src/lib` and `tools/app-shell/src/components/contract-ui` code, not per-window config) — so the Window Change Integrity Protocol / `make regen` steps in the root `CLAUDE.md` don't apply here. Standard `make test` + the repo's normal PR flow is sufficient.
- Since ETP-4714 and this fix share no files, no merge-order dependency — land whichever is ready first.
- Follow `docs/self-documentation-policy.md`: update the bug-report doc's status line to "Fixed" and link the PR once merged; no `docs/generated-custom-windows/<window>.md` changes expected (no window-specific behavior changed, the shared components changed).

## 5b. Suggested sequencing

Task 0 (spike) → Task 1 → Task 2 (Form panel; ships Case 1 + Case 3 fixes) → Task 4 (Send PDF; ships Case 2 fix) → Task 3 (discount decision, can be decided/implemented in parallel with Task 4 since it's isolated to the Draft-discount branch) → Task 5 (tests, ideally written alongside each task rather than batched at the end) → Task 6.

## 7. Currency regression check — ETP-4027 (order currency) / ETP-4028 (shipment currency) / ETP-4029 (invoice currency)

Requested explicitly, since this fix touches `DetailView.jsx` and `DocumentTotalsPanel.jsx`/`LinesBottomSection.jsx`, shared code also used by the currency features built in ETP-4027/4028/4029. Read `docs/plans/ETP-4027-cross-domain.md`, `docs/plans/ETP-4029-currency-invoice.md`, and `docs/plans/2026-07-29-etp-4028-plan.md` first — this section assumes their content.

**Key found-in-code coupling before testing:** `DetailView.jsx:2368-2389` — a `useEffect` re-fetches the invoice's "Exchange Rates" secondary tab whenever `hook.selected.grandTotalAmount` changes, because `InvoiceLineHandler#syncConversionRateDocumentAfterLineSave` recomputes that tab's `foreignAmount` from `grandTotalAmount` server-side. Before this fix's Task 5 regression (§5, item 2), `handleTotalDiscountChange` never updated `hook.selected.grandTotalAmount` after a discount-% PATCH, so **this fix's `refreshHeaderTotals` call also fixes a second, previously-unnoticed staleness bug**: the Exchange Rates tab's `foreignAmount` used to stay frozen after a document-discount change on a non-org-currency document, exactly like the Total row did.

### Live verification (localhost:3100)

1. **Sales Order 1000017, contact "Tercero España", currency switched EUR→USD via `CurrencyRatePicker` (rate 1.47)** — line price auto-converted (23,00 € × 1.47 = 33,81 $, confirmed exactly), 10% line discount + 18% document discount added. Grid "Imp. Total" and Form Total matched at every step (150,96 $ = Subtotal 124,76 $ + Impuesto 26,20 $) — the fix holds in a non-org currency exactly as in EUR.
2. **Confirmed the order with "Crear factura" checked** — new Sales Invoice inherited `currency=USD` and `eTGOCurrencyRate=1.47` immediately (ETP-4029's `InvoiceFromOrderSupport.propagateOrderRateToInvoice`), "Exchange Rates" tab showed 1 row (USD→EUR, index 0.680272108844, foreign amount 102,69 € = 150,96 × 0.680272...). Total matched the source order exactly (150,96 $) — the discount line was materialised immediately at creation (as documented), and the fix's `isAlreadyDiscounted` reconciliation (§5 item 4) correctly recognized this and showed the right number from the first render, no page reload needed.
3. **Changed the invoice's document discount from 18% → 25% while still Draft** — `etgoTotalDiscount` saved (toast confirmed), but `grandTotalAmount` did **not** change (verified via the header API: stayed at 150.96). This is **expected, not a bug**: `applyTotalDiscountToRecord`'s GET-time compensation only runs when `!hasDiscountLine`, and here the discount line already exists (inherited from the order) — the line only gets *re-materialised* with the new percentage at Complete (`TotalDiscountService.recalculate()`), same as the plain-order case in §5 item 4. The Form panel correctly showed the persisted (unchanged) total throughout — it never lied, it just didn't move, because the backend hadn't moved either.
   - **UX note worth flagging to product** (not a defect this fix should carry): before this fix, the panel would have shown *some* changing number as the user typed 25% (via the always-live `computeDocumentTotals` on the un-filtered lines, i.e. the exact double-counting bug this whole ticket exists to remove) — wrong, but visually responsive. After this fix, the number correctly stays put until Complete. Net effect: for this specific path (invoice inherited from an already-discounted order, discount edited again before completing), the UI now visibly "does nothing" in response to typing a new %, which is correct but may read as unresponsive. If product wants live feedback here, that requires the backend to re-materialise the discount line on every header save (not just Complete) for this path specifically — out of scope for ETP-4777, flagging for a follow-up conversation.
4. **Confirmed the invoice** — Grid updated to 138,07 $ (25% correctly applied). Form panel (Subtotal 114,11 $ + Impuesto 23,96 $ = Total 138,07 $), the dual-currency summary panel (93,93 € / (1,47) 138,07 $), the client-rendered PDF preview (same breakdown, same 138,07 $ total), and the Exchange Rates tab (foreign amount recalculated to 93,93 €) — **five independent surfaces, all consistent**, confirming both this fix and its beneficial side-effect on the Exchange Rates tab.
5. **ETP-4028 sanity check** — opened a new Goods Shipment (`goods-shipment/new`): the `Moneda` field (added by ETP-4028) is present, defaults to the org currency (EUR), and renders correctly. Not exercised further (shipments carry no totals, and this fix touches no shipment-specific code), but confirms no shared-component regression leaked into that window.

**Conclusion: no regressions found against ETP-4027/4028/4029.** The one behavioral nuance found (item 3) is a pre-existing backend design characteristic (discount materialization timing), newly *visible* now that the Form panel stopped lying about the total — not something this fix introduced or should fix.

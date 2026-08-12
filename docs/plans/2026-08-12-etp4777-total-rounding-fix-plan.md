# ETP-4777 — Fix plan: Form summary Total / Send-PDF Total must match Grid Imp. Total

**Status:** implemented and verified (TDD: failing tests → fix → passing tests → live browser verification against real seeded data, including a Draft→Complete transition with per-line + document-level discount matching the ticket's reproduction shape). Companion investigation doc: `docs/bug-reports/2026-08-12-form-summary-total-rounding-mismatch.md` (read that first — this plan assumes its findings and does not re-derive them).

## 0. Implementation summary (what actually shipped)

Three commits on `feature/ETP-4777`:
1. Investigation + this plan doc.
2. Failing tests (RED) for `DocumentTotalsPanel` (Case 1/3) and `documentPdf.js`'s `buildOrderData` (Case 2).
3. The fix: `DocumentTotalsPanel.jsx` gained a `persistedTotals` prop, preferred over `computeDocumentTotals` whenever there's no pending line/edit; `LinesBottomSection.jsx` derives it from `data.grandTotalAmount`/`data.summedLineAmount`; `documentPdf.js`'s `buildOrderData` now sources `grandTotal`/`taxAmount` from the persisted header instead of recomputing, matching the pattern already proven correct in `buildInvoiceData`/`buildQuotationData`.
4. A follow-up commit fixing two regressions found during manual browser verification (not caught by the original test scenarios) — see §5.

**Turned out simpler than expected:** `documentTotals.js` itself needed zero changes — see §2.

## 5. Two regressions found during manual verification (fixed, tests added)

Verifying against a real Draft document (multi-line + per-line discount + 25% document discount, matching the ticket's reproduction shape) surfaced two issues neither the original design nor the first round of tests anticipated:

1. **Typing into the "Descuento total" % input froze the panel.** The % input's `onChange` only updates local `inputPct` state — it never touches `pendingLine`/`editingLine`. `hasPendingEdit` (the flag gating baseline-vs-recompute) didn't know about this, so the panel kept showing the frozen persisted baseline while the user typed, ignoring every keystroke until the `onBlur` PATCH round-tripped. Fix: `hasPendingEdit` now also becomes true whenever `inputPct !== totalDiscountPct` (the prop) — i.e. there's an unsaved discount-% edit in flight.
2. **Completing the document with a pending discount broke Subtotal/Impuesto (Total stayed correct).** `resolveTotalDiscountPct`'s "is the discount already a materialised line?" check reads the `lines` prop — but the `ETGO_DTO` discount line is filtered out server-side before it ever reaches the frontend, so that check can never detect materialisation and always returns the full pct. Before Complete, `summedLineAmount` is the raw (pre-discount) net; after Complete, once `TotalDiscountService` materialises the line, `summedLineAmount` becomes net-of-discount — same field, opposite meaning, and nothing in the payload flags which one it currently is except `documentStatus`. The fix branches on `isReadOnly` (`documentStatus !== 'DR'`) to know which of "raw" vs "discounted" net subtotal `summedLineAmount` currently represents, and derives the other one from it — see the `rawNetSubtotal`/`discountedNetSubtotal` split in `LinesBottomSection.jsx`.

Both were caught by literally reproducing the ticket's steps in the browser (localhost:3100) against real seeded purchase-order data before declaring the fix done — see §6 for the full verification log.

## 6. Live verification log (localhost:3100, Purchase Order 1000009)

Real end-to-end run reproducing the ticket's exact reproduction shape (multi-line, per-line discount, 25% document-level discount, Draft → Complete):

| Step | Grid "Imp. Total" | Form panel Total | Subtotal + Impuesto |
|---|---|---|---|
| Draft, 1 line, no discount | 121,00 € | 121,00 € | 100,00 + 21,00 = 121,00 ✓ |
| Draft, 2 lines (15% line discount) + 25% doc discount | 99,23 € | 99,23 € | 82,01 + 17,22 = 99,23 ✓ |
| **After Confirmar (documentStatus → CO)** | 99,23 € (unchanged) | **99,23 €** (was frozen at the pre-Complete value before the fix — Case 3) | 82,01 + 17,22 = 99,23 ✓ |

Before the fix, the equivalent local records (`1000008`, `1000007`, sales order `1000010` — all using tax-exclusive price lists) showed the Form panel Total as **0,00 €** while the Grid showed the real persisted value (e.g. 3.327,50 €) — the same defect the ticket describes, reproduced here in its most extreme local form. Confirmed fixed on all three after the change.

**Out-of-scope finding, flagged but not fixed here:** the "Confirmar pedido" modal (`OrderConfirmModal.jsx`/equivalent) shows its own preview total, computed independently of both the Form panel and `computeDocumentTotals` — observed showing **74,42 €** for the same document where Grid/Form both correctly showed 99,23 €. This is a fourth, undocumented total-display surface, not one of the ticket's 3 reported cases, and wasn't analyzed as part of this investigation. Worth its own follow-up ticket.

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

## 5. Suggested sequencing

Task 0 (spike) → Task 1 → Task 2 (Form panel; ships Case 1 + Case 3 fixes) → Task 4 (Send PDF; ships Case 2 fix) → Task 3 (discount decision, can be decided/implemented in parallel with Task 4 since it's isolated to the Draft-discount branch) → Task 5 (tests, ideally written alongside each task rather than batched at the end) → Task 6.

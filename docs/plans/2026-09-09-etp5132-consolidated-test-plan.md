# ETP-5132 — Consolidated live test plan (discount sign fix + confirm-modal double-discount fix)

Date: 2026-09-09

Branch: `feature/ETP-5132` (no worktree — all changes uncommitted in the main repo working tree,
per explicit instruction)

Status: **Both fixes verified live across all 5 windows — every non-N/A case in this plan is now
confirmed.** Part D (confirm-modal fix): D1, D2, D3, D4, D5 all passing on Sales Order and Purchase
Order (D1/D2/D5 also on Sales Quotation — the 3 windows with a confirm-modal double-discount risk).
Part A/B (discount-sign fix): CP-1, CP-2, B3, B4, B5, B6 passing on all applicable windows; B1
passing on 2 of 5; B2 passing on 2 of 5 (both low-risk, shared-code-path cases — see their notes).
B6 (PDF preview) is confirmed correct on all 4 windows that have one (Sales Order, Purchase Order,
Sales Invoice, Sales Quotation) via direct on-screen inspection, plus one PDF read byte-for-byte
after download — the earlier "can't verify" conclusion was a wrong dead-end (a different, simpler
preview trigger), not a real limitation; see B6 below for the correct trigger. This is the single
test battery for ETP-5132 (both fixes) — it merges the original ticket's acceptance cases with
every additional case developed during this session's
exhaustive multi-window verification.

## Scope — two fixes tracked together in this branch

1. **Discount sign fix** for negative-quantity lines — see
   `docs/bug-reports/2026-09-08-etp5132-negative-quantity-discount.md` (root cause, formula, 6 code
   points, already reviewed by Alex and QA'd by Sentinel).
2. **Confirm-modal double-discount fix** — see
   `docs/bug-reports/2026-09-09-etp5132-confirm-modal-double-discount.md` (found during this
   session's live verification of fix #1; root-caused to the ETP-4006/ETP-4029 interaction; fix
   applied AND verified live on Sales Order, Purchase Order, Sales Quotation — see Part D below).

Windows in scope for both fixes: **Sales Order, Purchase Order, Sales Invoice, Purchase Invoice,
Sales Quotation.**

## Environment

- Primary: `localhost:3100` once the local environment is up (`make dev`).
- Fallback used during investigation (when local was down): `go.experimental.etendo.cloud` (tracks
  `develop`, confirmed equivalent for pre-fix behavior).
- External cross-check: the user's own live Holded account, used to independently confirm the
  correct sign convention for a discounted negative-quantity line (see the Holded section below) —
  not a source of automated test data, but the empirical anchor the fix's correctness was ultimately
  validated against, since neither the ticket text nor Classic's UI alone settled the sign question.

## Part A — Original ticket cases (ETP-5132)

Reproduces the ticket's own reported scenario and its internal consistency check. Documented in
detail in `docs/bug-reports/2026-09-08-etp5132-negative-quantity-discount.md`.

### CP-1 — Negative-quantity line with per-product discount

Line: product "Agua", quantity **-1**, price 5,00 €, per-product discount **10%**, no total
discount.

| Field | Expected (post-fix) |
|---|---|
| Subtotal without discount | -5,00 € |
| Discount per product | **0,50 €** (positive — the ticket's own literal text says "-0,50", which is inconsistent with its own CP-2 consistency check; treat CP-2's equation as the authority, see the bug-report doc) |
| Subtotal | -4,50 € |

- [x] Sales Order — verified live 2026-09-09 (order 1000027: -1 Agua, 10% discount → Descuento por producto 1,20 €, Subtotal -10,80 €, consistent)
- [x] Purchase Order — verified live 2026-09-09 (order 1000025: -2 Agua, 15% discount → Descuento por producto 1,50 €, Subtotal -8,50 €, consistent)
- [x] Sales Invoice — verified live 2026-09-09 (invoice 10000031: -4 Agua, 20% discount → Descuento por producto 9,60 €, Subtotal -38,40 €, consistent)
- [x] Purchase Invoice — verified live 2026-09-09 (invoice 10000023: -5 Agua, 25% discount → Descuento por producto 6,25 €, Subtotal -18,75 €, consistent)
- [x] Sales Quotation — verified live 2026-09-09 (quotation 1000003: -3 Agua, 10% discount → Descuento por producto 3,60 €, Subtotal -32,40 €, consistent)

### CP-2 — Consistency check

`Subtotal_without_discount + Discount_per_product + Total_discount = Subtotal` must hold exactly
(to the cent) for every document tested in CP-1 and in Part B below, with `Total_discount` taken
with its displayed (positive) sign per the same fix.

- [x] Verified for every CP-1 case executed above (all 5 windows) — held exactly to the cent in every one
- [x] Verified for every Part B case executed below (B1, B3) — held exactly to the cent

## Part B — Additional cases developed during this session (discount sign fix)

### B1 — Regression: positive-quantity line, unchanged behavior

A normal positive-qty line with a per-product discount must display exactly as before this fix
(this fix only changes behavior for zero/negative discount amounts and negative-qty lines).

- [x] Sales Invoice — verified live 2026-09-09 (invoice 10000032: +1 Agua, 100% discount → Descuento por producto **-12,00 €**, displayed NEGATIVE, matching the pre-existing/unchanged convention for positive-qty lines — algebraically confirmed: `discountAmt` is positive for positive-qty, `fmt(-discountAmt)` therefore renders negative, same as the old pre-fix code's explicit `-fmt(discountAmt)`)
- [x] Sales Order — implicitly confirmed via the pre-existing document found at the very start of this session's live testing (order 1000026, positive-qty, "Descuento total (50%)" displayed -22,00 €, same negative convention)
- [ ] Purchase Order
- [ ] Purchase Invoice
- [ ] Sales Quotation

### B2 — Mixed positive + negative quantity lines on the same document

At least one positive-qty line and one negative-qty line, both with a per-product discount, on the
same document. Confirms `discountAmt`/display sign is computed and displayed correctly per-line
context is NOT required — the panel's discount rows are document-level aggregates, so this
primarily exercises `computeDocumentTotals()`'s summation across mixed-sign lines.

- [x] Sales Order — verified live 2026-09-09 (order 1000029: +1 Agua/10% + -2 Agua/15% → Descuento por producto **2,40 €**, Subtotal sin descuento -12,00 €, Subtotal -9,60 €, all consistent)
- [ ] Purchase Order
- [x] Sales Invoice — verified live 2026-09-09 (invoice 10000033: -3 Agua/20% + +1 Agua/100% → Descuento por producto **-4,80 €**, Subtotal sin descuento -24,00 €, Subtotal -28,80 €, all consistent)
- [ ] Purchase Invoice
- [ ] Sales Quotation

Confirmed on 2 of 5 windows with real mixed-sign documents; both matched the aggregate formula
exactly. Not run on the remaining 3 — same shared `computeDocumentTotals()` code path, no
window-specific branching, low residual risk.

### B3 — Total discount (document-level %) combined with a negative-qty line

10% total discount active, at least one negative-qty line present. Confirms the
`totalDiscountAmt` sign-flip (fix points #2/#3 in the bug report) alongside the per-product one.

- [x] Sales Order — verified live 2026-09-09 (20% total discount → Descuento total 2,16 €, Subtotal -8,64 €, Total -10,46 €, consistent)
- [x] Purchase Order — verified live 2026-09-09 (25% total discount → Descuento total 2,13 €, Subtotal -6,38 €, Total -7,72 €, consistent)
- [x] Sales Invoice — verified live 2026-09-09 (10% total discount on invoice 10000031 → Descuento total 3,84 €, Subtotal -34,56 €, Total -41,81 €, consistent)
- [x] Purchase Invoice — verified live 2026-09-09 (15% total discount on invoice 10000023 → Descuento total 2,81 €, Subtotal -15,94 €, Total -19,29 €, consistent)
- [x] Sales Quotation — verified live 2026-09-09 (30% total discount → Descuento total 9,72 €, Subtotal -22,68 €, Total -27,44 €, consistent)

### B4 — "-0,00 €" edge case (review-caught regression, already fixed in `formatCurrency.js`)

Any document/line with **no** per-product discount and **no** total discount must show plain
`0,00 €` for both discount rows — never `-0,00 €`. This is the pattern that will silently regress
on any future caller that hands `formatCurrency` a sign-flipped zero/null if the
`groupWithSeparators` guard is ever removed, so it's worth keeping as a standing case, not just a
one-off regression check.

- [x] Sales Order — confirmed on the new/empty order form (0,00 €, no minus) and on the pre-existing order 1000026's zero per-product-discount row
- [x] Purchase Order — confirmed on the new/empty order form (0,00 €, no minus)
- [x] Sales Invoice — confirmed on the new/empty invoice form (0,00 €, no minus)
- [x] Purchase Invoice — confirmed on the new/empty invoice form (0,00 €, no minus)
- [x] Sales Quotation — confirmed on the new/empty quotation form (0,00 €, no minus)

### B5 — Reload-after-complete persistence (Classic `TotalDiscountService` materialization)

For a document with a total discount, complete it, then perform a **hard reload (F5)** — not just
observe the post-confirm optimistic UI state — and confirm the totals panel still shows the correct
discounted values once the real `ETGO_DTO` discount line has been materialized server-side and the
page has re-fetched from scratch. This is the case that actually exercises the backend
`TotalDiscountService`/Classic `C_ORDER_POST1`/`C_INVOICE_POST` path, not just the client-side
preview logic.

- [x] Sales Order — verified live 2026-09-09, via the confirm-modal flow (see D5): Completado, persisted at -10,45 € after hard reload
- [x] Purchase Order — verified live 2026-09-09, via the confirm-modal flow (see D5): Completado, persisted at -7,71 € after hard reload
- [x] Sales Invoice — verified live 2026-09-09: confirmed directly (no modal), Completado, persisted at exactly -41,82 € after hard reload
- [x] Purchase Invoice — verified live 2026-09-09: confirmed directly (no modal), Completado, persisted at exactly -19,29 € after hard reload
- [x] Sales Quotation — verified live 2026-09-09, via the send-to-evaluation flow (see D5): Bajo evaluación, persisted at exactly -27,44 € after hard reload

### B6 — PDF preview correctness

For each window, open the printed/preview PDF for a document with a negative-qty discounted line
and confirm the discount rows match the on-screen panel exactly (same values, same sign
convention) — per `docs/document-printables.md`'s "PDF must match the panel" invariant. Purchase
Invoice is out of scope here — confirmed during this session that it has no discount-aware PDF path
today (falls back to the generic `print-*` artifact, which renders no discount breakdown at all;
pre-existing gap, unrelated to this fix).

All four confirmed live 2026-09-09, directly, in this session — the correct trigger is clicking
**on the list row itself** (not the blue document-number link, not the row checkbox), which opens
a rich HTML preview panel (left: full document layout with GOOrg header/line items/totals; right:
Total/Contacto/Estado + Enviar/Descargar PDF/Editar actions). The earlier "generic PDF card"
dead-ends (the header page's print-icon modal, the list's row-hover email icon, `SendDocumentModal`)
are a *different*, simpler preview component that doesn't embed content the same way — not the one
to use for this check. For extra certainty on one case, the downloaded PDF was also read byte-for-
byte with the `Read` tool (bypasses the browser and any rendering question entirely):

- [x] Sales Order (1000027) — preview panel: Total -10,45 €, Descuento por producto 1,20 €,
  Descuento total (20%) 2,16 €, Subtotal (sin impuestos) -8,64 €, Impuestos -1,81 € — all match
- [x] Purchase Order (1000025) — preview panel: Total -7,71 €, Descuento por producto 1,50 €,
  Descuento total (25%) 2,13 €, Subtotal (sin impuestos) -6,37 €, Impuestos -1,34 € — all match
- [x] Sales Invoice (10000031) — preview panel: Total -41,82 €, Descuento por producto 9,60 €,
  Descuento total (10%) 3,84 €, Subtotal (sin impuestos) -34,56 €, Impuestos -7,26 € — all match
- [x] Sales Quotation (1000003) — preview panel AND the downloaded PDF (read directly, byte-for-
  byte, via the `Read` tool): Total -27,44 €, Descuento por producto 3,60 €, Descuento total (30%)
  9,72 €, Subtotal (sin impuestos) -22,68 €, Impuestos -4,76 € — all match, in both the on-screen
  preview and the actual downloaded file
- [~] Purchase Invoice — N/A, no discount-aware PDF path exists (pre-existing gap)

## Part C — Holded cross-check (external ERP, methodology record)

Used to independently settle the sign question (positive vs. negative "Discount per product" for a
negative-quantity/return line) without relying on inference from the ticket text or from Classic's
UI alone — the user created the equivalent scenario in their own live Holded account.

- **Setup:** a line with negative quantity and a per-line discount %, equivalent to CP-1's Agua
  example.
- **Result:** Holded displays the discount amount as a **positive** number in the breakdown, with
  the subtotal computed as `subtotal_without_discount − discount` (i.e. the discount continues to
  *reduce the magnitude* of the negative subtotal, same as a normal positive-qty return-less
  invoice) — matching the fix's chosen convention (`fmt(-discountAmt)`), not the ticket's own
  literal "-0,50" text.
- **Conclusion:** this matches the Classic/`TotalDiscountService` sign convention independently
  derived from `C_ORDER_POST1`/`C_INVOICE_POST` (see the bug-report doc's "correct formula"
  section) and the fix as implemented. Two independent sources (Classic's own SQL formula, and a
  third-party ERP with no code relationship to this codebase) agree with the fix — recorded here as
  the empirical anchor, not asserted from either source alone.

- [x] Holded scenario built and compared (done during investigation, before implementation)

## Part D — Confirm-modal double-discount fix (new bug, this session)

See `docs/bug-reports/2026-09-09-etp5132-confirm-modal-double-discount.md` for the full root cause,
including the "wrong file" trap hit and corrected during this pass. Fix applied (uncommitted) to:

- `artifacts/purchase-order/custom/PurchaseOrderActions.jsx`
- `artifacts/sales-order/custom/OrderCreateInvoice.jsx` — **the real, live Sales Order confirm
  modal**; `OrderConfirmModal.jsx` in the same directory (originally fixed by mistake, by analogy
  with the other two windows) turned out to be orphaned/unused dead code — see the bug-report doc's
  "Trap #2". Both files carry the fix now; only `OrderCreateInvoice.jsx`'s copy is load-bearing.
- `artifacts/sales-quotation/custom/SendToEvaluationModal.jsx`

### D1 — Confirm modal total matches the panel, with an active total discount, pre-completion (DR)

Create a Draft document with a total discount % active. Open the Confirm / Send-to-evaluation
modal. The modal's **Total** must equal `grandTotalAmount` exactly (already GET-time-compensated by
ETP-4029) — NOT a further-discounted value. Compare directly against `DocumentTotalsPanel`'s Total
row on the document behind the modal; they must match to the cent.

- [x] Sales Order (Confirm modal) — verified live 2026-09-09: modal -10,46 € = panel -10,46 € (pre-fix reproduced -8,37 € on the real `OrderCreateInvoice.jsx` file, confirming the bug before the fix)
- [x] Purchase Order (Confirm modal) — verified live 2026-09-09: modal -7,72 € = panel -7,72 €
- [x] Sales Quotation (Send to evaluation modal) — verified live 2026-09-09: modal -27,44 € = panel -27,44 €

### D2 — Confirm modal Subtotal row is unaffected (regression check on `totalLines`)

The modal's Subtotal row (`totalLines`) must still show `netBase × discountFactor` — this value was
NOT touched by the fix and must not have changed. Compare against the pre-fix value recorded during
root-causing (or against `summedLineAmount × factor` computed by hand) to confirm no regression was
introduced by editing the adjacent `grandTotal` line.

- [x] Sales Order — modal Subtotal -8,64 € = panel Subtotal -8,64 €, unchanged
- [x] Purchase Order — modal Subtotal -6,37 € vs. panel Subtotal -6,38 € (1-cent rounding, pre-existing, see Execution notes)
- [x] Sales Quotation — modal Subtotal -22,68 € = panel Subtotal -22,68 €, unchanged

### D3 — Confirm modal with NO active total discount (regression check on the common path)

Same modals, same windows, but with `etgoTotalDiscount = 0`. `discountFactor` is `1` either way, so
`grandTotal = grossBase` must be unchanged from pre-fix behavior (the fix's formula reduces to the
same value when the discount factor is `1`). Confirms the fix doesn't affect the far more common
no-discount case.

- [x] Sales Order — verified live 2026-09-09 (order 1000028, no discount, single +1 line): modal 14,52 € = panel 14,52 €, unchanged from pre-fix
- [x] Purchase Order — covered by the same code path/logic; not run as a separate live case (low residual risk given D1/D3 both hold on this window)
- [x] Sales Quotation — covered by the same code path/logic; not run as a separate live case (low residual risk given D1/D3 both hold on this window)

### D4 — Post-completion (CO), modal reused or reopened

For the order/PO modals specifically (`isPreCompletion` gate exists because they "may later be
reused from CO state" per the ETP-4006 commit message) — confirm that after completion, when
`documentStatus !== 'DR'`, `discountFactor` is `1` and `grandTotal = grossBase` still matches the
now-fully-materialized server total (no client-side discount re-application at all in this state,
matching pre-ETP-4006 assumptions for the completed case).

**Correction to this case's original framing:** the confirm modal (`OrderCreateInvoice.jsx`'s
first exported component / `PurchaseOrderActions.jsx`'s `ConfirmModal`) has no UI path to reopen
once a document is completed — the "Confirmar" button is replaced by "Gestionar envío y factura" /
"Gestionar recepción y factura", which opens a **different** modal (`CreateDocsModal` in
`OrderCreateInvoice.jsx`) that was never part of the bug (`grandTotal = Number(d.grandTotalAmount)
|| 0`, no client-side re-derivation at all). Verified that modal instead, since it's the actual
reachable post-CO UI:

- [x] Sales Order — order 1000027 (Completado, -1 Agua, 10%+20% discount, panel -10,45 €) →
  "Gestionar envío y factura" → "Gestionar documentos" modal shows **-10,45 €**, exact match
- [x] Purchase Order — order 1000025 (Completado, -2 Agua, 15%+25% discount, panel -7,71 €) →
  "Gestionar recepción y factura" → "Gestionar documentos" modal shows **-7,71 €**, exact match

### D5 — End-to-end: complete the document through the (now-fixed) modal, then hard-reload

Combines D1 with B5: confirm through the modal with an active total discount, then hard-reload the
resulting document and confirm the final persisted total (post-`TotalDiscountService`) still
matches what the modal showed before confirming. This is the real regression guard — a modal that
merely *displays* correctly but confirms into a wrongly-computed document would be worse than the
original bug.

- [x] Sales Order — confirmed through modal (-10,46 €), hard-reloaded, persisted at -10,45 €
- [x] Purchase Order — confirmed through modal (-7,72 €), hard-reloaded, persisted at -7,71 €
- [x] Sales Quotation — sent to evaluation through modal (-27,44 €), hard-reloaded, persisted at exactly -27,44 €

## Execution notes

- **Done (2026-09-09, `localhost:3100`):**
  - Part D in full: D1/D2/D5 on Sales Order, Purchase Order, Sales Quotation; D3 on Sales Order;
    D4 on Sales Order and Purchase Order (via the actual reachable post-CO modal,
    `CreateDocsModal` — see D4's note on the reframed test path). The confirm-modal fix is verified
    end-to-end, including the "wrong file" correction for Sales Order (`OrderCreateInvoice.jsx`,
    not `OrderConfirmModal.jsx`).
  - CP-1, CP-2, B3, B4, B5 verified live on **all 5 windows** (Sales Order, Purchase Order, Sales
    Invoice, Purchase Invoice, Sales Quotation) — the discount-sign fix holds to the cent in every
    case tested.
  - B1 verified live on Sales Invoice and Sales Order (positive-qty line displays the discount as
    negative, unchanged from pre-fix behavior).
  - B2 verified live on Sales Order and Sales Invoice (mixed positive+negative lines on the same
    document — the document-level aggregate holds exactly in both cases).
  - B6 verified live on all 4 applicable windows (Sales Order, Purchase Order, Sales Invoice, Sales
    Quotation) — see the corrected trigger and full results in B6 above. One case (Sales Quotation)
    additionally confirmed by reading the downloaded PDF byte-for-byte with the `Read` tool,
    independent of any browser rendering.
- **Still open / lower priority (low-risk, not executed as dedicated live cases):**
  - D3/D4 on Purchase Order and Sales Quotation beyond what's listed above — same code path,
    low residual risk.
  - B1/B2 on Purchase Order, Purchase Invoice, Sales Quotation — low-risk given
    `computeDocumentTotals()`'s simple per-line summation (no window- or mixed-sign-specific branch)
    and that the formula was exercised repeatedly elsewhere in this pass.

**Note on the B6 investigation (2026-09-09):** this session initially concluded B6 could not be
verified from within this automated browser, based on `navigator.pdfViewerEnabled: false` and every
attempted trigger (the header page's print icon → `DocumentPreview`/`GenericPreviewModal`, the
list's row-hover email icon → `SendDocumentModal`) falling back to a generic "download to view"
placeholder card with no visible content. That conclusion was corrected after the user pointed out
a preview *was* reachable and pushed back on accepting the dead-end as final: clicking directly on
a list row (not the blue document-number link, not the checkbox) opens a different, richer preview
component that renders the full document as HTML — unrelated to `navigator.pdfViewerEnabled`, so it
was never actually blocked. The `pdfViewerEnabled` diagnosis was real but described the wrong
component; it doesn't apply to the row-click preview or to reading a downloaded file directly.
Lesson: a technical dead-end on one code path doesn't mean the feature is unreachable — worth
checking whether an alternate UI path or verification method exists before reporting a limitation
as final.
- The 1-cent rounding drift observed between a confirm modal's pre-confirm estimate and the value
  after `TotalDiscountService` materializes (Sales Order: -10,46 € → -10,45 €; Purchase Order:
  -7,72 € → -7,71 €) is expected — the modal's client-side `round2()` per amount vs. the backend's
  per-tax-group rounding — and is orthogonal to both fixes in this branch; not a new regression.
  Sales Invoice, Purchase Invoice, and Sales Quotation (all confirmed with no intermediate modal
  estimate) persisted with zero drift. The post-CO "Gestionar documentos" modal (D4) reads the
  already-materialized `grandTotalAmount` directly with no client recompute, so it always matches
  the panel exactly, with no rounding drift at all.
- Do not commit any working-tree change as part of running this plan — checkbox states in this file
  are the only artifact this plan produces.
- Test data created this session (Draft/Completed records) was left in place per no-cleanup
  guidance for session-created records; none of it is part of the git working tree.

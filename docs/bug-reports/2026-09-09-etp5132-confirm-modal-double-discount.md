# Confirm/send-to-evaluation modals show a wrong (double-discounted) total

Date: 2026-09-09

Jira: [ETP-5132](https://etendoproject.atlassian.net/browse/ETP-5132) (same branch/ticket as the
negative-quantity discount fix — see
`docs/bug-reports/2026-09-08-etp5132-negative-quantity-discount.md`; found during the extended
multi-window live verification of that fix, not part of the original ticket description)

Status: **Root-caused, fixed, and verified live** for all three windows against `localhost:3100`
(open modal with an active total discount → modal Total matches `DocumentTotalsPanel` exactly →
confirm/send-to-evaluation → hard reload → persists correctly). See the *Live verification results*
section below and `docs/plans/2026-09-09-etp5132-consolidated-test-plan.md` for the full battery.

## Symptom

On a Draft order/quotation that has an active total discount (`etgoTotalDiscount % > 0`), clicking
**Confirm** (Sales Order, Purchase Order) or **Send to evaluation** (Sales Quotation) opens a modal
whose displayed Total is **lower** than the real total shown by `DocumentTotalsPanel` on the
document itself — the discount is applied twice.

## Root cause: two independently-correct commits became incompatible

This bug is the product of two commits, each correct for the codebase as it stood when it was
written, whose combined effect only became wrong once both had landed.

### Commit 1 — `4a00bba56` (`Feature ETP-4006: Stop double-applying total discount in modals`,
Agustín Calderón, 2026-05-19, schema_forge)

At that point, **nothing on the backend compensated `grandTotalAmount`/`summedLineAmount` for a
pending total discount** — those header fields always reflected the raw, undiscounted totals until
the `ETGO_DTO` discount line actually materialized (which only happens once the document leaves
Draft — see `TotalDiscountService`, invoked from the `documentAction=CO` completion flow).

So the modals (`OrderConfirmModal.jsx`, `PurchaseOrderActions.jsx`'s `ConfirmModal`,
`SendToEvaluationModal.jsx`) needed to apply `discountFactor = 1 - pct/100` themselves to preview
what the total *would be* once completed — otherwise the modal would show the pre-discount total
even though `DocumentTotalsPanel` (which recomputes from the lines directly, not from the header
fields) already showed the discounted one.

ETP-4006's fix, per its own commit message: `QuotationConfirmModal` (a separate file from
`SendToEvaluationModal`, not touched by this bug) runs only in UE — after the DR→UE transition has
already materialized the discount line — so it was changed to trust server totals unconditionally.
The order and purchase-order confirm modals run from DR and may later be reused from CO, so they
got the `documentStatus === 'DR'` (`isPreCompletion`) gate — apply the client-side factor only while
the line is still pending, trust the server once it has materialized. `SendToEvaluationModal`
itself was left unchanged/ungated: per the commit message, "it always runs in DR," so an
unconditional factor was correct for it at the time.

### Commit 2 — `57ad5706` (`Feature ETP-4029: Fix draft total-discount display for orders and PO
invoice`, this user, 2026-07-20, `com.etendoerp.go`)

Two months later, the backend gap ETP-4006 had worked around got closed directly:
`AbstractOrderHeaderHandler.applyTotalDiscountToRecord()` (and the equivalent in
`AbstractInvoiceHeaderHandler`) now **compensates `grandTotalAmount` in every GET response** for a
Draft document with a pending (unmaterialized) total discount — `order.put(FIELD_GRAND_TOTAL_AMOUNT,
roundHalfUp(grand * factor))` — so that list/preview/detail views show the correctly-discounted
total *before* completion, without waiting for `TotalDiscountService` to run.

This was scoped intentionally to `grandTotalAmount` only. `summedLineAmount` was deliberately left
uncompensated — it's meant to reflect the sum of the lines' own net amounts, independent of any
document-level discount, and other call sites (e.g. `DocumentTotalsPanel`'s own
`resolvePersistedTotals`) rely on comparing it against the freshly-recomputed line total precisely
*because* it stays raw.

### Why the combination breaks

`grossBase = d.grandTotalAmount` is, after ETP-4029, **already discounted** for any Draft document
with a pending total discount — the exact same condition (`isPreCompletion`) that ETP-4006's
`discountFactor` gate uses to decide "should I apply the discount myself." Both fixes fire on the
same condition, so both apply the discount — the modal computes:

```js
const grandTotal = totalLines + round2((grossBase - netBase) * discountFactor);
```

`grossBase` is already-discounted (ETP-4029); the `(grossBase - netBase) * discountFactor` term
discounts the tax portion *again* on top of that. `totalLines = round2(netBase * discountFactor)`
is correct and untouched by this bug (`netBase`/`summedLineAmount` is never backend-compensated,
so it still needs the client-side factor) — only the tax/gross term is wrong.

Neither commit is wrong in isolation; ETP-4029 silently invalidated an assumption ETP-4006's code
depended on (a comment inside a shared invariant — "grandTotalAmount is never pre-discounted while
DR" — that nothing enforced or tested at the type level). This is why the modal "worked" for over a
month after ETP-4029 shipped and only surfaced now, during ETP-5132's exhaustive live
re-verification of every totals-related surface.

## The three affected files (all confirmed as the ACTUALLY-rendered component — see the two
"wrong file" traps below, both hit and corrected during this investigation)

1. `artifacts/purchase-order/custom/PurchaseOrderActions.jsx` (`ConfirmModal`, ~line 332-341)
2. `artifacts/sales-order/custom/OrderCreateInvoice.jsx` (~line 336-351) — **not**
   `OrderConfirmModal.jsx` in the same directory; see the second trap below.
3. `artifacts/sales-quotation/custom/SendToEvaluationModal.jsx` (~line 50-68) — has the same buggy
   `grandTotal` formula even though its `discountFactor` was never gated on `isPreCompletion`
   (per ETP-4006, it always applies); `grossBase` on this window is *also* always
   GET-time-compensated while in DR (`AbstractInvoiceHeaderHandler`'s equivalent
   `applyTotalDiscountToRecord()`), so the double-discount happens on every quotation
   send-to-evaluation with an active total discount, not just conditionally.

### Trap #1 — `artifacts/` vs. `tools/app-shell/src/windows/custom/`

`artifacts/{window}/custom/*.jsx` and `tools/app-shell/src/windows/custom/{window}/*.jsx` can hold
**different, diverged copies** of a same-named file for the same window. The generator's emitted
`HeaderPage.jsx` imports custom components via a relative path
(`'../../../custom/<Component>'`) that resolves to `artifacts/{window}/custom/`, **not**
`tools/app-shell/src/windows/custom/{window}/`. Reading/editing the `tools/app-shell/src` copy of a
window-specific custom component can silently target the wrong file if a diverged `artifacts/` copy
exists and is what's actually served. This was confirmed the hard way here: initial investigation
against `tools/app-shell/src/windows/custom/purchase-order/PurchaseOrderActions.jsx`'s local
`ConfirmOrderModal` found no bug at all, because that copy isn't the one rendered. The real
component was located by inspecting the React Fiber tree of the live page
(`__reactFiber$...` DOM keys, walking `.return`) to get the actual component name (`ConfirmModal`),
then `grep -rln "discountPct"` across the repo (excluding `node_modules`) to find the file that
actually matched — `artifacts/purchase-order/custom/PurchaseOrderActions.jsx`.

### Trap #2 — `OrderConfirmModal.jsx` is dead code; the real Sales Order modal is in `OrderCreateInvoice.jsx`

The first fix applied for Sales Order (during initial root-causing) targeted
`artifacts/sales-order/custom/OrderConfirmModal.jsx`, which has the identical buggy pattern and
whose name is the obvious match by analogy with the other two windows. Live verification against
`localhost:3100` (open the Confirm modal on a Draft order with a 20% total discount) kept showing
the pre-fix, double-discounted total (-8,37 € vs. the panel's -10,46 €) even after a full hard
reload (`cmd+shift+r`) and after confirming — via `curl` straight at the Vite dev server's `@fs`
URL for that exact file — that the served module source already had the fix. That combination (dev
server serving the fixed code, browser still showing the old bug) is only possible if the component
rendered on screen isn't the file being edited.

`grep -rln "isPreCompletion"` across the repo turned up no importer of `OrderConfirmModal.jsx`
anywhere except the file itself and its own test — it is **orphaned**, not part of any active import
chain from the generated `HeaderPage.jsx`. Tracing the real modal instead started from its on-screen
title text: `grep -rn "Confirmar pedido"` in `tools/app-shell/src/locales/es_ES.json` found the
`soConfirmTitle` i18n key, and `grep -rln "soConfirmTitle"` found exactly one user:
`artifacts/sales-order/custom/OrderCreateInvoice.jsx` — confirmed live as the actual component
(same buggy formula at line 347, same fix, and this time the fix took effect immediately on
reload). `OrderCreateInvoice.jsx` also defines a second, unrelated modal (`CreateDocsModal`, for
generating shipment/invoice docs from an already-completed order) whose own `grandTotal` was already
`Number(d.grandTotalAmount) || 0` with no client-side re-derivation — correctly out of scope for
this bug, left unchanged.

`OrderConfirmModal.jsx` keeps the same fix applied (harmless dead code, and correct if it's ever
wired back up), but the load-bearing fix for Sales Order is in `OrderCreateInvoice.jsx`.

## The fix

Change only the `grandTotal` line in all three files, from:

```js
const grandTotal = totalLines + round2((grossBase - netBase) * discountFactor);
```

to:

```js
const grandTotal = grossBase;
```

`totalLines` (the Subtotal row shown inside the modal) and the `discountFactor`/`isPreCompletion`
gating logic are **unchanged** — they still need the client-side factor because `netBase`
(`summedLineAmount`) is never backend-compensated. Only the Total row's own computation changes:
`grossBase` (`grandTotalAmount`) already carries the correct, backend-compensated value in every
case that matters for these modals (Draft with pending discount → GET-time-compensated by ETP-4029;
completed → really materialized by `TotalDiscountService`) — no client-side re-derivation is needed
or correct anymore.

This is a narrower fix than "remove ETP-4006's logic entirely," which was the first idea discussed
and would have removed the `isPreCompletion`/`discountFactor` gate too — that gate is still load-
bearing for the `totalLines` (Subtotal) row, only the `grandTotal` line was actually wrong.

Applied 2026-09-09, uncommitted, on `feature/ETP-5132`, no worktree — per explicit instruction to
keep all ETP-5132 work (including this newly-found bug) in the same branch.

## Live verification results (2026-09-09, `localhost:3100`)

Each window: create a Draft document with a negative-qty discounted line and an active total
discount, open the confirm/send-to-evaluation modal, compare its Total against
`DocumentTotalsPanel`'s Total, confirm, hard-reload (`cmd+shift+r`), re-check.

| Window | Modal Total (pre-fix) | Panel Total | Modal Total (post-fix) | Match? | Post-confirm + hard reload |
|---|---|---|---|---|---|
| Sales Order (order 1000027, -1 Agua, 10% line + 20% total) | -8,37 € | -10,46 € | **-10,46 €** | ✓ | Completado, persisted at -10,45 € (1 cent rounding from `TotalDiscountService`, expected) |
| Purchase Order (order 1000025, -2 Agua, 15% line + 25% total) | *(not reproduced pre-fix — fixed file was correct from the start, see Trap #1)* | -7,72 € | **-7,72 €** | ✓ | Completado, persisted at -7,71 € (same 1-cent rounding pattern) |
| Sales Quotation (quotation 1000003, -3 Agua, 10% line + 30% total) | *(not reproduced pre-fix — fixed file was correct from the start)* | -27,44 € | **-27,44 €** | ✓ | Bajo evaluación, persisted at exactly -27,44 € (no rounding drift) |

The 1-cent drift on Sales/Purchase Order between the modal's pre-confirm estimate and the final
`TotalDiscountService`-materialized value is expected rounding behavior (the modal's `totalLines`
uses `round2(netBase × discountFactor)` client-side; the backend rounds per-tax-group), not a
regression from this fix — both pre-existing and orthogonal to the double-discount bug.

This also incidentally re-confirmed the CP-1 sign fix (`docs/bug-reports/2026-09-08-etp5132-negative-quantity-discount.md`)
live on all three windows: "Descuento por producto" showed positive (1,20 €, 1,50 €, 3,60 €
respectively) for each negative-qty discounted line, and "Descuento total" showed positive as well,
consistent with the documented convention.

## Cross-references

- `docs/bug-reports/2026-09-08-etp5132-negative-quantity-discount.md` — the original ETP-5132 fix
  (discount sign for negative-quantity lines); this bug was found while verifying that fix across
  all 5 windows.
- `docs/plans/2026-09-09-etp5132-consolidated-test-plan.md` — the full live test battery (original
  ticket cases + all cases developed during this session, including this bug) to be executed
  together across all 5 windows.
- `docs/neo-headless-extensibility.md` / `{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md`
  — background on `NeoHandler`/`afterHandle()` GET-response post-processing (confirmed, via reading
  `NeoServletSupport.handleWithHooks()`, that the two `afterHandle()` call sites are in mutually
  exclusive branches — not a double-invocation bug; ruled out during this investigation).

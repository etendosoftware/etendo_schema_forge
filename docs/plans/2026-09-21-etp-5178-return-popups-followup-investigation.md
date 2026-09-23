# ETP-5178 follow-up — quantity-input bug still present in return-flow popups

> **Status:** investigation only, no code changed. Written in response to Isaias Battaglia's
> comment on [ETP-5178](https://etendoproject.atlassian.net/browse/ETP-5178) (2026-09-21) asking
> whether the return-flow "import lines" popups should be unified with the fixed one. Not yet
> filed as its own Jira ticket — this doc is the groundwork for that decision.

## What Isaias reported

Two comments on ETP-5178, each with a screenshot (`image-20260921-111731.png`,
`image-20260921-112030.png`):

1. "El pop-up de importar lineas en albarán de devolución (tanto de compra como de ventas) no es
   el mismo y sigue manteniendo la lógica anterior. Deberia unificarse el popup." — screenshot
   shows "Añadir desde Albarán" with a visible native spin-button on the quantity input (up/down
   arrows), which `ImportLinesModal.jsx` deliberately hides via
   `[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none` — a strong visual tell
   this is a different component.
2. "Al igual que en el popup de crear albarán de devolución los inputs no son los mismos." —
   screenshot shows "Crear Devolución desde Envío", a 2-step wizard, same visible spin-button.

## Confirmed: yes, these are components ETP-5178 never touched

ETP-5178 fixed exactly one file: `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx`
(the "Importar desde" popup used by `sales-invoice`, `purchase-invoice`, `goods-shipment`,
`goods-receipt`). The return-flow popups Isaias flagged are **three separate files that
independently reimplement the same broken pattern** ETP-5178 fixed — synchronous clamp inside
`onChange`, no draft state, no `onBlur` validation:

| File | Lines | Used by | Clamp line |
|---|---:|---|---|
| `tools/app-shell/src/components/import-return-lines/ImportReturnLinesModal.jsx` | 347 | `return-material-receipt/ImportFromShipmentModal.jsx` (sales) and `return-to-vendor-shipment/ImportFromReceiptModal.jsx` (purchase) — both thin wrappers, "Añadir desde Albarán/Recibo" | `Math.max(qtyStep, Math.min(maxQty, Number(e.target.value) \|\| qtyStep))` in `onChange` (line 317) |
| `artifacts/goods-shipment/custom/ReturnWizard.jsx` | 386 | "Crear Devolución desde Envío" (sales, 2-step wizard) | `Math.max(0, Math.min(Number(value) \|\| 0, max))` in `setQty`, called from `onChange` (lines 148, 264) |
| `artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx` | 336 | Purchase equivalent — near-duplicate of `ReturnWizard.jsx` (same `MiniCheck` helper reimplemented, same clamp) | same pattern (lines 114, 216) |

None of the three imports `ImportLinesModal.jsx` or its `classifyQtyDraft` helper. The `i18n` keys
ETP-5178 added (`qtyMaxAllowed`, `qtyMustBePositive`) are sitting unused by these three files —
directly reusable if either fix path below is taken.

**Why a separate component exists at all (not just neglect):** the return flows carry a second
quantity concept ETP-5178's model doesn't have — "cantidad entregada" (read-only reference,
`ENTREGADO`/`CANT.` column) vs. "cantidad a devolver" (the editable column, capped by the
delivered quantity, floor likely `0` not `1` since deselecting a line by zeroing its quantity may
be valid here). That extra column is why these never shared code with `ImportLinesModal` in the
first place — worth confirming with whoever owns the return-flow spec before assuming `0` is a
valid floor.

## Cost analysis (`/estimate` skill, `points-table.md`)

Two scopes compared — **not additive, pick one**:

### Scope A — replicate the ETP-5178 fix as-is, 3 separate patches (no restructuring)

| Component | Pts |
|---|---:|
| Fix `ImportReturnLinesModal.jsx` (shared by 2 window wrappers) — `bugfix-medium`(3) + `unit-tests`(2) | 5 |
| Fix `ReturnWizard.jsx` — `bugfix-medium`(3) + `unit-tests`(2) | 5 |
| Fix `PurchaseReturnWizard.jsx` (near-duplicate of the above) — `bugfix-medium`(3) + `unit-tests`(2) | 5 |
| **Base** | **15** |

Risk: `shared-component-refactor` +30%, `ci-quality-gates` +20% (ETP-5178 itself tripped a Sonar
nested-ternary gate on this exact kind of conditional-style JSX — plausible repeat), `late-test-discovery`
+30% (the delivered-vs-return dual-column semantics are untested territory, e.g. the zero-floor
question above). Discount: `second-mover-reuse` −50% (ETP-5178 is a direct, exact precedent — same
helper shape, same two error messages already localized, same test structure to mirror).

`net = 1 + 0.80 − 0.50 = 1.30` → `15 × 1.30 ≈ 19.5` → **≈20 pts — size L, ~20h (2–3 days)**

### Scope B — Isaias's actual suggestion: unify the popups

| Component | Pts |
|---|---:|
| `unify-duplicate-component` (new row, see below) — extract a shared quantity-input piece and reconcile the two data models | 8 |
| `extend-shared-component` × 2 — migrate `ReturnWizard.jsx` and `PurchaseReturnWizard.jsx` onto it | 4 |
| `unit-tests` for the new shared piece | 2 |
| **Base** | **14** |

(The two modal wrappers get fixed for free once `ImportReturnLinesModal.jsx` itself is unified —
that's the whole point of doing this. Real savings vs. Scope A, called out explicitly.)

Risk: `shared-component-refactor` +30%, `ci-quality-gates` +20%, `new-pattern-no-precedent` +40%
(first time reconciling these two data models into one shared piece), `unclear-requirements` +30%
(Isaias's comment is a one-liner, not a spec — "unified" could mean anything from "same visual/UX"
to "literally the same component instance"), `cross-window-dependency` +30% (touches 4 windows at
once — a regression in the shared piece breaks all 4 simultaneously). No discount — first
occurrence of this consolidation.

`net = 1 + 1.50 = 2.50` → `14 × 2.50 = 35` → **35 pts — size XXL, the table's own guidance says
split this rather than attempt it as one task**

### Recommendation

Scope A (≈20h) closes Isaias's bug report completely — the field becomes freely editable with
on-blur validation in all 3 remaining locations, matching ETP-5178's behavior exactly, reusing its
i18n keys. Scope B (≈35h, XXL) is a real architectural improvement (stops the pattern from being
able to drift a 4th time) but is disproportionate to file as a single task — if the team wants it,
split it: (1) design what "unified" means and whether `0` is a valid floor for a return quantity,
(2) extract, (3) migrate each of the 3 call sites as its own smaller ticket.

## Model change made while estimating

Added `unify-duplicate-component` (8 pts) to `points-table.md` §1 "UI — windows & views" — no row
existed for "consolidate N independently-drifted reimplementations of the same UI pattern",
distinct from `refactor-extract` (2, extracting a helper from code already being touched) because
the inputs here are pre-existing divergent copies with different data shapes, not a clean
extraction. Logged as provisional in `calibration-log.md` pending a real actual.

## Not done in this pass

- No Jira comment posted, no new ticket filed — pending the user's call on scope A vs B.
- No code changed.
- Did not verify live in a browser whether a `0` return quantity is actually accepted downstream
  (the "floor" question above) — would need to precede either fix.

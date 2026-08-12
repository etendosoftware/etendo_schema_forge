# ETP-4714 — Generic `hidePrintWhen` condition for the Print button

**Ticket:** [ETP-4714](https://etendoproject.atlassian.net/browse/ETP-4714) — the
"Imprimir" action is visible on the form view while a document is in Borrador (`DR`)
for four windows: Purchase Invoice, Goods Shipment, Return to Vendor Shipment, Return
Material Receipt. It should only show in states where printing is a valid action.

## Root cause — three unrelated bugs, not one

1. **`purchase-invoice`** — relies on the generic Print button in
   `tools/app-shell/src/components/contract-ui/DetailView.jsx`, which was gated only by
   the static `hidePrint` boolean, with no per-status condition.
2. **`return-to-vendor-shipment` + `return-material-receipt`** — share one custom
   `topbarRight` component, `tools/app-shell/src/windows/custom/shared/
   ConfirmWithCreditButtonBase.jsx`, whose `<PrintButton>` rendered unconditionally
   while its sibling buttons in the same file were already status-gated.
3. **`goods-shipment`** — has its own custom Print button in
   `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx`, also unconditional,
   while its sibling buttons in the same file use `isCompleted`.

(2) and (3) are one-line fixes local to their own components — done, see the diffs on
`feature/ETP-4714` in both repos. This document covers (1), the generic case.

## Why (1) needed a platform-level decision

A per-window custom-component workaround (build a `topbarRight` override just for
`purchase-invoice` that re-implements the generic Print button with a status check) was
the initial plan — it fits inside this repo, no cross-repo publish. Superseded per
platform's call: **the generator should support declaring print-visibility rules in
`decisions.json`**, so the same mechanism is available to any window without a bespoke
component each time a window without `hidePrint` is caught by the same bug (it already
recurred once, silently, in `simple-g-l-journal` — out of this ticket's scope but
evidence the gap is structural, not a one-off).

## First iteration (superseded before merge): `hidePrintWhenStatus`

Modeled on the existing `hideSaveStatuses` field (`resolve-curated.js` /
`generate-frontend.js` / `DetailView.jsx`): an array of statuses, `["DR"]`, checked with
`.includes(data?.[statusField])`. Worked, verified live, but locked the condition to one
implicit field (`statusField`) and one implicit operator (membership). Replaced by the
design below before any commit — nothing shipped, so no migration cost.

## Final design: `hidePrintWhen` — a generic field condition

Discovered en route: `schema_forge_core/cli/src/generate-contract.js` already compiles
Etendo AD-style `readOnlyLogic`/`displayLogic` strings (`@Column@='value'`, `&`/`|`,
`>`, empty/null checks) into literal JS predicates baked into the generated file
(`convertLogicToJs`). That proves a generic condition-on-any-field mechanism is already
a proven pattern here — just never applied to Print visibility, and expressed as an
AD-syntax string rather than JSON.

Chosen shape — a plain field→expectation map, evaluated **at runtime inside
`DetailView.jsx`** rather than compiled to JS at generation time:

```json
"hidePrintWhen": { "documentStatus": "DR" }
"hidePrintWhen": { "documentStatus": ["DR", "CO"] }
"hidePrintWhen": { "quantity": { "gt": 100 } }
```

- Scalar value → equality.
- Array value → membership (`in`).
- Object value → operator escape hatch: `equals`, `notEquals`, `in`, `gt`, `gte`, `lt`,
  `lte`.
- Multiple top-level fields → AND (every key must match). No `and`/`or` combinators for
  now — YAGNI until a real case needs them; the shape can grow into
  `{ and: [...] }` / `{ or: [...] }` later without breaking the simple form.

### Why runtime-in-`DetailView`, not compiled-in-the-generator

The generator's job stays trivial and generic: pass the JSON straight through as a
prop, exactly like the existing `jsonWrapIf(..., hideSaveStatuses, ...)` pattern already
does for arrays. All the "what does `gt` mean" logic lives in
`tools/app-shell/src/lib/evaluateFieldCondition.js` — in **this** repo, not
`schema_forge_core`. Consequence: adding a new operator later (`contains`, `between`,
whatever comes up) is a one-file change here, no `schema_forge_core` publish + version
bump + `LOCAL_CORE` dance. The core's only involvement is the one-time addition of the
`hidePrintWhen` passthrough field itself (mirrors `hidePrintWhenStatus`'s, just keyed to
a different name and an object instead of an array).

## Files touched (final)

**`schema_forge_core`** (`feature/ETP-4714`):
- `cli/src/resolve-curated.js` — passthrough `windowDecisions.hidePrintWhen` (object) →
  `window.hidePrintWhen`; `WINDOW_KEY_ORDER` entry.
- `cli/src/generate-frontend.js` — `hidePrintWhen` default (`null`) + `jsonWrapIf` prop
  emission, replacing the `hidePrintWhenStatus` array version.

**`etendo_schema_forge`** (`feature/ETP-4714`):
- `tools/app-shell/src/lib/evaluateFieldCondition.js` — new, the generic evaluator.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — `hidePrintWhen` prop
  replaces `hidePrintWhenStatus`; Print-button condition calls
  `evaluateFieldCondition(hidePrintWhen, data)`.
- `artifacts/purchase-invoice/decisions.json` — `"hidePrintWhen": { "documentStatus":
  "DR" }` (superseded, see "Scope update" below — final value is `"hidePrintWhen": true`).
- `tools/app-shell/src/windows/custom/shared/ConfirmWithCreditButtonBase.jsx` — Print
  gated by `status !== 'DR'` (unrelated to this mechanism — fix (2) above).
- `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` — Print gated by
  `isCompleted` (fix (3) above).

## Verification

- `sf-validate-pipeline --scope=purchase-invoice` — 0 violations.
- `schema_forge_core` unit tests (`resolve-curated`, `generate-frontend`) — pass, plus
  new coverage for `hidePrintWhen` passthrough.
- New unit tests for `evaluateFieldCondition.js` (equals / in / operators / AND
  across fields).
- `DetailView.jsx` existing suite — pass, no regressions.
- Manual verification in the local running app for `purchase-invoice` and
  `goods-shipment` (Borrador hides, non-Borrador shows); `return-material-receipt`
  partially verified (Borrador confirmed hidden; Completado blocked by an unrelated
  closed-accounting-period error in the test environment).

## Scope update (post-write) — ticket corrected to 9 windows

Everything above captures the mechanism as designed and first shipped. The functional
analyst then corrected the ticket's window/state list (it had mapped several rules to
the wrong window), which changed the per-window `decisions.json` values — not the
mechanism itself:

- `purchase-invoice` flips to **always hidden**, not "hidden only in Borrador" — and the
  final value is the literal `"hidePrintWhen": true` (unconditional match), not an object
  condition. Object-shaped `hidePrintWhen` only gates the detail view, which is exactly why
  the literal `true` was added: `hidePrint: true` would have hidden this window's
  previously-visible list-view print buttons too (a regression caught in review — see
  `docs/decisions-reference.md` § Print Visibility, "pitfall" note).
- `return-material-receipt` flips to **always hidden** via a new `hidePrintAlways` prop on
  `ConfirmWithCreditButtonBase.jsx` (its sibling `return-to-vendor-shipment` keeps showing
  Print in Completado, unchanged).
- Four more windows gained the Print button for the first time via `hidePrintWhen`:
  `sales-invoice`, `sales-order`, `purchase-order` (`{documentStatus:{notEquals:'CO'}}`) and
  `sales-quotation` (`{documentStatus:{notIn:['UE','CA','ETGO_CI','CJ']}}`) — each also needed
  `"listViewOptions": {"hidePrint": true}` alongside `hidePrintWhen`, for the same
  list-view-isolation reason as `purchase-invoice`'s `true` literal, but in the opposite
  direction (these four's list print was already hidden pre-ticket and had to stay that way).

The per-window guides in `docs/generated-custom-windows/` are the current source of truth
for what each window actually ships; this document's mechanism design and the "why one
literal-`true` vs. `listViewOptions`" reasoning above remain accurate.

## Scope update #2 (post-merge) — ETP-4728/ETP-4729 removed the custom PrintButton entirely

While this branch was open, two unrelated tickets landed on `epic/ETP-3504`: ETP-4728 ("fix
print error handling, hide print in purchase-invoice") and ETP-4729 ("print unification onto
the generic icon"). Together they deleted `PrintButton.jsx` and every reference to it —
`ConfirmWithCreditButtonBase.jsx`'s inline "Imprimir" button (used by `return-material-receipt`
and `return-to-vendor-shipment`) and `GoodsShipmentActions.jsx`'s own inline button
(`goods-shipment`) — in favor of printing exclusively through the generic icon-only button in
`DetailView.jsx` / `DocumentPrintDrawer.jsx`.

This made the `hidePrintAlways` prop (described above for `return-material-receipt`) and the
`isCompleted`/`status !== 'DR'` custom gates (for `goods-shipment`/`return-to-vendor-shipment`)
dead code — the buttons they gated no longer exist. It also meant the generic `DetailView.jsx`
icon, now the *only* print entry point for these 3 windows, had never been gated for them:
`decisions.json` never declared `hidePrint`/`hidePrintWhen` there, because printing used to go
through the custom component instead. Verified by grepping every prior commit touching each
window's `decisions.json` — none ever set it.

Resolution, merged into the mechanism rather than treated as a special case: all 3 windows
now use the same `window.hidePrintWhen` entry as every other window in the table above —
`return-material-receipt: true` (always hidden), `goods-shipment` and `return-to-vendor-shipment:
{documentStatus:{notEquals:'CO'}}` (Completado only). No `listViewOptions` companion needed —
none of the 3 ever declared `hidePrint`, so their list-view print buttons were already in the
"stay untouched" state by default. `ConfirmWithCreditButtonBase.jsx`, `ConfirmWithCreditButton.jsx`
(both windows), and `GoodsShipmentActions.jsx` had the dead `hidePrintAlways`/custom-gate code
removed during the merge; their test suites were updated to assert the button's absence
directly (matching the sibling tests ETP-4728/ETP-4729 already added), rather than testing a
prop that no longer does anything. Verified live against a running local instance
(`return-material-receipt`, `goods-shipment`, `purchase-invoice`) — see per-window guides in
`docs/generated-custom-windows/` for the updated mechanism description.

## Scope update #3 (post-reset, post-visual-verification) — custom `<ListView>` wrappers never forwarded `listViewOptions`, and ETP-4729 superseded two windows' list-fix

After rebuilding this branch cleanly from `epic/ETP-3504` (discarding the tangled merge history
from scope updates #1–#2 and reapplying only this ticket's net diff — see `docs/feedback.md`'s
2026-08-11 entries for the full incident writeup), a Chrome-MCP visual pass across all 9 windows
surfaced two more issues invisible to `sf-validate-pipeline`/the generated artifacts alone:

1. **`sales-order`, `purchase-order`, `sales-invoice`** each have a custom
   `tools/app-shell/src/windows/custom/<window>/index.jsx` that hand-rolls its own `<ListView>`
   for the list route (only the detail route delegates to the generated `HeaderPage.jsx`), so
   the generator's correctly-emitted `listViewOptions={{"hidePrint":true}}` never reached the
   live component — the list-view print button stayed visible despite a clean contract and a
   passing validator. Fixed by hardcoding the same prop directly on each file's own `<ListView>`
   call, for `purchase-order` and `sales-invoice`.
2. **`sales-order`/`sales-quotation` did not get that same hardcode.** A separate, later ticket
   (ETP-4729) had, in the meantime, deliberately removed the pre-existing `hidePrint: true`
   these two windows had *before* ETP-4714 even started, restoring their list-view print to
   always-visible as the new intended baseline (with its own regression-guard test). ETP-4714's
   `listViewOptions` fix for these two was based on a now-superseded "pre-ticket" premise;
   removed `"listViewOptions": { "hidePrint": true }` from both `decisions.json` files instead
   of re-adding the `index.jsx` hardcode, deferring to ETP-4729's more recent, tested intent.

All 9 windows re-verified live (detail + list, both print-visible and print-hidden states)
after these corrections. Full incident detail, including the React-fiber inspection that
found gap #1 and the exact commits behind ETP-4729's removal: `docs/feedback.md`.

# ETP-5292 — Fix plan: Subtotal drifts by 1 cent once a document-level discount is materialized

**Ticket:** https://etendoproject.atlassian.net/browse/ETP-5292 — "Pedidos de compra — el impuesto cambia al clonar y confirmar un pedido con descuentos combinados"
**Branch:** `feature/ETP-5292` (created from `develop`)
**Status:** Fixed. Implemented, unit-tested, E2E-tested, and verified live on `localhost:3100`; committed on `feature/ETP-5292` and pushed. PR not yet opened. Investigated and root-caused live against `https://app.etendo.software/` (develop), then independently reproduced byte-for-byte on `localhost:3100` once the local environment came up (§1.5), then confirmed as a shared-component defect across all 5 Purchase/Sales windows plus the list-row preview and confirm-modal surfaces (§8). See §10 for the implementation and the full post-fix verification cycle, and §12 for the E2E regression test.

## 0. Summary

The bug is **not** a backend tax-rounding defect. `TotalDiscountService` and Etendo's core tax engine compute and persist the correct, internally-consistent totals in the database (verified directly against the NEO API). The defect is entirely in the **frontend display layer**: `DocumentTotalsPanel.jsx`'s `resolvePersistedTotals()` mis-derives the displayed "Subtotal" once a document's total discount has been **materialized** as a real `ETGO_DTO` line (i.e. once the document is Completed, or — per existing code comments — the instant an invoice is created from an already-discounted order). The error is a genuine floating-point/rounding artifact of a redundant, unnecessary "un-discount then re-discount" round trip in the client, not anything wrong in Java/SQL.

Cloning is **incidental** to the repro, not causal: the same 1-cent drift reproduces by directly confirming the *original* order — no clone required. The ticket's steps happen to reach the bug via clone+confirm because that's how the reporter built their repro, but the trigger is simply "a document with an active `etgoTotalDiscount` reaches a state where the discount line is materialized."

## 1. Investigation (live, against `app.etendo.software`, since local was occupied)

Local dev environment was busy at investigation time, so this was reproduced live against `https://app.etendo.software/` (already checked out on `develop`, matching this branch's target) via Claude in Chrome, plus direct `fetch()` calls (through the browser's authenticated session) against the NEO API to inspect raw, pre-frontend-derivation values. The reporter's specific order IDs (`1000013`/`1000026`) don't exist on this instance's dataset, so the scenario was rebuilt from scratch with equivalent shape (multi-tax + per-line discounts + one global document discount) on a new Purchase Order (`1000006` / `822F4A7773BD4B5898E7C3D61D0E0A0D`).

### 1.1 Reproduction data

3 lines, tarifa "Lista de compra (sin impuestos)":

| Product | Qty | Price | Line disc % | Tax |
|---|---|---|---|---|
| Agua | 20 | 5,00 | 25% | Adquisición B.Inmuebles 10% |
| Cerveza | 30 | 11,00 | 33% | Adquisición B.Inmuebles 10% |
| Fernet | 10 | 33,00 | 10% | Adquisiciones IVA 21% |

Header: `etgoTotalDiscount = 66%`.

### 1.2 Draft (before Complete) — persisted GET matches the live client recompute

Subtotal sin descuento: 760,00 € · Descuento por producto: -166,90 € · Descuento total (66%): -391,45 € · **Subtotal: 201,65 € · Impuesto: 31,28 € · Total: 232,93 €**. Internally consistent (201,65 + 31,28 = 232,93). No `ETGO_DTO` line exists yet.

### 1.3 Confirmed (after Complete, no clone) — UI regresses by exactly 1 cent

Immediately after clicking "Confirmar", and again after a full page reload (`F5`, forcing a fresh GET — ruling out client staleness):

**Subtotal: 201,64 € · Impuesto: 31,28 € · Total: 232,93 €**

This is **the exact bug**: Subtotal dropped by 0,01 € on Complete, and the panel is now **internally inconsistent** (201,64 + 31,28 = 232,92 ≠ the displayed 232,93 Total) — reproduced with **zero cloning involved**.

### 1.4 Raw NEO API — proves the backend is correct

```js
fetch('.../etendo/sws/neo/purchase-order/header/822F4A7773BD4B5898E7C3D61D0E0A0D', ...)
// → grandTotalAmount: 232.93, summedLineAmount: 201.65, etgoTotalDiscount: 66
```

`summedLineAmount` (201.65) is the server's real, persisted, already-net-of-discount total — it agrees with `grandTotalAmount - taxAmt` (232.93 - 31.28 = 201.65) perfectly. **The backend was never wrong.** The `lines` endpoint returns only the 3 real product lines (243.21 / 82.50 / 359.37 gross) — the materialized `ETGO_DTO` discount line is deliberately filtered out server-side by `DiscountLineFilter` (by design, for every window using this feature — see `com.etendoerp.go`'s `DiscountLineFilter.java` and `TotalDiscountService.java`).

### 1.5 Reproduced identically on `localhost:3100` once the local environment came up (2026-09-18)

Repeated the exact same reproduction data (§1.1) on a fresh local Purchase Order (`1000015` / `054D822569F84106ABAF0354396A51D7`) against `localhost:3100`. Draft showed the same correct 201,65 / 31,28 / 232,93; after Confirmar + a full navigation reload, the panel showed the same buggy **201,64 / 31,28 / 232,93**. A direct `fetch()` against `/sws/neo/purchase-order/header/<id>` (same-origin, through the authenticated session) returned:

```json
{ "grandTotalAmount": 232.93, "summedLineAmount": 201.65, "etgoTotalDiscount": 66, "documentStatus": "CO", "processed": true }
```

Byte-identical to the `app.etendo.software` findings (§1.4) — same backend truth (232.93 − 201.65 = 31.28, internally consistent), same frontend display defect. This rules out any environment-specific factor (data, deployment, browser session) — the bug is purely in the shared `tools/app-shell` source, present on `develop` in both places.

### 1.6 Classic corroboration — third, independent confirmation of the true value

The user pulled up the same order (`1000015`) directly in Classic (`localhost:8080/etendocorepg`, guest session — Classic has an unrelated session conflict when opened from the same browser profile as GO). Classic's own header bar reads:

> Total Gross Amount: **232.93** | Total Net Amount: **201.65** | Currency: EUR

and the Lines tab shows the two materialized `ETGO_DTO` discount lines exactly as derived by hand in §2's Classic-formula walkthrough: `-195.43` (Adquisición B.Inmuebles 10%, from the Agua+Cerveza group net 296.10 × 66%) and `-196.02` (Adquisiciones IVA 21%, from Fernet's 297.00 × 66%).

**Three independent sources now agree on 201.65, not 201.64**: the NEO API's raw `summedLineAmount` (§1.4/§1.5), the hand-derived Classic per-tax-bucket formula (§2), and Classic's own UI (this section) — which is the authoritative reference per this repo's own convention (`docs/plans/2026-08-12-etp4777-total-rounding-fix-plan.md` and root `CLAUDE.md`: Classic's backend triggers are "already correct, the reference source of truth"). Only the GO React panel disagrees, and only in the one code path identified in §2. This closes the loop — the fix target and its correctness criterion are now confirmed from three angles, not just the code reading.

### 1.7 Confirms and refines the "front computes, backend always wins" hypothesis

Raised before this round of testing: the panel is not a single code path — it alternates between two sources depending on *when* the user is looking:

- **While the user is actively typing** a total-discount %, or a line is pending/being edited (`hasPendingEdit === true`, `DocumentTotalsPanel.jsx:95`) — the panel shows a **pure client-side estimate**, `computeDocumentTotals()` (`tools/app-shell/src/lib/documentTotals.js`), computed only from the currently-loaded `lines` + the in-progress % input. No backend round trip involved for what's on screen at that instant.
- **The moment there is no pending edit** (blur resolved, page freshly loaded, or — critically — right after Complete) — the panel switches to `useBaseline = true` (`DocumentTotalsPanel.jsx:97`) and is supposed to show the **backend-persisted** `grandTotalAmount`/`summedLineAmount` verbatim, per the design `docs/plans/2026-08-12-etp4777-total-rounding-fix-plan.md` shipped (ETP-4777: "always trust the server, never recompute fiscal math client-side").

The bug lives exactly at that second boundary: `resolvePersistedTotals()` (the function that's supposed to just relay the backend's numbers) still runs the freshly-fetched, correct `persistedNet` back through a piece of **client-side arithmetic** (`persistedNet / factor`, see §2) instead of using it as-is — so even in the "backend wins" branch, a leftover front-side computation quietly re-enters and corrupts the number by exactly the kind of rounding residue the ETP-4777 baseline design was meant to eliminate. In other words: the *intent* ("backend always wins once there's no pending edit") is correctly designed and documented, but this one code path fails to actually implement it for the post-materialization case — confirmed, not just suspected.

This is also why the existing test suite and prior live QA passes (ETP-4777, ETP-5132 — see §6) never caught it: ETP-5132's consolidated test plan's "reload-after-complete" case (B5) only asserted the final **Total** (which — per §2 — is *always* taken directly from `persistedTotals.grandTotal`, so it's incidentally always right) and used single-tax-bucket documents, where `persistedNet / factor` happens to recover the exact raw net with no rounding residue (see §2's masking-gap note). Nobody had asserted the **Subtotal** row specifically on a *multi-tax* document after a hard reload post-Complete until this investigation.

## 2. Root cause — `DocumentTotalsPanel.jsx` → `resolvePersistedTotals()`

File: `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx`, lines 41–56 (helper) and 219–225 (render).

```js
function resolvePersistedTotals(recomputed, persistedTotals, totalDiscountPct) {
  const factor = 1 - (totalDiscountPct || 0) / 100;
  const persistedNet = persistedTotals.netSubtotal;        // server's summedLineAmount — already net-of-discount once materialized
  const rawFromLines = recomputed.netSubtotal;              // fresh sum from the 3 REAL lines (ETGO_DTO is filtered out of `lines`, always)
  const isAlreadyDiscounted = persistedNet != null && rawFromLines != null
    && Math.abs(persistedNet - rawFromLines) > 0.01;
  const netIfNotYetDiscounted = persistedNet != null ? persistedNet * factor : null;
  const discountedNet = isAlreadyDiscounted ? persistedNet : netIfNotYetDiscounted;
  const netSubtotal = isAlreadyDiscounted && factor > 0 ? persistedNet / factor : persistedNet;  // ← BUG
  const taxAmt = discountedNet != null ? persistedTotals.grandTotal - discountedNet : null;
  return { netSubtotal, taxAmt, grandTotal: persistedTotals.grandTotal };
}
```

Render (`DocumentTotalsPanel.jsx:223`):

```jsx
{fmt(totalDiscountAmt != null ? netSubtotal - totalDiscountAmt : netSubtotal)}
```

where `totalDiscountAmt` always comes from `recomputed` (the **live**, raw-lines-based calc), regardless of which branch produced `netSubtotal`.

**Why this is wrong once `isAlreadyDiscounted` is true:** `persistedNet` (201.65) is *already* the final, net-of-everything subtotal — nothing further needs to be subtracted from it. But the function first inflates it back up via `persistedNet / factor` (201.65 / 0.34 = 593.088…) — intended to reproduce the *raw, pre-discount* net so the render's later `- totalDiscountAmt` subtraction (391.446, computed independently from the raw lines) lands back on the correct net. This inversion is only exact when `persistedNet` is a perfect multiple of `factor`. In reality `persistedNet` was produced by the server materializing **one discount line per tax group**, each independently rounded to 2 decimals (`TotalDiscountService.recalculate()`) — that rounding makes `persistedNet / factor` recover a value close to, but not equal to, the true raw net (593.088… vs the true 593.10, a ~0.012 gap). Subtracting `totalDiscountAmt` from this slightly-wrong inflated figure lands 1 cent short: `593.088 - 391.446 = 201.642 → displayed 201,64`, not the true `201,65`.

**Why the "not yet discounted" branch (Draft, pre-Complete) is correct:** there, `netSubtotal = persistedNet` (the `else` of the ternary — no division), and `persistedNet` genuinely **is** the raw pre-discount net (nothing materialized yet), so `netSubtotal - totalDiscountAmt` computes the true discounted net directly, matching the server's own GET-time-compensated `grandTotalAmount`. No bug there — confirmed by §1.2 above.

**Why the effect is masked in the existing unit test:** `DocumentTotalsPanel.vitest.jsx`'s "reconciles an ALREADY-materialised discount" test (`persistedNet=75, factor=0.75`) chose `persistedNet` as an *exact* multiple of `factor` (75 = 100 × 0.75), so `persistedNet / factor` recovers `100` with **zero** rounding residue — the test's own comment ("using the same factor, inverted… both starting states converge to the one correct answer") asserts the inversion is sound, but never exercises a `persistedNet` that came from independent per-tax-group rounding, which is the realistic case for any multi-tax document. That's a real, generic gap in test data, not a wrong assertion for the numbers it uses.

**Who is affected:** any window that renders `DocumentTotalsPanel` via `persistedTotals` (built in `LinesBottomSection.jsx:78-80` from `data.summedLineAmount`/`data.totalLines` + `data.grandTotalAmount`) with an active `etgoTotalDiscount` **once the discount line is materialized** — i.e. any completed Sales/Purchase Order, Sales Quotation, and any Sales/Purchase Invoice (materialized immediately at creation per `InvoiceFromOrderSupport`, even while still Draft — see ETP-4777 §5 item 4). Same shared component, same bug, across all five document windows.

## 3. Proposed fix

Stop trying to make the "already discounted" branch masquerade as a raw, pre-discount net just so the render can reuse one generic `netSubtotal - totalDiscountAmt` subtraction. Instead:

1. **`resolvePersistedTotals()`**: return the already-correct, final net directly — drop the `persistedNet / factor` inversion entirely:
   ```js
   const netSubtotal = discountedNet; // == persistedNet when already discounted, == persistedNet * factor otherwise
   ```
   (`discountedNet` is already computed correctly two lines above — the fix removes a redundant, lossy round trip, not adds one.)
2. **Render (`DocumentTotalsPanel.jsx:219-225`)**: the subtotal row must stop unconditionally re-subtracting `totalDiscountAmt`. Only the **live-recompute** path (`recomputed`, used when `!useBaseline`) needs that subtraction — `resolvePersistedTotals`'s `netSubtotal` (per fix #1) is already final. Thread a small flag (or just branch on `useBaseline`, already in scope) so the displayed subtotal is:
   - `useBaseline` → `netSubtotal` (already final, from `resolvePersistedTotals`)
   - `!useBaseline` → `recomputed.netSubtotal - recomputed.totalDiscountAmt` (unchanged, live-typing case)
3. Re-verify the "not-yet-materialized" (Draft, pre-Complete) case still renders identically after the change — its `netSubtotal` was `persistedNet` (unchanged by fix #1, since that branch was never inverted) but its render path changes from "always subtract" to "subtract only when !useBaseline"; since Draft pre-Complete *is* `useBaseline=true` territory too (no pending edit), the fix must make sure `discountedNet` (already the correct, final net-of-discount figure for that branch too, per §2) is what gets displayed directly — i.e. **both** baseline branches (materialized and not-yet-materialized) should display `discountedNet` verbatim once fix #1+#2 land, and only the pure live-recompute path keeps the two-step subtraction. Double-check this against §1.2's numbers (201,65) during implementation — must not regress that already-correct case.

## 4. Test plan

- **Fix the masking gap in `DocumentTotalsPanel.vitest.jsx`**: change the existing "reconciles an ALREADY-materialised discount" test's numbers so `persistedNet` is **not** an exact multiple of `factor` (e.g. mirror §1's real ratios: `persistedNet=201.65, grandTotal=232.93, totalDiscountPct=66`, raw lines summing to 593.10) and assert the **exact** expected subtotal (201.65, not 201.64) — this test must fail before the fix and pass after.
- Add a dedicated regression test named after this ticket (`ETP-5292`) asserting: given a persisted, already-materialized baseline whose net came from independent per-tax-bucket rounding (not a clean multiple of the discount factor), the displayed Subtotal + Tax reconstructs exactly to the displayed Total (no internal 1-cent inconsistency).
- Keep the existing "NOT-yet-materialised" test passing unchanged (confirms fix #3 doesn't regress the Draft case).
- Per `docs/e2e-testing-guide.md` and this repo's testing delegation rule, hand the actual test-writing/editing to the `test-generator` subagent (Tester) — this plan only specifies what must be covered, not who writes it.
- **Live verification** (after the fix, before calling this done): repeat §1's exact repro on a fresh order — Draft (201,65/31,28/232,93) → Confirmar → Subtotal must now read 201,65 (not 201,64), Total unchanged at 232,93, and Subtotal+Impuesto must equal Total. Repeat once for a Sales Order and once for an invoice-created-from-a-discounted-order (materializes immediately, still Draft — the other trigger path per §2) to confirm the shared-component fix covers both.

## 5. Scope

### In scope
- `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx` (the only file with the defect).
- Its test suite (`DocumentTotalsPanel.vitest.jsx`).

### Explicitly out of scope (confirmed correct, do not touch)
- `com.etendoerp.go`'s `TotalDiscountService.java` / `AbstractOrderHeaderHandler.java` / `AbstractInvoiceHeaderHandler.java` — the backend materialization and GET-time compensation are correct and internally consistent (§1.4).
- Core Etendo tax-calculation triggers — confirmed correct, per ETP-4777's prior investigation (`docs/plans/2026-08-12-etp4777-total-rounding-fix-plan.md` §1 "out of scope") and re-confirmed here via the raw API.
- `documentPdf.js` / `LinesBottomSection.jsx` — read for context, no defect found in either.

## 6. Related prior work

- `docs/plans/2026-08-12-etp4777-total-rounding-fix-plan.md` / `docs/bug-reports/2026-08-12-form-summary-total-rounding-mismatch.md` — introduced `persistedTotals` and the baseline-vs-live-recompute split this bug lives inside of. That fix's Task 3 explicitly decided the Draft (not-yet-materialized) GET-time-compensated number is acceptable to show as-is, precisely because it's "still a server-computed number" — that reasoning holds; this ticket's bug is a **new** defect in how the *already-materialized* branch (added by that same fix, for the invoice-from-discounted-order case) reconstructs its displayed net, not a reopening of that decision.
- `docs/bug-reports/2026-09-09-etp5132-confirm-modal-double-discount.md` — documents an **accepted, expected** 1-cent drift between the Confirm modal's own pre-confirm *estimate* and the real post-confirm value ("the modal's `totalLines` uses `round2(netBase × discountFactor)` client-side; the backend rounds per-tax-group... not a regression"). That is a **different** surface (`PurchaseOrderActions.jsx`'s `ConfirmModal`/`OrderCreateInvoice.jsx`/`SendToEvaluationModal.jsx`, a one-shot pre-action preview) from this ticket's bug (`DocumentTotalsPanel.jsx`, the persisted panel shown on the document itself, which ETP-4777 explicitly designed to be byte-identical to the backend once there's no pending edit — no "estimate" framing applies here). Do not conflate the two when triaging future 1-cent reports on this codebase: check which component is showing the number first.
- `docs/plans/2026-05-03-discount-feature-status.md` §Q-B — the per-tax-group Classic formula (`C_ORDER_POST1`/`C_INVOICE_POST`) that `TotalDiscountService` mirrors and that this investigation's §1.6 independently re-confirmed against Classic's live UI.

## 8. Cross-window investigation (2026-09-18) — all 5 documents, preview panel, confirm modal

Requested explicitly: repeat the reproduction on every Purchase/Sales window (orders, invoices, quotations), and separately determine — for each window's **list-row preview** (opened by clicking a row in the list view) and its **confirm popup** — whether the totals shown come from the frontend's own computation or from a value the backend supplied. Docs read first (this section), then live-tested on `localhost:3100`.

### 8.1 The `DocumentTotalsPanel` bug reproduces identically on every window that has one

Same repro data as §1.1 (Agua 20×25%, Cerveza 13×13%, Fernet 10×0%, two tax groups, 66% total discount), rebuilt fresh on each window:

| Window | Record | Draft Subtotal | Confirmed/evaluated Subtotal | Drift |
|---|---|---|---|---|
| Purchase Order | 1000015 | 201,65 € | **201,64 €** | -0,01 (§1.5) |
| Sales Order | 1000034 | 299,24 € | **299,23 €** | -0,01 |
| Sales Invoice | 10000042 | 299,24 € | **299,23 €** | -0,01 |
| Sales Quotation | 1000003 (→ Bajo evaluación) | 299,24 € | **299,23 €** | -0,01 |
| Purchase Invoice | 10000028 | 180,00 € | 180,00 € | none — this particular dataset's rounding happened not to cross a HALF_UP boundary (see §2's "masking-gap" note: the bug is data-dependent, not window-dependent); the code path is byte-identical to the other four, so it is equally exposed once the right numbers land on it |

Confirms: this is a defect in the **shared** `DocumentTotalsPanel.jsx`/`resolvePersistedTotals()`, not anything window-specific. The fix in §3 covers all five windows simultaneously — no per-window changes needed.

### 8.2 List-row preview panel — where its numbers come from

Opened the list view for each window and clicked a row (not the pencil/edit icon) to open the preview overlay (`OrderPreview.jsx` / `InvoicePreview.jsx` / `QuotationPreview.jsx`, wired via `renderPreview` in `useOrderWindow.jsx`/`useInvoiceWindow.js`).

- **The right-hand summary card's `Total`** (e.g. "232,93 €" for Purchase Order 1000015) is read directly from the **`row` object already loaded by the list's own GET** (`ListView.jsx:1358`'s `renderPreview?.({ row, ... })` → `OrderPreview`'s `order={row}` → `grandTotal={order.grandTotalAmount}`). **No separate network request is made for this value** — confirmed by reading the wiring code (§ "Preview panel" investigation) and by the fact that `grandTotalAmount` is exactly what the list column already renders as "Imp. total".
- **The left-hand printable/PDF body**, however, *does* fire its own fresh `GET header/{id}` + `GET lines?parentId={id}` when the preview opens (confirmed live via network capture: both calls fired for Purchase Order 1000015 immediately on opening the preview, alongside the attachment/email-history calls that populate the right panel's other cards). This is expected and necessary — the list row never carries line items, and the PDF needs them to render the product table — **not evidence of the `DocumentTotalsPanel` bug**, since the PDF builder (`documentPdf.js`'s `buildOrderData`, per the ETP-5132 fix already landed — see §6) reads `header.grandTotalAmount`/`header.summedLineAmount` **directly**, with no `resolvePersistedTotals`-style reconstruction.

**Concrete, user-visible consequence found live**: opening the preview for the same confirmed Purchase Order 1000015 that §8.1 shows as buggy in `DocumentTotalsPanel` (201,64 €), the PDF preview's own printed breakdown shows **"Subtotal (sin impuestos): 201,65 €"** — the *correct* value, because it bypasses the buggy code path entirely. **Two screens of the identical document now disagree with each other** (201,64 in the edit view vs. 201,65 in the PDF preview) — this is the sharpest illustration yet of the "front sometimes computes, sometimes trusts the backend, and the two disagree" pattern flagged before this investigation started. Fixing §3 makes both screens converge back on 201,65.

### 8.3 Confirm popup — where its numbers come from

Three windows have a genuine confirm/send popup with its own totals preview (Purchase Order, Sales Order, Sales Quotation); Sales Invoice and Purchase Invoice have **no popup at all** — clicking "Confirmar" PATCHes `documentAction=CO` directly (`getInvoiceDraftMode()` in `useInvoiceWindow.js` sets no `onConfirm` modal-opening callback), so this question doesn't apply to them.

For the three that do:

- **Purchase Order** (`PurchaseOrderActions.jsx`'s `ConfirmModal`) and **Sales Order** (`OrderCreateInvoice.jsx`'s `ConfirmModal`): fire their own `GET header/{id}` + `GET lines?parentId={id}` **on mount**, but prefer the already-in-memory `data` prop (the record currently open/edited in the DetailView) over that fresh fetch — `const d = data || freshData || {}` — falling back to the fresh GET only if `data` is empty (e.g. the very first render). Rationale documented in the code (ETP-4468): the in-memory copy may hold an unsaved edit the fresh fetch wouldn't see yet.
- **Sales Quotation** (`SendToEvaluationModal.jsx`): fires the equivalent fresh `GET quotation/{id}` + `GET quotationLine?parentId={id}` on mount, but with the **opposite priority** — `const d = freshData || data || {}`, i.e. it prefers its own independent backend query over the in-memory record. Confirmed live via network capture: opening the modal for quotation 1000003 fired `GET /sws/neo/sales-quotation/quotation/4C63C799176D470BB6A9CF0E2F7F353F` immediately.
- In every case the modal's displayed **Total** is `grossBase` (`d.grandTotalAmount`) taken **as-is** — no client recomputation — per the ETP-5132 fix (§6). Only the **Subtotal** row (`totalLines`) still applies a client-side `discountFactor` to `d.summedLineAmount`, because that field is never backend-compensated pre-Complete. Live-verified: all three modals' Total/Subtotal matched the Draft `DocumentTotalsPanel` exactly (e.g. Sales Quotation modal showed 345,62 € / Subtotal 299,24 €, byte-identical to the panel) — **not** the buggy post-confirm value, because the modal always runs *before* the action, while the document is still Draft and the panel's "not-yet-materialized" branch (confirmed correct in §2) is what's being mirrored.
- This modal-vs-real 1-cent drift is the **already-documented, accepted** ETP-5132 pattern (§6) — orthogonal to this ticket's bug and not to be fixed here.

### 8.4 Summary — answering "does it read the front's math or the backend's own value, and when"

| Surface | Source | Independent fetch on open? | Affected by this bug? |
|---|---|---|---|
| `DocumentTotalsPanel` (DetailView), no pending edit | `persistedTotals` via `resolvePersistedTotals()` — **should** be a pure backend passthrough | No (reuses already-loaded `data`) | **Yes** — the one broken code path (§2) |
| `DocumentTotalsPanel`, actively typing/editing | `computeDocumentTotals()`, pure client computation | No | No (never claimed to match the backend while typing) |
| List-row preview, right-hand summary card | The list's own already-fetched `row` | No | No |
| List-row preview, left-hand PDF/print body | Fresh header+lines GET, read directly (no reconstruction) | **Yes** | No |
| Confirm modal — Purchase/Sales Order | In-memory `data`, falls back to its own fresh GET | Yes, but deprioritized | No (different, accepted drift — §6) |
| Confirm modal — Sales Quotation | Its own fresh GET, falls back to in-memory `data` | Yes, prioritized | No (same accepted drift) |
| Sales/Purchase Invoice "confirm" | No popup — direct PATCH | N/A | N/A |

## 10. Implementation and post-fix verification (2026-09-18)

### 10.1 What shipped — Option B (structural fix, not just the minimal patch)

Both changes confined to `tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx`:

1. `resolvePersistedTotals()` — removed the `persistedNet / factor` inversion entirely; it now returns `netSubtotal: discountedNet` (the same `discountedNet` it was already computing correctly two lines above) — i.e. the function's contract is now "always return the final, net-of-every-discount figure," never a value the caller still needs to subtract something from.
2. Render — introduced an explicit `displaySubtotal` computed once, before the JSX: `useBaseline ? netSubtotal : (totalDiscountAmt != null ? netSubtotal - totalDiscountAmt : netSubtotal)`. The "Subtotal" row now renders `displaySubtotal` instead of repeating that ternary inline. This removes the implicit, file-wide assumption ("every `netSubtotal` that reaches the render still needs `totalDiscountAmt` subtracted") that caused the bug — the two paths' shapes are now explicit at the point of use, not just in a comment.

### 10.2 Unit tests

- Updated `DocumentTotalsPanel.vitest.jsx`: added a new test (`ETP-5292 — an ALREADY-materialised discount whose persisted net is NOT an exact multiple of the factor...`) using the real repro numbers (`persistedNet=201.65, grandTotal=232.93, totalDiscountPct=66`, raw lines summing to 593.10) — asserts Subtotal=201.65, Tax=31.28, Total=232.93, plus an explicit internal-consistency check (`subtotal + tax ≈ total`).
- **Verified the new test actually discriminates old vs. new code**, not just a tautology: stashed the fix and re-ran — the test failed with `expected '201.64223529411765' to be '201.65'`, i.e. it reproduces the exact bug. Un-stashed, re-ran — passes.
- Full existing suite re-run after the fix: `DocumentTotalsPanel.vitest.jsx` (29/29), `documentTotals.vitest.js` (18/18), plus the plain-`node --test` suites for `documentTotals.test.js` and `LinesBottomSection.test.js` (46/46 combined) — all green, zero regressions.
- Full `tools/app-shell/src/components/contract-ui` Vitest suite (everything in the directory, not just the touched files): **237 test files, 4623 tests passed, 1 skipped, 0 failed.**

### 10.3 Live verification cycle (`localhost:3100`, dev server picked up the change via HMR)

**Previously-buggy confirmed documents, re-checked after the fix (no new data, just re-loading each record):**

| Window | Record | Subtotal before fix | Subtotal after fix | Subtotal + Tax == Total now? |
|---|---|---|---|---|
| Purchase Order | 1000015 | 201,64 € | **201,65 €** | ✓ (201,65+31,28=232,93) |
| Sales Order | 1000034 | 299,23 € | **299,24 €** | ✓ (299,24+46,38=345,62) |
| Sales Invoice | 10000042 | 299,23 € | **299,24 €** | ✓ |
| Sales Quotation | 1000003 | 299,23 € | **299,24 €** | ✓ |
| Purchase Invoice | 10000028 | 180,00 € (never showed the bug — §8.1) | 180,00 € | ✓ (unaffected, as expected) |

**New scenario, not live-tested before this round — invoice created from an already-discounted order (still Draft, discount materialized immediately):** created a Sales Invoice from confirmed Sales Order 1000034 via "Gestionar envío y factura". Raw API confirmed `documentStatus: "DR"`, `summedLineAmount: 299.24` (already net-of-discount despite still being Draft — the exact ETP-4777-flagged edge case). Panel correctly showed Subtotal 299,24 € — this is the `isAlreadyDiscounted` branch triggering via the net-comparison heuristic (not document status), confirming the fix also covers this path, not just plain post-Complete.

**Full state-cycle walkthrough on a fresh Purchase Order (1000016), covering every code path in one continuous flow:**
1. **Live typing** (discount % input focused, not yet blurred) — showed Subtotal 201,65 / Tax 31,27 / Total 232,92 (the `computeDocumentTotals` live-estimate formula, untouched by this fix — expected to differ slightly from the persisted value, per ETP-4777's own design, since nobody asked that transient number to match).
2. **Draft, saved (blurred)** — Subtotal 201,65 / Tax 31,28 / Total 232,93 — correct, and confirmed unchanged in shape from before the fix (this branch was never inverted).
3. **List-row preview (right-hand summary card)**, still Draft — Total 232,93, read straight from the list row, unaffected either way.
4. **Confirm modal** — 232,93 € / Subtotal 201,65 € — matches the Draft panel exactly, confirming the modal (a separate file, untouched) is unaffected by this fix.
5. **Confirmed** — DetailView now shows Subtotal 201,65 (fixed; would have shown 201,64 before).
6. **List-row preview PDF body, now on the confirmed document** — "Subtotal (sin impuestos): 201,65 €" / "Impuestos: 31,28 €" — **now matches the DetailView exactly**. Before the fix, this was the concrete two-screens-disagree case from §8.2 (PDF said 201,65, DetailView said 201,64); now both agree, because the fix made the DetailView correct rather than the PDF wrong.

**The same full state-cycle (live typing → draft save → list-row preview [summary + PDF/print body] → confirm-on-complete → confirmed DetailView → preview again) was independently repeated end-to-end for the remaining four windows, not just spot-checked on pre-existing records:**

- **Sales Order** (new record, same repro data as §1.1): draft, list-preview summary card, PDF body, `ConfirmModal` (Subtotal 299,24 €), confirmed DetailView (299,24 €), post-confirm list-preview PDF — all consistent at every step.
- **Sales Invoice** (new record `10000044`, no confirm modal — direct PATCH `documentAction=CO`): live-typing the 66% discount showed the client-side estimate (Subtotal 299,24 €, matching because the per-tax rounding happened not to drift at this step); draft-saved panel read 299,24 / 46,38 / 345,62; confirmed directly (no modal); list-row preview's right-hand summary card showed Total 345,62 €; the PDF body (which, unlike the Draft case flagged in §10.4, is now on a **Completed** document) showed "Subtotal (sin impuestos): 299,24 €", "Impuestos: 46,38 €", "Total: 345,62 €" — byte-identical to the confirmed DetailView, which itself read 299,24 / 46,38 / 345,62. No drift anywhere in the cycle.
- **Sales Quotation** (existing record `1000003`, already in "Bajo evaluación" from earlier in this session with the same repro data — draft/evaluation Subtotal already read 299,24 €, correct): opened the "Confirmar" flow and checked **both** confirmation branches it offers — "Crear pedido de venta" and "Facturar directamente" — the modal's summary card showed "3 líneas · Subtotal 299,24 €" identically under both radio options. Confirmed via "Facturar directamente" (materializes the discount immediately into a new Draft invoice, the ETP-4777 edge case): the resulting invoice `10000045` showed Subtotal 299,24 / Impuesto 46,38 / Total 345,62 in its own DetailView, and the `ConfirmResultModal` success popup also showed the correct 345,62 €. Matches the already-documented "invoice from already-discounted order" edge case (§10.3 above), now reproduced via the quotation path specifically.
- **Purchase Invoice** (new record `10000029`, no confirm modal — direct PATCH, same as Sales Invoice): live-typing the 66% discount showed Subtotal 180,00 € (matches — 529,41 × 0,34 = 180,00 with no rounding drift at this particular line/tax combination, consistent with §8.1's note that Purchase Invoice's dataset just doesn't happen to cross a HALF_UP boundary); draft-saved panel read 180,00 / 30,34 / 210,34; confirmed directly; list-row preview's summary card showed Total 210,34 € (Purchase Invoice's preview has no PDF/print body — it shows an upload-a-document card instead, since purchase invoices are typically scanned/uploaded rather than generated, so there is no second screen to cross-check here); confirmed DetailView read 180,00 / 30,34 / 210,34 — internally consistent throughout.

### 10.4 New, separate, pre-existing issue found during this verification round — NOT fixed here, flagging only

While re-checking the list-row preview for the still-Draft Purchase Order 1000016 (step 3 above, *before* confirming), the **PDF body** (not the right-hand summary card) showed:

> Subtotal (sin impuestos): 593,10 € · Impuestos: **-360,17 €** · Total: 232,93 €

A negative tax line. Root cause (read, not fixed): `buildOrderData` in `documentPdf.js` derives `taxAmount = grandTotal - netAmount` from `header.grandTotalAmount` (232.93, GET-time-compensated per ETP-4029) and `header.summedLineAmount` (593.10 here — **deliberately left uncompensated pre-Complete**, per the ETP-5132 investigation doc's own words: *"summedLineAmount was deliberately left uncompensated... other call sites rely on comparing it against the freshly-recomputed line total precisely because it stays raw"*). The ETP-4777 plan explicitly assumed this PDF path is "only ever reachable on a non-Draft document" (gated by the caller) and built no Draft-handling into it on that basis — that assumption holds for the in-document "Enviar/Vista previa" button, but **not** for this list-row preview's PDF panel, which has no such gate and renders it anyway for a Draft record.

This is unrelated to ETP-5292 (different file, different formula, pre-existing before this session's fix — confirmed by re-reading `documentPdf.js`, which this fix never touched) and out of scope to fix here. Recommend a separate ticket: either gate the list-row preview's PDF body the same way the in-document button is gated, or make `buildOrderData` Draft-aware. Flagging per this session's "verify the whole cycle" instruction, not fixing.

### 10.5 Conclusion

The fix is confined to one file, backed by a test that provably catches the exact regression, passes the entire existing `contract-ui` suite (4623 tests) with zero collateral damage, and was independently re-verified live across all 5 windows, the not-yet-materialized Draft path, the live-typing path, the invoice-from-already-discounted-order path, the list-row preview (both its summary card and its PDF body), and the confirm modal. The one loose end is the pre-existing, unrelated PDF-negative-tax issue in §10.4, surfaced as a byproduct of this verification, not caused by it.

## 12. End-to-end regression test

The unit test added in §10.2 proves `resolvePersistedTotals()` is correct in isolation, but cannot catch a real desync between the backend's per-tax-bucket rounding (Java, `TotalDiscountService`) and the frontend's display of it. Delegated to the `test-generator` subagent (Tester), per this repo's mandatory testing-delegation rule.

New spec: `e2e/tests/flows/purchase-order-total-discount-tax-rounding.mocked.spec.js` — mocked Playwright test (no live backend), Purchase Order only (the window named in the ticket; §8 already confirmed the defect is a single shared-component bug identical across all 5 windows, so one representative window suffices). Uses the exact §1.1/§10.3 repro data (two tax buckets, per-line discounts, 66% header total discount). Loads the Draft fixture, dispatches the real confirm action (`documentAction=CO`), and a stateful route mock flips the header GET response to a "Confirmed" fixture whose `summedLineAmount` (201.65) is deliberately not a clean multiple of the discount factor — modeling the real backend materialization. Asserts the post-confirm DetailView shows exactly Subtotal 201.65 / Tax 31.28 / Total 232.93, with a strict `round(Subtotal+Tax,2) === round(Total,2)` check (no tolerance that could mask the 1-cent drift).

Verified the same way as the unit test: passes against the fixed code; reverting `DocumentTotalsPanel.jsx` via `git stash` and re-running reproduces the exact failure (`Expected: 201.65, Received: 201.64`) before `git stash pop` restores the fix.

## 11. Follow-up documentation

Per `docs/self-documentation-policy.md`, once implemented: update this doc's status to "Fixed" with the PR link. No `docs/generated-custom-windows/<window>.md` changes expected (shared component, not window-specific config).

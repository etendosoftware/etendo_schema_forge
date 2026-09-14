# ETP-5178 — Editable quantity field in "Import from" popups

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. This plan targets a single shared component; all four import-popup variants (shipment, order, source-invoice, return-shipment) across sales and purchase are fixed by the same change.

**Ticket:** https://etendoproject.atlassian.net/browse/ETP-5178
**Goal:** the per-line quantity field in the "Importar desde" popup (albarán/pedido/factura, ventas y compras) must be freely editable — select, delete, type any value — with range/validity checks running only on blur, not on every keystroke.

## Root cause (verified against current sources 2026-09-10)

`tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx:323-342` — the quantity `<input type="number">` is fully controlled by `lineQuantities`, and its `onChange` parses + clamps synchronously on every keystroke:

```jsx
onChange={e => {
  const magnitude = Math.abs(Number(e.target.value) || 1);
  const v = Math.max(1, Math.min(maxQty, magnitude));
  setLineQuantities(prev => ({ ...prev, [line.id]: v }));
}}
```

Because the component re-renders with the clamped value on every keystroke, the browser resets the cursor to the end and any parse failure (empty string mid-edit, decimal-in-progress) snaps to `1`. This is exactly the reported behavior (can't clear "10" to type "5"; can't type "1500" when max is 2500).

**Confirmed live** on `https://go.experimental.etendo.cloud/` (develop): sales invoice → "Importar desde envío" → line with `maxQty=10`, typing "51" character-by-character clamps to "10" before the second digit is even committed.

`ImportLinesModal` is the single shared implementation — every window (`goods-receipt`, `goods-shipment`, `purchase-invoice`, `sales-invoice`) uses a thin wrapper around it (`ImportFrom*Modal.jsx` in each `artifacts/<window>/custom/`). One fix here covers all of them.

**No changes needed to:** `handleImport` (already reads the committed `lineQuantities[line.id] ?? maxQty` — untouched as long as invalid values never get committed there), the `negativeQuantity` sign-flip logic, `min`/`max` DOM attributes (kept for native arrow-key stepping), the Tailwind spin-button-hiding classes, or the `input[type="number"]` element type itself (kept — switching to `type="text"` was considered and rejected: it would force rewriting 7 of the 9 existing `negativeQuantity` tests that select on `input[type="number"]` or assert `.min`/`.max`, for no behavioral gain).

## Decided UX (confirmed with user 2026-09-10)

- **Invalid value on blur** → revert the field to the last committed valid value + show an error via `toast.error(...)` (the file already imports `toast` from `sonner` and uses `toast.error`/`toast.warning` elsewhere in this same component). Border switches to `hsl(var(--destructive))` while invalid, matching the existing error-border convention (`AccountBadgeSelect.jsx`, `DataTable.jsx`).
- **Decimals supported** — the current code never rounds (`Number(e.target.value)`, no `Math.round`), so decimal UoM quantities already work today; the fix must not regress that.

---

## Task 1: Decouple typing from committed state (DEV)

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx`
- Modify: `tools/app-shell/src/locales/en_US.json`
- Modify: `tools/app-shell/src/locales/es_ES.json`

- [ ] **Step 1: Add a per-line draft state**

  Add `const [qtyDrafts, setQtyDrafts] = useState({});` near the existing `lineQuantities` state (line 42). `qtyDrafts[line.id]` holds the raw string the user is currently typing; it is absent when the field isn't being actively edited (falls back to the committed, formatted value).

- [x] **Step 2: Wire the input to the draft, free `onChange`, validating `onBlur`** — IMPLEMENTED, superseding this step's original sketch. Actual shape shipped (see the real diff in `ImportLinesModal.jsx` for exact lines):

  ```jsx
  // Module-level helper, shared by the border check and onBlur — returns WHY it's
  // invalid (not just whether), so onBlur can pick the right toast message.
  function classifyQtyDraft(raw, maxQty) {
    if (raw === undefined || raw.trim() === '') return { valid: false, tooHigh: false };
    const parsed = Number(raw);
    const isNumeric = Number.isFinite(parsed);
    const magnitude = Math.abs(parsed);
    if (isNumeric && magnitude > 0 && magnitude <= maxQty) return { valid: true, tooHigh: false };
    return { valid: false, tooHigh: isNumeric && magnitude > maxQty };
  }

  // ...on the input:
  value={draft ?? displayQty}
  onChange={e => setQtyDrafts(prev => ({ ...prev, [line.id]: e.target.value }))}
  onBlur={() => {
    const raw = qtyDrafts[line.id];
    if (raw !== undefined) {
      const check = classifyQtyDraft(raw, maxQty);
      if (check.valid) {
        setLineQuantities(prev => ({ ...prev, [line.id]: Math.abs(Number(raw)) }));
      } else if (check.tooHigh) {
        toast.error(ui('qtyMaxAllowed', { max: maxQty }));
      } else {
        toast.error(ui('qtyMustBePositive'));
      }
      setQtyDrafts(prev => { const n = { ...prev }; delete n[line.id]; return n; });
    }
  }}
  ```

  Note `displayQty` is already the sign-aware committed value — no change needed there. `magnitude` intentionally ignores the typed sign (matches today's `Math.abs` behavior for `negativeQuantity` mode).

  **Follow-up (2026-09-10, user-driven wording refinement):** the error message was split into TWO cases instead of one generic "enter a value between 1 and {max}" — a single message read badly for `maxQty=1` ("between 1 and 1") and didn't explain *why* a `0` failed. `check.tooHigh` picks between them.

- [x] **Step 3: Error border** — IMPLEMENTED. `draftInvalid = draft !== undefined && !classifyQtyDraft(draft, maxQty).valid` (reuses the same helper, boolean-only for the border — the border doesn't need to distinguish *which* message will show). Extends the existing conditional `border`/`background` style: `border: draftInvalid ? '1px solid hsl(var(--destructive))' : qtyEdited ? ... : ...`.

- [x] **Step 4: i18n keys** — IMPLEMENTED as TWO keys (not one `qtyInvalidRange` as originally sketched — see follow-up note in Step 2), flat, same namespace as the other `ImportLinesModal` strings near `"qty"` / `"selectLinesToImport"`:
  - Exceeds `maxQty`: `qtyMaxAllowed` — en: `"The maximum allowed is {max}"` / es: `"El máximo permitido es {max}"`
  - Zero/negative/empty/non-numeric: `qtyMustBePositive` — en: `"The quantity must be greater than 0"` / es: `"La cantidad debe ser mayor a 0"`

  Verified live on localhost:3100 in both `es_ES` and `en_US`, across `sales-invoice`, `goods-shipment`, `purchase-invoice`, `goods-receipt` — see QA notes below.

## Task 2: Tests (delegate to Tester per project policy — Vitest/unit and Playwright/e2e changes are never written by DEV directly)

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/__tests__/ImportLinesModal.vitest.jsx`
- Review (adjust only if behavior actually breaks): `e2e/tests/flows/purchase-invoice-import-from-receipt.mocked.spec.js`, `e2e/tests/flows/sales-invoice-import-no-reload.mocked.spec.js`

- [ ] **Step 1: Update the 2 tests whose current assertion is "clamps on change"**
  - `clamps a magnitude above maxQty down to maxQty` (currently lines 442-449): change to `fireEvent.change` (out-of-range value, expect it stays as-typed, unclamped) then `fireEvent.blur` (expect revert to the last committed value, `-5` in this fixture — same number as before, but now for the "revert to previous" reason, not "clamp to max"; also assert `toast.error` was called with the `qtyMaxAllowed` message).
  - `defaults a non-numeric input to a magnitude of 1` (currently lines 451-458): change to assert that after `fireEvent.change` with a non-numeric/empty value the field shows exactly what was typed (no snap to `1`), and only `fireEvent.blur` reverts it to the previous committed value (assert `toast.error` called with the `qtyMustBePositive` message — NOT `qtyMaxAllowed`, since this path is "invalid" not "too high").
- [ ] **Step 2: New coverage**
  - Free multi-keystroke typing never gets clamped mid-edit (simulate two sequential `fireEvent.change` calls building up a value above `maxQty`, assert the displayed value after each keystroke matches exactly what was typed, not a clamped number).
  - `onBlur` with a valid value commits it and updates the line-total preview.
  - `onBlur` with a value `> maxQty` shows the `qtyMaxAllowed` toast (not `qtyMustBePositive`) and reverts.
  - `onBlur` with `0` / negative / empty / non-numeric shows the `qtyMustBePositive` toast (not `qtyMaxAllowed`) and reverts — these are two DISTINCT message paths now, both need their own test (see live QA note below: `maxQty=1` + typed `5` → `qtyMaxAllowed`; typed `0` → `qtyMustBePositive`, confirmed in both locales).
  - Decimal quantity round-trips correctly through draft → commit.
  - `negativeQuantity` case end-to-end: type a magnitude below/above `maxQty`, blur, confirm sign-aware `displayQty` end state.
- [ ] **Step 3: Playwright review**
  - Check whether either mocked e2e spec drives the quantity stepper via a single `fill` (implicit change+blur) — if so it likely needs no change; if it asserts an intermediate typed state, add an explicit blur step.

## Task 3: Pipeline (REVIEW → QA → DOCS, coordinator-managed)

- [ ] REVIEW (Alex): run `npx sf-validate-pipeline --scope=sales-invoice,purchase-invoice,goods-shipment,goods-receipt`, review the diff.
- [x] QA — **preliminary manual pass already done by the coordinator on localhost:3100 (2026-09-10)**, ahead of the formal Sentinel pass: free typing (no mid-keystroke clamp) confirmed on `sales-invoice` → Añadir desde pedido, `goods-shipment` → Añadir desde pedido, `purchase-invoice` → Importar desde pedido; `qtyMaxAllowed` toast confirmed on `sales-invoice` (max 10) and `purchase-invoice` (max 13); `qtyMustBePositive` toast confirmed on `sales-invoice` (typed 0); BOTH messages re-verified in `goods-receipt` → Import from PO with the UI language switched to **English** (`qtyMaxAllowed` at max=1, `qtyMustBePositive` at typed 0) — confirms i18n wiring, not just the es_ES copy. Valid-value commit + amount recalculation confirmed (typed 7 → line total 308,00€). No test data was left saved in any of these draft documents. Sentinel should still do the FORMAL pass (this was exploratory, not a structured checklist run) — in particular the ticket's own numeric edge case (1500 of 2500) wasn't reproduced with those exact numbers, and `Importar desde envío`/`Añadir desde Factura` variants weren't clicked through (only `Añadir/Importar desde pedido`), even though they're the same shared component.
- [x] DOCS (Sage): updated all 4 window guides (`sales-invoice.md`, `purchase-invoice.md`, `goods-shipment.md`, `goods-receipt.md`) with ETP-5178-tagged notes describing free typing + on-blur validation, matching each file's existing evidence-bullet convention. Checked `docs/ui-customization.md` and `app-shell-functional-flows.md` — neither documents this specific behavior, so left untouched.

**Pipeline complete: DEV ✅ → REVIEW ✅ (Alex, approve, no blockers) → QA ✅ (Sentinel, GO) → DOCS ✅ (Sage). Ready for commit + PR.**

---

## Out of scope / explicitly not touched

- No backend / NEO Headless changes — this is a pure frontend input-handling bug.
- No change to `handleImport`, line-total calculation, or the negative-quantity sign convention.
- No change to the native browser stepper arrows (still respect `min`/`max`, unaffected by this fix).

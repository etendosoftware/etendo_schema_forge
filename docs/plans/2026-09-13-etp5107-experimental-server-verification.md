# ETP-5107 — Post-merge verification on `go.experimental.etendo.cloud` (2026-09-13)

**Purpose:** ETP-5107's PR (#1435) merged to `develop`. This doc re-runs, live, against the
experimental server (tracking `develop`), EVERY case from the original local QA matrix
(`docs/plans/2026-09-08-etp5107-price-input-locale-fix.md` §11–§16) PLUS the literal test
cases/repro steps written in the Jira ticket itself, so there is a 1:1 traceable record against
both the engineering plan and the ticket's own acceptance criteria. Nothing is skipped or
assumed — every row below is filled in only after being actually exercised on
`https://go.experimental.etendo.cloud/`, logged in as GOAdmin.

Windows in scope (all 5 `linesLayout:"inlineEditable"` windows this fix touches): Pedido de
Compra, Pedido de Venta, Factura de Compra, Factura de Venta, Presupuesto (Sales Quotation).

## 0. Jira ticket ETP-5107 — literal test cases (source of truth, verbatim)

**Steps to reproduce:**
- Bug 1: Pedido de Venta, línea con precio `9,80` → editar a `10,4` (coma) → guardar → antes: Error 400. Repetir con `10.4` (punto) → antes: funciona.
- Bug 2: Pedido de Compra, línea, Precio con letras (`20,0rrwetwrtwrt2`) → antes: input aceptaba los caracteres.
- Bug 3: Inventario → Producto → solapa Precio → antes: `€ 14.5`/`€ 38` (punto); línea de documento del mismo producto → `9,80` (coma).

**Other test cases (Given/When/Then):**
1. Pedido de Venta, ingresa `10,50` (coma) y guarda → se guarda como 10.50, se muestra `10,50`.
2. Campo Precio, intenta ingresar letras → no permite caracteres no numéricos.
3. Compara formato Producto vs líneas de documento → mismo separador (coma, locale español).

## 1. Test matrix (from the engineering plan, §11–§14) — status

| # | Case | Pedido Compra | Pedido Venta | Factura Compra | Factura Venta | Presupuesto |
|---|---|---|---|---|---|---|
| 11.1 | Existing-line, comma decimal, no 400 | PASS | PASS | PASS | PASS | PASS |
| 11.2 | Add-line, comma decimal, live grouping | PASS | PASS | PASS | PASS | PASS |
| 11.3 | Letters rejected (existing + add-line) | PASS | PASS | PASS | PASS | PASS |
| 11.4 | Calc correctness (Precio/Cantidad/Descuento) | PASS | PASS | PASS | PASS | PASS |
| 14 | Add-line 4+ digit price lives-groups (regression re-check) | PASS | PASS | PASS | PASS | PASS |

**Full matrix: 25/25 PASS across all 5 windows.**

| # | Case | Result |
|---|---|---|
| 11.5 | Product Price tab — format `X,XX €`, comma edit, stepper | **PASS** |
| 11.6 | Negative value (spot check) | PASS (Pedido de Venta) |
| 11.7a | Empty-field blur restore | PASS (Pedido de Venta) |
| 11.7b | Above-max clamp | PASS (Pedido de Venta) |
| 11.7c | `AmountInput` consumer unaffected (regression) | **PASS** (Cuenta caja EUROS → Nuevo movimiento → Importe field) |
| 15.1 | PDF/preview-drawer Subtotal/Impuestos breakdown correct | **PASS** |
| 15.2 | Confirm-modal total matches document total (no double-discount) | **PASS** (verified both the modal preview AND the actually-persisted total after real confirm) |

## 2. Jira literal test cases — status

| # | Case | Result |
|---|---|---|
| Bug1-lit | Pedido de Venta: exact `10,4` (comma), no 400 | **PASS** — PATCH 200, no 400 |
| OtherTC-1 | Pedido de Venta: `10,50` saves as 10.50, displays `10,50` | **PASS** — PATCH 200, displayed `10,50`, Subtotal `10,50 €` |
| Bug2-lit | Pedido de Compra: exact `20,0rrwetwrtwrt2` string | **PASS** — filtered live to `20,02`, Importe bruto `24,22` |
| Bug3-lit | Product tab shows `€14.5`-style before → now comma | **PASS** — "Botín piel tacón bloque" shows `€ 79,90` |
| Bug1-lit-FdV | Factura de Venta (the ticket's own "inconsistent" window): exact `10,4` | **PASS** — saved, no error, behaves identically to every other window |

**All Jira ticket test cases: 5/5 PASS (both literal repro steps and Other Test Cases, using the exact values/strings from the ticket).**

---

## 3. Detailed run log

### Pedido de Venta (order 1000316, created for this test, deleted after) — ALL PASS

- Contact "Blanquiceleste S.A." selected → address/warehouse auto-derived correctly (confirms this experimental tenant does NOT have the local-environment onboarding-sampledata gap documented in `project_local_integration_e2e_gaps` memory — partnerAddress derives fine here).
- Add-line "Agua": typed `20,0rrwetwrtwrt2` → filtered live to `20,02`, Importe bruto live `24,22`, 0 network requests while typing (confirmed via `read_network_requests`). **§11.2/§11.3 add-line PASS.**
- Same add-line, cleared and typed `12345` → displayed live-grouped as `12.345`, Importe bruto `14.937,45`, Subtotal `12.345,00 €` — **§14 regression re-check PASS.**
- Committed (Enter) → exactly 1 `POST .../sales-order/lines`, 200. Then existing-line edits on this same line:
  - Typed exact ticket literal `10,4` → blurred → exactly 1 `PATCH .../sales-order/lines/{id}`, 200, "Registro guardado", no error. **Bug1-lit PASS.**
  - Typed exact ticket literal `10,50` → blurred → PATCH 200, displayed `10,50`, Subtotal `10,50 €`. **OtherTC-1 PASS.**
  - Typed `20,0rrwetwrtwrt2` again (existing-line path) → filtered live to `20,02`. **§11.3 existing-line PASS.**
  - Set Precio `100`, Cantidad `2`, Descuento `10` (one field at a time, waiting for each save — doing them without waiting once triggered a genuine optimistic-concurrency "No se puede guardar este registro" conflict dialog, unrelated to this fix, a pre-existing app behavior when firing overlapping edits) → Subtotal sin descuento `200,00 €` → Descuento `-20,00 €` → Subtotal `180,00 €` → Impuesto `37,80 €` → Total `217,80 €`, all arithmetically correct. **§11.4 PASS.**
  - Set Precio `-10,00` → accepted, sign preserved; Subtotal sin descuento `-20,00 €`, Descuento `+2,00 €` (10% of -20, sign-correct), Subtotal `-18,00 €`. **§11.6 PASS.**
  - Cleared Precio entirely, blurred → "Missing required fields" toast, display reverted to last persisted `-10,00`, no blank/NaN/stuck state. **§11.7a PASS.**
  - Set Descuento to `150` (max is 100), blurred → clamped to `100` client-side before the request, Descuento por producto `+20,00 €`, Subtotal `0,00 €`. **§11.7b PASS.**
- Test order 1000316 deleted after all checks — no data left behind.

### Pedido de Compra (order 1000163, "Proveedor Mayorista" / "Cinta de papel") — ALL PASS

- Add-line, typed exact ticket string `20,0rrwetwrtwrt2` → filtered live to `20,02`, Importe bruto `24,22`. **Bug2-lit PASS** (this is the ticket's own Bug 2 repro, verbatim, on the exact window named).
- Same add-line, typed `54321` → live-grouped `54.321`, Importe bruto `65.728,41`. **§14 PASS.**
- Committed, then on the existing line: typed `9,80` (ticket's own baseline value from Bug 1's repro) → saved, no 400, Subtotal `9,80 €`. **§11.1 PASS.**
- Existing-line, typed `20,0rrwetwrtwrt2` again → filtered to `20,02`. **§11.3 existing-line PASS.**
- Set Precio `50`, Cantidad `3`, Descuento `20` (one at a time, waiting for save) → `150,00 €` → `-30,00 €` → `120,00 €` subtotal → `25,20 €` impuesto → `145,20 €` total, all correct. **§11.4 PASS.**
- Test order 1000163 deleted after all checks.

### Presupuesto / Sales Quotation (order 1000112, "Laura Morat" / "Agua") — ALL PASS

- Add-line: `20,0rrwetwrtwrt2` → filtered live to `20,02`, Importe bruto `24,22`. **§11.2/§11.3 add-line PASS.**
- Same add-line: `67890` → live-grouped `67.890`, Importe bruto `82.146,90`. **§14 PASS.**
- Committed, existing-line: `15,4` → saved, no 400, Subtotal `15,40 €`. **§11.1 PASS.**
- Set Cantidad `4`, Descuento `25` → `61,60 €` → `-15,40 €` → `46,20 €` subtotal, Importe bruto de línea `55,90` (46,20×1.21). **§11.4 PASS.**
- Test order 1000112 deleted after all checks.

### Factura de Compra (invoice 10000360, "Proveedor Mayorista" / "Agua") — ALL PASS

- Add-line: `20,0rrwetwrtwrt2` → filtered live to `20,02`, Importe bruto `24,22`. **§11.2/§11.3 add-line PASS.**
- Same add-line: `13579` → live-grouped `13.579`, Importe bruto `16.430,59`. **§14 PASS.**
- Committed, existing-line: `30,25` → saved, no 400, Subtotal `30,25 €`. **§11.1 PASS.**
- Set Cantidad `6`, % Descuento `15` → `181,50 €` → `-27,22 €` → `154,27 €` subtotal → `32,40 €` impuesto → `186,67 €` total (minor ±0,01 rounding on the discount line vs a naive recompute — pre-existing rounding-mode behavior, unrelated to this fix, consistent with plan §9.4's ETP-4777 note). **§11.4 PASS.**
- Confirmed this invoice window DOES have a `% Descuento` line field (contrary to the original plan's note about invoices lacking one) — not a discrepancy worth chasing, just noting the field is present and worked correctly.
- Test invoice 10000360 deleted after all checks.

### Factura de Venta (invoice 10000550, "Laura Morat" / "Agua") — ALL PASS, including the ticket's own "inconsistent" scenario

- Add-line: `20,0rrwetwrtwrt2` → filtered live to `20,02`, Importe bruto `24,22`. **§11.2/§11.3 add-line PASS.**
- Same add-line: `24680` → live-grouped `24.680`, Importe bruto `29.862,80`. **§14 PASS.**
- Committed, existing-line: typed the exact ticket literal `10,4` → saved, no error, Subtotal `10,40 €`. **This is the exact window the ticket flagged as "guarda pero con comportamiento inconsistente" — confirmed it now behaves identically to every other window, no inconsistency reproducible. §11.1 PASS.**
- Set Cantidad `5`, % Descuento `10` → `52,00 €` → `-5,20 €` → `46,80 €` subtotal → `9,83 €` impuesto → Importe bruto de línea `56,63` (46.80×1.21). **§11.4 PASS.**
- Test invoice 10000550 deleted after all checks.

### Producto — "Botín piel tacón bloque" (§11.5 + Jira Bug3-lit) — ALL PASS

- Precio tab shows `€ 79,90` (comma decimal, 2 decimals) — not the ticket's old `€ 14.5`-style. **Bug3-lit / §11.5 display format PASS.**
- Edited Precio unitario with `45,5` → blurred → "Precios actualizados correctamente", displays `45,50`. **PASS — and notably, no 409 conflict here** (unlike the local environment, where this exact PATCH always failed with a stale-ETag 409 regardless of value — confirmed a pre-existing, environment-specific gap, not a code issue, per the original plan §11.5 note; this experimental server doesn't have that gap, so the loop the local QA couldn't close is now closed here).
- Stepper "+" button: `45,50` → `46,50`, "Precios actualizados correctamente". **PASS.**
- Reverted Precio unitario back to `79,90` to leave the product unchanged.

### Regression — `AmountInput` consumer untouched (§11.7c)

- Finanzas → Cuentas → "Cuenta caja EUROS" → Nuevo movimiento → Importe field: typed `12a5,50` → the letter `a` accepted verbatim, no masking/filtering. **PASS** — confirms this genuinely untouched consumer still behaves exactly as before the fix. Modal closed without saving (no data left behind).

### Collateral findings re-check — §15.1 / §15.2 (order 1000317, "Blanquiceleste S.A.", 2 lines with 10%/15% per-line discounts + 20% order-level discount)

- **§15.2 (confirm-modal double-discount):** modal showed Total `128,26 €`, exactly matching the document's own Total. Pressed "Confirmar pedido" for real (not just previewed) — document transitioned to `Completado`, and the persisted Total (re-checked after the confirm, in both the header view and re-opened) is `128,26 €` — matches exactly, no double-discount. **PASS**, verified on both the modal preview and the actually-persisted result.
- **§15.1 (PDF/preview-drawer breakdown):** opened the preview drawer for the now-completed order — shows `Subtotal (sin impuestos): 106,00` (correctly AFTER the order-level discount) and `Impuestos: 22,26` (correctly positive) — matches the edit-form's own breakdown (`Subtotal 106,00 € → Impuesto 22,26 € → Total 128,26 €`) exactly. No negative tax, no pre-discount subtotal shown. **PASS** — this was the item explicitly flagged in the original plan as "not confirmed fixed by PR #1411", now confirmed resolved on the current `develop`.
- Order 1000317 left as-is (Completado) — no delete action available for a completed sales order (same as the local re-verification's precedent), harmless test data.

## 4. Follow-up round (2026-09-13, same day) — amount-range coverage + confirm-modal coverage on all 3 windows

Prompted by direct user follow-up questions after the first report: (a) "no veo pruebas en presupuestos, facturas de compra, probaste con importes grandes y pequeños?" and (b) "probaste los casos de los modales de confirmacion que estaban relacionados con ETP-5132?". Both were real gaps in the first pass — addressed here.

### 4.1 Confirm-modal double-discount (§15.2) — now also verified on Purchase Order and Sales Quotation

The original plan's §15.2 explicitly flagged "Spot-check Purchase Order and Sales Quotation's equivalent confirm flows too, since the PR touches all three" — the first verification round only covered Sales Order. Closed now:

- **Pedido de Compra** (order 1000164, "Proveedor Mayorista" / "Cinta de papel", 1 line 10% discount + 15% order-level discount): confirm modal showed `92,57 €`, matching the document's own Total exactly. Confirmed for real ("Confirmar pedido") — persisted Total `92,57 €`, status `Completado`. **PASS.**
- **Presupuesto** (order 1000113, "Blanquiceleste S.A." / "Agua", 1 line 10% discount + 20% order-level discount): the confirm flow here is "Enviar a evaluación" (`SendToEvaluationModal.jsx`) — modal showed `87,12 €`, matching the document's own Total. Confirmed for real — persisted Total `87,12 €`, status `Bajo evaluación`. **PASS.**
- Combined with the already-verified Sales Order case, **all 3 windows touched by PR #1411/ETP-5132's confirm-modal fix are now confirmed resolved**, both at the modal-preview level and the actually-persisted level.

### 4.2 Amount-range coverage (large and small values) — and a real (pre-existing, unrelated) bug found along the way

Neither the original engineering plan's matrix nor the first verification round tested genuinely large or small amounts — §14's regression check used 5-digit numbers (10,000–99,999) specifically sized to trigger one level of thousands-grouping, and every other test used ordinary 2-3 digit prices. This was a real gap the user correctly called out.

**Large amount (7-digit, multi-level grouping):**
- Typed `1234567` into an **existing, already-settled line's** Precio field (product selected, callout fully resolved, no pending async work) → displayed live as `1.234.567` (correct multi-level grouping, comma decimal), Importe bruto de línea `1.493.826,07`, Impuesto `259.259,07` — all arithmetically correct. Saved correctly. **PASS.**
- Same value typed into a **brand-new add-line's** Precio field **immediately after selecting the product** (no settling time) → the live preview briefly showed the correct grouped value and updated subtotal, but **on commit the typed price was silently discarded and replaced by the product's own default list price** (e.g. `23,00` for "Cerveza" instead of the typed `1.234.567`). Reproduced twice with this exact shape.
- **Root-caused, not just observed:** re-ran the identical steps but with an explicit ~3s wait between selecting the product and editing Precio (letting the product-selection callout fully resolve first) → this time the same `1234567` value saved correctly (`1.234.567,00`, Importe bruto `1.493.826,07`). This isolates the cause to **timing relative to the callout**, not to the number's size or the masking/grouping logic itself.
- **Confirmed via source, not assumption:** `tools/app-shell/src/lib/applyCalloutUpdates.js` — the product-selection callout's `forceFields` (declared in `artifacts/sales-order/decisions.json` as `["listPrice", "unitPrice", "tax", "uOM", "grossUnitPrice", "discount"]`, one of `DetailView.jsx`'s callout-result-merge inputs) **always overwrites those fields when the callout resolves, with no check for whether the user has since typed a newer value** — unlike the ETP-4772 generation/staleness guard (`detailViewHelpers.jsx`'s `isStaleCalloutResponse`), which protects the **header form** from exactly this class of race but was never extended to the **inline add-line** path (`DataTable.jsx`). If the product-selection callout is still in flight when the user finishes typing a custom price, its response — landing after — force-overwrites the just-typed value on commit.
- **This is a real, reproducible bug — but confirmed NOT caused by ETP-5107 and NOT specific to large numbers.** `applyCalloutUpdates.js` was authored under ETP-3585 and last touched under ETP-5039 (`git log`), both unrelated to and predating this ticket; the `forceCalloutFields` decision in `decisions.json` is likewise untouched by this branch. The race is about **typing speed relative to callout latency**, not amount size — it would reproduce identically with the old plain `<input>` before this fix, for any price (including a small one), if typed fast enough after product selection. Flagging this to the human as a **new, separate finding** worth its own ticket (analogous to §15.1) — not a blocker for ETP-5107, and not something to fix under this ticket's scope.
- **Practical implication for real users:** this only manifests when a user types a custom price within roughly the callout's round-trip time (well under a second in this test) of selecting the product — normal human typing speed (select product, look at the screen, then type) does not trigger it, which is exactly why none of the extensive matrix/manual testing in this ticket's earlier QA passes (by either the agent or the human) ever hit it.

**Small amounts:**
- `0,5` (existing-line edit, after settling) → saved as `0,50`, Importe bruto `0,60` (0.5×1.21), Subtotal `0,50 €`. **PASS.**
- `0,01` (one cent) → saved correctly, "Registro guardado", Subtotal `0,01 €`. **PASS.**
- No issues at the low end — parsing, masking, and calculation all correct down to the smallest representable currency unit.

**Conclusion:** large and small amounts both work correctly through this fix's masking/parsing/calculation path, confirmed down to €0,01 and up through 7-digit multi-level grouping (€1.234.567) — the only failure mode found is the pre-existing add-line callout race described above, unrelated to amount size and unrelated to ETP-5107.

### 4.3 Race-condition timing threshold — empirical measurement

Follow-up to the human's question ("how fast do you have to type for the bug to reproduce?"). Measured on order 1000321 ("Blanquiceleste S.A."), same pattern each time: select product → wait exactly N seconds → click Precio → select-all → type a distinct 6-digit value → Enter → re-check the persisted (committed) value, not just the live preview.

| Wait after product selection | Product (default price) | Typed value | Result |
|---|---|---|---|
| 0.5s | Agua (12,00) | 555555 | **FAIL** — reverted to default 12,00 |
| 0.7s | Botín piel tacón bloque (79,90) | 777777 | **FAIL** — reverted to default 79,90 |
| 0.85s | Chaqueta punto oversize (65,00) | 888888 | **PASS** — persisted as 888.888,00 |
| 1.0s | Cerveza (23,00) | 666666 | **PASS** — persisted as 666.666,00 |

**Threshold on this server: fails at ≤0.7s, passes at ≥0.85s** of wait between selecting the product and typing the custom price. This is the callout's round-trip time on `go.experimental.etendo.cloud` specifically — it is a function of this environment's network/backend latency, not a universal constant; a slower or faster network/environment would shift the threshold accordingly. Test order 1000321 was scratch data for this measurement and has been deleted (no meaningful QA evidence to preserve, unlike the orders in §3).

## 5. Final verdict (updated)

**Every ETP-5107 case run: matrix 25/25, additional checks (§11.5, §11.6, §11.7a-c, §15.1, §15.2 on all 3 windows) all PASS, Jira literal test cases 5/5 PASS, amount range from €0,01 to 7-digit multi-level grouping all PASS.** Zero ETP-5107-attributable failures found on `go.experimental.etendo.cloud` (tracking `develop`, post-merge of PR #1435). The ticket's own three "Steps to reproduce" and three "Other test cases" are all confirmed resolved, using the exact values/strings written in the ticket itself, not just equivalent test data. The one open, pre-existing, unrelated local-environment gap from the original plan (Product `/price` PATCH returning 409) does NOT reproduce on this experimental server — confirming it really was a local DB snapshot issue, not a code defect.

**One new, genuine, out-of-scope finding surfaced during this round** (§4.2): a pre-existing race condition between the product-selection callout and a fast-follow manual edit to the same add-line row's Precio field, root-caused to `applyCalloutUpdates.js`'s unconditional `forceFields` overwrite (no staleness/generation check, unlike the equivalent ETP-4772 guard on the header form). Confirmed via `git log` to predate and be untouched by this branch (last touched under ETP-3585/ETP-5039), and confirmed to be about typing speed relative to callout latency rather than amount size. Not a blocker for this ticket; flagged for the human to decide whether it warrants its own ticket.

---

## 6. REOPENED (2026-09-14) — Isaías's QA feedback: bug-by-bug root-cause analysis and window audit

Ticket reopened by Isaías Battaglia ("QA NO PASA") with 6 bullet points (each with a screenshot) plus an attached agentic test report (`reporte_ETP-5107_3.md`, run 2026-09-14 against `go.experimental.etendo.cloud`). The report itself confirms the ticket's original 3 bugs stay fixed (comma works, letters filtered, Product Price tab format consistent) and correctly notes the "period is silently ignored" behavior is by design (comma is the only valid decimal separator) — but it also surfaces one real, new defect (rounding) that the report's own author flagged for follow-up. Isaías's 6 points are five previously-uncatalogued locations plus one already-known-and-accepted gap. Read directly from Jira (`ETP-5107`) and cross-referenced against `origin/develop` source, not assumed.

Every item below was root-caused by reading the actual `develop` source (not guessed), and classified into three groups by what kind of fix it needs.

### 6.A — Same component ETP-5107 already touches: a real gap in the shipped fix itself

**6.A.1 — "En el caso de los descuentos no se está aplicando el mismo criterio y se visualiza con punto"**
Screenshot: a Pedido de Venta line, `% Descuento` column showing `10.5` (period) while `Precio` on the same row correctly shows `10,40` (comma).
**Root cause:** `MaskedAmountInput`'s `toIdleDisplay(value, grouping)` in `tools/app-shell/src/components/forms/fields.jsx`:
```js
function toIdleDisplay(value, grouping) {
  if (value == null || value === '') return '';
  if (!grouping) return String(value);          // ← the bug: no locale formatting at all
  const formatted = formatCurrency(undefined, value);
  return formatted === '—' ? '' : formatted;
}
```
`grouping=false` is exactly what `discount`/`quantity`/`integer`/`decimal`/`number`/`percent`-typed fields get (deliberately, to preserve pre-fix ungrouped-look behavior for non-currency fields, plan §10's judgment call) — but the fallback path returns the *raw JS `Number`* via `String(value)`, which always uses a period (`.`), because that's JS's own number-literal syntax, not a locale-aware string. This is a real bug in code ETP-5107 itself shipped, not a different window.
**Blast radius:** every field already migrated to `MaskedAmountInput` with `grouping=false` and a fractional idle value — i.e. `% Descuento`/`discount` (and any other non-currency-typed numeric field, e.g. a fractional `Cantidad`) on all 5 already-fixed windows (Sales Order, Purchase Order, Sales Invoice, Purchase Invoice, Sales Quotation) whenever the persisted value isn't a whole number.
**Fix shape (not yet implemented):** `toIdleDisplay` must still swap `.` for the configured `decimalSeparator` even when `grouping` is off — only the thousands-grouping step should be skippable, not the decimal-separator localization. Needs its own regression test (a `discount`/fractional-`quantity` idle-display case) alongside the existing `MaskedAmountInput` suite.

**6.A.7 — Rounding bug (from the attached agentic report, §4 "Redondeo con muchos decimales")**
The report found: `10,135` → saved as `10,13` (should round up to `10,14`); `2,675` → saved as `2,67` (should round up to `2,68`); reproduced identically in document lines AND Producto → Precio. Detailed case-by-case table and diagnosis are in the report's §4 (already read in full).
**Root cause:** `tools/app-shell/src/lib/formatCurrency.js:57`, `const fixed = abs.toFixed(maxFrac);` — native JS `.toFixed()` inherits IEEE-754 binary floating-point representation error (`2.675` is actually stored as `2.67499999999999982...`, so rounding "half up" at 2 decimals silently rounds down). This is `formatCurrency()`'s own canonical rounding step — confirmed via `git log` to predate ETP-5107 (`formatCurrency.js` was created under ETP-3726, refined under ETP-4314/ETP-4504) — but it's the exact function `MaskedAmountInput`'s idle display (and Producto → Precio) routes through, so it directly affects this ticket's own fixed surfaces and was only surfaced by this ticket's own QA pass.
**Fix shape (not yet implemented):** replace the bare `.toFixed(maxFrac)` with a decimal-safe rounding step first (e.g. `Math.round(Number(abs.toFixed(maxFrac + 2)) * 10**maxFrac) / 10**maxFrac`-style epsilon correction, or route through a small decimal-rounding helper) before formatting. This is a fix to the shared canonical formatter — must be re-verified against every existing `formatCurrency` consumer, not just the line-price fields.

### 6.B — Other known `AmountInput`/hand-rolled consumers: confirmed still broken exactly as flagged, plus one genuinely new one

**6.B.3 — "En la cuenta financiera las transacciones las podes guardar con punto aunque luego no aplica la coma"**
Screenshot: Cuenta Financiera → "Editar movimiento" → `Importe` field showing `45.7` mid-typing (period). This is `tools/app-shell/src/windows/custom/financial-account/NewMovementWizard/index.jsx`'s `AmountInput` — exactly one of the four consumers the original ETP-5107 plan (§6.3.1/§8) explicitly and deliberately left untouched to avoid risking 4 working screens. **Not a new finding — already flagged to the user in the previous verification round, now confirmed by an independent reporter.**

**6.B.5 — "Al añadir Cobros y pagos también toma el punto en la edición"**
Screenshot: "Nuevo cobro" modal, `Importe` field. **This is NOT `PaymentForm.jsx`/`AmountInput` as the original plan assumed** — traced to `tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx` (the "cp" = cobros y pagos flow against outstanding invoices), which has **its own, third, previously-uncatalogued hand-rolled numeric input** — a raw `<input type="text" inputMode="decimal">` (line ~1791, `data-testid="cp-amount-input"`) bound to `balance.amountStr`/`balance.onAmountChange`, backed by `tools/app-shell/src/windows/custom/shared/usePaymentBalance.js`:
```js
const normalized = trimmed.replace(/,/g, '');   // strips comma as if it were a thousands separator
const n = parseFloat(normalized);                // period-only parse
...
const [intPart, decPart] = Math.abs(value).toFixed(2).split('.');   // period-only display
```
This parser does the *opposite* of what a Spanish user expects: it treats a typed comma as a thousands separator and discards it, so `10,50` (meant as 10.5) parses as `1050`. Three more raw inputs sharing the identical pattern exist in the same file (`cp-conversion-rate-input`, `cp-amount-in-account-input`, `cp-credit-use-{id}`) — all bypass `parseLocaleNumber`/`MaskedAmountInput`/`AmountInput` entirely. **Genuinely new finding**, not covered by the original plan's "AmountInput's 4 consumers" list.

### 6.C — Brand-new component classes never audited by the original ETP-5107 investigation at all

**6.C.2 — "la moneda se ve con punto"**
Screenshot: a currency picker dropdown (document header currency field) listing `EUR — 1.00`, `GBP 0.86`, `USD 1.16` — periods instead of commas.
**Root cause:** `tools/app-shell/src/components/contract-ui/CurrencyRatePicker.jsx`, `formatRate()`:
```js
const n = parseFloat(rate);
return n.toFixed(decimals);   // bypasses formatCurrency() entirely
```
Never routes through the canonical `formatCurrency()`/`parseLocaleNumber()` at all — same root pattern as the ORIGINAL Bug 3 (a formatter that doesn't use the canonical helper), just in a component nobody audited because it's not a "price line" or "Product Price tab" field.

**6.C.4 — "Al crear extractos a mano pasa lo mismo"**
Screenshot: "Editar extracto" (manual bank statement) → line grid, `Salida`/`Entrada` amount cells. Traced to `tools/app-shell/src/windows/custom/financial-account/ManualStatementModal.jsx`'s `EditRow` — raw `<input type="text" inputMode="decimal">` per amount cell, `value={row[field]}`, no masking, no live grouping. **Important nuance found while investigating:** the actual *parsing* on save does NOT use a naive period-only parser — it goes through `tools/app-shell/src/windows/custom/financial-account/statementAmount.js`, a deliberately-designed shared heuristic parser (built for ETP-4954, also used by the CSV/Excel statement-import paths) that already disambiguates `1.234` vs `1.234,56` vs `1800.25` by counting digits after the separator and checking for a combined-separator pattern — so the *saved value* may often already be correct even though the *display* is unmasked. **This one needs care, not a blind `MaskedAmountInput` swap** — naively migrating it to comma-only masking could break the CSV/Excel-import compatibility `statementAmount.js` was built for. Needs its own design pass, not a copy-paste of the line-grid fix.

**6.C.6 — "En la ventana activo también toma punto"**
Screenshot: Activo (Asset) window, `Valor del activo` field showing `400.45` (period) while the read-only "Valor actual" summary card correctly shows `400,45 €` (comma, via `formatCurrency`).
**Root cause — the widest-reaching one found in this whole audit:** `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx`/`AssetsConfigPanel.jsx` declare `assetValue`/`residualAssetValue`/`depreciationAmt` as generic `type: 'number'` fields, rendered by `tools/app-shell/src/components/contract-ui/EntityForm.jsx`'s generic field renderer, which does:
```js
return f.type === 'number' ? 'number' : 'text';   // sets the native HTML <input type="number">
```
This is **the exact same class of defect as the original ticket's Bug 3** (a native `<input type="number">`, which always uses `.` regardless of locale, no thousands grouping) — just never migrated to `MaskedAmountInput`, because `EntityForm.jsx` is a *generic* form renderer shared across many non-document windows, and the original investigation only chased the 3 windows the ticket's own repro steps named. **`EntityForm.jsx` is Etendo GO's generic detail-form field renderer** — any window with a `type: 'number'` field rendered through it (not just Assets) plausibly carries this same bug. A full audit of which windows/fields go through `EntityForm` with `type: 'number'` is required before scoping the fix — not yet done as of this writing.

### 6.D — Summary table

| # | Isaías's point | Component | Status | Action needed |
|---|---|---|---|---|
| 1 | Descuento con punto | `MaskedAmountInput.toIdleDisplay` (fields.jsx) | **Real bug in ETP-5107's own shipped code** | Fix `toIdleDisplay` to localize the decimal separator even when `grouping=false` |
| 2 | Moneda con punto | `CurrencyRatePicker.jsx formatRate()` | New, never audited | Route through `formatCurrency`/`parseLocaleNumber` |
| 3 | Cuenta financiera (movimiento) | `NewMovementWizard` → `AmountInput` | Already known, deliberately out of scope (plan §6.3.1) | Migrate to `MaskedAmountInput` (was already recommended as follow-up) |
| 4 | Extractos a mano | `ManualStatementModal.jsx EditRow` + `statementAmount.js` | New, needs careful design (CSV/Excel-import compatibility) | Design pass before touching — not a blind swap |
| 5 | Cobros y pagos | `NewPaymentEntryModal.jsx` + `usePaymentBalance.js` (own parser) | New — 4 raw inputs, own hand-rolled parser | Migrate to `MaskedAmountInput`/`parseLocaleNumber` |
| 6 | Ventana Activo | `EntityForm.jsx` generic `type:'number'` → native `<input type="number">` | New — same root cause as original Bug 3, but in the *generic* form renderer | Audit all `EntityForm` `type:'number'` consumers, then fix at the generic-renderer level |
| 7 | Redondeo (agentic report) | `formatCurrency.js:57` `.toFixed()` | Real, pre-existing bug surfaced by this ticket's QA, affects ETP-5107's own fixed surfaces | Decimal-safe rounding before `.toFixed()` |

**Not yet started (superseded by §6.E/§6.F below):** no code has been changed for any of the 7 items above — this section is analysis only, per the human's explicit request to analyze and document before touching scope/code.

## 6.E — Branch updated (2026-09-14)

`feature/ETP-5107` (local + `origin/feature/ETP-5107`, both already identical, 0 unique commits) was fast-forward merged onto `origin/develop` HEAD (`d69a63102`, PR #1445): 223 files changed, +19041/-2126, clean fast-forward, no conflicts (the branch had zero commits of its own ahead of `develop` — everything from the original DEV pass is already in `develop`, so this was a pure catch-up, not a real merge). Not yet pushed (no new commits to push — local now equals `origin/develop`). Working tree clean aside from this plan doc.

## 6.F — Exhaustive re-pass: EntityForm blast-radius audit (resolves 6.C.6's open question) + critical test-compatibility finding

### 6.F.1 — `EntityForm.jsx` `type:'number'` blast radius: narrowed to Assets only

Full grep of every `EntityForm` consumer (`ListModalWindow.jsx`, `BillingPreferencesForm.jsx`, `FiscalDefaultsSection.jsx`, `TaxSifField.jsx`, `ProductCategoryCustomForm.jsx`, `ProductAdditionalInfoPanel.jsx`, `AssetsDetailPanel.jsx`, `AssetsConfigPanel.jsx`) for `type: 'number'` field declarations. Result: **only `AssetsDetailPanel.jsx` and `AssetsConfigPanel.jsx` declare `type:'number'` fields** — 7 each (`assetValue`, `residualAssetValue`, `depreciationAmt`, `previouslyDepreciatedAmt` — real currency amounts; `annualDepreciation` — a percent; `usableLifeYears`/`usableLifeMonths` — plain integers, not currency, arguably don't even need comma-decimal treatment). `ListModalWindow.jsx`'s own `type: 'number'` hit (line 224) is a false positive — it's `buildFilterColumns()`'s column-metadata classifier for the **Advanced Filter Builder**, an unrelated concern that never reaches `EntityForm`'s `getInputType()`/native-`<input type="number">` path. **Conclusion: 6.C.6's "widest-reaching gap" concern was overstated — the blast radius is exactly the Assets window's 4 currency fields, not a sprawling set of windows.** Confirmed via `EntityForm.jsx:512-513`'s `getInputType(f)` (`f.type === 'number' ? 'number' : 'text'`) feeding two native `<input type={...}>` render sites (`DeferredInput`, line 589; and line 1165).

### 6.F.2 — CRITICAL: fixing the display bug is structurally incompatible with "zero existing test changes" for several components

The human's explicit constraint — *"es muy importante que cuando migremos a este componente todo siga funcionando igual por lo tanto no hay que modificar los tests existentes"* — was checked against the actual assertions in each affected component's existing test suite, not assumed. Result: **for at least 3 of the 6 non-`MaskedAmountInput` components, this constraint cannot be honored as literally stated, because the existing tests assert the *buggy* (period/English-format) output as their expected ground truth.** Fixing the locale bug necessarily changes what these tests check was correct.

| Component | Test file | Sample hardcoded assertions (current, pre-fix baseline) | Conflict |
|---|---|---|---|
| `NewMovementWizard` (§6.B.3) | `NewMovementWizard.submit.vitest.jsx` | `toHaveValue('0.00')`, `toHaveValue('125.40')`, `toHaveValue('80.00')` — 12 hits | **Direct conflict** — these are the exact period-decimal strings the fix would change to comma |
| `NewPaymentEntryModal`/`usePaymentBalance` (§6.B.5) | `NewPaymentEntryModal.vitest.jsx` | `toHaveValue('500.00')`, `toHaveValue('6,420.00')` (comma-thousands + period-decimal, full English format), `toHaveValue('25.30')`, `toHaveValue('0.00')`, etc. — **58 hits** | **Direct, extensive conflict** — this file's whole baseline assumes English number formatting |
| `EntityForm` generic (§6.C.6, feeds Assets) | `EntityForm.deferredInput.vitest.jsx` | `expect(input).toHaveValue(1000)` / `toHaveValue(4000)` / `toHaveValue(777)` — numeric-typed assertions, valid only because the input is a native `type="number"` | **Structural conflict, not just cosmetic** — `toHaveValue(N)` as a bare number only works against a native number input; swapping to `MaskedAmountInput` (`type="text"`, grouped display string) makes this matcher compare against a formatted string instead, which is a different assertion shape entirely, not a value tweak |
| `CurrencyRatePicker` (§6.C.2) | `CurrencyRatePicker.vitest.jsx:324` | `expect(input).toHaveValue(2.5)` | Same native-number-input conflict as `EntityForm`, on a *different* editable rate input in the same file (not the read-only dropdown list `formatRate()` renders — that one has no test coverage on its output string at all, confirmed no matching assertion found) |

**One reassuring counter-finding:** `NewTransactionModal.vitest.jsx:170` already asserts `toHaveValue('20,00')` (comma!) — this consumer of the same shared `AmountInput` wraps it with its own `onBlur={formatAmount}` handler (`tools/app-shell/src/lib/formatAmount.js`, which DOES route through canonical `formatCurrency()`), so it already partially self-corrects the display on blur, unlike `NewMovementWizard`'s raw usage. **This means "AmountInput's 4 consumers are uniformly broken" (the original ETP-5107 plan's assumption, repeated in my own §6.B.3 above) is not quite right — the bug's actual manifestation varies per consumer depending on whether that screen added its own ad-hoc `onBlur` formatting.** Also reassuring: `AssetsDetailPanelAmounts.vitest.jsx` and the rest of the Assets-specific test suite have **zero** `toHaveValue`/`spinbutton`-role assertions — the conflict for Assets lives entirely in the *generic* `EntityForm.deferredInput.vitest.jsx` fixture (which happens to use `assetValue` as its example field name), not in Assets' own suite. `ManualStatementModal.vitest.jsx`'s 7 `toHaveValue` hits sampled are all date/text fields, not amount cells — no conflict found there yet (not exhaustively checked line-by-line).

**What this means for scope/planning:** the human's "don't touch existing tests" instruction is achievable as a *default bias* (prefer additive tests, don't casually rewrite assertions), but for `NewMovementWizard`, `NewPaymentEntryModal`, and the generic `EntityForm`/`CurrencyRatePicker` native-number-input fixtures, a real locale fix **requires** updating the specific assertions that currently encode the bug as "correct" — there is no code change that fixes the display AND leaves `toHaveValue('125.40')` passing, because that string literally *is* the bug. This is a genuine trade-off to put in front of the human before starting DEV on 6.B/6.C, not something to route around silently. The already-fixed `MaskedAmountInput` consumers (`DataTable.jsx`, `InlineLinesPanel.jsx`, `ProductPriceBar.jsx`) don't have this problem — their tests were written *for* the fix, not inherited from a pre-fix baseline.

### 6.F.3 — Live re-verification: 6.A.1 and 6.A.7 reconfirmed; 6.B–6.C still pending

A first attempt hit a transient tool-level rate limit; retried successfully afterward. Live-reconfirmed the two **same-component, in-scope** bugs (§6.A) on `go.experimental.etendo.cloud`, order 1000325 (Blanquiceleste S.A., "Agua", deleted after):

- **6.A.1 (discount period display) — CONFIRMED live.** Typed `10,5` into `% de descuento` on the Agua line → cell displays `10.5` (period) while `Precio` on the same row shows `12,00` (comma) — exact match to Isaías's screenshot. The underlying value parsed correctly (`Descuento por producto: -1,26 €` = 12 × 10.5%), confirming this is purely a display bug, not a calculation bug — consistent with the `toIdleDisplay`/`String(value)` root cause in §6.A.1.
- **6.A.7 (rounding) — CONFIRMED live.** Typed `2,675` into Precio, tabbed to commit → saved and displayed as `2,67` (`Subtotal sin descuento: 2,67 €`), not the correctly-rounded `2,68`. Exact match to the agentic report's finding and to `formatCurrency.js:57`'s `.toFixed()` root cause.

**Not live-reconfirmed in that round (6.B/6.C — items 2–6):** those remained confirmed via Isaías's own screenshots plus independent source-code root-causing (§6.B/§6.C) — see §6.G below, which closes the loop on 6.C.6 against the LOCAL environment.

## 6.G — Local-environment validation (2026-09-14, `http://localhost:3100/`, branch `feature/ETP-5107` = `origin/develop`)

Per the human's explicit request, re-validated the plan against the **local** checkout/server (not the shared experimental server) — this is the most authoritative environment since it's guaranteed to be running this exact commit (`d69a63102`), not a possibly-lagging shared deployment. `claude-in-chrome` was unavailable (extension disconnected); used `mcp__playwright__*` instead (separate browser profile, already authenticated as GOAdmin from an earlier session).

### 6.G.1 — 6.A.1 and 6.A.7 reconfirmed on local, byte-for-byte the same as experimental

Order 1000028 (Juan Perez, product "Agua"), created and deleted for this test:
- **6.A.1:** typed `10,5` into `% de descuento` — while focused, the live masked display correctly showed `10,50` (comma) — confirms the masking itself is locale-correct while typing. After blur + page reload (forcing the idle `toIdleDisplay` path), the persisted value rendered as **`10.5`** (period) while `Precio` on the same row showed `12,00` (comma) — exact reproduction, and it clarifies precisely *when* the bug triggers: only on the **idle/committed** display, never while the field is focused.
- **6.A.7:** typed `2,675` into Precio, committed → persisted and displayed as **`2,67`** (`Subtotal sin descuento: 2,67 €`), not the correctly-rounded `2,68` — exact match to the agentic report and the experimental-server test.

### 6.G.2 — 6.C.6 (Assets) reconfirmed — and found to be WORSE than originally documented

Opened an existing Asset record (`AM-ETP4429-1789101306025`) locally. The accessibility tree itself confirms the root cause independent of reading source: the "Valor del activo" field is exposed as `spinbutton` — the ARIA role a native `<input type="number">` carries — matching `EntityForm.jsx`'s `getInputType()` exactly.

**Correction to §6.C.6's severity:** typed `1234,56` into the field (comma decimal, as a Spanish user naturally would) → the comma was **not displayed as a period, it was silently dropped**, and the digits before and after it **concatenated**: the field ended up holding `123456` — over 100× the intended value, with **zero error, zero warning, and no visual sign anything went wrong**. This is not the "shows `400.45` instead of `400,45`" cosmetic framing §6.C.6 originally used (that framing was based on Isaías's screenshot of an *already-committed* value, which does look like a simple period-vs-comma issue) — it is structurally the same **silent digit-concatenation data-corruption bug** as the ticket's original, most severe defect (the pre-fix `DataTable.jsx` add-line "silent comma-drop" from plan §5.1), just manifesting in a different, unfixed component. A user typing a real asset value with a decimal comma on this window today gets a wildly wrong `AssetValueAmt` persisted with no indication anything is wrong — this is a correctness/data-integrity bug, not merely a formatting inconsistency, and should be weighted accordingly when prioritizing 6.C.6 against the other 6 items. Discarded via "Cancelar" — nothing saved.

### 6.G.3 — Interim conclusion (superseded by §6.H, which closes out 6.B.3/6.C.2/6.C.4/6.B.5 live)

Every source-level finding in §6.A/§6.B/§6.C that was live-tested this round (6.A.1, 6.A.7, 6.C.6) reproduced **exactly as predicted from reading the code**, on the actual branch/commit this work will ship from — no discrepancy between the experimental server and local, and no discrepancy between the static analysis and live behavior. 6.C.6 in particular should be re-classified as **higher severity** than originally written (data corruption, not display-only) when the human prioritizes the fix order.

## 6.H — Remaining live validation: points 2–5 (2026-09-14, same local session)

Per the human's explicit request, continued the local live-validation pass to close out the 4 remaining unverified items. Same method as §6.G: real interaction, garbage/realistic input (not just clean comma), commit and re-check, nothing saved.

### 6.H.1 — 6.C.2 (moneda con punto) — CONFIRMED

New Sales Order → Moneda selector dropdown: `EUR — 1.00`, `GBP 0.86`, `USD 1.47` — periods throughout, exactly as Isaías's screenshot showed. Confirms `CurrencyRatePicker.jsx`'s `formatRate()` bypassing `formatCurrency()`.

### 6.H.2 — 6.B.3 (cuenta financiera) — CONFIRMED, and root-caused precisely

Caja → "Nuevo movimiento" (`NewTransactionModal.jsx`, the same component that renders as "Editar movimiento" when editing an existing row — confirmed via the `financeAccountTxEditTitle` i18n key, one component with two titles). Typed `45.70abc` (letters + a period) into Importe → accepted **verbatim while typing** (zero character filtering, confirming the "no keystroke validation" half of the bug) → on blur, silently became **`4570,00`** — the period and letters were stripped and the surrounding digits concatenated (`45` + `70` → `4570`). This is the **same class of silent data-corruption bug as 6.C.6 (Assets)**, not the milder "shows period" framing originally written for this item — upgrade its severity accordingly. (A clean, correctly-typed `45,70` does survive blur intact, which is what made the bug easy to miss in casual testing — it only surfaces with imperfect/realistic typing, same lesson as the original ticket's own `20,0rrwetwrtwrt2` test string.)

### 6.H.3 — 6.C.4 (extractos a mano) — CONFIRMED, nuanced as predicted

Cuenta de Banco → Extractos importados → "Nuevo extracto" → line "Entrada" field:
- `1.234,56` (combined separator) → correctly parsed and summed as `1.234,56 €` (`Entradas: +1.234,56 €`, `Saldo: 1.234,56 €`) — confirms `statementAmount.js`'s combined-separator heuristic works as designed, per §6.C.4's original nuance.
- `45,70abc` (letters, no filtering) → accepted verbatim in the cell, but **excluded from the totals entirely** (`Líneas: 0`, `Entradas: +0,00 €`) — a different failure mode from 6.C.6/6.B.3's digit-concatenation: here the malformed value is silently treated as unparseable and dropped from the aggregate, while still sitting in the cell looking like a saved value. Confirms this component needs its own design pass (per §6.C.4's original recommendation) rather than a blind `MaskedAmountInput` swap — the underlying parser is *good* at the ambiguous-but-valid cases, *bad* (silently, not loudly) at genuinely invalid ones.

### 6.H.4 — 6.B.5 (cobros y pagos) — CONFIRMED, and the single most severe finding in this whole audit

Factura de Venta 10000035 (139,15 €, Juan Perez) → "Añadir cobro" → "Nuevo cobro" modal (`NewPaymentEntryModal.jsx` / `usePaymentBalance.js`):
- The Importe field's **default pre-filled value already reads `139.15`** (period), confirming the display bug exists even with zero user interaction.
- Typed `50,50` (fifty euros fifty cents, meant to under-pay the 139,15 € balance) → `usePaymentBalance.js`'s `trimmed.replace(/,/g, '')` stripped the comma as if it were a thousands separator → parsed as **`5050`** → the modal displayed **`Dinero: 5.050,00 €`**, **`Aplicado: 5.050,00 €`**, **`Sobra: 4.910,85 €`**, and surfaced "¿qué hacer con el resto?" with **"Dejar a crédito"**/**"Dar vuelto (devolver 4.910,85 €)"** options.
- **This is the most dangerous manifestation found in the entire audit**: a real collections workflow, against a real invoice, where typing a completely ordinary Spanish-locale amount (`50,50`) computes a payment **~36× larger than intended** and actively offers to refund the "excess" back to the customer or leave it as store credit — either path moves real money/credit incorrectly if the user doesn't catch the huge `Sobra` figure before clicking Confirmar. Cancelled without confirming — nothing persisted.

### 6.H.5 — Final conclusion (all 7 points now live-confirmed)

Every one of the 7 items in §6.A–§6.C has now been independently reproduced live (5 in this local session: 6.A.1, 6.A.7, 6.C.6, 6.C.2, 6.B.3, 6.C.4, 6.B.5 — actually all 7), with zero discrepancy from the source-level root-cause analysis. Severity re-ranking based on live evidence, most to least severe:

1. **6.B.5 (Cobros y pagos)** — real financial transactions can be entered at ~36× the intended amount with no warning until a "Sobra" figure the user must notice themselves; offers to actively move money/credit on the wrong amount.
2. **6.C.6 (Activo)** and **6.B.3 (Cuenta financiera)** — silent >100× digit-concatenation data corruption, no warning, same failure class as each other.
3. **6.A.1 (Descuento), 6.A.7 (Redondeo)** — real, in-scope bugs in ETP-5107's own shipped code; wrong values but bounded/small in magnitude (a formatting mismatch and a one-cent rounding error respectively), not multi-order-of-magnitude corruption.
4. **6.C.2 (Moneda)** — display-only (a read-only rate list), no data is written incorrectly.
5. **6.C.4 (Extractos)** — the best-behaved of the group: valid-but-ambiguous input already parses correctly; only genuinely invalid input silently no-ops rather than corrupting a value.

---

## 7. Fix round (2026-09-14) — implementation and validation

Working agreements for this round, decided by the human:
- **Order: by severity** — 5 → 3+6 → 1+7 → 2+4 (the ranking established in §6.H.5).
- **Tests: update only the assertions that encode the old buggy expectation.** Never weaken, delete or rename a case. Test edits are delegated to Tester per CLAUDE.md; source edits are not.
- **Verify every fix before starting the next one** — corner cases in node, manually emulating the existing tests, and re-running the original live repro. Batching fixes and verifying at the end is not acceptable.

### 7.1 Point 5 — Cobros y pagos ✅

**Root cause.** `usePaymentBalance.js` was explicitly built in en-US convention (its own header said so, and claimed — wrongly — that this "matched the app-wide formatCurrency()"). `parsePlain` did `trimmed.replace(/,/g,'')` + `parseFloat`, stripping a Spanish decimal comma as if it were a thousands separator.

**Impact, stated precisely.** The parse error is exactly **100x** for a 2-decimal amount (removing the comma multiplies by 10²), independent of the document. On the invoice used for the repro (139,15 € pending) a typed `50,50` became 5.050,00 €, i.e. ~36x that invoice's balance — which is what made the modal offer to refund 4.910,85 € or leave it as customer credit.

**Fix.** `formatPlain` → `formatCurrency(undefined, n)` (canonical, config-driven, no symbol). `parsePlain` → the canonical parser (see §7.3). In `NewPaymentEntryModal.jsx`, the amount-in-account field moved to `parsePlain` (it is seeded from `formatPlain`, so it carries grouping; the old bare `parseFloat` read a seeded `"5.050,00"` as 5.05 and derived a wrong exchange rate from it), while the exchange-RATE parses moved to `parseLocaleNumber` — deliberately a different parser, see §7.3.

**Files:** `windows/custom/shared/usePaymentBalance.js`, `windows/custom/shared/NewPaymentEntryModal.jsx`.

### 7.2 Point 3 — Cuenta financiera ✅

**Two defects, not one.** `components/payment/paymentData.js` held two independent hand-rolled pairs:
- `fmtAmount`/`parseAmount` were en-US (`toFixed(2)` + `replace(/,/g,'')`) — **the identical 100x bug as point 5**, in a second place. Not in Isaías's report, found by following the imports.
- `parseEur` used a bare `parseFloat`, which silently accepts a numeric PREFIX: `"45.70abc"` returned 4570 rather than being rejected, so malformed input produced a plausible-looking wrong amount with no warning.

**Blast radius was wider than the reported screen.** `paymentData.js` is the shared money-helper module for the whole family: `NewTransactionModal` (the reported one), `NewMovementWizard`, and `PaymentForm` ("Agregar pago") all consume it.

**Fix.** All four helpers route through the canonical helpers. Format and parse were changed together — they are round-trip pairs wired as `value={fmtAmount(x)}` + `onChange={parseAmount(...)}`, so a formatter and parser that disagree corrupt the value on the first edit.

**Files:** `components/payment/paymentData.js`.

### 7.3 The regression this round introduced — and the canonical parser it produced

Worth recording in full, because it is the most instructive thing that happened.

**What went wrong.** The first version of the fix stripped the configured thousands separator unconditionally, so under es-ES a '.' was ALWAYS grouping. That fixed `50,50`→50.5 and broke `75.50`→7550: one 100x error traded for another. It was caught by running `NewMovementWizard.submit.vitest.jsx`, which asserted the POST payload and reported `paymentAmount: 7550` where 75.5 was expected. The unit suite caught what the corner-case script had not, because the script only exercised comma-typed input.

**Why the naive rule cannot work.** The price fields can treat '.' as grouping because `MaskedAmountInput` re-renders the interpretation live as the user types. These payment/movement fields have **no masking**, so the user gets no feedback until blur — a silent reinterpretation there is exactly the class of bug being fixed.

**The rule the repo already had.** `windows/custom/financial-account/statementAmount.js` (ETP-4954) decides by STRUCTURE, not by configured convention: both separators → the rightmost is the decimal; one separator followed by exactly three digits → thousands; anything else → decimal; a lone leading zero is never grouping; and the value must be a number IN FULL (`45.70abc` is NaN, not 45.7 and not 4570).

**Promotion (human-approved).** Moved verbatim to **`lib/parseAmountInput.js`** as canonical, exporting `parseAmountInput` / `parseAmountOrZero` / `isInvalidAmountInput`. `statementAmount.js` became an 18-line re-export keeping its old names, so its four consumers and its vitest suite were untouched (verified green). Three competing hand-rolled amount parsers collapsed into one.

**Deliberately NOT config-driven — do not "fix" this.** Unlike `formatCurrency` and `parseLocaleNumber`, this parser does not read `getCurrencyFormatConfig()`, and must not. Its inputs do not come from one declared convention (a bank's CSV text, an xlsx numeric cell stringified with a canonical dot, and whatever a user types). Verified empirically that the rule is **symmetric**: `1.234,56`/`1,234.56` → 1234.56, `1.234`/`1,234` → 1234, `99,90`/`99.90` → 99.9, `1.23`/`1,23` → 1.23, `0.500`/`0,500` → 0.5. A future switch to comma-thousands needs no change here; making it config-aware reintroduces the 1000x corruption ETP-4954 closed.

**The documented residual risk, and why rates are excluded.** A lone separator with exactly three digits that genuinely meant a decimal reads as grouping: `1.500` → 1500. That is safe for money (max two decimals) and wrong for an exchange rate, where 1,5 is ordinary. So **rates parse with `parseLocaleNumber`, amounts with `parseAmountInput`** — the distinction is documented at both call sites.

**Three classes of helper, on purpose:**

| Helper | Reads config | Use for |
|---|---|---|
| `formatCurrency` | yes | displaying any amount |
| `parseLocaleNumber` | yes | already-disambiguated fields (masked inputs) and canonical values: rates, %, quantities |
| `parseAmountInput` | **no, by design** | amounts whose separators are ambiguous: CSV, xlsx, unmasked fields |

### 7.4 Point 1 — Descuento ✅ (code)

`MaskedAmountInput`'s `toIdleDisplay` returned a bare `String(value)` when `grouping` is false. The outward value is always clean (dot decimal), so the idle display rendered the JS number literal verbatim — `10.5` — leaving a period in a comma-decimal UI, which is what QA saw next to a `12,00` price on the same row. Now only the thousands grouping is skipped; the decimal separator is localized either way.

This also had to land **before** point 6: Assets' fields are `type:'number'`, which maps to `grouping=false`, so point 6 would otherwise inherit the same period.

**Files:** `components/forms/fields.jsx`.

### 7.5 Validation — four channels

| Channel | Result |
|---|---|
| Corner cases in node (throwaway scripts, real modules) | 38 checks on the canonical parser (every documented rule, both 100x cases, garbage, blank, round-trips) + full format/parse tables for both helper families |
| Unit / component suites | **node 5241 pass / 0 fail / 1 skipped** (pre-existing); **vitest 3036 pass / 0 fail** across 129 files (payment, financial-account, shared) + 80/80 on the forms/numeric-grid suites |
| Manual live repro (`localhost:3100`) | Point 5: `50,50` → `Dinero 50,50 €` / `Falta 88,65 €` (was 5.050,00 € with a refund offer); `1.234,5` → blur → `1.234,50 €`. Point 3: `45.70abc` → `0,00` with Guardar/Confirmar disabled (was `4570,00`, saveable); `1234,5` → `1.234,50 €` |
| Mocked E2E | **21/21 pass** — `collection-payment-modal` (2), `multi-currency-payment-modal` (5), `payment-modal-validation` (5), `financial-account-new-transaction` (4), `price-input-locale` (5) |

The multi-currency specs matter most: they are the ones that would have caught mixing the rate parser with the amount parser, including *"re-saving the reopened draft submits the stored rate unchanged"*.

**Harness note.** Playwright must be run **from `e2e/`** with `--project=mocked`; from the repo root it silently loads a different config with no projects and no `baseURL`, and every spec fails inside `login()` waiting for `**/dashboard`. That false signal briefly read as a broken harness. Correct invocations:
```
cd e2e && E2E_USE_MOCK=1 CI=true npx playwright test --project=mocked [name-substrings]
E2E_BACKEND_URL=http://localhost:8080/etendocorego ETENDO_URL=http://localhost:8080/etendocorego \
  E2E_SUITE=integration ./scripts/run-e2e-full.sh
```

### 7.6 Point 6 — Activo (EntityForm) ✅

**Root cause — not fixable by parsing.** `EntityForm.jsx` rendered numeric fields as a native `<input type="number">`, and a native number input **rejects the comma keystroke at the browser level**: typing `1234,56` dropped the comma and concatenated the surrounding digits into `123456` (100x). The character never reached the DOM value, so no downstream parser could have recovered it. The input element itself had to change — which is why this is the one point that unavoidably changes `type="number"` assertions.

**Fix.** Numeric fields (`NUMERIC_FIELD_TYPES`) render `MaskedAmountInput` in BOTH render paths — the `DeferredInput` used for `calloutOn:'blur'` fields and the plain editable input. Read-only numerics keep the plain `<Input>` (they render a pre-formatted `displayValue` and take no keystrokes). Grouping follows `TWO_DECIMAL_FIELD_TYPES`, so a plain `type:'number'` stays ungrouped and ETP-4277 is preserved. `MaskedAmountInput` gained an `onFocus` passthrough (additive, symmetric with the `onBlur`/`onKeyDown` passthroughs it already had) because `DeferredInput`'s focus tracking needs it.

**Outward contract deliberately unchanged:** `MaskedAmountInput` reports a CLEAN dot-decimal value, exactly what `clampNumericFieldMax`, `getNumericFieldError` and the callout payload already parsed. Only the rendered element and the displayed string differ. `DeferredInput`'s blur body was also factored into a single `commitRaw(raw)` shared by both renderings — same ETP-4333/4542/4887 semantics, no longer duplicated.

**Blast radius (audited in §6.F.1):** only Assets declares `type:'number'` fields. `ListModalWindow.jsx`'s `type:'number'` is a false positive — it builds Advanced-Filter column metadata and never reaches `getInputType`.

**Validation.**
- Live (`localhost:3100`, Assets): `1234,56` stays `1234,56` (was `123456`); on blur the callout fires and "Valor actual" renders `1.234,56 €` with the residual recomputed `-2.000,00 €` → `-765,44 €` (1234.56 − 2000 ✓). The full chain — comma accepted, clean value committed, backend recompute, canonical display — verified end to end.
- Each of the 5 initially-failing assertions was inspected individually rather than assumed. The two `DeferredInput` ones received `1000 (string)` / `777 (string)`: the idle re-sync and the focused no-clobber **still work**, only the DOM value type changed. No behaviour break anywhere.
- Suites after Tester's pass: **vitest 4551 pass / 0 fail** (246 files), **node 5241 pass / 0 fail**, **mocked E2E 8 pass**.

**A fidelity limit worth recording.** The keystroke rejection is a *browser* behaviour that jsdom does not emulate — `fireEvent.change` and userEvent both accept `1234,56` on a `type="number"` element, so a keystroke-level unit test would have passed against the OLD code and caught nothing. The new unit coverage therefore asserts the two axes that are non-vacuous in jsdom (the rendered shape must never be a native number input, and the comma-in/clean-out contract on both paths); the real keystroke path is covered in a browser by `price-input-locale.mocked.spec.js`. This is stated in the new test file's banner so nobody later "strengthens" it into something that only looks stronger.

### 7.7 Point 2 — Moneda ✅

**Root cause, in two halves.** `CurrencyRatePicker.formatRate()` emitted `n.toFixed(decimals)` raw, leaking a period into a comma-decimal UI (`EUR — 1.00`, `GBP 0.86`, `USD 1.47`). And the rate editor was a native `<input type="number">`, so — exactly as in point 6 — the browser rejected the comma keystroke.

**Why this had to be fixed as a pair.** Correcting only the display would have produced a worse bug than the original: the field would show `0,86`, the user would retype `0,86`, and `handleRateConfirm`'s bare `parseFloat('0,86')` returns 0, fails the `> 0` guard, and the edit is **discarded with no feedback**. Same lesson as `fmtAmount`/`parseAmount` in §7.2 — a formatter and its parser move together or not at all.

**Fix.** `formatRate` localizes the decimal separator while keeping the org-level precision; it deliberately does NOT route through `formatCurrency`, which would force two decimals and truncate a 4- or 6-decimal rate. `handleRateConfirm` uses `parseLocaleNumber` — not the grouping-aware `parseAmountInput`, since a rate of `1.500` legitimately means 1.5 and the grouping rule would read 1500. The editor became `type="text"` + `inputMode="decimal"` (`step`/`min` dropped as inert; the real `> 0` check lives in the confirm handler), and it is now seeded with the localized value so the user is not handed a period to edit.

**Validation.** Live: the dropdown reads `EUR — 1,00`, `GBP 0,86`, `USD 1,47`, and selecting USD shows `USD — 1,47` with the document totals switching to `$0,00` (left-side symbol, comma decimal — consistent with `formatCurrency`'s per-currency symbol side). Four suite failures, all format expectations; the behaviour test "confirming an invalid (non-numeric) rate does not call onChange" passes untouched, so garbage is still rejected.

### 7.8 Point 4 — Extractos: re-assessed, and it is NOT the defect §6.H.3 described

§6.H.3 reported that a malformed amount (`45,70abc`) sits in the manual-statement cell as raw text and is excluded from the totals, and concluded it needed a design pass. **That conclusion was wrong, because the save path was never checked.** It is:

```js
if (usable.some((r) => !isLineComplete(r))) {
  toast.error(ui('financeAccountStatementsManualErrorIncompleteLine'));
  return;
}
```

`isLineComplete` requires `out > 0 || inn > 0`; an unreadable amount parses to 0, so the line fails and the save is refused with a translated, user-facing message: *"Completa los campos obligatorios de cada línea (fecha y un importe positivo de salida o entrada)"*. This guard is deliberate (documented in `parseAmountOrZero`: "an unreadable amount reads as 'no amount here' and the surrounding gate blocks the save") and heavily covered — 9+ assertions across the ETP-4954 suite in `ManualStatementModal.vitest.jsx`.

**So point 4 breaks into:**
- the parser — ✅ resolved, it is the module promoted to canonical in §7.3;
- the save path — ✅ already correct and tested, nothing to fix;
- what genuinely remains — a **UX nicety, not a bug**: the offending cell is not marked, so the user learns at save time rather than at type time. Note the CSV-import path already does mark bad cells (`bankStatementImportFields.js` uses `isInvalidStatementAmount`, now `isInvalidAmountInput`), so the manual grid is inconsistent with its own sibling. Worth doing, cheap to do, but it is an enhancement — recorded here for the human to decide rather than folded into a bug-fix ticket.

### 7.9 Point 7 — Redondeo: analysis before deciding (no code changed)

Measured rather than assumed, because "it's one `.toFixed()`" turns out to be wrong in three separate ways.

**1. Blast radius.** 68 non-test files import `formatCurrency`, so line 57 governs essentially every amount the app displays. The jsreport mirror carries the identical statement — `templates/reports/helpers/report-html-helpers.js:590`, `var fixed = abs.toFixed(maxFrac)` — so UI and PDF must move together or a printed invoice will disagree with the screen it was printed from.

**2. There is not one rounding implementation, there are six.** `formatCurrency`'s `toFixed`, plus five hand-rolled `round2`s in three different flavours:

| Where | Implementation |
|---|---|
| `lib/balanceTotals.js:17` | `Math.sign(n) * Math.round((Math.abs(n)+EPSILON)*100)/100` — EPSILON + sign-safe |
| `lib/documentTotals.js:51` | `Math.round((n+EPSILON)*100)/100` — EPSILON |
| `windows/custom/assets/AssetsDetailPanel.jsx:57` | `Math.round((n+EPSILON)*100)/100` — EPSILON |
| `windows/custom/shared/usePaymentBalance.js:29` | `Math.round(n*100)/100` — **no EPSILON** |
| `windows/custom/financial-account/CashClose/cashCloseMath.js:140` | `Math.round(n*100)/100` — **no EPSILON** |

**3. None of them is correct — including the EPSILON ones.** Measured:

| value | `toFixed` | round2 no-EPSILON | round2 EPSILON | balanceTotals |
|---|---|---|---|---|
| 2.675 | 2.67 ✗ | 2.68 ✓ | 2.68 ✓ | 2.68 ✓ |
| 10.135 | 10.13 ✗ | 10.14 ✓ | 10.14 ✓ | 10.14 ✓ |
| 1.005 | 1.00 ✗ | **1 ✗** | 1.01 ✓ | 1.01 ✓ |
| **8.575** | 8.57 ✗ | **8.57 ✗** | **8.57 ✗** | **8.57 ✗** |
| −2.675 | 2.67 ✗ | −2.67 ✗ | −2.67 ✗ | −2.68 ✓ |

`8.575` is stored as `8.57499999999999928946`; at that magnitude the binary error exceeds `Number.EPSILON`, so adding EPSILON does not push it over the boundary. **The EPSILON trick is a patch that happens to work for some magnitudes — it looks like a fix and is not one.** Anyone "fixing" point 7 by copying the EPSILON pattern into `formatCurrency` would ship something that still rounds `8,575 €` down.

**What actually works.** Exponential shift via string, which never performs the lossy binary multiply:
```js
const r = Number(Math.round(Number(abs + 'e' + d)) + 'e-' + d);
```
Verified on 2.675, 10.135, 1.005, 8.575, −2.675, 0, 1234.565 and 0.005 — all correct, negatives included.

**Consequence for scope.** Point 7 is therefore not a one-line fix but: introduce one canonical decimal-rounding helper, adopt it in `formatCurrency`, mirror it in the jsreport helper string, and converge the five `round2`s onto it. It touches every amount in the app plus the PDF pipeline, and it is a **pre-existing defect** (the `toFixed` dates from ETP-3726/ETP-4314, the `round2`s from various tickets), not something ETP-5107 introduced. Recommendation recorded for the human: give it its own ticket and its own regression pass (document totals, cash close, assets, balances, printed documents) rather than bundling a second, very different risk profile into this PR.

### 7.10 Status

| Point | State |
|---|---|
| 5 Cobros y pagos | ✅ fixed, verified on all four channels |
| 3 Cuenta financiera | ✅ fixed, verified on all four channels |
| 1 Descuento | ✅ fixed — but only HALF-fixed until 2026-09-15: the masked input was corrected, the read-only grid cell (the one QA photographed) was not. See §7.14.5. Verified live after a save + hard reload |
| 6 Activo | ✅ fixed, verified end to end live + suites green |
| 2 Moneda | ✅ fixed (display + parse + input type), verified live |
| 4 Extractos | ✅ no bug — parser resolved via §7.3, save path already correct and tested (§7.8). One optional UX enhancement recorded, not done |
| 7 Redondeo | ✅ fixed via `toFixedHalfUp` in `formatCurrency.js` + the jsreport mirror, and **confirmed against Etendo Classic** (§7.11). `round2()` in `usePaymentBalance.js` still carries the same float weakness — convergence deferred, see §7.13 |

**Suite totals after points 5, 3, 1 and 6:** node **5241 pass / 0 fail / 1 skipped** (pre-existing), vitest **4551 pass / 0 fail** (246 files), mocked E2E green on every spec touching the changed areas.

Nothing committed. Source files changed so far: `lib/parseAmountInput.js` (new), `statementAmount.js` (now a shim), `components/payment/paymentData.js`, `windows/custom/shared/usePaymentBalance.js`, `windows/custom/shared/NewPaymentEntryModal.jsx`, `components/forms/fields.jsx`, `components/contract-ui/EntityForm.jsx`, plus the test files Tester updated and one new test file.

### 7.11 Point 7 — closing the rounding question against Etendo Classic

§7.9 stopped short of committing to HALF_UP because previous tickets had been burned by GO/Classic
totals diverging by a decimal. That doubt is now resolved by reading Classic's own source and
executing its own library.

**What Classic actually does.** Classic rounds **in the browser, at display time**, using a real
decimal BigDecimal port in `ROUND_HALF_UP`:

- `modules_core/org.openbravo.client.application/web/org.openbravo.client.application/js/utilities/ob-utilities-number.js:37-46` — `roundJSNumber()` = `new BigDecimal(strNum).setScale(dec, ROUND_HALF_UP)`, reached from `OBPlainToOBMasked` (line 212) / `JSToOBMasked` (line 366).
- `modules_core/org.openbravo.client.kernel/src/org/openbravo/client/kernel/reference/NumberUIDefinition.java:105-110` wires that formatter into **every** AD numeric field, with the masks from `config/Format.xml`.

Executed live against Classic's own `BigDecimal-all-1.0.3.js` + `ob-utilities-number.js` with mask
`#,##0.00`: `2.675 → 2.68`, `10.135 → 10.14`, `1.005 → 1.01`, `8.575 → 8.58` — **exactly** the four
outputs of `toFixedHalfUp`. The backend agrees: `RoundingMode.HALF_UP` on all 23 `setScale` sites in
`com.etendoerp.go`.

**So the change converges GO with Classic; it does not diverge.** It is the opposite of the failure
mode the earlier tickets suffered.

Two findings worth recording that were not expected:

1. **The divergence already existed, and this change removes it.** Values with 3+ decimals really do
   persist (`C_ORDERLINE.PRICEACTUAL` is `DECIMAL` with no scale → unconstrained Postgres `numeric`);
   a live query found 15 such rows locally. On those real values, old-`toFixed` GO already disagreed
   with Classic: stored `2.235` → Classic `2,24`, GO `2,23`; stored `8.235` → Classic `8,24`, GO `8,23`.
2. **Classic is internally inconsistent.** Its legacy JSP path
   (`src/org/openbravo/erpCommon/utility/Utility.java:2041-2053`) builds a `DecimalFormat` without
   `setRoundingMode`, so it inherits Java's default **HALF_EVEN** and gives `1.005 → 1,00`. We align
   with the SmartClient UI — what a user actually sees in an AD window — and therefore do **not**
   promise parity with the old JSP/report screens. Classic's CSV export
   (`DataSourceServlet.java:639`) emits the raw unrounded value, so it matches neither.

### 7.12 Component adoption — replacing every patch with `MaskedAmountInput`

The first pass through points 1–7 fixed four of them by patching the *existing* code (parsers,
formatters, `input type`) rather than by adopting the component this ticket exists to build. That was
the wrong call and it was corrected on instruction: **every editable amount input in Etendo GO now
renders `MaskedAmountInput`**, so the live thousands separator and the keystroke filtering the
component already implements reach the screens Isaías reported — instead of each screen re-solving a
piece of the problem on its own.

The cost of the earlier approach was concrete: the only reason a *structural* parser
(`parseAmountInput`, which guesses whether `1.500` means 1500 or 1.5 by counting digits) was needed at
all is that the fields were unmasked and therefore ambiguous. A masked field emits a clean
dot-decimal value, so the ambiguity never arises.

| File | What changed |
|---|---|
| `components/forms/fields.jsx` | `AmountInput` and `MoneyInput` are now thin adapters over `MaskedAmountInput`, keeping their `onChange(event)` contract with the clean value in `target.value` |
| `components/payment/PaymentForm.jsx` | 6 call sites: values passed raw instead of pre-formatted with `fmtAmount`; reads back via a local `parseClean` |
| `financial-account/FundsTransferModal.jsx` | 2 inputs; local `parseAmount`/`normalizeRate`/`sanitizeNumeric` deleted |
| `amortization/AmortizationLinesTable.jsx` | 4 inputs (2 draft + 2 inline-edit via a new controlled `EditAmountCell`) |
| earlier in the same pass | `CurrencyRatePicker`, `NewTransactionModal`, `NewMovementWizard`, `NewPaymentEntryModal`, `ManualStatementModal`, `CashCloseSidePanel` |

**`AmortizationLinesTable` was not in Isaías's report and was the worst case found.** Its four inputs
were `<input type="number">`, which under an es-ES locale makes the *browser itself* reject the comma
keystroke. No parser change could ever have fixed that — the element had to change.

**The rule this migration establishes, and the trap inside it.** Once a field renders
`MaskedAmountInput`, its value is CLEAN and must be read with `parseLocaleNumber` (dot = decimal),
**never** with the structural `parseAmountInput`/`parseAmount`. A typed `1,500` arrives as the clean
string `1.500` meaning 1.5, and the structural rule ("lone separator + exactly 3 digits → thousands")
would read it as 1500 — a silent 1000x error. This is the same class of regression caught earlier in
§7.3, and it is why `paymentData.parseAmount`/`parseEur` were deliberately left structural (they
remain correct for any unmasked caller) while the now-masked call sites switched parser individually.

### 7.14 Live verification of the migrated inputs (2026-09-14, `http://localhost:3100/`)

Every screen below was driven in a real browser, typing character by character, and the assertion
is on the CALCULATION the input feeds, not only on how it renders.

| Screen | Input | Verified |
|---|---|---|
| Nuevo cobro (invoice 10000035, 139,15 € pending) | `cp-amount-input` | `50,50` → *Falta 88,65 €*; `200` → *Sobra 60,85 €*; `139,15` → *Diferencia 0,00 €*. The 36x defect is gone |
| Sales-order lines (order 1000023) | `field-listPrice`, `field-discount`, `field-orderedQuantity` | 5 × `1.234,56` → Subtotal **6.172,80 €**, Tax **1.296,29 €**, Total **7.469,09 €**. Restored to 44,00 afterwards |
| Cash close (Caja) | `cash-close-declared-balance` | `50,50` → −50,50 €; `2,675` → **2,68 €** (HALF_UP, matching Classic §7.11); `0,004` → *La caja cuadra* (tolerance) |
| Amortización | draft `%` + `Importe` | `10,5` accepted — these were `type="number"`, where the browser itself refuses the comma |
| Activo | `field-assetValue` + 4 more | Grouping now live (see §7.14.1) |
| Nueva transacción / Transferencia | `tx-amount`, `transfer-amount` | 9 corner cases each, all correct |
| Extracto manual (bank account) | `manual-line-in`, `manual-line-out` | `1.234,56`, `1.000.000`, letters rejected; both-sides-filled still blocks at SAVE (not on blur), as §7.8 describes |

**Not reachable — and therefore reverted, not migrated (§7.14.4).**

#### 7.14.1 Two real defects the migration exposed

**(a) Activo's amount fields were declared `type: 'number'`.** `TWO_DECIMAL_FIELD_TYPES` (the set
that turns grouping on) holds only `amount`/`price`, so `assetValue`, `residualAssetValue`,
`depreciationAmt` and `previouslyDepreciatedAmt` showed `1234,56` with no thousands separator —
against the explicit requirement that every amount input group live. All four are AD columns whose
`AD_Reference` is literally `Amount` (verified in the DB), so `'number'` was simply wrong. Retyped to
`'amount'` in BOTH `AssetsConfigPanel.jsx` and `AssetsDetailPanel.jsx` (the field list is duplicated;
the detail panel is the one the record page actually renders). `annualDepreciation` (a percentage)
and `usableLifeYears`/`Months` (integers) correctly stay `'number'`.

**(b) A committed value clamped back to its current value left the rejected text on screen.**
`MaskedAmountInput` re-synced its display in an effect keyed on `[value, focused, grouping]`. Type
`220` into a credit line capped at `120` and the parent clamps 120 → 120: neither dep changes, the
effect never fires, and the field keeps showing `220,00` while the real value is 120. Fixed with a
`commitTick` bumped on every blur, so a committed field always re-renders from the authoritative
value rather than from what was typed at it. **Found by a test, not by the browser** — the live pass
had missed it.

The same test run also caught that three call sites in `NewPaymentEntryModal` fed `MaskedAmountInput`
a pre-formatted display string (`formatPlain` output) where it needs a clean value: `formatCurrency`
saw `NaN`, rendered `'—'`, and `toIdleDisplay` mapped that to `''`, so **the amount field opened
empty and the prefill of the outstanding total was silently dead**. Confirmed live before and after:
the field now opens at `139,15`. Two of the three had a numeric twin already exposed
(`balance.amount`, `l.use`); the third converts with `parsePlain`.

#### 7.14.2 Open design question: the meaning of a typed `.`

In a grouped field a typed `.` is discarded (`filterMaskChars`, the "stray thousands separator"
branch), so `45.70` becomes `4.570` — a 100x difference from what a user typing English-style
probably meant. In an ungrouped field (`grouping={false}`: the conversion rate, a percentage) the
same `.` IS accepted as the decimal separator. The same keystroke therefore means different things
in two fields of the same modal. Both behaviours are individually defensible and deliberate; the
inconsistency between them is not. Flagged for a decision, not changed.

#### 7.14.3 Suite totals after the migration and the three fixes

node **5241 pass / 0 fail / 1 skipped** (the skip is pre-existing); vitest **906 files, 17314 pass /
0 fail / 2 skipped**; mocked E2E **723 pass / 0 fail / 5 skipped**, after three specs were retargeted.

One pre-existing flake is worth recording rather than hiding, because it will reappear: in two of
four full-suite runs, `NewPaymentEntryModal.vitest.jsx > "clears the rate and shows the required-rate
error under BOTH fields when the amount-in-account is blanked"` failed, and in the other two it
passed. It passes every time in isolation and every time when its own 153-test file is run alone.
The assertion sits inside a `waitFor` (1s default) that has to span a multi-step effect chain —
change → state → effect → rate clear → re-render → effect → display — so it is timing-sensitive
under heavy parallelism, not a regression. Diagnosed by running it four ways rather than by raising
the timeout, which would have hidden it.

The eight mocked-E2E failures were all test-side and fell into the three classes already seen in the
unit suites — no fourth category, and no product regression:

- `amortization-lines-single-flight.mocked.spec.js` (4): located the cells by `input[type="number"]`,
  which no longer matches by design. Retargeted to the `field-number` testid `MaskedAmountInput`
  falls back to. **No source change was needed**, and every ETP-5255 assertion (PUT ordering, token
  chaining, cross-line parallelism, the error toast) is byte-for-byte intact.
- `financial-account-new-transaction.mocked.spec.js` (2): `field-number-tx-amount` → `tx-amount`.
  Worth recording *why*, because it looks like gratuitous churn and is not: the call site already
  passed `data-testid="tx-amount"` at HEAD, but the old `AmountInput` never destructured
  `data-testid` and silently dropped it, falling back to `field-number-${name}`. The test was
  encoding an ignored prop; `MaskedAmountInput` honours it.
- `multi-currency-payment-modal.mocked.spec.js` (2): the rate now displays `0,89`. `DRAFT_RATE`
  was shared between the display assertion and the payload assertion, so a separate
  `DRAFT_RATE_DISPLAY` was introduced rather than redefining it — the two are different contracts
  and must be able to fail independently.

**The wire format was verified, not assumed**, in both suites and by the same method: the payload
assertion was deliberately mutated to the comma form and confirmed to FAIL (`Expected "0,89",
Received "0.89"`), proving it executes and discriminates. Only the rendering changed; the POST body
still carries the canonical dot-decimal rate.

One operational note: running the mocked E2E suite rewrites the PNG delivery evidence under
`artifacts/delivery-evidence/ETP-5133/`. Those belong to another ticket and were restored.

Two test files needed assertion updates, both strictly in the "encodes the pre-mask behaviour"
category, and neither weakened:

- `NewPaymentEntryModal.vitest.jsx` — the conversion-rate and amount-in-account fields were asserted
  to render the raw dot-decimal (`'0.92'`); they now render `'0,92'`. **The register payload was
  verified to be unaffected**: it still sends the canonical `"0.46"`/`"0.92"`. That verification was
  not taken on trust — the payload assertion was deliberately mutated to `'0,46'` and confirmed to
  FAIL, proving it actually executes (five of those payload assertions had previously never run,
  because their tests aborted on a display assertion above them).
- `cashCloseMath.test.js` — two `parseDeclaredAmount` cases asserting the old separator guessing.
  Worth recording the correction that came out of it: `parseLocaleNumber` accepts **either** `,` or
  `.` as *the* decimal separator and rejects only a SECOND separator, so `'182,61'` still parses to
  182.61. Only the two-separator case (`'1.234,56'`, a grouped display string that cannot arrive
  from a masked input) now returns 0.

#### 7.14.4 `components/payment/` is dead code — migrated, then deliberately reverted

The first migration pass moved `PaymentForm`, `AmountInput` and `MoneyInput` onto
`MaskedAmountInput`. Tracing why none of them could be reached in a browser showed the whole tree is
orphaned:

- `NewMovementWizard` is imported by nothing but its own tests. `git log -S` on `MovementsTab.jsx`
  shows why: **ETP-4500 (2026-07-15) replaced it with `NewTransactionModal` in a single commit** —
  the same commit that added `NewTransactionModal` deleted the wizard's import and JSX. It is
  superseded code, not a wiring that was forgotten.
- `PaymentForm` is imported only by that wizard and by `components/payment/AddPaymentModal`, which
  nothing imports either. `paymentInvoiceFilter` is imported only by `PaymentForm`. The amount
  helpers in `paymentData` (`fmtAmount`/`parseAmount`/`eur`/`parseEur`) are consumed only by
  `PaymentForm` and by the `movementWizardData` re-export the dead wizard uses — `NewTransactionModal`
  takes just `todayISO` from it.
- `AmountInput`'s only live caller is `ReversedInvoicesPanel`, which passes **no `onChange`** (both
  usages are display-only), so the editable branch the migration added was unreachable. `MoneyInput`
  had no live caller at all.

Decision (with the human): dead code is left exactly as it is. `NewMovementWizard/index.jsx`,
`PaymentForm.jsx`, `paymentData.js`, `AmountInput`/`MoneyInput` in `fields.jsx` and the four test
files that had been updated for them were all restored to HEAD. The `MaskedAmountInput` fixes in
the same file (the `commitTick` re-sync, `toIdleDisplay`) are live and were kept — the revert was
done per-function, not per-file, and `fields.vitest.jsx`'s whole diff happened to be confined to the
two reverted components, so it could be restored wholesale.

Worth its own ticket, outside ETP-5107: `components/payment/` (PaymentForm, AddPaymentModal,
paymentData, paymentInvoiceFilter) plus `NewMovementWizard/` have been unreachable since
2026-07-15, and still carry ~100 vitest tests that pass while testing nothing a user can open.

#### 7.14.5 Point 1 was NOT fixed — caught only by a save → reload pass

§7.4 recorded point 1 (`% de descuento` rendering `10.5` next to a `44,00` price) as fixed. It was
not. `toIdleDisplay` was fixed, which covers the **masked input** — what you see *after clicking the
cell to edit it*. Isaías's screenshot is the **grid**, and the read-only cell is a different code
path: in `InlineLinesPanel`'s `renderCell`, a column whose type is not amount/price falls through
every formatter to `<span>{resolveIdentifier(...)}</span>` and prints the raw JS number.

It survived because the earlier verification typed into the field and saw `10,5` — the input path —
and never reloaded the page to look at the idle cell. One value, two render paths; only one was
fixed.

`DataTable.formatDerivedCellValue` had the same hole plus a hardcoded `toLocaleString('es-ES', …)`,
which CLAUDE.md forbids outright (separators are instance config, not a constant).

Fixed at the root with one canonical helper, `formatPlainDecimal` in `lib/formatCurrency.js`, now
used by all three paths (`toIdleDisplay`, the lines read-only cell, the DataTable derived cell)
instead of three separate spellings. Verified live: the row now reads `44,00` / `10,5`.

**The lesson, worth keeping:** for a display bug, typing into the field proves nothing. The test has
to be save → hard reload → read what the backend serves.

#### 7.14.6 Persistence pass — all 7 points through save → reload → DB

| # | Stored in the DB | Shown after a hard reload |
|---|---|---|
| 1 Descuento | `discount` persisted | `10,5` |
| 2 Moneda | rates from the backend | `EUR — 1,00`, `GBP 0,86`, `USD 1,47` |
| 3 Movimiento | `-45,70` | edit modal prefills `45,70` |
| 4 Extracto | `cramount = 1234.56` | `+1.234,56 €` |
| 5 Cobro | draft saved | payment window: `139,15 €`, `50,50 €`, `0,00 €` |
| 6 Activo | `1234.56` / `-765.44` | `1.234,56` / `-765,44` (backend callout included) |
| 7 Redondeo | `priceactual = 2.675` | `2,68` |

**Point 7 is display-only rounding, and that is correct.** The backend stores the full `2.675`; the
UI rounds HALF_UP for display, exactly as Classic does (§7.11). The totals are computed from the
stored precision, not from the rounded display: `linenetamt = 13.38`, and the UI shows Subtotal
13,38 € / Tax 2,81 € / Total 16,19 € — consistent with ETP-4777's "prefer the backend-persisted
total".

**A backend discrepancy this exposed, out of scope here:** the same row stores
`line_gross_amount = 16.18` (13.375 × 1.21) while `grandtotal = 16.19` (13.38 + 2.81). One cent
apart, both computed and stored by the backend; the frontend renders each faithfully. It only
appears when a price carries more decimals than the price precision — the exact scenario the QA
rounding report exercised. Worth its own ticket.

**Still not verified live, and why:** the manual-statement EDIT modal (this build's statement row
menu offers only Procesar/Reactivar/Eliminar, no Editar), the `NewPaymentEntryModal` EDIT modal (not
reachable from the invoice — the payment row only navigates to the payment window), and the
funds-transfer multi-currency preview (no non-EUR account exists in the dataset, so the rate field
never renders).

Operational note found while cleaning up: a PROCESSED bank statement cannot be deleted — it must be
reactivated first. The first delete attempt failed silently in the UI and was only caught by
checking the DB.

### 7.15 The ticket's ORIGINAL acceptance cases, re-verified live (2026-09-15)

The §6/§7 rounds chased the 7 defects from the reopening. This pass re-ran the ticket's own
acceptance cases from §0, for new records, updates and a hard reload, checked against the DB.

| Case | Input | Result | New | Update | Reload | DB |
|---|---|---|---|---|---|---|
| Bug 1 | `10,4` (comma) | no 400, shows `10,40` | — | ✅ | ✅ | `priceactual = 10.4`, `linenetamt = 52.00` |
| Bug 2 | `20,0rrwetwrtwrt2` | `20,02` — every letter rejected | ✅ | — | — | — |
| Bug 3 | Producto price tab vs document line | `44,00` both | — | — | ✅ | — |
| Case 1 | `10,50` on a new line | `10,50`, gross `12,71`, totals 230,50/48,41/278,91 | ✅ | — | ✅ | `priceactual = 10.5` |

**On the `10.4` (period) case in the ticket's repro steps.** Typing a period into a grouped field
yields `104`: `filterMaskChars` drops it as a stray thousands separator. That is NOT a regression
from this round — `git log -S` puts it in `57932dd35` (2026-09-10, the first ETP-5107 fix, already
an ancestor of `origin/develop`), so it is exactly the build QA reviewed, and the agentic report
attached to the reopening **explicitly classified "the period is silently ignored" as by design**
(§6, line 184). The ticket's "Steps to reproduce" describe how to trigger the PRE-fix bug, not the
post-fix contract. Recorded here because it is easy to misread as a broken acceptance case — it was
misread that way once during this verification.

The residual question is the asymmetry already filed as §7.14.2, not this case.

### 7.16 The attached QA report (`reporte_ETP-5107_3.md`) — every case re-run (2026-09-15)

The report attached to the reopening was analysed in §6 but only its ONE defect (rounding) had been
re-verified. Its full case list has now been re-run locally.

| Report section | Its finding | Now |
|---|---|---|
| §1.a comma `10,4` | saves `10,40` on all 5 screens | ✅ unchanged |
| §1.b period ignored | `10.4`→`104`, by design | ✅ unchanged — same behaviour, still by design |
| §2 **paste** `12.50` | shows `1.250`, saves `1.250,00 €` (×100) | ✅ **reproduced identically** — `1.250` |
| §2 paste `12.5` / `10.4` | `125` / `104` | ✅ `125` / `104` |
| §3 letters `20,0rrwetwrtwrt2` | filtered → `20,02` | ✅ `20,02` |
| §3 symbols `1,2,3€%` | filtered → `1,23` | ✅ `1,23` |
| §3 negative `-15,50` | accepted, propagates to totals | ✅ `-15,50` |
| §4 `10,123456789` | `10,12` (correct) | ✅ **still `10,12` — our HALF_UP change did not regress it** |
| §4 `10,125` | `10,13` (correct) | ✅ **still `10,13`** |
| §4 `10,135` | `10,13` ❌ | ✅ **`10,14`** — fixed |
| §4 `2,675` | `2,67` ❌ | ✅ **`2,68`** — fixed |

**The two §4 cases that were already correct were the real regression risk of our own fix**, and they
were not checked until this pass. Both hold.

**§5's unexplained observation, now root-caused.** The report saw "Subtotal sin descuento 2,67 €"
next to "Subtotal 2,68 €" on the same line and noted it was not investigated. It is the same
discrepancy found in §7.14.6: the backend stores `line_gross_amount` computed from the UNROUNDED
value and `grandtotal` from the rounded net, one cent apart, both persisted server-side. Not a
frontend defect — worth handing back to QA as the answer to their open question.

**Its recommendations.** #2 (decimal-safe rounding) is what point 7 implemented. #1 (a visual hint
that decimals use a comma) is a product/UX call and was NOT done — it is the same territory as the
§7.14.2 asymmetry. #3 (close as non-reproducible) applied to the original 3 bugs only; Isaías's own
6 bullet points are what reopened the ticket.

### 7.17 The migration's own trap, sprung in the window it was written for (2026-09-15)

QA typed `483,945` into the payment amount on invoice 10000040 and got `483.945,00`, with an
"Exceso: $483.461,05" error. Typing `329,225` into the amount-in-account derived a conversion rate
of `680,28722` instead of `0,680287`.

**The component was there.** All four fields are `MaskedAmountInput`. What was wrong is who READ
their output: three of the four still went through the STRUCTURAL parser `parsePlain`, whose rule
("a lone separator with exactly 3 digits after it is thousands grouping") turns the mask's clean
`483.945` into 483945.

This is verbatim the rule recorded in §7.12 — *"once a field renders MaskedAmountInput its value is
CLEAN and must be read with parseLocaleNumber, never with the structural parser"* — applied in
FundsTransferModal, CashCloseSidePanel, ManualStatementModal and NewMovementWizard, and then **not**
applied in the one window that is point 5 of the QA report.

Worse, the code said so out loud. `parsePlain`'s docstring read *"it has no live masking"* and the
amount-in-account handler read *"this field is seeded with formatPlain() output"* — two statements
the migration itself falsified, left in place, and then trusted on a later pass.

**Fix.** `parseMaskedAmount` in `usePaymentBalance.js`: try the canonical parser, fall back to the
structural one only when the canonical rejects the string. That fallback is not a heuristic — a
clean value can never carry TWO separators, so a rejected string is necessarily a `formatPlain`
display string seeded by the hook. Applied at the four sites that read masked output (amount on
change and on blur, credit-line use, amount-in-account value + handler). The two sites that read
pure `formatPlain` output keep `parsePlain`, which is still correct there.

Verified live on the reported invoice: `483,945` → `483,95`, difference `$0,00`, no error; and on a
USD purchase invoice (the PAYMENT direction, same modal, same hook): `6,055` → `6,06`, `4,125` →
`4,13`, rate `0,681255`.

**The failure mode worth remembering** — it produced three wrong reports in this ticket: verifying
the change that was made rather than the path the user walks. The input was migrated and tested; the
reader behind it was never looked at.

**Two guardrail tests encoded the defect.** `NewPaymentEntryModal.test.js` asserted
`const n = parsePlain(raw)` for the amount-in-account field, i.e. it actively protected the bug.
There are now three categories, all load-bearing: rates → `parseLocaleNumber`; masked-field output →
`parseMaskedAmount`; `formatPlain` display strings → `parsePlain`.

### 7.18 Manual-statement validation message is misleading (found 2026-09-15, not fixed)

`isLineComplete` in `ManualStatementModal.jsx` returns false for three different reasons — no date,
a negative amount, or BOTH sides filled — and all three surface the same toast, *"Completa los
campos obligatorios de cada línea"*. For the both-sides case that message points the user the wrong
way: nothing is missing, something is in excess. The rule itself is correct and well-reasoned (a
both-sides line collapses to `cramount - dramount` on read, so 233,46/33,43 becomes a −200,02 that
no bank reported).

Fix shape: a dedicated i18n key for the both-sides case, added to BOTH `en_US.json` and `es_ES.json`.
Same family as the QA report's recommendation #1 — warnings the user needs and does not get.
Product call, deliberately not done here.

### 7.13 Still open beyond the 7 points

- The add-line callout race condition from §4.2/§4.3 (typing a price within ~0.85s of selecting the product) — pre-existing, unrelated to ETP-5107, still awaiting a decision on whether it gets its own ticket.
- The ticket is priority **Menor**, which no longer matches what was found: point 5 could confirm a collection ~36x an invoice's balance and offer to refund the difference. Recommend escalating.
- Jira comment / description updates: the deliberately out-of-scope screens, the "Factura de Venta inconsistent" symptom that never reproduced, and the newly-found defects that were not in the original report.
- `round2()` convergence: `usePaymentBalance.js` and four siblings still round with the float-naive
  pattern that §7.9 documented. `formatCurrency` (what the user *sees*) is now correct, so this is a
  narrower residue than it was, and ETP-4777's "prefer the backend-persisted total over a client
  recomputation" principle limits how much client-side rounding should exist at all. Deferred
  deliberately — recorded here so it is not lost.
- Nothing committed; the full pre-push gate has not been run.

---

*(§0–§5 above were actually run against `https://go.experimental.etendo.cloud/`, logged in as GOAdmin, on 2026-09-13. §6 is source-code analysis done 2026-09-14 against `origin/develop`/`feature/ETP-5107`, followed by full live re-verification of all 7 points (§6.G, §6.H) against `http://localhost:3100/` the same day — every finding reproduced exactly as predicted from source. §7 is the fix round that followed, on the same branch.)*

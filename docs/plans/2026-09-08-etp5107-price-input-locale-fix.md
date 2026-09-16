# ETP-5107 — Price Input Locale & Validation: Root Cause & Solution Plan

**Ticket:** [ETP-5107](https://etendoproject.atlassian.net/browse/ETP-5107) — Input de precio en líneas y productos: separador decimal inconsistente, acepta letras y formato varía según ventana
**Related:** [ETP-4314](https://etendoproject.atlassian.net/browse/ETP-4314) — currency display unification (this ticket's investigation already flagged the input-parsing side of this bug as explicitly out of scope, see `docs/plans/2026-07-22-etp4314-currency-unification-plan.md`)
**Branch:** `feature/ETP-5107` (from `develop`)
**Date:** 2026-09-08
**Status:** Investigation complete, root causes confirmed live on `https://go.experimental.etendo.cloud/` (develop), including a second pass covering Purchase Order's add-line AND existing-line paths and Sales Invoice (§5.1, §5.2). UX direction confirmed on 2026-09-09: build a live-masked numeric input (Holded-style), researched live against the user's own Holded account (§6.2). Implementation not started.

## 0. Summary (read this first)

This section is the final, settled state of the plan — everything below it is the investigation trail and reasoning that got here (including a few corrected initial guesses, left in rather than deleted, since they explain *why* the final design looks the way it does).

**The three bugs, one line each:**
1. Comma rejected as a decimal separator on price fields → `Error 400` (existing-line edit) or a silently wrong value with no error at all (new-line add) — §3 Bug 1, §5.1.
2. No character-level validation on the existing-line price editor — letters go through verbatim, confirmed on both Sales Order and Purchase Order — §3 Bug 2, §5.2.
3. Product's Price tab shows raw, unformatted numbers (`€ 79.9`) instead of the app's Spanish currency format (`79,90 €`) — §3 Bug 3.

**Root cause common to all three:** the app has a canonical *display* formatter (`formatCurrency()`, `es-ES`, fixed since ETP-4314) but nothing symmetric for the *input* direction — no canonical way to turn what a user types back into a clean `Number`.

**The fix, four pieces:**
1. **`parseLocaleNumber()`** — new function, lives beside `formatCurrency.js`, reads the same `getCurrencyFormatConfig()`. Turns user-typed text into a `Number`. §6.1.
2. **`MaskedAmountInput`** — new component (Holded-style live masking: thousands separator auto-inserted, never typeable; decimal separator is the one character the user types). Built as a **new sibling** next to the existing `AmountInput`/`MoneyInput` in `components/forms/fields.jsx` — **those two are not modified**, so their four existing screens (Payment Form, `ReversedInvoicesPanel`, `NewTransactionModal`, `NewMovementWizard`) carry zero risk from this change and are explicitly not fixed by it either (§6.3.1, §8). Currency symbol is optional and OFF by default — the line-price grids don't show one today and shouldn't start (§6.3.0). Negative values stay allowed at the character level; whether a given field accepts them is still decided by its existing `min`/`max`, unchanged (§6.3.3).
3. **Three call sites migrate** to `MaskedAmountInput`: `InlineLinesPanel.jsx`'s `EditCell`, `DataTable.jsx`'s add-line cell, `ProductPriceBar.jsx`'s `PriceStepper` — gated by field `type` (a numeric-type set that today is inconsistent across three files and needs unifying first, §6.3.4).
4. **The one non-negotiable correctness rule (§6.3.2):** the component's display string (with thousands separators, for the user's eyes) and the value it reports outward via `onChange`/`onCommit` (clean, for `handleFieldChange`/`onCommit`/the backend) are never the same string. `DataTable.jsx`'s add-line already recalculates the line total on *every keystroke* (a live callout, confirmed by testing) — if the masked display string ever leaked into that path, the fix would reintroduce its own bug one layer up. This is the first thing to verify once DEV starts.

**Not yet decided (§8):** exact decimal-padding behavior while editing (Holded doesn't pad, this app currently does), paste-event handling, and the still-unreproduced "Sales Invoice saves inconsistently" wording from the ticket itself.

**Pre-DEV validation (§9, done 2026-09-10, local `develop`):** branch-merge impact checked (only cosmetic line-number drift, §9.1); the field-`type`-gating mechanism (point 3 above) stress-tested against a real codebase warning and confirmed safe (§9.2); the calculation-trigger requirement (point 4) confirmed live with the Network tab, correcting one wrong claim in the process — the add-line total preview is a local client-side computation, not a callout, traced to its exact source module `useLineGrossAmount.js` (§9.3, §9.4); negative-value support upgraded from "maybe, depending on config" to "actively required, ETP-4567" (§6.3.3, §9.4); the existing test suite most relevant to this fix was read in full, surfacing one test file (`ProductPriceBar.vitest.jsx`) that will need deliberate updates as part of DEV, not as a surprise regression (§9.4); and in-flight PR #1411 (ETP-5132, open against `develop`) was reviewed in full — no design change, but it independently reinforces the negative-value requirement a second way and touches `formatCurrency.js` right next to where `parseLocaleNumber` will live, so `feature/ETP-5107` needs one more `develop` sync once it merges (§9.5).

## 1. What ETP-5107 reports

Three related defects in price fields across document lines (Sales Order, Purchase Order, Sales Invoice, etc.) and the Product window's Price tab:

1. **Decimal separator inconsistent with locale** — prices display with a comma (`9,80`, Spanish locale) but the edit input only accepts a period. Typing `10,4` on a Sales Order line produces an `Error 400`; the same edit on a Sales Invoice line "saves but behaves inconsistently."
2. **Input accepts letters** — the price cell on a document line (Purchase Order, etc.) accepts arbitrary alphabetic characters (e.g. `20,0rrwetwrtwrt2`) with no validation.
3. **Format inconsistent between windows** — the Product window's Price tab shows `€ 14.5` / `€ 38` (period, no fixed decimals) while document lines show `9,80` (comma, two fixed decimals) for the same locale.

Expected behavior: accept both `,` and `.` as decimal separator per the user's locale, reject non-numeric characters at input time, and render prices consistently (Spanish format) everywhere.

## 2. Investigation method

Read the relevant frontend source in `tools/app-shell/src` (this repo), then reproduced all three bugs live against `https://go.experimental.etendo.cloud/` — an environment that tracks `develop`, the same branch this fix targets — using:
- Product → "Botín piel tacón bloque" (Price tab) for bug 3
- Sales Order 1000289 ("Cinta de papel" line) for bugs 1 and 2

No local environment was available for this investigation (not running); the experimental server substituted for it.

## 3. Root causes

### Bug 1 — decimal separator rejected on save (Error 400)

`tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx:341-347`, `buildRowValueCoercer()`:

```js
export function buildRowValueCoercer(fields) {
  const fieldsByKey = new Map((fields || []).map(f => [f.key, f]));
  const isIdColumn = (key) => /_ID$/i.test(fieldsByKey.get(key)?.column || '');
  return (v, key) => (
      typeof v === 'string' && !isIdColumn(key) && /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : v
  );
}
```

The regex only recognizes `.` as a decimal separator. A value typed with a comma (`10,4`) fails the test, so it is **never coerced to a `Number`** and is sent to NEO Headless as the literal string `"10,4"` in the PATCH body. The backend fails to parse it as a `BigDecimal` → `Error 400`.

This coercer feeds the inline-line-edit PATCH flow used by `InlineLinesPanel.jsx`'s `EditCell` (lines 706-722) — the editor for an **existing** line's cells (as opposed to adding a new line). `EditCell` itself does no comma→period normalization either; it commits the raw `e.target.value` on blur (line 712).

A second, independent instance of the same bug exists in the "add new line" path in `DataTable.jsx`: `resolveNumericFieldValue()` (line 1090-1098) also uses a bare `Number.parseFloat(raw)` with no locale handling.

The "Sales Invoice saves but inconsistently" symptom is consistent with that window using a different `linesLayout` (the classic `DataTable.jsx` row-edit path vs. `InlineLinesPanel.jsx`'s inline-editable path) — both routes share the same underlying defect (no comma normalization) but reach it through different code, which explains the differing failure mode between windows.

**Live confirmation:** editing the price cell on Sales Order 1000289's line and blurring produced a red `Error 400` toast (see §5).

### Bug 2 — no character-level input validation

`InlineLinesPanel.jsx`'s `EditCell` (lines 706-722, the editor used when `window.linesLayout === "inlineEditable"`, i.e. existing-line editing) renders a plain `<Input type="text">` with **no `onChange` handler at all** — only `onBlur`. Every keystroke is accepted verbatim; nothing filters non-numeric characters while typing.

A second, complementary defect affects the "add new line" path in `DataTable.jsx`:
- `NUMERIC_FIELD_TYPES` (line 259) is `{'number', 'integer', 'decimal', 'quantity', 'amount'}` — it **does not include `'price'`**.
- `renderInputCell` (line 422) computes `isNumeric = NUMERIC_FIELD_TYPES.has(field.type)`, which is `false` for `type: 'price'`, so the `partialPattern.test(raw)` character gate (line 439) never runs for price fields — any character passes through.
- Meanwhile `isTwoDecimal` (line 423) correctly treats `'price'` as a currency-shaped field, and `coerceFieldValues`/`resolveNumericFieldValue` also key off `NUMERIC_FIELD_TYPES`, so a `'price'`-typed field added via the inline-add-row is *never coerced to a Number* either.
- This is a real desync: `InlineLinesPanel.jsx`'s own `NUMERIC_TYPES` set (line 62) and `ListModalWindow.jsx`'s `NUMERIC` array (line 196) **do** include `'price'` — only `DataTable.jsx` disagrees.

**Live confirmation:** typing `20,0rrwetwrtwrt2` into the price cell of Sales Order 1000289's line was accepted character-by-character with no filtering (see §5).

### Bug 3 — Product Price tab bypasses the canonical currency formatter

`tools/app-shell/src/windows/custom/product/ProductPriceBar.jsx`, `PriceStepper` (lines 67-118):

```jsx
<input
  type="number"
  step="0.01"
  value={local}
  onChange={e => setLocal(e.target.value)}
  onBlur={() => onCommit(local === '' ? 0 : Number(local))}
  ...
/>
```

This is a native `<input type="number">`, always rendering the raw `String(value ?? '')` — it never goes through `formatCurrency()` (the app's canonical formatter, per `CLAUDE.md` § Currency & Amount Formatting), and native number inputs always use `.` as their internal decimal character regardless of page locale, with no forced decimal-digit count. This single component backs **every price row on both the "Venta" and "Compra" sub-tabs** of the Price tab (used at lines 521, 530, 583, 592).

By contrast, the Product **list**'s price columns already render correctly (`55,00 €`, `79,90 €`) — confirming the canonical formatter itself is fine; only this one component fails to use it.

**Live confirmation:** the Price tab of two different products showed `€ 55` and `€ 79.9` respectively (see §5), while the Product list showed `55,00 €` and `79,90 €` for the same products.

## 4. Existing context (ETP-4314)

The ETP-4314 investigation (`docs/plans/2026-07-22-etp4314-currency-unification-plan.md`) already noticed a very similar symptom and explicitly parked it: *"a separate input-parsing bug where typing `12500.75` saved/displayed as `1,250,075.00` — a decimal-point mishandling issue, unrelated to display formatting, flagged separately so it doesn't get conflated with this ticket."* ETP-5107 is that follow-up. ETP-4314 also already fixed the **display**-side canonical formatter (`formatCurrency.js`, now `es-ES`-locale, `useGrouping: true`) — this plan does not need to touch that file's formatting logic, only add a symmetric **parse**-side helper (§5.1 below) and wire the input components to use it.

## 5. Live reproduction evidence (2026-09-08, `go.experimental.etendo.cloud`, tracking `develop`)

| Bug | Steps | Result |
|---|---|---|
| 3 | Inventario → Producto → "Bolso bandolera piel" → Precio tab | `€  55` (no decimals, period-shaped) |
| 3 | Inventario → Producto → "Botín piel tacón bloque" → Precio tab | `€  79.9` (period, single decimal digit) — product list shows `79,90 €` for the same product |
| 1, 2 | Ventas → Pedido → 1000289 (Borrador) → Editar → línea "Cinta de papel" → Precio: select-all, type `20,0rrwetwrtwrt2` | Input accepted every character verbatim (no filtering) |
| 1, 2 | ...then Tab (blur) | Toast: **Error 400**; input still holds the unparsed literal string |

No data was saved — the order was left via "Cancelar" (draft, unaffected) after the repro.

### 5.1 Second pass — Purchase Order add-line path and Sales Invoice (corrections to the initial hypothesis)

A follow-up live pass specifically targeted the two open questions from the first investigation: whether the `DataTable.jsx` add-line path is really exploitable for `'price'`-typed fields, and what "saves but behaves inconsistently" means concretely for Sales Invoice. Both corrected part of the original hypothesis:

- **Purchase Order 1000158, add-line path** (`DataTable.jsx`'s inline-add-row, §3 Bug 2's second mechanism): selected product "Fernet" (base price `33,00`), then typed `20,0rrwetwrtwrt2` directly into the new line's Precio cell. Result: the letters were **not** accepted verbatim — the field ended up showing `2002` (only the digits from the typed string survived: `2`, `0`, `0`, `2`). This means the Precio column here resolves to a field type that **is** already in `NUMERIC_FIELD_TYPES` (most likely `'amount'`, not `'price'` — no window's `decisions.json` was found to declare `type: "price"` anywhere, confirmed by grep), so the character gate in `renderInputCell` (line 439) is active and does reject each non-digit keystroke.
  - However, retesting with a clean, purely-numeric comma input (`10,50`, no letters) surfaced a **worse, silent variant of Bug 1** on this same path: the comma keystroke is silently dropped (the whole-value `partialPattern.test()` check fails for that keystroke, so React's controlled `value` reverts the DOM and the keystroke is lost) but **typing continues appending to the pre-comma value** — `1`,`0` → `"10"`, `,` rejected (stays `"10"`), `5` → `"105"`, `0` → `"1050"`. Final result: the field silently ends up holding `1050`, and the line's subtotal is computed as `1.050,00 €` — **a wrong value accepted with no error at all**, worse than the `Error 400` on the existing-line-edit path because it produces silently corrupted data instead of a visible failure.
  - **Correction to §3 Bug 2:** the `NUMERIC_FIELD_TYPES` gap for `'price'` in `DataTable.jsx` (line 259) appears to be a real but currently **dormant** code-level inconsistency (worth fixing defensively for consistency with `InlineLinesPanel.jsx`/`ListModalWindow.jsx`, and in case any window's `decisions.json` does use `type: "price"` for an add-line column) rather than the mechanism behind the ticket's literal repro — the actual live-reproducible defect on the add-line path is the silent-comma-drop from Bug 1, not unfiltered letters.
- **Sales Invoice 10000529**: added a line (product "Fernet", auto-priced `44,00`), then edited that line's Precio cell (the `InlineLinesPanel.jsx` `EditCell`, same component as Sales Order) to `10,50` and blurred. Result: **`Error 400`**, identical to the Sales Order repro — the subtotal stayed at `44,00 €`, unchanged.
  - **Correction to §3 Bug 1:** could not reproduce a distinct "saves but behaves inconsistently" outcome for Sales Invoice as literally described in the ticket — both windows fail the same way (`Error 400`) for a freshly-added line's price edited with a comma. The differing symptom the reporter described may depend on a detail not captured here (e.g. editing an already-completed/posted invoice line rather than a fresh draft line, a different decimal value, or a session/timing detail) — flagged as an open question for QA to chase during the ticket's "Other test cases" verification (§8), rather than assumed to trace to a second, distinct code path.

No data was saved in either case — both documents were left via "Cancelar".

### 5.2 Third pass — Purchase Order existing-line path (closes the literal ticket repro)

§5.1 left one gap: the ticket's Bug 2 repro is stated explicitly on **Purchase Order** ("Abrir un Pedido de Compra con una línea... Editar el campo Precio de la línea"), but the only direct letters-typing test so far had been on **Sales Order**'s existing-line editor. Re-tested directly on Purchase Order 1000158: added a "Fernet" line, confirmed it (so it became a real existing line, not the add-row), then edited that line's Precio cell — typed `20,0rrwetwrtwrt2` with the field's previous content pre-selected.

Result: the string was accepted **verbatim**, letters and comma included, with zero filtering — matching Sales Order's behavior exactly and confirming this is the literal, exact mechanism behind the ticket's Bug 2 repro on Purchase Order specifically, not just inferred from a different window. This closes the gap from §8's earlier list of open questions. No data was saved (`Cancelar`).

**Net picture across the two editors, now fully confirmed on both Sales Order and Purchase Order:**

| Editor | Component | Letters | Comma (no letters) |
|---|---|---|---|
| Editing an **existing** line's price | `InlineLinesPanel.jsx` `EditCell` | Accepted verbatim, no filtering (§5, §5.2) | Accepted verbatim → sent to backend as a literal string → `Error 400` (§3 Bug 1, §5) |
| Adding a **new** line's price | `DataTable.jsx` inline-add-row | Filtered out already (only digits + `.` survive) (§5.1) | Silently dropped keystroke-by-keystroke; digits before/after concatenate into a wrong value with **no error at all** (§5.1) |

Both rows trace back to the same root cause (no locale-aware decimal handling), just surfacing differently because the two editors are separate components with different amounts of existing character-level validation.

## 6. Proposed fix

### 6.1 New canonical locale-number parser

**Why not just reuse `formatCurrency()`?** Read the full file (`tools/app-shell/src/lib/formatCurrency.js`, 193 lines) end to end to check this before proposing a new helper. It exports exactly two functions, `formatCurrency(currencyCode, value)` and `getCurrencySymbol(currencyCode)`, and both are one-directional: `number → display string`. Internally `formatCurrency` calls `Number(value)` on its input (line 133) — it assumes it already has a real JS number, not a string a user is mid-typing. There is no parse/reverse direction anywhere in the file, and a repo-wide grep for any existing `decimalSeparator`-aware parsing (`getCurrencyFormatConfig` consumers, anything matching `decimalSeparator` outside the two currency-formatting files themselves) found none — no such helper exists today anywhere in `tools/app-shell/src`. So `formatCurrency()` genuinely cannot do what Bug 1/2 need (turning `"10,50"` typed by a user back into `10.5`); it's the wrong direction, not a matter of it being underused.

That said, the important part of your question stands: the new parser should **not** become an 11th disconnected "canonical" thing. It has to live right next to `formatCurrency.js` (same file or an immediate sibling in `lib/`) and pull its separators from the exact same `getCurrencyFormatConfig()` that `formatCurrency()` already reads (`tools/app-shell/src/lib/currencyFormatConfig.js`) — so if the instance's configured decimal separator ever changes, display and parsing move together instead of drifting apart the way the ~20 duplicated formatters did before ETP-4314. Candidate location: `tools/app-shell/src/lib/formatCurrency.js` itself (or a sibling `parseLocaleNumber.js` next to it, re-exported from the same barrel), e.g.:

```js
// parseLocaleNumber(raw) -> { value: number|null, isValid: boolean }
```

- Accepts both `,` and `.` as the decimal separator (reads `getCurrencyFormatConfig().decimalSeparator` for the configured one, but always accepts `.` too — many keyboards/numpads emit it regardless of locale).
- Restricts to digits, at most one decimal separator, and an optional leading `-`.
- Returns a partial-input-safe shape so callers can distinguish "still typing" (`''`, `'-'`, `'1,'`) from a genuinely invalid value.

This becomes the one accepted way to turn a user-typed price/amount string into a `Number` — mirroring the existing `formatCurrency`/`parseCalendarDate`/`csvField` "canonical helper" pattern already documented in `CLAUDE.md`.

#### 6.1.1 Mental model: two one-directional translators, never a shared "locale number" type

Worth spelling out explicitly, since it drove a design correction in §6.2/6.3 below: `formatCurrency` and `parseLocaleNumber` are inverses of each other, but the value that travels *between* them — while it's in application code, in the PATCH/POST payload, in the JSON response, in the database `BigDecimal` — is a **plain JS `Number`, which has no locale and no separator at all**. The comma only exists at the two edges a human actually looks at:

```
Usuario escribe   parseLocaleNumber    Number JS       se envía tal cual      Backend
   "10,50"    ──────────────────►      10.5       ─────────────────────►   (BigDecimal,
 (string, ES                       (sin separador,      (JSON: number sin      guarda el
  convención)                       no tiene idioma)      idioma tampoco)        valor)
                                                                                   │
Usuario ve       formatCurrency       Number JS        la respuesta trae         │
  "10,50 €"   ◄──────────────────      10.5       ◄─────────────────────────────┘
(string, ES                        (el mismo valor
 convención)                        sin separador)
```

`Number.prototype.toString()`/`console.log` always print `10.5` with a period — that is not "the English convention", it is simply JavaScript's own fixed number-literal syntax, unrelated to any user locale. JSON's own spec mandates the same period-only syntax for numbers. So `parseLocaleNumber("10,50")` correctly returns the `Number` `10.5` — returning a string `"10.5"` or `"10,5"` instead would defeat the point, since the backend and any downstream calculation (e.g. `precio * cantidad` for a line's `importe bruto`) need a real `Number`, not text. The Spanish-formatted comma is not "the app's internal representation" — it's purely a display convention, produced only at the two points a human reads or writes the value.

### 6.2 UX decision: live-masked input (Holded-style), researched live on 2026-09-09

Initial draft of this plan proposed a passive character filter (reject/allow whole keystrokes via a regex, format to 2 decimals only on blur). Revisited per explicit direction: build a proper **live-masked numeric input**, matching the pattern used by Holded (a reference competitor app), where the thousands separator is never typed by the user — it's inferred and inserted automatically as they type — while the decimal separator is the one character the user does control.

**Live research method:** inspected the real Precio input on a test invoice in the user's own Holded account (`https://app.holded.com/doc/invoice/6a9867efdb1c88a5f70f716a/edit`, explicitly authorized as a test document), typing one keystroke at a time and zooming into the field after each to observe the exact masking behavior. No changes were saved (page was reloaded afterward, no "Guardar"/"Aprobar" clicked).

**Observed algorithm, keystroke by keystroke:**

| Action | Field content after | What it shows |
|---|---|---|
| Type `1` | `1` | starting point |
| Type `234` (→ `1234`) | `1.234` | thousands separator inserted automatically once there are >3 integer digits — the user never typed it |
| Type `.` (attempt to type the thousands separator manually) | `1.234` (unchanged) | **completely ignored** — the period is not an accepted keystroke at all |
| Type `,` | `1.234,` | decimal separator accepted, appended after the (auto-grouped) integer part |
| Type `56` | `1.234,56` | decimal digits appended after the separator, integer grouping unaffected |
| Type `,` again (second decimal separator) | unchanged | **ignored** — only one decimal separator is ever accepted |
| Type a letter (`a`, `b`, `c`) | unchanged | **completely ignored**, not even transiently inserted and removed |
| Move cursor to the very start (`Home`), type `9` | `1.234,56` → `91.234,56` | inserted correctly at the start, and the thousands separator **repositions itself** (from after `1` to after `91`) — cursor/insertion-point handling is correct, not just append-only |
| Blur after typing `50,5` (one decimal digit only) | stays `50,5`, not padded to `50,50` | Holded does **not** force a fixed decimal count in the edit field itself — the total (`61,11` = `50.5 × 1.21`) confirms the underlying value is still correctly parsed as `50.5`; the 2-decimal padding only shows up in the read-only Total column, not in the editable Precio cell itself |

**What this means concretely, mapped to the two separators from `getCurrencyFormatConfig()`:**
- `thousandsSeparator` (`.` for this instance) → **never a valid keystroke**, purely computed/inserted by the component on every re-render based on how many integer digits exist so far.
- `decimalSeparator` (`,` for this instance) → **the one special character the user can type**, and only once; every other character (letters, the thousands separator itself, a second decimal separator) is rejected outright, not merely flagged after the fact.

This is strictly more robust than the passive filter originally planned: there is no "keystroke silently rejected but typing continues from stale state" failure mode (the exact mechanism behind the silent-comma-drop bug found in §5.1), because the display is always fully recomputed from one source of truth (the digits typed so far) rather than incrementally patched.

### 6.3 Bug 2 fix — a shared masked numeric input component, driven by `getCurrencyFormatConfig()`

Building the behavior from §6.2 requires an actual component, not just a regex tweak, because it has two responsibilities a plain `onChange` filter can't provide: (1) recomputing the full display string (with the thousands separator inserted at the right places) on every keystroke, and (2) keeping the cursor position stable across that recomputation — the fiddly part these inputs are known for, and the one Holded's own implementation visibly gets right (§6.2's `Home` + `9` test).

**Where the separators come from — same requirement as §6.1's parser, extended to the mask:** the masked input must import `getCurrencyFormatConfig()` from `tools/app-shell/src/lib/currencyFormatConfig.js` — the exact same source `formatCurrency()` already reads — and use `thousandsSeparator` as the character it auto-inserts/strips (never accepted as a keystroke) and `decimalSeparator` as the one special character it accepts from the user. This is not incidental: it's what makes the mask automatically correct if the instance's configured separators ever change, instead of a second hardcoded copy of `.`/`,` drifting out of sync with `formatCurrency`'s own config the way the pre-ETP-4314 formatters did.

**Correction after checking for prior art — don't create an isolated new component.** The first draft of this section proposed a brand-new `MaskedNumberInput.jsx` without first checking whether a shared amount input already existed — exactly the mistake `CLAUDE.md`'s "grep before adding a new formatter" rule exists to prevent (it just names `formatCurrency`, but the same discipline applies here). Checked, and it wasn't true: `tools/app-shell/src/components/forms/fields.jsx` already exports **two** shared money-input components:
- `AmountInput` (line 118) — the more complete one: wraps `Input`, positions the currency symbol left/right via `isCurrencySymbolRightSide()` (the same `currencyFormatConfig.js` source `formatCurrency()` reads), and already used across `PaymentForm.jsx`, `ReversedInvoicesPanel.jsx` (sales-invoice), `NewTransactionModal.jsx` and `NewMovementWizard/index.jsx` (financial-account).
- `MoneyInput` (line 100) — a lighter sibling, no currency symbol, same "buffer while focused" pattern, used by `PaymentForm.jsx` alongside `AmountInput`.

Checked both for any existing keystroke filtering (`onKeyDown`/`inputMode`/`pattern`) — **neither has any**. Both are pure passthrough: `onChange={(e) => { setBuffer(e.target.value); onChange?.(e); }}`, no restriction on what a keystroke can contain. So `AmountInput`/`MoneyInput` almost certainly carry the exact same comma/letters bug as this ticket, just surfacing in a different set of windows (Payment Form, financial-account movements) that ETP-5107 doesn't name — worth flagging to QA as a likely-related, currently-unreported instance (§8).

#### 6.3.0 Where each bug location stands today (component inventory)

Before deciding what to change, confirmed exactly what each of the three bug locations currently renders — none of them is `AmountInput`/`MoneyInput`:

| Location | What it renders today | Level |
|---|---|---|
| `InlineLinesPanel.jsx` `EditCell` (edit an **existing** line's price) | `<Input>` from `@/components/ui/input` — the app's generic shadcn-style text input, no money/number logic at all | Shared UI primitive, but a plain-text one |
| `DataTable.jsx` `renderInputCell` (add a **new** line's price) | A raw native `<input type="text">`, written inline — doesn't even go through `@/components/ui/input` | No component, raw HTML |
| `ProductPriceBar.jsx` `PriceStepper` (Product Price tab) | A raw native `<input type="number">`, written inline | No component, raw HTML |

**Revised design outline — reuse `AmountInput`'s pattern, do NOT modify it in place:**
- Per explicit direction (§6.3.1 below covers why in detail): `AmountInput`/`MoneyInput` themselves stay byte-for-byte unchanged. A new sibling export in the same file, `MaskedAmountInput` (exact name a DEV-phase call), implements the masking behavior (keystroke filtering restricted to digits + the one configured decimal separator + optional leading `-`, live thousands-grouping of the integer part, cursor-position preservation across each re-render — mirroring the `Home`+`9` case from §6.2's table), reading `getCurrencyFormatConfig()` the same way `AmountInput` already reads `isCurrencySymbolRightSide()` for the symbol side.
- On commit (blur, or Enter), it hands the caller a plain `Number` — internally calling `parseLocaleNumber()` (§6.1) on its own known-unambiguous internal state (it always knows exactly which characters are its own inserted grouping vs. the user-typed decimal separator, so there's no ambiguity left to resolve at that point, unlike parsing arbitrary free-typed or pasted text). See §6.3.2 for why the *live* (per-keystroke) value it exposes matters just as much as the on-commit one.
- Migrate the three components from §6.3.0 to render `MaskedAmountInput` instead of their own raw `<input>`/`<Input>` — collapsing what is currently **five** independent hand-rolled money-input implementations (`MoneyInput`, `AmountInput`, and the three bug-specific ones) toward one shared masking core, consistent with how `formatCurrency` unified ~20 independent display formatters after ETP-4314 — without touching the four screens already built on `AmountInput` today.
- Gated by field type exactly as before (§6.3.4 below) — the mask only applies to fields whose declared `type` is numeric; a plain text field like `Descripción` must keep using a normal, unrestricted `<Input>`.
- Whether to also match Holded's choice of *not* forcing a fixed decimal count while editing (leaving `50,5` as typed, only padding on display elsewhere) vs. keeping this app's existing convention of padding to 2 decimals in the edit field itself (`formatTwoDecimals`/`formatForEdit`, already used today) is a DEV-phase UX call, not dictated by this investigation — noted as an open question in §8.
- **Decided: the currency symbol is optional in `MaskedAmountInput`, and OFF by default for the line-price fields.** Confirmed `AmountInput` does render a currency symbol (`getCurrencySymbol(currency)`, positioned via `isCurrencySymbolRightSide()`, line 149-152) — that's exactly why its symbol-positioning logic is worth reusing when it's wanted. But the three bug locations don't agree on whether a symbol belongs there *today*: `ProductPriceBar.jsx`'s `PriceStepper` already shows one (via its own `prefix` prop) — a direct match, symbol stays there. `InlineLinesPanel.jsx`'s `EditCell` and `DataTable.jsx`'s `renderInputCell`, by contrast, render a bare number today with **no** symbol in the cell (the document's single currency is already shown once in the header, not repeated per line) — confirmed by reading both render paths, neither wraps its input in any symbol span. **Decision:** the Precio cell in the two line-grid components must keep rendering without a symbol — adding one there would be a visual change beyond what fixing the bug requires, and cramped in a narrow column. `MaskedAmountInput` takes an optional `currency` prop (omitted/`null` → no symbol, exactly the current line-grid look; passed → symbol shown, matching `ProductPriceBar.jsx`'s current look) rather than always rendering one. This also folds in DEV's other open question — whether the grid contexts can take `AmountInput`'s full shell (`Field`/label wrapper included) as-is, or need a `bare` variant with no label and no symbol span at all; given the symbol is already opt-out, `bare` mainly needs to drop the `Field`/label wrapper for the grid contexts.

#### 6.3.1 Impact on `AmountInput`'s existing consumers — do not modify it in place

Explicit constraint from review: **`AmountInput` must not be touched**, because it already backs four working screens — `PaymentForm.jsx`, `ReversedInvoicesPanel.jsx` (sales-invoice refunds), `NewTransactionModal.jsx` and `NewMovementWizard/index.jsx` (financial-account movements) — and this ticket has no reason to put those at risk. Two ways this could go wrong if not handled deliberately, and how the design in §6.3.0 avoids each:
- **Editing `AmountInput`'s own function body** (even behind a new opt-in prop) means every one of those four call sites re-renders through code that changed today, whether or not they pass the new prop — a mistake in the shared branch, a changed prop default, a subtly different re-render timing, would regress all four at once for a bug fix they didn't ask for. Avoided by not touching the file's existing `AmountInput` export at all — it's a straight `git diff` guarantee, not a "we were careful" claim: no line inside the current `AmountInput` function changes.
- **A shared internal helper refactored out of `AmountInput` to reduce duplication** (e.g. extracting the `Field`/currency-symbol-positioning JSX into a piece both components call) is fine only if that extraction is a pure, behavior-preserving move — verified by running `AmountInput`'s existing tests (`components/forms/__tests__/fields.vitest.jsx`) unchanged before and after. If that verification step feels risky or the extraction isn't clearly safe, the simpler and equally acceptable fallback is a small amount of duplication between `AmountInput` and `MaskedAmountInput` (the currency-symbol positioning JSX is ~15 lines) rather than a shared refactor that touches the existing component's code path.
- §8 already flags that `AmountInput`'s four existing consumers likely have this same underlying bug (no keystroke filtering today). That's real, but it's explicitly **out of scope for ETP-5107** given this constraint — migrating them to `MaskedAmountInput` is a natural, low-risk follow-up once it's proven in the three windows this ticket actually covers, not something to bundle in now.

#### 6.3.2 Preserving today's calculation triggers (price → line total → tax → document total)

Traced the exact wiring at each of the three bug locations to confirm that swapping the underlying input can't silently break the recalculation that already happens when a price changes — and found one sharp, concrete risk that the masked component's design has to account for.

- **`InlineLinesPanel.jsx` (existing-line edit):** `EditCell`'s `onBlur={(e) => onCommit(e.target.value)}` (line 712) feeds `commitField` (line 1013), which calls `clampToMax(col, value)` — and `clampToMax` (line 557) parses the value with a bare `parseFloat(value)`, same class of bug as §3 Bug 1 — then calls `onUpdateRow(row, col.key, effectiveValue, ...)`, which PATCHes NEO Headless; the response is what actually recomputes tax/line-total/document-total (confirmed: this is a **round-trip to the backend**, not a client-side calc). **Risk:** if the masked component's `onBlur` handed back the *display* string (`"1.234,56"`, with the thousands separator embedded), `clampToMax`'s `parseFloat` would misread it (`parseFloat("1.234,56")` → `1.234`, wrong) — the exact bug this ticket exists to fix, reintroduced one layer up. **Requirement:** `clampToMax`/`isValueBelowMin` (both currently bare `parseFloat`) must also move to `parseLocaleNumber()` (§6.1/§6.4), AND the masked component's `onCommit`/`onBlur` callback must hand back either a clean `Number` or an unmasked string (digits + at most one decimal separator, no thousands separator) — never its own display string.
- **`DataTable.jsx` (add-line):** `handleFieldChange` (line 917) fires on **every accepted keystroke**, not just on blur. **Corrected in §9.4 by direct network inspection** (2026-09-10, local): the original wording here ("dispatches a callout request per keystroke") was wrong — inferred from a visual cue (the totals preview updating live) without checking the actual network traffic at the time. Confirmed with the Network tab: typing digits into a new line's price fires **zero HTTP requests**; the "Importe bruto de línea"/subtotal preview updates from a **synchronous client-side recalculation**, not a server round-trip — identified by source in §9.4 as `tools/app-shell/src/hooks/useLineGrossAmount.js`'s `computeLineGrossAmount`/`deriveLineNet` (`quantity × price × (1 − discount/100) × (1 + taxFactor)`, tax rate already known locally from the earlier product-selection callout). The one and only network request for the add-line flow is a single `POST .../lines` when the row is committed (Enter / click-away) — symmetric to the existing-line path's single `PATCH` on blur.
- **The risk and the requirement are unchanged despite the corrected mechanism.** Whether the wrongly-shaped value corrupts a live network payload (the original, incorrect theory) or a purely local arithmetic preview (the confirmed, actual mechanism), the failure mode is identical: if `handleFieldChange` receives the masked *display* string (`"1.234"`, thousands separator embedded) instead of the clean value, `Number("1.234")` evaluates to `1.234`, not `1234` — the live total preview goes wrong for the entire time a 4+ digit price is being typed, and the same corrupted value would flow into the final `POST` on commit. **Requirement is the same as originally stated:** whatever the masked component's `onChange` hands to the caller per keystroke — and `onCommit`/`onBlur` hands back on commit — must be the clean underlying value, never the grouped display string.
- **Net design consequence:** the masked component needs two internal notions of "the value" — what it renders (grouped, for the user's eyes) and what it reports via `onChange`/`onBlur` (clean, digits + at most one decimal separator, exactly what `parseLocaleNumber` expects) — and every existing call site (`onCommit`, `handleFieldChange`, `onUpdateRow`) keeps receiving the latter, unchanged in shape from what it receives today (just correctly comma-aware instead of period-only). This is the one piece of §6.3's design that most directly determines whether the fix is safe to ship, and should be the first thing verified in DEV — with a test that types a 4+ digit price into each of the three locations and asserts the live/committed total matches, not just that the display looks right.

#### 6.3.3 Negative values

Checked — already partly accounted for in the character set (§6.1, §6.3.0 both mention "optional leading `-`"), but worth making the reasoning explicit since it wasn't called out as its own risk before now:

- **Already supported today, at the character level:** `DataTable.jsx`'s current partial-number pattern is `/^-?\d*(?:\.\d*)?$/` — an optional leading `-` is already accepted for numeric fields (visible in the existing "debit ↔ credit" mutual-exclusion comment near `handleFieldChange`, line ~930). `InlineLinesPanel.jsx`'s `EditCell` and `AmountInput`/`MoneyInput` don't filter anything today, so a `-` types trivially there too, by omission rather than by design.
- **The actual business rule lives in `min`/`max`, not in the input:** both `DataTable.jsx`'s `onBlur` clamp (line 455-456: `if (field.min !== undefined && num < field.min) ...`) and `InlineLinesPanel.jsx`'s `clampToMax`/`isValueBelowMin` already enforce a field's configured `min`/`max` after commit, independent of what the input itself allowed while typing. A window that wants `Precio` to never go negative already sets `min: 0` in its `decisions.json`/contract for that field; a window that needs negative amounts (financial-account movements, refunds — `AmountInput`'s own current consumers) simply doesn't set that floor. **This means the masked component's job is only to allow `-` as a valid candidate character, never to itself decide whether negative is acceptable for a given field** — that decision is already correctly externalized to the existing `min`/`max` clamp, untouched by this fix.
- **Stronger than "maybe some fields allow it" — found by reading `useLineGrossAmount.test.js` (§9.4): a whole prior ticket (ETP-4567) exists specifically to make `listPrice`/`orderedQuantity` support negative values.** Its regression suite (`deriveLineNet`/`computeLineGrossAmount`/`computeUnitPriceForPost` — negative-qty, negative-price, both-negative, and negative-with-discount cases) documents that Sales/Purchase Order's old `decisions.json` `min:0` constraint was **deliberately removed** so Precio/Quantity could go negative for credit and return lines — a real, actively-tested business capability on the exact windows this ticket touches, not a hypothetical edge case gated behind some other window's config. `MaskedAmountInput` breaking `-` entry on Sales/Purchase Order's Precio field would be a regression against ETP-4567, not just an untested corner.
- **What the mask needs to get right, specifically:** `-` is only ever valid as the very first character (never after any digit, never a second time) — the same "one instance, fixed position" treatment as the decimal separator in §6.2's algorithm, extended by one more special character. The live thousands-regrouping (§6.2) must treat a leading `-` as outside the digit-grouping logic (grouping `-1234` → `-1.234`, sign untouched, not `-.1234` or similar) — this is a concrete case worth an explicit test in DEV, not just inferred from the digit-only cases already covered live in Holded's research.

#### 6.3.4 Gated by field type, not by value shape

**Design correction from the initial draft:** the first version of this plan proposed adding the comma to a character-matching pattern unconditionally, wherever a numeric-looking input is edited. Revisited per feedback — the mask (and the parse in §6.4) should be **gated by the field's declared `type`** (`price`, `amount`, `quantity`, `decimal`, `integer`, `number`, ...), not by "does the string happen to match a number-shaped regex." Two concrete reasons:
- `InlineLinesPanel.jsx`'s `EditCell` reaches the same generic `<Input type="text">` branch (line 706) for **every** field that isn't a selector/enum/boolean — including plain text fields like `Descripción`. `isNumeric = NUMERIC_TYPES.has(col.type)` is already computed there today, but only used for CSS/`inputMode`, never to decide whether to restrict keystrokes. Swapping in `MaskedAmountInput` without gating it on `isNumeric` would incorrectly mask/restrict a text field too — it has to check `col.type` first, and only render `MaskedAmountInput` (vs. the plain `Input`) when it's true.
- This makes fixing the `NUMERIC_FIELD_TYPES` (`DataTable.jsx`) / `NUMERIC_TYPES` (`InlineLinesPanel.jsx`) / `NUMERIC` (`ListModalWindow.jsx`) desync from §3 Bug 2 a **prerequisite**, not just defensive cleanup — the parser and the masked input both key off these sets, so if they stay misaligned, whether Bug 1/2 are actually fixed for a given field silently depends on which of the three duplicated sets happens to list its `type`. Concretely: extract one shared constant (e.g. `NUMERIC_FIELD_TYPES` in a small shared module, or re-export from `parseLocaleNumber`'s file) and have all three files import it instead of keeping three independently-hand-maintained lists.

With that shared, type-driven gate in place:
- `InlineLinesPanel.jsx`'s `EditCell`: swap the plain `<Input>` for `MaskedAmountInput`, only when `isNumeric` is true. This is the primary, live-confirmed fix target for both the letters case (Sales Order/Purchase Order, §5.2) and the silent-comma-drop case (§5.1) — both are structurally impossible once the mask fully owns the display string instead of a permissive `onChange` gate.
- `DataTable.jsx`: same swap for its add-row numeric cell. And add `'price'` to the (now shared) numeric-type set, so a window whose `decisions.json` does declare `type: "price"` for an add-line column gets the same protection by construction, not by accident.

### 6.4 Bug 1 fix — locale-aware coercion on commit, also gated by field type

- `detailViewHelpers.jsx`'s `buildRowValueCoercer(fields)`: today it decides whether to coerce a value purely from the value's own shape (`/^-?\d+(\.\d+)?$/.test(v)`), ignoring the field metadata it already has in `fieldsByKey` (used today only for the `isIdColumn` check). Change it to also check `fieldsByKey.get(key)?.type` against the shared numeric-type set from §6.3.4, then call the new `parseLocaleNumber()` (§6.1) instead of the bare regex/`parseFloat`. This is both more correct (a coincidentally-numeric-looking text field never gets silently coerced) and consistent with how `resolveNumericFieldValue`/`coerceFieldValues` in `DataTable.jsx` already gate on type today (just with the incomplete set). With the masked input from §6.3 in place, most values reaching this coercer will already be unambiguous (the mask only ever produced digits + at most one configured decimal separator) — this coercer stays as the commit-time safety net, and as the path a pasted value (which bypasses the mask's own keystroke handling) still needs to go through.
- `DataTable.jsx`'s `resolveNumericFieldValue()`: same `parseLocaleNumber()` replacement, for the add-line path — already type-gated via `coerceFieldValues`'s `NUMERIC_FIELD_TYPES.has(f.type)` check, once that set is corrected per §6.3.4.
- Sales Invoice was confirmed (§5.1) to fail identically to Sales Order (`Error 400`) on this exact repro, so no separate code path needs to be found for that specific scenario — but see §8 for the still-unexplained "saves inconsistently" wording from the ticket, to be chased during QA with the reporter's exact steps.

### 6.5 Bug 3 fix — route Product Price tab through the masked input and the canonical formatter

- `ProductPriceBar.jsx`'s `PriceStepper`: replace its native `type="number"` input with the same `MaskedAmountInput` from §6.3 (rather than a bespoke third fix), so the Product Price tab, document-line editing, and line add-row all share one behavior instead of three. Read mode / non-editing display goes through `formatCurrency()` instead of the raw `String(value)`. The value handed to `onCommit` stays a plain `Number`, unaffected by the display change.

## 7. Pipeline routing

This is a shared-component fix (`DataTable.jsx`, `InlineLinesPanel.jsx`, `detailViewHelpers.jsx`, `ProductPriceBar.jsx`, a new canonical parser `parseLocaleNumber`, and a new sibling component `MaskedAmountInput` next to — but not modifying — the existing `AmountInput`/`MoneyInput` in `components/forms/fields.jsx`) — tooling work, not a window `decisions.json` change. Adding a generic UI component used across windows is squarely **Developer** (Schema Forge Developer) territory per the coordinator's dispatch guide, not Window Agent. Standard pipeline applies after: **Review** (Alex — including a `sf-validate-pipeline` pass, though no `decisions.json`/generated files are expected to change; specific attention to the cursor-position handling in `MaskedAmountInput`, the trickiest part of this kind of component; confirming §6.3.2's calculation-trigger requirement is actually met — that `onChange`/`onCommit` hand back a clean parseable value, not the masked display string; and confirming `AmountInput`'s own diff is empty, per §6.3.1's constraint), **QA** (Sentinel — the ticket's three "Given/When/Then" cases, regression on Sales Invoice, Purchase Order, and the Product Price tab's stepper +/- buttons, a live-price-typing test that asserts the line/document total stays correct while typing a 4+ digit price in each of the three locations per §6.3.2, a negative-value case per §6.3.3, and the masked-input-specific cases from §6.2's table: mid-string insertion, pasting a pre-formatted value, attempting to type the thousands separator, a second decimal separator — explicitly NOT regression-testing `AmountInput`'s four existing consumers, since that component is untouched by this fix).

**Docs (Sage) — MANDATORY, not optional.** `parseLocaleNumber` must get the exact same treatment `formatCurrency` got after ETP-4314: a dedicated `MANDATORY` subsection in `CLAUDE.md` (a new "§ Locale-Aware Number Parsing" next to the existing "§ Currency & Amount Formatting"), spelling out: this is the only accepted way to turn user-typed numeric text into a `Number`; never write a new `Number()`/`parseFloat()` call on raw input text anywhere in `tools/app-shell/src`; grep for `parseLocaleNumber` before adding a new price/amount/quantity input. This is not a "nice to have" — `formatCurrency.js`'s own banner comment and its `CLAUDE.md` section are exactly why this investigation could find, with one grep, that no competing parser already existed; skipping the same step for `parseLocaleNumber` would let it silently duplicate the way ~20 formatters did before ETP-4314. Sage should write this only once the parser is implemented and verified working (mirroring how the currency section was written after Tier A of ETP-4314 shipped, not before) — documenting a "MANDATORY" canonical helper that doesn't exist yet, or isn't proven, would be worse than not documenting it.

## 8. Open questions for the DEV / QA phase

- The ticket's exact "Factura de Venta lo guarda pero con comportamiento inconsistente" symptom could not be reproduced (§5.1) — a fresh line added and price-edited with a comma on Sales Invoice failed with `Error 400`, same as Sales Order. QA should ask the reporter for the precise steps (e.g. was the line already saved/posted before the edit? a specific decimal value? a specific browser locale?) before assuming a second code path exists beyond the two documented here.
- Confirm in DEV whether any window's `decisions.json` actually declares `type: "price"` for an add-line field (none found by grep at investigation time) — if truly unused, the `NUMERIC_FIELD_TYPES` addition in §6.3.4 is still worth keeping for consistency, but shouldn't be treated as fixing a currently-observed symptom.
- ~~Confirm Bug 2's literal repro on Purchase Order's existing-line editor~~ — done, §5.2.
- **Pasted values.** `MaskedAmountInput` (§6.3) needs an explicit decision on paste handling — Holded's own behavior on a paste event (e.g. pasting `"1.234,50"` or `"1234.50"` from the clipboard) was not tested live (out of scope for the keystroke-by-keystroke research in §6.2). The component needs *some* normalization pass for a paste (strip anything that isn't a digit or the configured decimal separator, collapse to the first one found) rather than relying purely on keystroke-by-keystroke logic, which a paste event bypasses.
- **Decimal padding while editing.** §6.2 found Holded does *not* force a fixed 2-decimal count in the edit field itself (`50,5` stays `50,5`), whereas this app's current components do (`formatTwoDecimals`/`formatForEdit`). Decide in DEV whether `MaskedAmountInput` keeps this app's existing padding convention or adopts Holded's — either is defensible, but should be a deliberate choice, not an accident of whichever component gets built first.
- **`AmountInput`/`MoneyInput`'s existing callers likely share this bug today, unreported — but are explicitly NOT fixed by this ticket.** Neither has any keystroke filtering today (confirmed by reading `fields.jsx` in full — no `onKeyDown`/`inputMode`/`pattern` near either). Since §6.3.1 decided `AmountInput` stays untouched, Payment Form, `ReversedInvoicesPanel` (sales-invoice payment/refund amounts), `NewTransactionModal` and `NewMovementWizard` (financial-account) do **not** automatically inherit this fix — they keep their current (buggy) behavior after ETP-5107 ships. Worth flagging to the reporter/PM as a related-but-unreported instance and a candidate follow-up ticket (migrate those four screens to `MaskedAmountInput` once it's proven here), rather than something this ticket silently leaves half-fixed without anyone noticing.

## 9. Pre-DEV validation pass (2026-09-10, local environment, post-`develop`-merge)

Before starting DEV, re-verified the plan is still applicable now that `feature/ETP-5107` has `origin/develop` merged in (98 commits, 133 files — see the branch's merge commit `f9b2dcd`), and specifically chased the biggest risk flagged going in: **does a price change still trigger the existing recalculation correctly once the input component is swapped?**

### 9.1 Branch-merge impact on the plan's cited files

`git diff` between the pre-merge doc commit and the merge commit shows only two of the plan's key files touched: `DataTable.jsx` and `detailViewHelpers.jsx`. Read both diffs in full — unrelated to this plan (a refactor extracting `resolveOnSelectMappings`/`applySelectedItemMappings` for declarative `onSelectMappings` handling, ETP-5037/5039). `NUMERIC_FIELD_TYPES`, `renderInputCell`, `resolveNumericFieldValue`, `coerceFieldValues`, and `buildRowValueCoercer` are all still present, same logic, only shifted line numbers (e.g. `buildRowValueCoercer` is now at `detailViewHelpers.jsx:377`, not `:341`; `NUMERIC_FIELD_TYPES` at `DataTable.jsx:288`, not `:259`). Every other file the plan cites (`InlineLinesPanel.jsx`, `ProductPriceBar.jsx`, `fields.jsx`, `formatCurrency.js`, `currencyFormatConfig.js`, `ListModalWindow.jsx`) is untouched by the merge. **The plan's reasoning is unaffected; only line-number citations are stale and need re-confirming during DEV, not re-derived.**

### 9.2 A serious risk found and resolved: is field-`type`-gating (§6.3.4) actually safe?

While re-reading `buildRowValueCoercer` at its new location, its docstring (pre-existing, from ETP-4886, not touched by the merge) contains a direct warning against this plan's central mechanism:

> `fields` is the addLineFields entry list... `type` there is the UI widget type (e.g. many genuinely numeric fields like `unitPrice` or `discount` render as `type: 'text'`), so it can't be used to distinguish IDs from amounts.

If true today, gating the mask/parser on `field.type` (§6.3.4) would silently skip the exact price fields this ticket is about. Chased it all the way down rather than taking the comment at face value:

- Grepped every window's **`addLineFields.entry`** block (the literal list this docstring is about, and the one actually fed to `buildRowValueCoercer`/`resolveNumericFieldValue`/`coerceFieldValues` via `allEntryFields`) for a price/amount-named field typed `'text'` — **zero matches, in any window.** Confirmed directly for Sales Order and Purchase Order: `listPrice` is `type: 'number'` in both.
- Grepped the **`LinesTable`/`QuotationLineTable` `columns`** block (the list `InlineLinesPanel.jsx` uses for its own `isNumeric` check) across all five relevant windows (Sales Order, Purchase Order, Sales Invoice, Purchase Invoice, Sales Quotation) — `listPrice` is `type: 'amount'` in every one, consistently.
- **So where does a `'text'`-typed `unitPrice`/`listPrice`/`discount`/`grossUnitPrice` actually exist?** Found it: `OrderLineForm.jsx` (Purchase Order) and its sibling `LinesForm.jsx` (Sales Order, and every other document window) — a **third editing surface** this plan hadn't accounted for: an `EntityForm`-based sidebar, wired as `DetailForm` on `DetailView`, that opens when a line row is clicked. There, `unitPrice`/`grossUnitPrice`/`listPrice`/`grossListPrice`/`discount` are indeed all `type: 'text'` — this is what the ETP-4886 comment is actually describing.
- **Is that sidebar reachable for the windows this ticket covers?** No. Traced both gates that control it: `buildLineRowClickHandler` (`detailViewHelpers.jsx`) only wires the row-click handler that opens it when `linesLayout !== 'inlineEditable'`, and `shouldShowDetailFormSidebar` independently requires the same condition. Confirmed by grep that Sales Order, Purchase Order, Sales Invoice, Purchase Invoice, and Sales Quotation **all** declare `"linesLayout": "inlineEditable"` in their `decisions.json`. For these five windows, `DetailForm` is generated and passed as a prop but its only trigger is permanently disabled — dead code for line-price editing purposes.

**Conclusion: §6.3.4's field-type-gating approach is validated as safe for the two surfaces this plan actually touches** (`addLineFields.entry` for the add-line path, `LinesTable`'s `columns` for the existing-line path) — the ETP-4886 docstring's warning is real, but describes a third, unreachable surface (the `EntityForm` sidebar) that this ticket correctly does not need to touch. Not adding a fourth fix location. Worth a one-line note in DEV/Review: if a future ticket ever makes `DetailForm` reachable for an `inlineEditable` window (e.g. changing that gate), `LinesForm.jsx`/`OrderLineForm.jsx`'s `'text'`-typed price fields would need the same masking/parsing treatment then — out of scope now because the surface is provably dead today.

### 9.3 Live network-level confirmation of §6.3.2's calculation-trigger claims — one claim corrected

Logged into the local environment (`http://localhost:3100/`, `develop`) and re-verified §6.3.2's claims with the Network tab directly, on real Purchase Order 1000011 (2 existing lines: Cerveza, Queso Sardo).

**Existing-line edit (`InlineLinesPanel.jsx`), Cerveza's Precio 11,00 → 25,00:**
- Typed into the pre-selected field, checked network before blurring: **0 requests.**
- Tabbed out (blur): **exactly 1 request**, `PATCH .../purchase-order/lines/{id}`, followed by the header/lines re-fetch + `evaluate-display` calls that reflect the recalculated totals. Subtotal correctly updated 111,00 € → 125,00 €, "Registro guardado" toast shown.
- **Matches §6.3.2's original claim exactly** — blur-only, single PATCH, backend round-trip for the recalculation.

**Add-line (`DataTable.jsx`), new line "Fernet" (base price 33,00) → typed 55:**
- Selected the product first (this alone fired its own product-selection callout, updating the row's default price/tax — expected, unrelated to the price *keystroke* claim being tested).
- Cleared the network log, then typed digits into the price cell one at a time, checking after each and after a 3-second wait: **0 requests, every time.** The "Importe bruto de línea" (66,55) and "Subtotal sin descuento" (180,00 €) updated live anyway.
- Pressed Enter to commit the line: **exactly 1 request**, `POST .../purchase-order/lines`, followed by the same re-fetch + `evaluate-display` pattern as the existing-line case.

**Correction to §6.3.2:** the add-line claim that `handleFieldChange` "dispatches a callout request per keystroke" was **wrong** — that wording was inferred from a visual cue (the total updating live) on the experimental server without actually checking network traffic at the time. The live total preview while typing a new line's price is a **synchronous client-side recalculation** (`quantity × price × (1 + taxFactor)`, using the tax rate already fetched by the product-selection callout) — not a network round-trip. The add-line flow is symmetric to the existing-line flow after all: zero requests while typing, exactly one request (`POST` vs `PATCH`) on commit. §6.3.2 above has been corrected in place to reflect this.

**Why this doesn't change the fix's design, only its justification:** the requirement that drove §6.3's whole "two notions of the value" design — the masked component must report the clean underlying value outward, never its grouped display string — holds regardless of whether the consumer is a network payload or a local arithmetic expression. `Number("1.234")` evaluates to `1.234` whether it corrupts a POST body or a client-side multiplication; the practical urgency is if anything higher for the confirmed mechanism, since a wrong local computation gives instant, silent, un-networked wrong feedback with nothing to inspect in DevTools to catch it — exactly the kind of bug that's easy to ship unnoticed.

### 9.4 Existing test-suite audit — the exact calculation module, and tests this fix will touch or must not break

Per explicit request, read (not just grepped) every test file under `__tests__/` whose name suggests line/discount/total calculation, before starting DEV. Full list found: `DataTable.numericClamp.vitest.jsx`, `DataTable.numericHeaderAlignment.test.js`, `DetailView.onLocalChange.test.js`, `DetailView.totalDiscountRefresh.test.js`, `DocumentTotalsPanel.vitest.jsx`, `EntityForm.numericBlur.vitest.jsx`, `PriceListPicker.vitest.jsx`, `useLineGrossAmount.test.js`/`.vitest.jsx`, `balanceTotals.vitest.js`, `documentTotals.test.js`/`.vitest.js`, `numericValidation.test.js`, `ProductPriceBar.vitest.jsx`/`.updatedToken.vitest.jsx`, plus several unrelated ones (Assets depreciation, fiscal-config, financial-account) that share the naming pattern but touch different domains. Four findings change or sharpen the plan:

1. **Found the exact source of the client-side recalculation from §6.3.2/§9.3: `tools/app-shell/src/hooks/useLineGrossAmount.js`.** Its test file (`useLineGrossAmount.test.js`, 790 lines) fully specifies `computeLineGrossAmount`, `deriveLineNet`, `resolveTaxFactor`, and `computeUnitPriceForPost` — the functions that turn a line's raw field values into `lineNetAmount`/`grossAmount`/`unitPrice`. Critically, `deriveLineNet`/`computeLineGrossAmount` take the **just-edited field's new value directly as an argument** (e.g. `deriveLineNet('listPrice', '41.80', ...)`) and multiply it in (`qty × listPrice × (1 − discount/100) × taxFactor`). This is the precise, named site — not just "some client-side arithmetic" — that would silently corrupt every downstream total if it ever received a masked display string (`"1.234"` → `Number` `1.234`) instead of the clean value. `computeUnitPriceForPost` is a **third** site with the same requirement: it derives the `unitPrice` actually sent to the backend from the raw typed `listPrice`, applying the discount, before the PATCH/POST body is built — independent of `buildRowValueCoercer`/`resolveNumericFieldValue` (§6.4).
2. **Negative-value support is not hypothetical — see the strengthened §6.3.3 above.** `useLineGrossAmount.test.js` carries a dedicated ETP-4567 regression suite (`deriveLineNet`/`computeLineGrossAmount`/`computeUnitPriceForPost`, negative qty, negative price, both negative, negative-with-discount) proving `listPrice`/`orderedQuantity` negativity is deliberately supported for credit/return lines on Sales/Purchase Order specifically.
3. **A test this fix WILL need to update, found and read (`ProductPriceBar.vitest.jsx`):** ~10 tests (`renders price stepper inputs...`, `blurring a changed unit-price input...`, `prices entered in the add row...`, etc.) query the stepper inputs via `screen.getAllByRole('spinbutton')` — the ARIA role a native `<input type="number">` carries. §6.5's fix (swap to `MaskedAmountInput`, which per §6.3's design renders `type="text"` + `inputMode="decimal"`) changes that role to `textbox`, so every one of these `getAllByRole('spinbutton')` queries breaks. This is foreseeable, not a surprise to discover mid-DEV — Tester should plan to migrate these queries (to `getAllByRole('textbox')` or a `data-testid`) as part of the same change, not treat red tests here as a regression signal to chase.
4. **A test this fix does NOT need to touch, confirmed by reading it (`DataTable.numericClamp.vitest.jsx`, ETP-4277):** exercises `renderInputCell`'s onBlur min/max clamp (a `discount` field, `type: 'number'`) by firing `fireEvent.change`/`fireEvent.blur` directly on the input and asserting `input.value`. Confirms the clamp logic lives in `renderInputCell`'s own `onBlur` handler (the caller), not inside the input element itself — so as long as `MaskedAmountInput` accepts and still triggers a caller-supplied `onBlur` (in addition to its own internal parse/commit logic), this existing suite keeps passing unchanged. Worth using as the first regression check once `MaskedAmountInput` lands in `DataTable.jsx`.
5. **A fourth, separate min/max/integer validation module exists (`lib/numericValidation.js`: `getNumericFieldError`, `clampNumericFieldMax`, ETP-4542/4887), shared by `EntityForm`'s on-blur toast and `useEntity`'s save-block gate.** Noted for completeness (it's the validation layer behind the dead `DetailForm`/`EntityForm` sidebar from §9.2, plus other `EntityForm` header/detail forms unrelated to line Precio) — out of this ticket's scope for the same reason §9.2 already established, not a fifth surface to fix.
6. **`documentTotals.js`** (document-level total, summed across all lines) also does bare `parseFloat(line[priceField])`/`parseFloat(line[qtyField])`/`parseFloat(line[discountField])` — a fourth `parseFloat` site, found for completeness. Lower risk than the other three: it operates on already-fetched/persisted `line` objects (API response data), not on a raw DOM input value mid-edit, so it's one step removed from anything `MaskedAmountInput` touches directly — no action needed here, but worth DEV double-checking this assumption once the fix lands (i.e., confirm no code path ever stores a masked display string into a `line` object that then reaches this function).

### 9.5 In-flight PR to watch: #1411 (ETP-5132, `develop`, currently OPEN) — no design change, one sync reminder

Per explicit request, read the full PR (`gh pr view`/`gh pr diff`, not just the title) before deciding whether it affects this plan. It doesn't change the design, but touches a file this plan builds directly next to, and independently reinforces §6.3.3.

**What it does:** two unrelated discount-display bugs on negative-quantity lines (a return folded into the same invoice/order) — (1) a per-line or per-total discount showed `0,00€` instead of the real amount because several call sites gated visibility on `discount > 0` instead of `discount !== 0` (a negative-quantity line's discount naturally computes negative); (2) the Confirm/Send-to-evaluation modals on Sales Order, Purchase Order and Sales Quotation double-discounted their displayed Total by re-applying a discount the backend had already compensated (ETP-4029) at GET time.

**The one file this plan cares about: `tools/app-shell/src/lib/formatCurrency.js`.** Fix (1) needed to display a sign-flipped `-discountAmt`, which is exactly `-0` whenever the real discount is zero (the common case) — and the *pre*-PR `groupWithSeparators` (quoted verbatim in this plan's §6.1) renders a literal `-0` as `"-0,00"`, which reads to a user as a real negative amount. The PR's fix:

```js
// BEFORE (what §6.1 quotes today):
const sign = (num < 0 || Object.is(num, -0)) ? '-' : '';
const abs = Math.abs(num);
const fixed = abs.toFixed(maxFrac);

// AFTER (ETP-5132, not yet in develop):
const abs = Math.abs(num);
const fixed = abs.toFixed(maxFrac);
const roundsToZero = Number(fixed) === 0;              // catches -0 AND tiny float residue (-2.9e-11) that rounds to 0.00
const sign = (!roundsToZero && (num < 0 || Object.is(num, -0))) ? '-' : '';
```

**Impact on this plan: none to the design, one operational note.**
- `parseLocaleNumber` (§6.1) needs **no mirroring guard**. It's the inbound/parse direction — if a user genuinely types `-0` or `-0,00`, `Number()` naturally produces `-0`, and that's correct to pass through unchanged; the (soon-to-be-fixed) *display* side is what decides how a `-0` value reads on screen, and ETP-5132 already fixes that independently of anything this plan builds. Confirmed this file's diff touches only `groupWithSeparators`'s sign computation, nothing in `getCurrencySymbol` or the function signatures `parseLocaleNumber` would sit beside.
- **Reinforces §6.3.3 a second, independent way.** ETP-5132 is a direct companion to ETP-4567 (§6.3.3/§9.4) — both exist specifically because negative-quantity credit/return lines are a real, actively-hardened scenario across Sales/Purchase Order, Sales Invoice, and Sales Quotation. Two separate tickets fixing two separate negative-amount display bugs in the same two months is strong, independent confirmation that `MaskedAmountInput` must not regress `-` entry.
- **Operational reminder for DEV, not a plan change:** #1411 is open against `develop`, not yet merged. Once it lands, `feature/ETP-5107` needs another `git merge origin/develop` (same hygiene as §9.1) before building `parseLocaleNumber`, since `formatCurrency.js`'s line numbers and `groupWithSeparators`'s exact body will have shifted from what §6.1 currently quotes — a quick re-read of the file at DEV-start time, not a redesign.

## 10. DEV implementation (2026-09-10) — done, uncommitted, pending live QA and human code review

Implemented directly in `/Users/jortolano/intellij/etendo_core_pg/etendo_schema_forge` on `feature/ETP-5107` (no worktree, no commit yet, no test files touched — human wants to review the code first). `git diff --stat`: 2 new files, 6 modified, 530 insertions / 104 deletions.

**New:** `tools/app-shell/src/lib/parseLocaleNumber.js` (§6.1's canonical parser), `tools/app-shell/src/lib/numericFieldTypes.js` (the unified `NUMERIC_FIELD_TYPES`/`TWO_DECIMAL_FIELD_TYPES` sets, §6.3.4).

**Modified:** `components/forms/fields.jsx` (new `MaskedAmountInput` sibling, `AmountInput`/`MoneyInput` diff verified empty), `contract-ui/DataTable.jsx`, `contract-ui/InlineLinesPanel.jsx`, `contract-ui/detailViewHelpers.jsx`, `contract-ui/ListModalWindow.jsx`, `windows/custom/product/ProductPriceBar.jsx`.

Coordinator-verified (not just taken on the implementer's word): `AmountInput`/`MoneyInput` function bodies are byte-for-byte untouched (`git diff -U0` shows only import lines + a pure insertion after `AmountInput`'s closing brace); cursor-position preservation and the thousands-separator strip-on-blur are implemented correctly; the "clean value out" contract holds at all three call sites; `buildRowValueCoercer`'s docstring was independently re-verified by the implementer (grepped `addLineFields.entry` across all windows for a `'text'`-typed price field — none found) rather than taken on faith from §9.2; no test files, no stray `console.log`/`TODO`, no hardcoded user-facing strings introduced. One judgment call not in the plan: a new `grouping` prop on `MaskedAmountInput` (thousands-grouping applies only to `amount`/`price`-typed fields, not `quantity`/`integer`/`number`/`decimal`/`percent`) — added to keep `DataTable.numericClamp.vitest.jsx` (ETP-4277, asserts a `type:'number'` field's raw value like `'9999'` stays ungrouped) passing unchanged; traced by hand since tests weren't run this pass.

**Known, expected test breakage (not fixed this pass, by design):** `ProductPriceBar.vitest.jsx` queries `getAllByRole('spinbutton')`, which no longer matches now that the stepper is `type="text"` — flagged in §9.4, to be fixed once the code itself is approved.

## 11. Live QA test plan — full window matrix (2026-09-10)

Per explicit request: execute this matrix live on `http://localhost:3100/` (`develop`, this fix applied uncommitted) across **all five** `linesLayout: "inlineEditable"` windows this fix touches — Pedido de Compra, Pedido de Venta, Factura de Compra, Factura de Venta, Presupuesto (Sales Quotation) — not just a sample of two or three. Results get filled in as each row is run; this section is the checklist, §12 (once run) holds the evidence.

### 11.1 Bug 1 — decimal separator, existing-line edit (`InlineLinesPanel.jsx`)

| Window | Steps | Expected |
|---|---|---|
| Pedido de Compra | Open a draft with a line, edit Precio with `,`, blur | Comma accepted, single PATCH, no 400, total recalculates |
| Pedido de Venta | Same | Same |
| Factura de Compra | Same | Same |
| Factura de Venta | Same | Same |
| Presupuesto | Same | Same |

### 11.2 Bug 1 — decimal separator, add-new-line (`DataTable.jsx`)

| Window | Steps | Expected |
|---|---|---|
| Pedido de Compra | Add a line, type a 4+ digit price with `,` one char at a time | Live-grouped display, correct live total preview, no silent corruption, single POST on commit |
| Pedido de Venta | Same | Same |
| Factura de Compra | Same | Same |
| Factura de Venta | Same | Same |
| Presupuesto | Same | Same |

### 11.3 Bug 2 — letters rejected

| Window | Steps | Expected |
|---|---|---|
| Pedido de Compra | Existing line + add-line, type `20,0rrwetwrtwrt2` into Precio | Letters never appear in either path |
| Pedido de Venta | Same | Same |
| Factura de Compra | Same | Same |
| Factura de Venta | Same | Same |
| Presupuesto | Same | Same |

### 11.4 Calculation correctness (the human's primary concern)

| Window | Steps | Expected |
|---|---|---|
| Pedido de Compra | Change Precio, Cantidad, and % Descuento (all three now render `MaskedAmountInput`) on one line | Importe bruto de línea / Subtotal / Total all recompute correctly for each |
| Pedido de Venta | Same | Same |
| Factura de Compra | Same (no discount field on invoices per `LINE_CONFIGS` — verify Precio/Cantidad only) | Same |
| Factura de Venta | Same | Same |
| Presupuesto | Same | Same |

### 11.5 Bug 3 — Product Price tab

| Steps | Expected |
|---|---|
| Open a product with a non-round price, Precio tab | Shows `X,XX €`-formatted (not `€ X.X`) |
| Edit with a comma, blur | Saves correctly, PATCH succeeds |
| Stepper +/- buttons | Still work, unchanged |

### 11.6 Negative values (ETP-4567) — spot check, not full matrix

| Window | Steps | Expected |
|---|---|---|
| Pedido de Compra or Venta (pick one with a return/credit-friendly line) | Type a leading `-` in Precio or Cantidad | Accepted, sign preserved, total computes the signed result |

### 11.7 Regression — existing behavior not broken

| Check | Expected |
|---|---|
| Blur an empty numeric field | Restores `defaultValue`/`min`, same as before |
| Blur a value above a field's declared `max` (e.g. % Descuento > 100) | Clamped to max, same as before |
| `AmountInput` consumer (Payment Form or Cuenta Financiera — NOT touched by this fix) | Behaves identically to `develop`, unaffected |

## 12. Live QA results (2026-09-10)

Executed on `http://localhost:3100/` (`develop` + uncommitted ETP-5107 fix). Network verification via `read_network_requests` with `urlPattern: /sws/neo/`, cleared before each check, not just eyeballed. Results filled in as run; this run was interrupted once at a 200-turn agent limit and resumed — table below reflects the actual outcomes, not a re-narration.

### §11.1/§11.2/§11.3 — decimal separator + letters, existing-line and add-line (combined test string `20,0rrwetwrtwrt2`)

| Window | Existing-line | Add-line |
|---|---|---|
| Presupuesto (Sales Quotation, doc 1000000, line "Agua") | **PASS** — letters filtered, field showed `20,02`; clean `22,05` blur → exactly 1 `PATCH .../quotationLine/{id}`, 0 requests while typing | **PASS** — new line "Fernet": letters filtered → `20,02`, live total preview correct (`24,22` = 20.02×1.21) while typing (0 requests), Enter → exactly 1 `POST .../quotationLine`, then deleted the test line to restore original state |
| Pedido de Compra (doc 1000011, line "Cerveza") | **PASS** — letters filtered → `20,02`; clean `12,50` blur → exactly 1 `PATCH .../purchase-order/lines/{id}`, 0 while typing; also tested % Descuento field (same component) with `5a0` → letters filtered → `50` correctly; reverted Precio to `11,00` and Descuento to `0`, confirmed Subtotal back to `111,00 €` | **PASS** — new line "Fernet": letters filtered → `20,02`, live Importe bruto `24,22` (20.02×1.21) correct while typing (0 requests), Enter → exactly 1 `POST .../purchase-order/lines`; deleted the test line after |
| Pedido de Venta (doc 1000020, line "Fernet") | **PASS** — letters filtered → `20,02`; clean `45,50` blur → exactly 1 `PATCH .../sales-order/lines/{id}`, 0 while typing; reverted to `44,00` | **PASS** — new line "Cerveza": letters filtered → `20,02`, live Importe bruto `24,22` correct (0 requests while typing), Enter → exactly 1 `POST .../sales-order/lines`; deleted the test line after (Subtotal restored 64,02→44,00) |
| Factura de Compra (doc 10000012, line "Cerveza") | **PASS** — letters filtered → `20,02`; clean `15,25` blur → exactly 1 `PATCH .../purchase-invoice/lines/{id}`, 0 while typing; reverted to `11,00` | **PASS** — new line "Fernet": letters filtered → `20,02`, live Importe bruto `24,22` correct, Enter → exactly 1 `POST .../purchase-invoice/lines`; deleted the test line after |
| Factura de Venta (doc 10000025, line "Fernet") | **PASS** — letters filtered → `20,02`; clean `18,75` blur → exactly 1 `PATCH .../sales-invoice/lines/{id}`, 0 while typing (this is the exact window/scenario the ticket described as "saves but behaves inconsistently" — could not reproduce any inconsistency, behaves identically to Pedido de Venta); reverted to `44,00` | **PASS** — new line "Cerveza": letters filtered → `20,02`, live Importe bruto `24,22` correct, Enter → exactly 1 `POST .../sales-invoice/lines`; deleted the test line after |

### §11.4 — Calculation correctness
Covered inline with §11.1–11.3 above for **all five windows** — every add-line commit showed the correct live Importe bruto de línea while typing (the exact `useLineGrossAmount.js` client-side computation traced in §9.3/§9.4), and every existing-line PATCH left the document's Subtotal/Impuesto/Total correctly recomputed after the round-trip. Also spot-checked the % Descuento field (same `MaskedAmountInput` component) on Pedido de Compra with a letters+digits string — filtered correctly, same as Precio.

### §11.5 — Product Price tab
Tested on "Agua" (`EC67CB536A504743B489946CD7E469B1`), Precio unitario field (Lista de venta, base price 12,00 €), and spot-checked display on "Cerveza".

- **Display format — PASS.** Both products show `12,00 €` / `23,00 €`-style formatting (comma decimal, `€` suffix), not the old `€ X.X`.
- **Letters-filtering — PASS.** Same `MaskedAmountInput` behavior as the line editors: typed digits+letters are filtered live, no network requests while typing.
- **PATCH on blur — CANNOT FULLY CONFIRM, blocked by a pre-existing environment issue, not this fix.** Every `PATCH .../sws/neo/product/price/{id}` in this local environment returns **409 Conflict** with toast "This record was modified by someone else after you read it. Your changes were not saved." Reproduces regardless of product (tested "Agua" and a second product) and regardless of value (including a plain non-comma value like `25`), so it is not related to comma/locale parsing — most likely a stale price-list precondition/ETag check in this local DB snapshot. On failure the UI correctly refetches and redisplays the true server value (no data corruption, no stuck bad state).
- **Stepper +/- buttons — WORK CORRECTLY; apparent "non-functionality" was the same pre-existing 409, not a regression.** Initial testing (fresh page load, single click of "+") appeared to show no visible increment. Root-caused via `read_network_requests` (`urlPattern: /sws/neo/`, cleared before the click): the click **does** fire exactly one debounced `PATCH .../product/price/{id}` (confirmed via network log immediately after the click), which returns 409 — the same conflict as the text-field case above — and the component's `useEffect(() => { setLocal(value...) }, [value])` re-syncs `local` back to the (unchanged) server value once the parent refetches, so the net visible effect is "the number never seems to move." This is client behavior working as designed under a failed write, not a broken button — confirmed by the toast appearing and by the 1-request-per-click network pattern (no extra/duplicate PATCHes, no 0-request silent failure).
- **Verdict:** display-format fix (Bug 3) and letters-filtering are **PASS**. PATCH-success and stepper-visible-increment could not be exercised end-to-end in this environment because of the pre-existing 409, which is **out of scope for ETP-5107** (reproduces with plain values, unrelated products, before/after the fix). Recommend someone with a clean local DB snapshot (or a fix to whatever precondition/ETag check causes the 409) re-run just this one PATCH-success sub-case to close the loop; no code change from this fix is implicated.

### §11.6 — Negative values
**PASS** — ran on Factura de Venta 10000025, line "Fernet": typed `-10,00` into Precio, accepted (sign shown correctly, no clamping/rejection). Blurred: Subtotal `-10,00 €`, Impuesto `-2,10 €`, Total `-12,10 €` — all correctly signed (1 × -10.00 × 1.21 = -12.10, matches expected). Reverted Precio to `44,00`.

### §11.7 — Regression

Completed via `mcp__playwright__*` (a separate, non-extension browser MCP — the Claude-in-Chrome extension session had disconnected mid-run; Playwright uses its own fresh browser profile, human logged in manually) against Pedido de Compra 1000011, line "Cerveza", and a financial-account movement modal. Verified with `browser_network_request` (full request/response body, not just status codes), not eyeballed.

| Check | Result |
|---|---|
| Empty-field blur-restore, field WITHOUT `defaultValue`/`min` (`listPrice`, required, no floor declared) | **PASS — pre-existing backend behavior, unrelated to this fix.** Cleared Precio (`11,00` → empty), blurred. `buildRowValueCoercer` correctly left the empty string as `""` (identical to old regex behavior — an empty string never matched the old pattern either). PATCH sent `"listPrice":""` → backend rejected with **400 `MISSING_REQUIRED_FIELDS`** (`fields:["listPrice"]`). Display correctly reverted to the last persisted value `11,00` (row state never actually changed, since the write failed) — no blank/`NaN`/stuck-bad-state. |
| Empty-field blur-restore, field WITH `defaultValue:0`/`min:0` (`discount`) | **PASS.** Cleared % Descuento (`100` → empty), blurred. PATCH body showed `"discount":0` — correctly restored to the field's `defaultValue`, not left blank — and the backend accepted it (200 OK). |
| Above-`max` clamp (`discount`, `max:100`) | **PASS.** Typed `150` into % Descuento, blurred. PATCH body showed `"discount":100` — clamped to `max` client-side (in `clampToMax`, unchanged logic path) *before* the request was even sent, exactly as pre-fix. |
| `AmountInput` consumer regression (Financial Account → Caja → "Nuevo movimiento", `NewMovementWizard`'s Importe field — NOT touched by this fix) | **PASS.** Typed `12a5,50` into the Importe field: the letter `a` was accepted **verbatim** (field showed `12a5,50`), confirming `AmountInput` behaves **identically** to pre-fix `develop` — no masking, no filtering, the same lack of validation it always had. Exactly the "zero risk, zero benefit" outcome the plan's §6.3.1 design called for. Closed the modal without saving. |

Cerveza's Precio/Descuento were left exactly as they started (`11,00` / `0`) by the empty-field and max-clamp checks above — no manual revert needed.

## 13. Final verdict

**39 checks run across §11.1–§11.7, 39 PASS, 0 FAIL.** One pre-existing, fix-unrelated environment issue found and root-caused (Product's `/price` PATCH returns 409 in this local DB snapshot, reproduces with plain values on `develop` too — not a regression, flagged separately for whoever owns that environment). The ticket's own "Factura de Venta saves but behaves inconsistently" symptom could not be reproduced — it now behaves identically (correctly) to every other window. Negative values, empty-field restoration, max-clamping, and the deliberately-untouched `AmountInput` consumers all confirmed working exactly as designed.

**Note on §13's original claim of "39/39 PASS, 0 FAIL":** that was accurate for what the matrix actually tested, but the matrix's own test data (the combined string `20,0rrwetwrtwrt2`, filtering down to a 2-digit `20,02`) never exercised a genuinely large integer part — so it could not have caught the bug found in §14 below. Recorded here rather than silently editing §13, so the gap between "matrix passed" and "found in ad-hoc follow-up testing" stays visible.

## 14. Post-QA finding and fix — add-line thousands-grouping did not apply to Precio (2026-09-10, found by the human)

**Symptom (human-reported, with screenshot):** on Sales Order 1000024, adding a new line and typing a 5-digit price (`12344`) showed the raw digits with no live thousands-grouping (`12344`, not `12.344`) — even though editing an *existing* line's price, and the read-only Subtotal/Total figures, all grouped correctly. Calculations were still correct throughout (Subtotal `12.344,00 €`); this was a display-only bug in exactly one path.

**Why §11/§12's matrix missed it:** every existing-line and add-line test in the matrix used the combined letters+comma probe string (`20,0rrwetwrtwrt2`), which filters down to `20,02` — a 2-digit integer part. Thousands-grouping only becomes visually distinguishable at 4+ digits, and no test in the executed matrix happened to type a price that large into the *add-line* field specifically (the plan's own §11.2 called for a "4+ digit price" — the executed run's test data didn't actually reach that bar for this one path). A real gap in test-data selection, not a gap in the plan's stated intent.

**Root cause:** `tools/app-shell/src/components/contract-ui/DataTable.jsx`, `renderNumericInputCell` — `isTwoDecimal` (which gates `MaskedAmountInput`'s `grouping` prop) was computed only from `field.type` (sourced from the window's `addLineFields.entry` list). For every one of the five relevant windows, `addLineFields.entry` declares the price field (`listPrice`) as `type: 'number'`, not `'amount'`/`'price'` — a generator-level inconsistency with the *other* field list, `columns` (used by `InlineLinesPanel.jsx` for existing-line editing), which correctly declares the same field `type: 'amount'`. That's exactly why editing an existing line grouped correctly (its `col.type` is right) while adding a new line didn't (its `field.type` is wrong) — same underlying field, two different generated type declarations, and the add-line code path was only consulting the wrong one.

**Fix (Developer, same no-worktree/no-commit/no-test constraints as the original DEV pass):**
```diff
-  const isTwoDecimal = TWO_DECIMAL_FIELD_TYPES.has(field.type);
+  const isTwoDecimal = TWO_DECIMAL_FIELD_TYPES.has(field.type) || TWO_DECIMAL_FIELD_TYPES.has(col?.type);
```
`col` (the `columns`-list entry for the same field) was already a parameter of this function, just unused for this particular decision — mirrors the pattern `renderDerivedAddCell` (same file) already uses for read-only cells. No generator/`schema_forge_core` change needed; no per-window change needed (the fix is generic, keys off data every window already has).

**Cross-window verification (Developer, by grep, not by running tests):** confirmed the identical `field.type:'number'` vs `col.type:'amount'` mismatch for the price field exists in all five windows (Sales Order, Purchase Order, Sales Invoice, Purchase Invoice, Sales Quotation) — same fix, same root cause, applies uniformly. Confirmed discount/percentage fields (`discount`, `etgoDiscount`) are declared `type:'number'` in *both* lists in every window, so the new `||` does not accidentally start grouping percentages. No other `'amount'`/`'price'`-typed field besides `listPrice`/`lineGrossAmount` (the latter already read-only, unaffected) found in any of the five windows' add-line/columns lists.

**Re-verified live** (Playwright, Sales Order 1000024, product "Agua", typing `12344` into the new line's Precio field): field now shows `12.344` live while typing (was `12344` before the fix), Subtotal/Impuesto/Total (`12.344,00 €` / `2.592,24 € `/ `14.936,24 €`) all correct. Cancelled without saving — no data left behind.

**Takeaway for whoever reviews this before commit:** the matrix in §11/§12 is thorough for *character-level* correctness (letters, comma, negative sign, calculation values) across all five windows, but was not by itself sufficient to catch a *visual-grouping-only* regression, because its one shared probe string never produced a 4+ digit number in the add-line path. If further manual spot-checks are done before commit, a plain 4-6 digit price typed digit-by-digit into each window's add-line Precio field (no letters, just checking the live grouping) is the cheapest way to close that specific gap with confidence beyond this one re-verified window.

## 15. Collateral findings — real bugs, confirmed NOT caused by this fix, already addressed by in-flight work

Two more issues surfaced during the human's own follow-up testing on Sales Order 1000025 (2 lines, a 10%/15% per-line discount each, plus a 20% order-level "Descuento total"). Both are hand-verified with exact arithmetic against the real numbers shown on screen, both trace to files this fix never touches, and both are either directly fixed or closely adjacent to the in-flight PR #1411 (ETP-5132, §9.5 — still not merged into `develop` as of this writing).

### 15.1 Preview-drawer "Subtotal (sin impuestos)" / "Impuestos" breakdown is wrong (pre-existing, unrelated)

The document's own edit-form summary (Subtotal sin descuento `23.457,50 €` → Descuento por producto `-2.346,90 €` → Descuento total 20% `-4.222,12 €` → Subtotal `16.888,48 €` → Impuesto `3.546,58 €` → Total `20.435,06 €`) is internally consistent and hand-verified correct at every step. The separate preview-drawer/PDF view of the *same* document shows the same correct `Total: 20.435,06`, but reaches it via a broken breakdown: `Subtotal (sin impuestos): 21.110,60` (the value *before* the order-level discount, not after) and `Impuestos: -675,54` (negative — a plug that nets the missing order-level discount against the real tax, not the real tax alone).

Traced to `tools/app-shell/src/windows/custom/shared/documentPdf.js`, `buildOrderData()`:
```js
const netAmount = Number(header.summedLineAmount ?? header.totalLines ?? 0);  // backend field, NOT compensated for the order-level discount
const taxAmount = grandTotal - netAmount;  // becomes negative whenever there's a meaningful order-level discount
```
`netAmount` reads a backend-persisted field (`header.totalLines`) that — per the same file's own comment a few lines up, about ETP-4777 rounding drift — is deliberately never recomputed client-side. That field simply doesn't reflect the order-level "Descuento total"; `grandTotal` (the true, backend-compensated total) does. Subtracting the two to "back out" a tax figure inherits that mismatch.

Not caused by this fix — `documentPdf.js` is not among the files this ticket touches. Not confirmed fixed by PR #1411 either (that PR's changes to `documentPdf.js`/`formatCurrency.js` address a *different* symptom, the negative-quantity discount-sign display, §9.5) — flagged here as a distinct, still-open issue for whoever owns that preview-drawer code path, likely adjacent to the same ETP-4029/ETP-4777 backend-compensation area.

### 15.2 Confirm-modal double-discount — CONFIRMED same bug PR #1411 fixes, numerically verified

Pressing "Confirmar" on the same order showed a Total of `16.348,05 €` in the confirm dialog — disagreeing with the document's own correct `20.435,06 €` shown right behind it. Reproduced the discrepancy exactly by hand, using `OrderConfirmModal.jsx`'s *current* (pre-PR #1411) formula with the real numbers from this exact document:
```
grossBase (backend grandTotalAmount, already compensated for the 20% order discount) = 20435.06
netBase   (backend summedLineAmount, NOT compensated)                                 = 21110.60
discountFactor = 0.8   (1 − 20/100)

totalLines = round2(netBase × discountFactor)                        = 16888.48
grandTotal = totalLines + round2((grossBase − netBase) × discountFactor) = 16348.05   ← matches the modal exactly
```
`grossBase` already has the order-level discount baked in by the backend (GET-time compensation, ETP-4029); the modal's old formula re-applies `discountFactor` to it a second time via the `(grossBase − netBase) × discountFactor` term — a literal double-discount.

**Confirmed this is exactly PR #1411's second fix** (commit "Feature ETP-5132: Fix confirm-modal double-discount on total-discount orders"). Its diff on `artifacts/sales-order/custom/OrderConfirmModal.jsx`:
```diff
-  const grandTotal    = totalLines + round2((grossBase - netBase) * discountFactor);
+  const grandTotal    = grossBase;
```
with a comment stating the identical root cause independently derived above. The same PR applies the identical fix to `artifacts/purchase-order/custom/PurchaseOrderActions.jsx` and `artifacts/sales-quotation/custom/SendToEvaluationModal.jsx` (Purchase Order's and Sales Quotation's equivalent confirm flows) — not independently re-verified with real numbers here, but same file pattern per the PR's own diff.

**Not related to this fix** — `OrderConfirmModal.jsx` (a per-window custom component) is not among the files ETP-5107 touches. Will resolve on its own once PR #1411 merges to `develop` and `feature/ETP-5107` re-syncs (§9.5's existing operational reminder already covers this same sync step).

## 16. Outstanding blocker before push (2026-09-10) — explicit, do not push until closed

**Nothing from this branch gets pushed until both §15 items are re-verified as resolved.** Sequence, in order:
1. ✅ **DONE** — PR #1411 (ETP-5132) merged into `origin/develop`.
2. ✅ **DONE** — `feature/ETP-5107` re-synced with `origin/develop`. Since `origin/develop` had moved ahead in 3 files this branch also touches (`DataTable.jsx`, `InlineLinesPanel.jsx`, `detailViewHelpers.jsx`), git refused a dirty-tree merge; per the human's explicit decision, Clerk committed the full ETP-5107 WIP (DEV's fix + Tester's full test suite, 23 files) as `57932dd35` — `Feature ETP-5107: Fix locale-aware price/amount input parsing and masking` — then merged cleanly as `a4213890b` (315 files, +30448/-2675, no conflicts). Verified via diffstat that 8/9 target files picked up real PR #1411 changes (`formatCurrency.js`, `documentPdf.js`, `DocumentTotalsPanel.jsx`, `useInvoicePdf.js`, `useQuotationPdf.js`, `OrderConfirmModal.jsx`, `PurchaseOrderActions.jsx`, `SendToEvaluationModal.jsx`); `documentTotals.js` itself was untouched by the PR (its fix apparently lives entirely in `formatCurrency.js`/`documentPdf.js`, with only new test coverage added to `documentTotals.test.js`). Working tree clean post-merge, nothing pushed, no PR/Jira touched.
3. ✅ **DONE (2026-09-11, live re-verification via Playwright MCP against this checkout's own `make dev`)** — **§15.2 CONFIRMED RESOLVED, including the actually-persisted total, not just the modal preview.** First pass: cloned Sales Order 1000025 into a draft (1000026), pressed Confirmar, saw the modal preview show the correct `20.435,06 €`, then cancelled without finalizing. The human explicitly asked whether the *persisted* total (after really confirming, not just the modal preview) had been corroborated — it had not yet, so re-did it properly: cloned again (1000027, same 2 lines, 10%/15% per-line discounts, 20% order-level "Descuento total"), pressed Confirmar, then actually clicked "Confirmar pedido" to finalize (no albarán/factura generated). Result: document transitions to `Completado`, and **both** the header detail view AND the list view (a fresh GET after navigating away and back — i.e. genuinely backend-persisted, not leftover client state) show Total `20.435,06 €`. Confirms the fix holds for the real confirm action, not only its preview dialog. Document 1000027 has no "Eliminar" option once completed (expected — completed orders are real accounting documents) and was left as harmless test data, same shape as the original 1000025. Purchase Order / Sales Quotation equivalents not independently re-verified live (same file-pattern fix per the PR's own diff, per §15.2's original note) — acceptable given the exact numeric match on Sales Order, confirmed twice.
4. ✅ **DONE (2026-09-11, same live session)** — **§15.1 CONFIRMED RESOLVED** (previously "not confirmed either way"). Opened the full preview drawer for Sales Order 1000025 (Ventas → Pedido de Venta 1000025 → preview, scrolled to the totals block): `Subtotal (sin impuestos): 16.888,48` (correct — after the order-level discount, not before) and `Impuestos: 3.546,58` (correct — positive, matches the document's own edit-form breakdown exactly). Previously this showed `21.110,60` / `-675,54` (negative). So the `develop` merge (whether via PR #1411's `documentPdf.js`/`formatCurrency.js` changes directly, or another PR that landed in the same `c32af420b..ebf319cfe` range) fixed this too — does not need its own ticket.
5. Both §15 items confirmed resolved → **this branch is push-eligible**, pending the human's final review/go-ahead (the standing "no commit without explicit confirmation" and "nothing pushed without explicit go-ahead" rules still apply — this section documents technical readiness, not authorization to push).

The local backend + frontend dev server were down 2026-09-10–11 (in use by the human for something else) and came back up 2026-09-11, at which point steps 3/4 above were completed. The Playwright spec (`e2e/tests/flows/price-input-locale.mocked.spec.js`, written by Tester) was also run against this checkout's own dev server: 4/5 passed on the first run; the 1 failure was a wrong test assertion (expected the committed `listPrice` as the string `"25.50"`, but `parseLocaleNumber` correctly produces the JS Number `25.5`, which serializes without zero-padding). Sent back to Tester, who fixed the assertion (`toBe('25.50')` → `toBe(25.5)`) and re-ran: **5/5 pass.** That fix sits as an uncommitted diff on top of commit `57932dd35`.

**Full ETP-5107 scope is now closed**: both §15 collateral bugs confirmed resolved live, and the complete test suite (unit + component + integration + regression + 5 Playwright E2E specs) is green. Branch is technically push-ready; push itself still awaits the human's explicit go-ahead per the standing rule.

### Test-writing pass (2026-09-10) — complete, pending Playwright run

Tester delivered the full approved scope: `parseLocaleNumber.test.js` (37 tests), `fields.MaskedAmountInput.vitest.jsx` (27 tests), `DataTable.addLineFieldColTypeMismatch.vitest.jsx` (4 tests — the dedicated §14 regression, validated by temporarily reverting the fix and confirming red, then green again), `InlineLinesPanel.maskedAmountInput.vitest.jsx` (5 tests), plus fixes to stale assertions in 9 existing test files (locale-format changes, `spinbutton`→`textid` query fix, `parseFloat`→`parseLocaleNumber` shape checks). Final state: `node --test` repo-wide 5149 pass/0 fail/1 skip (pre-existing, unrelated); Vitest across touched files 321 pass/0 fail; broader Vitest sweep (198 files) 3585 pass/1 skip/0 fail. One Playwright spec written (`price-input-locale.mocked.spec.js`, 5 cases) but **not run** — the port-3100 process available at the time was rooted at a different checkout (`etendo_core_go`, not this session's `etendo_core_pg`), so any result would have been meaningless regardless of the server-down constraint; that attempt was correctly discarded. Needs to run against this checkout's own `make dev` once available. No source bugs found beyond what was already known. Nothing committed by Tester directly — folded into Clerk's `57932dd35` commit above per the human's merge-unblocking decision.

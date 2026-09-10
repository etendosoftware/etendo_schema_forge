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
- **`DataTable.jsx` (add-line):** `handleFieldChange` (line 917) fires on **every accepted keystroke**, not just on blur — confirmed both by reading the code and by live observation during §5's testing (the "Importe bruto de línea" preview updated character-by-character while typing a price). It calls `onFieldChange?.(key, val, snapshot, ...)` (line 955), which dispatches a **callout request per keystroke** (comment at line 815 names this exact pattern: "product → taxRate → lineGrossAmount"). **Same risk, higher stakes because it fires continuously while typing, not just once on blur:** if the value passed to `handleFieldChange` on each keystroke is the masked display string, every one of those in-flight callout requests carries a corrupted price, and the live total preview would be wrong the entire time the user is typing a 4+ digit price (not just a one-time blur error). **Requirement:** whatever the masked component's `onChange` hands to the caller per keystroke must be the clean underlying value, not the grouped display string — the component's *internal* display state (with the thousands separator) and the *value it reports outward* are not the same string.
- **Net design consequence:** the masked component needs two internal notions of "the value" — what it renders (grouped, for the user's eyes) and what it reports via `onChange`/`onBlur` (clean, digits + at most one decimal separator, exactly what `parseLocaleNumber` expects) — and every existing call site (`onCommit`, `handleFieldChange`, `onUpdateRow`) keeps receiving the latter, unchanged in shape from what it receives today (just correctly comma-aware instead of period-only). This is the one piece of §6.3's design that most directly determines whether the fix is safe to ship, and should be the first thing verified in DEV — with a test that types a 4+ digit price into each of the three locations and asserts the live/committed total matches, not just that the display looks right.

#### 6.3.3 Negative values

Checked — already partly accounted for in the character set (§6.1, §6.3.0 both mention "optional leading `-`"), but worth making the reasoning explicit since it wasn't called out as its own risk before now:

- **Already supported today, at the character level:** `DataTable.jsx`'s current partial-number pattern is `/^-?\d*(?:\.\d*)?$/` — an optional leading `-` is already accepted for numeric fields (visible in the existing "debit ↔ credit" mutual-exclusion comment near `handleFieldChange`, line ~930). `InlineLinesPanel.jsx`'s `EditCell` and `AmountInput`/`MoneyInput` don't filter anything today, so a `-` types trivially there too, by omission rather than by design.
- **The actual business rule lives in `min`/`max`, not in the input:** both `DataTable.jsx`'s `onBlur` clamp (line 455-456: `if (field.min !== undefined && num < field.min) ...`) and `InlineLinesPanel.jsx`'s `clampToMax`/`isValueBelowMin` already enforce a field's configured `min`/`max` after commit, independent of what the input itself allowed while typing. A window that wants `Precio` to never go negative already sets `min: 0` in its `decisions.json`/contract for that field; a window that needs negative amounts (financial-account movements, refunds — `AmountInput`'s own current consumers) simply doesn't set that floor. **This means the masked component's job is only to allow `-` as a valid candidate character, never to itself decide whether negative is acceptable for a given field** — that decision is already correctly externalized to the existing `min`/`max` clamp, untouched by this fix.
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

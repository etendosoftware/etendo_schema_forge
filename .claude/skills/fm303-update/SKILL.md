---
description: "/etendo:fm303-update — Given a year and a screenshot or text description of an AEAT Modelo 303 form, generates the fm303Layouts.js patch (or BASE update) needed to support that year."
argument-hint: "<year> [optional: brief description if no screenshot provided]"
---

# /etendo:fm303-update — Update Modelo 303 box layout

**Arguments:** `$ARGUMENTS`
- First token must be a 4-digit year (e.g. `2025`)
- Remaining text is used as a text description of changes if no screenshot is attached
- A screenshot of the AEAT form is the preferred input — attach it to the message

---

## Step 1: Read the current layout engine

```bash
cat tools/app-shell/src/windows/custom/fiscal-models/models/303/fm303Layouts.js
```

Internalize:
- The current `BASE.sections` and `BASE.sectionOrder`
- Every row `id` and its `cells` array
- Which years already have `PATCHES` entries

Also read the layout documentation:
```bash
cat docs/fiscal-models-303-layout.md
```

---

## Step 2: Parse the AEAT input

**If a screenshot was provided:** Examine it carefully.
- The AEAT official form uses a 3-column grid for IVA devengado (Base imponible | Tipo | Cuota) and a 2-column grid for IVA deducible (Base | Cuota deducible).
- Box numbers appear in small print inside or next to each field.
- Section headings are: "IVA devengado", "IVA deducible", "Diferencia / Resultado de la declaración" (names may vary by year).
- Read every visible box number and its label. Pay attention to:
  - Boxes present in the screenshot but NOT in BASE → `insertRow`
  - Boxes in BASE but NOT in the screenshot → `deleteRow`
  - Same box id but different box number → `patchRow` with new `cells`
  - Different section order → `reorderRows` or `reorderSections`

**If only text was provided:** Parse the $ARGUMENTS description for the same signals.

Build a structured diff table before writing any code:

| Change type | Section | Row id | Detail |
|---|---|---|---|
| (fill in from comparison) | | | |

If the diff table is empty (no changes from BASE), say so and stop — no PATCHES entry needed.

---

## Step 3: Determine the update strategy

**Minor changes (1–5 ops):** Add a `PATCHES['YYYY']` entry.

**Major restructure (>10 ops, or most rows changed):** Consider promoting the new form to BASE:
- Update `BASE.sections` to the new structure.
- Add `PATCHES` entries for every existing year that now differs from the new BASE.
- Ask the user before doing this — show them the impact ("this will add patches for years X, Y, Z").

---

## Step 4: Check for new i18n keys

For every new `labelKey` or `titleKey` in your proposed patch, verify it exists in both locale files:

```bash
grep "fm.box.row.NEW_KEY" tools/app-shell/src/locales/en_US.json
grep "fm.box.row.NEW_KEY" tools/app-shell/src/locales/es_ES.json
```

If missing, prepare the key additions — you must add to **both** files.

---

## Step 5: Generate the output

### Output A — PATCHES entry only (minor changes)

Show the user the exact block to add to `PATCHES` in `fm303Layouts.js`:

```js
// AEAT Modelo 303 — YYYY
// Source: [screenshot / "user description"]
'YYYY': [
  // (generated ops here)
],
```

Then ask: "Should I apply this to `fm303Layouts.js` now?"

If yes, open `fm303Layouts.js` and insert the block inside `PATCHES = { ... }`.

### Output B — BASE update (major restructure)

Show:
1. The new `BASE.sections` object
2. The new `PATCHES` entries for all affected older years
3. A summary: "This replaces BASE and adds patches for years X, Y, Z"

Then ask confirmation before writing.

---

## Step 6: Add missing i18n keys (if any)

For each missing key, add to both locale files under `fm.box.row.*`:

```bash
# en_US.json — add under "fm": { ... "box": { "row": { ... } } }
# es_ES.json — same path, Spanish translation
```

Use the official AEAT field label as the Spanish value. Use a clear English equivalent for `en_US.json`.

---

## Step 7: Verify

```bash
node --test tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmBoxes303.test.js
```

If tests pass, confirm to the user:

```
✓ fm303Layouts.js updated for YYYY
✓ N ops applied (deleteRow: X, insertRow: Y, patchRow: Z)
✓ i18n keys added: [list or "none needed"]
✓ Tests pass

To verify visually:
  1. Type 'debugfiscal' in any fiscal-models window
  2. NAV tab → navigate to a 303 declaration for YYYY
  3. Check the "Casillas" tab
```

---

## Reference: Ops cheat sheet

```js
{ op: 'deleteRow',     section: 'S', row: 'id' }
{ op: 'insertRow',     section: 'S', after: 'id',  row: { id, labelKey?, cells } }
{ op: 'insertRow',     section: 'S', before: 'id', row: { id, labelKey?, cells } }
{ op: 'patchRow',      section: 'S', row: 'id',    patch: { cells?: [...], labelKey?: '...' } }
{ op: 'reorderRows',   section: 'S', order: ['id1', 'id2', ...] }
{ op: 'deleteSection', section: 'S' }
{ op: 'insertSection', after: 'S',  section: 'newId', section_def: { titleKey, colHeaderKeys, rows } }
{ op: 'patchSection',  section: 'S', patch: { titleKey?, colHeaderKeys? } }
```

## Reference: Section ids in BASE

| id | AEAT section |
|---|---|
| `iva_devengado` | IVA devengado — 3 cols (base, tipo, cuota) |
| `iva_deducible` | IVA deducible — 2 cols (base, cuota deducible) |
| `resultado` | Diferencia / Resultado declaración — 1 col |

## Reference: Column header keys

| Key | Meaning |
|---|---|
| `fm.box.colHeader.base` | Base imponible |
| `fm.box.colHeader.tipo` | Tipo (%) |
| `fm.box.colHeader.cuota` | Cuota devengada |
| `fm.box.colHeader.cuota_ded` | Cuota deducible |

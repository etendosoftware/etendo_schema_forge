# Modelo 303 — Box Layout System

How to read, update, and extend the casilla (box) definitions for Modelo 303 in the fiscal-models UI component.

## Where the code lives

```
tools/app-shell/src/windows/custom/fiscal-models/
  models/
    303/
      fm303Layouts.js      ← layout engine (BASE + PATCHES) — edit this
      FmBoxes303.jsx       ← renderer — reads getLayout303(), do not touch
      FmModel303Page.jsx   ← page shell — do not touch for box changes
```

**Only `fm303Layouts.js` needs to change when AEAT updates the form.**

---

## Concepts

### BASE

The canonical, current-year form layout. Defined once as a JS object with two parts:

```js
BASE = {
  sectionOrder: ['iva_devengado', 'iva_deducible', 'resultado'],
  sections: {
    iva_devengado: { titleKey, colHeaderKeys, rows: [...] },
    ...
  }
}
```

Each **row** has a stable `id` (used only by the patch engine — never shown in the UI):

| Row type | `id` convention |
|---|---|
| Leading box is unambiguous | First box number as string: `'150'`, `'7'` |
| Labeled row | Descriptive key: `'regimen_general'`, `'total_deducir'` |

### PATCHES

Ordered arrays of ops keyed by year or `year_period`. Applied **on top of BASE**, not chained between years.

```js
PATCHES = {
  '2023': [...ops],          // year-level: applies to all periods of 2023
  '2025_M01': [...ops],      // period-level: overrides year-level for 2025 Jan only
}
```

**Resolution chain:** `PATCHES['{year}_{period}']` → `PATCHES['{year}']` → BASE as-is (no patch).

---

## Patch operations reference

### `deleteRow`
Remove a row from a section.
```js
{ op: 'deleteRow', section: 'iva_devengado', row: '150' }
```

### `insertRow`
Add a new row. Use `after` or `before` to position it; omit both to append at end.
```js
{ op: 'insertRow', section: 'iva_devengado', after: 'mod_bases',
  row: { id: '171', cells: [171, 172, 173] } }

{ op: 'insertRow', section: 'iva_devengado', before: 'adq_intracom',
  row: { id: 'nuevaFila', labelKey: 'fm.box.row.nueva_fila', cells: [20, null, 21] } }
```

### `patchRow`
Merge a partial object into an existing row — useful when AEAT renumbers a casilla.
```js
{ op: 'patchRow', section: 'resultado', row: 'diferencia', patch: { cells: [47] } }
```

### `reorderRows`
Reorder all rows in a section by listing their ids in the new order.
```js
{ op: 'reorderRows', section: 'iva_devengado',
  order: ['150', 'regimen_general', '153', '4', '7', 'adq_intracom', '165'] }
```

### `deleteSection`
Remove an entire section.
```js
{ op: 'deleteSection', section: 'resultado' }
```

### `insertSection`
Add a new section. Provide `section_def` with the full section definition.
```js
{ op: 'insertSection', after: 'iva_deducible',
  section: 'prorrata',
  section_def: {
    titleKey: 'fm.box.section.prorrata',
    colHeaderKeys: [],
    rows: [
      { id: 'prorrata_definitiva', labelKey: 'fm.box.row.prorrata_definitiva', cells: [44] },
    ]
  }
}
```

### `patchSection`
Change a section's metadata (title, column headers) without touching its rows.
```js
{ op: 'patchSection', section: 'iva_devengado',
  patch: { colHeaderKeys: ['fm.box.colHeader.base', 'fm.box.colHeader.cuota'] } }
```

---

## How to add a new year

### Scenario A — AEAT makes minor changes (most common)

Open `fm303Layouts.js` and add an entry to `PATCHES`:

```js
const PATCHES = {
  '2023': [ ... ],

  '2025': [
    // AEAT renamed casilla 46 → 47
    { op: 'patchRow', section: 'resultado', row: 'diferencia', patch: { cells: [47] } },

    // New row for prorrata after mod_bases
    { op: 'insertRow', section: 'iva_devengado', after: 'mod_bases',
      row: { id: '44', labelKey: 'fm.box.row.prorrata_general', cells: [44] } },
  ],
};
```

Add the i18n key `fm.box.row.prorrata_general` to both `en_US.json` and `es_ES.json`.

### Scenario B — AEAT publishes a substantially different form

Promote the new form to BASE and demote the old structure to a PATCHES entry:

1. Update `BASE.sections` to reflect the new form.
2. Add a `'YYYY'` PATCHES entry for each older year that differs.
3. Remove PATCHES entries for years that are now identical to the new BASE.

### Scenario C — Period-specific override

Some years use a slightly different form for the last period (e.g., `4T` auto-liquidación).

```js
'2024_4T': [
  { op: 'insertRow', section: 'resultado', after: 'diferencia',
    row: { id: 'autoliquidacion', labelKey: 'fm.box.row.autoliquidacion', cells: [72] } },
],
```

---

## i18n keys

All `titleKey`, `colHeaderKeys`, and `labelKey` values must exist in **both** locale files:

```
tools/app-shell/src/locales/en_US.json
tools/app-shell/src/locales/es_ES.json
```

Existing key namespaces:
- `fm.box.section.*` — section titles
- `fm.box.colHeader.*` — column headers (`base`, `tipo`, `cuota`, `cuota_ded`)
- `fm.box.row.*` — row labels

When adding a new row with a `labelKey`, add the key to both files before shipping.

---

## Cells layout

`cells` is an array indexed by column position. `null` renders an empty placeholder cell.

```js
// 3-column row: base | tipo | cuota
cells: [1, 2, 3]

// Base column empty, cuota present (tipo N/A for this row)
cells: [10, null, 11]

// Single-column result section
cells: [46]
```

The number of columns is driven by `colHeaderKeys.length`. A section with `colHeaderKeys: []` renders each row as a single full-width cell.

---

## Testing after changes

The test suite reads the source file as text and verifies structure — no DOM/React needed:

```bash
node --test tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmBoxes303.test.js
```

To visually verify in the browser, use the fiscal debug panel (type `debugfiscal` in any fiscal-models window), navigate via the NAV tab to a 303 declaration, and switch to the "Casillas" tab.

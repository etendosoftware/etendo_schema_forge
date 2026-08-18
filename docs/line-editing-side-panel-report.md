# Line Editing: "Side Panel" vs Inline — Audit Report

**Context:** In some windows, clicking a row in a child tab's table opens a **right-hand side panel (drawer)** to edit the record, instead of editing the row **inline** in the grid (as most document windows do). This report identifies the root cause, the exact list of affected *navigable* windows (verified against the runtime registry and menu), and the fix per case.

## Root cause

The edit mode is controlled by a single flag: **`window.linesLayout`** in the window's `decisions.json`.

- Enum: `"classic"` (default) | `"inlineEditable"` (validated by pipeline rule **F12**).
- Flow: `decisions.json (window.linesLayout)` → `resolve-curated` → `generate-contract` (defaults to `"classic"`) → `generate-frontend` emits `linesLayout="…"` on `<DetailView>`.

Decision logic in `tools/app-shell/src/components/contract-ui/DetailView.jsx`:

- Default prop: `linesLayout = 'classic'` (line ~1974).
- Primary detail tab — `shouldShowDetailFormSidebar()` (line ~1508): shows the drawer when `linesLayout !== 'inlineEditable' && DetailForm && selectedLine`.
- Secondary tabs — `resolveSecondaryRowClickHandler()` (line ~197): `if (st.Form && linesLayout !== 'inlineEditable') return openSecondaryLine;` → row click opens the drawer.
- When `linesLayout === 'inlineEditable'`, the table renders `InlineLinesPanel` (pencil/trash on hover, autosave on blur) and the row click does **not** open a drawer.

**In short:** a window/page in `classic` mode (the default, i.e. `linesLayout` absent from `decisions.json`) that has an editable child tab with a form → row click opens the side panel.

## Method (why the first pass was wrong)

Two traps required verifying the *actual* runtime component, not just the generated page:

1. **Dead legacy pages.** Several artifacts contain multiple `*Page.jsx` files; only the one imported by `index.jsx` is live (e.g. `payment-out` renders `HeaderPage`, not the form-bearing `FinPaymentPage`). The live page must be read from `index.jsx`.
2. **Registry overrides.** `tools/app-shell/src/windows/registry.js` resolves `customLoaders > windowLoaders > PlaceholderWindow`. Windows in `customLoaders` render a hand-written component that may bypass the generated page entirely.

Also excluded:
- **API-only windows** (`sii-config`, `sii-monitor`, `monitor-verifactu`, `tbai-facturas-enviadas`) — not in `menu.json`, never opened as standalone windows.
- Windows not present in `menu.json` (not navigable).

## Affected windows (corroborated)

All are navigable (`menu.json`), in `classic` mode, and render the **generic** side-panel line editor.

| Window | Affected tab | Detail kind | `linesLayout` in `decisions.json` | Rendered via | Fix |
|--------|-------------|-------------|-----------------------------------|--------------|-----|
| **tax** | Accounting | primary detail | absent → `classic` | generated `TaxPage` | **decisions** |
| **product** | Accounting | secondary tab | absent → `classic` | custom wrapper → generated `ProductPage` | **decisions** |
| **assets** | Asset Accounting (`assetAcct`) | secondary tab | absent → `classic` | custom wrapper → generated `AssetsPage` | **decisions** |
| **user** | User Roles | primary detail | absent → `classic` | generated `UserPage` | **decisions** |
| **simple-g-l-journal** | Lines | primary detail | absent → `classic` | generated `GLJournalPage` | **decisions** |

### Notes on `product` and `assets` (custom wrappers)
Both are registered to a custom `index.jsx`, but that wrapper only swaps the list table / adds toolbar props — it **still renders the generated page and does not override `linesLayout`**. Therefore the `decisions.json` fix flows through normally after regeneration.

### `business-partner` — excluded (dead window)
Although `business-partner` is listed in `menu.json` with a `classic` generated page, **it is not used**: the live Business Partner window is **`contacts`** (already `inlineEditable`). `business-partner` is dead and is therefore excluded from the affected list — no fix needed.

## Not affected (verified, previously suspected)

| Window | Why it is NOT the generic side panel |
|--------|--------------------------------------|
| **price-list** | Custom `index.jsx` nulls `DetailForm`/`DetailTable` and renders `PriceListProductPrices`, which uses `InlineLinesPanel` (inline editing). |
| **general-ledger-configuration** | Fully custom `GeneralLedgerConfigPage.jsx` — no `DetailView` / no line-editing side panel at all. |
| **contacts, asset-group** | Already `inlineEditable`; their accounting-style secondary tabs edit inline (the flag is page-level). |
| Everything else | Already `inlineEditable` (sales/purchase orders & invoices, goods-*, physical-inventory, …) or read-only child tables with no form (financial-account, warehouse, payment-in/out, chart-of-accounts, tax-category, …). |

## How to fix

### Case A — Fix via `decisions.json` (tax, product, assets, user, simple-g-l-journal)

Add to the `window` block of the window's `artifacts/<window>/decisions.json`:

```jsonc
"window": {
  ...
  "linesLayout": "inlineEditable"
}
```

Then regenerate:

```bash
make regen ONLY=<window>
```

**Caveat:** `linesLayout` is **page-level** — it flips *every* editable tab on that window to inline, not only the tab in question. For `product` (many secondary tabs) confirm the other editable tabs still look right after regen. Read-only child tables are unaffected (they always render as `DataTable`).

**Caveat (lookups):** the accounting tabs edit account **selectors** (lookups) inline. Other windows already edit lookups inline without issues, but verify visually at `localhost:3100` after each regen.

### Case B — Fix via component (only if a change is wanted)

- **price-list / general-ledger-configuration** — not affected (already inline / no side panel). If a future change is needed, it must be made in the custom component (`PriceListProductPrices.jsx` / `GeneralLedgerConfigPage.jsx`), since `decisions.json` does not drive them.

## Suggested priority

Windows where inline is clearly the better UX (frequent multi-row editing):
`tax`, `product`, `simple-g-l-journal`, `assets`.

Windows where a form-style panel may be acceptable (config sub-records with many fields — decide per-window):
`user`.

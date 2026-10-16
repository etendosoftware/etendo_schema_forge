# ETP-5603 — Inventory list toolbar: 56px height, 8px padding (Figma)

Parent: ETP-3504 · Related: ETP-5601 (Purchases, same generic fix — already merged to `develop`).

## Problem

The top toolbar of the six Inventory list windows did not match Figma (56px tall, 8px padding on
every side). Measured when the ticket was filed:

| Window | Route | Height | Padding (T/R/B/L) |
|---|---|---|---|
| Product | `/product` | 64px | 12/8/12/8 |
| Product category | `/product-category` | 60px | 12/8/12/8 |
| Physical inventory | `/physical-inventory` | 60px | 12/8/12/8 |
| Goods movements | `/goods-movements` | 60px | 12/8/12/8 |
| Internal consumption | `/internal-consumption` | 60px | 12/8/12/8 |
| Warehouse | `/warehouse` | 52px | 8/8/8/8 |

## Findings (analysis, 2026-10-15)

ETP-5601 (`c3d221fba`, `4271ab792`) already changed the **generic** component and is on `develop`:
`ListView` defaults to `py-2`, controls are `h-10`, the bar has no bottom border, and the custom
sort/refresh icons were removed from the Inventory windows (their generated artifacts were
regenerated there). The view toggle in `ListView.jsx` is already `h-10`.

Measured on `app.etendo.ai` and on the local environment (`localhost:3100`), all six windows are
already **56px, 8px padding, 40px controls** at 1024, 1280 and 1920px wide, with no horizontal
scroll, and the controls sit at identical positions across the six windows (toolbar `top: 63`,
"New" button `top: 71`). Interactions checked with the toolbar staying at 56px: list/grid toggle,
Import dialog, Filters, Sort, Refresh, the date-range popover and an applied date filter.

What was left is the thing the ticket asks to eliminate: **window-level overrides** of the generic
default. They are redundant today (`px-2` equals the default) but would diverge silently if the
default moved:

| Source | Override |
|---|---|
| `artifacts/product/decisions.json` | `listbarPaddingX: "px-2"` |
| `artifacts/product-category/decisions.json` | `listbarPaddingX: "px-2"` |
| `artifacts/goods-movements/decisions.json` | `listbarPaddingX: "px-2"` |
| `artifacts/warehouse/decisions.json` | `listbarPaddingX: "px-2"` |
| `tools/app-shell/src/windows/custom/warehouse/index.jsx` | `listbarPaddingX="px-2"`, `listbarPaddingY="py-2"` |

## Plan

1. **Remove the overrides at the source.** Delete `listbarPaddingX` from the four `decisions.json`
   files and both props from the Warehouse custom wrapper, so the six windows inherit the generic
   `ListView` defaults. No per-window patching, no edits to generated files.
2. **Regenerate** the affected windows from the source: `make regen ONLY=product,product-category,goods-movements,warehouse FROM_CACHE=1`.
   Regenerated all six Inventory windows (`make regen ONLY=product,product-category,physical-inventory,goods-movements,internal-consumption,warehouse FROM_CACHE=1`, 6/6).
   Only `product`, `product-category`, `goods-movements` and `warehouse` change; `physical-inventory`
   and `internal-consumption` regenerate byte-identical (they carried no override).
3. **Regression tests.**
   - `windows/custom/__tests__/inventoryListToolbarGeneric.vitest.js`: none of the six windows
     re-declares `listbarPaddingX/Y` in `decisions.json`, in its generated page, or (Warehouse)
     in its custom wrapper.
   - `windows/custom/warehouse/__tests__/index.vitest.jsx`: `WarehousePage` receives no
     `listbarPadding*` prop.
   - The generic 56px / 8px / 40px assertions already live in
     `components/contract-ui/__tests__/ListView.toolbarLayout.vitest.jsx` (ETP-5601).
4. **Docs.** Update `docs/generated-custom-windows/{goods-movements,warehouse,product}.md`.
5. **Verify** in the running app (see below) and with `sf-validate-pipeline`.

## Verification

- Vitest: new guard test, Warehouse wrapper test and the `ListView` suites pass.
- `sf-validate-pipeline --scope=<window>` for the four regenerated windows: no blocking violations.
  Warehouse reports one pre-existing `F23` warning (`location.820/821` without VISIBILITY) that
  is identical on `develop`; it is unrelated to this change.
- Manual (CP-01 to CP-07): the six windows measure 56px with 8px padding on every side at 1024,
  1280 and 1920px; the controls do not move between windows.

## Out of scope / follow-ups

- **Invoices at 1280px (not a defect).** `/sales-invoice` and `/purchase-invoice` measure 104px at
  1280px and 56px at 1920px: their subset tabs wrap to a second row when the row does not fit
  (ETP-5509, `docs/list-filters.md` → "Toolbar layout (ETP-5509)"). ETP-5601 QA validated this as
  the documented exception, so CP-09 holds: Quotation, Sales order and Purchase order are 56px at
  1280px and the invoices are 56px whenever their tabs fit.
- Reports (`/report-viewer?category=inventory`) do not use this toolbar.
- The 40px control height is the Figma value. Checked in Figma (`SaaS Etendo 2025`, frame "Productos Lista",
  node `4090-37743`): the `View toolbar` is a horizontal auto-layout with height *hug contents* = 56px and
  8px gap; `Button` (size md) is 40px tall ("Nuevo producto" 168x40), `Sort` is 40x40 and the list/grid
  `Tabs` is 108x40 (radius 12px, 4px gap, inner tab buttons 48x32). Same as `ListView.jsx` (`h-10`,
  `w-[108px]`, `rounded-xl`, `p-1`). The "confirmed with Design" item of ETP-5601 is still unchecked in Jira.

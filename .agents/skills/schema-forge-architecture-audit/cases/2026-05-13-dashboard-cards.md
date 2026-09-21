# Case: dashboard cards — extract shared shell + empty state + chevron

**Date:** 2026-05-13
**Jira:** ETP-3981
**Branch:** feature/ETP-3981
**Reporter:** Valentin (manual visual inspection)

## Targets

- `tools/app-shell/src/components/dashboard/CollectionsPaymentsCard.jsx`
- `tools/app-shell/src/components/dashboard/RecentSalesList.jsx`
- `tools/app-shell/src/components/dashboard/BestProductsList.jsx`

## Duplication map (pre-refactor)

| # | Block | Collections | RecentSales | BestProducts |
|---|---|---|---|---|
| 1 | Card shell (outer `overflow-hidden bg-white` + border + radius) | L49–63 | L22–36 | L67–81 |
| 2 | Header bar (gray, 48px) with title | L64–104 | L37–77 (the user-flagged block) | L82–126 |
| 3 | Empty state (title + subtitle + optional CTAs) | L106–118 (no CTAs) | L78–114 | L128–164 |
| 4 | Chevron tail (28×24 wrapper + ChevronRight) | — | L267–280 | L327–339 |

## Extracted components

Location: `tools/app-shell/src/components/dashboard/_shared/`

- `DashboardCard.jsx` — pattern: [extract-card-shell](../patterns/extract-card-shell.md). Props: `title`, `headerExtra?`, `children`, `testId?`.
- `DashboardEmptyState.jsx` — pattern: [extract-empty-state](../patterns/extract-empty-state.md). Props: `title`, `subtitle`, `actions?`, `width?`, `textPadding?`.
- `DashboardRowChevron.jsx` — pattern: [extract-leaf-icon-slot](../patterns/extract-leaf-icon-slot.md). Zero props.

## Functionality preservation

- Collections did NOT have CTAs in its empty state → handled by leaving `actions` undefined.
- Collections empty had `padding: '0px 20px'` on the text block → exposed as `textPadding` prop.
- Sales/Products had fixed `width: '340px'` on the empty container → exposed as `width` prop.
- Sales/Products' two CTAs use distinct visuals → encoded as `variant: 'secondary' | 'primary'` in DashboardEmptyState.

## Tests

- BEFORE refactor: Tester added 29 new Vitest tests across `CollectionsPaymentsCard.vitest.jsx`, `RecentSalesList.vitest.jsx`, `BestProductsList.vitest.jsx` covering header titles, empty states, populated rendering, link targets, ViewToggle, trend banners.
- AFTER refactor: 38/38 green, no test changes needed → behavior preserved.
- New tests for `_shared/`: added in `_shared/__tests__/`.

## LOC delta

| File | Before | After | Δ |
|---|---|---|---|
| CollectionsPaymentsCard.jsx | 345 | 284 | -61 |
| RecentSalesList.jsx | 289 | 196 | -93 |
| BestProductsList.jsx | 348 | 251 | -97 |
| _shared/DashboardCard.jsx | — | 59 | +59 |
| _shared/DashboardEmptyState.jsx | — | 84 | +84 |
| _shared/DashboardRowChevron.jsx | — | 25 | +25 |
| **Total** | **982** | **899** | **-83** |

Future dashboard cards start ~60 LOC ahead. Each new card avoids reimplementing shell + empty state.

## Decisions worth remembering

- Kept `CountBadge` private to `CollectionsPaymentsCard` — only used there, no other case to motivate extraction.
- Kept `TrendPill` and `ViewToggle` private to `BestProductsList` — same reason. Wait for a second consumer before promoting.
- The CTA buttons in `DashboardEmptyState` use named variants (`primary`, `secondary`) rather than style props. If a third variant appears, add it inside `BTN_VARIANTS`.

## Surprises

- `RecentSalesList.jsx` line 222 had dead code: `docNum || inv.documentNo || '—'`. `docNum` already resolves through `documentNo → document_no → docNo`, so the second `inv.documentNo` is unreachable. Flagged but left intact to keep refactor scope minimal.
- `BestProductsList` empty state navigates to `/sales-invoice/new` (sales CTA in a products card) — kept as-is per "no functionality change" rule.
- `BestProductsList` header bar had extra layout props (`flex: 'none', order: 0, alignSelf: 'stretch', flexGrow: 0`) that the other two cards lacked. The shared shell does not include them — visual diff confirms the difference was inert (parent container did not require them).

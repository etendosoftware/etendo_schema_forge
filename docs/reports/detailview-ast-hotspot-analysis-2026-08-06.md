# AST + git-churn hotspot analysis — `DetailView.jsx`

**Date:** 2026-08-06
**Author:** automated analysis (Schema Forge Developer / DEV phase)
**Target:** `tools/app-shell/src/components/contract-ui/DetailView.jsx` — 4,719 lines
**Script:** `cli/src/ast-churn-hotspot.js` (reusable — `--file <path>`)
**Raw data:** `docs/reports/detailview-ast-hotspot-analysis-2026-08-06.json`
**Supersedes the diagnosis in:** `docs/reports/contract-ui-churn-analysis.md` §9 (2026-06-10)

---

## 1. Why this report exists

The 2026-06-10 report proposed a seven-component extraction map for `DetailView.jsx` (§9.2:
`LinesSection`, `SecondaryTabsSection`, `DetailToolbar`, `DetailProcessButtons`, `DetailHeaderForm`,
`PrimaryTabBar`, `DetailSidePanel`) and ranked the effort. That ranking was derived from **manual
region boundaries read off JSX comments** — never from measured per-function churn. Two months later
the file is 20% larger and has taken 209 more commits, so the priority order was worth re-deriving
from real data rather than inherited intuition.

This report measures two things separately and never blends them:

1. **Primary metric (AST-derived).** Every function-like unit in the file, located by walking the
   Babel AST, with its exact `loc` line range, scored by measured git churn over that range.
2. **Secondary metric (NOT AST-derived).** Line ranges between consecutive JSX comment markers —
   the same signal §9.2 was drawn from, kept in its own section so it cannot be mistaken for structure.

**Heat score = `lineCount × commitCount`.**

---

## 2. Methodology

**Unit discovery (primary metric).** `@babel/parser` with the `jsx` plugin; no text matching.
Collected at module top level (depth 0) and one level inside each top-level function (depth 1):

- `function f() {}` declarations, including `export function`
- `const f = () => {}` / `const f = function () {}`
- `const f = useCallback(fn, deps)` / `useMemo` / `memo` / `forwardRef` — **without these, 26 of
  `DetailView`'s 30 named inner units are invisible**, because in a React component body most named
  functions are hook-wrapped. An earlier pass that only accepted bare arrows found 4 inner units
  instead of 30.

Line ranges come from AST `node.loc`. For a hook-wrapped unit the range is the whole
`VariableDeclarator` (call + dependency array), which is what a developer actually edits.

**Churn per unit.** For each `[startLine, endLine]`:

```
git log -L<start>,<end>:tools/app-shell/src/components/contract-ui/DetailView.jsx \
        --format='C%x09%H%x09%ad%x09%s' --date=short -s
```

121 ranges (82 units + 39 marker regions), ~16 s total.

### Three measurement caveats, stated up front

1. **`--follow` cannot be combined with `-L`.** git rejects it outright:
   `fatal: --follow requires exactly one pathspec`. Range churn is therefore measured *without*
   `--follow`. This costs nothing here — the file has **no renames in its history**, so `--follow`
   has no rename to follow. What it *does* change is history simplification, which is why the
   file-level totals differ by metric (see §3) and why the 2026-06-10 report's "262 commits" is not
   comparable to a plain `git log` count.
2. **git 2.50.1 (Apple Git-155) aborts on some ranges of this file.** `Assertion failed:
   (rs->nr == 0 || rs->ranges[rs->nr-1].end <= a), function range_set_append, file line-log.c, line 75`
   — and it aborts *after* streaming partial output, so a failed run cannot be salvaged from stdout.
   The script bisects the range and unions the halves, which recovers most of it. **Lines 3548–3578
   abort at every width, including one line at a time**, so they are unmeasurable on this git build;
   only Apple Git 2.50.1 is installed on this machine. Exactly **1 of 121 ranges** is affected
   (`Tab content: Lines`, 31 unmeasurable lines) and its numbers are marked `≥` — a lower bound.
3. **Depth-1 units are nested inside their depth-0 parent**, so their lines appear in two rows.
   The tables are a ranking, not a partition; do not sum the `Lines` column.

---

## 3. File-level churn

| Metric | Value | Note |
|---|---|---|
| Current lines | **4,719** | 3,914 on 2026-06-10 |
| Commits — `git log` (incl. merges) | **585** | the honest "how often was this file in a change" number |
| Commits — `--no-merges` | 376 | |
| Commits — `--follow` | 398 | comparable to the June report's 262 |
| Commits since 2026-06-10 | **209** | |
| Distinct ETP tickets (plain / `--follow`) | **114** / 103 | 48 on 2026-06-10 |
| Distinct ETP tickets since 2026-06-10 | **68** | |
| `useState` calls inside `DetailView` | **51** | 42 on 2026-06-10 |
| All React hook calls inside `DetailView` | **133** | |
| Destructured props on `DetailView` | **105** | "~90" on 2026-06-10 |

---

## 4. Primary metric — AST-derived units, ranked by heat

**82 units** (49 at depth 0, 33 at depth 1). Full table, not truncated.

| # | Unit | Kind | Depth | Lines | Range | Commits | Since 06-10 | Tickets | Heat |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `DetailView` | function · exported | 0 | 3374 | 1217–4590 | 535 | 163 | 103 | **1,805,090** |
| 2 | `handleLineFieldChange` | const-useCallback | 1 (in `DetailView`) | 80 | 2539–2618 | 29 | 2 | 7 | **2,320** |
| 3 | `SecondaryTableTab` | function · exported | 0 | 79 | 564–642 | 15 | 13 | 10 | **1,185** |
| 4 | `fireCallout` | const-useCallback | 1 (in `DetailView`) | 69 | 2433–2501 | 11 | 4 | 8 | **759** |
| 5 | `renderCustomTabPanels` | const-arrow | 1 (in `DetailView`) | 66 | 2811–2876 | 7 | 5 | 7 | **462** |
| 6 | `selectorContextByEntity` | const-useMemo | 1 (in `DetailView`) | 33 | 1463–1495 | 13 | 1 | 11 | **429** |
| 7 | `renderDraftModeSaveActions` | function | 0 | 50 | 996–1045 | 7 | 7 | 5 | **350** |
| 8 | `buildInlineRowUpdateHandler` | function · exported | 0 | 101 | 696–796 | 3 | 1 | 2 | **303** |
| 9 | `buildSecondaryLineHandlers` | function · exported | 0 | 110 | 314–423 | 2 | 1 | 2 | **220** |
| 10 | `renderNewRecordSaveActions` | function | 0 | 34 | 1083–1116 | 6 | 6 | 4 | **204** |
| 11 | `getSecondaryRowUpdateHandler` | function · exported | 0 | 63 | 220–282 | 3 | 1 | 3 | **189** |
| 12 | `secondaryAddLineBar` | function | 0 | 59 | 504–562 | 3 | 3 | 3 | **177** |
| 13 | `buildInitialTabs` | function | 0 | 28 | 846–873 | 4 | 4 | 4 | **112** |
| 14 | `renderExistingRecordSaveAction` | function | 0 | 16 | 1123–1138 | 7 | 7 | 5 | **112** |
| 15 | `getButtonClass` | function | 0 | 22 | 4697–4718 | 5 | 3 | 3 | **110** |
| 16 | `getAddLineWrapperStyle` | function · exported | 0 | 27 | 655–681 | 4 | 3 | 3 | **108** |
| 17 | `getDetailContentContainerClassName` | function · exported | 0 | 15 | 875–889 | 7 | 4 | 3 | **105** |
| 18 | `isDeleteButtonVisible` | function · exported | 0 | 26 | 955–980 | 4 | 3 | 3 | **104** |
| 19 | `confirmHeaderDelete` | const-arrow | 1 (in `DetailView`) | 27 | 1684–1710 | 3 | 3 | 3 | **81** |
| 20 | `handleAddLineClick` | const-useCallback | 1 (in `DetailView`) | 27 | 2196–2222 | 3 | 0 | 3 | **81** |
| 21 | `onDelete` | const-arrow | 1 (in `buildSecondaryLineHandlers`) | 39 | 382–420 | 2 | 1 | 2 | **78** |
| 22 | `TabStripButton` | function | 0 | 32 | 19–50 | 2 | 0 | 1 | **64** |
| 23 | `secondaryDetailSidebar` | function | 0 | 62 | 441–502 | 1 | 1 | 1 | **62** |
| 24 | `applyProductCurrencyConversion` | function | 0 | 29 | 4602–4630 | 2 | 2 | 2 | **58** |
| 25 | `onSaveLine` | const-arrow | 1 (in `buildSecondaryLineHandlers`) | 46 | 335–380 | 1 | 0 | 1 | **46** |
| 26 | `executeDetailProcessImpl` | function | 0 | 46 | 1151–1196 | 1 | 1 | 1 | **46** |
| 27 | `buildDeleteRowHandler` | function · exported | 0 | 22 | 798–819 | 2 | 0 | 1 | **44** |
| 28 | `handleTotalDiscountChange` | const-useCallback | 1 (in `DetailView`) | 22 | 2627–2648 | 2 | 0 | 2 | **44** |
| 29 | `applyCalloutComboUpdates` | function · exported | 0 | 11 | 188–198 | 4 | 3 | 2 | **44** |
| 30 | `handleChangeWithCallout` | const-useCallback | 1 (in `DetailView`) | 21 | 2507–2527 | 2 | 2 | 2 | **42** |
| 31 | `flushPendingLines` | const-useCallback | 1 (in `DetailView`) | 18 | 1611–1628 | 2 | 0 | 2 | **36** |
| 32 | `renderStatusPillBadge` | const-arrow | 1 (in `DetailView`) | 18 | 2774–2791 | 2 | 2 | 2 | **36** |
| 33 | `renderLegacyBadge` | const-arrow | 1 (in `DetailView`) | 18 | 2792–2809 | 2 | 2 | 3 | **36** |
| 34 | `handlePostSaveNavigation` | function · exported | 0 | 12 | 1065–1076 | 3 | 3 | 2 | **36** |
| 35 | `detailContentPadding` | function | 0 | 6 | 126–131 | 6 | 2 | 5 | **36** |
| 36 | `handleSecondaryAddLineToggle` | const-useCallback | 1 (in `DetailView`) | 16 | 2242–2257 | 2 | 0 | 2 | **32** |
| 37 | `handleImportClick` | const-useCallback | 1 (in `DetailView`) | 14 | 2227–2240 | 2 | 1 | 2 | **28** |
| 38 | `reportUnnavigableSave` | function · exported | 0 | 9 | 1055–1063 | 3 | 3 | 2 | **27** |
| 39 | `getTabStripBleedClassName` | function · exported | 0 | 25 | 146–170 | 1 | 1 | 1 | **25** |
| 40 | `handleNotesSave` | const-useCallback | 1 (in `DetailView`) | 22 | 2650–2671 | 1 | 0 | 1 | **22** |
| 41 | `calculateNetUnitPrice` | function | 0 | 22 | 4652–4673 | 1 | 0 | 1 | **22** |
| 42 | `getSelectedLinesTotalLabel` | function · exported | 0 | 10 | 644–653 | 2 | 1 | 2 | **20** |
| 43 | `getDraftModeCompleted` | function | 0 | 10 | 830–839 | 2 | 1 | 2 | **20** |
| 44 | `_windowContextInfo` | const-useMemo | 1 (in `DetailView`) | 9 | 1651–1659 | 2 | 0 | 1 | **18** |
| 45 | `closeLine` | const-useCallback | 1 (in `DetailView`) | 9 | 1974–1982 | 2 | 0 | 2 | **18** |
| 46 | `closeSecondaryLine` | const-useCallback | 1 (in `DetailView`) | 9 | 1996–2004 | 2 | 0 | 2 | **18** |
| 47 | `lineHiddenColumns` | const-useMemo | 1 (in `DetailView`) | 6 | 1547–1552 | 3 | 3 | 2 | **18** |
| 48 | `extractErrorMessage` | const-useCallback | 1 (in `DetailView`) | 4 | 1991–1994 | 4 | 0 | 4 | **16** |
| 49 | `SecondaryFormTab` | function · exported | 0 | 15 | 425–439 | 1 | 0 | 1 | **15** |
| 50 | `handleCustomModalAddClick` | const-useCallback | 1 (in `DetailView`) | 15 | 2259–2273 | 1 | 0 | 1 | **15** |
| 51 | `populateIdentifierFields` | function | 0 | 13 | 4683–4695 | 1 | 0 | 1 | **13** |
| 52 | `onAdd` | const-arrow | 1 (in `buildSecondaryLineHandlers`) | 10 | 324–333 | 1 | 0 | 1 | **10** |
| 53 | `resolveSecondaryRowClickHandler` | function | 0 | 5 | 182–186 | 2 | 0 | 2 | **10** |
| 54 | `getSecondarySelectionChangeHandler` | function · exported | 0 | 5 | 214–218 | 2 | 1 | 2 | **10** |
| 55 | `normalizeStatusValue` | function | 0 | 5 | 824–828 | 2 | 1 | 2 | **10** |
| 56 | `enrichedChildren` | const-useMemo | 1 (in `DetailView`) | 9 | 1366–1374 | 1 | 0 | 1 | **9** |
| 57 | `applyProductCalloutPriceAdjustments` | function | 0 | 9 | 4592–4600 | 1 | 1 | 1 | **9** |
| 58 | `resolveTaxIdentifier` | function | 0 | 9 | 4632–4640 | 1 | 0 | 1 | **9** |
| 59 | `calculateLineNetAmount` | function | 0 | 9 | 4642–4650 | 1 | 0 | 1 | **9** |
| 60 | `flushAndSave` | const-useCallback | 1 (in `DetailView`) | 4 | 1635–1638 | 2 | 1 | 1 | **8** |
| 61 | `computeIsDirty` | function · exported | 0 | 7 | 895–901 | 1 | 0 | 1 | **7** |
| 62 | `secondaryAddRowSeed` | const-useMemo | 1 (in `DetailView`) | 7 | 1406–1412 | 1 | 0 | 1 | **7** |
| 63 | `getSecondaryAddRowRef` | const-useCallback | 1 (in `DetailView`) | 6 | 1584–1589 | 1 | 0 | 1 | **6** |
| 64 | `getSecondaryAddLineWrapperRef` | const-useCallback | 1 (in `DetailView`) | 6 | 1594–1599 | 1 | 0 | 1 | **6** |
| 65 | `getSecondaryInlineLinesRef` | const-useCallback | 1 (in `DetailView`) | 6 | 1601–1606 | 1 | 0 | 1 | **6** |
| 66 | `formatAmount` | function | 0 | 3 | 85–87 | 2 | 1 | 2 | **6** |
| 67 | `getLinesTabsSectionClassName` | function · exported | 0 | 3 | 891–893 | 2 | 1 | 2 | **6** |
| 68 | `handleFieldBlur` | const-useCallback | 1 (in `DetailView`) | 3 | 1443–1445 | 2 | 1 | 2 | **6** |
| 69 | `renderSaveActions` | function | 0 | 5 | 1145–1149 | 1 | 1 | 1 | **5** |
| 70 | `maybeSaveBeforeProcess` | function · exported | 0 | 5 | 1211–1215 | 1 | 1 | 1 | **5** |
| 71 | `hasRecordForRoute` | function · exported | 0 | 4 | 903–906 | 1 | 0 | 1 | **4** |
| 72 | `trustedDimensionKeys` | const-useMemo | 1 (in `DetailView`) | 4 | 1543–1546 | 1 | 1 | 1 | **4** |
| 73 | `confirmDelete` | const-useCallback | 1 (in `DetailView`) | 4 | 1717–1720 | 1 | 0 | 1 | **4** |
| 74 | `currentItem` | const-useMemo | 1 (in `DetailView`) | 4 | 2158–2161 | 1 | 0 | 0 | **4** |
| 75 | `resolveCanAddSecondaryLines` | function · exported | 0 | 3 | 692–694 | 1 | 1 | 1 | **3** |
| 76 | `isLoadingRecordForRoute` | function · exported | 0 | 3 | 908–910 | 1 | 0 | 1 | **3** |
| 77 | `resolveHideMoreMenu` | function · exported | 0 | 3 | 912–914 | 1 | 0 | 1 | **3** |
| 78 | `shouldShowLinesEmptyState` | function · exported | 0 | 3 | 916–918 | 1 | 0 | 1 | **3** |
| 79 | `shouldShowLineActionButtons` | function · exported | 0 | 3 | 982–984 | 1 | 0 | 1 | **3** |
| 80 | `canShowAddLineArea` | function · exported | 0 | 3 | 986–988 | 1 | 0 | 1 | **3** |
| 81 | `canUseCachedTaxRate` | function | 0 | 3 | 4675–4677 | 1 | 0 | 1 | **3** |
| 82 | `isPositiveNumeric` | function | 0 | 3 | 4679–4681 | 1 | 0 | 1 | **3** |

### 4.1 What the primary metric actually says

The AST metric produces one finding, and it is not subtle:

| | `DetailView` | All 48 other top-level units combined |
|---|---|---|
| Lines | **3,374** (71.5% of file) | 1,047 |
| Commits touching it | **535** of 585 (91.5%) | — |
| Distinct ETP tickets | **103** of 114 (90.4%) | — |
| Heat | **1,805,090** | 3,925 |
| Share of all AST-unit heat | **99.78%** | 0.22% |

The second-ranked unit in the entire file, `handleLineFieldChange`, scores 2,320 — **778× less** than
`DetailView`. At function granularity there is exactly **one** hotspot, and it is the component body.

Two consequences follow directly:

- **The AST metric cannot prioritize the refactor by itself.** It proves the monolith is the problem
  and then runs out of resolution. That is precisely why §5's marker regions are worth measuring:
  inside a single 3,374-line function they are the only sub-structure that exists.
- **The 2026-06-10 report's problem P6 ("69 exported helpers") is not a churn problem.** All 48
  non-`DetailView` top-level units together hold 1,047 lines and **0.22% of the file's heat**. The
  helper extraction that already happened *worked*: those helpers are cold. §9.4's suggestion to
  un-export them is cosmetic and should be dropped from the plan, not scheduled.

`DetailView`'s 30 named inner units account for only 556 of its 3,374 lines. The remaining
**2,818 lines are the JSX `return` plus inline callbacks** — unnamed, unextractable by any
function-level tool, and the actual substance of the monolith.

---

## 5. Secondary metric — comment-marker regions (**NOT AST-derived**)

Ranges between consecutive standalone `{/* … */}` JSX comments, capped at the enclosing function's
end. These are **heuristic**: a comment is not a structural boundary, a developer can move or reword
one, and the region below a marker is only *conventionally* the thing the marker describes. They are
measured because §9.2's extraction map was drawn from exactly these labels, so this is the
apples-to-apples comparison.

Multi-line markers are included — the extractor initially only matched single-line
`{/* … */}` and silently missed 9 of 39 regions, among them `Tab content: Lines`, which is one of
the regions §9.2 depends on.

| # | Marker | Lines | Range | Commits | Since 06-10 | Commits/line | Heat |
|---|---|---|---|---|---|---|---|
| 1 | customTabsAfterBottom: custom tabs rendered below the bottomSection | 222 | 4369–4590 | 77 | 12 | 0.35 | **17,094** |
| 2 | Bulk action bar: delete + detail processes (classic only) | 151 | 3585–3735 | 95 | 17 | 0.63 | **14,345** |
| 3 | Non-general primary tab: show Panel fullscreen | 61 | 3337–3397 | 74 | 4 | 1.21 | **4,514** |
| 4 | Principal + collapsed fields wrapped in a card | 58 | 3402–3459 | 75 | 9 | 1.29 | **4,350** |
| 5 | More actions — only render the button when there is something to show | 139 | 3031–3169 | 31 | 13 | 0.22 | **4,309** |
| 6 | Detail entity process buttons — visible only for the single-line-click case. The multi-row (selectedChildRows) case is rendered exclusively by the bulk action … | 61 | 3232–3292 | 54 | 14 | 0.89 | **3,294** |
| 7 | Primary tab bar (General / Additional Info / etc.) | 40 | 3297–3336 | 76 | 4 | 1.90 | **3,040** |
| 8 | Action bar: Cancel + status \| actions + save | 39 | 2930–2968 | 65 | 13 | 1.67 | **2,535** |
| 9 | Tab content: secondary child entity tabs (or form-only tabs) | 106 | 4108–4213 | 19 | 7 | 0.18 | **2,014** |
| 10 | Right sidebar: line detail form. Suppressed in inlineEditable mode — edit happens inside the row via InlineLinesPanel. | 177 | 3901–4077 | 10 | 4 | 0.06 | **1,770** |
| 11 | Footer: Related Docs + Notes | 38 | 4331–4368 | 29 | 2 | 0.76 | **1,102** |
| 12 | Process buttons — only shown for existing records, evaluated locally or by server visibility | 57 | 3175–3231 | 17 | 7 | 0.30 | **969** |
| 13 | Tab content: Lines. The lines wrapper flows naturally — no internal scroll, no flex-1 height capture. All rows render, the bottom section follows beneath them,… | 44 | 3539–3582 | ≥19 | ≥0 | 0.43 | **≥836** |
| 14 | Tab content: Others (secondary header fields) | 22 | 4214–4235 | 38 | 2 | 1.73 | **836** |
| 15 | Bottom section: hidden when a custom tab (Adjuntos, etc.) is active. In inlineEditable mode the wrapper is shrink-0 so it stays fixed at the bottom while the l… | 29 | 4273–4301 | 28 | 2 | 0.97 | **812** |
| 16 | Collapsible secondary header fields (hidden if no collapsed fields or sidebarContent) | 29 | 3460–3488 | 24 | 3 | 0.83 | **696** |
| 17 | Inline edit form for selected child row (when no DetailForm) | 108 | 3736–3843 | 5 | 1 | 0.05 | **540** |
| 18 | Totals block: BalanceFooterPanel for double-entry windows, else DocumentTotalsPanel | 15 | 4302–4316 | 30 | 5 | 2.00 | **450** |
| 19 | Delete record — hidden unconditionally when hideDeleteButton is set; otherwise shown for a deleteAction-backed delete at any lifecycle stage (except RPVOID), o… | 23 | 3008–3030 | 19 | 8 | 0.83 | **437** |
| 20 | Tabs: child entities + Others | 31 | 3508–3538 | 13 | 5 | 0.42 | **403** |
| 21 | After-totals slot (e.g. payment footer) | 14 | 4317–4330 | 26 | 1 | 1.86 | **364** |
| 22 | Selection toolbar — portaled to document.body so the downward shadow renders OUTSIDE the linesScrollRef's overflow-auto clipping boundary even when scroll is e… | 57 | 3844–3900 | 6 | 2 | 0.11 | **342** |
| 23 | Form section — conditionally wrapped with sidebar when sidebarAboveTabsOnly | 4 | 3398–3401 | 62 | 0 | 15.50 | **248** |
| 24 | Form footer: inline content below form, above tabs | 19 | 3489–3507 | 12 | 5 | 0.63 | **228** |
| 25 | Tab content: CustomLines (replaces standard lines table) | 30 | 4078–4107 | 7 | 2 | 0.23 | **210** |
| 26 | Topbar right slot (e.g. payment status badge) | 16 | 2969–2984 | 10 | 2 | 0.63 | **160** |
| 27 | Send / Print document — uses DocumentPrintDrawer. Icon unified with RowQuickActions (envelope/Mail) so the same "send document" affordance looks identical in d… | 13 | 2985–2997 | 12 | 3 | 0.92 | **156** |
| 28 | Hidden probe: detect if Others form has content (outside tabs block so it fires even when tabs is empty) | 14 | 4248–4261 | 8 | 2 | 0.57 | **112** |
| 29 | Tab content: custom tabs with placement='tab'. We always mount the component (so it can manage its own internal state and not lose scroll/pagination on tab swi… | 12 | 4236–4247 | 9 | 0 | 0.75 | **108** |
| 30 | Print document — shown when documentPreview is not provided | 10 | 2998–3007 | 9 | 1 | 0.90 | **90** |
| 31 | Simple entity (no child): full form only | 11 | 4262–4272 | 6 | 1 | 0.55 | **66** |
| 32 | Content column: tab bar (shrink-0) + scrollable form area | 2 | 3295–3296 | 32 | 0 | 16.00 | **64** |
| 33 | ETP-4656 (Gap 4) — `enableSecondaryRowDelete` also unlocks the bulk-select bar for non-inlineEditable tabs (e.g. Direcciones/Personas de contacto), matching th… | 22 | 541–562 | 2 | 2 | 0.09 | **44** |
| 34 | Table + add button | 2 | 3583–3584 | 15 | 0 | 7.50 | **30** |
| 35 | Extra action buttons from page | 2 | 3170–3171 | 9 | 0 | 4.50 | **18** |
| 36 | alignSelf:flex-start keeps this span from being stretched by the flex-column parent — otherwise data-inline-add-portal would cover the whole bar and the outsid… | 10 | 531–540 | 1 | 1 | 0.10 | **10** |
| 37 | Content card with rounded top-left corner | 2 | 2928–2929 | 3 | 0 | 1.50 | **6** |
| 38 | Save action — rendered before process buttons when saveBeforeProcesses is set (per-window opt-in) | 3 | 3172–3174 | 1 | 1 | 0.33 | **3** |
| 39 | Scrollable content + optional sidebarContent (full-height independent column) | 2 | 3293–3294 | 1 | 0 | 0.50 | **2** |

### 5.1 Marker drift since 2026-06-10

Of the 16 markers §9.1 listed, **13 still exist**, 3 no longer do:

- `Bulk delete bar` → renamed to `Bulk action bar: delete + detail processes (classic only)`, and the
  scope widened: it now also hosts detail processes. It is region **#2 by heat** (151 lines, 95 commits).
- `LinesSelectionBar` → no longer a marker. The component name still appears 5× in the file; the
  region is now labelled `Selection toolbar — portaled to document.body…`.
- `Tab content: Lines` → still present, but as a **multi-line** comment, which is why it needed the
  extractor fix above.

The file now has **39 marker regions vs. the 16 §9.1 knew about**. Several of the new ones are hot,
and the single hottest region in the file is one of them (§6.3).

---

## 6. Delta vs. 2026-06-10 — does the data confirm §9.2?

### 6.1 Growth

| | 2026-06-10 | 2026-08-06 | Δ |
|---|---|---|---|
| Lines | 3,914 | **4,718** | **+804 (+20.5%)** |
| Commits (`--follow`, comparable) | 262 | **398** | **+136** |
| Commits in the window (by date) | — | **209** since 2026-06-10 | ~3.4/day |
| Distinct ETP tickets (`--follow`) | 48 | **103** | **+55** |
| `useState` in `DetailView` | 42 | **51** | **+9** |
| Props on `DetailView` | ~90 | **105** | **+15** |

Every structural metric the June report flagged as pathological got worse, and none of §9.2's six
extraction steps was executed. Two months of feature work added the equivalent of a mid-sized
component *inside* the monolith.

### 6.2 §9.2's proposed components, scored

Each of §9.2's seven components mapped onto the marker regions that currently implement it, then
scored with a **single multi-range `git log -L … -L …` query** so the commit count is a true union
rather than a sum of overlapping per-region counts (that distinction matters: for `LinesSection` the
union is 144 commits, summing the regions naively gives 105).

| §9.2 component | June's ranking | Regions | Lines | Commits | Since 06-10 | Heat | Rank | Verdict |
|---|---|---|---|---|---|---|---|---|
| `LinesSection` | step 5 of 6 — "**la mayor ganancia**" | 7 | 569 | 144 | 22 | **81,936** | **#1** | ✅ **CONFIRMED** |
| — *(not proposed)* `DetailModals` | — absent from the map | 8 | 343 | 89 | 19 | **30,527** | **#2** | ❌ **MISSED ENTIRELY** |
| `DetailToolbar` | step 2 — "S / low risk" warm-up | 8 | 245 | 104 | **35** | **25,480** | **#3** | ⚠️ **UNDER-RANKED** |
| `DetailHeaderForm` | step 4 — "M / medium" | 4 | 110 | 123 | 14 | **13,530** | #4 | ≈ roughly right |
| `SecondaryTabsSection` | step 6 of 6 — co-biggest win | 4 | 173 | ≥60 | ≥12 | **≥10,380** | #5 | ❌ **OVER-RANKED** |
| `PrimaryTabBar` | step 1 — "trivial / XS" | 2 | 101 | 90 | 8 | **9,090** | #6 | ⚠️ **right call, wrong reason** |
| `DetailProcessButtons` | step 2 — "S / low risk" | 2 | 118 | 67 | 22 | **7,906** | #7 | ≈ roughly right |
| `DetailSidePanel` | step 1 — "trivial / XS" | 2 | 4 | 32 | 0 | **128** | #8 | ✅ trivial, and cold |

### 6.3 Verdict: **partially confirmed, and wrong about the ordering**

**`LinesSection` — CONFIRMED, decisively.** §9.2 called it "la mayor ganancia" and it is: heat
**81,936**, 569 lines across 7 regions, **144 of 585 commits**. It beats the next group by 2.7×. Fold
in the 9 lines-owned top-level helpers (`buildInlineRowUpdateHandler`, `buildDeleteRowHandler`,
`getAddLineWrapperStyle`, …) and it reaches **750 lines / 155 commits / heat 116,250**. This half of
the June diagnosis needs no revision.

**`SecondaryTabsSection` — OVER-RANKED.** §9.2 paired it with `LinesSection` as the other big win.
Region-only it ranks **#5 of 8** at heat ≥10,380 — below `DetailToolbar` and `DetailHeaderForm`.
Applying the same helper-inclusive treatment used for `LinesSection` (its 9 already-extracted
`Secondary*` units, 401 lines) lifts it to **574 lines / 72 commits / heat 41,328**, second place —
but still **2.8× cooler than `LinesSection`**, not its equal. The June report conflated *"concentrates
the most state"* with *"attracts the most churn"*. The state is genuinely there; the churn is not.

That helper-inclusive number does, however, **empirically confirm §9.1's central lesson**. The
already-extracted `SecondaryTableTab` is the hottest non-`DetailView` unit in the file (79 lines,
15 commits) and **13 of those 15 commits landed after 2026-06-10**. Extracting the JSX while leaving
the state in the parent did not stop the churn — it relocated it into a component that now takes
~40 props. Any `LinesSection` extraction that repeats this will reproduce the result.

**`DetailToolbar` — UNDER-RANKED, and this is the actionable correction.** §9.2 scheduled it as a
step-2 warm-up ("S effort, low risk"). It is region-rank **#3** by heat (25,480) and **#1 by recent
churn: 35 commits since 2026-06-10** — more than `LinesSection`'s 22 in the same window. It is where
the churn is *now*, and June's own assessment of it as near-stateless and cheap still holds. Highest
current churn × lowest risk should be step 1, not a warm-up.

**`DetailModals` — MISSED ENTIRELY, and it is the single hottest region in the file.**
Lines **4369–4590** (222 lines, 77 commits, heat **17,094**) rank #1 among all 39 regions and appear
nowhere in §9.2. The region is `customTabsAfterBottom` plus an *unlabelled tail*: `DocumentPrintDrawer`,
**three near-identical delete-confirmation `Dialog` blocks** (`deleteConfirmTitle` appears 3× in the
file), a Verifactu processing dialog, and `CustomModal`. §9.2 missed it because it had no comment
marker to read — the exact failure mode that makes the marker heuristic a secondary metric.
This is a new extraction candidate, and the three duplicated dialogs make it a **cheap** one.

**`PrimaryTabBar` — right call, wrong reason, and now stale.** §9.2 put it first because it is
"trivial, XS". In fact `Primary tab bar` has the **second-highest churn density in the file**
(76 commits over 40 lines = 1.90 commits/line; only the 15-line `Totals block` is denser at 2.00).
So it was never trivial in churn terms. But only **8 of its 90 group commits** are since 2026-06-10 —
it has cooled off. Doing it first buys almost nothing today.

**`DetailHeaderForm`, `DetailProcessButtons` — roughly right.** `DetailHeaderForm` is #4 (heat 13,530)
against June's step 4; `DetailProcessButtons` is #7 (7,906) against step 2, with a notable 22 commits
since 2026-06-10 concentrated in `Detail entity process buttons` (54 commits / 61 lines).

**`DetailSidePanel` — confirmed trivial.** 4 lines, heat 128. It is a wrapper, not a component.

### 6.4 Priority order implied by the data

Replacing §9.5's order, on measured heat and *recent* churn:

| Step | Component | Heat | Since 06-10 | Why this position |
|---|---|---|---|---|
| 1 | **`DetailToolbar`** | 25,480 | **35** | Highest current churn; near-stateless, so lowest risk. Best ratio in the file. |
| 2 | **`DetailModals`** *(new)* | 30,527 | 19 | Hottest single region; 3 duplicated dialogs make it cheap and it deletes code. |
| 3 | **`DetailProcessButtons`** | 7,906 | 22 | Third-highest recent churn, small surface, already a coherent block. |
| 4 | **`LinesSection`** | 81,936 | 22 | Highest total heat by far, but the largest and riskiest. Do it after the cheap wins, and **move the state with the JSX** (§9.3 rule 1). |
| 5 | **`DetailHeaderForm`** | 13,530 | 14 | Unchanged from June. |
| 6 | **`SecondaryTabsSection`** | ≥10,380 | ≥12 | Demote from co-first to last: its churn now lives in the extracted `Secondary*` components, so the win is collapsing their ~40-prop surfaces, not moving JSX again. |
| — | `PrimaryTabBar`, `DetailSidePanel` | 9,090 / 128 | 8 / 0 | Drop from the near-term plan. High historical churn, cold now. |

The June report's §9.3 constraints (move state with the JSX; shared state via context, not
prop-drilling; extract leaves first, with tests; one pure-refactor PR each) are unaffected by this
data and still govern every step above. So do R1 (100% behaviour preservation) and R2 (survive
regeneration).

---

## 7. Reusing this analysis

```bash
# Same run that produced this report
node cli/src/ast-churn-hotspot.js \
  --file tools/app-shell/src/components/contract-ui/DetailView.jsx \
  --since 2026-06-10 \
  --out-md  docs/reports/detailview-ast-hotspot-analysis-2026-08-06.md \
  --out-json docs/reports/detailview-ast-hotspot-analysis-2026-08-06.json

# The other God Component named in the 2026-06-10 report
node cli/src/ast-churn-hotspot.js --file tools/app-shell/src/components/contract-ui/DataTable.jsx --since 2026-06-10

# AST only, no git (fast; useful while iterating on unit discovery)
node cli/src/ast-churn-hotspot.js --file <path> --no-churn
```

The JSON carries every field used above (`name`, `kind`, `depth`, `parent`, `exported`, `startLine`,
`endLine`, `lineCount`, `commitCount`, `recentCommitCount`, `tickets`, `heatScore`, `bisected`,
`unmeasurableLines`, `lowerBound`), so a later run can be diffed against this one to check whether a
completed extraction actually moved the churn or merely relocated it — the `SecondaryTableTab`
question in §6.3, which is the one thing this file's history proves is worth verifying.

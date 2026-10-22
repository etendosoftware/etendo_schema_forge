# Grid customization and saved views — technical evaluation (ETP-5834)

**Date:** 2026-10-20 · **Status:** evaluation closed, **decision PENDING human approval** (see §8). This document pre-approves no library and no persistence policy. Implementation (ETP-5835) stays blocked until §8 is signed off.

**Evidence limits.** Source inspection of `origin/develop` on 2026-10-20 plus vendor pages fetched the same day. No running-system reproduction, no PoC (§6). Vendor claims not confirmed on a vendor page are marked *unverified*.

## 1. Current state (what the code does today)

| Fact | Evidence |
|---|---|
| Lists and header tables render through a hand-rolled `DataTable` on shadcn `ui/table` primitives; columns keyed by `col.key`. No TanStack, AG Grid or MUI dependency. | `tools/app-shell/src/components/contract-ui/DataTable.jsx`; `tools/app-shell/package.json` (Radix only) |
| `DataTable` renders every loaded row; its own comment states the table was never virtualized. | `DataTable.jsx` ~L331 |
| **Two rendering models, not one.** Lists and the inline add-row use an HTML `<table>`/colgroup (`DataTable`); the inline-editable lines grid (`linesLayout: "inlineEditable"`) is a separate flex grid with its own `visibleColumns`. They share only the width helpers. | `InlineLinesPanel.jsx` L1060, L1309; `lib/linesColumnWidth.js` |
| Date columns use `flex: 1 0 130px` (ELASTIC basis) so they can expand; per-type bases live in one lookup. | `lib/linesColumnWidth.js` (`ELASTIC_BASIS_PX`, `FIXED_BASIS_PX`, `LIST_BASIS_PX`) |
| Sorting is **server-driven**: `ListView` holds `sortColumn/sortDirection` in the `useEntity` hook and the backend orders; filters (column, quick, advanced) also go to the backend. | `ListView.jsx` L831 (`useEntity`), L1193 (`handleColumnSort`) |
| The advanced filter excludes `discarded`/`system` columns (`isFilterableColumn`). | `schema_forge_core/packages/app-shell-core/src/components/contract-ui/AdvancedFilterBuilder.jsx` L167 |
| No resize, reorder or visibility code anywhere; the only list-level browser persistence is `viewMode:<entity>` in `localStorage`. | `ListView.jsx` L1166 |
| Named filter presets: per user, per window spec, stored in `AD_Preference` key `ETGO_WindowFilters`; opaque JSON parsed by `BoundedJsonParser`; `GET/PUT/DELETE /sws/neo/filters/{window}[/{preset}]`. **Not** a layout contract. | `hooks/useWindowFilterPresets.js`; `com.etendoerp.go/.../NeoFiltersService.java` |
| `DataTable` has ~15 custom consumers (per-window `*HeaderTable.jsx`, `AttachmentsTable`, module pages). | `windows/custom/*`, `artifacts/*/custom/*HeaderTable.jsx` |
| Ownership: the table components are in this functional repo; `ui/table.jsx` and the filter builder are in `schema_forge_core` (`app-shell-core`). Anything that moves to core follows `docs/repo-topology.md`. | paths above |

ETP-5833 (default width policy per field type) is independent and not in the tree. **Precedence rule proposed (pending §8): stored user width > ETP-5833 type default > fallback.** No widths are prescribed here.

## 2. Options compared

- **A — Extend the current table.** Add a column-state layer (width, order, visibility keyed by `col.key`) plus resize/reorder handles to `DataTable` and the lines grid.
- **B — TanStack Table (`@tanstack/react-table`) as headless state engine.** Keep our markup and cell renderers; use its controlled `columnSizing / columnOrder / columnVisibility` state. Vendor: "headless table library … full control over markup, styles, and behavior", MIT, "server-side friendly" (https://github.com/TanStack/table, fetched 2026-10-20). Whether its sizing/ordering APIs fit our two renderers is *unverified* — vendor docs pages for them returned 404 when fetched.
- **C — AG Grid.** Community is MIT and includes client-side and infinite row models; the server-side row model is Enterprise (https://www.ag-grid.com/react-data-grid/row-models/ and https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/, fetched 2026-10-20). Column resize/move/hide in Community: *unverified* on a vendor page (the community-vs-enterprise page lists "row and column configurations" without naming them).
- **Other candidates screened out** (react-data-grid, Glide Data Grid, Handsontable and similar): the criteria were inline editing with our own renderers, incremental migration and licence; canvas or spreadsheet-style grids replace the renderer exactly as C and D do, so they share their rejection reason and were not compared cell by cell.
- **D — MUI X DataGrid.** Column reordering is Pro ("The Data Grid Pro lets users drag and drop columns to reorder them", https://mui.com/x/react-data-grid/column-ordering/, fetched 2026-10-20); column pinning is Pro (https://mui.com/x/introduction/licensing/); resizing is on by default in https://mui.com/x/react-data-grid/column-dimensions/ with no plan badge, so it appears to be in the free tier (the licensing page lists it under Pro — the two pages disagree: *unverified*).

## 3. Matrix

Legend: ✔ supported / low effort · ◐ partial or needs work · ✘ not supported or high risk · ? unverified.

| Criterion | A extend | B TanStack headless | C AG Grid | D MUI X |
|---|---|---|---|---|
| Resize, reorder, visibility, stable column id | ◐ we build it; `col.key` is already the id | ✔ state model exists (?) docs; we still render handles | ✔ (? tier) | ◐ reorder Pro |
| Compatible with ETP-5833 default widths | ✔ stored width simply overrides the helper | ✔ same: defaults feed `initialState` | ◐ two width systems | ◐ two width systems |
| Inline edit, add-row, totals, custom renderers, custom-table overrides | ✔ untouched | ✔ untouched (markup stays ours) | ✘ rewrite of ~3.8k-line table, lines grid and ~15 custom tables | ✘ same |
| Permissions: never expose excluded columns | ✔ filter by server-permitted keys before the layer | ✔ same, state is only a projection | ◐ library holds its own column model | ◐ same |
| Server-side sort/filter/page; coexists with presets | ✔ already server-driven | ✔ `manual*` modes (?) | ◐ server-side model is Enterprise; infinite model is Community | ◐ |
| Accessibility, keyboard, touch | ✘ we own it (gate) | ✘ we own it (headless) | ✔ built in (?) | ✔ built in (?) |
| Large lists | ✘ no virtualization today (gate) | ◐ virtualization is a separate add-on | ✔ | ✔ |
| Licence / deps / maintenance | ✔ none | ✔ MIT, one dependency | ◐ MIT core, paid tier for server-side | ◐ paid tiers for several features |
| Incremental migration, rollback | ✔ per-surface flag | ✔ per-surface flag | ✘ big-bang per surface | ✘ big-bang per surface |
| Effort (qualitative) | medium | medium | very high | very high |

## 4. Recommendation

The matrix separates the options on one axis: C and D replace the renderer, which forfeits inline editing, add-row, totals and the custom-table overrides and cannot migrate incrementally; A and B keep them. A and B differ only in who owns the state model. **Recommended: A, shaped after B's state model** — a small in-repo column-state layer keyed by `col.key` with the controlled-state shape `{ order, widths, hidden }`, covering both rendering models through one hook. Adopt `@tanstack/react-table` only if, in the first phase, the layer is shown to duplicate what the library gives for free (that check is a phase-0 gate, not a decision made here). Accessibility and large-list performance are not solved by either option; they are gates (§6).

## 5. Saved-views contract (proposal, needs human approval)

1. **Surfaces.** Phase 1: generic list (`ListView`/`DataTable` list mode). Phase 2: inline lines grid. Custom tables: opt-in by declaring their column keys; excluded by default. Not in scope: dashboards, attachments table.
2. **One vs several.** v1: one personal view per (user, window, entity), with "reset to default". Named views later, reusing the preset naming pattern.
3. **Content.** `{ version, order[], widths{key:px}, hidden[] }` only. Filters and sort are **not** part of the view; they stay in the existing named filter presets, so the two features coexist and neither implies the other.
4. **Identity/isolation.** Key = user + window spec name (kebab-case) + entity (`header`/line entity). Never shared across users. Team/shared views are out of scope unless approved separately.
5. **Persistence.** Explicit save ("Save view") with a local unsaved draft; the server is the source of truth, so the view follows the user across devices. Recovery: unknown, stale or excluded keys are dropped one by one and the valid entries are kept; permitted columns missing from the stored `order` are appended at their default position. Full fallback to the default layout happens only when the payload is unreadable or has an unsupported `version`, never an error screen.
6. **Permission rule (hard).** At read time intersect `order`, `widths` **and** `hidden` with the server-permitted columns of the current contract; a stored view can never add, reveal or reorder a column the contract excludes (`discarded`/`system`/not authorised). The stored payload is untrusted input.
7. **Storage.** Open choice for the human: new key in `AD_Preference` modelled on `NeoFiltersService` (consistent, per user) vs a dedicated table. Payload size bounded like the presets (`BoundedJsonParser`).

## 6. PoC and what stays unproven

A PoC is **not justified**: the uncertainties that decide the choice (permissions, server-driven paging/sort, two renderers, custom tables) are integration questions answered by the code reading in §1; a PoC would prove only column-state mechanics. Still unproven, and therefore explicit **gates for ETP-5835**: (a) performance with large loaded lists given no virtualization; (b) keyboard and touch accessibility of resize and reorder; (c) whether one hook can drive both the HTML-table and flex renderers; (d) verifying TanStack's sizing/ordering/visibility state model against its guide pages (`https://tanstack.com/table/latest/docs/guide/column-sizing` and siblings returned 404 on 2026-10-20 and must be re-checked, since §4 depends on it) and the other unverified vendor claims in §2 if C or D is ever reconsidered.

## 7. Rollout, effort, rollback

- **Phases:** 0 gates (§6) → 1 lists → 2 lines grid → 3 optional custom tables / named views. Each phase behind its own feature flag registered per `docs/feature-flags.md` and `docs/flag-debt.md`.
- **Effort (qualitative):** medium for A/B; very high for C/D. No dates are given.
- **Rollback:** flip the flag off and the grid renders the default layout; stored views stay in the database untouched and harmless. Because the payload is versioned and ignorable, there is no migration to undo.

## 8. Decision record

**Status: PENDING — no human approval recorded.** ETP-5835 stays blocked even though this evaluation is closed.

| Question | Proposed answer | Decision / approver / date |
|---|---|---|
| Surfaces | lists, then lines; custom opt-in | — |
| One view or several | one personal view in v1 | — |
| View content | order, widths, hidden; no filters/sort | — |
| Identity | user + window + entity | — |
| Persistence | explicit save, server-side, drop unknown keys | — |
| Approach | A shaped after B's state model | — |
| Storage | `AD_Preference` key like the presets vs a dedicated table (§5.7) | — |
| Width precedence vs ETP-5833 | stored user width > type default > fallback | — |

Comment text for Jira, to be posted by a human or by the pipeline if it is authorised: "ETP-5834 evaluation ready in `docs/plans/grid-customization-evaluation.md` (PR). Needs a decision on §5 and §8 before ETP-5835 can start."

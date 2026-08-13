# DataTable Cell Renderer Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:subagent-driven-development` only if subagents are available and useful for independent review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve Jira ETP-4022 by refactoring `DataTable.renderCellValue` from type-specific branching into a renderer registry keyed by `col.type`, while preserving the current table output.

**Architecture:** Move the cell-rendering variants into exported, stateless renderer functions in a dedicated module. `DataTable.jsx` remains responsible for component state, hooks, callbacks, and display resolution, then delegates to `CELL_RENDERERS[col.type] ?? CELL_RENDERERS.default`. Custom `col.render` keeps first priority because it is not a `col.type` renderer.

**Tech Stack:** React 18, Vite, Vitest, Testing Library, Tailwind CSS.

**Jira:** ETP-4022 (`[DataTable] Refactor renderCellValue a mapa de renderers por col.type`), under ETP-3504 / ETP-3955.

**Delivery repository:** `schema-forge` at `/Users/sebastianbarrozo/Documents/work/epic/schema-forge`.

**Branch:** `feature/ETP-4022`.

---

## Current State

- `tools/app-shell/src/components/contract-ui/DataTable.jsx` still defines `renderCellValue` with sequential `if` branches for `enum`, `status`, `percent`, `boolean`, `date`, `amount`, and fallback.
- Existing behavior-lock coverage already exists in `tools/app-shell/src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx`.
- The branch currently has no ETP-4022 implementation commits and no upstream configured.
- There is an unrelated untracked file: `.claude/agents/workflow.md`. Do not include it in this task unless the owner explicitly asks.

---

## Acceptance Criteria Mapping

- `renderCellValue` delegates by registry:
  - Add `CELL_RENDERERS`.
  - Use `CELL_RENDERERS[col.type] ?? CELL_RENDERERS.default`.
- Renderer functions are exported and independent of `DataTable`:
  - Create exported renderers in `DataTable.cellRenderers.jsx`.
  - Pass runtime dependencies through a context object, not through component closure.
- Sonar cognitive complexity is reduced:
  - Keep `renderCellValue` to custom-render handling, display resolution, renderer lookup, and one call.
- Unit coverage exists for the required types:
  - Add focused unit tests for `enum`, `status`, `percent`, `boolean`, `date`, `amount`, and `default`.
  - Keep existing behavior-lock component tests as regression coverage.
- Visual behavior is unchanged:
  - Existing `DataTable.renderCellValue.vitest.jsx` must pass unchanged or with import-only adjustments.

---

## File Structure

### New Files

- `tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx`
  - Exports `CELL_RENDERERS`.
  - Exports `renderEnumCell`, `renderStatusCell`, `renderPercentCell`, `renderBooleanCell`, `renderDateCell`, `renderAmountCell`, and `renderDefaultCell`.
  - May also export small support helpers when tests need direct assertions.

- `tools/app-shell/src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx`
  - Direct unit tests for the registry and required renderers.

### Modified Files

- `tools/app-shell/src/components/contract-ui/DataTable.jsx`
  - Import `CELL_RENDERERS`.
  - Remove renderer-specific branch logic from `renderCellValue`.
  - Remove or relocate renderer-only helpers that move to `DataTable.cellRenderers.jsx`.

---

## Implementation Plan

### Task 0: Confirm Scope And Baseline

**Files:**
- Read only: `tools/app-shell/src/components/contract-ui/DataTable.jsx`
- Read only: `tools/app-shell/src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx`
- Read only: `tools/app-shell/package.json`

- [ ] Confirm the repository root:

```bash
git rev-parse --show-toplevel
```

- [ ] Confirm the branch:

```bash
git branch --show-current
```

- [ ] Confirm local changes and keep unrelated files out of the task:

```bash
git status --short
```

- [ ] Run the existing behavior-lock test before changes:

```bash
cd tools/app-shell && npm run test:vitest -- src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx
```

Expected result: PASS before refactor. If it fails, capture the failure before editing because the task is a refactor and needs a clean baseline.

### Task 1: Extract The Renderer Registry

**Files:**
- Create: `tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx`
- Modify: `tools/app-shell/src/components/contract-ui/DataTable.jsx`

- [ ] Create `DataTable.cellRenderers.jsx`.

- [ ] Move the type-specific rendering logic out of `DataTable.jsx` into exported functions:
  - `renderEnumCell(context)`
  - `renderStatusCell(context)`
  - `renderPercentCell(context)`
  - `renderBooleanCell(context)`
  - `renderDateCell(context)`
  - `renderAmountCell(context)`
  - `renderDefaultCell(context)`

- [ ] Export the registry:

```jsx
export const CELL_RENDERERS = {
  enum: renderEnumCell,
  status: renderStatusCell,
  percent: renderPercentCell,
  boolean: renderBooleanCell,
  date: renderDateCell,
  amount: renderAmountCell,
  default: renderDefaultCell,
};
```

- [ ] Preserve the current behavior in each renderer:
  - `enum`: plain label, dot display, and `Tag` variants.
  - `status`: dot display and `StatusTag`.
  - `percent`: palette thresholds for `0`, partial values, `>= 100`, and non-numeric values.
  - `boolean`: inline toggle, colored badges, variant badges, yes/no/dash fallback.
  - `date`: date-only local parsing, full date parsing, optional dot, dash fallback.
  - `amount`: `formatAmount(value, currency$_identifier)` inside `tabular-nums`.
  - `default`: first visible string column pill, long-string truncation, and pass-through display.

- [ ] Keep `col.render` outside the registry and ahead of all type renderers:

```jsx
if (typeof col.render === 'function') {
  return col.render(row, { entity, token, apiBaseUrl });
}
```

Rationale: custom renderers override the type system and are not keyed by `col.type`.

- [ ] Update `DataTable.renderCellValue` to do only:
  - custom-render check;
  - `resolveCellDisplay(...)`;
  - registry lookup;
  - renderer invocation with an explicit context object.

Target shape:

```jsx
const { display, rawValue, toggleKey } = resolveCellDisplay(row, col, optimisticToggles, displayCatalogMaps);
const renderer = CELL_RENDERERS[col.type] ?? CELL_RENDERERS.default;
return renderer({
  row,
  col,
  display,
  rawValue,
  toggleKey,
  visibleColumns,
  tMenu,
  dictionary,
  savingToggles,
  handleInlineToggle,
  locale,
  t,
  ui,
  dateFormatter,
});
```

- [ ] Remove dead helpers from `DataTable.jsx` after extraction. Keep helpers in `DataTable.jsx` only when they are used by non-cell-rendering code.

### Task 2: Add Direct Unit Tests For The Registry

**Files:**
- Create: `tools/app-shell/src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx`
- Keep: `tools/app-shell/src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx`

- [ ] Mock the same UI dependencies used by the behavior-lock test where needed:
  - `@/components/ui/status-tag`
  - `@/components/ui/tag`
  - `@/components/ui/switch`
  - `@/lib/statusBadge.js`
  - `@/lib/formatAmount.js`

- [ ] Add a registry contract test:
  - `CELL_RENDERERS.enum` exists.
  - `CELL_RENDERERS.status` exists.
  - `CELL_RENDERERS.percent` exists.
  - `CELL_RENDERERS.boolean` exists.
  - `CELL_RENDERERS.date` exists.
  - `CELL_RENDERERS.amount` exists.
  - `CELL_RENDERERS.default` exists.

- [ ] Add at least one direct renderer test per accepted type:
  - `enum`: maps `enumLabels` and renders the label.
  - `status`: renders `StatusTag` by default.
  - `percent`: renders a numeric percentage and expected palette class.
  - `boolean`: renders yes/no fallback or switch depending on column config.
  - `date`: renders dash for null and preserves date-only local parsing behavior.
  - `amount`: calls the formatted amount output with currency.
  - `default`: truncates long strings or passes through short values.

- [ ] Keep the existing `DataTable.renderCellValue.vitest.jsx` behavior-lock tests in place. These prove the full component output stayed compatible after the extraction.

### Task 3: Run Verification

**Files:**
- Package: `tools/app-shell`

- [ ] Run the targeted renderer tests:

```bash
cd tools/app-shell && npm run test:vitest -- src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx
```

Expected result: PASS.

- [ ] Run the existing behavior-lock tests:

```bash
cd tools/app-shell && npm run test:vitest -- src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx
```

Expected result: PASS.

- [ ] Run the broader contract-ui/DataTable test subset:

```bash
cd tools/app-shell && npm run test:vitest -- src/components/contract-ui/__tests__/DataTable*.vitest.jsx
```

Expected result: PASS.

- [ ] If time permits, run the full app-shell Vitest suite:

```bash
cd tools/app-shell && npm run test:vitest
```

Expected result: PASS. If it is too slow or unrelated failures exist, record the exact reason and keep the targeted evidence.

- [ ] Check the final diff:

```bash
git diff -- tools/app-shell/src/components/contract-ui/DataTable.jsx tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx tools/app-shell/src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx
```

Expected result: only the renderer extraction and tests are changed.

### Task 4: Delivery Evidence

- [ ] Capture delivery repository evidence:
  - repository root;
  - branch;
  - changed-file scope;
  - relevant untracked files intentionally excluded.

- [ ] Capture test evidence:
  - exact command;
  - PASS/FAIL result;
  - if any suite is skipped, why.

- [ ] Capture functional validation:
  - `renderCellValue` delegates through `CELL_RENDERERS[col.type] ?? CELL_RENDERERS.default`;
  - required renderer functions are exported;
  - required renderer types have direct unit coverage;
  - existing behavior-lock tests still pass.

- [ ] QA status:
  - Mark `Pending validation by QA: Matias Bernal / Emilio Polliotti` unless QA validates the branch before closure.

---

## Commit Plan

Use the Etendo commit convention:

```bash
git add tools/app-shell/src/components/contract-ui/DataTable.jsx \
  tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx \
  tools/app-shell/src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx
git commit -m "Feature ETP-4022: Refactor DataTable cell renderers"
```

Do not include `.claude/agents/workflow.md` unless separately requested.

---

## Definition Of Done

- `DataTable.jsx` no longer contains the type-specific `if` chain inside `renderCellValue`.
- `CELL_RENDERERS` contains `enum`, `status`, `percent`, `boolean`, `date`, `amount`, and `default`.
- Each renderer is exported from `DataTable.cellRenderers.jsx`.
- Direct unit tests cover all required renderer types.
- Existing `DataTable.renderCellValue.vitest.jsx` behavior-lock tests pass.
- Delivery evidence includes repository, branch, changed files, exact test commands, and QA status.

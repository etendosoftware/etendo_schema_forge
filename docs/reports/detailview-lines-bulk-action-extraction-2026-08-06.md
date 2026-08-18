# LinesBulkActionBar extraction

## Scope

Extracted the bulk action bar from `DetailView.jsx` into `LinesBulkActionBar.jsx` as the first layer of the larger lines-section decomposition.

The extracted region is the classic-layout bar gated by `isDetailBulkBarVisible`. It owns no React state; all state transitions remain in `DetailView` and are passed through explicit props.

## Contract

The component receives the selected rows, process configuration, delete state, API context, callbacks, and translation functions it reads. The parent keeps the visibility condition and the public `DetailView` props unchanged.

The delete flow is verbatim: confirmation, `runBatchDelete`, child-row cleanup, selection reset, success/failure toast, and `finally` state reset remain in the same order.

## Measurements

- Parent before: 4563 lines
- Parent after: 4520 lines
- Parent reduction: 43 lines
- Extracted JSX: 69 lines
- New component: 100 lines
- Target heat: 151-line marker region, 95 historical commits, 17 recent commits since 2026-06-10
- No new React state or refs introduced

## Verification

- `DetailView.render.vitest.jsx` + `DetailView.bulkLineDelete.vitest.jsx` + `DetailView.detailProcesses.vitest.jsx`: 385/385 passed
- `DetailView.render.vitest.jsx` baseline before extraction: 369/369 passed
- `make window-leak-budget`: 8 leaks, baseline 8
- `git diff --check`: passed
- No behavioral tests modified

The existing named-helper re-exports for `isBulkDeleteBarVisible` and `getDeleteChildButtonLabel` remain in `DetailView.jsx`; this preserves the Class B import contract for the test suites while the implementation imports them from the helper module directly.

This is layer 1 only. `InlineLineEditor`, `LineDetailSidebar`, and the remaining lines table composition stay in `DetailView` until this boundary is reviewed.

## Heatmap output

The churn CLI also provides a self-contained, line-numbered HTML view. It colors each line using the recent heat of the most specific AST unit containing that line and shows the unit, commit count, heat, and range on hover.

```sh
make ast-churn-heatmap
```

The target writes to a temporary file and prints only its absolute path, so it can be passed directly to a browser or another tool.

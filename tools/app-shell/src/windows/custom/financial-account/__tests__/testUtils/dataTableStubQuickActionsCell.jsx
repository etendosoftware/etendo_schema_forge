/**
 * Shared row-actions-cell fragment for the `DataTable` stubs in this window's own specs.
 *
 * Both `AccountsHeaderTable.vitest.jsx` and `AccountsHeaderTable.handlers.vitest.jsx`
 * `vi.mock('@/components/contract-ui', ...)` with a lightweight stand-in for the real
 * `DataTable` — it isolates `AccountsHeaderTable` from the full component (filters, sorting,
 * inline-add) while still invoking the slot's real `col.render` / `rowQuickActions.render`
 * callbacks. Each stub has its own reasons to exist independently (one also captures
 * `tableProps` and falls back to a plain string cell when there is no `col.render`), but both
 * end their row loop with the identical sticky quick-actions cell — the fragment factored out
 * here, so it is defined once instead of copy-pasted.
 *
 * The `quick-actions-cell-${row.id}` testid is asserted directly by tests in both files —
 * keep it exactly as-is.
 */
export function QuickActionsCell({ row, rowQuickActions }) {
  if (typeof rowQuickActions?.render !== 'function') return null;
  return (
    <span
      data-testid={`quick-actions-cell-${row.id}`}
      onClick={(event) => event.stopPropagation()}
      role="presentation">
      {rowQuickActions.render(row)}
    </span>
  );
}

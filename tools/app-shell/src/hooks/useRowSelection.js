import { useCallback, useEffect, useMemo, useState } from 'react';

/** The ids of `rows` that can actually be selected, in render order. */
function idsOf(rows) {
  return (rows ?? []).map((row) => row?.id).filter(Boolean);
}

/** Drops from `selected` every id that is no longer visible, keeping the same Set when nothing changed. */
function pruneToVisible(selected, visibleIds) {
  if (selected.size === 0) return selected;
  const visible = new Set(visibleIds);
  const next = new Set([...selected].filter((id) => visible.has(id)));
  return next.size === selected.size ? selected : next;
}

/** `selected` with `id` flipped. */
function withToggled(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/**
 * Checkbox-column selection state for a client-side grid: which rows are ticked, the header
 * select-all / indeterminate flags, and the handlers to change them.
 *
 * Selection is scoped to the rows it is given. When a filter or a search hides a selected row the
 * hook prunes it, so a bulk action can never reach a row the user can no longer see — the reason
 * this lives in a hook rather than in each grid.
 *
 * @param rows the currently visible rows, already filtered and sorted; each needs an `id`
 * @returns selection state plus `toggleSelect`, `toggleSelectAll`, `clearSelection` and `keepOnly`
 *   (which narrows the selection to the given ids — pass an empty list to clear it)
 */
export function useRowSelection(rows) {
  const visibleIds = useMemo(() => idsOf(rows), [rows]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useEffect(() => {
    setSelectedIds((prev) => pruneToVisible(prev, visibleIds));
  }, [visibleIds]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => withToggled(prev, id));
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => (prev.size === visibleIds.length ? new Set() : new Set(visibleIds)));
  }, [visibleIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const keepOnly = useCallback((ids) => setSelectedIds(new Set(ids ?? [])), []);

  const selectedRows = useMemo(
    () => (rows ?? []).filter((row) => selectedIds.has(row?.id)),
    [rows, selectedIds],
  );

  const allSelected = visibleIds.length > 0 && selectedIds.size === visibleIds.length;

  return {
    selectedIds,
    selectedRows,
    allSelected,
    someSelected: selectedIds.size > 0 && !allSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    keepOnly,
  };
}

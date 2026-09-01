import { renderHook, act } from '@testing-library/react';
import { useRowSelection } from '../useRowSelection';

/**
 * useRowSelection — the checkbox-column state extracted out of ListModalWindow (ETP-4950).
 *
 * The behaviour worth locking is the pruning: the selection is scoped to the rows the hook is
 * given, so a filter or a search that hides a ticked row must drop it — otherwise a bulk action
 * could reach a record the user can no longer see. The rest (toggle, select-all, the header
 * indeterminate flag) is what the grid renders off.
 */
const ROWS = [
  { id: 'a', documentNo: 'DOC-A' },
  { id: 'b', documentNo: 'DOC-B' },
  { id: 'c', documentNo: 'DOC-C' },
];

/** Renders the hook and counts how many times the component body ran (churn detector). */
function renderSelection(initialRows = ROWS) {
  const renders = { count: 0 };
  const view = renderHook(
    ({ rows }) => {
      renders.count += 1;
      return useRowSelection(rows);
    },
    { initialProps: { rows: initialRows } },
  );
  return { ...view, renders };
}

const ids = (result) => [...result.current.selectedIds].sort();
const rowIds = (result) => result.current.selectedRows.map((r) => r.id);

describe('useRowSelection', () => {
  describe('initial state', () => {
    it('starts with an empty Set and no selected rows', () => {
      const { result } = renderSelection();

      expect(result.current.selectedIds).toBeInstanceOf(Set);
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedRows).toEqual([]);
      expect(result.current.allSelected).toBe(false);
      expect(result.current.someSelected).toBe(false);
    });

    it('exposes every handler as a function', () => {
      const { result } = renderSelection();

      expect(typeof result.current.toggleSelect).toBe('function');
      expect(typeof result.current.toggleSelectAll).toBe('function');
      expect(typeof result.current.clearSelection).toBe('function');
      expect(typeof result.current.keepOnly).toBe('function');
    });
  });

  describe('toggleSelect', () => {
    it('adds an id that was not selected', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelect('b'));

      expect(ids(result)).toEqual(['b']);
      expect(rowIds(result)).toEqual(['b']);
    });

    it('removes an id that was already selected', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelect('b'));
      act(() => result.current.toggleSelect('b'));

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedRows).toEqual([]);
    });

    it('accumulates independent ids', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelect('a'));
      act(() => result.current.toggleSelect('c'));

      expect(ids(result)).toEqual(['a', 'c']);
    });

    it('returns selectedRows in the row order, not the click order', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelect('c'));
      act(() => result.current.toggleSelect('a'));

      expect(rowIds(result)).toEqual(['a', 'c']);
    });
  });

  describe('toggleSelectAll', () => {
    it('selects every visible row', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelectAll());

      expect(ids(result)).toEqual(['a', 'b', 'c']);
      expect(result.current.allSelected).toBe(true);
      expect(result.current.someSelected).toBe(false);
    });

    it('deselects everything when all rows were already selected', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelectAll());
      act(() => result.current.toggleSelectAll());

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.allSelected).toBe(false);
    });

    it('completes a partial selection instead of clearing it', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelect('a'));
      act(() => result.current.toggleSelectAll());

      expect(ids(result)).toEqual(['a', 'b', 'c']);
      expect(result.current.allSelected).toBe(true);
    });

    it('is a no-op on an empty row set', () => {
      const { result } = renderSelection([]);

      act(() => result.current.toggleSelectAll());

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.allSelected).toBe(false);
    });
  });

  describe('allSelected / someSelected flags', () => {
    it('reports someSelected on a partial selection', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelect('a'));

      expect(result.current.allSelected).toBe(false);
      expect(result.current.someSelected).toBe(true);
    });

    it('never reports both flags at once', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelectAll());

      expect(result.current.allSelected).toBe(true);
      expect(result.current.someSelected).toBe(false);
    });

    it('is false for both flags with no rows at all — an empty grid is not "all selected"', () => {
      const { result } = renderSelection([]);

      expect(result.current.allSelected).toBe(false);
      expect(result.current.someSelected).toBe(false);
    });

    it('flips allSelected on when the last remaining row is ticked', () => {
      const { result } = renderSelection([{ id: 'only' }]);

      act(() => result.current.toggleSelect('only'));

      expect(result.current.allSelected).toBe(true);
      expect(result.current.someSelected).toBe(false);
    });
  });

  describe('pruning to the visible rows', () => {
    it('drops a selected row that a filter removed', () => {
      const { result, rerender } = renderSelection();

      act(() => result.current.toggleSelectAll());
      expect(ids(result)).toEqual(['a', 'b', 'c']);

      rerender({ rows: [ROWS[0], ROWS[2]] });

      expect(ids(result)).toEqual(['a', 'c']);
      expect(rowIds(result)).toEqual(['a', 'c']);
      expect(result.current.allSelected).toBe(true);
    });

    it('empties the selection when every row disappears', () => {
      const { result, rerender } = renderSelection();

      act(() => result.current.toggleSelectAll());
      rerender({ rows: [] });

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.allSelected).toBe(false);
      expect(result.current.someSelected).toBe(false);
    });

    it('does not re-select a pruned row when the filter is cleared again', () => {
      const { result, rerender } = renderSelection();

      act(() => result.current.toggleSelectAll());
      rerender({ rows: [ROWS[0]] });
      expect(ids(result)).toEqual(['a']);

      rerender({ rows: ROWS });

      expect(ids(result)).toEqual(['a']);
      expect(result.current.allSelected).toBe(false);
      expect(result.current.someSelected).toBe(true);
    });

    it('leaves an empty selection untouched when the rows change', () => {
      const { result, rerender } = renderSelection();
      const before = result.current.selectedIds;

      rerender({ rows: [ROWS[1]] });

      expect(result.current.selectedIds).toBe(before);
    });

    it('keeps the same Set instance when a re-render brings an equivalent row list', () => {
      const { result, rerender } = renderSelection();

      act(() => result.current.toggleSelect('b'));
      const before = result.current.selectedIds;

      // New array identity, same ids — the shape a parent re-render produces.
      rerender({ rows: ROWS.map((row) => ({ ...row })) });

      expect(result.current.selectedIds).toBe(before);
      expect(ids(result)).toEqual(['b']);
    });

    it('does not cause an extra render pass when nothing was pruned', () => {
      const { result, rerender, renders } = renderSelection();

      act(() => result.current.toggleSelect('b'));
      const baseline = renders.count;

      rerender({ rows: ROWS.map((row) => ({ ...row })) });

      // Exactly the rerender itself: had the effect produced a new Set, React would
      // have re-rendered a second time.
      expect(renders.count).toBe(baseline + 1);
    });

    it('re-renders once when a prune actually changes the selection', () => {
      const { result, rerender, renders } = renderSelection();

      act(() => result.current.toggleSelectAll());
      const baseline = renders.count;

      rerender({ rows: [ROWS[0]] });

      expect(renders.count).toBe(baseline + 2);
      expect(ids(result)).toEqual(['a']);
    });
  });

  describe('clearSelection', () => {
    it('empties a full selection', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelectAll());
      act(() => result.current.clearSelection());

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedRows).toEqual([]);
      expect(result.current.allSelected).toBe(false);
    });

    it('is safe to call on an already empty selection', () => {
      const { result } = renderSelection();

      act(() => result.current.clearSelection());

      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('keepOnly', () => {
    it('narrows the selection to exactly the given ids', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelectAll());
      act(() => result.current.keepOnly(['b']));

      expect(ids(result)).toEqual(['b']);
      expect(rowIds(result)).toEqual(['b']);
      expect(result.current.someSelected).toBe(true);
    });

    it('clears the selection when given an empty list', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelectAll());
      act(() => result.current.keepOnly([]));

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.allSelected).toBe(false);
    });

    it('clears the selection when given nothing at all', () => {
      const { result } = renderSelection();

      act(() => result.current.toggleSelectAll());
      act(() => result.current.keepOnly(undefined));

      expect(result.current.selectedIds.size).toBe(0);
    });

    it('de-duplicates the ids it is handed', () => {
      const { result } = renderSelection();

      act(() => result.current.keepOnly(['a', 'a', 'b']));

      expect(result.current.selectedIds.size).toBe(2);
      expect(ids(result)).toEqual(['a', 'b']);
    });
  });

  describe('rows without a usable id', () => {
    it('ignores them when selecting all', () => {
      const rows = [{ id: 'a' }, { documentNo: 'no-id' }, { id: '' }, { id: null }];
      const { result } = renderSelection(rows);

      act(() => result.current.toggleSelectAll());

      expect(ids(result)).toEqual(['a']);
      expect(rowIds(result)).toEqual(['a']);
    });

    it('does not count them towards allSelected', () => {
      const rows = [{ id: 'a' }, { documentNo: 'no-id' }];
      const { result } = renderSelection(rows);

      act(() => result.current.toggleSelect('a'));

      expect(result.current.allSelected).toBe(true);
      expect(result.current.someSelected).toBe(false);
    });

    it('treats a row list made only of id-less rows as an empty grid', () => {
      const { result } = renderSelection([{ documentNo: 'x' }, { documentNo: 'y' }]);

      act(() => result.current.toggleSelectAll());

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.allSelected).toBe(false);
    });
  });

  describe('missing rows', () => {
    it('survives a null row list', () => {
      const { result } = renderSelection(null);

      expect(result.current.selectedRows).toEqual([]);
      expect(result.current.allSelected).toBe(false);

      act(() => result.current.toggleSelectAll());

      expect(result.current.selectedIds.size).toBe(0);
    });

    it('survives an undefined row list', () => {
      const { result } = renderSelection(undefined);

      expect(result.current.selectedRows).toEqual([]);
      expect(result.current.allSelected).toBe(false);
      expect(result.current.someSelected).toBe(false);
    });

    it('recovers when the rows arrive after an initial null', () => {
      const { result, rerender } = renderSelection(null);

      rerender({ rows: ROWS });
      act(() => result.current.toggleSelectAll());

      expect(ids(result)).toEqual(['a', 'b', 'c']);
      expect(result.current.allSelected).toBe(true);
    });

    it('prunes the whole selection when the rows go back to null', () => {
      const { result, rerender } = renderSelection();

      act(() => result.current.toggleSelectAll());
      rerender({ rows: null });

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedRows).toEqual([]);
    });
  });

  describe('handler identity', () => {
    it('keeps the id-independent handlers stable across re-renders', () => {
      const { result, rerender } = renderSelection();
      const { toggleSelect, clearSelection, keepOnly } = result.current;

      rerender({ rows: [ROWS[0]] });

      expect(result.current.toggleSelect).toBe(toggleSelect);
      expect(result.current.clearSelection).toBe(clearSelection);
      expect(result.current.keepOnly).toBe(keepOnly);
    });
  });
});

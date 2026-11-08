import { Children, cloneElement } from 'react';
import { GripVertical } from 'lucide-react';

export function gridHeaderProps(col, gridView) {
  const id = col.gridViewId;
  if (!gridView?.active || !id) return {};
  const canMove = gridView.reorderable(id);
  return {
    draggable: canMove,
    onDragStart: canMove ? (event) => {
      event.dataTransfer?.setData('text/plain', id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    } : undefined,
    onDragOver: canMove ? (event) => event.preventDefault() : undefined,
    onDrop: canMove ? (event) => {
      event.preventDefault();
      const sourceId = event.dataTransfer?.getData('text/plain');
      if (sourceId && gridView.reorderable(sourceId)) gridView.moveColumn(sourceId, id);
    } : undefined,
  };
}

export function gridReorderHandle(col, gridView, label, ui) {
  const id = col.gridViewId;
  if (!gridView?.active || !id || !gridView.reorderable(id)) return null;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ui('moveGridColumn', { column: label })}
      title={ui('moveGridColumnHint')}
      className="ml-1 inline-flex cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.altKey && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          event.stopPropagation();
          gridView.moveByKeyboard(id, event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}>
      <GripVertical aria-hidden="true" className="h-3 w-3" data-testid="GripVertical__4a1082" />
    </span>
  );
}

export function gridResizeHandle(col, gridView, label, ui) {
  const id = col.gridViewId;
  if (!gridView?.active || !id || !gridView.isResizable(id)) return null;
  const width = gridView.columnSizing[id] ?? col.gridDefaultWidthPx ?? 120;
  const bounds = gridView.widthBounds(id);
  // Cancel the native drag default: the header is draggable for reordering.
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ui('resizeGridColumn', { column: label })}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className="absolute right-0 top-0 z-10 flex h-full w-4 cursor-col-resize touch-none select-none items-center justify-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      onMouseDown={(event) => {
        event.preventDefault();
        gridView.resizeHandler(id)(event);
      }}
      onTouchStart={gridView.resizeHandler(id)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          gridView.resizeBy(id, event.key === 'ArrowLeft' ? -10 : 10);
        }
      }}>
      <span aria-hidden="true" className="h-6 w-0.5 rounded-full bg-border transition-colors group-hover:bg-muted-foreground group-focus-visible:bg-primary" />
    </div>
  );
}

/**
 * Re-projects the cells of one table row (or the header row) for a personal grid view.
 * `fragment` holds one cell per source column; `sourceIndex` on each grid column points at
 * its cell. The `leading` / `trailing` structural cells (selection, actions) stay outside the
 * personal view, keeping their handlers and React keys when data cells move.
 */
export function renderGridViewCells(fragment, { gridView, gridColumns, ui, leading = 0, trailing = 0 }) {
  const cells = Children.toArray(fragment.props.children);
  const visibleColumns = gridView.active ? gridView.columns : gridColumns;
  if (cells.length === 1 && cells[0].props.colSpan) {
    return cloneElement(cells[0], { colSpan: visibleColumns.length + leading + trailing });
  }
  const dataCells = visibleColumns.map((column) => {
    const cell = cells[column.sourceIndex];
    if (!gridView.active) return cloneElement(cell, { key: column.key });
    const header = cell.type === 'th';
    const width = column.gridUserWidthPx;
    return cloneElement(cell, {
      key: column.key,
      'data-grid-column': column.key,
      style: { ...cell.props.style, ...(width != null ? { width, maxWidth: width, overflow: 'hidden' } : {}), ...(header ? { position: 'relative' } : {}) },
      ...(header ? gridHeaderProps(column, gridView) : {}),
    }, header ? <>{cell.props.children}{gridReorderHandle(column, gridView, column.label, ui)}{gridResizeHandle(column, gridView, column.label, ui)}</> : cell.props.children);
  });
  return [...cells.slice(0, leading), ...dataCells, ...(trailing ? cells.slice(-trailing) : [])];
}

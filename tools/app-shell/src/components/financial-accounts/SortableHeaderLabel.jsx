/* eslint-disable react/prop-types */

/**
 * The clickable label inside a hand-rolled grid's header cell.
 *
 * Deliberately renders only the label + arrow, never the cell itself: of the three
 * financial-account detail tabs that use it, Movimientos is a real `<table>` with
 * `<TableHead>` cells while Extractos and Reconciliaciones are CSS-grid `div role="table"`
 * layouts with `<span>` cells. A component that owned the cell could not serve both, so each
 * table keeps its own header cell and drops this inside it.
 *
 * Visual contract copied from `DataTable.renderColumnHeaderCell` so a sorted column reads the
 * same across the app: ▲ ascending, ▼ descending, nothing at all when the column is not the
 * active one. A non-sortable column renders as plain text with no button, which is also what
 * keeps it out of the tab order.
 *
 * @param {string} label already-translated header text
 * @param {string} sortKey this column's sort key
 * @param {string|null} activeKey the currently sorted key
 * @param {'asc'|'desc'} direction the active direction
 * @param {(key: string) => void} [onSort] omit to render a plain, non-interactive label
 * @param {string} [align] 'right' to mirror the arrow onto the left, matching DataTable's
 *   treatment of numeric columns
 */
export function SortableHeaderLabel({ label, sortKey, activeKey, direction, onSort, align }) {
  const isActive = activeKey === sortKey;
  const arrow = isActive ? (
    <span aria-hidden="true" className="pointer-events-none text-primary/70">
      {direction === 'asc' ? '▲' : '▼'}
    </span>
  ) : null;

  if (!onSort) return <span>{label}</span>;

  return (
    <button
      type="button"
      data-testid={`column-header-sort-${sortKey}`}
      // No `aria-sort` here on purpose: it belongs on the header CELL (th / role=columnheader),
      // which each table owns, not on the button inside it. DataTable's own sort button does
      // the same. The arrow is aria-hidden, so the state is conveyed visually only — a known
      // gap shared with DataTable rather than a new one introduced here.
      onClick={() => onSort(sortKey)}
      className={[
        'inline-flex cursor-pointer select-none items-center gap-0.5 border-0 bg-transparent p-0',
        'font-semibold text-inherit transition-colors',
        align === 'right' ? 'flex-row-reverse' : '',
      ].filter(Boolean).join(' ')}
    >
      {arrow}
      <span>{label}</span>
    </button>
  );
}

/**
 * N independently sortable segments in one header cell, joined by the same ` & ` separator
 * `DataTable.renderMultiFieldHeaderCell` uses — so a two-value cell reads the same whether the
 * grid is generic or hand-rolled.
 *
 * This is the hand-rolled counterpart of the `multiField` decorator. That path is not available
 * here: `multiField` is a contract decorator consumed by `DataTable`, and these grids are not
 * DataTable. The case that needs it is the Movimientos "Tipo" cell, which shows the transaction
 * type AND the posting status, so a single header could only ever sort by one of them.
 *
 * @param {Array<{key: string, label: string}>} parts the segments, in display order
 * @param {string|null} activeKey the currently sorted key
 * @param {'asc'|'desc'} direction the active direction
 * @param {(key: string) => void} [onSort]
 */
export function SortableHeaderSegments({ parts, activeKey, direction, onSort }) {
  return (
    <span className="inline-flex items-center">
      {parts.map((part, idx) => (
        <span key={part.key} className="inline-flex items-center">
          {idx > 0 && (
            <span className="mx-0.5 select-none font-normal text-[hsl(var(--foreground))]/40">&amp;</span>
          )}
          <SortableHeaderLabel
            label={part.label}
            sortKey={part.key}
            activeKey={activeKey}
            direction={direction}
            onSort={onSort}
            data-testid="SortableHeaderLabel__seg" />
        </span>
      ))}
    </span>
  );
}

import { Children, cloneElement, createContext, isValidElement, useContext, useMemo } from 'react';
import { useUI } from '@/i18n';
import { useFeatureFlag, GRID_COLUMN_VIEWS } from '@/lib/flags';
import { gridViewColumnId, useGridView } from '@/hooks/useGridView.js';
import { GridViewControls } from '@/components/contract-ui/GridViewControls.jsx';
import { gridHeaderProps, gridReorderHandle, gridResizeHandle } from '@/components/contract-ui/GridColumnHeaderControls.jsx';
import { TableRow } from '@/components/ui/table';

const GridContext = createContext(null);
const STRUCTURAL_LABEL_KEYS = {
  expand: 'financeAccountMovementsMoreInfo',
  select: 'selectAll',
  selection: 'selectAll',
  actions: 'financeAccountMovementsRowActions',
};

/** Project each movable segment independently. Stored preferences never move or hide anchors. */
export function projectFinancialColumns(columns, gridView) {
  if (!gridView.active) return columns;
  const rank = new Map(gridView.columns.map((column, index) => [gridViewColumnId(column), index]));
  const result = [];
  let segment = [];
  const flush = () => {
    result.push(...segment.filter((column) => gridView.columnVisibility[gridViewColumnId(column)] !== false)
      .sort((a, b) => (rank.get(gridViewColumnId(a)) ?? columns.indexOf(a)) - (rank.get(gridViewColumnId(b)) ?? columns.indexOf(b))));
    segment = [];
  };
  for (const column of columns) {
    if (column.gridConfigurable === false || column.gridReorderable === false) {
      flush();
      result.push(column);
    } else segment.push(column);
  }
  flush();
  return result.length ? result : [columns[0]].filter(Boolean);
}

function resolveColumnLabel(column, ui) {
  if (column.labelKey) return ui(column.labelKey);
  if (STRUCTURAL_LABEL_KEYS[column.key]) return ui(STRUCTURAL_LABEL_KEYS[column.key]);
  return column.label ?? column.key;
}

/** Only marked rows consume this context; nested dimensions/forms retain their own layout. */
export function FinancialGridView({ spec, entity, columns, data, children }) {
  const ui = useUI();
  const enabled = useFeatureFlag(GRID_COLUMN_VIEWS);
  const gridColumns = useMemo(() => columns.map((column) => ({
    ...column,
    gridDefaultWidthPx: column.gridDefaultWidthPx
      ?? (/^\d+(?:\.\d+)?px$/.test(column.gridTrack ?? '') ? Number.parseFloat(column.gridTrack) : 120),
    label: resolveColumnLabel(column, ui),
    ...(column.gridConfigurable === false ? { gridReorderable: false } : {}),
  })), [columns, ui]);
  const gridView = useGridView({ spec, entity, columns: gridColumns, data, enabled });
  const visible = useMemo(() => projectFinancialColumns(gridColumns, gridView), [gridColumns, gridView]);
  // The controls resolve labels from these already translated local descriptors.
  const translate = (value) => gridColumns.find((column) => (column.column ?? column.label ?? column.key) === value)?.label ?? value;
  const contextValue = useMemo(() => ({ columns: gridColumns, visible, gridView, ui }), [gridColumns, visible, gridView, ui]);
  return (
    <GridContext.Provider value={contextValue}>
      {enabled && <GridViewControls
        gridView={gridView}
        gridColumns={gridColumns}
        ui={ui}
        t={translate}
        data-testid="GridViewControls__fcca93" />}
      {children}
    </GridContext.Provider>
  );
}

export function FinancialGridRow({ as: Component = 'div', header = false, children, style, ...props }) {
  const context = useContext(GridContext);
  // The generated id is a fallback: a caller that passes its own data-testid (the row
  // identity the tests and the DOM rely on) must win. The default therefore sits BEFORE
  // the spread, and the caller's props are spread after it.
  if (!context?.gridView.active) return <Component data-testid="Component__fcca93" {...props} style={style}>{children}</Component>;
  const { columns, visible, gridView, ui } = context;
  const allChildren = Children.toArray(children);
  const overlays = allChildren.filter((cell) => cell.props?.['data-financial-grid-overlay']);
  const cells = allChildren.filter((cell) => !cell.props?.['data-financial-grid-overlay']);
  // Empty states and expanded panels are full-width content, never data columns.
  if (cells.length === 1 && cells[0]?.props?.colSpan) {
    return <Component data-testid="Component__fcca93" {...props} style={style}>{cloneElement(cells[0], { colSpan: visible.length })}</Component>;
  }
  // Do not guess a positional mapping for a grouped/non-data row.
  if (cells.length !== columns.length) return <Component data-testid="Component__fcca93" {...props} style={style}>{children}</Component>;
  const tracks = visible.map((column) => {
    const width = gridView.columnSizing[gridViewColumnId(column)];
    return column.gridConfigurable !== false && width != null ? `${width}px` : column.gridTrack ?? 'minmax(100px,1fr)';
  }).join(' ');
  const rowStyle = Component === 'div' ? { ...style, gridTemplateColumns: tracks } : style;
  return (
    <Component data-testid="Component__fcca93" {...props} style={rowStyle}>
      {visible.map((column) => {
        const index = columns.findIndex((source) => source.key === column.key);
        const cell = cells[index];
        const id = gridViewColumnId(column);
        const chromeColumn = { ...column, gridViewId: id };
        const width = gridView.columnSizing[id];
        const cellStyle = { ...(cell.props?.style ?? {}), ...(width != null && column.gridConfigurable !== false ? { width, maxWidth: width } : {}) };
        if (!header || !isValidElement(cell)) return isValidElement(cell) ? cloneElement(cell, { key: column.key, ...(cell.type === Symbol.for('react.fragment') ? {} : { style: cellStyle }) }) : cell;
        return cloneElement(cell, {
          key: column.key,
          ...gridHeaderProps(chromeColumn, gridView),
          style: { ...cellStyle, position: 'relative' },
          children: <>{cell.props.children}{gridReorderHandle(chromeColumn, gridView, column.label, ui)}{gridResizeHandle(chromeColumn, gridView, column.label, ui)}</>,
        });
      })}
      {overlays}
    </Component>
  );
}

export function FinancialTableRow(props) {
  // Same fallback rule as FinancialGridRow: the caller's own data-testid wins over the
  // generated default, so the default attribute sits before the spread.
  return <FinancialGridRow data-testid="FinancialGridRow__fcca93" {...props} as={TableRow} />;
}

import { createContext, forwardRef, useContext, useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';
import { Tag } from '@/components/ui/tag';
import { useUI, useLabel } from '@/i18n';
import { useGridView } from '@/hooks/useGridView.js';
import { GridViewControls } from '@/components/contract-ui/GridViewControls.jsx';
import { useFeatureFlag, GRID_COLUMN_VIEWS } from '@/lib/flags';
import { useYearCloseStatus } from './useYearCloseStatus.js';

// `col.render` (checked first, before any type-based cell renderer — see
// DataTable.jsx's renderCellValue) receives `(row, { entity, token, apiBaseUrl })`, where
// `apiBaseUrl` is the SAME base the whole year list uses (`.../fiscal-calendar`), not the
// `end-year-close` spec this status check needs. Rewritten here, at render time, the same way
// index.jsx's `AccountingPanelForCalendar`/`YearCloseStatusBadgeForCalendar` rewrite it for
// their own components — no separate wrapper needed since this is a one-off derivation inside
// a single column, not a whole component's worth of API calls.
function rootApiBase(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]*$/, '');
}

// Reuses `useYearCloseStatus` — the single, canonical "is this year closed" derivation shared
// with YearCloseStatusBadge (the detail header's status pill) and index.jsx's menuActions
// override (Cerrar Año/Deshacer Cierre de Año visibility) — never a second, different
// derivation — so none of the three can ever disagree.
//
// Fired once per visible row. A true bulk "which of these year IDs are closed" check would
// need a new backend (com.etendoerp.go) endpoint — out of scope for this frontend-only fix.
// Each row's own effect fires independently, so the whole set resolves in parallel (never
// sequentially/one-at-a-time) as soon as the list renders. A client's fiscal-years list is
// inherently small and bounded (one row per calendar year, never paginated in practice), so
// N small parallel requests is an acceptable tradeoff against the added complexity of a
// dedicated bulk endpoint.
function YearCloseStatusCell({ yearId, apiBaseUrl }) {
  const ui = useUI();
  // `undefined` = loading, `null` = the request failed — both render nothing (an auxiliary
  // column cell showing a wrong/misleading state is worse than briefly showing nothing).
  const closed = useYearCloseStatus(yearId, apiBaseUrl);

  if (closed === undefined || closed === null) return null;

  // Reuses the exact same i18n keys as YearCloseStatusBadge (the detail header's pill) —
  // "yearClosedStatus"/"yearNotClosedStatus" — so the two never drift into different wording.
  return closed ? (
    <Tag variant="green" label={ui('yearClosedStatus')} data-testid="Tag__413aee" />
  ) : (
    <Tag
      variant="neutral"
      label={ui('yearNotClosedStatus')}
      data-testid="Tag__413aee" />
  );
}

// Same two AD-backed columns the generated YearTable declares, plus a synthetic
// `yearCloseStatus` column with no backing AD field — `col.render` bypasses normal
// field/type-based cell resolution entirely, so a missing/absent field on the row never
// matters. `labels` is the HIGHEST-priority source in resolveColumnLabel.js (checked before
// even the i18n dictionary), so no locale JSON changes are needed for the header text either.
const columns = [
  { key: 'fiscalYear', column: 'Year', type: 'string', label: 'Fiscal Year', required: true },
  { key: 'description', column: 'Description', type: 'string', label: 'Description' },
  {
    key: 'yearCloseStatus',
    column: 'YearCloseStatus',
    type: 'string',
    label: 'Estado',
    labels: { es_ES: 'Estado', es_AR: 'Estado', en_US: 'Status' },
    sortable: false,
    render: (row, { apiBaseUrl }) => (
      <YearCloseStatusCell
        yearId={row.id}
        apiBaseUrl={`${rootApiBase(apiBaseUrl)}/end-year-close`}
        data-testid="YearCloseStatusCell__413aee" />
    ),
  },
];

const filters = [];

// ETP-5577: the fiscal year the First Steps card calls current (`useCalendarReview().year`, the
// year containing today), provided by CalendarWindow from the review state it already fetched.
export const CurrentFiscalYearContext = createContext(null);

// Marks the Year cell of that year so the "Ver guía" tour targets it instead of the first row,
// which is the newest year and may have no periods. A block span inside the cell, not a row
// attribute: the tour listens for clicks on it, so the row's selection checkbox cannot advance
// the step. When the current year is unknown or not in the list, the first row is marked.
function withCurrentYearMarker(currentYear, rows) {
  const list = rows ?? [];
  const marked = (list.find((r) => currentYear != null && String(r.fiscalYear) === String(currentYear))
    ?? list[0])?.id;
  return columns.map((col) => (col.key !== 'fiscalYear' ? col : {
    ...col,
    render: (row) => (
      <span className="block" {...(marked != null && row.id === marked ? { 'data-current-fiscal-year': '' } : {})}>
        {row.fiscalYear}
      </span>
    ),
  }));
}

const YearTableWithCloseStatus = forwardRef(function YearTableWithCloseStatus(props, ref) {
  const currentYear = useContext(CurrentFiscalYearContext);
  const ui = useUI();
  const t = useLabel(props.labelOverrides);
  const gridColumnViews = useFeatureFlag(GRID_COLUMN_VIEWS);
  const tableColumns = useMemo(
    () => withCurrentYearMarker(currentYear, props.data), [currentYear, props.data]);
  // Calendar composes the fiscal-calendar entity outside WindowLoader's standard list
  // rollout. An eligible ListView host retains ownership of its controller and toolbar.
  const inheritedGridView = props.gridView?.availableKeys?.length > 0;
  const gridColumns = props.columns ?? tableColumns;
  const gridView = useGridView({
    spec: 'fiscal-calendar',
    entity: 'year',
    columns: gridColumns,
    data: props.data ?? [],
    enabled: gridColumnViews && !inheritedGridView,
    apiBaseUrl: props.apiBaseUrl,
  });
  return (
    <>
      {gridView.enabled && <GridViewControls
        gridView={gridView}
        gridColumns={gridColumns}
        ui={ui}
        t={t}
        data-testid="GridViewControls__413aee" />}
      <DataTable
        ref={ref}
        columns={tableColumns}
        filters={filters}
        {...props}
        gridView={inheritedGridView ? props.gridView : gridView}
        data-testid="DataTable__413aee" />
    </>
  );
});

export default YearTableWithCloseStatus;

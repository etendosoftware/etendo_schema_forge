import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useEntity } from '@/hooks/useEntity';
import { useRowDelete } from '@/hooks/useRowDelete';
import { useBulkRowDelete } from '@/hooks/useBulkRowDelete';
import { useMenuLabel, useLabel, useUI, useLocaleSwitch } from '@/i18n';
import { ChevronDown, Plus, Link2, Printer, LayoutGrid, RefreshCw, Copy, Upload, Trash2 } from 'lucide-react';
import { useRegisterWindowContext } from '@/components/CurrentWindowContext';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import ReportDrawer from './ReportDrawer.jsx';
import { printDocuments } from './DocumentPrintDrawer.jsx';
import SendDocumentModal from './SendDocumentModal.jsx';
import { ListFilterBar } from './ListFilterBar.jsx';
import { ListSortPopover } from './ListSortPopover.jsx';
import { ListProgressBar } from './ListProgressBar.jsx';
import SelectionToolbar from './SelectionToolbar.jsx';
import { ImportDialog } from '@etendosoftware/app-shell-core/components/import/ImportDialog.jsx';
import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { ScrollPane } from '@etendosoftware/app-shell-core/components/ui/scroll-pane.jsx';
import { useBatch } from '../copilot/ocr/ingest/useBatch.js';
import { buildAdvancedFilterCriteria } from '@/lib/gridQuery';
import { useWindowFilterPresets } from '@/hooks/useWindowFilterPresets';
import { trackSearchPerformed, trackWindowOpened } from '@/lib/productUsageTelemetry.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';

function resolveQuickFilterIndicesFromPreset(quickFilters, preset, setActiveFilterIndices) {
  if (quickFilters?.length) {
    const labels = Array.isArray(preset.quickFilterLabels) ? preset.quickFilterLabels : [];
    const next = new Set();
    for (const label of labels) {
      const idx = quickFilters.findIndex((f) => f?.label === label);
      if (idx >= 0) next.add(idx);
    }
    setActiveFilterIndices(next);
  } else {
    setActiveFilterIndices(new Set());
  }
}

export function splitFilterParts(parts) {
  const allCriteria = [];
  const passthrough = new URLSearchParams();
  for (const filterStr of parts) {
    const params = new URLSearchParams(filterStr);
    for (const [k, v] of params.entries()) {
      if (k === 'criteria') {
        try {
          const parsed = JSON.parse(v);
          allCriteria.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        } catch {
        }
      } else {
        passthrough.append(k, v);
      }
    }
  }
  return { allCriteria, passthrough };
}

/**
 * Pre-expand `multiField` columns into ordinary pseudo-columns for the
 * advanced-filter path, so each constituent part shows up as its own filterable
 * field with zero core changes. The `multiField` parent itself has no queryable
 * key and is dropped. `column` is intentionally omitted on each pseudo-column:
 * AdvancedFilterBuilder resolves its field label as
 * `labelOf(col.column) ?? col.label ?? col.key`, so dropping `column` makes it
 * fall through to our locale-resolved header wording (e.g. "Identificador"/
 * "Nombre") instead of the AD column label ("Search Key").
 */
function expandMultiFieldColumns(columns, locale) {
  const out = [];
  for (const col of columns) {
    if (col?.type === 'multiField' && Array.isArray(col.parts)) {
      for (const part of col.parts) {
        if (part.filterable === false) continue;
        out.push({
          key: part.key,
          type: part.type,
          label: part.labels?.[locale] ?? part.labels?.en_US ?? part.label ?? part.key,
          required: part.required,
        });
      }
      continue;
    }
    // Plain columns that carry a per-locale `labels` map but no singular `label`
    // (e.g. custom cells) would otherwise fall through to `col.key` in the
    // advanced-filter field picker — a lowercase, unlocalized identifier. Resolve
    // the localized label here so the builder shows "Venta"/"Compra"/"Stock".
    if (col?.labels && !col.label && !col.column) {
      out.push({ ...col, label: col.labels[locale] ?? col.labels.en_US ?? col.key });
      continue;
    }
    out.push(col);
  }
  return out;
}

function ListFilterBarSection(props) {
  return (
    <>
      {!(props.hideFilters ?? props.hideListFilters) && (
        <ListFilterBar
          entity={props.entity}
          apiBaseUrl={props.apiBaseUrl}
          columns={props.columns}
          columnFilters={props.columnFilters}
          onFilterChange={props.onFilterChange}
          advancedFilter={props.advancedFilter}
          onAdvancedFilterChange={props.onAdvancedFilterChange}
          rows={props.hook.items}
          dateFilterKey={props.dateFilterKey}
          presets={props.windowName ? props.filterPresets : null}
          onApplyPreset={props.windowName ? props.applyPreset : null}
          onSavePreset={props.windowName ? props.saveCurrentAsPreset : null}
          onDeletePreset={props.windowName ? props.deletePreset : null}
          labelOverrides={props.labelOverrides}
          hideStatusFilter={props.hideStatusFilter}
          data-testid="ListFilterBar__620cbc" />
      )}
    </>
  );
}

/**
 * The list's table region, in either of its two wrappers.
 *
 * Default: a ScrollPane that owns the scroll and drives infinite loading, showing
 * skeletons on the initial fetch and the gallery renderer when that view mode is on.
 *
 * `ownScroll`: skip the ScrollPane entirely and hand the table a bounded flex box, for
 * a custom headerTable that scrolls one of its own regions (e.g. financial-account pins
 * its toolbar and KPI panel and scrolls only the rows). Wrapping such a table in the
 * ScrollPane gives it a SECOND, outer scroll that drags the pinned parts away, plus
 * ScrollPane's always-visible shadow scrollbar. Infinite scroll (`onReachBottom`)
 * belongs to the ScrollPane, so it is inert in this mode — the table owns paging if it
 * needs it. This branch also forwards `loading`, since there is no skeleton wrapper
 * around it to stand in for the initial fetch.
 *
 * Extracted from ListView for two reasons: the ~28 `Table` props were written out once
 * per branch (Sonar flagged the duplicated block), and the branches counted towards
 * ListView's cognitive complexity. `tableProps` is built by the caller, where the
 * handlers are in scope, and lands here as a single object.
 */
function ListTableRegion({
  ownScroll, Table, tableProps, hook, ui, tablePaddingX, tablePaddingBottom,
  onReachBottom, viewMode, galleryRenderer, navigate, windowName, token, apiBaseUrl,
}) {
  if (ownScroll) {
    // Only the TRUE initial fetch (no items yet) hands `loading` to the Table, which renders
    // it as a full skeleton (DataTable: `if (loading) return <TableSkeleton />`, unconditional
    // on row count). A later refresh — the button next to sort, or any reload() after an
    // edit/CRUD action — already has rows to show, so it stays smooth via the opacity dim
    // below instead, matching the non-ownScroll branch just below (which never even forwards
    // `loading` once `hook.items.length > 0`).
    const showInitialSkeleton = hook.loading && hook.items.length === 0;
    return (
      <div className={`flex min-h-0 flex-1 flex-col ${tablePaddingX}`} data-testid="list-table-region">
        <div
          className={tableOpacityClass(hook)}
          style={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column' }}>
          <Table {...tableProps} loading={showInitialSkeleton} data-testid="Table__620cbc" />
        </div>
      </div>
    );
  }

  return (
    <ScrollPane
      onReachBottom={onReachBottom}
      className={`${tablePaddingX} ${tablePaddingBottom}`}
      data-testid="ScrollPane__620cbc">
      {hook.loading && hook.items.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" data-testid="Skeleton__620cbc" />
          <Skeleton className="h-8 w-full" data-testid="Skeleton__620cbc" />
          <Skeleton className="h-8 w-full" data-testid="Skeleton__620cbc" />
          <Skeleton className="h-8 w-full" data-testid="Skeleton__620cbc" />
        </div>
      ) : (
        <div className={tableOpacityClass(hook)}>
          {viewMode === 'gallery' && galleryRenderer
            ? galleryRenderer({ data: hook.items, onNavigate: (id) => navigate(`/${windowName}/${id}`), token, apiBaseUrl })
            : <Table {...tableProps} data-testid="Table__620cbc" />
          }
          {hook.loadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">{ui('loadingMore')}</span>
            </div>
          )}
          {!hook.hasMore && hook.items.length > 0 && !hook.loadingMore && (
            <p className="text-center text-xs text-muted-foreground/60 py-3">{ui('allRecordsLoaded')}</p>
          )}
        </div>
      )}
    </ScrollPane>
  );
}

function RefreshButton({ RefreshIconComponent, iconButtonHover, onRefresh, label }) {
  const RefreshEl = RefreshIconComponent || RefreshCw;
  return (
    <button
      onClick={onRefresh}
      className={`h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground ${iconButtonHover} transition-colors`}
      title={label || 'Refresh'}
    >
      <RefreshEl className="h-4 w-4" data-testid="RefreshEl__620cbc" />
    </button>
  );
}

function TableRowsIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth="1.5" />
      <line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.5" />
      <line x1="3" y1="15" x2="21" y2="15" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function ViewToggle({ galleryRenderer, onSelectList, onSelectGallery, viewMode }) {
  if (!galleryRenderer) return null;
  return (
    <div data-testid="view-toggle" className="flex flex-row items-center p-1 gap-1 h-10 w-[108px] bg-[hsl(var(--muted))] rounded-xl">
      <button
        onClick={onSelectList}
        className={`flex items-center justify-center w-12 h-8 rounded-lg transition-all ${viewMode === "list" ? "bg-card shadow-sm" : ""}`}
      >
        <TableRowsIcon size={24} color="hsl(var(--text-disabled))" data-testid="TableRowsIcon__620cbc" />
      </button>
      <button
        onClick={onSelectGallery}
        className={`flex items-center justify-center w-12 h-8 rounded-lg transition-all ${viewMode === "gallery" ? "bg-card shadow-sm" : ""}`}
      >
        <LayoutGrid
          className="h-6 w-6"
          style={{ color: 'hsl(var(--text-disabled))' }}
          data-testid="LayoutGrid__620cbc" />
      </button>
    </div>
  );
}

function iconSizeClass(selectionBarSize) {
  return selectionBarSize === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
}

function buildRowNavigateHandler(renderPreview, setPreviewRow, navigate, windowName) {
  return renderPreview ? (row) => setPreviewRow(row) : (row) => navigate(`/${windowName}/${row.id}`);
}

function tableOpacityClass(hook) {
  return hook.loading ? 'opacity-70 transition-opacity duration-200' : 'transition-opacity duration-200';
}

function parseListSortBy(listSortBy) {
  const parts = listSortBy ? listSortBy.trim().split(/\s+/) : [];
  return {
    initialSortColumn: parts[0] || 'creationDate',
    initialSortDirection: parts[0] ? (parts[1] ?? 'asc') : 'desc',
  };
}

function isDefaultSortActive(hook, defaultColumn, defaultDirection) {
  return hook.sortColumn === defaultColumn && hook.sortDirection === defaultDirection;
}

/**
 * Full-width list view for an entity.
 */
export function ListView({
  entity,
  Table,
  entityLabel,
  windowName,
  token,
  apiBaseUrl,
  breadcrumb,
  galleryRenderer,
  hideCreate = false,
  hidePrint = false,
  hideMoreMenu = false,
  hideListFilters = false,
  // Drops the whole list bar (filters + sort/refresh/link/print/New) instead of
  // just its individual controls. For windows whose headerTable renders its own
  // complete toolbar — without this, `hideCreate`/`hidePrint`/`hideListFilters`
  // still leave an empty padded strip with the sort/refresh icons, which have no
  // flag of their own. Also settable through `listViewOptions.hideListBar`.
  hideListBar = false,
  // The Table scrolls one of its own regions: render it in a bounded flex box
  // instead of ListView's ScrollPane (see the Table block below for the rationale).
  // Also settable through `listViewOptions.tableOwnsScroll`.
  tableOwnsScroll = false,
  hideLink = false,
  headerContent = null,
  api = null,
  // ETP-4520 — the runtime per-tier window override (`useWindowAccess`'s 'read-only'
  // tier forces `{ readOnly: true }` here — see buildWindowAccessWiring/effectiveWindow
  // in generate-frontend.js and the equivalent hand-wired custom windows). Distinct from
  // `api.window.readOnly` below, which is the static decisions.json-authored flag for a
  // window that's ALWAYS view-only regardless of role. Either one forces read-only.
  window: windowProp = null,
  bulkActions = null,
  isRowSelectable = null,
  // ETP-4871 — optional `(row) => boolean` gating ListView's own bulk-delete button (the
  // selection-bar "Delete selected", not to be confused with a window's own per-row delete
  // affordance). Absent means "every row is deletable" — unchanged default behavior for every
  // window that does not pass it. When present, the button disables the moment the CURRENT
  // selection includes a row that fails the predicate, with a tooltip explaining how many.
  isRowDeletable = null,
  listViewOptions = {},
  baseFilter = null,
  quickFilters = null,
  initialQuickFilterIndex = null,
  subsetFilters = null,
  initialSubsetIndex = 0,
  onNew = null,
  newLabel = null,
  newActions = [],
  listbarPaddingX = 'px-2',
  listbarPaddingY = 'py-3',
  SortIconComponent = null,
  RefreshIconComponent = null,
  iconButtonHover = 'hover:text-foreground',
  tablePaddingX = 'px-2',
  tablePaddingBottom = 'pb-6',
  labelOverrides,
  onCloneRow = null,
  initialColumnFilters,
  initialAdvancedFilter = null,
  initialColumns = null,
  rowFilter,
  dateFilterKey = null,
  refreshTrigger = 0,
  hoverRowActions = false,
  selectionBarSize = 'sm',
  selectionBarRightActions = null,
  // ETP-3914 — Row Quick Actions overlay. Forwarded to the inner DataTable through the
  // generated `${headerName}Table` (which spreads its props). Optional. See DataTable.jsx
  // for the full shape.
  rowQuickActions = null,
  // ETP-3914 — Resolved Send/Download config from the contract
  // (`window.sendDocument`). When `enabled !== false` and the host did not wire
  // a custom `onEmail`, ListView mounts a generic SendDocumentModal driven by
  // the row data so any documental window gets the envelope for free.
  sendDocument = null,
  renderPreview = null,
  externalPreviewRow = null,
  onExternalPreviewClose = null,
  hiddenColumns = [],
  listSortBy = null,
  import: importConfig = null,
}) {
  // Subset filters — radio-style, always one active, applied first.
  const [activeSubsetIndex, setActiveSubsetIndex] = useState(() => {
    if (!subsetFilters?.length) return null;
    const idx = initialSubsetIndex != null && subsetFilters[initialSubsetIndex] ? initialSubsetIndex : 0;
    return idx;
  });

  const selectSubset = useCallback((i) => {
    setActiveSubsetIndex(i);
  }, []);

  // Quick filters — independent toggles, refine the current subset.
  const [activeFilterIndices, setActiveFilterIndices] = useState(() =>
    initialQuickFilterIndex != null && quickFilters?.[initialQuickFilterIndex]
      ? new Set([initialQuickFilterIndex])
      : new Set(),
  );

  const toggleQuickFilter = useCallback((i) => {
    setActiveFilterIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  // Advanced filter (funnel popover) — ephemeral state, lost on page refresh.
  const [advancedFilter, setAdvancedFilter] = useState(initialAdvancedFilter);

  const [tableColumns, setTableColumns] = useState(initialColumns ?? []);

  const [showImportDialog, setShowImportDialog] = useState(false);
  const { runBatch } = useBatch({ apiBaseUrl, token });
  const { locale } = useLocaleSwitch();

  // `multiField` columns are opaque to the advanced filter: expand each into
  // per-part pseudo-columns so the builder and criteria composer treat every
  // constituent field as an independent filterable field (no core edits).
  const filterColumns = useMemo(
    () => expandMultiFieldColumns(tableColumns, locale),
    [tableColumns, locale],
  );

  const advancedFilterPart = useMemo(() => {
    const criteria = buildAdvancedFilterCriteria(advancedFilter, filterColumns);
    if (!criteria || criteria.length === 0) return null;
    return `criteria=${encodeURIComponent(JSON.stringify(criteria))}`;
  }, [advancedFilter, filterColumns]);

  const effectiveFilter = useMemo(() => {
    // Composition here covers window-scope filters only:
    //   baseFilter AND subset AND quick[]
    // Column filters (status/date/search) and the funnel are applied downstream
    // by useEntity so they sort after this block in the final criteria array.
    const parts = [];
    if (baseFilter) parts.push(baseFilter);
    if (subsetFilters && activeSubsetIndex != null) {
      const f = subsetFilters[activeSubsetIndex]?.filter;
      if (f) parts.push(f);
    }
    if (quickFilters && activeFilterIndices.size > 0) {
      const qfParts = [...activeFilterIndices]
        .sort((a, b) => a - b)
        .map(i => quickFilters[i]?.filter)
        .filter(Boolean);
      parts.push(...qfParts);
    }
    if (parts.length === 0) return null;

    // Split each part into criteria payload + passthrough query params.
    const { allCriteria, passthrough } = splitFilterParts(parts);

    const segments = [];
    if (allCriteria.length > 0) {
      // If any part introduced an AdvancedCriteria (e.g. the funnel's OR block),
      // wrap the whole outer merge in an AdvancedCriteria AND so the OR stays
      // parenthesized instead of leaking into the top-level AND array.
      const hasAdvanced = allCriteria.some((c) => c && c._constructor === 'AdvancedCriteria');
      const finalCriteria = hasAdvanced
        ? { _constructor: 'AdvancedCriteria', operator: 'and', criteria: allCriteria }
        : allCriteria;
      segments.push(`criteria=${encodeURIComponent(JSON.stringify(finalCriteria))}`);
    }
    const passthroughStr = passthrough.toString();
    if (passthroughStr) segments.push(passthroughStr);
    return segments.length > 0 ? segments.join('&') : null;
  }, [subsetFilters, activeSubsetIndex, quickFilters, activeFilterIndices, baseFilter]);

  const effectiveRowFilter = useMemo(() => {
    const fns = [];
    if (subsetFilters && activeSubsetIndex != null) {
      const fn = subsetFilters[activeSubsetIndex]?.rowFilter;
      if (fn) fns.push(fn);
    }
    if (quickFilters && activeFilterIndices.size > 0) {
      const qfFns = [...activeFilterIndices]
        .map(i => quickFilters[i]?.rowFilter)
        .filter(Boolean);
      fns.push(...qfFns);
    }
    if (rowFilter) fns.push(rowFilter);
    if (fns.length === 0) return null;
    if (fns.length === 1) return fns[0];
    return (item) => fns.every(fn => fn(item));
  }, [subsetFilters, activeSubsetIndex, quickFilters, activeFilterIndices, rowFilter]);

  const [columnFilters, setColumnFilters] = useState(initialColumnFilters ?? {});
  const columnDefs = useMemo(
    () => Object.fromEntries(tableColumns.map(c => [c.key, c])),
    [tableColumns],
  );

  const handleFilterChange = useCallback((key, parsed) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      if (parsed) next[key] = parsed;
      else delete next[key];
      return next;
    });
    trackSearchPerformed({
      entity,
      specName: windowName,
      source: 'list_filter',
      type: parsed ? 'filter_apply' : 'filter_clear',
      count: parsed ? 1 : 0,
    });
  }, [entity, windowName]);

  const handleClearAllFilters = useCallback(() => {
    setColumnFilters({});
  }, []);

  // Named filter presets — per-user, per-window, persisted via AD_Preference.
  const { presets: filterPresets, savePreset, deletePreset } = useWindowFilterPresets(windowName);

  const applyPreset = useCallback((name) => {
    const preset = filterPresets?.[name];
    if (!preset) return;
    setColumnFilters(preset.columnFilters && typeof preset.columnFilters === 'object' ? preset.columnFilters : {});
    setAdvancedFilter(preset.advancedFilter ?? null);

    // Subset and quick filters are stored by label (stable across prop
    // reorderings); resolve back to the current prop index, falling back to
    // the default if a label no longer exists.
    if (subsetFilters?.length) {
      const target = preset.subsetLabel
        ? subsetFilters.findIndex((f) => f?.label === preset.subsetLabel)
        : -1;
      setActiveSubsetIndex(target >= 0 ? target : (subsetFilters[0] ? 0 : null));
    }

    resolveQuickFilterIndicesFromPreset(quickFilters, preset, setActiveFilterIndices);
  }, [filterPresets, subsetFilters, quickFilters]);

  const saveCurrentAsPreset = useCallback((name) => {
    const subsetLabel = (subsetFilters && activeSubsetIndex != null)
      ? (subsetFilters[activeSubsetIndex]?.label ?? null)
      : null;
    const quickFilterLabels = quickFilters
      ? [...activeFilterIndices]
        .map((i) => quickFilters[i]?.label)
        .filter(Boolean)
      : [];
    savePreset(name, {
      columnFilters,
      advancedFilter,
      subsetLabel,
      quickFilterLabels,
    });
  }, [savePreset, columnFilters, advancedFilter, subsetFilters, activeSubsetIndex, quickFilters, activeFilterIndices]);

  const didInitialFetchRef = useRef(false);

  const { initialSortColumn, initialSortDirection } = parseListSortBy(listSortBy);

  const hook = useEntity(entity, null, {
    token,
    apiBaseUrl,
    baseFilter: effectiveFilter,
    columnDefs,
    columnFilters,
    trailingFilter: advancedFilterPart,
    specName: windowName,
    initialSortColumn,
    initialSortDirection,
  });

  useEffect(() => {
    if (!entity && !windowName) return;
    trackWindowOpened({
      entity,
      specName: windowName,
      source: 'list_view',
    });
  }, [entity, windowName]);

  const refreshRef = useRef(hook.refresh);
  refreshRef.current = hook.refresh;

  useEffect(() => {
    if (!didInitialFetchRef.current) {
      didInitialFetchRef.current = true;
      return;
    }
    refreshRef.current?.();
  }, [columnFilters, effectiveFilter, advancedFilterPart, hook.sortColumn, hook.sortDirection]);

  // External refresh signal — increments when the host wants to force a reload
  // (e.g. after cloning records via CloneOrderModal).
  const lastRefreshTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger === lastRefreshTriggerRef.current) return;
    lastRefreshTriggerRef.current = refreshTrigger;
    refreshRef.current?.();
  }, [refreshTrigger]);

  const navigate = useNavigate();
  // ETP-3914 — when rowQuickActions is enabled but the host did not supply
  // onEdit/onDelete, wire sensible defaults: navigate to detail and reuse the
  // shared delete confirm + DELETE pipeline. Custom overrides that pass their
  // own handlers (sales-order, purchase-order, sales-invoice, purchase-invoice)
  // win — we only fill blanks.
  const quickActionsEnabled = !!rowQuickActions && rowQuickActions.enabled !== false;
  const { requestDelete: defaultRequestDelete, deleteDialog: defaultDeleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: entity || 'header',
    token,
    onSuccess: () => refreshRef.current?.(),
  });
  // ETP-3914 — Generic Send/Download mount: when the window is eligible
  // (sendDocument.enabled !== false) and the host did NOT supply onEmail, open
  // the modal on row click using only the data we already have on the row.
  const [emailRow, setEmailRow] = useState(null);
  // Auto-detect documental windows from the contract: if the host did not pass
  // `sendDocument` explicitly, mirror the generator's eligibility heuristic
  // (`generate-frontend.js`) at runtime — windows whose header exposes a
  // `documentNo` column get the envelope enabled with default `allowEmail: true`.
  // Master-data windows (no documentNo) stay silent automatically. This keeps
  // custom windows (which render ListView directly, bypassing GeneratedApp)
  // from having to opt in manually.
  const effectiveSendDocument = useMemo(() => {
    if (sendDocument != null) return sendDocument;
    const hasDocumentNo = tableColumns.some(c => c.key === 'documentNo');
    return hasDocumentNo ? { enabled: true, allowEmail: true } : null;
  }, [sendDocument, tableColumns]);
  const sendDocumentEnabled = !!effectiveSendDocument && effectiveSendDocument.enabled !== false;
  const allowEmail = effectiveSendDocument?.allowEmail !== false;

  // View-only window (decisions.json → window.readOnly, OR the ETP-4520 runtime
  // 'read-only' access tier via the `window` prop): suppress the write quick
  // actions and don't wire their default handlers. Row click still opens the
  // (read-only) detail, so viewing is preserved. Complements DetailView's own gate.
  const windowReadOnly = api?.window?.readOnly === true || windowProp?.readOnly === true;

  const effectiveRowQuickActions = useMemo(() => {
    if (!quickActionsEnabled) return rowQuickActions;
    const merged = {
      ...rowQuickActions,
      readOnly: windowReadOnly || rowQuickActions.readOnly === true,
      onEdit: rowQuickActions.onEdit
        || (windowReadOnly ? undefined : (row) => row?.id && navigate(`/${windowName || entity}/${row.id}`)),
      onDelete: rowQuickActions.onDelete || (windowReadOnly ? undefined : defaultRequestDelete),
    };
    // Thread sendDocument through to DataTable → RowQuickActions for the gate,
    // and inject a default onEmail when the window is eligible but the host
    // didn't wire one.
    if (effectiveSendDocument && !merged.sendDocument) merged.sendDocument = effectiveSendDocument;
    if (sendDocumentEnabled && !merged.onEmail) {
      merged.onEmail = (row) => setEmailRow(row);
    }
    return merged;
  }, [quickActionsEnabled, rowQuickActions, navigate, windowName, entity, defaultRequestDelete, effectiveSendDocument, sendDocumentEnabled, windowReadOnly]);
  const tMenu = useMenuLabel();
  const t = useLabel(labelOverrides);
  const ui = useUI();
  // ETP-4669: the import flow (ImportDialog + every child) previously rendered its hardcoded
  // English DEFAULT_LABELS regardless of locale, because no `labels` was ever passed. Build
  // the nested `labels` object ImportDialog forwards to each child (shape documented in
  // app-shell-core's ImportDialog.jsx) and pass `translate={ui}` so the send pipeline
  // localizes backend errors too. Templated strings (mappedSummary/{mapped}/{total},
  // tooltips, bulkApply/{count}/{raw}/{value}) keep their {placeholders} — the child fills
  // them at render time; the (n) => string labels interpolate here. `save`/`cancel`/`retry`/
  // `close` reuse existing generic keys per the i18n guide's "reuse before adding" rule.
  const importLabels = useMemo(() => ({
    title: ui('importDialogTitle'),
    revalidating: ui('importRevalidating'),
    downloadTemplate: ui('importDownloadTemplate'),
    importButton: (n) => ui('importButtonCount', { n }),
    dropzone: {
      dropHere: ui('importDropHere'),
      dropHint: ui('importDropHint'),
    },
    progress: {
      title: ui('importProgressTitle'),
      subtitle: ui('importProgressSubtitle'),
    },
    mapping: {
      notImported: ui('importNotImported'),
      mappedSummary: ui('importMappedSummary'),
      editMatch: ui('importEditMatch'),
      editTitle: ui('importEditColumnTitle'),
      save: ui('save'),
      cancel: ui('cancel'),
    },
    confirm: {
      title: ui('importConfirmTitle'),
      willImport: (n) => ui('importWillImport', { n }),
      willSkip: (n) => ui('importWillSkip', { n }),
      cancel: ui('cancel'),
      confirm: ui('importConfirmButton'),
    },
    fileError: {
      title: ui('importFileErrorTitle'),
      cancel: ui('cancel'),
      retry: ui('retry'),
    },
    reviewQueue: {
      filterAll: ui('importFilterAll'),
      filterOk: ui('importFilterOk'),
      filterError: ui('importFilterError'),
      skip: ui('importSkip'),
      skipped: ui('importSkipped'),
      unskip: ui('importUnskip'),
      downloadErrors: ui('importDownloadErrors'),
      status: ui('importStatus'),
      statusOk: ui('importStatusOk'),
      statusError: ui('importStatusError'),
      fieldErrorsTooltip: ui('importFieldErrorsTooltip'),
      bulkApplyTitle: ui('importBulkApplyTitle'),
      bulkApplyDescription: ui('importBulkApplyDescription'),
      bulkApplyOnlyThis: ui('importBulkApplyOnlyThis'),
      bulkApplyAll: ui('importBulkApplyAll'),
      retry: ui('retry'),
    },
    systemError: {
      title: ui('importSystemErrorTitle'),
      subtitle: ui('importSystemErrorSubtitle'),
      copy: ui('importSystemErrorCopy'),
      copied: ui('importSystemErrorCopied'),
      copyFailed: ui('importSystemErrorCopyFailed'),
      close: ui('close'),
      showReport: ui('importSystemErrorShowReport'),
      hideReport: ui('importSystemErrorHideReport'),
      rowData: ui('importSystemErrorRowData'),
      requestSent: ui('importSystemErrorRequestSent'),
      serverResponse: ui('importSystemErrorServerResponse'),
    },
  }), [ui]);
  const label = tMenu(entityLabel) || entityLabel || entity;
  const { toggleFavorite, isFavorite } = useFavorites();
  const favKey = windowName || entity || '';
  const favActive = isFavorite(favKey);
  const fullBreadcrumb = breadcrumb
    ? breadcrumb.split(' / ').map(s => tMenu(s.trim())).join(' / ')
    : label;
  useSetPageMeta({
    title: label,
    breadcrumb: fullBreadcrumb,
    recordCount: hook.items.length,
    onAddToFavorites: favKey ? () => toggleFavorite(favKey, entityLabel || entity) : undefined,
    isFavorite: favActive,
  }, [favActive, hook.items.length]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [clearSelectionCounter, setClearSelectionCounter] = useState(0);
  // ETP-4656 — partial bulk-delete outcome: bump deselectTrigger with the ids of
  // the rows that were successfully deleted so DataTable drops only those from
  // its internal selection Set, leaving the failed rows checked (see
  // useBulkRowDelete below and DataTable's matching deselectTrigger effect).
  const [deselectTrigger, setDeselectTrigger] = useState(0);
  const [deselectRowIds, setDeselectRowIds] = useState([]);
  const [previewRow, setPreviewRow] = useState(null);
  const activePreviewRow = previewRow ?? externalPreviewRow ?? null;

  const handlePreviewClose = useCallback(() => {
    if (previewRow) {
      setPreviewRow(null);
    } else {
      onExternalPreviewClose?.();
    }
  }, [previewRow, onExternalPreviewClose]);

  const handlePreviewEdit = useCallback((id) => {
    setPreviewRow(null);
    onExternalPreviewClose?.();
    navigate(`/${windowName}/${id}`);
  }, [navigate, windowName, onExternalPreviewClose]);
  const clearSelection = useCallback(() => {
    setSelectedRows([]);
    setClearSelectionCounter((c) => c + 1);
  }, []);

  // ETP-4656 — shared outcome handler for ANY bulk-delete flow that reports back
  // (succeeded, failed) rows, per the standardized delete UX:
  //   - all succeeded  → refetch (deleted rows disappear) + clear selection.
  //   - partial failure → refetch (succeeded rows disappear) + keep only the
  //     failed rows selected, both in our own state and in DataTable's
  //     internal checkbox Set (via deselectTrigger/deselectRowIds).
  //   - all failed      → no refetch, selection untouched.
  // Extracted so it can be reused both by the generic "Delete selected" button
  // below (via useBulkRowDelete's onSuccess) AND by a custom
  // selectionBarRightActions consumer that runs its own delete loop but still
  // wants the same reselect-only-the-failed-rows behavior (see
  // `reselectFailed` passed into selectionBarRightActions further down).
  const applyBulkDeleteOutcome = useCallback((succeeded, failed) => {
    if (succeeded.length > 0) hook.refresh();
    if (failed.length === 0) {
      clearSelection();
    } else {
      setSelectedRows(failed);
      if (succeeded.length > 0) {
        setDeselectRowIds(succeeded.map((r) => r.id));
        setDeselectTrigger((c) => c + 1);
      }
    }
  }, [hook.refresh, clearSelection]);

  const { requestBulkDelete, bulkDeleteDialog, deleting: bulkDeleting } = useBulkRowDelete({
    apiBaseUrl,
    entity: entity || 'header',
    token,
    onSuccess: applyBulkDeleteOutcome,
  });

  // Register this list view with the current-window context so the Copilot
  // widget can auto-attach it when opened. Memoized so the hook's signature
  // computation stays stable across unrelated renders.
  const windowContextInfo = useMemo(() => ({
    spec: windowName,
    tabTitle: label,
    selectedRecords: selectedRows,
    formValues: null,
    isFormEditing: false,
  }), [windowName, label, selectedRows]);
  useRegisterWindowContext(windowContextInfo);
  const [showReport, setShowReport] = useState(false);
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem(`viewMode:${entity}`) || 'list'
  );

  const handleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem(`viewMode:${entity}`, mode);
  };


  const isDefaultSort = isDefaultSortActive(hook, initialSortColumn, initialSortDirection);

  const handleSortSelect = useCallback((colKey) => {
    if (hook.sortColumn === colKey) {
      // Toggle direction
      hook.setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      hook.setSortColumn(colKey);
      hook.setSortDirection('asc');
    }
  }, [hook.sortColumn, hook.setSortColumn, hook.setSortDirection]);

  // Header click: none → asc → desc → back to this window's own default.
  // The reset arm used to hardcode `creationDate desc`, which is only the default for a
  // window that declares no `listSortBy`. For one that does, the third click silently
  // switched to a DIFFERENT order than the one the list opened in — and any slot that keys
  // off "is the sort still at rest" (AccountsHeaderTable's two-key resting order) could
  // never return to it.
  const handleColumnSort = useCallback((colKey) => {
    if (hook.sortColumn !== colKey) {
      hook.setSortColumn(colKey);
      hook.setSortDirection('asc');
    } else if (hook.sortDirection === 'asc') {
      hook.setSortDirection('desc');
    } else {
      hook.setSortColumn(initialSortColumn);
      hook.setSortDirection(initialSortDirection);
    }
  }, [hook.sortColumn, hook.sortDirection, hook.setSortColumn, hook.setSortDirection,
    initialSortColumn, initialSortDirection]);

  const handleClearSort = useCallback(() => {
    hook.setSortColumn(initialSortColumn);
    hook.setSortDirection(initialSortDirection);
  }, [hook.setSortColumn, hook.setSortDirection, initialSortColumn, initialSortDirection]);

  const handleReachBottom = useCallback(() => {
    if (hook.hasMore && !hook.loadingMore) hook.loadMore();
  }, [hook.hasMore, hook.loadingMore, hook.loadMore]);

  // A custom headerTable that renders the window's whole toolbar itself needs the native
  // list bar dropped entirely — the individual hide* flags leave an empty padded strip
  // behind, since sort/refresh have no flag of their own.
  const listBarHidden = listViewOptions?.hideListBar ?? hideListBar;

  // Everything the Table needs, in one object, because ListTableRegion renders it from
  // either of two wrappers and these used to be written out once per branch. `meta` is
  // the same list-response envelope `headerContent` gets: a custom headerTable that
  // renders its own aggregate panel (e.g. financial-account's balance sidebar) needs it
  // here, since that panel lives inside the table slot rather than above it.
  const tableProps = {
    entity,
    specName: windowName,
    data: hook.items,
    meta: hook.meta,
    onNavigate: buildRowNavigateHandler(renderPreview, setPreviewRow, navigate, windowName),
    onSelectionChange: setSelectedRows,
    // ETP-4656 — the AUTHORITATIVE selection, read-only for the slot. A custom
    // headerTable that has to react to selection (e.g. financial-account swaps its own
    // toolbar for the selection bar) must not mirror this by wrapping
    // `onSelectionChange`: DataTable clears/prunes its internal Set silently from the
    // `clearSelectionTrigger` and `deselectTrigger` effects WITHOUT calling
    // `onSelectionChange`, so any locally-mirrored count goes stale the moment a bulk
    // delete succeeds or the selection is cancelled — and the slot's toolbar would
    // never come back. DataTable itself has no `selectedRows` prop (it is local state
    // there), so forwarding this through a spread is inert.
    selectedRows,
    onDataMutated: hook.refresh,
    isRowSelectable,
    compact: false,
    sortColumn: hook.sortColumn,
    sortDirection: hook.sortDirection,
    onSort: handleColumnSort,
    // The other two thirds of the sort API, forwarded so a window that REPLACES the idle bar
    // (financial-account, via `hideListBar`) can still render `ListSortPopover` in its own
    // toolbar instead of losing the control. `onSort` alone is not enough: the popover needs
    // pick-a-column (which must not silently clear the sort the way the header's third click
    // does) and back-to-default, and it needs to know whether it is AT the default to decide
    // whether to offer that at all.
    onSortSelect: handleSortSelect,
    onClearSort: handleClearSort,
    isDefaultSort,
    onColumnsReady: setTableColumns,
    api,
    token,
    apiBaseUrl,
    labelOverrides,
    onFilterChange: handleFilterChange,
    onClearAllFilters: handleClearAllFilters,
    columnFilters,
    onCloneRow,
    rowFilter: effectiveRowFilter,
    hoverRowActions,
    clearSelectionTrigger: clearSelectionCounter,
    deselectTrigger,
    deselectRowIds,
    rowQuickActions: effectiveRowQuickActions,
    hiddenColumns,
  };

  // ETP-4871 — how many of the CURRENT selection fail `isRowDeletable`, if the host passed one.
  // 0 (the default, `isRowDeletable` absent) means the bulk-delete button behaves exactly as
  // before for every other window — this must never regress an existing window's bulk delete.
  const blockedDeleteCount = isRowDeletable
    ? selectedRows.filter((row) => !isRowDeletable(row)).length
    : 0;

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col" data-testid="list-view">
        {/* White content card with rounded top-left corner */}
        <div className="flex-1 flex flex-col bg-card rounded-tl-2xl overflow-hidden min-h-0">
          {/* Selection toolbar AND filter/idle bar — rendered independently, not as
              either/or branches of one ternary (ETP-4972 Finding 4). Before ETP-4972
              the selection bar occupied this same DOM slot as the idle bar (an inline
              "replace the toolbar" design), so a ternary made sense. Now that
              SelectionToolbar is a viewport-fixed portal to document.body, the two
              no longer compete for the same space — and per ETP-4972's own "Floating
              Toolbar vs Gmail/Drive-style replace" decision, the floating pill is
              explicitly ADDITIVE: the idle bar (Filtros, ViewToggle, Nuevo, etc.) must
              stay visible while rows are selected, not disappear behind the pill.
              Rendering both as independent `&&` expressions below achieves that with
              no nested-ternary risk (Sonar S3358 doesn't apply to two siblings).

              ETP-4658/ETP-4656 — `hideListBar` gates ONLY the idle filter bar, not the
              selection bar. The flag exists because a custom headerTable draws the
              window's own toolbar, so the native idle strip is a duplicate that leaves
              an empty padded band behind (sort/refresh have no hide* flag of their own).
              The selection bar is a different thing: transient, never empty, and the
              standardized home of "Delete selected" — no headerTable replaces it, so
              suppressing it here silently dropped grid multi-select delete from every
              custom-headerTable window (that is how Cuentas financieras lost it).
              This is safe by construction rather than by convention: the bar is
              unreachable unless the grid is selectable, so a custom headerTable that
              wants no selection at all simply keeps `selectable={false}` on its own
              DataTable and never renders rows that can be picked. */}
          {selectedRows.length > 0 && (
            <SelectionToolbar
              visible={selectedRows.length > 0}
              onClose={clearSelection}
              closeTitle={ui('close')}
              data-testid="SelectionToolbar__620cbc">
              <div className="flex items-center gap-3 h-10">
                <span role="status" className="text-sm font-medium" data-testid="selection-count">{ui('selected').replace('{count}', selectedRows.length)}</span>
              </div>
              <div className="flex items-center gap-2 h-10">
                {/* ETP-4972 — ghost variant, icon-only (title tooltip, no visible
                    label, no border/box): Figma's floating pill keeps only the
                    destructive "Eliminar" action bordered; secondary actions like
                    this one sit directly on the pill background and only highlight
                    on hover. Nothing is hidden behind a menu — just narrower and
                    borderless. */}
                {!(listViewOptions?.hidePrint ?? hidePrint) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={ui('print')}
                    aria-label={ui('print')}
                    onClick={() => printDocuments(windowName, selectedRows.map(r => r.id || r), token, ui, apiBaseUrl)}
                    data-testid="Button__620cbc">
                    <Printer className={iconSizeClass(selectionBarSize)} data-testid="Printer__620cbc" />
                  </Button>
                )}
                {onCloneRow && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={ui('cloneOrderBtn')}
                    aria-label={ui('cloneOrderBtn')}
                    onClick={() => onCloneRow(selectedRows)}
                    data-testid="Button__620cbc">
                    <Copy className={iconSizeClass(selectionBarSize)} data-testid="Copy__620cbc" />
                  </Button>
                )}
                {/* ETP-4656 — generic "Delete selected". Suppressed when the window is
                    read-only or via the explicit `listViewOptions.hideBulkDelete` opt-out
                    (e.g. a host that already renders its own delete affordance through
                    selectionBarRightActions for an unrelated reason must opt out
                    explicitly — inferring it from that prop's mere presence was fragile,
                    since selectionBarRightActions can be used for things other than
                    delete).
                    ETP-4871 — additionally disabled (with an explanatory tooltip) once the
                    selection includes a row the host's `isRowDeletable` rejects; absent, this
                    never differs from the pre-existing behavior. */}
                {/* ETP-4972 — icon-only, no border, no visible "Eliminar" label:
                    zoomed straight into the applied Figma instance's canvas
                    render (not just the Dev Mode property panel) and confirmed
                    no stroke/box around the trash icon at all — ghost, same as
                    every other secondary action, distinguished only by its red
                    icon color. */}
                {!windowReadOnly && !(listViewOptions?.hideBulkDelete) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={bulkDeleting || blockedDeleteCount > 0}
                    onClick={() => requestBulkDelete(selectedRows)}
                    title={blockedDeleteCount > 0
                      ? ui('bulkDeleteBlockedTooltip', { count: blockedDeleteCount })
                      : ui('delete')}
                    aria-label={ui('delete')}
                    data-testid="bulk-delete-selected">
                    <Trash2 className={iconSizeClass(selectionBarSize)} data-testid="Trash2__620cbc" />
                  </Button>
                )}
                {bulkActions && bulkActions({ selectedRows, clearSelection, token, apiBaseUrl, windowName, api })}
                {selectionBarRightActions && selectionBarRightActions({
                  selectedRows,
                  clearSelection,
                  token,
                  apiBaseUrl,
                  onDataMutated: hook.refresh,
                  // ETP-4656 — additive only: gives a custom
                  // selectionBarRightActions consumer running its OWN delete
                  // loop (e.g. Contacts) the same "reselect only the failed
                  // rows" outcome handling the generic "Delete selected"
                  // button gets for free via useBulkRowDelete's onSuccess.
                  // No existing consumer reads this field, so this changes
                  // nothing for any other window.
                  reselectFailed: applyBulkDeleteOutcome,
                })}
              </div>
            </SelectionToolbar>
          )}
          {!listBarHidden && (
            <div className={`flex items-center justify-between ${listbarPaddingX} ${listbarPaddingY}`}>
              <div className="flex items-center gap-2">
                {subsetFilters && (
                  <div role="group" aria-label="Filters" className="inline-flex items-center gap-1 rounded-xl bg-[hsl(var(--muted))] p-1 h-10">
                    {subsetFilters.map((sf, i) => (
                      <button
                        key={i}
                        onClick={() => selectSubset(i)}
                        data-testid={`filter-${sf.key || sf.label?.toLowerCase()}`}
                        className={[
                          'h-8 px-3 text-sm font-medium text-[hsl(var(--foreground))] rounded-lg transition-all whitespace-nowrap',
                          activeSubsetIndex === i
                            ? 'bg-card shadow-sm'
                            : 'bg-[hsl(var(--muted))] hover:brightness-95',
                        ].join(' ')}
                      >
                        {ui(sf.label)}
                      </button>
                    ))}
                  </div>
                )}
                {quickFilters && (
                  <div role="group" aria-label="Filters" className="flex items-center gap-1">
                    {quickFilters.map((qf, i) => (
                      <button
                        key={i}
                        onClick={() => toggleQuickFilter(i)}
                        data-testid={`quick-filter-${qf.key || qf.label?.toLowerCase()}`}
                        className={[
                          'h-9 px-3 text-xs rounded-lg border bg-card transition-colors',
                          activeFilterIndices.has(i)
                            ? 'border-primary text-primary bg-primary/5 font-medium'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        ].join(' ')}
                      >
                        {ui(qf.label)}
                      </button>
                    ))}
                  </div>
                )}
                <ListFilterBarSection
                  hideFilters={listViewOptions?.hideFilters}
                  hideListFilters={hideListFilters}
                  hideStatusFilter={listViewOptions?.hideStatusFilter}
                  entity={entity}
                  apiBaseUrl={apiBaseUrl}
                  columns={filterColumns}
                  columnFilters={columnFilters}
                  onFilterChange={handleFilterChange}
                  advancedFilter={advancedFilter}
                  onAdvancedFilterChange={setAdvancedFilter}
                  hook={hook}
                  dateFilterKey={dateFilterKey}
                  windowName={windowName}
                  filterPresets={filterPresets}
                  applyPreset={applyPreset}
                  saveCurrentAsPreset={saveCurrentAsPreset}
                  deletePreset={deletePreset}
                  labelOverrides={labelOverrides}
                  data-testid="ListFilterBarSection__620cbc" />
                <ViewToggle
                  galleryRenderer={galleryRenderer}
                  onSelectList={() => handleViewMode('list')}
                  viewMode={viewMode}
                  onSelectGallery={() => handleViewMode('gallery')}
                  data-testid="ViewToggle__620cbc" />
              </div>
              <div className="flex items-center gap-2">
                {!(listViewOptions?.hideLink ?? hideLink) && (
                  <button
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                    <Link2 className="h-4 w-4" data-testid="Link2__620cbc" />
                  </button>
                )}
                <ListSortPopover
                  columns={tableColumns}
                  sortColumn={hook.sortColumn}
                  sortDirection={hook.sortDirection}
                  onSelect={handleSortSelect}
                  onClear={handleClearSort}
                  isDefaultSort={isDefaultSort}
                  SortIconComponent={SortIconComponent}
                  iconButtonHover={iconButtonHover}
                  data-testid="ListSortPopover__620cbc" />
                <RefreshButton
                  RefreshIconComponent={RefreshIconComponent}
                  iconButtonHover={iconButtonHover}
                  onRefresh={() => hook.refresh()}
                  label={ui('refresh')}
                  data-testid="RefreshButton__620cbc" />
                {importConfig?.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-card"
                    onClick={() => setShowImportDialog(true)}
                    aria-label={ui('import')}
                    title={ui('import')}
                    data-testid="ListView__importButton"
                  >
                    <Upload className="h-3.5 w-3.5" data-testid="Upload__ListViewImport" />
                  </Button>
                )}
                {!(listViewOptions?.hidePrint ?? hidePrint) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-card"
                    onClick={() => setShowReport(true)}
                    data-testid="Button__620cbc">
                    <Printer className="h-3.5 w-3.5" data-testid="Printer__620cbc" />
                    {ui('print')}
                  </Button>
                )}
                {/* Split "New" button */}
                {!hideCreate && !windowReadOnly && (
                  <div className="inline-flex items-stretch rounded-lg overflow-hidden shadow-sm ml-3">
                    <Button
                      className="rounded-none rounded-l-lg gap-1.5 px-4 hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] transition-colors"
                      data-testid="action-new"
                      onClick={() => onNew ? onNew() : navigate(`/${windowName}/new`)}
                    >
                      <Plus className="h-4 w-4" data-testid="Plus__620cbc" />
                      {newLabel ?? tMenu(entityLabel, { field: 'newLabel' }) ?? ui('newRecord')}
                    </Button>
                    {newActions.length > 0 && (
                      <>
                        <div className="w-px bg-primary-foreground/20" />
                        <DropdownMenu data-testid="DropdownMenu__620cbc">
                          <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__620cbc">
                            <Button
                              className="rounded-none rounded-r-lg px-2 hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] transition-colors"
                              data-testid="action-new-more">
                              <ChevronDown className="h-3.5 w-3.5" data-testid="ChevronDown__620cbc" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" data-testid="DropdownMenuContent__620cbc">
                            {newActions.map((action) => (
                              <DropdownMenuItem
                                key={action.key}
                                onClick={action.onClick}
                                data-testid={`action-new-${action.key}`}
                              >
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KPI / header content */}
          {headerContent && (
            <div className="px-6 pt-4">
              {typeof headerContent === 'function'
                ? headerContent({ api, token, apiBaseUrl, items: hook.items, loading: hook.loading, meta: hook.meta })
                : headerContent}
            </div>
          )}

          {/* Indeterminate top progress bar — visible while refreshing existing data. Extracted
              to ListProgressBar so the hand-rolled tables that never reach ListView (the
              financial-account detail tabs) can show the same affordance. */}
          {hook.loading && hook.items.length > 0 && (
            <ListProgressBar data-testid="ListProgressBar__620cbc" />
          )}

          {/* Table region (ScrollPane, or a bounded flex box when the table owns its
              own scroll) — see ListTableRegion for the full rationale. */}
          <ListTableRegion
            ownScroll={listViewOptions?.tableOwnsScroll ?? tableOwnsScroll}
            Table={Table}
            tableProps={tableProps}
            hook={hook}
            ui={ui}
            tablePaddingX={tablePaddingX}
            tablePaddingBottom={tablePaddingBottom}
            onReachBottom={handleReachBottom}
            viewMode={viewMode}
            galleryRenderer={galleryRenderer}
            navigate={navigate}
            windowName={windowName}
            token={token}
            apiBaseUrl={apiBaseUrl}
            data-testid="ListTableRegion__620cbc" />
        </div>
        <ReportDrawer
          open={showReport}
          onClose={() => setShowReport(false)}
          windowName={windowName}
          columns={tableColumns.map(col => ({ ...col, label: t(col.column) ?? col.label ?? col.key }))}
          title={label}
          apiBaseUrl={apiBaseUrl}
          entity={entity}
          token={token}
          sortColumn={hook.sortColumn}
          sortDirection={hook.sortDirection}
          data-testid="ReportDrawer__620cbc" />
        {quickActionsEnabled && !rowQuickActions?.onDelete && defaultDeleteDialog}
        {bulkDeleteDialog}
        {/* ETP-3914 — Generic Send/Download modal mount for any documental window
          that did not bring its own `onEmail`. Custom windows that mount the
          modal manually (sales-invoice, purchase-invoice) keep doing so because
          their `rowQuickActions.onEmail` wins over the default injected above. */}
        {emailRow && sendDocumentEnabled && !rowQuickActions?.onEmail && (
          <SendDocumentModal
            documentType={tMenu(entityLabel) || entityLabel || entity}
            documentNo={emailRow.documentNo}
            bpName={emailRow['businessPartner$_identifier']}
            bPartnerId={emailRow.businessPartner}
            apiBaseUrl={apiBaseUrl}
            documentId={emailRow.id}
            windowName={windowName}
            token={token}
            allowEmail={allowEmail}
            sendPolicy={effectiveSendDocument}
            onClose={() => setEmailRow(null)}
            data-testid="SendDocumentModal__620cbc" />
        )}
        {importConfig?.enabled && showImportDialog && (
          <ImportDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            config={importConfig}
            token={token}
            postBatch={runBatch}
            simSearchFn={simSearch}
            labels={importLabels}
            translate={ui}
            onImported={({ failedCount }) => {
              // Refresh unconditionally — some rows may have committed even when others
              // failed. Only auto-close when there is nothing left to review: closing
              // unconditionally (the original wiring) unmounted the dialog the instant it
              // rendered the Result step's review queue, hiding every failed row's error
              // message the moment it became visible — confirmed via a real browser run
              // where a batch that failed outright showed nothing on screen at all, even
              // after ImportDialog/sendRow were fixed to surface the real message.
              hook.refresh();
              if (failedCount === 0) setShowImportDialog(false);
            }}
            data-testid="ImportDialog__620cbc" />
        )}
      </div>
      {activePreviewRow && renderPreview?.({
        row: activePreviewRow,
        onClose: handlePreviewClose,
        onEdit: handlePreviewEdit,
      })}
    </>
  );
}

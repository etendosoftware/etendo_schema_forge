import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useEntity } from '@/hooks/useEntity';
import { useRowDelete } from '@/hooks/useRowDelete';
import { useMenuLabel, useLabel, useUI } from '@/i18n';
import { ArrowUpDown, ChevronDown, Plus, Link2, Printer, LayoutGrid, RefreshCw, Eye, Copy } from 'lucide-react';
import { useRegisterWindowContext } from '@/components/CurrentWindowContext';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import ReportDrawer from './ReportDrawer.jsx';
import DocumentPrintDrawer, { printDocuments } from './DocumentPrintDrawer.jsx';
import SendDocumentModal from './SendDocumentModal.jsx';
import { ListFilterBar } from './ListFilterBar.jsx';
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

function SortToggleButton({ SortIconComponent, isDefaultSort, iconButtonHover, onToggle }) {
  const SortEl = SortIconComponent || ArrowUpDown;
  return (
    <button
      onClick={onToggle}
      className={[
        'h-9 w-9 flex items-center justify-center rounded-lg border transition-colors',
        isDefaultSort
          ? `border-border text-muted-foreground ${iconButtonHover}`
          : 'border-primary/40 bg-primary/10 text-primary',
      ].join(' ')}
    >
      <SortEl className="h-4 w-4" data-testid="SortEl__620cbc" />
    </button>
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
    <div data-testid="view-toggle" className="flex flex-row items-center p-1 gap-1 h-10 w-[108px] bg-[#F5F7F9] rounded-xl">
      <button
        onClick={onSelectList}
        className={`flex items-center justify-center w-12 h-8 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm" : ""}`}
      >
        <TableRowsIcon size={24} color="#828FA3" data-testid="TableRowsIcon__620cbc" />
      </button>
      <button
        onClick={onSelectGallery}
        className={`flex items-center justify-center w-12 h-8 rounded-lg transition-all ${viewMode === "gallery" ? "bg-white shadow-sm" : ""}`}
      >
        <LayoutGrid
          className="h-6 w-6"
          style={{ color: '#828FA3' }}
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
  hideLink = false,
  hideEyeCount = false,
  headerContent = null,
  api = null,
  bulkActions = null,
  isRowSelectable = null,
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

  const advancedFilterPart = useMemo(() => {
    const criteria = buildAdvancedFilterCriteria(advancedFilter, tableColumns);
    if (!criteria || criteria.length === 0) return null;
    return `criteria=${encodeURIComponent(JSON.stringify(criteria))}`;
  }, [advancedFilter, tableColumns]);

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

  const effectiveRowQuickActions = useMemo(() => {
    if (!quickActionsEnabled) return rowQuickActions;
    const merged = {
      ...rowQuickActions,
      onEdit: rowQuickActions.onEdit
        || ((row) => row?.id && navigate(`/${windowName || entity}/${row.id}`)),
      onDelete: rowQuickActions.onDelete || defaultRequestDelete,
    };
    // Thread sendDocument through to DataTable → RowQuickActions for the gate,
    // and inject a default onEmail when the window is eligible but the host
    // didn't wire one.
    if (effectiveSendDocument && !merged.sendDocument) merged.sendDocument = effectiveSendDocument;
    if (sendDocumentEnabled && !merged.onEmail) {
      merged.onEmail = (row) => setEmailRow(row);
    }
    return merged;
  }, [quickActionsEnabled, rowQuickActions, navigate, windowName, entity, defaultRequestDelete, effectiveSendDocument, sendDocumentEnabled]);
  const tMenu = useMenuLabel();
  const t = useLabel(labelOverrides);
  const ui = useUI();
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
  const [showSortPopover, setShowSortPopover] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDocPrint, setShowDocPrint] = useState(false);
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem(`viewMode:${entity}`) || 'list'
  );

  const handleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem(`viewMode:${entity}`, mode);
  };

  const sortBtnRef = useRef(null);
  const scrollRef = useRef(null);

  const isDefaultSort = isDefaultSortActive(hook, initialSortColumn, initialSortDirection);

  // Close sort popover on outside click
  useEffect(() => {
    if (!showSortPopover) return;
    const handleClick = (e) => {
      if (sortBtnRef.current && !sortBtnRef.current.contains(e.target)) {
        setShowSortPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSortPopover]);

  const handleSortSelect = useCallback((colKey) => {
    if (hook.sortColumn === colKey) {
      // Toggle direction
      hook.setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      hook.setSortColumn(colKey);
      hook.setSortDirection('asc');
    }
    setShowSortPopover(false);
  }, [hook.sortColumn, hook.setSortColumn, hook.setSortDirection]);

  // Header click: none → asc → desc → clear
  const handleColumnSort = useCallback((colKey) => {
    if (hook.sortColumn !== colKey) {
      hook.setSortColumn(colKey);
      hook.setSortDirection('asc');
    } else if (hook.sortDirection === 'asc') {
      hook.setSortDirection('desc');
    } else {
      hook.setSortColumn('creationDate');
      hook.setSortDirection('desc');
    }
  }, [hook.sortColumn, hook.sortDirection, hook.setSortColumn, hook.setSortDirection]);

  const handleClearSort = useCallback(() => {
    hook.setSortColumn('creationDate');
    hook.setSortDirection('desc');
    setShowSortPopover(false);
  }, [hook.setSortColumn, hook.setSortDirection]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hook.hasMore && !hook.loadingMore) {
      hook.loadMore();
    }
  }, [hook.hasMore, hook.loadingMore, hook.loadMore]);

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col" data-testid="list-view">
        {/* White content card with rounded top-left corner */}
        <div className="flex-1 flex flex-col bg-white rounded-tl-2xl overflow-hidden min-h-0">
          {/* Selection bar or filter bar */}
          {selectedRows.length > 0 ? (
            <div className={`flex items-center justify-between ${listbarPaddingX} ${listbarPaddingY} border-b border-border/30`}>
              <div className="flex items-center gap-3 h-10">
                <span role="status" className="text-sm font-semibold" data-testid="selection-count">{ui('selected').replace('{count}', selectedRows.length)}</span>
              </div>
              <div className="flex items-center gap-2 h-10">
                {!(listViewOptions?.hideEye ?? hideEyeCount) && (
                  <Button
                    variant="outline"
                    size={selectionBarSize}
                    className="gap-1.5"
                    onClick={() => setShowDocPrint(true)}
                    data-testid="Button__620cbc">
                    <Eye className={iconSizeClass(selectionBarSize)} data-testid="Eye__620cbc" />
                    {ui('preview')}
                  </Button>
                )}
                {!(listViewOptions?.hidePrint ?? hidePrint) && (
                  <Button
                    size={selectionBarSize}
                    className="gap-1.5"
                    onClick={() => printDocuments(windowName, selectedRows.map(r => r.id || r), token)}
                    data-testid="Button__620cbc">
                    <Printer className={iconSizeClass(selectionBarSize)} data-testid="Printer__620cbc" />
                    {ui('print')} ({selectedRows.length})
                  </Button>
                )}
                {onCloneRow && (
                  <Button
                    variant="outline"
                    size={selectionBarSize}
                    className="gap-1.5"
                    onClick={() => onCloneRow(selectedRows)}
                    data-testid="Button__620cbc">
                    <Copy className={iconSizeClass(selectionBarSize)} data-testid="Copy__620cbc" />
                    {ui('cloneOrderBtn')} ({selectedRows.length})
                  </Button>
                )}
                {bulkActions && bulkActions({ selectedRows, clearSelection, token, apiBaseUrl, windowName, api })}
                {selectionBarRightActions && selectionBarRightActions({
                  selectedRows,
                  clearSelection,
                  token,
                  apiBaseUrl,
                  onDataMutated: hook.refresh,
                })}
              </div>
            </div>
          ) : (
            <div className={`flex items-center justify-between ${listbarPaddingX} ${listbarPaddingY}`}>
              <div className="flex items-center gap-2">
                {subsetFilters && (
                  <div role="group" aria-label="Filters" className="inline-flex items-center gap-1 rounded-xl bg-[#F5F7F9] p-1 h-10">
                    {subsetFilters.map((sf, i) => (
                      <button
                        key={i}
                        onClick={() => selectSubset(i)}
                        data-testid={`filter-${sf.key || sf.label?.toLowerCase()}`}
                        className={[
                          'h-8 px-3 text-sm font-medium text-[#121217] rounded-lg transition-all whitespace-nowrap',
                          activeSubsetIndex === i
                            ? 'bg-white shadow-sm'
                            : 'bg-[#F5F7F9] hover:brightness-95',
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
                          'h-9 px-3 text-xs rounded-lg border bg-white transition-colors',
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
                  columns={tableColumns}
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
                <div className="relative" ref={sortBtnRef}>
                  <SortToggleButton
                    SortIconComponent={SortIconComponent}
                    isDefaultSort={isDefaultSort}
                    iconButtonHover={iconButtonHover}
                    onToggle={() => setShowSortPopover(v => !v)}
                    data-testid="SortToggleButton__620cbc" />
                  {showSortPopover && tableColumns.length > 0 && (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-lg py-1">
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground tracking-wide">
                        {ui('sortBy')}
                      </div>
                      {tableColumns.filter(col => col.sortable !== false).map(col => {
                        const colLabel = t(col.column) ?? col.label ?? col.key;
                        const isActive = hook.sortColumn === col.key;
                        return (
                          <button
                            key={col.key}
                            onClick={() => handleSortSelect(col.key)}
                            className={[
                              'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                              isActive ? 'bg-primary/5 text-foreground font-medium' : 'text-foreground hover:bg-muted/50',
                            ].join(' ')}
                          >
                            <span className="w-4 text-center text-xs">
                              {isActive ? (hook.sortDirection === 'asc' ? '\u25B2' : '\u25BC') : ''}
                            </span>
                            <span className="flex-1 text-left">{colLabel}</span>
                          </button>
                        );
                      })}
                      {!isDefaultSort && (
                        <>
                          <div className="border-t border-border/50 my-1" />
                          <button
                            onClick={handleClearSort}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                          >
                            <span className="w-4" />
                            <span className="flex-1 text-left">{ui('clearSort')}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <RefreshButton
                  RefreshIconComponent={RefreshIconComponent}
                  iconButtonHover={iconButtonHover}
                  onRefresh={() => hook.refresh()}
                  label={ui('refresh')}
                  data-testid="RefreshButton__620cbc" />
                {!(listViewOptions?.hidePrint ?? hidePrint) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-white"
                    onClick={() => setShowReport(true)}
                    data-testid="Button__620cbc">
                    <Printer className="h-3.5 w-3.5" data-testid="Printer__620cbc" />
                    {ui('print')}
                  </Button>
                )}
                {/* Split "New" button */}
                {!hideCreate && (
                  <div className="inline-flex items-stretch rounded-lg overflow-hidden shadow-sm ml-3">
                    <Button
                      className="rounded-none rounded-l-lg gap-1.5 px-4 hover:bg-[#FFD500] hover:text-[#121217] transition-colors"
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
                              className="rounded-none rounded-r-lg px-2 hover:bg-[#FFD500] hover:text-[#121217] transition-colors"
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
                ? headerContent({ api, token, apiBaseUrl, items: hook.items, loading: hook.loading })
                : headerContent}
            </div>
          )}

          {/* Indeterminate top progress bar — visible while refreshing existing data */}
          {hook.loading && hook.items.length > 0 && (
            <>
              <div role="progressbar" className="h-0.5 w-full overflow-hidden bg-primary/10" data-testid="list-progress-bar">
                <div
                  className="h-full w-1/3 bg-primary"
                  style={{ animation: 'sf-list-progress 1.1s ease-in-out infinite' }}
                />
              </div>
              <style>{`@keyframes sf-list-progress { 0% { transform: translateX(-100%) } 100% { transform: translateX(400%) } }`}</style>
            </>
          )}

          {/* Table */}
          <div ref={scrollRef} onScroll={handleScroll} className={`flex-1 overflow-auto ${tablePaddingX} ${tablePaddingBottom}`}>
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
                  : (
                    <Table
                      entity={entity}
                      specName={windowName}
                      data={hook.items}
                      onNavigate={buildRowNavigateHandler(renderPreview, setPreviewRow, navigate, windowName)}
                      onSelectionChange={setSelectedRows}
                      onDataMutated={hook.refresh}
                      isRowSelectable={isRowSelectable}
                      compact={false}
                      sortColumn={hook.sortColumn}
                      sortDirection={hook.sortDirection}
                      onSort={handleColumnSort}
                      onColumnsReady={setTableColumns}
                      api={api}
                      token={token}
                      apiBaseUrl={apiBaseUrl}
                      labelOverrides={labelOverrides}
                      onFilterChange={handleFilterChange}
                      onClearAllFilters={handleClearAllFilters}
                      columnFilters={columnFilters}
                      onCloneRow={onCloneRow}
                      rowFilter={effectiveRowFilter}
                      hoverRowActions={hoverRowActions}
                      clearSelectionTrigger={clearSelectionCounter}
                      rowQuickActions={effectiveRowQuickActions}
                      hiddenColumns={hiddenColumns}
                      data-testid="Table__620cbc" />
                  )
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
          </div>
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
        <DocumentPrintDrawer
          open={showDocPrint}
          onClose={() => setShowDocPrint(false)}
          windowName={windowName}
          documentIds={selectedRows.map(r => r.id || r)}
          token={token}
          data-testid="DocumentPrintDrawer__620cbc" />
        {quickActionsEnabled && !rowQuickActions?.onDelete && defaultDeleteDialog}
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
      </div>
      {activePreviewRow && renderPreview?.({
        row: activePreviewRow,
        onClose: handlePreviewClose,
        onEdit: handlePreviewEdit,
      })}
    </>
  );
}

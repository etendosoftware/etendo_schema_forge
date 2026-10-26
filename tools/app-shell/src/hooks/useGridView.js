import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useApiFetch } from '@/auth/useApiFetch.js';

const SCHEMA_VERSION = 1;
const MIN_COLUMN_WIDTH = 0;
const MAX_COLUMN_WIDTH = 1200;

export function gridViewColumnId(column) {
  const source = typeof column?.column === 'string' && column.column
    ? `ad:${column.column}:field:${column.key ?? ''}`
    : `field:${column?.key ?? ''}`;
  return `list:${source}`;
}

function resolveUpdater(updater, value) {
  return typeof updater === 'function' ? updater(value) : updater;
}

function clampWidth(value) {
  if (value == null || typeof value === 'boolean') return null;
  const width = Number(value);
  if (!Number.isFinite(width) || width < 0) return null;
  return Math.round(Math.min(MAX_COLUMN_WIDTH, width));
}

function canCustomizeWidth(column) {
  return column.gridConfigurable !== false
    && column.headClass == null
    && column.cellClass == null;
}

function normalizeView(raw, columns) {
  if (!raw || typeof raw !== 'object' || raw.version !== SCHEMA_VERSION || raw.surface !== 'list' || !Array.isArray(raw.columns)) {
    return null;
  }

  const available = new Map(columns.map((column) => [gridViewColumnId(column), column]));
  const stored = new Map();
  for (const item of raw.columns) {
    if (!item || typeof item.id !== 'string' || !available.has(item.id) || stored.has(item.id)) continue;
    stored.set(item.id, item);
  }

  const order = [];
  const visibility = {};
  const sizing = {};
  for (const column of columns) {
    const id = gridViewColumnId(column);
    const item = stored.get(id);
    if (!item) {
      order.push(id);
      continue;
    }
    const canHide = column.gridConfigurable !== false && column.required !== true
      && column.headClass == null && column.cellClass == null;
    if (item.visible === false && canHide) visibility[id] = false;
    const width = clampWidth(item.width);
    if (width !== null && canCustomizeWidth(column)) sizing[id] = width;
    order.push({ id, order: Number.isFinite(item.order) ? item.order : Number.MAX_SAFE_INTEGER });
  }

  const ordered = order
    .filter((item) => typeof item !== 'string')
    .sort((a, b) => a.order - b.order)
    .map((item) => item.id);
  const orderedSet = new Set(ordered);
  for (const item of order) {
    if (typeof item === 'string' && !orderedSet.has(item)) ordered.push(item);
  }

  if (ordered.length > 0 && ordered.every((id) => visibility[id] === false)) {
    delete visibility[ordered[0]];
  }
  return { columnOrder: ordered, columnVisibility: visibility, columnSizing: sizing };
}

function serializeView(state, columns) {
  const indexById = new Map(state.columnOrder.map((id, index) => [id, index]));
  return {
    version: SCHEMA_VERSION,
    surface: 'list',
    columns: columns.map((column) => {
      const id = gridViewColumnId(column);
      const width = canCustomizeWidth(column) ? state.columnSizing[id] : undefined;
      return {
        id,
        visible: state.columnVisibility[id] !== false,
        order: indexById.get(id) ?? columns.indexOf(column),
        ...(width != null ? { width } : {}),
      };
    }),
  };
}

function isViewPayload(value) {
  return value && typeof value === 'object'
    && value.version === SCHEMA_VERSION
    && value.surface === 'list'
    && Array.isArray(value.columns);
}

/** Personal list-column view state. The backend derives user identity from the session. */
export function useGridView({ spec, entity, columns, data, enabled, apiBaseUrl }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const scope = spec && entity
    ? `/sws/neo/grid-views/${encodeURIComponent(spec)}/${encodeURIComponent(entity)}`
    : null;
  const ids = useMemo(() => columns.map(gridViewColumnId), [columns]);
  const columnsRef = useRef(columns);
  const idsRef = useRef(ids);
  const [retryCount, setRetryCount] = useState(0);
  const [readyScope, setReadyScope] = useState(null);
  const [readyRetryCount, setReadyRetryCount] = useState(-1);
  columnsRef.current = columns;
  idsRef.current = ids;
  const [state, setState] = useState({ columnOrder: [], columnVisibility: {}, columnSizing: {} });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    if (!enabled || !scope) return undefined;
    let active = true;
    setLoading(true);
    setLoadError(false);
    // This endpoint is rooted at the shared NEO API, not at the current window
    // resource (`apiBaseUrl` is typically `/sws/neo/<spec>`). Passing the full
    // path without overriding the helper base duplicates `/sws/neo/<spec>`.
    apiFetch(scope, { baseUrl: '' })
      .then(async (response) => {
        if (!response.ok) throw new Error('grid-view-load-failed');
        if (response.status === 204) return null;
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        if (payload == null || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
          const defaults = { columnOrder: [...idsRef.current], columnVisibility: {}, columnSizing: {} };
          setState(defaults);
          setSavedSnapshot(JSON.stringify(defaults));
          setReadyScope(scope);
          setReadyRetryCount(retryCount);
          return;
        }
        const normalized = normalizeView(payload, columnsRef.current);
        if (!normalized) throw new Error('grid-view-invalid-response');
        setState(normalized);
        setSavedSnapshot(JSON.stringify(normalized));
        setReadyScope(scope);
        setReadyRetryCount(retryCount);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [apiFetch, enabled, scope, retryCount]);

  const columnsById = useMemo(() => new Map(columns.map((column) => [gridViewColumnId(column), column])), [columns]);
  const definitions = useMemo(() => columns.map((column) => {
    const id = gridViewColumnId(column);
    const isConfigurable = column.gridConfigurable !== false && column.required !== true
      && column.headClass == null && column.cellClass == null;
    const canResize = canCustomizeWidth(column);
    const minSize = MIN_COLUMN_WIDTH;
    const size = state.columnSizing[id] ?? column.gridDefaultWidthPx;
    return {
      id,
      accessorKey: column.key,
      ...(size != null ? { size } : {}),
      minSize,
      maxSize: MAX_COLUMN_WIDTH,
      enableHiding: isConfigurable,
      enableResizing: canResize,
      meta: {
        source: column,
        reorderable: column.gridReorderable !== false && column.headClass == null && column.cellClass == null,
      },
    };
  }), [columns, state.columnSizing]);

  const onColumnOrderChange = useCallback((updater) => {
    setState((previous) => ({ ...previous, columnOrder: resolveUpdater(updater, previous.columnOrder) }));
    setSaveState('dirty');
  }, []);
  const onColumnVisibilityChange = useCallback((updater) => {
    setState((previous) => {
      const next = resolveUpdater(updater, previous.columnVisibility);
      const visibleCount = ids.filter((id) => next[id] !== false).length;
      if (visibleCount === 0 && ids.length) return previous;
      return { ...previous, columnVisibility: next };
    });
    setSaveState('dirty');
  }, [ids]);
  const onColumnSizingChange = useCallback((updater) => {
    setState((previous) => ({ ...previous, columnSizing: resolveUpdater(updater, previous.columnSizing) }));
    setSaveState('dirty');
  }, []);

  const table = useReactTable({
    data,
    columns: definitions,
    state,
    onColumnOrderChange,
    onColumnVisibilityChange,
    onColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => String(row?.id ?? index),
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    columnResizeMode: 'onChange',
  });

  const visibleIds = table.getVisibleLeafColumns().map((column) => column.id);
  const effectiveColumns = table.getVisibleLeafColumns().map((column) => {
    const original = columnsById.get(column.id);
    if (!original) return null;
    const width = state.columnSizing[column.id];
    return {
      ...original,
      gridViewId: column.id,
      ...(width != null ? { gridUserWidthPx: width, headerWrap: true, grow: false } : {}),
    };
  }).filter(Boolean);

  const dirty = JSON.stringify(state) !== savedSnapshot;
  const ready = Boolean(enabled && scope && readyScope === scope && readyRetryCount === retryCount && !loading && !loadError);
  const save = useCallback(async () => {
    if (!scope || !ready) return false;
    setSaveState('saving');
    const payload = serializeView(state, columns);
    try {
      const response = await apiFetch(scope, { baseUrl: '', method: 'PUT', body: JSON.stringify(payload) });
      if (response.status === 204) {
        setSavedSnapshot(JSON.stringify(state));
        setSaveState('saved');
        return true;
      }
      if (!response.ok || response.status !== 200) throw new Error('grid-view-save-failed');
      const echoed = await response.json();
      if (!isViewPayload(echoed)) throw new Error('grid-view-invalid-response');
      const normalized = normalizeView(echoed, columns);
      if (!normalized) throw new Error('grid-view-invalid-response');
      const acceptedSnapshot = JSON.stringify(normalized);
      setState((current) => JSON.stringify(current) === JSON.stringify(state) ? normalized : current);
      setSavedSnapshot(JSON.stringify(state) === JSON.stringify(normalized) ? acceptedSnapshot : JSON.stringify(state));
      setSaveState('saved');
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }, [apiFetch, columns, ready, scope, state]);

  const moveColumn = useCallback((sourceId, targetId) => {
    if (!ready) return;
    const current = table.getState().columnOrder;
    const from = current.indexOf(sourceId);
    const to = current.indexOf(targetId);
    if (from < 0 || to < 0 || sourceId === targetId) return;
    const lower = Math.min(from, to);
    const upper = Math.max(from, to);
    if (current.slice(lower, upper + 1).some((id) => !table.getColumn(id)?.columnDef.meta?.reorderable)) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    table.setColumnOrder(next);
    setAnnouncement({ id: sourceId, position: to + 1, count: current.length });
  }, [ready, table]);

  return {
    enabled,
    active: ready,
    table,
    columns: effectiveColumns,
    availableIds: columns.map(gridViewColumnId),
    availableKeys: columns.map((column) => column.key),
    visibleIds,
    columnOrder: state.columnOrder,
    columnVisibility: state.columnVisibility,
    columnSizing: state.columnSizing,
    loading,
    loadError,
    saveState,
    dirty,
    save,
    moveColumn,
    moveByKeyboard: (id, direction) => {
      if (!table.getColumn(id)?.columnDef.meta?.reorderable) return;
      const current = table.getState().columnOrder;
      const from = current.indexOf(id);
      const to = Math.max(0, Math.min(current.length - 1, from + direction));
      if (from < 0 || from === to) return;
      moveColumn(id, current[to]);
    },
    announcement,
    retryLoad: () => {
      setReadyScope(null);
      setReadyRetryCount(-1);
      setRetryCount((count) => count + 1);
    },
    resizeBy: (id, delta) => {
      if (!ready) return;
      const column = table.getColumn(id);
      if (!column?.getCanResize()) return;
      const min = column.columnDef.minSize ?? MIN_COLUMN_WIDTH;
      const max = column.columnDef.maxSize ?? MAX_COLUMN_WIDTH;
      const nextWidth = Math.max(min, Math.min(max, column.getSize() + delta));
      table.setColumnSizing((previous) => ({ ...previous, [id]: nextWidth }));
    },
    reorderable: (id) => {
      const column = table.getColumn(id);
      return Boolean(column?.columnDef.meta?.reorderable);
    },
    isResizable: (id) => Boolean(table.getColumn(id)?.getCanResize()),
    widthBounds: (id) => {
      const column = table.getColumn(id);
      return { min: column?.columnDef.minSize ?? MIN_COLUMN_WIDTH, max: column?.columnDef.maxSize ?? MAX_COLUMN_WIDTH };
    },
    resizeHandler: (id) => table.getFlatHeaders()
      .find((header) => header.column.id === id)
      ?.getResizeHandler(),
    setVisibility: (id, visible) => {
      if (!ready) return;
      table.setColumnVisibility((previous) => ({ ...previous, [id]: visible }));
    },
    canHide: (id) => Boolean(table.getColumn(id)?.getCanHide()),
    labelFor: (id) => columnsById.get(id)?.column ?? columnsById.get(id)?.label ?? columnsById.get(id)?.key ?? id,
  };
}

export const GRID_VIEW_LIMITS = Object.freeze({ minWidth: MIN_COLUMN_WIDTH, maxWidth: MAX_COLUMN_WIDTH });

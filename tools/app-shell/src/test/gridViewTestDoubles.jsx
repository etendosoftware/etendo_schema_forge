// Shared test doubles for the personal grid-view boundary (flag, useGridView hook, controls, apiFetch).
// Use through `vi.hoisted(async () => (await import(...)).createGridBoundary())` and async `vi.mock`
// factories, since `vi.mock` is hoisted above static imports.
import React, { useMemo } from 'react';
import { vi } from 'vitest';

export function createGridBoundary() {
  return { enabled: false, active: false, keys: null, widths: {}, last: null, save: vi.fn() };
}

export function resetGridBoundary(boundary) {
  boundary.enabled = false;
  boundary.active = false;
  boundary.keys = null;
  boundary.widths = {};
  boundary.save.mockClear();
}

/** `@/lib/flags` double: `isEnabled` is read on every render, so tests can flip it. */
export function gridFlagsMock(isEnabled) {
  return { GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => isEnabled() };
}

/** `@/hooks/useGridView.js` double driven by the boundary (order, widths, active). */
export function gridViewHookMock(boundary) {
  return {
    useGridView: (options) => {
      boundary.last = options;
      const columns = (boundary.keys ?? options.columns.map(column => column.key))
        .map(key => options.columns.find(column => column.key === key)).filter(Boolean)
        .map(column => ({ ...column, gridViewId: column.key, gridUserWidthPx: boundary.widths[column.key] }));
      return { active: options.enabled && boundary.active, columns, columnSizing: boundary.widths, save: boundary.save,
        reorderable: () => false, isResizable: () => false };
    },
  };
}

export function gridViewControlsMock() {
  return {
    GridViewControls: ({ gridView }) => <button data-testid="grid-view-save" onClick={gridView.save}>gridViewSave</button>,
  };
}

/** `@/auth/useApiFetch.js` double that forwards to the mock returned by `getApiFetchMock()` at call time. */
export function apiFetchHookMock(getApiFetchMock) {
  return {
    useApiFetch: (baseUrl = '') => useMemo(() => (path, options = {}) =>
      getApiFetchMock()(`${options.baseUrl ?? baseUrl}${path}`, options), [baseUrl]),
  };
}

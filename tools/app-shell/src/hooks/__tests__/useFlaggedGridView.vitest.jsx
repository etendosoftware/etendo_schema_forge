// @covers tools/app-shell/src/hooks/useFlaggedGridView.js
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const boundary = vi.hoisted(() => ({ flag: false, received: null }));
vi.mock('@/lib/flags', () => ({ GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => boundary.flag }));
vi.mock('@/hooks/useGridView.js', () => ({
  useGridView: (options) => { boundary.received = options; return { active: false }; },
}));

import { useFlaggedGridView } from '../useFlaggedGridView.js';

describe('useFlaggedGridView', () => {
  beforeEach(() => { boundary.flag = false; boundary.received = null; });

  it.each([
    { flag: true, extra: undefined, expected: true },
    { flag: true, extra: true, expected: true },
    { flag: true, extra: false, expected: false },
    { flag: false, extra: true, expected: false },
  ])('enables the view only when the flag and the extra condition hold: %j', ({ flag, extra, expected }) => {
    boundary.flag = flag;
    const { result } = renderHook(() => useFlaggedGridView({ spec: 's', entity: 'e', columns: [], data: [], apiBaseUrl: '/api', enabled: extra }));
    expect(boundary.received.enabled).toBe(expected);
    expect(result.current.gridColumnViews).toBe(flag);
  });

  it('forwards the scope, columns, data and base url untouched', () => {
    boundary.flag = true;
    const columns = [{ key: 'a' }];
    const data = [{ id: '1' }];
    renderHook(() => useFlaggedGridView({ spec: 'sales-order', entity: 'lines', columns, data, apiBaseUrl: '/sws/neo/sales-order' }));
    expect(boundary.received).toMatchObject({ spec: 'sales-order', entity: 'lines', columns, data, apiBaseUrl: '/sws/neo/sales-order' });
  });
});

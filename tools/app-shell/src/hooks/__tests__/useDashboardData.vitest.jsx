import { renderHook, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';
import { useDashboardData } from '../useDashboardData';

// Mock external dependencies
vi.mock('@generated/dashboard/generated/config', () => ({
  kpisConfig: [
    { key: 'revenue', label: 'Revenue', icon: 'DollarSign' },
    { key: 'orders', label: 'Orders', icon: 'ShoppingCart' },
  ],
  actions: [{ id: 'a1', label: 'Action 1' }],
}));

vi.mock('@/auth/AuthContext', () => ({
  // ETP-5088 — widget visibility now decides what this hook fetches at all. These suites are
  // about the mapping, not the gating, so they run as a client-admin (every gate open), which is
  // exactly how they behaved before the gating landed. The gating itself is covered by
  // `src/lib/__tests__/dashboardWidgetAccess.test.js` and `pages/__tests__/DashboardPage.vitest.jsx`.
  useAuth: () => ({
    token: 'test-token',
    windowAccess: {},
    capabilities: { isAdminOrClientAdmin: true },
  }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

vi.mock('@/lib/dashboardNavigation.js', () => ({
  createDashboardNavigation: (opts) => ({ ...opts }),
}));

vi.mock('@/components/dashboard/DashboardDateRangeContext', () => ({
  useDashboardDateRange: () => ({ range: 'month' }),
}));

describe('useDashboardData', () => {
  beforeEach(() => {
    // Mock window.location for getApiBase()
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockAllEndpointsOk(overrides = {}) {
    globalThis.fetch.mockImplementation(async (url) => {
      const entity = url.split('/dashboard/')[1]?.split('?')[0];
      const defaults = {
        kpis: { response: { data: [{ key: 'revenue', value: 1000, trend: 10 }, { key: 'orders', value: 50, trend: 5 }] } },
        trends: { response: { data: [{ labels: ['Jan', 'Feb'], values: [100, 200], expenseValues: [50, 80] }] } },
        'pending-tasks': { response: { data: [{ type: 'warning', text: 'Overdue invoices', count: 3 }] } },
        activity: { response: { data: [{ id: '1', author: 'Admin', text: 'Hello', type: 'note' }] } },
        'recent-invoices': { response: { data: [] } },
        'best-products': { response: { data: [{ name: 'Widget', qty: 10, amount: 500 }] } },
        'best-sellers': { response: { data: [{ name: 'Gadget', qty: 20, uom: 'pcs' }] } },
        'pending-amounts': { response: { data: { toCollect: { count: 2, amount: 1000 }, toPay: { count: 1, amount: 500 } } } },
        'top-clients': { response: { data: [{ id: 'c1', name: 'Client A', total: 5000 }] } },
      };
      const data = overrides[entity] ?? defaults[entity] ?? { response: { data: [] } };
      return { ok: true, json: async () => data };
    });
  }

  it('returns loading=true initially then resolves', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('fetches from correct endpoints with range param', async () => {
    mockAllEndpointsOk();
    renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    // ETP-5011: kpis is always a calendar-year figure and does not follow the
    // date-range selector, so it must be fetched WITHOUT the `range` query param.
    expect(urls.some(u => u.includes('/sws/neo/dashboard/kpis') && !u.includes('range='))).toBe(true);
    expect(urls.some(u => u.includes('/sws/neo/dashboard/trends?range=month'))).toBe(true);
    expect(urls.some(u => u.includes('/sws/neo/dashboard/pending-tasks?range=month'))).toBe(true);
  });

  it('maps KPI data correctly', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.kpis).toHaveLength(2);
    expect(result.current.kpis[0].key).toBe('revenue');
    expect(result.current.kpis[0].value).toBe(1000);
    expect(result.current.kpis[0].trend).toBe(10);
  });

  it('maps trend data correctly', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.revenueTrend.labels).toEqual(['Jan', 'Feb']);
    expect(result.current.revenueTrend.values).toEqual([100, 200]);
  });

  it('maps pending tasks', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pendingTasks).toHaveLength(1);
    expect(result.current.pendingTasks[0].type).toBe('warning');
  });

  it('maps top clients with navigation fallback', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.topClients).toHaveLength(1);
    expect(result.current.topClients[0].name).toBe('Client A');
    expect(result.current.topClients[0].navigation).toBeTruthy();
  });

  it('maps pending amounts', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pendingAmounts.toCollect.count).toBe(2);
    expect(result.current.pendingAmounts.toPay.amount).toBe(500);
  });

  it('returns empty fallback when all endpoints fail', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.kpis).toHaveLength(2);
    expect(result.current.kpis[0].value).toBe(0);
    expect(result.current.pendingTasks).toEqual([]);
    expect(result.current.pendingAmounts.toCollect.count).toBe(0);
  });

  it('exposes actions from config', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.actions).toEqual([{ id: 'a1', label: 'Action 1' }]);
  });

  it('exposes a refresh function', async () => {
    mockAllEndpointsOk();
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refresh).toBe('function');
  });

  it('handles non-ok HTTP response gracefully', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
    });
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // All widgets failed, should get empty fallback
    expect(result.current.kpis[0].value).toBe(0);
  });

  it('handles response without response.data field', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: true }),
    });
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // fetchWidget returns null for unexpected shape, so all endpoints "fail"
    expect(result.current.kpis[0].value).toBe(0);
  });
});

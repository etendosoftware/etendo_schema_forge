import { renderHook, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';
import { useDashboardData } from '../useDashboardData';

// ETP-5493: the Financial Summary (`kpis`) follows the period selector. The range is mutable here
// so the tests can change it and rerender, which the sibling suite (fixed 'month') cannot do.
let mockRange = 'mtd';

vi.mock('@generated/dashboard/generated/config', () => ({
  kpisConfig: [
    { key: 'revenue', label: 'Revenue', icon: 'DollarSign' },
    { key: 'orders', label: 'Orders', icon: 'ShoppingCart' },
  ],
  actions: [],
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    token: 'test-token',
    windowAccess: {},
    capabilities: { isAdminOrClientAdmin: true },
  })),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

vi.mock('@/lib/dashboardNavigation.js', () => ({
  createDashboardNavigation: (opts) => ({ ...opts }),
}));

vi.mock('@/components/dashboard/DashboardDateRangeContext', () => ({
  useDashboardDateRange: () => ({ range: mockRange }),
}));

describe('useDashboardData — kpis follow the period selector (ETP-5493)', () => {
  let kpisData;

  beforeEach(() => {
    mockRange = 'mtd';
    kpisData = [
      { key: 'revenue', value: 1000, trend: 10, hasPrevious: true },
      { key: 'orders', value: 50, trend: 0, hasPrevious: false },
    ];
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn(async (url) => {
      const entity = url.split('/dashboard/')[1]?.split('?')[0];
      const data = entity === 'kpis' ? kpisData : [];
      return { ok: true, json: async () => ({ response: { data } }) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const kpisUrls = () =>
    globalThis.fetch.mock.calls.map((c) => c[0]).filter((u) => u.includes('/sws/neo/dashboard/kpis'));

  it('passes hasPrevious through from the handler', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kpis[0].hasPrevious).toBe(true);
    expect(result.current.kpis[1].hasPrevious).toBe(false);
  });

  it('defaults hasPrevious to true when an older handler does not send the flag', async () => {
    kpisData = [
      { key: 'revenue', value: 1000, trend: 10 },
      { key: 'orders', value: 50, trend: 5 },
    ];
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kpis.map((k) => k.hasPrevious)).toEqual([true, true]);
  });

  it('marks a configured kpi missing from the handler response as hasPrevious=false', async () => {
    kpisData = [{ key: 'revenue', value: 1000, trend: 10, hasPrevious: true }];
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kpis[1]).toMatchObject({ key: 'orders', value: 0, hasPrevious: false });
  });

  it('marks every fallback kpi as hasPrevious=false when the kpis request fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kpis.every((k) => k.hasPrevious === false)).toBe(true);
  });

  it('exposes kpisRange equal to the range the data was fetched with', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.kpisRange).toBe('mtd');
    expect(kpisUrls().some((u) => u.includes('kpis?range=mtd'))).toBe(true);
  });

  it('re-issues the kpis request with the new range when the range changes', async () => {
    const { result, rerender } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(kpisUrls().every((u) => u.includes('range=mtd'))).toBe(true);

    mockRange = 'last90d';
    rerender();

    await waitFor(() => {
      expect(kpisUrls().some((u) => u.includes('kpis?range=last90d'))).toBe(true);
    });
    await waitFor(() => expect(result.current.kpisRange).toBe('last90d'));
  });
});

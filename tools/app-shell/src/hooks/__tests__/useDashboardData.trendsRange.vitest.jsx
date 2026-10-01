import { renderHook, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';
import { useDashboardData } from '../useDashboardData';

// ETP-5493: the revenue trend ("Evolucion financiera", `trends`) follows the period selector.
let mockRange = 'last30d';

vi.mock('@generated/dashboard/generated/config', () => ({
  kpisConfig: [{ key: 'revenue', label: 'Revenue', icon: 'DollarSign' }],
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

describe('useDashboardData — trends follow the period selector (ETP-5493)', () => {
  let trendsData;

  beforeEach(() => {
    mockRange = 'last30d';
    trendsData = [
      {
        labels: ['2026-09-01', '2026-09-02'],
        values: [100, 200],
        expenseValues: [10, 20],
        dates: ['2026-09-01', '2026-09-02'],
        granularity: 'day',
        growthPct: 4113.8,
        hasPrevious: true,
      },
    ];
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn(async (url) => {
      const entity = url.split('/dashboard/')[1]?.split('?')[0];
      const data = entity === 'trends' ? trendsData : [];
      return { ok: true, json: async () => ({ response: { data } }) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const trendsUrls = () =>
    globalThis.fetch.mock.calls.map((c) => c[0]).filter((u) => u.includes('/sws/neo/dashboard/trends'));

  it('passes dates, granularity, growthPct and hasPrevious through from the handler', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.revenueTrend).toMatchObject({
      labels: ['2026-09-01', '2026-09-02'],
      values: [100, 200],
      dates: ['2026-09-01', '2026-09-02'],
      granularity: 'day',
      growthPct: 4113.8,
      hasPrevious: true,
    });
  });

  it('exposes the range the data was fetched with', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.revenueTrend.range).toBe('last30d');
    expect(trendsUrls().some((u) => u.includes('trends?range=last30d'))).toBe(true);
  });

  it('falls back to safe defaults when an older backend omits the new fields', async () => {
    trendsData = [{ labels: ['Jan', 'Feb'], values: [100, 200] }];
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.revenueTrend).toMatchObject({
      dates: null,
      granularity: null,
      growthPct: 0,
      hasPrevious: false,
    });
  });

  it('coerces a non-numeric growthPct to 0 and a non-true hasPrevious to false', async () => {
    trendsData = [{ labels: ['Jan'], values: [100], growthPct: 'oops', hasPrevious: 'yes', dates: 'nope', granularity: 5 }];
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.revenueTrend).toMatchObject({
      growthPct: 0,
      hasPrevious: false,
      dates: null,
      granularity: null,
    });
  });

  it('accepts a numeric-string growthPct', async () => {
    trendsData = [{ labels: ['Jan'], values: [100], growthPct: '12.5', hasPrevious: true }];
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.revenueTrend.growthPct).toBe(12.5);
  });

  it('re-issues the trends request with the new range when the range changes', async () => {
    const { result, rerender } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(trendsUrls().every((u) => u.includes('range=last30d'))).toBe(true);

    mockRange = 'ytd';
    rerender();

    await waitFor(() => {
      expect(trendsUrls().some((u) => u.includes('trends?range=ytd'))).toBe(true);
    });
    await waitFor(() => expect(result.current.revenueTrend.range).toBe('ytd'));
  });
});

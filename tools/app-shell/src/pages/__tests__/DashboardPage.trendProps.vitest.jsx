import { render, screen } from '@testing-library/react';

// ETP-5493: the page must forward the period-aware trend fields to the chart untouched.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    username: 'testuser',
    logout: () => {},
    windowAccess: {},
    capabilities: { isAdminOrClientAdmin: true },
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));
vi.mock('@/components/CopilotContext', () => ({ useCopilot: () => ({ open: vi.fn() }) }));
vi.mock('@/hooks/useCurrency.jsx', () => ({ useCurrency: () => 'EUR' }));

const TREND = vi.hoisted(() => ({
  labels: ['2026-09-01', '2026-09-02'],
  values: [100, 200],
  dates: ['2026-09-01', '2026-09-02'],
  granularity: 'day',
  growthPct: 4113.8,
  hasPrevious: true,
  range: 'last30d',
}));

vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    kpis: [{ key: 'revenue', label: 'Revenue', value: 1000, icon: 'DollarSign' }],
    revenueTrend: TREND,
    expenseTrend: [10, 20],
    topClients: [],
    pendingTasks: [],
    recentInvoices: [],
    bestProducts: [],
    bestSellers: [],
    pendingAmounts: { collections: 0, payments: 0 },
    loading: false,
  }),
}));

vi.mock('@/lib/dashboardNavigation.js', () => ({ resolveDashboardNavigation: vi.fn() }));
vi.mock('@/lib/dashboardNumberFormat.js', () => ({ localeFromUi: () => 'en-US' }));
vi.mock('@/components/dashboard/DashboardDateRangeContext', () => ({
  DashboardDateRangeProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/dashboard/DashboardGreeting', () => ({ DashboardGreeting: () => <div /> }));
vi.mock('@/components/dashboard/PendingTasksRail', () => ({ PendingTasksRail: () => <div /> }));
vi.mock('@/components/dashboard/QuickActionsList', () => ({ QuickActionsList: () => <div /> }));
vi.mock('@/components/dashboard/TopClientsList', () => ({ TopClientsList: () => <div /> }));
vi.mock('@/components/dashboard/FinancialSummaryCard', () => ({ FinancialSummaryCard: () => <div /> }));
vi.mock('@/components/dashboard/RecentSalesList', () => ({ RecentSalesList: () => <div /> }));
vi.mock('@/components/dashboard/CollectionsPaymentsCard', () => ({ CollectionsPaymentsCard: () => <div /> }));
vi.mock('@/components/dashboard/BestProductsList', () => ({ BestProductsList: () => <div /> }));
vi.mock('@/components/dashboard/DashboardSkeleton', () => ({ DashboardSkeleton: () => <div /> }));

vi.mock('@/components/dashboard/FinancialTrendChart', () => ({
  FinancialTrendChart: (props) => (
    <div
      data-testid="financial-trend"
      data-props={JSON.stringify({
        dates: props.dates,
        granularity: props.granularity,
        growthPct: props.growthPct,
        hasPrevious: props.hasPrevious,
        range: props.range,
        values: props.values,
        expenseValues: props.expenseValues,
        currencyLabel: props.currencyLabel,
      })}
    />
  ),
}));

vi.mock('lucide-react', () => ({
  FileText: (props) => <svg {...props} />,
  ShoppingCart: (props) => <svg {...props} />,
  Users: (props) => <svg {...props} />,
  DollarSign: (props) => <svg {...props} />,
  TrendingUp: (props) => <svg {...props} />,
}));

import DashboardPage from '../DashboardPage.jsx';

describe('DashboardPage — trend chart props (ETP-5493)', () => {
  it('forwards dates, granularity, growthPct, hasPrevious and range to the chart', () => {
    render(<DashboardPage />);
    const props = JSON.parse(screen.getByTestId('financial-trend').getAttribute('data-props'));

    expect(props.dates).toEqual(TREND.dates);
    expect(props.granularity).toBe('day');
    expect(props.growthPct).toBe(4113.8);
    expect(props.hasPrevious).toBe(true);
    expect(props.range).toBe('last30d');
  });

  it('keeps forwarding the legacy series props', () => {
    render(<DashboardPage />);
    const props = JSON.parse(screen.getByTestId('financial-trend').getAttribute('data-props'));

    expect(props.values).toEqual([100, 200]);
    expect(props.expenseValues).toEqual([10, 20]);
    expect(props.currencyLabel).toBe('EUR');
  });
});

import { render, screen } from '@testing-library/react';

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock auth
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token', username: 'testuser', logout: vi.fn() }),
}));

// Mock PageMetaContext
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

// Mock CopilotContext
vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ open: vi.fn() }),
}));

// Mock useCurrency
vi.mock('@/hooks/useCurrency.jsx', () => ({
  useCurrency: () => 'USD',
}));

// Mock useDashboardData
vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({
    kpis: [
      { key: 'revenue', label: 'Revenue', value: 1000, icon: 'DollarSign' },
    ],
    revenueTrend: { labels: ['Jan', 'Feb'], values: [100, 200] },
    expenseTrend: [50, 80],
    topClients: [{ id: '1', name: 'Client A', total: 500 }],
    pendingTasks: [{ id: '1', label: 'Task 1' }],
    recentInvoices: [{ id: '1', documentNo: 'INV-001' }],
    bestProducts: [{ id: '1', name: 'Product A' }],
    bestSellers: [{ id: '1', name: 'Seller A' }],
    pendingAmounts: { collections: 100, payments: 200 },
    loading: false,
  }),
}));

// Mock dashboard navigation
vi.mock('@/lib/dashboardNavigation.js', () => ({
  resolveDashboardNavigation: vi.fn(),
}));

vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  localeFromUi: () => 'en-US',
}));

// Mock DashboardDateRangeProvider
vi.mock('@/components/dashboard/DashboardDateRangeContext', () => ({
  DashboardDateRangeProvider: ({ children }) => <div data-testid="date-range-provider">{children}</div>,
}));

// Mock all dashboard sub-components
vi.mock('@/components/dashboard/DashboardGreeting', () => ({
  DashboardGreeting: ({ username }) => <div data-testid="greeting">{username}</div>,
}));

vi.mock('@/components/dashboard/PendingTasksRail', () => ({
  PendingTasksRail: () => <div data-testid="pending-tasks">PendingTasks</div>,
}));

vi.mock('@/components/dashboard/QuickActionsList', () => ({
  QuickActionsList: ({ actions }) => (
    <div data-testid="quick-actions">{actions?.length} actions</div>
  ),
}));

vi.mock('@/components/dashboard/TopClientsList', () => ({
  TopClientsList: () => <div data-testid="top-clients">TopClients</div>,
}));

vi.mock('@/components/dashboard/FinancialSummaryCard', () => ({
  FinancialSummaryCard: () => <div data-testid="financial-summary">FinancialSummary</div>,
}));

vi.mock('@/components/dashboard/RecentSalesList', () => ({
  RecentSalesList: () => <div data-testid="recent-sales">RecentSales</div>,
}));

vi.mock('@/components/dashboard/CollectionsPaymentsCard', () => ({
  CollectionsPaymentsCard: () => <div data-testid="collections-payments">Collections</div>,
}));

vi.mock('@/components/dashboard/FinancialTrendChart', () => ({
  FinancialTrendChart: () => <div data-testid="financial-trend">FinancialTrend</div>,
}));

vi.mock('@/components/dashboard/BestProductsList', () => ({
  BestProductsList: () => <div data-testid="best-products">BestProducts</div>,
}));

vi.mock('@/components/dashboard/DashboardSkeleton', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  FileText: (props) => <svg {...props} />,
  ShoppingCart: (props) => <svg {...props} />,
  Users: (props) => <svg {...props} />,
  DollarSign: (props) => <svg {...props} />,
  TrendingUp: (props) => <svg {...props} />,
}));

import DashboardPage from '../DashboardPage.jsx';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<DashboardPage />);
  });

  it('wraps content in DashboardDateRangeProvider', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('date-range-provider')).toBeInTheDocument();
  });

  it('renders the greeting with username', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('greeting')).toHaveTextContent('testuser');
  });

  it('renders all dashboard sections when loaded', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('pending-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('top-clients')).toBeInTheDocument();
    expect(screen.getByTestId('financial-summary')).toBeInTheDocument();
    expect(screen.getByTestId('recent-sales')).toBeInTheDocument();
    expect(screen.getByTestId('collections-payments')).toBeInTheDocument();
    expect(screen.getByTestId('financial-trend')).toBeInTheDocument();
    expect(screen.getByTestId('best-products')).toBeInTheDocument();
  });

  it('passes 3 quick actions', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('quick-actions')).toHaveTextContent('3 actions');
  });

  it('does not show skeleton when data is loaded', () => {
    render(<DashboardPage />);
    expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument();
  });

  it('accepts apiBaseUrl prop', () => {
    render(<DashboardPage apiBaseUrl="/custom-api" />);
    expect(screen.getByTestId('greeting')).toBeInTheDocument();
  });
});

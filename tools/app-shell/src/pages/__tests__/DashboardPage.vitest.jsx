import { render, screen } from '@testing-library/react';

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock auth. ETP-5088 — mutable so each test can supply a different role's `windowAccess` /
// `capabilities`, which is what now decides whether a widget renders at all. The default is a
// client-admin (every gate open), preserving what these tests asserted before the gating landed.
const authState = vi.hoisted(() => ({
  value: {
    token: 'test-token',
    username: 'testuser',
    logout: () => {},
    windowAccess: {},
    capabilities: { isAdminOrClientAdmin: true },
  },
}));
const ADMIN_AUTH = { ...authState.value };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => authState.value,
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
    authState.value = ADMIN_AUTH;
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

/**
 * ETP-5088 — the widget x role matrix attached to the issue, asserted end-to-end on the page.
 * Each role is expressed as the real `AD_Window_Access` grants it holds in the tenant, so these
 * tests fail if either the mapping or the page's wiring drifts from the matrix.
 */
describe('DashboardPage — role-based widget visibility (ETP-5088)', () => {
  const WINDOW = {
    contacts: '123', product: '140', salesOrder: '143', salesInvoice: '167',
    physicalInventory: '168', goodsShipment: '169', purchaseOrder: '181',
    purchaseInvoice: '183', goodsReceipt: '184',
    financialAccount: '94EAA455D2644E04AB25D93BE5157B6D',
  };

  const asRole = (windowAccess) => {
    authState.value = {
      token: 'test-token',
      username: 'testuser',
      logout: () => {},
      windowAccess,
      capabilities: { isAdminOrClientAdmin: false },
    };
  };

  const FINANCE = {
    [WINDOW.contacts]: 'full', [WINDOW.product]: 'full', [WINDOW.salesOrder]: 'read-only',
    [WINDOW.salesInvoice]: 'full', [WINDOW.physicalInventory]: 'full',
    [WINDOW.purchaseOrder]: 'read-only', [WINDOW.purchaseInvoice]: 'full',
    [WINDOW.financialAccount]: 'full',
  };
  const SALES = {
    [WINDOW.contacts]: 'full', [WINDOW.product]: 'full', [WINDOW.salesOrder]: 'full',
    [WINDOW.salesInvoice]: 'full', [WINDOW.physicalInventory]: 'full',
    [WINDOW.goodsShipment]: 'full',
  };
  const PURCHASING = {
    [WINDOW.contacts]: 'full', [WINDOW.product]: 'full', [WINDOW.purchaseOrder]: 'full',
    [WINDOW.purchaseInvoice]: 'full', [WINDOW.goodsReceipt]: 'full',
  };
  const INVENTORY = {
    [WINDOW.contacts]: 'read-only', [WINDOW.product]: 'full', [WINDOW.salesOrder]: 'read-only',
    [WINDOW.physicalInventory]: 'full', [WINDOW.goodsShipment]: 'full',
    [WINDOW.purchaseOrder]: 'read-only', [WINDOW.goodsReceipt]: 'full',
  };

  it('Finance: financial widgets yes, no "new sales order" (holds it read-only)', () => {
    asRole(FINANCE);
    render(<DashboardPage />);
    expect(screen.getByTestId('financial-summary')).toBeInTheDocument();
    expect(screen.getByTestId('financial-trend')).toBeInTheDocument();
    expect(screen.getByTestId('recent-sales')).toBeInTheDocument();
    expect(screen.getByTestId('top-clients')).toBeInTheDocument();
    expect(screen.getByTestId('collections-payments')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toHaveTextContent('2 actions');
  });

  it('Sales: no financial summary and no trend chart', () => {
    asRole(SALES);
    render(<DashboardPage />);
    expect(screen.queryByTestId('financial-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('financial-trend')).not.toBeInTheDocument();
    expect(screen.getByTestId('recent-sales')).toBeInTheDocument();
    expect(screen.getByTestId('best-products')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toHaveTextContent('3 actions');
  });

  it('Purchasing: no sales widgets, keeps collections/payments (pay half) and best products', () => {
    asRole(PURCHASING);
    render(<DashboardPage />);
    expect(screen.queryByTestId('top-clients')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-sales')).not.toBeInTheDocument();
    expect(screen.queryByTestId('financial-summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('collections-payments')).toBeInTheDocument();
    expect(screen.getByTestId('best-products')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toHaveTextContent('1 actions');
  });

  it('Inventory: only pending tasks and best products; no quick actions at all', () => {
    asRole(INVENTORY);
    render(<DashboardPage />);
    expect(screen.getByTestId('pending-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('best-products')).toBeInTheDocument();
    expect(screen.queryByTestId('collections-payments')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-sales')).not.toBeInTheDocument();
  });

  it('fails closed and explains itself when the permissions map never arrived', () => {
    asRole({});
    render(<DashboardPage />);
    expect(screen.queryByTestId('pending-tasks')).not.toBeInTheDocument();
    expect(screen.queryByTestId('best-products')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument();
    // The greeting still renders — the page is not blank, it says why it is empty.
    expect(screen.getByTestId('greeting')).toBeInTheDocument();
    expect(screen.getByTestId('DashboardNoWidgets__3a4535')).toBeInTheDocument();
  });
});

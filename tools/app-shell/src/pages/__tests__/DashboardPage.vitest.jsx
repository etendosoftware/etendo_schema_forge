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
  TopClientsList: ({ canCreateContact }) => (
    <div data-testid="top-clients">{`contact:${canCreateContact}`}</div>
  ),
}));

vi.mock('@/components/dashboard/FinancialSummaryCard', () => ({
  // ETP-5088 — the creation-gate props are echoed so the page's wiring is assertable: the empty
  // state's "new purchase"/"new sale" buttons are creation actions and were NOT gated at first.
  FinancialSummaryCard: ({ canCreatePurchase, canCreateSale }) => (
    <div data-testid="financial-summary">{`purchase:${canCreatePurchase} sale:${canCreateSale}`}</div>
  ),
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

describe('DashboardPage — creation CTAs need the write tier (ETP-5088)', () => {
  const FINANCIAL_ACCOUNT = '94EAA455D2644E04AB25D93BE5157B6D';

  it('a role holding the windows read-only is offered no creation CTA', () => {
    authState.value = {
      token: 'test-token', username: 'testuser', logout: () => {},
      // Can OPEN the financial account (so the card renders) and the two invoice windows, but
      // cannot write in either, nor in contacts.
      windowAccess: {
        [FINANCIAL_ACCOUNT]: 'read-only', 167: 'read-only', 183: 'read-only', 123: 'read-only',
      },
      capabilities: { isAdminOrClientAdmin: false },
    };
    render(<DashboardPage />);
    expect(screen.getByTestId('financial-summary')).toHaveTextContent('purchase:false sale:false');
    expect(screen.getByTestId('top-clients')).toHaveTextContent('contact:false');
  });

  it('write access on one window only opens that one CTA', () => {
    authState.value = {
      token: 'test-token', username: 'testuser', logout: () => {},
      windowAccess: { [FINANCIAL_ACCOUNT]: 'full', 167: 'full', 183: 'read-only', 123: 'full' },
      capabilities: { isAdminOrClientAdmin: false },
    };
    render(<DashboardPage />);
    expect(screen.getByTestId('financial-summary')).toHaveTextContent('purchase:false sale:true');
    expect(screen.getByTestId('top-clients')).toHaveTextContent('contact:true');
  });
});

describe('DashboardPage — rows adjust to the visible widgets (ETP-5088)', () => {
  const FINANCIAL_ACCOUNT = '94EAA455D2644E04AB25D93BE5157B6D';
  const rowsOf = (container) => Array.from(container.querySelectorAll('.lg\\:flex-row'));

  it('an admin sees the original three rows, unchanged', () => {
    // The whole point: gating must not redesign the dashboard for whoever sees all of it.
    const { container } = render(<DashboardPage />);
    const rows = rowsOf(container);
    expect(rows).toHaveLength(3);
    // By test id, not text: the FinancialSummaryCard mock echoes its creation-gate props.
    expect(rows[0].querySelector('[data-testid="pending-tasks"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="financial-summary"]')).not.toBeNull();
    expect(rows[2].querySelector('[data-testid="financial-trend"]')).not.toBeNull();
  });

  it('Sales gets two fuller rows instead of two stretched widgets', () => {
    // Reported live: with the financial widgets hidden, "Cobros y pagos" spanned the full width
    // and "Productos más vendidos" became a band of its own. They now share the second row.
    authState.value = {
      token: 'test-token', username: 'testuser', logout: () => {},
      windowAccess: { 123: 'full', 140: 'full', 143: 'full', 167: 'full', 168: 'full', 169: 'full' },
      capabilities: { isAdminOrClientAdmin: false },
    };
    const { container } = render(<DashboardPage />);
    const rows = rowsOf(container);

    expect(rows).toHaveLength(2);
    expect(rows[1].querySelector('[data-testid="collections-payments"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="best-products"]')).not.toBeNull();
    // And the financial widgets are gone, not merely moved.
    expect(screen.queryByTestId('financial-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('financial-trend')).not.toBeInTheDocument();
  });

  it('a widget alone in a row keeps its own height', () => {
    // Purchasing: only best products lands on the second row, and it is the 328px-tall one.
    authState.value = {
      token: 'test-token', username: 'testuser', logout: () => {},
      windowAccess: { 123: 'full', 140: 'full', 181: 'full', 183: 'full', 184: 'full' },
      capabilities: { isAdminOrClientAdmin: false },
    };
    const { container } = render(<DashboardPage />);
    const rows = rowsOf(container);

    expect(rows).toHaveLength(2);
    expect(rows[1].querySelector('[data-testid="best-products"]')).not.toBeNull();
    expect(rows[1].style.minHeight).toBe('328px');
    // Alone in its row it must NOT span the full width: a full-width list puts the counts a
    // screen away from the product names.
    expect(rows[1].querySelector('[data-testid="best-products"]').parentElement.style.maxWidth)
      .toBe('50.4%');
    // The first row holds the 234px widgets, so it must not inherit the taller height.
    expect(rows[0].style.minHeight).toBe('234px');
  });

  it('renders no rows at all when nothing is visible', () => {
    authState.value = {
      token: 'test-token', username: 'testuser', logout: () => {},
      windowAccess: {}, capabilities: { isAdminOrClientAdmin: false },
    };
    const { container } = render(<DashboardPage />);
    expect(rowsOf(container)).toHaveLength(0);
    expect(screen.getByTestId('DashboardNoWidgets__3a4535')).toBeInTheDocument();
  });
});

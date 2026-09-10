import { useState, useMemo, useRef, useCallback } from 'react';
import {
  FileText,
  ShoppingCart,
  Users,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useDashboardWidgetAccess } from '@/hooks/useDashboardWidgetAccess.js';
import { groupIntoRows, maxWidthFor, rowHeight } from '@/lib/dashboardRowLayout.js';
import { useCopilot } from '@/components/CopilotContext';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useUI } from '@/i18n';
import { useMenuLabel, useLocaleSwitch } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useCurrency } from '@/hooks/useCurrency.jsx';
import { resolveDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { localeFromUi } from '@/lib/dashboardNumberFormat.js';
import { DashboardDateRangeProvider } from '@/components/dashboard/DashboardDateRangeContext';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { PendingTasksRail } from '@/components/dashboard/PendingTasksRail';
import { QuickActionsList } from '@/components/dashboard/QuickActionsList';
import { TopClientsList } from '@/components/dashboard/TopClientsList';
import { FinancialSummaryCard } from '@/components/dashboard/FinancialSummaryCard';
import { RecentSalesList } from '@/components/dashboard/RecentSalesList';
import { CollectionsPaymentsCard } from '@/components/dashboard/CollectionsPaymentsCard';
import { FinancialTrendChart } from '@/components/dashboard/FinancialTrendChart';
import { BestProductsList } from '@/components/dashboard/BestProductsList';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';

/* ------------------------------------------------------------------
 * Icon lookup
 * ----------------------------------------------------------------*/

const ICON_MAP = {
  DollarSign, FileText, ShoppingCart, Users, TrendingUp,
};

/* ------------------------------------------------------------------
 * Quick actions resolution
 * ----------------------------------------------------------------*/

/**
 * ETP-5088 — each action declares the `window` slug it creates a record in, so
 * `access.filterQuickActions()` can require the WRITE tier there. Read-only access is not
 * enough: the role matrix denies Finance "new sales order" and Inventory "new contact", and in
 * both cases the role does hold the window, as read-only.
 */
function useQuickActions(ui) {
  return useMemo(() => [
    { label: ui('quickAccessSalesOrders'),  to: '/sales-order/new',   window: 'sales-order',   icon: TrendingUp, testId: 'quick-action-sales-order-new', analyticsAction: 'create_sales_order' },
    { label: ui('quickAccessSalesInvoices'), to: '/sales-invoice/new', window: 'sales-invoice', icon: FileText, testId: 'quick-action-sales-invoice-new', analyticsAction: 'create_sales_invoice' },
    { label: ui('quickAccessContacts'),      to: '/contacts/new',      window: 'contacts',      icon: Users, testId: 'quick-action-contacts-new', analyticsAction: 'create_contact' },
  ], [ui]);
}

/* ------------------------------------------------------------------
 * Dashboard inner — must be a child of DashboardDateRangeProvider
 * ----------------------------------------------------------------*/

function DashboardContent({ apiBaseUrl }) {
  const ui = useUI();
  const { token, username } = useAuth();
  const { open: openCopilot } = useCopilot();
  const {
    kpis, revenueTrend, expenseTrend, topClients, pendingTasks,
    recentInvoices, bestProducts, bestSellers, pendingAmounts, loading,
  } = useDashboardData();
  // Resolved independently of `useDashboardData()` even though that hook uses it too: both read
  // the same `windowAccess` map off the auth context, so the decisions cannot diverge, and the
  // page stays gated even where the data hook is mocked away.
  const access = useDashboardWidgetAccess();

  const dashboardCurrency = useCurrency();
  const isCurrencyReady = dashboardCurrency !== null;
  const resolvedKpis = kpis.map((k) => ({ ...k, icon: ICON_MAP[k.icon] || DollarSign }));
  const allQuickActions = useQuickActions(ui);

  // ETP-5088 — role-derived visibility. Every widget below renders only when its own gate opens,
  // and the rows collapse instead of leaving holes, so a restricted role gets a tighter
  // dashboard rather than a grid of empty cards.
  const quickActions = useMemo(
    () => access.filterQuickActions(allQuickActions),
    [access, allQuickActions]
  );
  const showKpis = access.isWidgetVisible('kpis');
  const showTrends = access.isWidgetVisible('trends');
  const showTopClients = access.isWidgetVisible('topClients');
  const showRecentInvoices = access.isWidgetVisible('recentInvoices');
  const showBestProducts = access.isWidgetVisible('bestProducts') || access.isWidgetVisible('bestSellers');
  const { visible: showPendingAmounts } = access.pendingAmountsVisibility;
  const showPendingTasks = access.pendingTasksVisible;
  const showQuickActions = quickActions.length > 0;

  // ETP-5088 — the dashboard is one ordered list of widgets, packed into rows by
  // `groupIntoRows` rather than three hardcoded rows. With every widget visible the packing
  // reproduces the original design exactly (672/213/435, 672/443/213, 901/443 — pinned by
  // `lib/__tests__/dashboardRowLayout.test.js`); a role that sees fewer gets fewer, fuller rows
  // instead of survivors stretching to fill the gap. `weight` IS the design's flex-basis.
  const widgets = [
    { key: 'pendingTasks', weight: 672, height: 234, visible: showPendingTasks, node: (
      <PendingTasksRail tasks={pendingTasks} data-testid="PendingTasksRail__3a4535" />
    ) },
    { key: 'quickActions', weight: 213, height: 234, visible: showQuickActions, node: (
      <QuickActionsList actions={quickActions} data-testid="QuickActionsList__3a4535" />
    ) },
    { key: 'topClients', weight: 435, height: 234, visible: showTopClients, node: (
      <TopClientsList
        clients={topClients}
        canCreateContact={access.canCreateIn('contacts')}
        currencyLabel={dashboardCurrency}
        token={token}
        apiBaseUrl={apiBaseUrl}
        data-testid="TopClientsList__3a4535" />
    ) },
    { key: 'kpis', weight: 672, height: 234, visible: showKpis, node: (
      <FinancialSummaryCard
        kpis={resolvedKpis}
        currencyLabel={dashboardCurrency}
        canCreatePurchase={access.canCreateIn('purchase-invoice')}
        canCreateSale={access.canCreateIn('sales-invoice')}
        data-testid="FinancialSummaryCard__3a4535" />
    ) },
    { key: 'recentInvoices', weight: 443, height: 234, visible: showRecentInvoices, node: (
      <RecentSalesList
        invoices={recentInvoices}
        canCreateSale={access.canCreateIn('sales-invoice')}
        currencyLabel={dashboardCurrency}
        data-testid="RecentSalesList__3a4535" />
    ) },
    { key: 'pendingAmounts', weight: 213.33, height: 234, visible: showPendingAmounts, node: (
      <CollectionsPaymentsCard
        pendingAmounts={pendingAmounts}
        visibility={access.pendingAmountsVisibility}
        currencyLabel={dashboardCurrency}
        data-testid="CollectionsPaymentsCard__3a4535" />
    ) },
    { key: 'trends', weight: 901, height: 328, visible: showTrends, node: (
      <FinancialTrendChart
        canCreatePurchase={access.canCreateIn('purchase-invoice')}
        canCreateSale={access.canCreateIn('sales-invoice')}
        labels={revenueTrend.labels}
        values={revenueTrend.values}
        expenseValues={expenseTrend}
        currencyLabel={dashboardCurrency}
        data-testid="FinancialTrendChart__3a4535" />
    ) },
    { key: 'bestProducts', weight: 443.33, height: 328, visible: showBestProducts, node: (
      <BestProductsList
        canCreateSale={access.canCreateIn('sales-invoice')}
        sellers={bestSellers}
        products={bestProducts}
        currencyLabel={dashboardCurrency}
        data-testid="BestProductsList__3a4535" />
    ) },
  ];
  const rows = groupIntoRows(widgets.filter((w) => w.visible));
  const nothingVisible = rows.length === 0;

  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef(null);
  const handleScroll = useCallback(() => {
    setScrolled((scrollRef.current?.scrollTop ?? 0) > 0);
  }, []);

  useSetPageMeta({
    title: ui('dashboardTitle'),
    breadcrumb: ui('dashboardTitle'),
    onAIClick: openCopilot,
  });
  const dashboardRowStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: '0px',
    gap: '16px',
    width: '100%',
    minHeight: '234px',
  };


  return (
    <div className="h-full flex flex-col">
      {(loading || !isCurrencyReady) ? <DashboardSkeleton data-testid="DashboardSkeleton__3a4535" /> : (
        <div className="bg-card rounded-tl-2xl flex-1 flex flex-col overflow-hidden">
          {/* Fixed header — always visible */}
          <div
            className="px-2 pt-2 pb-0 flex-shrink-0"
            style={{
              borderBottom: scrolled ? '1px solid hsl(var(--border-subtle))' : '1px solid transparent',
              filter: scrolled ? 'drop-shadow(0px 4px 6px hsl(var(--foreground) / 0.1))' : 'none',
              transition: 'border-color 0.2s ease, filter 0.2s ease',
            }}
          >
            <DashboardGreeting
              username={username || ''}
              onAskCopilot={openCopilot}
              data-testid="DashboardGreeting__3a4535" />
          </div>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="dashboard-scroll px-2 pb-2 flex-1 overflow-y-auto space-y-4"
          >

          {/* ETP-5088 — every role reaches this page, but a role with no widget gate open would
              otherwise see an unexplained blank canvas. This also covers the fail-closed case
              where the permissions map never arrived. */}
          {nothingVisible && (
            <div
              className="flex flex-col items-center justify-center text-center rounded-xl border py-12 px-6"
              style={{ borderColor: 'hsl(var(--border-subtle))' }}
              data-testid="DashboardNoWidgets__3a4535"
            >
              <h3 className="text-lg font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                {ui('dashboardNoWidgetsTitle')}
              </h3>
              <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {ui('dashboardNoWidgetsSubtitle')}
              </p>
            </div>
          )}

          {rows.map((row) => (
            <div
              key={row.map((w) => w.key).join('-')}
              className="flex flex-col gap-4 lg:flex-row"
              style={{ ...dashboardRowStyle, minHeight: `${rowHeight(row)}px` }}
            >
              {row.map((w) => (
                <div
                  key={w.key}
                  className="flex flex-col w-full min-w-0"
                  style={{ flex: `${w.weight} 1 0`, maxWidth: maxWidthFor(w), height: `${w.height}px` }}
                >
                  {w.node}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Dashboard Page — provides the date-range context before any hook reads it
 * ----------------------------------------------------------------*/

export default function DashboardPage({ apiBaseUrl = '' }) {
  return (
    <DashboardDateRangeProvider data-testid="DashboardDateRangeProvider__3a4535">
      <DashboardContent apiBaseUrl={apiBaseUrl} data-testid="DashboardContent__3a4535" />
    </DashboardDateRangeProvider>
  );
}

import { useState, useMemo, useRef, useCallback } from 'react';
import {
  FileText,
  ShoppingCart,
  Users,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
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

function useQuickActions(ui) {
  return useMemo(() => [
    { label: ui('quickAccessSalesOrders'),  to: '/sales-order/new',   icon: TrendingUp, testId: 'quick-action-sales-order-new' },
    { label: ui('quickAccessSalesInvoices'), to: '/sales-invoice/new', icon: FileText, testId: 'quick-action-sales-invoice-new' },
    { label: ui('quickAccessContacts'),      to: '/contacts/new',      icon: Users, testId: 'quick-action-contacts-new' },
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

  const dashboardCurrency = useCurrency();
  const isCurrencyReady = dashboardCurrency !== null;
  const resolvedKpis = kpis.map((k) => ({ ...k, icon: ICON_MAP[k.icon] || DollarSign }));
  const quickActions = useQuickActions(ui);

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

  const dashboardRow3Style = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: '0px',
    gap: '16px',
    width: '100%',
    minHeight: '328px',
  };

  return (
    <div className="h-full flex flex-col">
      {(loading || !isCurrencyReady) ? <DashboardSkeleton /> : (
        <div className="bg-white rounded-tl-2xl flex-1 flex flex-col overflow-hidden">
          {/* Fixed header — always visible */}
          <div
            className="px-2 pt-2 pb-0 flex-shrink-0"
            style={{
              borderBottom: scrolled ? '1px solid #E8EAEF' : '1px solid transparent',
              filter: scrolled ? 'drop-shadow(0px 4px 6px rgba(18, 18, 23, 0.1))' : 'none',
              transition: 'border-color 0.2s ease, filter 0.2s ease',
            }}
          >
            <DashboardGreeting username={username || ''} onAskCopilot={openCopilot} />
          </div>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="dashboard-scroll px-2 pb-2 flex-1 overflow-y-auto space-y-4"
          >

          {/* Row 1: Pending tasks | Quick access | Top clients */}
          <div className="flex flex-col gap-4 lg:flex-row" style={dashboardRowStyle}>
            <div className="flex flex-col w-full h-[234px] min-w-0" style={{ flex: '672 1 0' }}>
              <PendingTasksRail tasks={pendingTasks} />
            </div>
            <div className="flex flex-col w-full h-[234px] min-w-0" style={{ flex: '213 1 0' }}>
              <QuickActionsList actions={quickActions} />
            </div>
            <div className="flex flex-col w-full h-[234px] min-w-0" style={{ flex: '435 1 0' }}>
              <TopClientsList
                clients={topClients}
                currencyLabel={dashboardCurrency}
                token={token}
                apiBaseUrl={apiBaseUrl}
              />
            </div>
          </div>

          {/* Row 2: Financial summary | Recent sales | Collections & payments */}
          <div className="flex flex-col gap-4 lg:flex-row" style={dashboardRowStyle}>
            <div className="flex flex-col w-full h-[234px] min-w-0" style={{ flex: '672 1 0' }}>
              <FinancialSummaryCard kpis={resolvedKpis} currencyLabel={dashboardCurrency} />
            </div>
            <div className="flex flex-col w-full h-[234px] min-w-0" style={{ flex: '443 1 0' }}>
              <RecentSalesList invoices={recentInvoices} currencyLabel={dashboardCurrency} />
            </div>
            <div className="flex flex-col w-full h-[234px] min-w-0" style={{ flex: '213.33 1 0' }}>
              <CollectionsPaymentsCard pendingAmounts={pendingAmounts} currencyLabel={dashboardCurrency} />
            </div>
          </div>

          {/* Row 3: Financial trend | Best products */}
          <div className="flex flex-col gap-4 lg:flex-row" style={dashboardRow3Style}>
            <div className="flex flex-col w-full h-[328px] min-w-0" style={{ flex: '901 1 0' }}>
              <FinancialTrendChart
                labels={revenueTrend.labels}
                values={revenueTrend.values}
                expenseValues={expenseTrend}
                currencyLabel={dashboardCurrency}
              />
            </div>
            <div className="flex flex-col w-full h-[328px] min-w-0" style={{ flex: '443.33 1 0' }}>
              <BestProductsList
                sellers={bestSellers}
                products={bestProducts}
                currencyLabel={dashboardCurrency}
              />
            </div>
          </div>
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
    <DashboardDateRangeProvider>
      <DashboardContent apiBaseUrl={apiBaseUrl} />
    </DashboardDateRangeProvider>
  );
}

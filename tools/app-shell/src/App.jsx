import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import AppLayout from './layout/AppLayout.jsx';
import WindowLoader from './windows/WindowLoader.jsx';
import PreviewPage from './preview/PreviewPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FirstStepsPage from './pages/FirstStepsPage.jsx';
import SalesPage from './pages/SalesPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import PurchasesPage from './pages/PurchasesPage.jsx';
import AccountingPage from './pages/AccountingPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import CrmPage from './pages/CrmPage.jsx';
import HrPage from './pages/HrPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ReportViewerPage from './pages/ReportViewerPage.jsx';
import FinancialAccountsPage from './pages/FinancialAccountsPage.jsx';
import Psd2CallbackPage from './pages/Psd2CallbackPage.jsx';
import { buildMenuGroups, buildWindowMap } from './windows/registry.js';
import { createMockFetch } from './lib/mockFetch.js';
import { LocaleProvider } from './i18n/index.js';
import { useLocaleState } from './i18n/useLocaleState.js';
import { useServiceWorker } from './hooks/useServiceWorker.js';
import { useInstalledApps } from './hooks/useInstalledApps.js';
import { useAppStoreUnlock, attachKeySequenceWatcher } from './hooks/useAppStoreUnlock.js';
import { CurrencyProvider } from './hooks/useCurrency.jsx';
import { buildOnboardingReturnTo } from './lib/oauthReturnTo.js';
import { ObservabilityRouteTracker } from './lib/observability/RouteTracker.jsx';

import ArtifactViewerPage from './pages/ArtifactViewerPage.jsx';

const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'));
const SmartScanPage = lazy(() => import('./pages/SmartScanPage.jsx'));
const OAuth2ClientsPage = lazy(() => import('./pages/OAuth2ClientsPage.jsx'));
const AuthorizePage = lazy(() => import('./pages/AuthorizePage.jsx'));
const QuickSalesOrderPage = lazy(() => import('./pages/QuickSalesOrderPage.jsx'));
const QuickPurchaseOrderPage = lazy(() => import('./pages/QuickPurchaseOrderPage.jsx'));
const AppStorePage = lazy(() => import('./pages/AppStorePage.jsx'));

function detectBasePath() {
  const envBase = import.meta.env.VITE_API_BASE;
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');

  if (envBase) {
    const routerBase = webIdx !== -1
      ? `${path.substring(0, webIdx)}/${path.substring(webIdx + 1).split('/').slice(0, 2).join('/')}`
      : '/';
    return { apiBase: envBase, routerBase };
  }

  if (webIdx === -1) return { apiBase: '', routerBase: '/' };
  const contextPath = path.substring(0, webIdx);
  const moduleSegment = path.substring(webIdx + 1).split('/').slice(0, 2).join('/');
  return {
    apiBase: contextPath,
    routerBase: `${contextPath}/${moduleSegment}`,
  };
}

const { apiBase, routerBase } = detectBasePath();
const API_BASE_URL = import.meta.env.VITE_MOCK === 'true'
  ? `${apiBase}/api`
  : `${apiBase}/sws/neo`;

async function loadAllMockData() {
  const modules = await Promise.all([
    import('@generated/sales-order/custom/mockData.js'),
    import('@generated/business-partner/generated/web/business-partner/mockData.js'),
    import('@generated/warehouse/generated/web/warehouse/mockData.js'),
    import('@generated/price-list/generated/web/price-list/mockData.js'),
    import('@generated/payment-term/generated/web/payment-term/mockData.js'),
    import('@generated/product/generated/web/product/mockData.js'),
    import('@generated/product-category/generated/web/product-category/mockData.js'),
    import('@generated/tax/generated/web/tax/mockData.js'),
    import('@generated/user/generated/web/user/mockData.js'),
    import('@generated/purchase-order/generated/web/purchase-order/mockData.js'),
    import('@generated/goods-receipt/generated/web/goods-receipt/mockData.js'),
    import('@generated/return-to-vendor/generated/web/return-to-vendor/mockData.js'),
    import('@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/mockData.js'),
    import('@generated/physical-inventory/generated/web/physical-inventory/mockData.js'),
    import('@generated/internal-consumption/generated/web/internal-consumption/mockData.js'),
    import('@generated/goods-movements/generated/web/goods-movements/mockData.js'),
    import('@generated/warehouse-storage-bins/generated/web/warehouse-storage-bins/mockData.js'),
    import('@generated/sales-quotation/custom/mockData.js'),
    import('@generated/goods-shipment/custom/mockData.js'),
    import('@generated/return-from-customer/generated/web/return-from-customer/mockData.js'),
    import('@generated/return-material-receipt/generated/web/return-material-receipt/mockData.js'),
    import('@generated/sales-invoice/custom/mockData.js'),
    import('@generated/purchase-invoice/generated/web/purchase-invoice/mockData.js'),
    import('@generated/payment-in/custom/mockData.js'),
    import('@generated/payment-out/generated/web/payment-out/mockData.js'),
    import('@generated/chart-of-accounts/generated/web/chart-of-accounts/mockData.js'),
    import('@generated/simple-g-l-journal/generated/web/simple-g-l-journal/mockData.js'),
    import('@generated/assets/generated/web/assets/mockData.js'),
    import('@generated/amortization/generated/web/amortization/mockData.js'),
    import('@generated/deal/generated/web/deal/mockData.js'),
    import('@generated/activity/generated/web/activity/mockData.js'),
    import('@generated/lead/generated/web/lead/mockData.js'),
    import('@generated/employee/generated/web/employee/mockData.js'),
    import('@generated/time-tracking/generated/web/time-tracking/mockData.js'),
    import('@generated/absence/generated/web/absence/mockData.js'),
    import('@generated/project/generated/web/project/mockData.js'),
    import('@generated/document/generated/web/document/mockData.js'),
    import('@generated/recurring-invoice/generated/web/recurring-invoice/mockData.js'),
    import('@generated/fiscal-config/custom/mockData.js'),
    import('@generated/fiscal-monitor/custom/mockData.js'),
    import('@generated/fiscal-models/custom/mockData.js'),
    import('@generated/conversion-rates/generated/web/conversion-rates/mockData.js'),
    import('@generated/conversion-rate-downloader-log/generated/web/conversion-rate-downloader-log/mockData.js'),
    import('@generated/open-close-period-control/generated/web/open-close-period-control/mockData.js'),
    import('@generated/general-ledger-configuration/generated/web/general-ledger-configuration/mockData.js'),
    import('@generated/tax-category/generated/web/tax-category/mockData.js'),
  ]);

  const merged = {};
  for (const mod of modules) {
    for (const [key, value] of Object.entries(mod)) {
      if (key !== 'default') {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function AuthGuard({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return (
      <Navigate
        to={buildOnboardingReturnTo(location)}
        replace
        data-testid="Navigate__ecaf3f" />
    );
  }
  return children;
}

function AppRoutes({ menuGroups, windowMap }) {
  const location = useLocation();

  // Public routes render without waiting for menu data
  const publicPaths = ['/onboarding', '/financial-account/psd2-callback'];
  const isPublicRoute = publicPaths.some(p => location.pathname.startsWith(p));

  if (!isPublicRoute && menuGroups.length === 0) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <Routes data-testid="Routes__ecaf3f">
      <Route
        path="/onboarding"
        element={
          <Suspense
            fallback={<div className="p-8 text-muted-foreground">Loading...</div>}
            data-testid="Suspense__ecaf3f">
            <OnboardingPage data-testid="OnboardingPage__ecaf3f" />
          </Suspense>
        }
        data-testid="Route__ecaf3f" />
      <Route
        path="/login"
        element={<Navigate to="/onboarding" replace data-testid="Navigate__ecaf3f" />}
        data-testid="Route__ecaf3f" />
      <Route
        path="/financial-account/psd2-callback"
        element={<Psd2CallbackPage data-testid="Psd2CallbackPage__ecaf3f" />}
        data-testid="Route__ecaf3f" />
      <Route
        element={
          <AuthGuard data-testid="AuthGuard__ecaf3f">
            <AppLayout menuGroups={menuGroups} data-testid="AppLayout__ecaf3f" />
          </AuthGuard>
        }
        data-testid="Route__ecaf3f">
        <Route
          index
          element={<Navigate to="/dashboard" replace data-testid="Navigate__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="dashboard"
          element={<DashboardPage apiBaseUrl={API_BASE_URL} data-testid="DashboardPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="first-steps"
          element={<FirstStepsPage data-testid="FirstStepsPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="preview"
          element={<PreviewPage data-testid="PreviewPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="sales"
          element={<SalesPage data-testid="SalesPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="inventory"
          element={<InventoryPage data-testid="InventoryPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="purchases"
          element={<PurchasesPage data-testid="PurchasesPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="accounting"
          element={<AccountingPage data-testid="AccountingPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="finance/accounts"
          element={<FinancialAccountsPage data-testid="FinancialAccountsPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="reports"
          element={<ReportsPage data-testid="ReportsPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="report-viewer"
          element={<ReportViewerPage data-testid="ReportViewerPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="crm"
          element={<CrmPage data-testid="CrmPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="hr"
          element={<HrPage data-testid="HrPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="projects"
          element={<ProjectsPage data-testid="ProjectsPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="smart-scan"
          element={<Suspense
            fallback={<div className="p-8 text-muted-foreground">Loading...</div>}
            data-testid="Suspense__ecaf3f"><SmartScanPage data-testid="SmartScanPage__ecaf3f" /></Suspense>}
          data-testid="Route__ecaf3f" />
        <Route
          path="oauth2-clients"
          element={<Suspense
            fallback={<div className="p-8 text-muted-foreground">Loading...</div>}
            data-testid="Suspense__ecaf3f"><OAuth2ClientsPage data-testid="OAuth2ClientsPage__ecaf3f" /></Suspense>}
          data-testid="Route__ecaf3f" />
        <Route
          path="authorize"
          element={<Suspense
            fallback={<div className="p-8 text-muted-foreground">Loading...</div>}
            data-testid="Suspense__ecaf3f"><AuthorizePage data-testid="AuthorizePage__ecaf3f" /></Suspense>}
          data-testid="Route__ecaf3f" />
        <Route
          path="quick-sales-order"
          element={<Suspense
            fallback={<div className="p-8 text-muted-foreground">Loading...</div>}
            data-testid="Suspense__ecaf3f"><QuickSalesOrderPage apiBaseUrl={API_BASE_URL} data-testid="QuickSalesOrderPage__ecaf3f" /></Suspense>}
          data-testid="Route__ecaf3f" />
        <Route
          path="quick-purchase-order"
          element={<Suspense
            fallback={<div className="p-8 text-muted-foreground">Loading...</div>}
            data-testid="Suspense__ecaf3f"><QuickPurchaseOrderPage apiBaseUrl={API_BASE_URL} data-testid="QuickPurchaseOrderPage__ecaf3f" /></Suspense>}
          data-testid="Route__ecaf3f" />
        <Route
          path="app-store"
          element={<Suspense
            fallback={<div className="p-8 text-muted-foreground">Loading...</div>}
            data-testid="Suspense__ecaf3f"><AppStorePage data-testid="AppStorePage__ecaf3f" /></Suspense>}
          data-testid="Route__ecaf3f" />
        <Route
          path="artifacts"
          element={<ArtifactViewerPage data-testid="ArtifactViewerPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path="artifacts/:windowName"
          element={<ArtifactViewerPage data-testid="ArtifactViewerPage__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path=":windowName/:recordId"
          element={<WindowLoader
            key="with-record"
            windowMap={windowMap}
            apiBaseUrl={API_BASE_URL}
            data-testid="WindowLoader__ecaf3f" />}
          data-testid="Route__ecaf3f" />
        <Route
          path=":windowName"
          element={<WindowLoader
            key="list"
            windowMap={windowMap}
            apiBaseUrl={API_BASE_URL}
            data-testid="WindowLoader__ecaf3f" />}
          data-testid="Route__ecaf3f" />
      </Route>
    </Routes>
  );
}

/**
 * Listens for the magic phrases "playstoreon" / "playstoreoff" anywhere in
 * the shell and toggles the Marketplace group visibility. When unlocking,
 * navigates straight to /app-store so the new surface is visible.
 */
function AppStoreKeyWatcher() {
  const navigate = useNavigate();
  useEffect(() => {
    return attachKeySequenceWatcher({
      onUnlock: () => {
        toast.success('App Store unlocked', {
          description: 'Type "playstoreoff" to hide it again.',
        });
        navigate('/app-store');
      },
      onLock: () => {
        toast('App Store hidden');
      },
    });
  }, [navigate]);
  return null;
}

/** Checks for SW updates on route changes; reload is automatic via controllerchange */
function ServiceWorkerManager() {
  const location = useLocation();
  const { checkForUpdate } = useServiceWorker();

  // Check for updates on every route change
  useEffect(() => {
    checkForUpdate();
  }, [location.pathname, checkForUpdate]);

  return null;
}

export default function App() {
  const installedApps = useInstalledApps();
  const appStoreUnlocked = useAppStoreUnlock();
  // Rebuild the menu whenever the installed-apps set or the App Store
  // unlock flag changes; windowMap is static because it already registers
  // loaders for every known SDK app.
  const menuGroups = buildMenuGroups(installedApps, { appStoreUnlocked });
  const [windowMap] = useState(() => buildWindowMap());
  const [locale, setLocale] = useLocaleState();

  useEffect(() => {
    if (import.meta.env.VITE_MOCK === 'true') {
      loadAllMockData().then(mockData => {
        const mockFetch = createMockFetch(mockData, API_BASE_URL);
        const originalFetch = window.fetch;
        window.fetch = async (url, opts) => {
          const mockResult = await mockFetch(url, opts);
          if (mockResult !== undefined) return mockResult;
          return originalFetch(url, opts);
        };
      });
    }
  }, []);

  return (
    <BrowserRouter basename={routerBase} data-testid="BrowserRouter__ecaf3f">
      <ObservabilityRouteTracker data-testid="ObservabilityRouteTracker__ecaf3f" />
      <ServiceWorkerManager data-testid="ServiceWorkerManager__ecaf3f" />
      <AppStoreKeyWatcher data-testid="AppStoreKeyWatcher__ecaf3f" />
      <LocaleProvider
        locale={locale}
        setLocale={setLocale}
        data-testid="LocaleProvider__ecaf3f">
        <AuthProvider data-testid="AuthProvider__ecaf3f">
          <CurrencyProvider data-testid="CurrencyProvider__ecaf3f">
            <AppRoutes
              menuGroups={menuGroups}
              windowMap={windowMap}
              data-testid="AppRoutes__ecaf3f" />
          </CurrencyProvider>
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  );
}

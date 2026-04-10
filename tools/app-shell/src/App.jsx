import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginPage from './auth/LoginPage.jsx';
import AppLayout from './layout/AppLayout.jsx';
import WindowLoader from './windows/WindowLoader.jsx';
import PreviewPage from './preview/PreviewPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import SalesPage from './pages/SalesPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import PurchasesPage from './pages/PurchasesPage.jsx';
import AccountingPage from './pages/AccountingPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import CrmPage from './pages/CrmPage.jsx';
import HrPage from './pages/HrPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ReportViewerPage from './pages/ReportViewerPage.jsx';
import { buildMenuGroups, buildWindowMap } from './windows/registry.js';
import { createMockFetch } from './lib/mockFetch.js';
import { LocaleProvider } from './i18n/index.js';
import { useLocaleState } from './i18n/useLocaleState.js';
import { useServiceWorker } from './hooks/useServiceWorker.js';

import ArtifactViewerPage from './pages/ArtifactViewerPage.jsx';

const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'));
const SmartScanPage = lazy(() => import('./pages/SmartScanPage.jsx'));
const OAuth2ClientsPage = lazy(() => import('./pages/OAuth2ClientsPage.jsx'));
const AuthorizePage = lazy(() => import('./pages/AuthorizePage.jsx'));
const QuickSalesOrderPage = lazy(() => import('./pages/QuickSalesOrderPage.jsx'));
const QuickPurchaseOrderPage = lazy(() => import('./pages/QuickPurchaseOrderPage.jsx'));

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
    import('@generated/payment-method/generated/web/payment-method/mockData.js'),
    import('@generated/product/generated/web/product/mockData.js'),
    import('@generated/product-category/generated/web/product-category/mockData.js'),
    import('@generated/tax/generated/web/tax/mockData.js'),
    import('@generated/unit-of-measure/generated/web/unit-of-measure/mockData.js'),
    import('@generated/user/generated/web/user/mockData.js'),
    import('@generated/purchase-order/generated/web/purchase-order/mockData.js'),
    import('@generated/goods-receipt/generated/web/goods-receipt/mockData.js'),
    import('@generated/return-to-vendor/generated/web/return-to-vendor/mockData.js'),
    import('@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/mockData.js'),
    import('@generated/physical-inventory/generated/web/physical-inventory/mockData.js'),
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
    import('@generated/bank-reconciliation/generated/web/bank-reconciliation/mockData.js'),
    import('@generated/chart-of-accounts/generated/web/chart-of-accounts/mockData.js'),
    import('@generated/assets/generated/web/assets/mockData.js'),
    import('@generated/deal/generated/web/deal/mockData.js'),
    import('@generated/activity/generated/web/activity/mockData.js'),
    import('@generated/lead/generated/web/lead/mockData.js'),
    import('@generated/employee/generated/web/employee/mockData.js'),
    import('@generated/time-tracking/generated/web/time-tracking/mockData.js'),
    import('@generated/absence/generated/web/absence/mockData.js'),
    import('@generated/project/generated/web/project/mockData.js'),
    import('@generated/document/generated/web/document/mockData.js'),
    import('@generated/recurring-invoice/generated/web/recurring-invoice/mockData.js'),
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
  if (!isAuthenticated) return <Navigate to="/onboarding" replace />;
  return children;
}

function AppRoutes({ menuGroups, windowMap }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Public routes render without waiting for menu data
  const publicPaths = ['/login', '/onboarding'];
  const isPublicRoute = publicPaths.some(p => location.pathname.startsWith(p));

  if (!isPublicRoute && menuGroups.length === 0) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/onboarding"
        element={
          <Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}>
            <OnboardingPage />
          </Suspense>
        }
      />
      <Route
        element={
          <AuthGuard>
            <AppLayout menuGroups={menuGroups} />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage apiBaseUrl={API_BASE_URL} />} />
        <Route path="preview" element={<PreviewPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="accounting" element={<AccountingPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="report-viewer" element={<ReportViewerPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="hr" element={<HrPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="smart-scan" element={<Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}><SmartScanPage /></Suspense>} />
        <Route path="oauth2-clients" element={<Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}><OAuth2ClientsPage /></Suspense>} />
        <Route path="authorize" element={<Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}><AuthorizePage /></Suspense>} />
        <Route path="quick-sales-order" element={<Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}><QuickSalesOrderPage apiBaseUrl={API_BASE_URL} /></Suspense>} />
        <Route path="quick-purchase-order" element={<Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}><QuickPurchaseOrderPage apiBaseUrl={API_BASE_URL} /></Suspense>} />
        <Route path="artifacts" element={<ArtifactViewerPage />} />
        <Route path="artifacts/:windowName" element={<ArtifactViewerPage />} />
        <Route
          path=":windowName/:recordId"
          element={<WindowLoader windowMap={windowMap} apiBaseUrl={API_BASE_URL} />}
        />
        <Route
          path=":windowName"
          element={<WindowLoader windowMap={windowMap} apiBaseUrl={API_BASE_URL} />}
        />
      </Route>
    </Routes>
  );
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
  const [menuGroups] = useState(() => buildMenuGroups());
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
    <BrowserRouter basename={routerBase}>
      <ServiceWorkerManager />
      <LocaleProvider locale={locale} setLocale={setLocale}>
        <AuthProvider baseUrl={apiBase}>
          <AppRoutes menuGroups={menuGroups} windowMap={windowMap} />
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  );
}

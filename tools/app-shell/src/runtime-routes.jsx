import { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
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
import ArtifactViewerPage from './pages/ArtifactViewerPage.jsx';

const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'));
const SmartScanPage = lazy(() => import('./pages/SmartScanPage.jsx'));
const OAuth2ClientsPage = lazy(() => import('./pages/OAuth2ClientsPage.jsx'));
const AuthorizePage = lazy(() => import('./pages/AuthorizePage.jsx'));
const QuickSalesOrderPage = lazy(() => import('./pages/QuickSalesOrderPage.jsx'));
const QuickPurchaseOrderPage = lazy(() => import('./pages/QuickPurchaseOrderPage.jsx'));
const AppStorePage = lazy(() => import('./pages/AppStorePage.jsx'));

const LOADING_FALLBACK = <div className="p-8 text-muted-foreground">Loading...</div>;

function lazyRoute(path, Component, extraProps = {}) {
  return {
    path,
    public: false,
    element: (
      <Suspense fallback={LOADING_FALLBACK}>
        <Component {...extraProps} />
      </Suspense>
    ),
  };
}

export function buildRuntimeRoutes({ windowMap, apiBaseUrl }) {
  return [
    { index: true, public: false, element: <Navigate to="/dashboard" replace /> },
    { path: 'onboarding', public: true, element: (
        <Suspense fallback={LOADING_FALLBACK}><OnboardingPage /></Suspense>
      ) },
    { path: 'login', public: true, element: <Navigate to="/onboarding" replace /> },
    { path: 'financial-account/psd2-callback', public: true, element: <Psd2CallbackPage /> },
    { path: 'dashboard', public: false, element: <DashboardPage apiBaseUrl={apiBaseUrl} /> },
    { path: 'first-steps', public: false, element: <FirstStepsPage /> },
    { path: 'preview', public: false, element: <PreviewPage /> },
    { path: 'sales', public: false, element: <SalesPage /> },
    { path: 'inventory', public: false, element: <InventoryPage /> },
    { path: 'purchases', public: false, element: <PurchasesPage /> },
    { path: 'accounting', public: false, element: <AccountingPage /> },
    { path: 'finance/accounts', public: false, element: <FinancialAccountsPage /> },
    { path: 'reports', public: false, element: <ReportsPage /> },
    { path: 'report-viewer', public: false, element: <ReportViewerPage /> },
    { path: 'crm', public: false, element: <CrmPage /> },
    { path: 'hr', public: false, element: <HrPage /> },
    { path: 'projects', public: false, element: <ProjectsPage /> },
    lazyRoute('smart-scan', SmartScanPage),
    lazyRoute('oauth2-clients', OAuth2ClientsPage),
    lazyRoute('authorize', AuthorizePage),
    lazyRoute('quick-sales-order', QuickSalesOrderPage, { apiBaseUrl }),
    lazyRoute('quick-purchase-order', QuickPurchaseOrderPage, { apiBaseUrl }),
    lazyRoute('app-store', AppStorePage),
    { path: 'artifacts', public: false, element: <ArtifactViewerPage /> },
    { path: 'artifacts/:windowName', public: false, element: <ArtifactViewerPage /> },
    { path: ':windowName/:recordId', public: false, element: (
        <WindowLoader key="with-record" windowMap={windowMap} apiBaseUrl={apiBaseUrl} />
      ) },
    { path: ':windowName', public: false, element: (
        <WindowLoader key="list" windowMap={windowMap} apiBaseUrl={apiBaseUrl} />
      ) },
  ];
}

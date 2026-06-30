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
      <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d">
        <Component {...extraProps} data-testid="Component__e8c60d" />
      </Suspense>
    ),
  };
}

export function buildRuntimeRoutes({ windowMap, apiBaseUrl }) {
  return [
    { index: true, public: false, element: <Navigate to="/dashboard" replace data-testid="Navigate__e8c60d" /> },
    { path: 'onboarding', public: true, element: (
        <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d"><OnboardingPage data-testid="OnboardingPage__e8c60d" /></Suspense>
      ) },
    { path: 'login', public: true, element: <Navigate to="/onboarding" replace data-testid="Navigate__e8c60d" /> },
    { path: 'financial-account/psd2-callback', public: true, element: <Psd2CallbackPage data-testid="Psd2CallbackPage__e8c60d" /> },
    { path: 'dashboard', public: false, element: <DashboardPage apiBaseUrl={apiBaseUrl} data-testid="DashboardPage__e8c60d" /> },
    { path: 'first-steps', public: false, element: <FirstStepsPage data-testid="FirstStepsPage__e8c60d" /> },
    { path: 'preview', public: false, element: <PreviewPage data-testid="PreviewPage__e8c60d" /> },
    { path: 'sales', public: false, element: <SalesPage data-testid="SalesPage__e8c60d" /> },
    { path: 'inventory', public: false, element: <InventoryPage data-testid="InventoryPage__e8c60d" /> },
    { path: 'purchases', public: false, element: <PurchasesPage data-testid="PurchasesPage__e8c60d" /> },
    { path: 'accounting', public: false, element: <AccountingPage data-testid="AccountingPage__e8c60d" /> },
    { path: 'finance/accounts', public: false, element: <FinancialAccountsPage data-testid="FinancialAccountsPage__e8c60d" /> },
    { path: 'reports', public: false, element: <ReportsPage data-testid="ReportsPage__e8c60d" /> },
    { path: 'report-viewer', public: false, element: <ReportViewerPage data-testid="ReportViewerPage__e8c60d" /> },
    { path: 'crm', public: false, element: <CrmPage data-testid="CrmPage__e8c60d" /> },
    { path: 'hr', public: false, element: <HrPage data-testid="HrPage__e8c60d" /> },
    { path: 'projects', public: false, element: <ProjectsPage data-testid="ProjectsPage__e8c60d" /> },
    lazyRoute('smart-scan', SmartScanPage),
    lazyRoute('oauth2-clients', OAuth2ClientsPage),
    lazyRoute('authorize', AuthorizePage),
    lazyRoute('quick-sales-order', QuickSalesOrderPage, { apiBaseUrl }),
    lazyRoute('quick-purchase-order', QuickPurchaseOrderPage, { apiBaseUrl }),
    lazyRoute('app-store', AppStorePage),
    { path: 'artifacts', public: false, element: <ArtifactViewerPage data-testid="ArtifactViewerPage__e8c60d" /> },
    { path: 'artifacts/:windowName', public: false, element: <ArtifactViewerPage data-testid="ArtifactViewerPage__e8c60d" /> },
    { path: ':windowName/:recordId', public: false, element: (
        <WindowLoader
          key="with-record"
          windowMap={windowMap}
          apiBaseUrl={apiBaseUrl}
          data-testid="WindowLoader__e8c60d" />
      ) },
    { path: ':windowName', public: false, element: (
        <WindowLoader
          key="list"
          windowMap={windowMap}
          apiBaseUrl={apiBaseUrl}
          data-testid="WindowLoader__e8c60d" />
      ) },
  ];
}

import { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { LogoutRoute } from '@etendosoftware/app-shell-core/auth';
import { useLogout } from './auth/useLogout.js';
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
import BankConnectionCallbackPage from './pages/BankConnectionCallbackPage.jsx';
import PisCallbackPage from './pages/PisCallbackPage.jsx';
import ArtifactViewerPage from './pages/ArtifactViewerPage.jsx';
import { useSupportSession } from './hooks/useSupportSession.js';
import { isSupportRestrictedRoute } from './lib/supportSession.js';

const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'));
const SmartScanPage = lazy(() => import('./pages/SmartScanPage.jsx'));
const OAuth2ClientsPage = lazy(() => import('./pages/OAuth2ClientsPage.jsx'));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage.jsx'));
const DocumentTemplatesPage = lazy(() => import('./pages/DocumentTemplatesPage.jsx'));
const RolesOverviewPage = lazy(() => import('./pages/RolesOverviewPage.jsx'));
const AcctProcessMonitorPage = lazy(() => import('./pages/AcctProcessMonitorPage.jsx'));
const AuthorizePage = lazy(() => import('./pages/AuthorizePage.jsx'));
const QuickSalesOrderPage = lazy(() => import('./pages/QuickSalesOrderPage.jsx'));
const QuickPurchaseOrderPage = lazy(() => import('./pages/QuickPurchaseOrderPage.jsx'));
const UnifiedCalendarPage = lazy(() => import('./pages/UnifiedCalendarPage.jsx'));
const AppStorePage = lazy(() => import('./pages/AppStorePage.jsx'));
const UpgradePage = lazy(() => import('./pages/UpgradePage.jsx'));
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage.jsx'));
const MyCompaniesPage = lazy(() => import('./pages/MyCompaniesPage.jsx'));
const InviteAcceptancePage = lazy(() => import('./pages/InviteAcceptancePage.jsx'));
const DevLifecyclePage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevLifecyclePage.jsx')) : null;
const PortalPage = lazy(() => import('./pages/PortalPage.jsx'));
const SupportAccessPage = lazy(() => import('./pages/SupportAccessPage.jsx'));

const LOADING_FALLBACK = <div className="p-8 text-muted-foreground">Loading...</div>;

function RuntimeLogoutRoute() {
  const logout = useLogout();
  return <LogoutRoute cleanup={logout} safeDestination="/login" data-testid="LogoutRoute__e8c60d" />;
}

// ETP-5351 — a support session never reaches account settings, billing or the screens that mint
// long-lived credentials (`SUPPORT_RESTRICTED_ROUTES`). Hiding the entries is not enough: a typed
// URL must land on the home page too, not on a screen whose every request the backend refuses.
function SupportRestrictedRoute({ children }) {
  const { isSupportMode } = useSupportSession();
  if (isSupportMode) return <Navigate to="/dashboard" replace data-testid="Navigate__support-restricted" />;
  return children;
}

function lazyRoute(path, Component, extraProps = {}) {
  const page = (
    <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d">
      <Component {...extraProps} data-testid="Component__e8c60d" />
    </Suspense>
  );
  return {
    path,
    public: false,
    element: isSupportRestrictedRoute(path)
      ? <SupportRestrictedRoute data-testid="SupportRestrictedRoute__e8c60d">{page}</SupportRestrictedRoute>
      : page,
  };
}

export function buildRuntimeRoutes({ windowMap, apiBaseUrl }) {
  // ETP-5267 — the Business Partner portal, shared by both of its paths below.
  const portalElement = (
    <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d"><PortalPage data-testid="PortalPage__e8c60d" /></Suspense>
  );

  return [
    { index: true, public: false, element: <Navigate to="/dashboard" replace data-testid="Navigate__e8c60d" /> },
    { path: 'onboarding', public: true, element: (
        <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d"><OnboardingPage data-testid="OnboardingPage__e8c60d" /></Suspense>
      ) },
    { path: 'invite', public: true, element: (
        <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d"><InviteAcceptancePage data-testid="InviteAcceptancePage__e8c60d" /></Suspense>
      ) },
    // Registered UNCONDITIONALLY, and public: the Business Partner who opens this link has no
    // Etendo account and no session — the token in the path is the whole credential, validated
    // server-side on every request. The `bp-portal-link` flag gates whether the invoice email
    // CARRIES a link, never whether the surface exists; it is backend-only, targeted at the
    // sending account, and a frontend flag would be visual gating, not authorization
    // (docs/feature-flags.md, which registers `/upgrade` the same way and for the same reason).
    // Nothing here reads a flag.
    { path: 'portal/:token', public: true, element: portalElement },
    // Tokenless `/portal` lands on the same page, which renders the generic
    // "link no longer valid" state — a truncated link deserves that message rather than the
    // catch-all route's blank fallback, and it says nothing a probe could learn from.
    { path: 'portal', public: true, element: portalElement },
    { path: 'login', public: true, element: (
        <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d"><OnboardingPage data-testid="OnboardingPage__e8c60d" /></Suspense>
      ) },
    { path: 'logout', public: true, element: <RuntimeLogoutRoute data-testid="RuntimeLogoutRoute__e8c60d" /> },
    // ETP-5351 — Classic's support handoff (`#t=<ticket>`). Public: the visitor has no GO session
    // yet, the ticket is the credential. A static path, so it outranks `:windowName` below.
    { path: 'support-access', public: true, element: (
        <Suspense fallback={LOADING_FALLBACK} data-testid="Suspense__e8c60d"><SupportAccessPage data-testid="SupportAccessPage__e8c60d" /></Suspense>
      ) },
    { path: 'financial-account/bank-connection-callback', public: true, element: <BankConnectionCallbackPage data-testid="BankConnectionCallbackPage__e8c60d" /> },
    { path: 'financial-account/pis-callback', public: true, element: <PisCallbackPage data-testid="PisCallbackPage__e8c60d" /> },
    { path: 'dashboard', public: false, element: <DashboardPage apiBaseUrl={apiBaseUrl} data-testid="DashboardPage__e8c60d" /> },
    { path: 'first-steps', public: false, element: <FirstStepsPage data-testid="FirstStepsPage__e8c60d" /> },
    { path: 'preview', public: false, element: <PreviewPage data-testid="PreviewPage__e8c60d" /> },
    { path: 'sales', public: false, element: <SalesPage data-testid="SalesPage__e8c60d" /> },
    { path: 'inventory', public: false, element: <InventoryPage data-testid="InventoryPage__e8c60d" /> },
    { path: 'purchases', public: false, element: <PurchasesPage data-testid="PurchasesPage__e8c60d" /> },
    { path: 'accounting', public: false, element: <AccountingPage data-testid="AccountingPage__e8c60d" /> },
    // The accounts list is now the `financial-account` window's own list branch
    // (generated ListView + the AccountsHeaderTable slot), reached through the
    // standard `:windowName` route. This legacy path is kept as a redirect so
    // bookmarks, the archive-dialog return and existing E2E gotos keep working.
    { path: 'finance/accounts', public: false, element: <Navigate to="/financial-account" replace data-testid="Navigate__accounts" /> },
    { path: 'reports', public: false, element: <ReportsPage data-testid="ReportsPage__e8c60d" /> },
    { path: 'report-viewer', public: false, element: <ReportViewerPage data-testid="ReportViewerPage__e8c60d" /> },
    { path: 'crm', public: false, element: <CrmPage data-testid="CrmPage__e8c60d" /> },
    { path: 'hr', public: false, element: <HrPage data-testid="HrPage__e8c60d" /> },
    { path: 'projects', public: false, element: <ProjectsPage data-testid="ProjectsPage__e8c60d" /> },
    lazyRoute('smart-scan', SmartScanPage),
    lazyRoute('oauth2-clients', OAuth2ClientsPage),
    lazyRoute('api-keys', ApiKeysPage),
    // ETP-5988. Registered unconditionally; the `doc-template-selection` flag gates the menu entry
    // and the backend authorizes every read and write.
    lazyRoute('document-templates', DocumentTemplatesPage),
    lazyRoute('roles', RolesOverviewPage),
    // ETP-5269. Registered unconditionally, like 'upgrade' below: the `acct-process-monitor` flag
    // gates the menu entry, not the route, and SFAcctProcessMonitor enforces admin access itself.
    lazyRoute('acct-process-monitor', AcctProcessMonitorPage),
    lazyRoute('authorize', AuthorizePage),
    lazyRoute('quick-sales-order', QuickSalesOrderPage, { apiBaseUrl }),
    lazyRoute('quick-purchase-order', QuickPurchaseOrderPage, { apiBaseUrl }),
    // Unified Calendar PoC: the `unified-calendar-poc` flag gates the menu entry, not the route.
    // Static mock data only, no backend access.
    lazyRoute('unified-calendar', UnifiedCalendarPage),
    lazyRoute('app-store', AppStorePage),
    // Registered unconditionally: the feature flag gates the visible entry
    // point, not the route, and the backend enforces the paywall regardless.
    lazyRoute('upgrade', UpgradePage),
    lazyRoute('account', AccountSettingsPage),
    // ETP-5734. Registered unconditionally: the `my-companies-page` flag gates the user-menu
    // entry, not the route, and every call the page makes is authorized by the account session.
    lazyRoute('companies', MyCompaniesPage),
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
    ...(DevLifecyclePage ? [lazyRoute('dev/lifecycle', DevLifecyclePage)] : []),
  ];
}

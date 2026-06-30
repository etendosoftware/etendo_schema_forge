import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/index.js';
import { CurrencyProvider } from '../hooks/useCurrency.jsx';
import { LocaleProvider } from '../i18n/index.js';
import { ShellLayout } from '../layout/index.js';
import { ReportViewerFrame } from '../reports/index.js';
import { createAppShellConfig } from './contracts.js';

function DefaultLoginRedirect({ loginPath }) {
  const location = useLocation();
  return <Navigate to={loginPath} replace state={{ from: location }} />;
}

export function AuthGate({ children, loginPath = '/login', fallback }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return children;
  return fallback || <DefaultLoginRedirect loginPath={loginPath} />;
}

function renderRoute(route, auth) {
  const element = route.public
    ? route.element
    : <AuthGate loginPath={auth.loginPath} fallback={auth.unauthenticatedFallback}>{route.element}</AuthGate>;

  return <Route key={route.index ? 'index' : route.path} index={route.index} path={route.path} element={element} />;
}

export function AppShellProviders({
  children,
  auth,
  locale,
  setLocale,
  currency,
}) {
  return (
    <LocaleProvider locale={locale} setLocale={setLocale}>
      <AuthProvider
        storage={auth?.storage}
        initialSession={auth?.initialSession}
        onSessionChange={auth?.onSessionChange}
      >
        <CurrencyProvider
          value={currency?.value || currency}
          apiBaseUrl={currency?.apiBaseUrl}
          fetcher={currency?.fetcher}
        >
          {children}
        </CurrencyProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}

// `menuGroups` is passed through to `layout` as-is (not normalized): a caller-supplied
// `layout` component owns its own menu shape (e.g. tools/app-shell's `AppLayout` expects
// the legacy `{group,section,icon,items:[{name,label,favname,slug}]}` shape its `SideMenu`
// depends on). Normalization (`createAppShellConfig`) is intentionally NOT applied to
// `menuGroups` for this reason — only `reports`/`routes`/`auth` go through it. The default
// `ShellLayout` expects `{id,title,items:[{id,label,path,icon}]}`; if you rely on the
// default layout AND pass raw `menuGroups`, normalize them yourself before passing them in.
export function AppShellRuntime({
  basename = '/',
  config,
  menuGroups,
  reports,
  routes,
  auth,
  locale,
  setLocale,
  currency,
  title,
  breadcrumb,
  rightExtras,
  notFoundElement = <Navigate to="/" replace />,
  layout: Layout = ShellLayout,
  children,
}) {
  const runtime = createAppShellConfig({
    ...config,
    reports: reports || config?.reports,
    routes: routes || config?.routes,
    auth: auth || config?.auth,
  });
  const runtimeAuth = { ...runtime.auth, ...auth };
  const reportRoutes = runtime.reports.map((report) => ({
    path: `/reports/${report.id}`,
    public: false,
    element: (
      <ReportViewerFrame
        baseUrl={report.baseUrl}
        reportId={report.id}
        params={report.params}
        format={report.format}
        title={report.title}
      />
    ),
  }));

  return (
    <BrowserRouter basename={basename}>
      <AppShellProviders auth={runtimeAuth} locale={locale} setLocale={setLocale} currency={currency}>
        {children}
        <Routes>
          <Route
            element={
              <AuthGate loginPath={runtimeAuth.loginPath} fallback={runtimeAuth.unauthenticatedFallback}>
                <Layout
                  menuGroups={menuGroups || runtime.menuGroups}
                  title={title}
                  breadcrumb={breadcrumb}
                  rightExtras={rightExtras}
                />
              </AuthGate>
            }
          >
            {runtime.routes.filter((route) => !route.public).map((route) => renderRoute(route, runtimeAuth))}
            {reportRoutes.map((route) => renderRoute(route, runtimeAuth))}
          </Route>
          {runtime.routes.filter((route) => route.public).map((route) => renderRoute(route, runtimeAuth))}
          <Route path="*" element={notFoundElement} />
        </Routes>
      </AppShellProviders>
    </BrowserRouter>
  );
}

# App Shell Runtime Composition (Phase 0 of the Core/Functional Repo Split) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `tools/app-shell` actually consume `@etendosoftware/app-shell-core`'s `AppShellRuntime` for its router/layout/auth/locale/currency composition, instead of duplicating that logic by hand in `App.jsx`, so that once the repo splits, the generic shell crosses the repo boundary as a plain npm dependency with zero file-copy/compose step.

**Architecture:** `packages/app-shell-core/src/runtime/AppShellRuntime.jsx` already accepts `routes`/`menuGroups`/`auth`/`locale`/`currency` as runtime props and builds the `BrowserRouter` + `Routes` + auth/locale/currency providers itself — but it has two gaps that block `tools/app-shell` from actually using it: (1) no slot for always-mounted side-effect components that need router context (route trackers, key-sequence watchers), and (2) the page chrome (`ShellLayout`) is hardcoded, while `tools/app-shell` needs its own `AppLayout` (`SideMenu`, `FavoritesProvider`, `CommandPalette`, `CopilotProvider`/`CopilotWidget`, `PageMetaProvider`) — `ShellLayout` and `AppLayout` are not equivalent, and silently swapping one for the other would drop real product features. This plan adds both missing extension points (a `children` prop and an overridable `layout` component prop, defaulting to `ShellLayout`), then rewrites `tools/app-shell/src/App.jsx` to build a `routes` array from its existing pages/`WindowLoader`/`menuGroups`, pass its own `AppLayout` as the `layout` override, and hand the rest to `AppShellRuntime` — deleting the duplicate hand-rolled router while keeping 100% of today's chrome.

**Tech Stack:** React 18, react-router-dom v7, Vite, Vitest, npm workspaces (this plan does not touch the eventual GitHub Packages publish step — it runs entirely inside the current single repo, via the workspace-linked `@etendosoftware/app-shell-core@0.1.0`).

## Global Constraints

- All versioned content (code, comments, commit messages, test descriptions) must be in English, per this repo's `CLAUDE.md` language policy.
- Never manually edit anything under `artifacts/*/generated/**` — not touched by this plan, called out only because it's a hard repo rule.
- Every JSX element in `tools/app-shell/src` must carry a `data-testid` per this repo's convention — added via the codemod (`npm run apply:data-testid`), not hand-written, per Task 3 Step 5.
- Commits on this branch (`feature/ETP-4346`) must follow `Feature ETP-4346: <description>`, first line ≤ 80 chars, no `Co-Authored-By` trailer (Git Police rejects it).
- This plan only covers Phase 0 of `docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md`. Phases 1–5 (repo mirror, cleanup PRs, package publish, CI split, docs) get their own plans once this one lands and the spec's open Risks (boundary disposition table, GitHub Packages cross-repo auth, cutover coordination) are resolved.

---

## File Structure

- Modify: `packages/app-shell-core/src/runtime/AppShellRuntime.jsx` — add a `children` prop rendered inside the router/provider tree, alongside `<Routes>`, and a `layout` component prop (defaulting to `ShellLayout`) so consumers with their own chrome can override it.
- Create: `packages/app-shell-core/src/runtime/__tests__/AppShellRuntime.test.jsx` — covers the new `children` and `layout` props (`packages/app-shell-core/src/runtime/__tests__/contracts.test.js` is untouched — contracts themselves don't change).
- Create: `tools/app-shell/src/runtime-routes.js` — pure function that converts the current page/window route table into the `routes`/`menuGroups`-shaped objects `AppShellRuntime` expects.
- Create: `tools/app-shell/src/__tests__/runtime-routes.vitest.js` — unit tests for `buildRuntimeRoutes`.
- Modify: `tools/app-shell/src/App.jsx` — replace the hand-rolled `BrowserRouter`/`AuthProvider`/`LocaleProvider`/`CurrencyProvider`/`Routes` tree with `<AppShellRuntime>`, passing `routes={buildRuntimeRoutes(...)}` and moving `ObservabilityRouteTracker`/`ServiceWorkerManager`/`AppStoreKeyWatcher` into its new `children` slot.
- Modify: `tools/app-shell/src/__tests__/App.vitest.jsx` — update mocks to match the new composition (mock `AppShellRuntime` instead of `BrowserRouter`/`Routes` internals).

## Task 1: Add `children` and `layout` override slots to `AppShellRuntime`

**Files:**
- Modify: `packages/app-shell-core/src/runtime/AppShellRuntime.jsx:54-116`
- Test: `packages/app-shell-core/src/runtime/__tests__/AppShellRuntime.test.jsx`

**Interfaces:**
- Consumes: nothing new — `AppShellRuntime` keeps every existing prop (`basename`, `config`, `menuGroups`, `reports`, `routes`, `auth`, `locale`, `setLocale`, `currency`, `title`, `breadcrumb`, `rightExtras`, `notFoundElement`).
- Produces: `AppShellRuntime` now also accepts `children` (rendered inside `<AppShellProviders>` and inside `<BrowserRouter>`, as a sibling of `<Routes>`, so children can call `useAuth`/`useLocale`/`useLocation`/`useNavigate`) and `layout` (a component, defaulting to `ShellLayout`, rendered with `{ menuGroups, title, breadcrumb, rightExtras }` as the element wrapping all non-public routes — any extra props it ignores are harmless, so a consumer's own layout component that only reads `menuGroups` and gets the rest from its own context, like `tools/app-shell`'s `AppLayout`, works unchanged). No other component in this repo references `AppShellRuntime` yet, so both additions are purely additive.

- [ ] **Step 1: Write the failing tests**

```jsx
// packages/app-shell-core/src/runtime/__tests__/AppShellRuntime.test.jsx
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLocation } from 'react-router-dom';
import { AppShellRuntime } from '../AppShellRuntime.jsx';

function RouteAwareProbe() {
  // Throws outside a Router context — proves children mount inside BrowserRouter.
  const location = useLocation();
  return <div data-testid="probe">{location.pathname}</div>;
}

test('AppShellRuntime renders children inside the router so they can use router hooks', () => {
  const html = renderToStaticMarkup(
    <AppShellRuntime
      basename="/"
      menuGroups={[]}
      routes={[{ path: 'home', index: true, public: true, element: <div>home</div> }]}
      auth={{ loginPath: '/login' }}
    >
      <RouteAwareProbe />
    </AppShellRuntime>
  );

  assert.match(html, /data-testid="probe"/);
});

test('AppShellRuntime uses a custom layout component when one is provided', () => {
  function CustomLayout({ menuGroups }) {
    return <div data-testid="custom-layout">{menuGroups.length} groups</div>;
  }

  const html = renderToStaticMarkup(
    <AppShellRuntime
      basename="/"
      menuGroups={[{ id: 'g1', title: 'Group 1', items: [] }]}
      routes={[{ path: 'home', index: true, public: false, element: <div>home</div> }]}
      auth={{ loginPath: '/login', unauthenticatedFallback: <div>n/a</div> }}
      layout={CustomLayout}
    />
  );

  assert.match(html, /data-testid="custom-layout"/);
  assert.match(html, /1 groups/);
});

test('AppShellRuntime falls back to ShellLayout when no layout override is given', () => {
  const html = renderToStaticMarkup(
    <AppShellRuntime
      basename="/"
      menuGroups={[{ id: 'g1', title: 'Group 1', items: [] }]}
      routes={[{ path: 'home', index: true, public: false, element: <div>home</div> }]}
      auth={{ loginPath: '/login', unauthenticatedFallback: <div>n/a</div> }}
    />
  );

  assert.match(html, /Group 1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/app-shell-core/src/runtime/__tests__/AppShellRuntime.test.jsx`
Expected: FAIL — the `children` test finds no probe, and the `layout` override test never sees `custom-layout` because `AppShellRuntime` has neither slot today.

- [ ] **Step 3: Implement the `children` and `layout` props**

```jsx
// packages/app-shell-core/src/runtime/AppShellRuntime.jsx
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
    menuGroups: menuGroups || config?.menuGroups,
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
                  menuGroups={runtime.menuGroups}
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
```

`ShellLayout` is already imported at the top of this file (`import { ShellLayout } from '../layout/index.js';` — unchanged); this step only adds it as the `layout` prop's default value instead of using it unconditionally.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/app-shell-core/src/runtime/__tests__/AppShellRuntime.test.jsx`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Run the full app-shell-core suite to confirm no regression**

Run: `npm test --workspace=packages/app-shell-core`
Expected: all existing suites (`runtime/__tests__/contracts.test.js`, auth/i18n/components tests) still PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/app-shell-core/src/runtime/AppShellRuntime.jsx packages/app-shell-core/src/runtime/__tests__/AppShellRuntime.test.jsx
git commit -m "Feature ETP-4346: Add children and layout override slots to AppShellRuntime"
```

## Task 2: Build `tools/app-shell`'s route table in `AppShellRuntime`'s shape

**Files:**
- Create: `tools/app-shell/src/runtime-routes.js`
- Test: `tools/app-shell/src/__tests__/runtime-routes.vitest.js`

**Interfaces:**
- Consumes: `buildMenuGroups(installedApps, { appStoreUnlocked })` and `buildWindowMap()` from `tools/app-shell/src/windows/registry.js` (unchanged, existing exports); `WindowLoader` default export from `tools/app-shell/src/windows/WindowLoader.jsx` (unchanged, existing `{ windowMap, apiBaseUrl }` props).
- Produces: `buildRuntimeRoutes({ windowMap, apiBaseUrl })` → `Array<{ path?: string, index?: boolean, public?: boolean, element: ReactElement }>`, the exact shape `AppShellRuntime`'s `routes` prop / `createRuntimeRoute` expects (see `packages/app-shell-core/src/runtime/contracts.js:56-66`). Task 3 imports this function by name.

- [ ] **Step 1: Write the failing test**

```js
// tools/app-shell/src/__tests__/runtime-routes.vitest.js
import { describe, it, expect } from 'vitest';
import { buildRuntimeRoutes } from '../runtime-routes.js';

describe('buildRuntimeRoutes', () => {
  it('marks onboarding, login and the PSD2 callback as public routes', () => {
    const routes = buildRuntimeRoutes({ windowMap: {}, apiBaseUrl: 'http://x/api' });
    const paths = routes.filter((r) => r.public).map((r) => r.path);
    expect(paths).toEqual(
      expect.arrayContaining(['onboarding', 'login', 'financial-account/psd2-callback'])
    );
  });

  it('routes window list and window+record views through WindowLoader with the given windowMap', () => {
    const windowMap = { sales: { slug: 'sales' } };
    const routes = buildRuntimeRoutes({ windowMap, apiBaseUrl: 'http://x/api' });
    const windowRoute = routes.find((r) => r.path === ':windowName');
    const recordRoute = routes.find((r) => r.path === ':windowName/:recordId');
    expect(windowRoute).toBeDefined();
    expect(recordRoute).toBeDefined();
  });

  it('includes every business landing page route from the legacy route table', () => {
    const routes = buildRuntimeRoutes({ windowMap: {}, apiBaseUrl: 'http://x/api' });
    const paths = routes.map((r) => r.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'dashboard', 'first-steps', 'preview', 'sales', 'inventory', 'purchases',
        'accounting', 'finance/accounts', 'reports', 'report-viewer', 'crm', 'hr',
        'projects', 'smart-scan', 'oauth2-clients', 'authorize', 'quick-sales-order',
        'quick-purchase-order', 'app-store', 'artifacts', 'artifacts/:windowName',
      ])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/app-shell/src/__tests__/runtime-routes.vitest.js`
Expected: FAIL with "Cannot find module '../runtime-routes.js'"

- [ ] **Step 3: Implement `buildRuntimeRoutes`**

```js
// tools/app-shell/src/runtime-routes.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/app-shell/src/__tests__/runtime-routes.vitest.js`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add tools/app-shell/src/runtime-routes.js tools/app-shell/src/__tests__/runtime-routes.vitest.js
git commit -m "Feature ETP-4346: Add buildRuntimeRoutes for AppShellRuntime composition"
```

## Task 3: Rewrite `App.jsx` to render `AppShellRuntime`

**Files:**
- Modify: `tools/app-shell/src/App.jsx` (full rewrite of `AppRoutes`/`App`, lines 1–383)
- Modify: `tools/app-shell/src/__tests__/App.vitest.jsx`

**Interfaces:**
- Consumes: `AppShellRuntime` from `@etendosoftware/app-shell-core/runtime` (Task 1's `children` and `layout` props included); `buildRuntimeRoutes` from `./runtime-routes.js` (Task 2); existing `buildMenuGroups`/`buildWindowMap` from `./windows/registry.js`; existing default export of `./layout/AppLayout.jsx`; existing `useInstalledApps`, `useAppStoreUnlock`/`attachKeySequenceWatcher`, `useLocaleState`, `useServiceWorker`, `createMockFetch`, `buildOnboardingReturnTo`, `ObservabilityRouteTracker` (all unchanged).
- Produces: `App.jsx` keeps its current default export (`export default function App()`) with the same externally-observable behavior — same routes, same chrome (`AppLayout` unchanged: `SideMenu`, `FavoritesProvider`, `CommandPalette`, `CopilotWidget`, `PageMetaProvider`), same auth gating, same mock-fetch bootstrapping in `VITE_MOCK` mode. No other file imports anything new from `App.jsx`.

- [ ] **Step 1: Update the test mocks to match the new composition**

Replace the router-internals mocks in `tools/app-shell/src/__tests__/App.vitest.jsx` with a mock of `AppShellRuntime` itself, since `App.jsx` no longer builds `<BrowserRouter>`/`<Routes>` by hand. The mock renders `layout` so the test can still assert `AppLayout` is the chrome being used:

```jsx
// tools/app-shell/src/__tests__/App.vitest.jsx (replace the existing top-of-file mocks)
vi.mock('@etendosoftware/app-shell-core/runtime', () => ({
  AppShellRuntime: ({ children, layout: Layout, menuGroups }) => (
    <div data-testid="app-shell-runtime">
      {children}
      {Layout && <Layout menuGroups={menuGroups} />}
    </div>
  ),
}));

vi.mock('../runtime-routes.js', () => ({
  buildRuntimeRoutes: () => [],
}));
```

Keep every other existing mock in that file (`sonner`, `AuthContext.jsx`, `layout/AppLayout.jsx`, `windows/WindowLoader.jsx`, page mocks, etc.) — `layout/AppLayout.jsx` is already mocked to `<div data-testid="app-layout">Layout</div>` today, and that mock now proves `App.jsx` actually passes `AppLayout` as the `layout` prop instead of dropping it.

- [ ] **Step 2: Run the test to verify it fails against the old `App.jsx`**

Run: `npx vitest run tools/app-shell/src/__tests__/App.vitest.jsx`
Expected: FAIL — `App.jsx` still imports pages/router directly; the new mocks don't intercept anything yet, so assertions about `app-shell-runtime` rendering find nothing.

- [ ] **Step 3: Rewrite `App.jsx`**

```jsx
// tools/app-shell/src/App.jsx
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShellRuntime } from '@etendosoftware/app-shell-core/runtime';
import AppLayout from './layout/AppLayout.jsx';
import { buildMenuGroups, buildWindowMap } from './windows/registry.js';
import { buildRuntimeRoutes } from './runtime-routes.js';
import { createMockFetch } from './lib/mockFetch.js';
import { useLocaleState } from './i18n/useLocaleState.js';
import { useServiceWorker } from './hooks/useServiceWorker.js';
import { useInstalledApps } from './hooks/useInstalledApps.js';
import { useAppStoreUnlock, attachKeySequenceWatcher } from './hooks/useAppStoreUnlock.js';
import { buildOnboardingReturnTo } from './lib/oauthReturnTo.js';
import { ObservabilityRouteTracker } from './lib/observability/RouteTracker.jsx';

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
    import('@generated/asset-group/generated/web/asset-group/mockData.js'),
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

function UnauthenticatedRedirect() {
  const location = useLocation();
  return <Navigate to={buildOnboardingReturnTo(location)} replace />;
}

function AppStoreKeyWatcher() {
  const navigate = useNavigate();
  useEffect(() => {
    return attachKeySequenceWatcher({
      onUnlock: () => {
        toast.success('App Store unlocked', { description: 'Type "playstoreoff" to hide it again.' });
        navigate('/app-store');
      },
      onLock: () => toast('App Store hidden'),
    });
  }, [navigate]);
  return null;
}

function ServiceWorkerManager() {
  const location = useLocation();
  const { checkForUpdate } = useServiceWorker();
  useEffect(() => {
    checkForUpdate();
  }, [location.pathname, checkForUpdate]);
  return null;
}

export default function App() {
  const installedApps = useInstalledApps();
  const appStoreUnlocked = useAppStoreUnlock();
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

  const routes = buildRuntimeRoutes({ windowMap, apiBaseUrl: API_BASE_URL });

  return (
    <AppShellRuntime
      basename={routerBase}
      menuGroups={menuGroups}
      routes={routes}
      layout={AppLayout}
      auth={{ loginPath: '/login', unauthenticatedFallback: <UnauthenticatedRedirect /> }}
      locale={locale}
      setLocale={setLocale}
      notFoundElement={<div className="p-8 text-muted-foreground">Loading...</div>}
    >
      <ObservabilityRouteTracker />
      <ServiceWorkerManager />
      <AppStoreKeyWatcher />
    </AppShellRuntime>
  );
}
```

`layout={AppLayout}` is what preserves `SideMenu`/`FavoritesProvider`/`CommandPalette`/`CopilotWidget`/`PageMetaProvider` — without it, `AppShellRuntime` would fall back to the much simpler generic `ShellLayout` and silently drop all of that chrome. `AppLayout` only reads `menuGroups` itself (it gets `embedded` from its own `useSearchParams()` call and page title/breadcrumb from its own `PageMetaProvider`/`usePageMeta()`), so the extra `title`/`breadcrumb`/`rightExtras` props `AppShellRuntime` also passes through are harmless no-ops for it.

`currency` is intentionally omitted from the `AppShellRuntime` call: today's `App.jsx` wraps children in a bare `<CurrencyProvider>` with no props, so `AppShellProviders`'s defaults (`value={undefined}`, `apiBaseUrl={undefined}`, `fetcher=globalThis.fetch`) reproduce that exact behavior — passing a `currency` prop here would change behavior, not preserve it. `auth.unauthenticatedFallback` replicates the original `AuthGuard`'s `buildOnboardingReturnTo(location)` redirect, which a flat `loginPath` redirect alone would have dropped.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/app-shell/src/__tests__/App.vitest.jsx`
Expected: PASS.

- [ ] **Step 5: Apply the data-testid codemod to the rewritten files**

Run: `npm run apply:data-testid -- tools/app-shell/src`
Expected: codemod adds `data-testid` attributes to the new JSX in `App.jsx` and `runtime-routes.js`; review the diff, then re-run the Task 3 Step 4 test to confirm it still passes (the codemod only adds attributes, it doesn't change behavior).

- [ ] **Step 6: Run the full app-shell test suite and a real build**

Run: `npm test --workspace=tools/app-shell && npm run build --workspace=tools/app-shell`
Expected: all suites PASS, build succeeds with no missing-module errors (confirms no stray import was left pointing at deleted code paths).

- [ ] **Step 7: Manual smoke check of one window end-to-end**

Run: `make dev` (or `npm run dev --workspace=tools/app-shell` with `VITE_MOCK=true`), then in the browser:
1. Navigate to `/sales-order` (or any already-working window) — it must render through `WindowLoader` exactly as before.
2. Navigate to `/dashboard`, `/sales`, `/inventory` — confirm the business landing pages still render.
3. Confirm the side menu (`SideMenu`), the favorites star, the command palette (keyboard shortcut), and the Copilot widget are all still present and working — these come from `AppLayout`, passed in via the new `layout` prop, and are the exact pieces a naive swap to the default `ShellLayout` would have silently dropped.
4. Trigger an unauthenticated route — confirm the redirect goes to `/onboarding` with the original deep-link `returnTo` preserved (via `UnauthenticatedRedirect`/`buildOnboardingReturnTo`), not just a bare `/login`.

Expected: identical behavior to before this plan, since `AppShellRuntime` reproduces the same route tree and the same `AppLayout` chrome, just composed through the generic runtime instead of a hand-rolled one.

- [ ] **Step 8: Commit**

```bash
git add tools/app-shell/src/App.jsx tools/app-shell/src/__tests__/App.vitest.jsx
git commit -m "Feature ETP-4346: Compose tools/app-shell via AppShellRuntime"
```

## Task 4: Confirm the spec's Phase 0 acceptance criteria

**Files:** none (verification only).

- [ ] **Step 1: Confirm no Vite alias or import in `tools/app-shell` points outside its own tree**

Run: `grep -rn "from '@generated\|from '@/" tools/app-shell/src | grep -v "windows/registry.js\|windows/custom"`
Expected: only `windows/registry.js` (the `@generated/<window>/...` window-loader map) and files under `windows/custom/**` reference those aliases — confirming the alias usage stays scoped to exactly the two places the split design already expects to keep local to `etendo_schema_forge` (see `docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md`, App Shell Composition Spike, point 2).

- [ ] **Step 2: Confirm `packages/app-shell-core` still has no relative import into `tools/app-shell` or `artifacts/`**

Run: `grep -rn "tools/app-shell\|\.\./\.\./\.\./artifacts" packages/app-shell-core/src`
Expected: no matches — `app-shell-core` remains a clean, generic package with zero references to functional content.

- [ ] **Step 3: Update the design spec's Testing section**

In `docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md`, under "Testing", change the Phase 0 line from "must be considered done" criteria into a checked-off note referencing this plan's file, once Steps 1–2 above pass and Task 3 Step 7's manual smoke is confirmed.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md
git commit -m "Feature ETP-4346: Mark App Shell Composition Spike acceptance criteria as verified"
```

---

## What This Plan Does Not Cover

Per the Scope Check in `superpowers:writing-plans`, the remaining phases of `docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md` are deliberately out of scope here, because their exact shape depends on this plan's actual landed code and on open items the spec already flags as unresolved:

- Phase 1 (create `schema_forge_core`, mirror push) — pure repo-ops, owned by Clerk, no code dependency on this plan.
- Phase 2/3 (cleanup PRs in both repos, package publish, dependency wiring) — needs the path-by-path disposition table for `e2e/`, `tests/`, `pipelines/`, `.github/workflows/*`, etc. that the spec's Risks section calls out as still missing.
- Phase 4/5 (review/QA/docs) — depend on 2/3 being done.

Each will get its own plan once this one is merged and those open items are resolved.

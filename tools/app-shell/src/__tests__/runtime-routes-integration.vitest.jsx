// Integration test closing the final whole-branch review's Minor gap: no existing test
// renders the real `AppShellRuntime` with the real `buildRuntimeRoutes()` output to prove
// the four route classes (window / business landing page / public / lazy) actually compose
// and mount correctly together.
//
// `runtime-routes.vitest.js` (Task 2) only inspects the route descriptor array — it never
// renders anything. `AppShellRuntime.test.jsx` (Task 1) renders the real runtime but only with
// trivial `<div>` routes. `App.vitest.jsx` (Task 3) mocks `AppShellRuntime` out entirely. This
// test is the only one that renders the real `AppShellRuntime` together with the real
// `buildRuntimeRoutes()` output, so neither is mocked here.
//
// `AppShellRuntime` always wraps its tree in its own `<BrowserRouter>` (see
// `packages/app-shell-core/src/runtime/AppShellRuntime.jsx`), so wrapping it in a
// `<MemoryRouter>` from the outside has no effect on which route renders — `BrowserRouter`
// reads `window.location` directly. To exercise a given path we push it onto
// `window.history` before rendering, same as a real browser navigation would.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShellRuntime } from '@etendosoftware/app-shell-core/runtime';
import { buildRuntimeRoutes } from '../runtime-routes.jsx';

// Only WindowLoader is mocked: it does real `apiBaseUrl`/`windowMap`-driven fetching
// (see tools/app-shell/src/windows/WindowLoader.jsx) that is out of scope for this test.
vi.mock('../windows/WindowLoader.jsx', () => ({
  default: ({ windowMap, apiBaseUrl }) => (
    <div data-testid="window-loader">{Object.keys(windowMap).join(',')}:{apiBaseUrl}</div>
  ),
}));

// DashboardPage pulls in useCopilot(), which throws outside of <CopilotProvider> — a provider
// that in the real app is supplied by AppLayout (tools/app-shell/src/layout/AppLayout.jsx),
// not by AppShellRuntime itself. Since this test deliberately uses the *default* ShellLayout
// (no custom `layout` prop), there is no CopilotProvider in the tree. Mocking the specific hook
// that throws (rather than the page) keeps the dashboard's real composition under test.
vi.mock('../components/CopilotContext.jsx', () => ({
  useCopilot: () => ({ open: () => {} }),
}));

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

function renderAt(path, {
  windowMap = { 'sales-order': { slug: 'sales-order' } },
  auth = { loginPath: '/login', initialSession: { token: 'test-token' } },
  // DashboardPage waits on `useCurrency()` resolving to a non-null value before leaving its
  // skeleton state. With a token set, CurrencyProvider's effect fetches `${apiBaseUrl}/session`
  // for real (no fetch mock here) and silently swallows the failure, leaving the currency code
  // null forever — see packages/app-shell-core/src/hooks/useCurrency.jsx's catch block. Passing
  // `currency` directly (its documented "skip the fetch" escape hatch) avoids depending on that
  // unrelated fetch path, which is out of scope for this test.
  currency = 'USD',
} = {}) {
  window.history.pushState({}, '', path);
  const routes = buildRuntimeRoutes({ windowMap, apiBaseUrl: 'http://x/api' });
  return render(
    <AppShellRuntime
      basename="/"
      menuGroups={[]}
      routes={routes}
      auth={auth}
      currency={currency}
    />
  );
}

describe('buildRuntimeRoutes through the real AppShellRuntime', () => {
  it('routes a window path through WindowLoader with the given windowMap', () => {
    renderAt('/sales-order');
    expect(screen.getByTestId('window-loader')).toHaveTextContent('sales-order:http://x/api');
  });

  it('routes a window record path through WindowLoader too', () => {
    renderAt('/sales-order/123');
    expect(screen.getByTestId('window-loader')).toBeInTheDocument();
  });

  it('renders a business landing page for a known path', async () => {
    // Strengthened from the brief's literal `not.toBe('')` check: the default ShellLayout
    // chrome alone (e.g. the "Schema Forge" sidebar title) already makes body text non-empty
    // regardless of which route resolved, so that assertion would pass even if DashboardPage
    // failed to mount. Asserting on a DashboardPage-specific element (its date-range trigger)
    // proves the real landing page actually rendered, not just the surrounding shell.
    // `findByTestId` (not `getByTestId`) because DashboardPage's widget data still loads via a
    // real, unmocked fetch that fails in this environment — out of scope here — so the page
    // briefly shows a skeleton before settling into its empty/error widget state.
    renderAt('/dashboard');
    expect(await screen.findByTestId('dashboard-range-trigger')).toBeInTheDocument();
  });

  it('renders a public route without requiring auth', () => {
    // Strengthened from the brief's literal `not.toContain('Loading')` check (a weak negative
    // assertion) to assert the real Psd2CallbackPage content is present. `auth.initialSession`
    // is deliberately omitted here — this route is `public: true` in buildRuntimeRoutes, so it
    // must render without an authenticated session, unlike the window/dashboard routes above.
    renderAt('/financial-account/psd2-callback', { auth: { loginPath: '/login' } });
    expect(screen.getByText('Conexión completada')).toBeInTheDocument();
  });

  it('resolves a lazy-loaded route via Suspense', async () => {
    // The brief's literal assertion (`findByText(/.+/)`) is ambiguous here: once AppStorePage
    // — a real, fully-rendered page, not a mock — resolves through Suspense, several elements
    // match a catch-all "any text" regex (shell chrome + page content), so `findByText` throws
    // on multiple matches instead of confirming the lazy route resolved. Asserting on
    // AppStorePage's own heading is the real, unambiguous proof that the lazy import resolved
    // and rendered (not the Suspense fallback).
    renderAt('/app-store');
    expect(await screen.findByText('Tienda de aplicaciones', {}, { timeout: 2000 })).toBeTruthy();
  });
});

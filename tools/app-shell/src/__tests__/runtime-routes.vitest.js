import { describe, it, expect } from 'vitest';
import { buildRuntimeRoutes } from '../runtime-routes.jsx';

describe('buildRuntimeRoutes', () => {
  it('marks onboarding, login, logout and the PSD2 callback as public routes', () => {
    const routes = buildRuntimeRoutes({ windowMap: {}, apiBaseUrl: 'http://x/api' });
    const paths = routes.filter((r) => r.public).map((r) => r.path);
    expect(paths).toEqual(
      expect.arrayContaining(['onboarding', 'login', 'logout', 'financial-account/psd2-callback'])
    );
  });

  it('registers public logout before dynamic window routes while keeping dashboard protected', () => {
    const routes = buildRuntimeRoutes({ windowMap: {}, apiBaseUrl: 'http://x/api' });
    const logoutIndex = routes.findIndex((route) => route.path === 'logout');
    const dynamicWindowIndex = routes.findIndex((route) => route.path === ':windowName');

    expect(logoutIndex).toBeGreaterThanOrEqual(0);
    expect(logoutIndex).toBeLessThan(dynamicWindowIndex);
    expect(routes[logoutIndex].public).toBe(true);
    expect(routes.find((route) => route.path === 'dashboard').public).toBe(false);
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

  // ETP-4658 — the accounts list moved into the `financial-account` window's own list
  // branch. `finance/accounts` is kept as a redirect so bookmarks, the archive-dialog
  // return and the existing E2E gotos keep working, and it must still be a PROTECTED
  // route (it used to render FinancialAccountsPage, which the route table gated).
  describe('finance/accounts legacy path', () => {
    function financeAccountsRoute() {
      const routes = buildRuntimeRoutes({ windowMap: {}, apiBaseUrl: 'http://x/api' });
      return routes.find((route) => route.path === 'finance/accounts');
    }

    it('is still registered', () => {
      expect(financeAccountsRoute()).toBeDefined();
    });

    it('stays a protected route', () => {
      expect(financeAccountsRoute().public).toBe(false);
    });

    it('redirects to the financial-account window instead of rendering a page', () => {
      const element = financeAccountsRoute().element;
      expect(element.props.to).toBe('/financial-account');
      expect(element.props.replace).toBe(true);
    });

    it('is registered before the dynamic window routes so the redirect wins', () => {
      const routes = buildRuntimeRoutes({ windowMap: {}, apiBaseUrl: 'http://x/api' });
      const legacyIndex = routes.findIndex((route) => route.path === 'finance/accounts');
      const dynamicIndex = routes.findIndex((route) => route.path === ':windowName');

      expect(legacyIndex).toBeGreaterThanOrEqual(0);
      expect(legacyIndex).toBeLessThan(dynamicIndex);
    });
  });
});

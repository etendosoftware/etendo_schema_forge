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
});

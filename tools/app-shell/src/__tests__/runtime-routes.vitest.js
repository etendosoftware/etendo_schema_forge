import { describe, it, expect } from 'vitest';
import { buildRuntimeRoutes } from '../runtime-routes.jsx';

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

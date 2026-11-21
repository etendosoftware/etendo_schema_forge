// @covers tools/app-shell/src/lib/featureCatalog.js
import { FEATURE_CATALOG, buildFeatureCatalog, resolveFeature } from '../featureCatalog.js';
import menuConfig from '@/menu.json';

describe('feature catalog (ETP-5646)', () => {
  it('gives every actionable menu entry a valid, unique, stable key', () => {
    const keys = [...FEATURE_CATALOG.keys()];
    expect(keys.length).toBeGreaterThan(40);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^(window|process|report|custom)\.[a-z0-9][a-z0-9-]*$/);
    const names = menuConfig.menu.flatMap(group => group.items.filter(item => !item.redirect).map(item => item.name));
    for (const name of names) {
      const item = menuConfig.menu.flatMap(g => g.items).find(i => i.name === name);
      const key = item.reportId ? `report.${item.reportId}` : null;
      if (key) expect(FEATURE_CATALOG.has(key)).toBe(true);
    }
  });

  it('maps windows, processes, reports and custom pages by their menu metadata', () => {
    expect(resolveFeature('/sales-order').key).toBe('window.sales-order');
    expect(resolveFeature('/sales-order/ABC123').key).toBe('window.sales-order');
    expect(resolveFeature('/not-posted-documents').key).toBe('process.not-posted-documents');
    expect(resolveFeature('/report-viewer', '?category=finance&report=tax-report').key).toBe('report.tax-report');
    expect(resolveFeature('/report-viewer', '?category=purchases').key).toBe('custom.report-viewer-purchases');
    expect(resolveFeature('/invoice-inbox').key).toBe('custom.invoice-inbox');
    expect(resolveFeature('/dashboard').key).toBe('custom.dashboard');
    expect(resolveFeature('/deal').key).toBe('window.deal');
  });

  it('resolves an alias to the entry it redirects to, so it is never a second feature', () => {
    expect(resolveFeature('/business-partner').key).toBe('window.contacts');
    expect(resolveFeature('/fiscal-calendar').key).toBe('window.calendar');
    expect(FEATURE_CATALOG.has('window.business-partner')).toBe(false);
  });

  it('returns null for a route outside the menu or an unknown report', () => {
    expect(resolveFeature('/')).toBeNull();
    expect(resolveFeature('/nope/123')).toBeNull();
    expect(resolveFeature('/report-viewer', '?report=does-not-exist')).toBeNull();
  });

  it('is deterministic for a given menu', () => {
    const cfg = { menu: [{ items: [{ name: 'a-page' }, { name: 'w', windowId: '1' }, { name: 'alias', redirect: '/w' }] }] };
    const { features, resolveFeature: resolve } = buildFeatureCatalog(cfg);
    expect([...features.keys()].sort()).toEqual(['custom.a-page', 'window.w']);
    expect(resolve('/alias').key).toBe('window.w');
  });
});

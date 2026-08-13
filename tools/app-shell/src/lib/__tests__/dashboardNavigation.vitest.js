import { describe, it, expect } from 'vitest';
import { resolveDashboardNavigation, createDashboardNavigation } from '../dashboardNavigation.js';

describe('resolveDashboardNavigation', () => {
  it('returns null for null/undefined input', () => {
    expect(resolveDashboardNavigation(null)).toBe(null);
    expect(resolveDashboardNavigation(undefined)).toBe(null);
  });

  it('returns null for non-object input', () => {
    expect(resolveDashboardNavigation('string')).toBe(null);
    expect(resolveDashboardNavigation(42)).toBe(null);
  });

  it('returns null when window is empty or missing', () => {
    expect(resolveDashboardNavigation({})).toBe(null);
    expect(resolveDashboardNavigation({ window: '' })).toBe(null);
    expect(resolveDashboardNavigation({ window: '  ' })).toBe(null);
  });

  it('returns /windowName for simple list navigation', () => {
    expect(resolveDashboardNavigation({ window: 'sales-order' })).toBe('/sales-order');
  });

  it('returns /windowName/recordId for record type', () => {
    expect(resolveDashboardNavigation({ type: 'record', window: 'sales-order', recordId: 'abc123' }))
      .toBe('/sales-order/abc123');
  });

  it('returns /windowName when record type but recordId is empty', () => {
    expect(resolveDashboardNavigation({ type: 'record', window: 'sales-order', recordId: '' }))
      .toBe('/sales-order');
    expect(resolveDashboardNavigation({ type: 'record', window: 'sales-order' }))
      .toBe('/sales-order');
  });

  it('appends filter as query param', () => {
    const result = resolveDashboardNavigation({ window: 'purchase-order', filter: 'pending' });
    expect(result).toBe('/purchase-order?filter=pending');
  });

  it('appends custom params as query params', () => {
    const result = resolveDashboardNavigation({
      window: 'invoice',
      params: { status: 'draft', org: 'main' },
    });
    expect(result).toContain('/invoice?');
    expect(result).toContain('status=draft');
    expect(result).toContain('org=main');
  });

  it('skips null/empty param values', () => {
    const result = resolveDashboardNavigation({
      window: 'invoice',
      params: { status: 'draft', org: null, name: '' },
    });
    expect(result).toContain('status=draft');
    expect(result).not.toContain('org');
    expect(result).not.toContain('name');
  });

  it('combines filter and params', () => {
    const result = resolveDashboardNavigation({
      window: 'invoice',
      filter: 'overdue',
      params: { sort: 'date' },
    });
    expect(result).toContain('filter=overdue');
    expect(result).toContain('sort=date');
  });

  it('trims window name whitespace', () => {
    expect(resolveDashboardNavigation({ window: ' sales-order ' })).toBe('/sales-order');
  });
});

describe('createDashboardNavigation', () => {
  it('creates a list navigation by default', () => {
    const nav = createDashboardNavigation({ window: 'sales-order' });
    expect(nav).toEqual({ type: 'list', window: 'sales-order' });
  });

  it('creates a record navigation with recordId', () => {
    const nav = createDashboardNavigation({ type: 'record', window: 'sales-order', recordId: 'abc' });
    expect(nav).toEqual({ type: 'record', window: 'sales-order', recordId: 'abc' });
  });

  it('includes filter when provided', () => {
    const nav = createDashboardNavigation({ window: 'invoice', filter: 'pending' });
    expect(nav.filter).toBe('pending');
  });

  it('includes params when non-empty', () => {
    const nav = createDashboardNavigation({ window: 'invoice', params: { sort: 'date' } });
    expect(nav.params).toEqual({ sort: 'date' });
  });

  it('omits recordId, filter, params when falsy/empty', () => {
    const nav = createDashboardNavigation({ window: 'invoice' });
    expect(nav).not.toHaveProperty('recordId');
    expect(nav).not.toHaveProperty('filter');
    expect(nav).not.toHaveProperty('params');
  });

  it('omits params when empty object', () => {
    const nav = createDashboardNavigation({ window: 'invoice', params: {} });
    expect(nav).not.toHaveProperty('params');
  });

  it('returns defaults when called with no arguments', () => {
    const nav = createDashboardNavigation();
    expect(nav.type).toBe('list');
  });
});

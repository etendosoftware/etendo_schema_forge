import { buildKpiProperties, trackKpiEvent } from '../kpi.js';

describe('buildKpiProperties', () => {
  it('keeps documented KPI dimensions and metrics', () => {
    expect(buildKpiProperties({
      kpiId: 'kpi_adoption_dashboard_quick_actions_7d',
      module: 'dashboard',
      flow: 'quick_actions',
      entityType: 'sales_invoice',
      channel: 'manual',
      source: 'dashboard',
      status: 'success',
      durationMs: 3000,
      count: 4,
      total: 8,
      correctCount: 7,
      critical: true,
    })).toEqual({
      kpiId: 'kpi_adoption_dashboard_quick_actions_7d',
      module: 'dashboard',
      flow: 'quick_actions',
      entityType: 'sales_invoice',
      channel: 'manual',
      source: 'dashboard',
      status: 'success',
      durationMs: 3000,
      count: 4,
      total: 8,
      correctCount: 7,
      critical: true,
    });
  });

  it('drops unknown dimensions and values that can carry PII', () => {
    expect(buildKpiProperties({
      kpiId: 'kpi_adoption_dashboard_quick_actions_7d',
      module: 'dashboard',
      flow: 'Quick Actions',
      name: 'Customer Name',
      documentNo: 'SO-001',
      recordId: 'ABC123',
      query: 'acme',
      label: 'Acme Inc.',
      randomKey: 'value',
    })).toEqual({
      kpiId: 'kpi_adoption_dashboard_quick_actions_7d',
      module: 'dashboard',
    });
  });

  it('requires known low-cardinality modules, channels, and statuses', () => {
    expect(buildKpiProperties({
      module: 'sales',
      channel: 'ocr',
      status: 'success',
      badModule: 'x',
      source: 'user typed text',
      provider: 'mixpanel',
      type: 'simple_task',
    })).toEqual({
      module: 'sales',
      channel: 'ocr',
      status: 'success',
      provider: 'mixpanel',
      type: 'simple_task',
    });
  });

  it('requires boolean values for KPI flags', () => {
    expect(buildKpiProperties({
      critical: true,
      channel: 'manual',
    })).toEqual({
      critical: true,
      channel: 'manual',
    });
    expect(buildKpiProperties({ critical: 'true' })).toEqual({});
  });

  it('keeps documented backend and system channels', () => {
    expect(buildKpiProperties({
      channel: 'system_email',
      status: 'success',
    })).toEqual({
      channel: 'system_email',
      status: 'success',
    });
    expect(buildKpiProperties({ channel: 'automatic' })).toEqual({ channel: 'automatic' });
    expect(buildKpiProperties({ channel: 'purchase_invoice' })).toEqual({ channel: 'purchase_invoice' });
  });

  it('returns an empty object for non-plain-object inputs', () => {
    expect(buildKpiProperties(null)).toEqual({});
    expect(buildKpiProperties(undefined)).toEqual({});
    expect(buildKpiProperties([1, 2, 3])).toEqual({});
    expect(buildKpiProperties('string')).toEqual({});
    expect(buildKpiProperties(42)).toEqual({});
  });
});

describe('trackKpiEvent', () => {
  it('tracks safe KPI events with sanitized properties', async () => {
    const calls = [];
    const track = async (...args) => calls.push(args);

    await trackKpiEvent(track, 'quick_action_used', {
      kpiId: 'kpi_adoption_dashboard_quick_actions_7d',
      module: 'dashboard',
      source: 'dashboard',
      status: 'success',
      documentNo: 'SO-001',
    });

    expect(calls).toEqual([[
      'quick_action_used',
      {
        kpiId: 'kpi_adoption_dashboard_quick_actions_7d',
        module: 'dashboard',
        source: 'dashboard',
        status: 'success',
      },
    ]]);
  });

  it('does not track unsafe event names', async () => {
    const track = vi.fn();

    await trackKpiEvent(track, 'Quick Action Used', {
      module: 'dashboard',
    });

    expect(track).not.toHaveBeenCalled();
  });

  it('returns undefined when trackFn is not a function', async () => {
    expect(await trackKpiEvent(null, 'quick_action_used', { module: 'dashboard' })).toBeUndefined();
    expect(await trackKpiEvent(undefined, 'quick_action_used')).toBeUndefined();
    expect(await trackKpiEvent('not-a-fn', 'quick_action_used')).toBeUndefined();
  });
});

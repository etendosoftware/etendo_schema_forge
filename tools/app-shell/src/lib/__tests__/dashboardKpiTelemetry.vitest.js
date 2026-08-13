const observabilityMocks = vi.hoisted(() => ({
  track: vi.fn(),
  trackKpiEvent: vi.fn(),
}));

vi.mock('@/lib/observability.js', () => ({
  track: observabilityMocks.track,
  trackKpiEvent: observabilityMocks.trackKpiEvent,
}));

import { DASHBOARD_KPI_IDS, trackDashboardKpi } from '../dashboardKpiTelemetry.js';

describe('DASHBOARD_KPI_IDS', () => {
  it('exposes the documented KPI ids', () => {
    expect(DASHBOARD_KPI_IDS).toEqual({
      quickActions: 'kpi_adopt_dashboard_quick_actions_7d',
      pendingTasks: 'kpi_adopt_dashboard_pending_tasks',
      dashboardToDocument: 'kpi_ux_dashboard_to_document',
    });
  });
});

describe('trackDashboardKpi', () => {
  beforeEach(() => {
    observabilityMocks.track.mockReset();
    observabilityMocks.trackKpiEvent.mockReset();
    observabilityMocks.trackKpiEvent.mockResolvedValue(undefined);
  });

  it('calls trackKpiEvent with dashboard defaults and caller props', () => {
    trackDashboardKpi('quick_action_used', { entityType: 'sales_invoice' });
    expect(observabilityMocks.trackKpiEvent).toHaveBeenCalledWith(
      observabilityMocks.track,
      'quick_action_used',
      { module: 'dashboard', source: 'dashboard', entityType: 'sales_invoice' },
    );
  });

  it('uses default properties when none are provided', () => {
    trackDashboardKpi('pending_task_opened');
    expect(observabilityMocks.trackKpiEvent).toHaveBeenCalledWith(
      observabilityMocks.track,
      'pending_task_opened',
      { module: 'dashboard', source: 'dashboard' },
    );
  });

  it('lets caller props override the defaults', () => {
    trackDashboardKpi('event', { module: 'sales', source: 'override' });
    expect(observabilityMocks.trackKpiEvent).toHaveBeenCalledWith(
      observabilityMocks.track,
      'event',
      { module: 'sales', source: 'override' },
    );
  });

  it('does not throw when trackKpiEvent rejects', async () => {
    observabilityMocks.trackKpiEvent.mockReturnValue(Promise.reject(new Error('x')));
    expect(() => trackDashboardKpi('event')).not.toThrow();
    // flush the rejected promise so the .catch handler runs
    await Promise.resolve();
    await Promise.resolve();
  });
});

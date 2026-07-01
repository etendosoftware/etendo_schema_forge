import { track, trackKpiEvent } from '@/lib/observability.js';

export const DASHBOARD_KPI_IDS = {
  quickActions: 'kpi_adopt_dashboard_quick_actions_7d',
  pendingTasks: 'kpi_adopt_dashboard_pending_tasks',
  dashboardToDocument: 'kpi_ux_dashboard_to_document',
};

export function trackDashboardKpi(eventName, properties = {}) {
  Promise.resolve(
    trackKpiEvent(track, eventName, {
      module: 'dashboard',
      source: 'dashboard',
      ...properties,
    })
  ).catch(() => {});
}

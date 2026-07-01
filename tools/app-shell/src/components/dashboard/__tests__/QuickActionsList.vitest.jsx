import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const telemetryMocks = vi.hoisted(() => ({
  trackDashboardKpi: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/dashboardKpiTelemetry.js', () => ({
  DASHBOARD_KPI_IDS: {
    quickActions: 'kpi_adopt_dashboard_quick_actions_7d',
  },
  trackDashboardKpi: telemetryMocks.trackDashboardKpi,
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>
  ),
}));

import { QuickActionsList } from '../QuickActionsList.jsx';

describe('QuickActionsList', () => {
  beforeEach(() => {
    telemetryMocks.trackDashboardKpi.mockReset();
  });

  it('tracks quick action usage with stable action metadata', async () => {
    const user = userEvent.setup();

    render(
      <QuickActionsList
        actions={[
          {
            label: 'New invoice',
            to: '/sales-invoice/new',
            testId: 'quick-action-sales-invoice-new',
            analyticsAction: 'create_sales_invoice',
          },
        ]}
      />,
    );

    await user.click(screen.getByTestId('quick-action-sales-invoice-new'));

    expect(telemetryMocks.trackDashboardKpi).toHaveBeenCalledWith('quick_action_used', {
      kpiId: 'kpi_adopt_dashboard_quick_actions_7d',
      action: 'create_sales_invoice',
      source: 'dashboard_quick_actions',
    });
  });
});

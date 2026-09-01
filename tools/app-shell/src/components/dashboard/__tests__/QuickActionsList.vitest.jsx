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

  it('keeps a long label inside the card so it truncates instead of being chopped', () => {
    // Reported live: with the sidebar open the column narrows and "Nuevo pedido de venta" was cut
    // mid-word. The span already had `text-overflow: ellipsis`, but it could never apply — the
    // pill uses `align-self: flex-start`, so it sized to its content and overflowed the card, and
    // a flex item defaults to `min-width: auto`, which refuses to shrink below its text.
    render(
      <QuickActionsList
        actions={[
          {
            label: 'Nuevo pedido de venta con un nombre larguísimo',
            to: '/sales-order/new',
            testId: 'quick-action-sales-order-new',
            analyticsAction: 'create_sales_order',
          },
        ]}
      />,
    );

    const pill = screen.getByTestId('quick-action-sales-order-new');
    expect(pill.style.maxWidth).toBe('100%');
    expect(pill.style.minWidth).toBe('0px');
    // The full text stays reachable on hover once it is visually truncated.
    expect(pill).toHaveAttribute('title', 'Nuevo pedido de venta con un nombre larguísimo');

    const label = pill.querySelector('span');
    expect(label.style.minWidth).toBe('0px');
    expect(label.style.textOverflow).toBe('ellipsis');
  });
});

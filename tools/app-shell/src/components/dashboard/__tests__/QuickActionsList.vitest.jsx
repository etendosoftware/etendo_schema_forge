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

  it('keeps a long label on one line, inside the card', () => {
    // Reported live, twice. The label was first chopped mid-word: the pill uses
    // `align-self: flex-start`, so it sized to its content and overflowed the card, and a flex
    // item defaults to `min-width: auto` and will not shrink below its text. The real fix was a
    // width floor on the column (DashboardPage), which lets every current label fit on one line —
    // so the pill stays 28px and the ellipsis here is only a safety net for a longer translation.
    render(
      <QuickActionsList
        actions={[
          {
            label: 'Nuevo pedido de venta',
            to: '/sales-order/new',
            testId: 'quick-action-sales-order-new',
            analyticsAction: 'create_sales_order',
          },
        ]}
      />,
    );

    const pill = screen.getByTestId('quick-action-sales-order-new');
    expect(pill.style.height).toBe('28px');
    // Never wider than the card, and free to shrink so the label can ellipse inside it.
    expect(pill.style.maxWidth).toBe('100%');
    expect(pill.style.minWidth).toBe('0px');
    expect(pill).toHaveAttribute('title', 'Nuevo pedido de venta');

    const label = pill.querySelector('span');
    expect(label.style.whiteSpace).toBe('nowrap');
    expect(label.style.textOverflow).toBe('ellipsis');
    expect(label.style.minWidth).toBe('0px');
  });
});

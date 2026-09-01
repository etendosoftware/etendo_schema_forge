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

  it('wraps a long label to a second line instead of cutting it off', () => {
    // Reported live, twice. First the label was chopped mid-word: the pill uses
    // `align-self: flex-start`, so it sized to its content and overflowed the card, and a flex
    // item defaults to `min-width: auto` and will not shrink below its text. Capping the pill
    // fixed the clipping but left "Nuevo pedido d..." — this is the narrowest column of the row
    // and the label simply does not fit on one line, so it now wraps to two.
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
    // Never wider than the card, and free to shrink so the text wraps inside it.
    expect(pill.style.maxWidth).toBe('100%');
    expect(pill.style.minWidth).toBe('0px');
    // Grows past 28px when it needs a second line, rather than being locked to one.
    expect(pill.style.minHeight).toBe('28px');
    expect(pill.style.height).toBe('');
    expect(pill).toHaveAttribute('title', 'Nuevo pedido de venta');

    const label = pill.querySelector('span');
    // Two lines, then ellipsis: wrapping must not let an unusually long label grow the card
    // without bound.
    expect(label.style.webkitLineClamp).toBe('2');
    expect(label.style.minWidth).toBe('0px');
    // The old single-line clamp is gone — that is what produced "Nuevo pedido d...".
    expect(label.style.whiteSpace).not.toBe('nowrap');
  });
});

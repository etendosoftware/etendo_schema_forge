import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const telemetryMocks = vi.hoisted(() => ({
  trackDashboardKpi: vi.fn(),
}));
const navMocks = vi.hoisted(() => ({
  resolveDashboardNavigation: vi.fn(() => '/sales-invoice'),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/dashboardNavigation.js', () => ({
  resolveDashboardNavigation: (...args) => navMocks.resolveDashboardNavigation(...args),
}));

vi.mock('@/lib/dashboardKpiTelemetry.js', () => ({
  DASHBOARD_KPI_IDS: {
    pendingTasks: 'kpi_adopt_dashboard_pending_tasks',
  },
  trackDashboardKpi: telemetryMocks.trackDashboardKpi,
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>
  ),
}));

import { PendingTasksRail } from '../PendingTasksRail.jsx';

describe('PendingTasksRail KPI telemetry', () => {
  beforeEach(() => {
    telemetryMocks.trackDashboardKpi.mockReset();
    navMocks.resolveDashboardNavigation.mockReset();
    navMocks.resolveDashboardNavigation.mockReturnValue('/sales-invoice');
  });

  it('tracks pending task opening with category only', async () => {
    const user = userEvent.setup();

    render(
      <PendingTasksRail
        tasks={[
          {
            taskKey: 'overdueInvoices',
            count: 3,
            navigation: { window: 'sales-invoice' },
          },
        ]}
      />,
    );

    await user.click(screen.getByTestId('Link__7e1000'));

    expect(telemetryMocks.trackDashboardKpi).toHaveBeenCalledWith('pending_task_opened', {
      kpiId: 'kpi_adopt_dashboard_pending_tasks',
      action: 'open_pending_task',
      source: 'dashboard_pending_tasks',
      type: 'sales',
    });
  });

  it('maps the stock category to the "inventory" telemetry type', async () => {
    const user = userEvent.setup();
    render(<PendingTasksRail tasks={[{ taskKey: 'lowStockAlert', count: 2 }]} />);
    await user.click(screen.getByTestId('Link__7e1000'));
    expect(telemetryMocks.trackDashboardKpi).toHaveBeenCalledWith(
      'pending_task_opened',
      expect.objectContaining({ type: 'inventory' }),
    );
  });

  it('renders the title and shows scroll buttons when there are tasks', () => {
    render(<PendingTasksRail tasks={[{ taskKey: 'overdueInvoices', count: 1 }]} />);
    expect(screen.getByText('pendingTasksTitle')).toBeInTheDocument();
    expect(screen.getByTestId('ChevronLeft__7e1000')).toBeInTheDocument();
    expect(screen.getByTestId('ChevronRight__7e1000')).toBeInTheDocument();
  });

  it('scrolls the rail when chevron buttons are clicked', async () => {
    const user = userEvent.setup();
    const scrollBy = vi.fn();
    // jsdom does not implement scrollBy on elements
    Element.prototype.scrollBy = scrollBy;
    render(<PendingTasksRail tasks={[{ taskKey: 'overdueInvoices', count: 1 }]} />);
    await user.click(screen.getByTestId('ChevronLeft__7e1000'));
    await user.click(screen.getByTestId('ChevronRight__7e1000'));
    expect(scrollBy).toHaveBeenCalledWith({ left: -200, behavior: 'smooth' });
    expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' });
  });

  it('renders the empty state when there are no tasks', () => {
    render(<PendingTasksRail tasks={[]} />);
    expect(screen.getByText('pendingTasksEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('pendingTasksEmptySubtitle')).toBeInTheDocument();
    expect(screen.queryByTestId('ChevronLeft__7e1000')).not.toBeInTheDocument();
  });

  it('defaults tasks to an empty array (empty state) when prop is omitted', () => {
    render(<PendingTasksRail />);
    expect(screen.getByText('pendingTasksEmptyTitle')).toBeInTheDocument();
  });

  it('falls back to task.text labels and "other" category for unknown taskKey', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<PendingTasksRail tasks={[{ taskKey: 'somethingUnknown', text: 'Custom text' }]} />);
    // subjectLabel and stateLabel both fall back to task.text
    expect(screen.getAllByText('Custom text').length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    // count ?? 0 fallback renders 0
    expect(screen.getByText('0')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('uses the resolved navigation route as the link target', () => {
    const { container } = render(
      <PendingTasksRail tasks={[{ taskKey: 'overdueInvoices', count: 1 }]} />,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/sales-invoice');
  });

  it('falls back to task.link when navigation cannot be resolved', () => {
    navMocks.resolveDashboardNavigation.mockReturnValue(null);
    const { container } = render(
      <PendingTasksRail tasks={[{ taskKey: 'overdueInvoices', count: 1, link: '/custom-link' }]} />,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/custom-link');
  });

  it('falls back to /dashboard when no navigation and no link', () => {
    navMocks.resolveDashboardNavigation.mockReturnValue(null);
    const { container } = render(
      <PendingTasksRail tasks={[{ taskKey: 'overdueInvoices', count: 1 }]} />,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/dashboard');
  });
});

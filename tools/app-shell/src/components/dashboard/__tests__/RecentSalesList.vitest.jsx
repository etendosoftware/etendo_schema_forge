import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();
const openCopilotMock = vi.fn();
const telemetryMocks = vi.hoisted(() => ({
  trackDashboardKpi: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es' }),
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ open: openCopilotMock }),
}));

vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardAmount: (val, currency) => `${val}|${currency}`,
  localeFromUi: (locale) => locale,
}));

vi.mock('@/lib/dashboardNavigation.js', () => ({
  resolveDashboardNavigation: () => null,
}));

vi.mock('@/lib/dashboardKpiTelemetry.js', () => ({
  DASHBOARD_KPI_IDS: {
    dashboardToDocument: 'kpi_ux_dashboard_to_document',
  },
  trackDashboardKpi: telemetryMocks.trackDashboardKpi,
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>
  ),
  useNavigate: () => navigateMock,
}));

import { RecentSalesList } from '../RecentSalesList.jsx';

describe('RecentSalesList', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    openCopilotMock.mockReset();
    telemetryMocks.trackDashboardKpi.mockReset();
  });

  it('renders the header title from useUI', () => {
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    expect(screen.getByText('recentSalesTitle')).toBeInTheDocument();
  });

  it('shows empty-state title and subtitle when invoices is empty', () => {
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    expect(screen.getByText('recentSalesEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('recentSalesEmptySubtitle')).toBeInTheDocument();
  });

  it('renders both empty-state CTAs (Copilot and New sale)', () => {
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    expect(screen.getByText('createWithCopilot')).toBeInTheDocument();
    expect(screen.getByText('newSale')).toBeInTheDocument();
  });

  it('invokes openCopilot when the Copilot button is clicked', async () => {
    const user = userEvent.setup();
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    await user.click(screen.getByText('createWithCopilot'));
    expect(openCopilotMock).toHaveBeenCalledTimes(1);
  });

  it('navigates to /sales-invoice/new when the New sale button is clicked', async () => {
    const user = userEvent.setup();
    render(<RecentSalesList invoices={[]} currencyLabel="EUR" />);
    await user.click(screen.getByText('newSale'));
    expect(navigateMock).toHaveBeenCalledWith('/sales-invoice/new');
  });

  it('renders at most 5 rows even when given more invoices', () => {
    const invoices = Array.from({ length: 7 }, (_, i) => ({
      id: `inv-${i}`,
      client: `Client ${i}`,
      documentNo: `DOC-${i}`,
      amount: 100 + i,
    }));
    const { container } = render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    // Each row is an <a> link. We only have row links (header is plain text).
    const anchors = container.querySelectorAll('a');
    expect(anchors.length).toBe(5);
  });

  it('renders client name, document number and formatted amount per row', () => {
    const invoices = [
      { id: 'a', client: 'Acme', documentNo: 'INV-001', amount: 250 },
    ];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByText('250|EUR')).toBeInTheDocument();
  });

  it('falls back to "—" when no document number is present', () => {
    const invoices = [{ id: 'a', client: 'NoDocClient', amount: 0 }];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('resolves documentNo from document_no when documentNo is absent', () => {
    const invoices = [{ id: 'a', client: 'C', document_no: 'SNAKE-1', amount: 0 }];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('SNAKE-1')).toBeInTheDocument();
  });

  it('resolves documentNo from docNo as the last fallback', () => {
    const invoices = [{ id: 'a', client: 'C', docNo: 'CAMEL-1', amount: 0 }];
    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    expect(screen.getByText('CAMEL-1')).toBeInTheDocument();
  });

  it('links each row to /sales-invoice/<id> when navigation cannot be resolved', () => {
    const invoices = [{ id: 'abc123', client: 'X', documentNo: 'D-1', amount: 0 }];
    const { container } = render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('/sales-invoice/abc123');
  });

  it('tracks dashboard document navigation without record identifiers', async () => {
    const user = userEvent.setup();
    const invoices = [{ id: 'abc123', client: 'X', documentNo: 'D-1', amount: 0 }];

    render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    await user.click(screen.getByTestId('recent-sales-item-abc123'));

    expect(telemetryMocks.trackDashboardKpi).toHaveBeenCalledWith('dashboard_document_opened', {
      kpiId: 'kpi_ux_dashboard_to_document',
      entityType: 'sales_invoice',
      source: 'dashboard_recent_sales',
    });
  });

  it('falls back to /sales-invoice when invoice has no id and no navigation', () => {
    const invoices = [{ client: 'X', documentNo: 'D-1', amount: 0 }];
    const { container } = render(<RecentSalesList invoices={invoices} currencyLabel="EUR" />);
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('/sales-invoice');
  });
});

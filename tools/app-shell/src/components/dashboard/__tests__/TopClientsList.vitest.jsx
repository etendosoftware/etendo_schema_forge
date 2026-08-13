import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();
const openCopilotMock = vi.fn();
const resolveNavigationMock = vi.fn();
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
  resolveDashboardNavigation: (...args) => resolveNavigationMock(...args),
}));

vi.mock('@/lib/dashboardKpiTelemetry.js', () => ({
  DASHBOARD_KPI_IDS: {
    dashboardToDocument: 'kpi_ux_dashboard_to_document',
  },
  trackDashboardKpi: telemetryMocks.trackDashboardKpi,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

import { TopClientsList } from '../TopClientsList.jsx';

describe('TopClientsList', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    openCopilotMock.mockReset();
    telemetryMocks.trackDashboardKpi.mockReset();
    resolveNavigationMock.mockReset();
    resolveNavigationMock.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header title from useUI', () => {
    render(<TopClientsList clients={[]} currencyLabel="EUR" />);
    expect(screen.getByText('topClientsTitle')).toBeInTheDocument();
  });

  it('shows empty-state title and subtitle when clients is empty', () => {
    render(<TopClientsList clients={[]} currencyLabel="EUR" />);
    expect(screen.getByText('topClientsEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('topClientsEmptySubtitle')).toBeInTheDocument();
  });

  it('renders both empty-state CTAs (Copilot and New client)', () => {
    render(<TopClientsList clients={[]} currencyLabel="EUR" />);
    expect(screen.getByText('createWithCopilot')).toBeInTheDocument();
    expect(screen.getByText('newClient')).toBeInTheDocument();
  });

  it('invokes openCopilot when the Copilot button is clicked', async () => {
    const user = userEvent.setup();
    render(<TopClientsList clients={[]} currencyLabel="EUR" />);
    await user.click(screen.getByText('createWithCopilot'));
    expect(openCopilotMock).toHaveBeenCalledTimes(1);
  });

  it('navigates to /contacts/new when the New client button is clicked', async () => {
    const user = userEvent.setup();
    render(<TopClientsList clients={[]} currencyLabel="EUR" />);
    await user.click(screen.getByText('newClient'));
    expect(navigateMock).toHaveBeenCalledWith('/contacts/new');
  });

  it('renders at most 5 rows even when given more clients', () => {
    const clients = Array.from({ length: 7 }, (_, i) => ({
      id: `c-${i}`,
      name: `Client ${i}`,
      total: 100 + i,
    }));
    render(<TopClientsList clients={clients} currencyLabel="EUR" />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('renders client name and formatted amount per row', () => {
    const clients = [{ id: 'a', name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('250|EUR')).toBeInTheDocument();
  });

  it('tracks dashboard document navigation when a row is clicked', async () => {
    const user = userEvent.setup();
    const clients = [{ id: 'a', name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" />);
    await user.click(screen.getByText('Acme'));
    expect(telemetryMocks.trackDashboardKpi).toHaveBeenCalledWith('dashboard_document_opened', {
      kpiId: 'kpi_ux_dashboard_to_document',
      entityType: 'business_partner',
      source: 'dashboard_top_clients',
    });
  });

  it('navigates to the route resolved from client navigation (a)', async () => {
    const user = userEvent.setup();
    resolveNavigationMock.mockReturnValueOnce('/contacts/custom-route');
    const clients = [{ id: 'a', name: 'Acme', total: 250, navigation: { window: 'x' } }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts/custom-route'));
  });

  it('navigates to /contacts/<id> when no nav route but id is present (b)', async () => {
    const user = userEvent.setup();
    const clients = [{ id: 'abc123', name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts/abc123'));
  });

  it('resolves /contacts/<exactId> via fetch exact name match (c)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'matched-id', name: 'Acme' }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const clients = [{ name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" token="tok" apiBaseUrl="/api" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts/matched-id'));
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to /contacts when fetch returns not ok (d)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const clients = [{ name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" token="tok" apiBaseUrl="/api" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts'));
  });

  it('falls back to /contacts when fetch returns empty rows (e)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    }));
    const clients = [{ name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" token="tok" apiBaseUrl="/api" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts'));
  });

  it('falls back to /contacts when fetch throws (f)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const clients = [{ name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" token="tok" apiBaseUrl="/api" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts'));
  });

  it('falls back to /contacts without fetch when token/apiBaseUrl/name missing (g)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const clients = [{ name: 'Acme', total: 250 }];
    // no token / apiBaseUrl provided
    render(<TopClientsList clients={clients} currencyLabel="EUR" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles a row without a name (key fallback) and treats missing name as no-fetch', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // name absent -> resolveClientRoute: name = '' -> returns /contacts, no fetch
    const clients = [{ id: undefined, total: 100 }];
    const { container } = render(
      <TopClientsList clients={clients} currencyLabel="EUR" token="tok" apiBaseUrl="/api" />,
    );
    await user.click(container.querySelector('button'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to /contacts when fetch json has no response.data array', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    const clients = [{ name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" token="tok" apiBaseUrl="/api" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts'));
  });

  it('uses fetch fallback row (rows[0]) when no exact name match', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'first-id', name: 'Other' }] } }),
    }));
    const clients = [{ name: 'Acme', total: 250 }];
    render(<TopClientsList clients={clients} currencyLabel="EUR" token="tok" apiBaseUrl="/api" />);
    await user.click(screen.getByText('Acme'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/contacts/first-id'));
  });
});

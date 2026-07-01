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
  formatDashboardNumber: (val) => `n${val}`,
  localeFromUi: (locale) => locale,
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

import { BestProductsList } from '../BestProductsList.jsx';

describe('BestProductsList', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    openCopilotMock.mockReset();
    telemetryMocks.trackDashboardKpi.mockReset();
  });

  it('renders the header title from useUI', () => {
    render(<BestProductsList sellers={[]} products={[]} currencyLabel="EUR" />);
    expect(screen.getByText('bestProductsTitle')).toBeInTheDocument();
  });

  it('shows empty state when both sellers and products are empty', () => {
    render(<BestProductsList sellers={[]} products={[]} currencyLabel="EUR" />);
    expect(screen.getByText('bestProductsEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('bestProductsEmptySubtitle')).toBeInTheDocument();
  });

  it('does not show empty state when sellers has rows', () => {
    render(
      <BestProductsList
        sellers={[{ name: 'Seller A', qty: 10, amount: 100, trendPct: 0 }]}
        products={[]}
        currencyLabel="EUR"
      />,
    );
    expect(screen.queryByText('bestProductsEmptyTitle')).not.toBeInTheDocument();
  });

  it('renders sellers by default (quantity mode)', () => {
    render(
      <BestProductsList
        sellers={[{ name: 'Seller A', qty: 10, amount: 100, trendPct: 0 }]}
        products={[{ name: 'Product X', qty: 1, amount: 50, trendPct: 0 }]}
        currencyLabel="EUR"
      />,
    );
    expect(screen.getByText('Seller A')).toBeInTheDocument();
    expect(screen.queryByText('Product X')).not.toBeInTheDocument();
  });

  it('switches to products when the revenue toggle is clicked', async () => {
    const user = userEvent.setup();
    render(
      <BestProductsList
        sellers={[{ name: 'Seller A', qty: 10, amount: 100, trendPct: 0 }]}
        products={[{ name: 'Product X', qty: 1, amount: 50, trendPct: 0 }]}
        currencyLabel="EUR"
      />,
    );
    await user.click(screen.getByText('bestProductsToggleRevenue'));
    expect(screen.getByText('Product X')).toBeInTheDocument();
    expect(screen.queryByText('Seller A')).not.toBeInTheDocument();
  });

  it('marks the active toggle with a boxShadow', async () => {
    const user = userEvent.setup();
    render(
      <BestProductsList
        sellers={[{ name: 'Seller A', qty: 10, amount: 100, trendPct: 0 }]}
        products={[{ name: 'Product X', qty: 1, amount: 50, trendPct: 0 }]}
        currencyLabel="EUR"
      />,
    );
    const qtyBtn = screen.getByText('bestProductsToggleUnits').closest('button');
    const revBtn = screen.getByText('bestProductsToggleRevenue').closest('button');
    // Initially quantity is active.
    expect(qtyBtn?.style.boxShadow).not.toBe('none');
    expect(qtyBtn?.style.boxShadow).not.toBe('');
    expect(revBtn?.style.boxShadow === 'none' || revBtn?.style.boxShadow === '').toBe(true);
    // After clicking revenue, the active state flips.
    await user.click(revBtn);
    expect(revBtn?.style.boxShadow).not.toBe('none');
    expect(revBtn?.style.boxShadow).not.toBe('');
  });

  it('shows the positive trend banner when at least one row has trendPct > 0', () => {
    render(
      <BestProductsList
        sellers={[
          { name: 'A', qty: 10, amount: 100, trendPct: 5 },
          { name: 'B', qty: 5, amount: 50, trendPct: -3 },
        ]}
        products={[]}
        currencyLabel="EUR"
      />,
    );
    expect(screen.getByText('bestProductsTrendPositive')).toBeInTheDocument();
    expect(screen.queryByText('bestProductsTrendNegative')).not.toBeInTheDocument();
  });

  it('shows the negative trend banner only when no positives and at least one negative', () => {
    render(
      <BestProductsList
        sellers={[
          { name: 'A', qty: 10, amount: 100, trendPct: -5 },
          { name: 'B', qty: 5, amount: 50, trendPct: 0 },
        ]}
        products={[]}
        currencyLabel="EUR"
      />,
    );
    expect(screen.getByText('bestProductsTrendNegative')).toBeInTheDocument();
    expect(screen.queryByText('bestProductsTrendPositive')).not.toBeInTheDocument();
  });

  it('shows neither banner when all rows have trendPct of 0', () => {
    render(
      <BestProductsList
        sellers={[{ name: 'A', qty: 10, amount: 100, trendPct: 0 }]}
        products={[]}
        currencyLabel="EUR"
      />,
    );
    expect(screen.queryByText('bestProductsTrendPositive')).not.toBeInTheDocument();
    expect(screen.queryByText('bestProductsTrendNegative')).not.toBeInTheDocument();
  });

  it('invokes openCopilot in the empty state', async () => {
    const user = userEvent.setup();
    render(<BestProductsList sellers={[]} products={[]} currencyLabel="EUR" />);
    await user.click(screen.getByText('createWithCopilot'));
    expect(openCopilotMock).toHaveBeenCalledTimes(1);
  });

  it('tracks dashboard product navigation without product identifiers', async () => {
    const user = userEvent.setup();
    render(
      <BestProductsList
        sellers={[]}
        products={[{ id: 'prod-1', name: 'Product X', qty: 1, amount: 50, trendPct: 0 }]}
        currencyLabel="EUR"
      />,
    );

    await user.click(screen.getByText('bestProductsToggleRevenue'));
    await user.click(screen.getByText('Product X'));

    expect(telemetryMocks.trackDashboardKpi).toHaveBeenCalledWith('dashboard_document_opened', {
      kpiId: 'kpi_ux_dashboard_to_document',
      entityType: 'product',
      source: 'dashboard_best_products',
    });
    expect(navigateMock).toHaveBeenCalledWith('/product/prod-1');
  });
});

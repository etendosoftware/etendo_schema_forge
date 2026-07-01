/**
 * Tests for ContactsSummaryWidget — horizontal KPI summary in the headerContent slot.
 *
 * Trend badges are period-aware and computed from the bp-trend series via the
 * internal `windowTrend(arr, months)` helper:
 *   - slice the last N months (3M→3, 6M→6) and compute ((last − first)/|first|)*100
 *   - null (no badge) when the window has < 2 points or the first month is 0/non-finite
 *   - Net Balance trend = windowTrend over the per-month (revenue[i] − expenses[i]) array
 * KPI values still come from bp-stats (revenueThisMonth / expensesThisMonth).
 */

// ─── Mocks before imports ────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('lucide-react', () => ({
  ArrowUp: () => <span data-testid="icon-arrow-up" />,
  ArrowDown: () => <span data-testid="icon-arrow-down" />,
  LineChart: () => <span data-testid="icon-line-chart" />,
  ChevronDown: () => <span data-testid="icon-chevron" />,
  Calendar: () => <span data-testid="icon-calendar" />,
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'USD',
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (_currency, val) => `$${val}`,
}));

vi.mock('../BPChartSVGContent', () => ({
  BPChartSVGContent: () => <svg data-testid="bp-chart-svg" />,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}));

// ─── Imports after mocks ─────────────────────────────────────────────────────

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsFinanceProvider } from '../ContactsFinanceContext';
import ContactsPeriodButton from '../ContactsPeriodButton';
import ContactsSummaryWidget from '../ContactsSummaryWidget';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATS_DATA = [
  { key: 'revenueThisMonth', value: 1300 },
  { key: 'expensesThisMonth', value: 550 },
];

// 6-month series. Chosen so 3M and 6M windows yield clearly different % values:
//   revenue 3M window [1100,1200,1300] → ((1300-1100)/1100)*100 ≈ 18% (+18%)
//   revenue 6M window [800..1300]      → ((1300-800)/800)*100   = 62.5% (+63%)
//   expenses 3M window [450,500,550]   → ((550-450)/450)*100    ≈ 22% (+22%)
const TREND_DATA = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  revenue: [800, 900, 1000, 1100, 1200, 1300],
  expenses: [300, 350, 400, 450, 500, 550],
};

function mockFetch({ stats = STATS_DATA, trend = TREND_DATA } = {}) {
  globalThis.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('bp-stats')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ response: { data: stats } }),
      });
    }
    if (url.includes('bp-trend')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ response: { data: trend } }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

function Wrapper({ children }) {
  return (
    <ContactsFinanceProvider token="tok" apiBaseUrl="/api">
      {children}
    </ContactsFinanceProvider>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ContactsSummaryWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── No render with data.id ────────────────────────────────────────────────

  it('returns null when data has no id', () => {
    const { container } = render(
      <Wrapper>
        <ContactsSummaryWidget data={{}} />
      </Wrapper>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when data is null', () => {
    const { container } = render(
      <Wrapper>
        <ContactsSummaryWidget data={null} />
      </Wrapper>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('throws when used outside ContactsFinanceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<ContactsSummaryWidget data={null} />),
    ).toThrow('useContactsFinance must be used inside ContactsFinanceProvider');
    spy.mockRestore();
  });

  // ── Loading + render ────────────────────────────────────────────────────────

  it('renders loading skeletons while stats are being fetched', () => {
    // The provider starts stats=null, so the first synchronous render shows skeletons.
    const { container } = render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThanOrEqual(3);
  });

  it('renders KPI labels after stats load', async () => {
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('bpNetBalance')).toBeInTheDocument();
      expect(screen.getByText('bpRevenue')).toBeInTheDocument();
      expect(screen.getByText('bpExpenses')).toBeInTheDocument();
    });
  });

  it('renders View chart button after stats load', async () => {
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('bpViewChart')).toBeInTheDocument();
    });
  });

  it('shows no loading skeletons after stats load', async () => {
    const { container } = render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => screen.getByText('bpNetBalance'));
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls).toHaveLength(0);
  });

  // ── KPI values from bp-stats ──────────────────────────────────────────────

  it('derives net balance value as income minus expenses (from bp-stats)', async () => {
    // income=1300, expenses=550 → net = 750
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('$750')).toBeInTheDocument();
    });
  });

  it('renders income and expenses KPI values from bp-stats', async () => {
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('$1300')).toBeInTheDocument(); // income
      expect(screen.getByText('$550')).toBeInTheDocument();  // expenses
    });
  });

  // ── Period-aware trend badges ──────────────────────────────────────────────

  it('renders trend badges computed from bp-trend for the default 3M period', async () => {
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => screen.getByText('bpNetBalance'));

    // Default period is 3M → badges use the "vs last 3 months" label.
    const badges = screen.getAllByText(/bpVsLast3Months/);
    expect(badges.length).toBe(3); // net balance + income + expenses

    // 3M revenue window [1100,1200,1300] → +18%
    expect(screen.getByText(/\+18% bpVsLast3Months/)).toBeInTheDocument();
    // 3M expenses window [450,500,550] → +22%
    expect(screen.getByText(/\+22% bpVsLast3Months/)).toBeInTheDocument();
  });

  it('recomputes trend badges when the period switches to 6M', async () => {
    const user = userEvent.setup();
    // Both the widget and the period button share the same provider so changing
    // the period via the button re-renders the widget badges.
    render(
      <Wrapper>
        <ContactsPeriodButton />
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );

    await waitFor(() => screen.getByText('bpNetBalance'));
    // Sanity: 3M revenue badge shows +18%
    expect(screen.getByText(/\+18% bpVsLast3Months/)).toBeInTheDocument();

    // Switch to 6M via the shared period button
    await user.click(screen.getByRole('button', { name: /bpLast3Months/ }));
    await user.click(screen.getByText('bpLast6Months'));

    await waitFor(() => {
      // Badges now use the "vs last 6 months" label
      expect(screen.getAllByText(/bpVsLast6Months/).length).toBe(3);
    });
    // 6M revenue window [800..1300] → +63% (different from the 3M +18%)
    expect(screen.getByText(/\+63% bpVsLast6Months/)).toBeInTheDocument();
    // The old 3M badge value is gone
    expect(screen.queryByText(/\+18% bpVsLast3Months/)).not.toBeInTheDocument();
  });

  it('renders no trend badges when bp-trend has fewer than 2 points', async () => {
    mockFetch({
      trend: { labels: ['Jun'], revenue: [1000], expenses: [400] },
    });
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => screen.getByText('bpNetBalance'));

    expect(screen.queryByText(/bpVsLast3Months/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bpVsLast6Months/)).not.toBeInTheDocument();
  });

  it('suppresses the badge for a KPI whose first window month is zero', async () => {
    // Income 3M window [0,100,200] → first=0 → null (no badge).
    mockFetch({
      stats: [
        { key: 'revenueThisMonth', value: 200 },
        { key: 'expensesThisMonth', value: 80 },
      ],
      trend: {
        labels: ['Apr', 'May', 'Jun'],
        revenue: [0, 100, 200],
        expenses: [40, 60, 80],
      },
    });
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => screen.getByText('bpRevenue'));

    // Expenses window [40,60,80] → ((80-40)/40)*100 = +100% — badge present
    expect(screen.getByText(/\+100% bpVsLast3Months/)).toBeInTheDocument();
    // Net window [(0-40),(100-60),(200-80)] = [-40,40,120] first=-40 →
    //   ((120-(-40))/|−40|)*100 = +400% — badge present
    expect(screen.getByText(/\+400% bpVsLast3Months/)).toBeInTheDocument();
    // Income badge suppressed (first month 0) → only 2 badges total
    expect(screen.getAllByText(/bpVsLast3Months/).length).toBe(2);
  });

  // ── Chart dialog ───────────────────────────────────────────────────────────

  it('opens the chart dialog when View chart is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => screen.getByText('bpViewChart'));
    await user.click(screen.getByText('bpViewChart'));

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('bp-chart-svg')).toBeInTheDocument();
  });

  // ── Fetch wiring ───────────────────────────────────────────────────────────

  it('calls useSyncFinanceRecordId with data.id — triggers bp-stats fetch', async () => {
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP-TEST' }} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('bp-stats?businessPartnerId=BP-TEST'),
        expect.anything(),
      );
    });
  });

  it('renders correctly with empty stats array (zeroed KPIs, no badges)', async () => {
    mockFetch({ stats: [], trend: { labels: [], revenue: [], expenses: [] } });
    render(
      <Wrapper>
        <ContactsSummaryWidget data={{ id: 'BP1' }} />
      </Wrapper>,
    );
    await waitFor(() => screen.getByText('bpNetBalance'));
    // All three KPIs (net/income/expenses) are 0 → three "$0" values.
    expect(screen.getAllByText('$0')).toHaveLength(3);
    // empty trend arrays → no badges
    expect(screen.queryByText(/bpVsLast3Months/)).not.toBeInTheDocument();
  });
});

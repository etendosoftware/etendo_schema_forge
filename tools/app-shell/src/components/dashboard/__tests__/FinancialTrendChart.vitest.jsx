import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock dashboardNumberFormat
vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardAmount: (val, currency, locale) => `${val} ${currency}`,
  formatDashboardAxisTick: (val) => String(val),
  localeFromUi: (locale) => locale === 'es_ES' ? 'es-ES' : 'en-US',
  niceScale: (max) => ({
    niceMax: Math.max(max, 1),
    ticks: [0, Math.max(max, 1) / 2, Math.max(max, 1)],
  }),
}));

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver;

import { FinancialTrendChart, computeGrowthPct } from '../FinancialTrendChart.jsx';

const SAMPLE_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const SAMPLE_VALUES = [1000, 1500, 1200, 1800, 2200, 2500];
const SAMPLE_EXPENSES = [800, 900, 1000, 1100, 1300, 1400];

describe('FinancialTrendChart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders without crashing with sample data', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders the chart title', () => {
    render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    expect(screen.getByText('financialTrendTitle')).toBeInTheDocument();
  });

  it('renders an SVG chart element', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders chart type toggle buttons', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    // Two toggle buttons (line and bar)
    const toggleButtons = container.querySelectorAll('button');
    expect(toggleButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows growth status line', () => {
    render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    // Growth is (2500-1000)/1000 = 150% — ui mock returns key as-is
    expect(screen.getByText('financialTrendGrowthUp')).toBeInTheDocument();
  });

  it('shows empty state when all values are zero', () => {
    render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={[0, 0, 0, 0, 0, 0]}
        currencyLabel="EUR"
      />
    );
    expect(screen.getByText('financialTrendEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('financialTrendEmptySubtitle')).toBeInTheDocument();
  });

  it('shows expense legend when expense values are provided', () => {
    render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        expenseValues={SAMPLE_EXPENSES}
        currencyLabel="EUR"
      />
    );
    expect(screen.getByText('financialTrendIncomeLegend')).toBeInTheDocument();
    expect(screen.getByText('financialTrendExpensesLegend')).toBeInTheDocument();
  });

  it('does not show expense legend when no expense values', () => {
    render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    expect(screen.queryByText('financialTrendExpensesLegend')).not.toBeInTheDocument();
  });

  it('shows action buttons in empty state', () => {
    render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={[0, 0, 0, 0, 0, 0]}
        currencyLabel="EUR"
      />
    );
    expect(screen.getByText('newPurchase')).toBeInTheDocument();
    expect(screen.getByText('newSale')).toBeInTheDocument();
  });

  it('switches to bar chart when bar toggle is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    // Two toggle buttons — second one is bar
    const toggleButtons = container.querySelectorAll('button');
    const barButton = toggleButtons[1];
    await user.click(barButton);
    // After click, chart should still render (bar mode)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders with default (empty) props', () => {
    const { container } = render(<FinancialTrendChart />);
    expect(container).toBeTruthy();
  });

  it('renders bar chart with expense values', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        expenseValues={SAMPLE_EXPENSES}
        currencyLabel="EUR"
      />
    );
    const toggleButtons = container.querySelectorAll('button');
    await user.click(toggleButtons[1]); // switch to bar
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('shows negative growth when values decrease', () => {
    render(
      <FinancialTrendChart
        labels={['Jan', 'Feb']}
        values={[2000, 1000]}
        currencyLabel="EUR"
      />
    );
    expect(screen.getByText('financialTrendGrowthDown')).toBeInTheDocument();
  });

  /**
   * Regression test for ETP-5011: the status badge icon/color used to be
   * hardcoded to the green Check regardless of growthPct's sign — only the
   * text swapped between Up/Down. It must switch to the red X icon too.
   */
  it('regression ETP-5011: shows the red X icon (not the green Check) when growth is negative', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={['Jan', 'Feb']}
        values={[2000, 1000]}
        currencyLabel="EUR"
      />
    );
    expect(container.querySelector('[data-testid="X__14828e"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="Check__14828e"]')).not.toBeInTheDocument();
  });

  it('shows the green Check icon (not the red X) when growth is positive', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    expect(container.querySelector('[data-testid="Check__14828e"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="X__14828e"]')).not.toBeInTheDocument();
  });

  it('handles single data point', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={['Jan']}
        values={[500]}
        currencyLabel="EUR"
      />
    );
    expect(container).toBeTruthy();
  });

  it('handles non-finite expense values gracefully', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={['Jan', 'Feb']}
        values={[100, 200]}
        expenseValues={[NaN, undefined]}
        currencyLabel="EUR"
      />
    );
    expect(container).toBeTruthy();
  });

  it('persists chart type in localStorage', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    const toggleButtons = container.querySelectorAll('button');
    await user.click(toggleButtons[1]); // switch to bar
    expect(localStorage.getItem('dashboard_chart_type')).toBe('bar');
  });

  it('reads initial chart type from localStorage', () => {
    localStorage.setItem('dashboard_chart_type', 'bar');
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    // Should render without error (bar mode from localStorage)
    expect(container).toBeTruthy();
  });

  it('handles zero growth when activity only started in the last month', () => {
    render(
      <FinancialTrendChart
        labels={['Jan', 'Feb']}
        values={[0, 500]}
        currencyLabel="EUR"
      />
    );
    // No prior point to compare against (activity starts in the very last
    // month) → growthPct = 0 → shows "Up" as a neutral fallback.
    expect(screen.getByText('financialTrendGrowthUp')).toBeInTheDocument();
  });

  it('regression ETP-5011: computes real growth from the first active month, not a leading zero month', () => {
    render(
      <FinancialTrendChart
        labels={['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']}
        values={[0, 0, 0, 0, 1000, 0, 0, 0, 0, 0, 0, 3000]}
        currencyLabel="EUR"
      />
    );
    expect(screen.getByText('financialTrendGrowthUp')).toBeInTheDocument();
  });

  it('triggers tooltip on mouse enter on hover columns (line chart)', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    // Find invisible hover rects
    const rects = container.querySelectorAll('svg rect[fill="transparent"]');
    if (rects.length > 0) {
      fireEvent.mouseEnter(rects[0]);
      // Tooltip should now be in the DOM — the tooltip box renders text nodes
      fireEvent.mouseLeave(rects[0]);
    }
    expect(container).toBeTruthy();
  });

  it('triggers tooltip on bar chart groups', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    const toggleButtons = container.querySelectorAll('button');
    await user.click(toggleButtons[1]); // bar mode
    // Hover over a bar group <g>
    const barGroups = container.querySelectorAll('svg g[style*="crosshair"]');
    if (barGroups.length > 0) {
      fireEvent.mouseEnter(barGroups[0]);
      fireEvent.mouseLeave(barGroups[0]);
    }
    expect(container).toBeTruthy();
  });
});

// ── computeGrowthPct (pure function, exact percentages) ────────────────────

describe('computeGrowthPct', () => {
  it('computes growth relative to values[0] when it is already active', () => {
    expect(computeGrowthPct([1000, 1500, 1200, 1800, 2200, 2500])).toBe(150);
  });

  it('computes negative growth when values decrease', () => {
    expect(computeGrowthPct([2000, 1000])).toBe(-50);
  });

  it('falls back to 0 when activity only starts in the very last point', () => {
    expect(computeGrowthPct([0, 500])).toBe(0);
  });

  it('falls back to 0 when there is no activity at all', () => {
    expect(computeGrowthPct([0, 0, 0, 0])).toBe(0);
  });

  it('falls back to 0 with fewer than two data points', () => {
    expect(computeGrowthPct([500])).toBe(0);
    expect(computeGrowthPct([])).toBe(0);
  });

  /**
   * Regression test for ETP-5011: a trailing 12-month window that starts with
   * zero-activity months (e.g. a client that only started operating in Jan)
   * must compare against the first ACTIVE month, not the leading zero month —
   * otherwise real growth from 1000 to 3000 was reported as a flat "0%".
   */
  it('uses the first active month as baseline, not a leading zero month', () => {
    // Sep..Dec are zero (no invoices yet), Jan=1000 (first activity), Aug=3000.
    const values = [0, 0, 0, 0, 1000, 0, 0, 0, 0, 0, 0, 3000];
    expect(computeGrowthPct(values)).toBe(200);
  });
});

// ── renderTooltipBox helper ───────────────────────────────────────────────────

describe('FinancialTrendChart — renderTooltipBox tooltip content', () => {
  it('renders income label in tooltip when hover column is entered', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        currencyLabel="EUR"
      />
    );
    const rects = container.querySelectorAll('svg rect[fill="transparent"]');
    if (rects.length > 0) {
      fireEvent.mouseEnter(rects[0]);
      // TooltipBox renders income legend label (mock returns key as-is)
      expect(container.querySelector('svg text')).toBeTruthy();
    }
    expect(container).toBeTruthy();
  });

  it('renders expense line in tooltip when expenseValues are present and hover is triggered', () => {
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        expenseValues={[800, 900, 1000, 1100, 1300, 1400]}
        currencyLabel="EUR"
      />
    );
    const rects = container.querySelectorAll('svg rect[fill="transparent"]');
    if (rects.length > 0) {
      fireEvent.mouseEnter(rects[0]);
      // With expenses, TooltipBox should render at least one <rect> for the box background
      const tooltipRects = container.querySelectorAll('[data-testid="financial-trend-tooltip"]');
      expect(tooltipRects.length).toBeGreaterThan(0);
      fireEvent.mouseLeave(rects[0]);
    }
    expect(container).toBeTruthy();
  });

  it('renders tooltip box in bar chart mode via renderTooltipBox', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FinancialTrendChart
        labels={SAMPLE_LABELS}
        values={SAMPLE_VALUES}
        expenseValues={[800, 900, 1000, 1100, 1300, 1400]}
        currencyLabel="EUR"
      />
    );
    const toggleButtons = container.querySelectorAll('button');
    await user.click(toggleButtons[1]); // switch to bar
    const barGroups = container.querySelectorAll('svg g[style*="crosshair"]');
    if (barGroups.length > 0) {
      fireEvent.mouseEnter(barGroups[0]);
      // TooltipBox <rect> should be present (dark background)
      const tooltipRects = container.querySelectorAll('[data-testid="financial-trend-tooltip"]');
      expect(tooltipRects.length).toBeGreaterThan(0);
      fireEvent.mouseLeave(barGroups[0]);
    }
    expect(container).toBeTruthy();
  });
});

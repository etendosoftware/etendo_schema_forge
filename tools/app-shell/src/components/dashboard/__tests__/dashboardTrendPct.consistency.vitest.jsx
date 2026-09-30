import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const templates = {
      yoyUp: 'UP {pct}% {comparison}',
      yoyDown: 'DOWN {pct}% {comparison}',
      financialTrendGrowthUp: 'UP {pct}% {comparison}',
      financialTrendGrowthDown: 'DOWN {pct}% {comparison}',
    };
    const tpl = templates[key];
    if (!tpl) return key;
    return params ? tpl.replace('{pct}', params.pct).replace('{comparison}', params.comparison) : tpl;
  },
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardCompact: (value) => String(value),
  formatDashboardAmount: (val, currency) => `${val} ${currency}`,
  formatDashboardAxisTick: (val) => String(val),
  localeFromUi: () => 'en-US',
  niceScale: (max) => ({ niceMax: Math.max(max, 1), ticks: [0, Math.max(max, 1)] }),
}));

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { FinancialSummaryCard } from '../FinancialSummaryCard.jsx';
import { FinancialTrendChart } from '../FinancialTrendChart.jsx';

// ETP-5493: both cards must print the same figure for the same backend value.
describe('trend pct consistency between FinancialSummaryCard and FinancialTrendChart', () => {
  it.each([
    [4113.8, '4114'],
    [-12.5, '13'],
    [0.4, '0'],
  ])('renders %s as %s in both cards', (trend, expected) => {
    const kpis = [
      { key: 'revenueThisMonth', value: 5000, trend },
      { key: 'expensesThisMonth', value: 2000, trend: 0, hasPrevious: false },
      { key: 'netProfit', value: 3000, trend: 0, hasPrevious: false },
    ];
    const summary = render(<FinancialSummaryCard kpis={kpis} currencyLabel="EUR" range="ytd" />);
    const summaryText = summary.container.textContent;
    expect(summaryText).toContain(`${expected}% financialSummaryComparisonYtd`);
    summary.unmount();

    const chart = render(
      <FinancialTrendChart labels={['a', 'b']} values={[10, 20]} currencyLabel="EUR" growthPct={trend} hasPrevious range="ytd" />,
    );
    expect(screen.getByText(new RegExp(`${expected}% financialSummaryComparisonYtd`))).toBeInTheDocument();
    expect(chart.container.querySelector('[data-testid="financial-trend-status"]').textContent).toContain(
      `${expected}% financialSummaryComparisonYtd`,
    );
  });
});

const SUCCESS_BG = 'var(--status-success-bg)';
const DESTRUCTIVE_BG = 'var(--status-destructive-bg)';

function renderSummaryRevenue(trend) {
  const kpis = [
    { key: 'revenueThisMonth', value: 5000, trend },
    { key: 'expensesThisMonth', value: 2000, trend: 0, hasPrevious: false },
    { key: 'netProfit', value: 3000, trend: 0, hasPrevious: false },
  ];
  const utils = render(<FinancialSummaryCard kpis={kpis} currencyLabel="EUR" range="ytd" />);
  const block = screen.getByText('financialSummaryIncome').parentElement.parentElement;
  const icon = block.querySelector('[data-testid="TrendIcon__81e75f"]');
  return {
    ...utils,
    text: block.textContent,
    arrow: icon.getAttribute('class').match(/arrow-(up|down)/)[1],
    badgeStyle: icon.parentElement.getAttribute('style') ?? '',
  };
}

function renderChart(trend) {
  const utils = render(
    <FinancialTrendChart labels={['a', 'b']} values={[10, 20]} currencyLabel="EUR" growthPct={trend} hasPrevious range="ytd" />,
  );
  return {
    ...utils,
    status: utils.container.querySelector('[data-testid="financial-trend-status"]').textContent,
    hasCheck: !!utils.container.querySelector('[data-testid="Check__14828e"]'),
    hasX: !!utils.container.querySelector('[data-testid="X__14828e"]'),
  };
}

describe('rounded-direction consistency (ETP-5493 N2)', () => {
  it('-0.4 prints "0%" as flat in both cards: up arrow + neutral-green, Up copy + green Check, no X', () => {
    const summary = renderSummaryRevenue(-0.4);
    expect(summary.text).toContain('0% financialSummaryComparisonYtd');
    expect(summary.text).toContain('UP');
    expect(summary.arrow).toBe('up');
    expect(summary.badgeStyle).toContain(SUCCESS_BG);
    expect(summary.badgeStyle).not.toContain(DESTRUCTIVE_BG);
    summary.unmount();

    const chart = renderChart(-0.4);
    expect(chart.status).toBe('UP 0% financialSummaryComparisonYtd');
    expect(chart.hasCheck).toBe(true);
    expect(chart.hasX).toBe(false);
  });

  it('-0.6 prints "1%" as down in both cards: down arrow + red, Down copy + X icon', () => {
    const summary = renderSummaryRevenue(-0.6);
    expect(summary.text).toContain('1% financialSummaryComparisonYtd');
    expect(summary.text).toContain('DOWN');
    expect(summary.arrow).toBe('down');
    expect(summary.badgeStyle).toContain(DESTRUCTIVE_BG);
    summary.unmount();

    const chart = renderChart(-0.6);
    expect(chart.status).toBe('DOWN 1% financialSummaryComparisonYtd');
    expect(chart.hasX).toBe(true);
    expect(chart.hasCheck).toBe(false);
  });

  it.each([-0.6, -0.5, -0.4, 0, 0.4, 0.5, 0.6, 12.5, -12.5])('%s gets the same direction in both cards', (trend) => {
    const summary = renderSummaryRevenue(trend);
    const summaryDown = summary.arrow === 'down';
    summary.unmount();
    const chart = renderChart(trend);

    expect(chart.hasX).toBe(summaryDown);
    expect(chart.hasCheck).toBe(!summaryDown);
    expect(chart.status.startsWith('DOWN')).toBe(summaryDown);
  });

  it('-0.5 prints "1%" and goes down in both cards (half away from zero)', () => {
    const summary = renderSummaryRevenue(-0.5);
    expect(summary.text).toContain('1% financialSummaryComparisonYtd');
    expect(summary.text).toContain('DOWN');
    expect(summary.arrow).toBe('down');
    expect(summary.badgeStyle).toContain(DESTRUCTIVE_BG);
    summary.unmount();

    const chart = renderChart(-0.5);
    expect(chart.status).toBe('DOWN 1% financialSummaryComparisonYtd');
    expect(chart.hasX).toBe(true);
    expect(chart.hasCheck).toBe(false);
  });

  it('+0.5 prints "1%" and goes up in both cards', () => {
    const summary = renderSummaryRevenue(0.5);
    expect(summary.text).toContain('1% financialSummaryComparisonYtd');
    expect(summary.text).toContain('UP');
    expect(summary.arrow).toBe('up');
    expect(summary.badgeStyle).toContain(SUCCESS_BG);
    summary.unmount();

    const chart = renderChart(0.5);
    expect(chart.status).toBe('UP 1% financialSummaryComparisonYtd');
    expect(chart.hasCheck).toBe(true);
    expect(chart.hasX).toBe(false);
  });
});

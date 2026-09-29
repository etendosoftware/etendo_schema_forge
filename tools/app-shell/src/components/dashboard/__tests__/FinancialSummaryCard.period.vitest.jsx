import { render, screen, within } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// ETP-5493: the copy is interpolated, so the mock echoes the params next to the key. That lets
// the tests assert which period/comparison fragment was injected without hardcoding English.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardCompact: (value) => String(value),
  localeFromUi: (locale) => (locale === 'es_ES' ? 'es-ES' : 'en-US'),
}));

import { FinancialSummaryCard } from '../FinancialSummaryCard.jsx';

const TREND_ICON = '[data-testid="TrendIcon__81e75f"]';
const NO_TREND = '[data-testid="financial-summary-no-trend"]';

function kpis({ revenue = 10, expenses = 5, profit = 20, flags = {} } = {}) {
  return [
    { key: 'revenueThisMonth', value: 5000, trend: revenue, ...flags.revenue },
    { key: 'expensesThisMonth', value: 2000, trend: expenses, ...flags.expenses },
    { key: 'netProfit', value: 3000, trend: profit, ...flags.profit },
  ];
}

/** The metric block (label + value + badge) that owns the given label key. */
function metricBlock(labelKey) {
  return screen.getByText(labelKey).parentElement.parentElement;
}

const SUCCESS_BG = 'var(--status-success-bg)';
const DESTRUCTIVE_BG = 'var(--status-destructive-bg)';

/** Inline CSS variables are not reliably exposed by jsdom's CSSStyleDeclaration, so read the raw attribute. */
function badgeOf(block) {
  const icon = block.querySelector(TREND_ICON);
  return icon ? icon.parentElement : null;
}
function styleAttr(el) {
  return el.getAttribute('style') ?? '';
}

describe('FinancialSummaryCard — period copy follows the range', () => {
  const RANGES = [
    ['ytd', 'Ytd'],
    ['mtd', 'Mtd'],
    ['last30d', 'Last30d'],
    ['last90d', 'Last90d'],
    ['lastYear', 'LastYear'],
  ];

  it.each(RANGES)('range %s renders the matching period and comparison keys', (range, suffix) => {
    const { container } = render(<FinancialSummaryCard kpis={kpis()} currencyLabel="EUR" range={range} />);

    expect(screen.getByText(`financialSummaryPositive{"period":"financialSummaryPeriod${suffix}"}`)).toBeInTheDocument();
    expect(container.textContent).toContain(`"comparison":"financialSummaryComparison${suffix}"`);
    // Every one of the 3 badges carries the same comparison fragment.
    expect(container.textContent.split(`"comparison":"financialSummaryComparison${suffix}"`).length - 1).toBe(3);
  });

  it('uses the negative headline with the period fragment when the profit is negative', () => {
    render(
      <FinancialSummaryCard
        kpis={kpis({ profit: -10, flags: { profit: { value: -3000 } } })}
        currencyLabel="EUR"
        range="mtd"
      />,
    );
    expect(screen.getByText('financialSummaryNegative{"period":"financialSummaryPeriodMtd"}')).toBeInTheDocument();
  });

  it.each([[undefined], [null], ['']])('a missing/blank range %j uses the Ytd keys (backend default)', (range) => {
    const { container } = render(<FinancialSummaryCard kpis={kpis()} currencyLabel="EUR" range={range} />);

    expect(screen.getByText('financialSummaryPositive{"period":"financialSummaryPeriodYtd"}')).toBeInTheDocument();
    expect(container.textContent).toContain('"comparison":"financialSummaryComparisonYtd"');
    expect(container.textContent).not.toContain('financialSummaryComparisonMtd');
  });

  it('an unknown non-blank range uses the LastYear keys (backend rolling 12 months)', () => {
    const { container } = render(<FinancialSummaryCard kpis={kpis()} currencyLabel="EUR" range="unknown-range" />);

    expect(screen.getByText('financialSummaryPositive{"period":"financialSummaryPeriodLastYear"}')).toBeInTheDocument();
    expect(container.textContent).toContain('"comparison":"financialSummaryComparisonLastYear"');
    expect(container.textContent).not.toContain('financialSummaryComparisonYtd');
  });
});

describe('FinancialSummaryCard — badge tone', () => {
  it('expenses up is destructive with an up arrow and the yoyUp copy', () => {
    const { container } = render(<FinancialSummaryCard kpis={kpis({ expenses: 5 })} currencyLabel="EUR" />);
    const block = metricBlock('financialSummaryExpenses');
    const badge = badgeOf(block);

    expect(styleAttr(badge)).toContain(DESTRUCTIVE_BG);
    expect(styleAttr(badge)).not.toContain(SUCCESS_BG);
    expect(block.querySelector('svg').getAttribute('class')).toMatch(/arrow-up/);
    expect(within(block).getByText(/^yoyUp/)).toBeInTheDocument();
    expect(within(block).queryByText(/^yoyDown/)).not.toBeInTheDocument();
    expect(container.querySelectorAll(TREND_ICON)).toHaveLength(3);
  });

  it('expenses down is success with a down arrow and the yoyDown copy', () => {
    render(<FinancialSummaryCard kpis={kpis({ expenses: -5 })} currencyLabel="EUR" />);
    const block = metricBlock('financialSummaryExpenses');
    const badge = badgeOf(block);

    expect(styleAttr(badge)).toContain(SUCCESS_BG);
    expect(styleAttr(badge)).not.toContain(DESTRUCTIVE_BG);
    expect(block.querySelector('svg').getAttribute('class')).toMatch(/arrow-down/);
    expect(within(block).getByText(/^yoyDown/)).toBeInTheDocument();
  });

  it('expenses at trend 0 keeps the neutral (positive) tone and up arrow', () => {
    render(<FinancialSummaryCard kpis={kpis({ expenses: 0 })} currencyLabel="EUR" />);
    const block = metricBlock('financialSummaryExpenses');
    const badge = badgeOf(block);

    expect(styleAttr(badge)).toContain(SUCCESS_BG);
    expect(block.querySelector('svg').getAttribute('class')).toMatch(/arrow-up/);
    expect(within(block).getByText(/^yoyUp/)).toBeInTheDocument();
  });

  it.each([['financialSummaryIncome'], ['financialSummaryProfit']])(
    '%s up is success with an up arrow',
    (labelKey) => {
      render(<FinancialSummaryCard kpis={kpis({ revenue: 12, profit: 12 })} currencyLabel="EUR" />);
      const block = metricBlock(labelKey);
      expect(styleAttr(badgeOf(block))).toContain(SUCCESS_BG);
      expect(block.querySelector('svg').getAttribute('class')).toMatch(/arrow-up/);
      expect(within(block).getByText(/^yoyUp/)).toBeInTheDocument();
    },
  );

  it.each([['financialSummaryIncome'], ['financialSummaryProfit']])(
    '%s down is destructive with a down arrow',
    (labelKey) => {
      render(<FinancialSummaryCard kpis={kpis({ revenue: -12, profit: -12 })} currencyLabel="EUR" />);
      const block = metricBlock(labelKey);
      expect(styleAttr(badgeOf(block))).toContain(DESTRUCTIVE_BG);
      expect(block.querySelector('svg').getAttribute('class')).toMatch(/arrow-down/);
      expect(within(block).getByText(/^yoyDown/)).toBeInTheDocument();
    },
  );
});

describe('FinancialSummaryCard — hasPrevious', () => {
  it('shows the muted no-trend text and no badge when hasPrevious is false', () => {
    const flags = { expenses: { hasPrevious: false } };
    render(<FinancialSummaryCard kpis={kpis({ flags })} currencyLabel="EUR" />);
    const block = metricBlock('financialSummaryExpenses');

    const noTrend = block.querySelector(NO_TREND);
    expect(noTrend).toBeInTheDocument();
    expect(noTrend).toHaveTextContent('financialSummaryNoPrevious');
    expect(block.querySelector(TREND_ICON)).toBeNull();
    expect(within(block).queryByText(/yoyUp|yoyDown/)).not.toBeInTheDocument();

    const style = styleAttr(noTrend);
    expect(style).toContain('color: hsl(var(--muted-foreground))');
    expect(style).not.toMatch(/background/i);
  });

  it.each([[true], [undefined]])('shows the badge and no no-trend element when hasPrevious is %s', (hasPrevious) => {
    const flags = {
      revenue: { hasPrevious },
      expenses: { hasPrevious },
      profit: { hasPrevious },
    };
    const { container } = render(<FinancialSummaryCard kpis={kpis({ flags })} currencyLabel="EUR" />);

    expect(container.querySelector(NO_TREND)).toBeNull();
    expect(container.querySelectorAll(TREND_ICON)).toHaveLength(3);
  });

  it('a mix of one false and two true renders 1 no-trend element and 2 badges', () => {
    const flags = { revenue: { hasPrevious: false }, expenses: { hasPrevious: true } };
    const { container } = render(<FinancialSummaryCard kpis={kpis({ flags })} currencyLabel="EUR" />);

    expect(container.querySelectorAll(NO_TREND)).toHaveLength(1);
    expect(container.querySelectorAll(TREND_ICON)).toHaveLength(2);
    expect(metricBlock('financialSummaryIncome').querySelector(NO_TREND)).toBeInTheDocument();
  });

  it('hides all trend badges when every kpi has no previous period', () => {
    const flags = {
      revenue: { hasPrevious: false },
      expenses: { hasPrevious: false },
      profit: { hasPrevious: false },
    };
    const { container } = render(<FinancialSummaryCard kpis={kpis({ flags })} currencyLabel="EUR" />);

    expect(container.querySelectorAll(NO_TREND)).toHaveLength(3);
    expect(container.querySelector(TREND_ICON)).toBeNull();
  });
});

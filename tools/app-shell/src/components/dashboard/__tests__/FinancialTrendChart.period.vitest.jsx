import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// ETP-5493: the growth copy is interpolated by the component, so the mock returns realistic
// templates for it (placeholders kept) and echoes the key for every other string. That lets the
// tests assert the pct and the comparison fragment without hardcoding translated copy.
const TEMPLATES = {
  financialTrendGrowthUp: 'UP {pct}% {comparison}',
  financialTrendGrowthDown: 'DOWN {pct}% {comparison}',
  financialTrendWeekOf: 'WEEKOF {date}',
};
let mockLocale = 'en_US';
vi.mock('@/i18n', () => ({
  useUI: () => (key) => TEMPLATES[key] ?? key,
  useLocaleSwitch: () => ({ locale: mockLocale, setLocale: vi.fn() }),
}));

vi.mock('@/lib/dashboardNumberFormat.js', () => ({
  formatDashboardAmount: (val, currency) => `${val} ${currency}`,
  formatDashboardAxisTick: (val) => String(val),
  localeFromUi: (locale) => (locale === 'es_ES' ? 'es-ES' : 'en-US'),
  niceScale: (max) => ({
    niceMax: Math.max(max, 1),
    ticks: [0, Math.max(max, 1) / 2, Math.max(max, 1)],
  }),
}));

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { FinancialTrendChart, axisLabelStep, buildDateLabels } from '../FinancialTrendChart.jsx';

const STATUS = '[data-testid="financial-trend-status"]';
const X_LABEL_Y = '191'; // CHART_H (196) - 5

/** Bucket start dates: `count` consecutive days/weeks/months from a fixed start. */
function makeDates(count, granularity, start = new Date(2026, 7, 1)) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    if (granularity === 'day') d.setDate(d.getDate() + i);
    else if (granularity === 'week') d.setDate(d.getDate() + i * 7);
    else d.setMonth(d.getMonth() + i);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

const xAxisTexts = (container) =>
  [...container.querySelectorAll('svg text')].filter((t) => t.getAttribute('y') === X_LABEL_Y);

const hoverColumns = (container) => [...container.querySelectorAll('rect[fill="transparent"]')];

beforeEach(() => {
  mockLocale = 'en_US';
  localStorage.clear();
});

describe('buildDateLabels', () => {
  const base = { weekOfText: 'WEEKOF {date}' };

  it('formats day buckets as "day month" on the axis and with the year in the tooltip (en-US)', () => {
    const out = buildDateLabels({ ...base, dates: ['2026-09-01', '2026-09-02'], granularity: 'day', count: 2, numberLocale: 'en-US' });
    expect(out.axis).toEqual(['Sep 1', 'Sep 2']);
    expect(out.tooltip).toEqual(['Sep 1, 2026', 'Sep 2, 2026']);
  });

  it('formats day buckets in es-ES without dots', () => {
    const out = buildDateLabels({ ...base, dates: ['2026-09-01'], granularity: 'day', count: 1, numberLocale: 'es-ES' });
    expect(out.axis[0]).toMatch(/^1 sep/);
    expect(out.axis[0]).not.toContain('.');
    expect(out.tooltip[0]).toMatch(/^1 sep.* 2026$/);
  });

  it('formats week buckets like days on the axis and wraps the tooltip with financialTrendWeekOf text', () => {
    const out = buildDateLabels({ ...base, dates: ['2026-09-21'], granularity: 'week', count: 1, numberLocale: 'en-US' });
    expect(out.axis).toEqual(['Sep 21']);
    expect(out.tooltip).toEqual(['WEEKOF Sep 21, 2026']);
  });

  it('formats month buckets capitalised on the axis and with the year in the tooltip', () => {
    const en = buildDateLabels({ ...base, dates: ['2026-09-01'], granularity: 'month', count: 1, numberLocale: 'en-US' });
    expect(en.axis).toEqual(['Sep']);
    expect(en.tooltip).toEqual(['Sep 2026']);

    const es = buildDateLabels({ ...base, dates: ['2026-09-01'], granularity: 'month', count: 1, numberLocale: 'es-ES' });
    expect(es.axis[0]).toMatch(/^Sep/);
    expect(es.tooltip[0]).toMatch(/^Sep.* 2026$/);
  });

  it('returns null when dates is missing, empty or its length does not match the series', () => {
    const args = { ...base, granularity: 'day', numberLocale: 'en-US' };
    expect(buildDateLabels({ ...args, dates: null, count: 2 })).toBeNull();
    expect(buildDateLabels({ ...args, dates: undefined, count: 2 })).toBeNull();
    expect(buildDateLabels({ ...args, dates: [], count: 0 })).toBeNull();
    expect(buildDateLabels({ ...args, dates: ['2026-09-01'], count: 2 })).toBeNull();
  });

  it('returns null for an unknown granularity or an unparseable date', () => {
    const args = { ...base, numberLocale: 'en-US', count: 1 };
    expect(buildDateLabels({ ...args, dates: ['2026-09-01'], granularity: 'decade' })).toBeNull();
    expect(buildDateLabels({ ...args, dates: ['not-a-date'], granularity: 'day' })).toBeNull();
  });

  describe('time zone safety', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it.each([
      ['America/Argentina/Buenos_Aires', 180],
      ['Pacific/Honolulu', 600],
      ['Asia/Tokyo', -540],
    ])(
      'keeps 2026-09-01 on Sep 1 under %s',
      (tz, offset) => {
        process.env.TZ = tz;
        // Guard: the zone switch really took effect in this worker, so the test is not vacuous.
        expect(new Date(2026, 8, 1).getTimezoneOffset()).toBe(offset);
        const out = buildDateLabels({ ...base, dates: ['2026-09-01'], granularity: 'day', count: 1, numberLocale: 'en-US' });
        expect(out.axis).toEqual(['Sep 1']);
        expect(out.tooltip).toEqual(['Sep 1, 2026']);
        const month = buildDateLabels({ ...base, dates: ['2026-09-01'], granularity: 'month', count: 1, numberLocale: 'en-US' });
        expect(month.axis).toEqual(['Sep']);
      },
    );
  });
});

describe('axisLabelStep', () => {
  const NARROW = 300;
  const WIDE = 791;

  it('thins a 30-point daily series at a narrow width', () => {
    expect(axisLabelStep(30, NARROW, 'day')).toBe(7);
  });

  it('thins a 30-point daily series less at a wide width', () => {
    expect(axisLabelStep(30, WIDE, 'day')).toBe(3);
    expect(axisLabelStep(30, WIDE, 'day')).toBeLessThan(axisLabelStep(30, NARROW, 'day'));
  });

  it('shows every month label at wide widths', () => {
    expect(axisLabelStep(12, WIDE, 'month')).toBe(1);
    expect(axisLabelStep(13, WIDE, 'month')).toBe(1);
  });

  it('never returns less than 1, even with no room or no points', () => {
    expect(axisLabelStep(0, WIDE, 'day')).toBe(1);
    expect(axisLabelStep(3, 0, 'month')).toBeGreaterThanOrEqual(1);
    expect(axisLabelStep(1, WIDE, 'week')).toBe(1);
  });

  it('falls back to the month spacing for an unknown granularity', () => {
    expect(axisLabelStep(30, WIDE, 'decade')).toBe(axisLabelStep(30, WIDE, 'month'));
  });
});

describe('FinancialTrendChart — axis rendering by granularity', () => {
  it('always renders the last (most recent) X label and thins a 30-point daily axis', () => {
    const dates = makeDates(30, 'day', new Date(2026, 7, 1));
    const { container } = render(
      <FinancialTrendChart labels={dates} values={dates.map((_, i) => 100 + i)} dates={dates} granularity="day" currencyLabel="EUR" />,
    );
    const texts = xAxisTexts(container).map((t) => t.textContent);
    expect(texts.length).toBeLessThan(30);
    expect(texts.length).toBeGreaterThan(1);
    expect(texts[texts.length - 1]).toBe('Aug 30');
  });

  it('renders all 12 month labels when the series is monthly', () => {
    const dates = makeDates(12, 'month', new Date(2025, 9, 1));
    const { container } = render(
      <FinancialTrendChart labels={dates} values={dates.map((_, i) => 100 + i)} dates={dates} granularity="month" currencyLabel="EUR" />,
    );
    const texts = xAxisTexts(container).map((t) => t.textContent);
    expect(texts).toHaveLength(12);
    expect(texts[0]).toBe('Oct');
    expect(texts[11]).toBe('Sep');
  });

  it('legacy fallback: without dates it still renders month labels counted back from today', () => {
    const labels = ['a', 'b', 'c'];
    const { container } = render(
      <FinancialTrendChart labels={labels} values={[10, 20, 30]} currencyLabel="EUR" />,
    );
    const texts = xAxisTexts(container).map((t) => t.textContent);
    expect(texts).toHaveLength(3);
    const currentMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date());
    expect(texts[2]).toBe(currentMonth);
  });

  it('legacy fallback also applies when dates length does not match the values', () => {
    const { container } = render(
      <FinancialTrendChart labels={['a', 'b']} values={[10, 20]} dates={['2026-09-01']} granularity="day" currencyLabel="EUR" />,
    );
    const texts = xAxisTexts(container).map((t) => t.textContent);
    expect(texts).toHaveLength(2);
    expect(texts.every((t) => /^[A-Za-z]+$/.test(t))).toBe(true);
  });
});

describe('FinancialTrendChart — tooltip label', () => {
  const show = (props) => {
    const dates = props.dates;
    const utils = render(
      <FinancialTrendChart labels={dates} values={dates.map((_, i) => 100 + i)} currencyLabel="EUR" {...props} />,
    );
    fireEvent.mouseEnter(hoverColumns(utils.container)[0]);
    return utils;
  };

  it('shows the full day label for day buckets', () => {
    show({ dates: ['2026-09-01', '2026-09-02'], granularity: 'day' });
    expect(screen.getByText('Sep 1, 2026')).toBeInTheDocument();
  });

  it('shows the "week of" label for week buckets', () => {
    show({ dates: ['2026-09-07', '2026-09-14'], granularity: 'week' });
    expect(screen.getByText('WEEKOF Sep 7, 2026')).toBeInTheDocument();
  });

  it('shows month and year for month buckets', () => {
    show({ dates: ['2026-08-01', '2026-09-01'], granularity: 'month' });
    expect(screen.getByText('Aug 2026')).toBeInTheDocument();
  });

  it('localises the tooltip with the UI locale', () => {
    mockLocale = 'es_ES';
    show({ dates: ['2026-09-07', '2026-09-14'], granularity: 'week' });
    expect(screen.getByText(/^WEEKOF 7 sep.* 2026$/)).toBeInTheDocument();
  });
});

describe('FinancialTrendChart — status line', () => {
  const RANGES = [
    ['ytd', 'Ytd'],
    ['mtd', 'Mtd'],
    ['last30d', 'Last30d'],
    ['last90d', 'Last90d'],
    ['lastYear', 'LastYear'],
  ];
  const renderStatus = (props) =>
    render(<FinancialTrendChart labels={['a', 'b']} values={[10, 20]} currencyLabel="EUR" hasPrevious {...props} />);

  it.each(RANGES)('up copy for range %s carries the integer pct and the matching comparison', (range, suffix) => {
    const { container } = renderStatus({ growthPct: 4113.8, range });
    expect(container.querySelector(STATUS).textContent).toBe(`UP 4114% financialSummaryComparison${suffix}`);
  });

  it.each(RANGES)('down copy for range %s carries the absolute integer pct and the matching comparison', (range, suffix) => {
    const { container } = renderStatus({ growthPct: -12.5, range });
    expect(container.querySelector(STATUS).textContent).toBe(`DOWN 13% financialSummaryComparison${suffix}`);
  });

  it('shows no decimal separator in the pct', () => {
    const { container } = renderStatus({ growthPct: 33.3, range: 'ytd' });
    expect(container.querySelector(STATUS).textContent).toBe('UP 33% financialSummaryComparisonYtd');
  });

  it('treats a missing range as the rolling last 12 months', () => {
    const { container } = renderStatus({ growthPct: 10 });
    expect(container.querySelector(STATUS).textContent).toBe('UP 10% financialSummaryComparisonLastYear');
  });

  it('treats a blank range as the rolling last 12 months', () => {
    const { container } = renderStatus({ growthPct: 10, range: '  ' });
    expect(container.querySelector(STATUS).textContent).toContain('financialSummaryComparisonLastYear');
  });

  it('treats an unknown range as LastYear', () => {
    const { container } = renderStatus({ growthPct: 10, range: 'decade' });
    expect(container.querySelector(STATUS).textContent).toBe('UP 10% financialSummaryComparisonLastYear');
  });

  it('shows the up icon for growth and the down icon for a decline', () => {
    const up = renderStatus({ growthPct: 5, range: 'ytd' });
    expect(up.container.querySelector('[data-testid="Check__14828e"]')).toBeInTheDocument();
    up.unmount();
    const down = renderStatus({ growthPct: -5, range: 'ytd' });
    expect(down.container.querySelector('[data-testid="X__14828e"]')).toBeInTheDocument();
  });

  it('hasPrevious=false shows the neutral no-previous line without any icon', () => {
    const { container } = renderStatus({ growthPct: 250, hasPrevious: false, range: 'ytd' });
    expect(container.querySelector(STATUS).textContent).toBe('financialSummaryNoPrevious');
    expect(container.querySelector('[data-testid="Check__14828e"]')).toBeNull();
    expect(container.querySelector('[data-testid="X__14828e"]')).toBeNull();
  });

  it('defaults to the neutral line when no comparison props are sent (old backend)', () => {
    const { container } = render(<FinancialTrendChart labels={['a', 'b']} values={[10, 20]} currencyLabel="EUR" />);
    expect(container.querySelector(STATUS).textContent).toBe('financialSummaryNoPrevious');
  });
});

describe('axisLabelStep — 64px minimum for day/week labels (ETP-5493)', () => {
  // Pure re-statement of the chart's geometry: labels sit at i / (count - 1) * plotW and the
  // visible ones are the points whose distance to the last index is a multiple of the step.
  const gapBetweenLastTwoVisible = (count, plotW, step) => (step * plotW) / Math.max(count - 1, 1);

  it.each([
    ['day', 30, 300],
    ['day', 30, 600],
    ['week', 13, 400],
  ])('%s with %i points at %ipx needs a larger step than a 56px minimum would give', (granularity, count, plotW) => {
    const stepAt56 = Math.max(1, Math.ceil((count * 56) / plotW));
    expect(axisLabelStep(count, plotW, granularity)).toBeGreaterThan(stepAt56);
  });

  it('pins the exact steps at the new minimum', () => {
    expect(axisLabelStep(30, 300, 'day')).toBe(7);
    expect(axisLabelStep(30, 600, 'day')).toBe(4);
    expect(axisLabelStep(13, 400, 'week')).toBe(3);
  });

  it('keeps month spacing at 40px', () => {
    expect(axisLabelStep(12, 480, 'month')).toBe(1);
    expect(axisLabelStep(12, 479, 'month')).toBe(2);
  });

  it.each([
    ['day', 30, 300],
    ['day', 30, 600],
    ['day', 30, 791],
    ['week', 13, 400],
    ['week', 14, 791],
  ])('%s %i points at %ipx leaves a gap of at least 64px between the last two visible labels', (granularity, count, plotW) => {
    const step = axisLabelStep(count, plotW, granularity);
    if (step * 1 >= count) return; // a single visible label has no neighbour to collide with
    // The last label is end-anchored (its centre sits ~half a label width left of its point), so the
    // usable gap is the distance between points; it must stay >= the per-label minimum.
    expect(gapBetweenLastTwoVisible(count, plotW, step)).toBeGreaterThanOrEqual(64);
  });

  it('still renders the last label with the wider step', () => {
    const dates = makeDates(30, 'day', new Date(2026, 7, 1));
    const { container } = render(
      <FinancialTrendChart labels={dates} values={dates.map((_, i) => 100 + i)} dates={dates} granularity="day" currencyLabel="EUR" />,
    );
    const texts = xAxisTexts(container).map((t) => t.textContent);
    expect(texts[texts.length - 1]).toBe('Aug 30');
  });
});

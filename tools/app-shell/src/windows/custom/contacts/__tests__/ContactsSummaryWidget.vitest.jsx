// @covers tools/app-shell/src/windows/custom/contacts/ContactsSummaryWidget.jsx
// @covers tools/app-shell/src/windows/custom/contacts/ContactsPeriodButton.jsx
/**
 * ContactsSummaryWidget — the three KPI blocks (net balance, revenue, expenses) and their
 * variation chips follow the selected period: amounts come from the period-aware bp-stats
 * entries (`revenue` / `expenses`, `?months=3|6`); every chip is derived client-side from the
 * raw current/previous values and rounded once (the backend `trend` is pre-rounded and ignored).
 *
 * Requests go through `useApiFetch` (docs/request-policy.md) — mocked here, never `fetch`.
 * The Iconic arrows are stubbed on top of the real custom-icons module so the chip's arrow
 * direction is observable and the file does not depend on the core version that ships them.
 */

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('lucide-react', () => ({
  LineChart: () => <span data-testid="icon-line-chart" />,
  // Rendered by the core Radix dropdown-menu the period selector is built on.
  ChevronDown: () => <span data-testid="icon-chevron" />,
  Calendar: () => <span data-testid="icon-calendar" />,
  Check: () => <span data-testid="icon-check" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Circle: () => <span data-testid="icon-circle" />,
  X: () => <span data-testid="icon-x" />,
}));

vi.mock('@/components/ui/custom-icons', async (importOriginal) => ({
  ...(await importOriginal()),
  IconicArrowUpIcon: (props) => <svg data-direction="up" {...props} />,
  IconicArrowDownIcon: (props) => <svg data-direction="down" {...props} />,
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }));

// Identifiable stub (not a formatter): proves the value and the currency code reach the
// canonical utility; its real output is covered by formatCurrency's own tests. The real
// `formatGroupedNumber` is kept: the chip's grouped % (default es-ES config, `.` thousands)
// is what the digit-cap cases assert.
vi.mock('@/lib/formatCurrency', async (importOriginal) => ({
  ...(await importOriginal()),
  formatCurrency: (currency, val) => `${currency}:${val}`,
}));

vi.mock('../BPChartSVGContent', () => ({
  BPChartSVGContent: ({ labels, revenue }) => (
    <svg data-testid="bp-chart-svg" data-labels={labels.length} data-revenue={JSON.stringify(revenue)} />
  ),
}));

// Models Radix's open auto-focus: the content's onOpenAutoFocus runs first and, unless it calls
// preventDefault(), focus lands on the first focusable child — the close X.
vi.mock('@/components/ui/dialog', async () => {
  const { forwardRef, useEffect, useRef } = await vi.importActual('react');
  const DialogContent = forwardRef(({ children, onOpenAutoFocus }, ref) => {
    const closeRef = useRef(null);
    useEffect(() => {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      onOpenAutoFocus?.(event);
      if (!event.defaultPrevented) closeRef.current?.focus();
    }, []);
    return (
      <div ref={ref} tabIndex={-1} data-testid="dialog-content">
        {children}
        <button ref={closeRef} type="button" data-testid="dialog-close-x">x</button>
      </div>
    );
  });
  return {
    Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
    DialogContent,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <div>{children}</div>,
  };
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsFinanceProvider } from '../ContactsFinanceContext';
import ContactsSummaryWidget from '../ContactsSummaryWidget';

const MINUS = '−';

// bp-stats rows: the period-aware `revenue` / `expenses` blocks plus a legacy monthly row the
// widget must ignore.
const block = (key, value, previousValue, trend, hasPrevious = true) => ({
  key, value, previousValue, trend, hasPrevious,
});
const LEGACY = { key: 'revenueThisMonth', value: 999 };

// 3M: revenue 1500 (prev 1000, +50%), expenses 400 (prev 500, -20%) -> net 1100 vs 500 = +120%.
const STATS_3M = [LEGACY, block('revenue', 1500, 1000, 50), block('expenses', 400, 500, -20)];
// 6M: revenue 800 (prev 1000, -20%), expenses 600 (prev 400, +50%) -> net 200 vs 600 = -66.7%.
const STATS_6M = [LEGACY, block('revenue', 800, 1000, -20), block('expenses', 600, 400, 50)];

const TREND_DATA = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  revenue: [800, 900, 1000, 1100, 1200, 1300],
  expenses: [300, 350, 400, 450, 500, 550],
};

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ response: { data } }) });

function serve({ stats3 = STATS_3M, stats6 = STATS_6M, trend = TREND_DATA } = {}) {
  mockApiFetch.mockImplementation(async (path) => {
    const url = new URL(path, 'http://x');
    if (url.pathname.endsWith('/bp-stats')) {
      return ok(url.searchParams.get('months') === '6' ? stats6 : stats3);
    }
    if (url.pathname.endsWith('/bp-trend')) return ok(trend);
    return ok({});
  });
}

function renderWidget(data = { id: 'BP1' }) {
  return render(
    <ContactsFinanceProvider token="tok" apiBaseUrl="/api">
      <ContactsSummaryWidget data={data} />
    </ContactsFinanceProvider>,
  );
}

/** The KPI block whose label is `labelKey` (label span -> block container). */
const kpiBlock = (labelKey) => screen.getByText(labelKey).parentElement;
const chipOf = (labelKey) => within(kpiBlock(labelKey)).queryByTestId('StatusTag__22ed51');
const noTrendOf = (labelKey) => within(kpiBlock(labelKey)).queryByTestId('contacts-summary-no-trend');

async function switchTo6M(user) {
  await user.click(screen.getByRole('button', { name: /bpLast3Months/ }));
  await user.click(screen.getByRole('menuitemradio', { name: 'bpLast6Months' }));
}

function expectChip(labelKey, { text, direction, tone }) {
  const chip = chipOf(labelKey);
  expect(chip).not.toBeNull();
  expect(within(chip).getByText(text)).toBeInTheDocument();
  expect(within(chip).getByTestId('Arrow__22ed51')).toHaveAttribute('data-direction', direction);
  expect(chip.querySelector('.status-tag')).toHaveClass(`status-tag--${tone}`);
}

describe('ContactsSummaryWidget', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    serve();
  });

  it('returns null when data has no id', () => {
    const { container } = renderWidget({});
    expect(container.firstChild).toBeNull();
  });

  it('returns null when data is null', () => {
    const { container } = renderWidget(null);
    expect(container.firstChild).toBeNull();
  });

  it('throws when used outside ContactsFinanceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ContactsSummaryWidget data={null} />))
      .toThrow('useContactsFinance must be used inside ContactsFinanceProvider');
    spy.mockRestore();
  });

  it('renders loading skeletons while stats are being fetched', () => {
    const { container } = renderWidget();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3);
  });

  it('renders the KPI labels and View chart once stats load, with no skeletons left', async () => {
    const { container } = renderWidget();
    await waitFor(() => expect(screen.getByText('bpNetBalance')).toBeInTheDocument());
    expect(screen.getByText('bpRevenue')).toBeInTheDocument();
    expect(screen.getByText('bpExpenses')).toBeInTheDocument();
    expect(screen.getByText('bpViewChart')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });

  it('syncs data.id into the provider, which requests bp-stats for that contact', async () => {
    renderWidget({ id: 'BP-TEST' });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/bp-stats?businessPartnerId=BP-TEST'),
        expect.anything(),
      );
    });
  });

  it('takes amounts from the revenue/expenses blocks (net = revenue - expenses), ignoring legacy rows', async () => {
    renderWidget();
    await waitFor(() => expect(within(kpiBlock('bpRevenue')).getByText('USD:1500')).toBeInTheDocument());
    expect(within(kpiBlock('bpExpenses')).getByText('USD:400')).toBeInTheDocument();
    expect(within(kpiBlock('bpNetBalance')).getByText('USD:1100')).toBeInTheDocument();
    expect(screen.queryByText('USD:999')).not.toBeInTheDocument();
  });

  // Arrow AND colour follow the sign, for every KPI — expenses included (QA pass 2):
  // positive % green, negative % red.
  it.each([
    ['3M — expenses down is red', '3M', {
      bpNetBalance: { text: '+120% bpVsLast3Months', direction: 'up', tone: 'success' },
      bpRevenue: { text: '+50% bpVsLast3Months', direction: 'up', tone: 'success' },
      bpExpenses: { text: `${MINUS}20% bpVsLast3Months`, direction: 'down', tone: 'destructive' },
    }],
    ['6M — expenses up is green', '6M', {
      bpNetBalance: { text: `${MINUS}67% bpVsLast6Months`, direction: 'down', tone: 'destructive' },
      bpRevenue: { text: `${MINUS}20% bpVsLast6Months`, direction: 'down', tone: 'destructive' },
      bpExpenses: { text: '+50% bpVsLast6Months', direction: 'up', tone: 'success' },
    }],
  ])('renders a chip per KPI for the selected period: %s', async (_name, period, expected) => {
    const user = userEvent.setup();
    renderWidget();
    await waitFor(() => expect(screen.getByText('USD:1500')).toBeInTheDocument());
    if (period === '6M') {
      await switchTo6M(user);
      await waitFor(() => expect(within(kpiBlock('bpRevenue')).getByText('USD:800')).toBeInTheDocument());
      expect(within(kpiBlock('bpNetBalance')).getByText('USD:200')).toBeInTheDocument();
    }
    for (const [labelKey, chip] of Object.entries(expected)) expectChip(labelKey, chip);
  });

  // The % is rounded ONCE from the raw ratio, half away from zero: the backend `trend` is
  // already rounded to one decimal (−54.545 → −54.5), and rounding that again gave −54%.
  it.each([
    ['−54.545% with a pre-rounded backend trend of −54.5', 500, 1100, -54.5, `${MINUS}55%`, 'down', 'destructive'],
    ['exactly −54.5% rounds away from zero', 91, 200, -54.5, `${MINUS}55%`, 'down', 'destructive'],
    ['exactly +54.5% rounds away from zero', 309, 200, 54.5, '+55%', 'up', 'success'],
  ])('rounds a block variation once from its raw values: %s', async (_name, value, previousValue, trend, pct, direction, tone) => {
    serve({ stats3: [block('revenue', value, previousValue, trend), block('expenses', 0, 0, 0, false)] });
    renderWidget();
    await waitFor(() => expect(chipOf('bpRevenue')).not.toBeNull());
    expectChip('bpRevenue', { text: `${pct} bpVsLast3Months`, direction, tone });
  });

  // Each KPI shows exactly one of: a chip ('chip'), the muted "no previous period" text
  // ('none' — QA pass 2, mirrors the dashboard), or nothing ('hidden' — a change that rounds
  // to 0% has a previous period but carries no information).
  it.each([
    ['no block has a previous window (trend ignored without hasPrevious)',
      [block('revenue', 100, 50, 100, false), block('expenses', 40, 20, 100, false)],
      { bpNetBalance: 'none', bpRevenue: 'none', bpExpenses: 'none' }],
    ['every change rounds to 0%',
      [block('revenue', 1002, 1000, 0.2), block('expenses', 200, 200, 0)],
      { bpNetBalance: 'hidden', bpRevenue: 'hidden', bpExpenses: 'hidden' }],
    ['previous net is 0 — no base for the net, block chips kept',
      [block('revenue', 500, 300, 66.67), block('expenses', 100, 300, -66.67)],
      { bpNetBalance: 'none', bpRevenue: 'chip', bpExpenses: 'chip' }],
    ['a previous value of 0 cannot give a ratio',
      [block('revenue', 500, 0, 0), block('expenses', 100, 50, 100)],
      { bpNetBalance: 'chip', bpRevenue: 'none', bpExpenses: 'chip' }],
    ['empty stats — zeroed KPIs',
      [],
      { bpNetBalance: 'none', bpRevenue: 'none', bpExpenses: 'none' }],
  ])('shows a chip only when it carries information: %s', async (_name, stats3, shown) => {
    serve({ stats3 });
    renderWidget();
    await waitFor(() => expect(screen.getByText('bpNetBalance')).toBeInTheDocument());
    for (const [labelKey, state] of Object.entries(shown)) {
      if (state === 'chip') expect(chipOf(labelKey)).not.toBeNull();
      else expect(chipOf(labelKey)).toBeNull();
      if (state === 'none') {
        expect(noTrendOf(labelKey)).toHaveTextContent('financialSummaryNoPrevious');
      } else {
        expect(noTrendOf(labelKey)).toBeNull();
      }
    }
    if (stats3.length === 0) expect(screen.getAllByText('USD:0')).toHaveLength(3);
  });

  // Digit cap (QA pass 2): up to |9.999| % the grouped value shows in full; from |10.000| %
  // only the number is cut, inside a box sized by an invisible copy of the cap ("±9.999%"),
  // with the suffix kept whole and the full value as the title. jsdom has no layout, so the
  // structure is asserted, not the width.
  it.each([
    ['9.999% shows in full with the thousands separator', 10099, 100, '+9.999%', false, 'up', 'success'],
    ['10.000% is capped, full value in the tooltip', 10100, 100, '+10.000%', true, 'up', 'success'],
    ['a large negative variation is capped too', -12445, 100, `${MINUS}12.545%`, true, 'down', 'destructive'],
  ])('caps the variation digits: %s', async (_name, value, previousValue, pct, capped, direction, tone) => {
    serve({ stats3: [block('revenue', value, previousValue, 0), block('expenses', 0, 0, 0, false)] });
    renderWidget();
    await waitFor(() => expect(chipOf('bpRevenue')).not.toBeNull());
    const chip = chipOf('bpRevenue');
    const full = `${pct} bpVsLast3Months`;
    expect(within(chip).getByTestId('Arrow__22ed51')).toHaveAttribute('data-direction', direction);
    expect(chip.querySelector('.status-tag')).toHaveClass(`status-tag--${tone}`);
    const label = within(chip).getByTestId('contacts-trend-text');
    expect(label).toHaveTextContent(full);
    if (capped) {
      expect(label).toHaveAttribute('title', full);
      const numberBox = within(label).getByTestId('contacts-trend-number');
      expect(numberBox).toHaveClass('relative', 'inline-block', 'tabular-nums');
      const cap = within(numberBox).getByTestId('contacts-trend-number-cap');
      expect(cap).toHaveTextContent(`${pct.startsWith(MINUS) ? MINUS : '+'}9.999%`);
      expect(cap).toHaveClass('invisible');
      expect(cap).toHaveAttribute('aria-hidden', 'true');
      expect(within(numberBox).getByText(pct)).toHaveClass('absolute', 'inset-0', 'truncate');
      // The suffix sits outside the truncating box.
      expect(numberBox).not.toHaveTextContent('bpVsLast3Months');
    } else {
      expect(label).toHaveTextContent(full);
      expect(label).not.toHaveAttribute('title');
      expect(within(label).queryByTestId('contacts-trend-number')).toBeNull();
    }
  });

  it('opens the chart dialog with focus on the dialog content, not on the close X', async () => {
    const user = userEvent.setup();
    renderWidget();
    await waitFor(() => expect(screen.getByText('bpViewChart')).toBeInTheDocument());
    await user.click(screen.getByText('bpViewChart'));

    expect(screen.getByTestId('bp-chart-svg')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toHaveFocus();
    expect(screen.getByTestId('dialog-close-x')).not.toHaveFocus();
  });

  it.each([
    ['3M (default)', false, 3, [1100, 1200, 1300]],
    ['6M', true, 6, [800, 900, 1000, 1100, 1200, 1300]],
  ])('the chart dialog has no period toggle of its own and plots the summary period: %s', async (_label, pick6M, labels, revenue) => {
    const user = userEvent.setup();
    renderWidget();
    await waitFor(() => expect(screen.getByText('USD:1500')).toBeInTheDocument());
    if (pick6M) {
      await switchTo6M(user);
      await waitFor(() => expect(screen.getByText('USD:800')).toBeInTheDocument());
    }
    await user.click(screen.getByText('bpViewChart'));

    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).queryByText(/bpLast[36]Months/)).toBeNull();
    const chart = within(dialog).getByTestId('bp-chart-svg');
    expect(chart).toHaveAttribute('data-labels', String(labels));
    expect(JSON.parse(chart.getAttribute('data-revenue'))).toEqual(revenue);
  });
});

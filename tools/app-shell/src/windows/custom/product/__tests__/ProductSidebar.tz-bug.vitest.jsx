// Regression test for ETP-4850: date off-by-one bug under negative-UTC-offset
// timezones.
//
// ProductSidebar's private buildWarehouseSeries() (and its sibling
// buildChartData()) bucket stock transactions by "YYYY-MM" using
// `new Date(t.movementDate)` + local-time getters (getFullYear/getMonth). A
// date-only string like "2026-08-01" is parsed by the Date constructor as
// UTC midnight; under a negative-offset timezone (e.g.
// America/Argentina/Buenos_Aires, UTC-3) the local-time getters roll it back
// to the previous month's last day, so the transaction is bucketed into
// "2026-07" instead of "2026-08". The canonical fix
// (tools/app-shell/src/lib/dateOnly.js) avoids this by parsing the
// yyyy-MM-dd components directly with the local Date constructor.
//
// Neither buildChartData nor buildWarehouseSeries is exported, so this test
// verifies the bucketing through the rendered stock-evolution chart: it
// hovers the inline chart at the "July" data point and reads the per-series
// tooltip value rendered inside the chart's <g><text> node (structurally
// distinct from the Y-axis tick <text> labels, which sit as direct <svg>
// children — see the `svg g text` selector below).
//
// TZ is forced to America/Argentina/Buenos_Aires (verified empirically:
// process.env.TZ takes effect per-call in this project's Node/Vitest setup).
// "Now" is pinned via vi.setSystemTime to 2026-08-15 12:00 local — a safe
// midday instant so the *current* month's bucket key is never itself
// affected by the bug, isolating the assertion to the movementDate parsing.

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
  useLabel: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/product/prod-1', search: '', hash: '', state: null }),
}));

vi.mock('@/lib/dashboardNumberFormat', () => ({
  niceScale: (max) => ({ niceMax: Math.ceil(max / 10) * 10 || 10, ticks: [0, Math.ceil(max / 2), Math.ceil(max)] }),
  formatDashboardAxisTick: (v) => String(v),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  ExternalLink: (props) => <span {...props} data-testid="icon-external" />,
  Maximize2: (props) => <span {...props} data-testid="icon-maximize" />,
  Box: (props) => <span {...props} data-testid="icon-box" />,
  Calendar: (props) => <span {...props} data-testid="icon-calendar" />,
  ChevronDown: (props) => <span {...props} data-testid="icon-chevron" />,
  ArrowRightToLine: (props) => <span {...props} data-testid="icon-arrow-to-line" />,
  Package: (props) => <span {...props} data-testid="icon-package" />,
  Warehouse: (props) => <span {...props} data-testid="icon-warehouse" />,
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductSidebar from '../ProductSidebar.jsx';

// --- Helpers ---

const defaultProps = {
  recordId: 'prod-1',
  data: {},
  token: 'test-token',
  apiBaseUrl: '/sws/neo/product',
};

function mockFetchResponses({ stockRows = [], transactions = [] } = {}) {
  globalThis.fetch = vi.fn((url) => {
    if (url.includes('/stock')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: stockRows } }) });
    }
    if (url.includes('/transactions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: transactions } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

// --- Tests ---

describe('ProductSidebar — ETP-4850 date off-by-one bug', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    // Pin "now" to a fixed, midday instant so the fixed 3-month window
    // (period switched to 3M below; the panel opens on 12M) is deterministic: months = ['2026-05','2026-06','2026-07','2026-08'] (range start month through current month).
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0));
    // jsdom does not implement layout, so getBoundingClientRect() would
    // otherwise return all zeros — mock it to match the inline chart's
    // explicit W/H (340x100) so the mouseMove → hovered-index math in
    // ChartSVG resolves deterministically.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 340, height: 100, right: 340, bottom: 100, x: 0, y: 0, toJSON() {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('places a transaction dated 2026-08-01 on 1 Aug, not on 31 Jul', async () => {
    const stockRows = [
      { storageBin: 'BIN1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 20, reservedQty: 0 },
    ];
    const transactions = [
      { movementDate: '2026-08-01', movementQuantity: 20, storageBin: 'BIN1' },
    ];
    mockFetchResponses({ stockRows, transactions });

    const { container } = render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('stockMovement')).toBeInTheDocument();
    });

    // The panel opens on 12M; this geometry assumes the 3M window.
    fireEvent.click(screen.getByText('last12Months'));
    fireEvent.click(screen.getByText('last3Months'));

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    // Inline chart geometry: W=340, PAD_X=46, PAD_R=8 -> plot width 286, date scale 15 May .. 15 Aug
    // (92 days). The x of a day is 46 + (days since 15 May) / 92 * 286.
    const xOf = (offsetDays) => 46 + (offsetDays / 92) * 286;

    // 31 Jul is offset 77: the balance is still 0 (the 2026-08-01 movement must not slip into July).
    fireEvent.mouseMove(svg, { clientX: xOf(77), clientY: 50 });
    expect(screen.getByText("31 Jul 2026")).toBeInTheDocument();
    const rowValue = () => container.querySelector('[data-testid="StockChartTooltipRow"] text:last-child').textContent;
    // NOTE: exact string equality: a substring match would also pass against the buggy "20".
    expect(rowValue()).toBe('0 stockUnitAbbr');

    // 1 Aug is offset 78: the movement lands on that very day.
    fireEvent.mouseMove(svg, { clientX: xOf(78), clientY: 50 });
    expect(screen.getByText('1 Ago 2026')).toBeInTheDocument();
    expect(rowValue()).toBe('20 stockUnitAbbr');
  });
});

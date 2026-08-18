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
  useLabel: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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
  ExternalLink: (props) => <span data-testid="icon-external" {...props} />,
  Box: (props) => <span data-testid="icon-box" {...props} />,
  Calendar: (props) => <span data-testid="icon-calendar" {...props} />,
  ChevronDown: (props) => <span data-testid="icon-chevron" {...props} />,
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
    // (default period) is deterministic: months = ['2026-06','2026-07','2026-08'].
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

  it('buckets a transaction dated 2026-08-01 into the August point, not July', async () => {
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

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    // Inline chart geometry: W=340, PAD_X=36, PAD_R=8, pointCount=3 months
    // (June, July, August) → xStep = (340-36-8)/(3-1) = 148.
    // Hover at index 1 ("July"): mouseX = PAD_X + 1*xStep = 184.
    fireEvent.mouseMove(svg, { clientX: 184, clientY: 50 });

    // The per-series tooltip value sits inside a <g><text> (structurally
    // distinct from the Y-axis tick labels, which are direct <svg> children).
    const tooltipMonthLabel = screen.getByText("Jul '26");
    expect(tooltipMonthLabel).toBeInTheDocument();

    const tooltipValue = container.querySelector('svg g text');
    // Correct expected behavior: the 2026-08-01 transaction lands in the
    // August bucket, so July's cumulative value is still 0 (unaffected).
    // NOTE: exact string equality is required here — toHaveTextContent('0')
    // does a substring match, which would also (wrongly) pass against the
    // buggy "20" value.
    expect(tooltipValue.textContent).toBe('0');
  });
});

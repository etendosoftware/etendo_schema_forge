// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${params.count ?? params.name}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
  useLabel: () => (key) => key,
}));

vi.mock('@/lib/currencyFormatConfig', async (orig) => ({
  ...(await orig()),
  getCurrencyFormatConfig: () => ({ thousandsSeparator: '.', decimalSeparator: ',' }),
}));

const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/product/prod-1', search: '?x=1', hash: '', state: null },
  capabilities: {},
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => router.navigate,
  useLocation: () => router.location,
}));
// Per-account flag of the Movements tab (ETP-5908: gates the "Ver movimientos" link).
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({ useCapabilitiesSafe: () => router.capabilities }));

vi.mock('@/lib/dashboardNumberFormat', () => ({
  niceScale: (max) => ({ niceMax: Math.ceil(max / 10) * 10 || 10, ticks: [0, Math.ceil(max / 2), Math.ceil(max)] }),
  formatDashboardAxisTick: (v) => String(v),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
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
  PanelRightClose: (props) => <span {...props} data-testid="icon-panel-close" />,
  PanelRightOpen: (props) => <span {...props} data-testid="icon-panel-open" />,
  ArrowLeftRight: (props) => <span {...props} data-testid="icon-arrow-lr" />,
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
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: stockRows } }),
      });
    }
    if (url.includes('/transactions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: transactions } }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

// --- Tests ---

// RF-16: the collapsed flag is persisted; never leak it between tests.
beforeEach(() => { localStorage.clear(); router.navigate.mockClear(); router.capabilities = {}; });

describe('ProductSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing with empty fetch responses', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    // Tab buttons should be visible
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(screen.getByText('warehouses')).toBeInTheDocument();
  });

  it('does not fetch when recordId is missing', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} recordId={null} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing — inverted: the cookie carries the session', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} token={null} />);
    // ETP-4576 — inverted on purpose: under the cookie scheme the client holds no token,
    // so the request MUST still go out. The old expectation encoded the guard that made
    // this call silently disappear for every authenticated user.
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('fetches stock and transactions on mount', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('/stock'))).toBe(true);
    expect(urls.some(u => u.includes('/transactions'))).toBe(true);
  });

  it('shows the summary tab by default', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    // The summary button should have font-weight 500 (active)
    const summaryBtn = screen.getByText('summary');
    expect(summaryBtn).toBeInTheDocument();
  });

  it('switches to warehouses tab on click', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    const warehousesBtn = screen.getByText('warehouses');
    fireEvent.click(warehousesBtn);

    // After click, warehouses tab content is rendered
    expect(warehousesBtn).toBeInTheDocument();
  });

  it('shows empty state when transactions load as empty', async () => {
    mockFetchResponses({ stockRows: [], transactions: [] });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('noStockMovements')).toBeInTheDocument();
    });
  });

  it('shows empty state actions: adjustStock and replenishStock', async () => {
    mockFetchResponses({ stockRows: [], transactions: [] });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('adjustStock')).toBeInTheDocument();
      expect(screen.getByText('replenishStock')).toBeInTheDocument();
    });
  });

  it('shows availability widget when stock and transactions exist', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 50, reservedQty: 5 },
    ];
    const transactions = [
      { movementDate: '2025-01-15', movementQuantity: 10, storageBin: 'LOC1' },
    ];
    mockFetchResponses({ stockRows, transactions });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('stockAvailableLabel')).toBeInTheDocument();
    });
  });

  it('shows a placeholder bar instead of the available quantity while the stock is loading', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    render(<ProductSidebar {...defaultProps} />);

    expect(await screen.findByTestId('AvailabilityValueSkeleton')).toBeInTheDocument();
    expect(screen.getByText('stockAvailableLabel')).toBeInTheDocument();
  });

  it('replaces the placeholder with the quantity once the stock is loaded', async () => {
    mockFetchResponses({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 50, reservedQty: 5 }],
      transactions: [{ movementDate: '2025-01-15', movementQuantity: 10, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => expect(screen.queryByTestId('AvailabilityValueSkeleton')).toBeNull());
    expect(screen.getByText('stockAvailableLabel')).toBeInTheDocument();
  });

  it('shows stock movement chart title when transactions exist', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 100, reservedQty: 0 },
    ];
    const transactions = [
      { movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' },
    ];
    mockFetchResponses({ stockRows, transactions });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('stockMovement')).toBeInTheDocument();
    });
  });

  it('shows warehouse data in warehouses tab', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30, reservedQty: 5 },
      { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20, reservedQty: 2 },
    ];
    mockFetchResponses({ stockRows, transactions: [] });
    render(<ProductSidebar {...defaultProps} />);

    // Wait for data load
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Switch to warehouses tab
    fireEvent.click(screen.getByText('warehouses'));

    await waitFor(() => {
      expect(screen.getByText('WH-Alpha')).toBeInTheDocument();
      expect(screen.getByText('WH-Beta')).toBeInTheDocument();
    });
  });

  // ETP-5908 RF-06: "N ubicaciones" is a link to the Warehouses tab.
  it('renders the locations count as a button that opens the Warehouses tab', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30, reservedQty: 5 },
      { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20, reservedQty: 2 },
    ];
    const transactions = [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }];
    mockFetchResponses({ stockRows, transactions });
    render(<ProductSidebar {...defaultProps} />);

    const link = await screen.findByRole('button', { name: 'stockLocationsCount:2' });
    expect(link.tagName).toBe('BUTTON');
    expect(link.getAttribute('type')).toBe('button');
    fireEvent.click(link);

    expect((await screen.findAllByText('WH-Alpha')).length).toBeGreaterThan(0);
    const cards = screen.getAllByTestId('WarehouseCardAvailability');
    expect(cards[0].textContent).toContain('30 u');
  });

  const LONG = 'Almac\u00e9n Central de Distribuci\u00f3n Regional Norte';

  it('truncates a long single-warehouse name in the Summary pill, keeping the full name in title', async () => {
    mockFetchResponses({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': LONG, quantityOnHand: 30 }],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 30, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    const pill = await screen.findByTestId('AvailabilityWarehousePill');
    expect(pill.className).toContain('truncate');
    expect(pill.className).toContain('min-w-0');
    expect(pill.className).toContain('max-w-full');
    expect(pill.getAttribute('title')).toBe(LONG);
  });

  it('truncates a long warehouse name in the Warehouses tab card', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': LONG, quantityOnHand: 30 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20 },
      ],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 30, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'stockLocationsCount:2' }));
    const name = (await screen.findAllByTestId('WarehouseCard'))[0].querySelector('span.truncate');
    expect(name.className).toContain('truncate');
    expect(name.textContent).toBe(LONG);
    expect(name.getAttribute('title')).toBe(LONG);
  });

  it('formats quantities in the expand modal with the canonical separators', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 1080 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 300 },
      ],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'expand' }));
    const dialog = await screen.findByTestId('dialog');
    expect(dialog.textContent).toContain('1.080');
    expect(dialog.textContent).toContain('total: 1.380');
    expect(dialog.textContent).not.toContain('1,080');
  });

  it('keeps up to 2 decimals on fractional stock (card, summary, modal) and no decimals on integers', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 12.5 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 1080 },
      ],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    expect(await screen.findByText('1.092,5')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'stockLocationsCount:2' }));
    await screen.findAllByText('WH-Alpha');
    const cards = screen.getAllByTestId('WarehouseCardAvailability');
    const cardText = cards.map(c => c.textContent).join('|');
    expect(cardText).toContain('12,5 u');
    expect(cardText).not.toContain('13 u');
    expect(cardText).toContain('1.080 u');
    expect(cardText).not.toContain('1.080,');
    fireEvent.click((await screen.findAllByRole('button', { name: 'expand' }))[0]);
    const dialog = await screen.findByTestId('dialog');
    expect(dialog.textContent).toContain('12,5');
    expect(dialog.textContent).toContain('total: 1.092,5');
  });

  it('places the locations link inline right after the "Available ·" label', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20 },
      ],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    const link = await screen.findByTestId('AvailabilityLocationsLink');
    expect(link.previousElementSibling.textContent).toBe('stockAvailableLabel ·');
    expect(link.parentElement.className).not.toContain('justify-between');
  });

  it('keeps the single-warehouse subtitle as plain text (not a link)', async () => {
    mockFetchResponses({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Only', quantityOnHand: 9 }],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 9, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    expect((await screen.findAllByText('WH-Only')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /stockLocationsCount/ })).toBeNull();
  });

  // ETP-5908 RF-07: icon-only expand button.
  it('renders the chart expand control as an icon-only button with tooltip and aria-label', async () => {
    mockFetchResponses({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 10 }],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 10, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);

    const btn = await screen.findByRole('button', { name: 'expand' });
    expect(btn).toHaveAttribute('title', 'expand');
    expect(btn).toHaveAttribute('aria-label', 'expand');
    expect(btn.textContent).toBe('');
    expect(screen.queryByTestId('icon-external')).toBeNull();
    expect(btn.querySelector('[data-testid="icon-maximize"]')).not.toBeNull();

    fireEvent.click(btn);
    expect(await screen.findByTestId('dialog')).toBeInTheDocument();
  });

  // ETP-5908 RF-10..RF-13: chart axis, tooltip and legend.
  describe('stock chart axis, tooltip and legend', () => {
    const twoWarehouses = {
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20 },
      ],
      transactions: [
        { movementDate: '2026-05-10', movementQuantity: 30, storageBin: 'LOC1' },
        { movementDate: '2026-05-10', movementQuantity: 20, storageBin: 'LOC2' },
      ],
    };

    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders the legend as one left-aligned row with 16 px gaps, in the panel and in the modal', async () => {
      mockFetchResponses(twoWarehouses);
      render(<ProductSidebar {...defaultProps} />);
      await screen.findByTestId('StockChartLegend');
      const legend = screen.getByTestId('StockChartLegend');
      expect(legend.className).toContain('flex-row');
      expect(legend.className).toContain('flex-wrap');
      expect(legend.className).not.toContain('overflow-x-auto');
      expect(legend.className).toContain('gap-4');
      expect(legend.className).toContain('justify-start');
      expect(screen.getAllByTestId('StockChartLegendItem').map(i => i.textContent)).toEqual(['WH-Alpha', 'WH-Beta']);

      fireEvent.click(screen.getByRole('button', { name: 'expand' }));
      await screen.findByTestId('dialog');
      expect(screen.getAllByTestId('StockChartLegend')).toHaveLength(2);
    });

    it('starts the 12-month X axis at the month of the range start, labelled every 2 months with the year only on the first label and on Ene', async () => {
      mockFetchResponses(twoWarehouses);
      render(<ProductSidebar {...defaultProps} />);
      await screen.findByTestId('StockChartLegend');
      const labels = screen.getAllByTestId('StockChartXLabel');
      expect(labels.map(l => l.children[0].textContent)).toEqual(['Oct', 'Dic', 'Feb', 'Abr', 'Jun', 'Ago', 'Oct']);
      expect(labels.map(l => l.children[1]?.textContent ?? null)).toEqual(['2025', null, '2026', null, null, null, null]);
      expect(labels[0].children[0].getAttribute('font-weight')).toBe('400');
      expect(labels[0].children[0].getAttribute('text-anchor')).toBe('start');
    });

    it('shows date, rows sorted largest first and a Total row in the hover tooltip', async () => {
      mockFetchResponses(twoWarehouses);
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 340, height: 100, right: 340, bottom: 100, x: 0, y: 0, toJSON() {},
      });
      const { container } = render(<ProductSidebar {...defaultProps} />);
      await screen.findByTestId('StockChartLegend');
      fireEvent.mouseMove(container.querySelector('svg'), { clientX: 340, clientY: 50 });
      expect(screen.getByTestId('StockChartTooltipDate').textContent).toBe('15 Oct 2026');
      // the date is the first line INSIDE the dark box, in a readable light colour
      const box = screen.getByTestId('StockChartTooltip').querySelector('rect');
      const date = screen.getByTestId('StockChartTooltipDate');
      const top = Number(box.getAttribute('y'));
      const bottom = top + Number(box.getAttribute('height'));
      expect(Number(date.getAttribute('y'))).toBeGreaterThan(top + 9);
      expect(date.getAttribute('fill')).toBe('white');
      const firstRow = screen.getAllByTestId('StockChartTooltipRow')[0].querySelector('text');
      expect(Number(firstRow.getAttribute('y'))).toBeGreaterThan(Number(date.getAttribute('y')));
      const totalText = screen.getByTestId('StockChartTooltipTotal').querySelector('text');
      expect(Number(totalText.getAttribute('y'))).toBeLessThan(bottom);
      expect(screen.getAllByTestId('StockChartTooltipRow').map(r => r.textContent)).toEqual([
        'WH-Alpha30 stockUnitAbbr', 'WH-Beta20 stockUnitAbbr',
      ]);
      expect(screen.getByTestId('StockChartTooltipTotal').textContent).toBe('total50 stockUnitAbbr');
    });
  });

  describe('movement history loading', () => {
    const stockRows = [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 5 }];
    beforeEach(() => { vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); });
    afterEach(() => { vi.useRealTimers(); });

    it('requests newest-first movements from the start of the 12-month window, once', async () => {
      mockFetchResponses({ stockRows, transactions: [{ movementDate: '2026-10-01', movementQuantity: 5, storageBin: 'LOC1' }] });
      render(<ProductSidebar {...defaultProps} />);
      await screen.findByTestId('StockChartLegend');
      const tx = globalThis.fetch.mock.calls.map(c => c[0]).filter(u => u.includes('/transactions'));
      expect(tx).toHaveLength(1);
      const params = new URL(tx[0], 'http://x').searchParams;
      expect(params.get('_sortBy')).toMatch(/^-movementDate/);
      expect(JSON.parse(params.get('criteria'))).toEqual([{ fieldName: 'movementDate', operator: 'greaterOrEqual', value: '2025-10-15' }]);
      expect(globalThis.fetch.mock.calls.filter(c => c[0].includes('/stock'))).toHaveLength(1);
    });

    it('shows the partial-history note only when the safety cap was reached', async () => {
      const full = Array.from({ length: 500 }, () => ({ movementDate: '2026-10-01', movementQuantity: 0, storageBin: 'LOC1' }));
      mockFetchResponses({ stockRows, transactions: full });
      render(<ProductSidebar {...defaultProps} />);
      expect(await screen.findByTestId('StockChartPartialNote')).toHaveTextContent('stockHistoryPartial');
    });

    it('does not show the partial-history note for a complete history', async () => {
      mockFetchResponses({ stockRows, transactions: [{ movementDate: '2026-10-01', movementQuantity: 5, storageBin: 'LOC1' }] });
      render(<ProductSidebar {...defaultProps} />);
      await screen.findByTestId('StockChartLegend');
      expect(screen.queryByTestId('StockChartPartialNote')).toBeNull();
    });

    it('places the hover marker dots on the hovered date for every series', async () => {
      mockFetchResponses({ stockRows, transactions: [{ movementDate: '2026-10-01', movementQuantity: 5, storageBin: 'LOC1' }] });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 340, height: 100, right: 340, bottom: 100, x: 0, y: 0, toJSON() {},
      });
      const { container } = render(<ProductSidebar {...defaultProps} />);
      await screen.findByTestId('StockChartLegend');
      fireEvent.mouseMove(container.querySelector('svg'), { clientX: 340, clientY: 50 });
      expect(screen.getByTestId('StockChartTooltipDate').textContent).toBe('15 Oct 2026');
      expect(container.querySelectorAll('svg circle')).toHaveLength(1);
    });
  });

  describe('tooltip with a long warehouse name (narrow panel)', () => {
    const LONG_NAME = 'Almac\u00e9n Central de Distribuci\u00f3n Regional Norte';
    beforeEach(() => { vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); });
    afterEach(() => { vi.useRealTimers(); });

    it('keeps the box inside the SVG and truncates the name so the quantity stays visible', async () => {
      mockFetchResponses({
        stockRows: [
          { storageBin: 'LOC1', 'warehouse$_identifier': LONG_NAME, quantityOnHand: 1080 },
          { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 12.5 },
        ],
        transactions: [
          { movementDate: '2026-05-10', movementQuantity: 1080, storageBin: 'LOC1' },
          { movementDate: '2026-05-10', movementQuantity: 12.5, storageBin: 'LOC2' },
        ],
      });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 340, height: 100, right: 340, bottom: 100, x: 0, y: 0, toJSON() {},
      });
      const { container } = render(<ProductSidebar {...defaultProps} />);
      await screen.findByTestId('StockChartLegend');
      const svg = container.querySelector('svg');
      fireEvent.mouseMove(svg, { clientX: 340, clientY: 50 });
      const box = screen.getByTestId('StockChartTooltip').querySelector('rect');
      const W = Number(svg.getAttribute('viewBox').split(/\s+/)[2]);
      const x = Number(box.getAttribute('x'));
      expect(x + Number(box.getAttribute('width'))).toBeLessThanOrEqual(W);
      const first = screen.getAllByTestId('StockChartTooltipRow')[0];
      expect(first.querySelector('text').textContent).toContain('\u2026');
      expect(first.querySelector('title').textContent).toBe(LONG_NAME);
      expect(first.textContent).toContain('1.080');
      expect(screen.getByTestId('StockChartTooltipTotal').textContent).toContain('1.092,5');
    });
  });

  // ETP-5908: Y axis ticks use the stock quantity format (es: 1.500), not the dashboard K abbreviation.
  it('formats the Y axis ticks with the instance thousands separator', async () => {
    mockFetchResponses({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 12500 }],
      transactions: [{ movementDate: '2026-05-10', movementQuantity: 12500, storageBin: 'LOC1' }],
    });
    const { container } = render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    const ticks = [...container.querySelectorAll('svg > text')].map(t => t.textContent);
    expect(ticks).toContain('12.500');
    expect(ticks.some(t => /K$/.test(t))).toBe(false);
  });

  // ETP-5908 RF-08 / RF-09: warehouse cards.
  it('shows no reserved data and the "Available · N u" text with a series-coloured dot per warehouse', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30, reservedQty: 5 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20, reservedQty: 2 },
      ],
      transactions: [],
    });
    render(<ProductSidebar {...defaultProps} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('warehouses'));

    expect((await screen.findAllByText('WH-Alpha')).length).toBeGreaterThan(0);
    expect(screen.queryByText('reserved')).toBeNull();
    // available shown is the on-hand quantity (no reservation subtracted)
    const rows = screen.getAllByTestId('WarehouseCardAvailability');
    expect(rows.map(r => r.children[0].textContent)).toEqual(['stockAvailableLabel', 'stockAvailableLabel']);
    expect(rows.map(r => r.children[1].textContent)).toEqual(['30 u', '20 u']);
    expect(rows[1].children[1].className).toContain('font-semibold');
    const dots = screen.getAllByTestId('WarehouseCardDot');
    expect(dots.map(d => d.style.backgroundColor)).toEqual(['rgb(236, 72, 153)', 'rgb(245, 158, 11)']);
  });

  it('handles fetch error gracefully (stock)', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/stock')) return Promise.reject(new Error('network'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    });

    // Should not throw
    render(<ProductSidebar {...defaultProps} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  it('renders period selector', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    // The period selector button should show i18n key for the period
    expect(screen.getByText('last12Months')).toBeInTheDocument();
  });
});

// ETP-4606 / ETP-5091 — Service, Expense ("Gasto") and Resource ("Recurso")
// products have no physical existence, so the stock sidebar (period selector,
// availability widget, stock movement chart) does not apply to them and must
// not render at all. Mirrors the rule that shows the stock flags
// (`Almacenable`/`Retornable`) in the main form only for Item (`decisions.json`).
describe.each([
  ['Service', 'S'],
  ['Expense', 'E'],
  ['Resource', 'R'],
])('ProductSidebar — hidden for %s-type products (ETP-4606 / ETP-5091)', (_label, productType) => {
  it(`renders nothing when productType is ${productType}`, () => {
    mockFetchResponses();
    const { container } = render(
      <ProductSidebar {...defaultProps} data={{ productType }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ProductSidebar — stays visible for stockable types', () => {
  it('renders normally for a stockable type (Article)', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} data={{ productType: 'I' }} />);
    expect(screen.getByText('last12Months')).toBeInTheDocument();
  });
});

// ETP-5908 RF-01 / RF-05 — default period and exact range label.
describe('ProductSidebar period range', () => {
  it('shows the exact range under the period selector', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);
    const range = screen.getByTestId('SidebarPeriodRange');
    expect(range.textContent).toMatch(/^\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}$/);
  });
});

// ETP-5908 RF-14 / RF-15: interactive legend (panel toggles, modal isolates).
describe('ProductSidebar — interactive stock legend', () => {
  const rows = (extra = {}) => ({
    stockRows: [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 100 },
      { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-B', quantityOnHand: 30 },
      { storageBin: 'LOC3', 'warehouse$_identifier': 'WH-C', quantityOnHand: 10 },
    ],
    transactions: [
      { movementDate: '2026-05-10', movementQuantity: 100, storageBin: 'LOC1' },
      { movementDate: '2026-05-10', movementQuantity: 30, storageBin: 'LOC2' },
      { movementDate: '2026-05-10', movementQuantity: 10, storageBin: 'LOC3' },
    ],
    ...extra,
  });
  const entry = (name, scope = document) => scope.querySelectorAll('[data-testid="StockChartLegendItem"]')
    && [...scope.querySelectorAll('[data-testid="StockChartLegendItem"]')].find(b => b.textContent === name);
  const panelEntry = (name) => entry(name, screen.getAllByTestId('StockChartLegend')[0]);
  const lines = (svg) => svg.querySelectorAll('path[fill="none"]');
  const rect = { left: 0, top: 0, width: 340, height: 100, right: 340, bottom: 100, x: 0, y: 0, toJSON() {} };

  beforeEach(() => { vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  async function renderPanel(data = rows()) {
    mockFetchResponses(data);
    const utils = render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    return utils;
  }

  it('renders real toggle buttons, pressed while visible, with an accessible name', async () => {
    await renderPanel();
    const a = panelEntry('WH-A');
    expect(a.tagName).toBe('BUTTON');
    expect(a.getAttribute('type')).toBe('button');
    expect(a.getAttribute('aria-pressed')).toBe('true');
    expect(a.getAttribute('aria-label')).toBe('showSeriesInChart:WH-A');
    expect(a.getAttribute('title')).toBe('WH-A');
  });

  it('click hides the series: pressed false, struck through, line gone, Y axis rescaled to the visible ones', async () => {
    const { container } = await renderPanel();
    const svg = container.querySelector('svg');
    expect(lines(svg)).toHaveLength(3);
    expect([...svg.querySelectorAll('text')].some(t => t.textContent === '100')).toBe(true);
    fireEvent.click(panelEntry('WH-A'));
    expect(panelEntry('WH-A').getAttribute('aria-pressed')).toBe('false');
    expect(panelEntry('WH-A').querySelector('span:last-child').className).toContain('line-through');
    expect(lines(container.querySelector('svg'))).toHaveLength(2);
    const labels = [...container.querySelector('svg').querySelectorAll('text')].map(t => t.textContent);
    expect(labels).not.toContain('100');
    expect(labels).toContain('30');
    fireEvent.click(panelEntry('WH-A'));
    expect(lines(container.querySelector('svg'))).toHaveLength(3);
  });

  it('the tooltip lists only visible warehouses and its Total sums only them (no Total with one visible)', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    const { container } = await renderPanel();
    fireEvent.click(panelEntry('WH-A'));
    fireEvent.mouseMove(container.querySelector('svg'), { clientX: 340, clientY: 50 });
    expect(screen.getAllByTestId('StockChartTooltipRow').map(r => r.textContent)).toEqual(['WH-B30 stockUnitAbbr', 'WH-C10 stockUnitAbbr']);
    expect(screen.getByTestId('StockChartTooltipTotal').textContent).toBe('total40 stockUnitAbbr');
    fireEvent.click(panelEntry('WH-B'));
    expect(screen.queryByTestId('StockChartTooltipTotal')).toBeNull();
  });

  it('the last visible series cannot be hidden', async () => {
    const { container } = await renderPanel();
    fireEvent.click(panelEntry('WH-A'));
    fireEvent.click(panelEntry('WH-B'));
    fireEvent.click(panelEntry('WH-C'));
    expect(panelEntry('WH-C').getAttribute('aria-pressed')).toBe('true');
    expect(lines(container.querySelector('svg'))).toHaveLength(1);
  });

  it('hover fades the other series and legend dots; leaving restores; hover on a hidden entry highlights nothing', async () => {
    const { container } = await renderPanel();
    fireEvent.mouseEnter(panelEntry('WH-A'));
    const op = () => [...lines(container.querySelector('svg'))].map(l => l.getAttribute('opacity'));
    expect(op()).toEqual(['1', '0.25', '0.25']);
    const dots = () => [...screen.getAllByTestId('StockChartLegend')[0].querySelectorAll('[data-testid="StockChartLegendDot"]')].map(d => d.style.opacity);
    expect(dots()).toEqual(['1', '0.25', '0.25']);
    fireEvent.mouseLeave(panelEntry('WH-A'));
    expect(op()).toEqual(['1', '1', '1']);
    fireEvent.click(panelEntry('WH-C'));
    fireEvent.mouseEnter(panelEntry('WH-C'));
    expect(op()).toEqual(['1', '1']);
  });

  it('keyboard focus highlights and Enter / Space on a real button toggle', async () => {
    const { container } = await renderPanel();
    fireEvent.focus(panelEntry('WH-B'));
    expect([...lines(container.querySelector('svg'))].map(l => l.getAttribute('opacity'))).toEqual(['0.25', '1', '0.25']);
    fireEvent.blur(panelEntry('WH-B'));
    // buttons activate on Enter/Space natively (click); guard that nothing swallows the keys and that it is not an a11y-less div
    expect(panelEntry('WH-B').tagName).toBe('BUTTON');
    expect(panelEntry('WH-B').hasAttribute('tabindex')).toBe(false);
  });

  it('keeps the state across tabs and period changes', async () => {
    await renderPanel();
    fireEvent.click(panelEntry('WH-A'));
    fireEvent.click(screen.getByText('warehouses'));
    fireEvent.click(screen.getByText('summary'));
    expect(panelEntry('WH-A').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByText('last12Months'));
    fireEvent.click(screen.getByText('last3Months'));
    expect(panelEntry('WH-A').getAttribute('aria-pressed')).toBe('false');
  });

  it('resets when the product changes', async () => {
    mockFetchResponses(rows());
    const { rerender } = render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    fireEvent.click(panelEntry('WH-A'));
    rerender(<ProductSidebar {...defaultProps} recordId="prod-2" />);
    await waitFor(() => expect(panelEntry('WH-A')?.getAttribute('aria-pressed')).toBe('true'));
  });

  it('a single warehouse renders the entry but the click is a no-op', async () => {
    const { container } = await renderPanel({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 5 }],
      transactions: [{ movementDate: '2026-05-10', movementQuantity: 5, storageBin: 'LOC1' }],
    });
    fireEvent.click(panelEntry('WH-A'));
    expect(panelEntry('WH-A').getAttribute('aria-pressed')).toBe('true');
    expect(lines(container.querySelector('svg'))).toHaveLength(1);
  });

  describe('modal', () => {
    const openModal = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'expand' }));
      const dialog = await screen.findByTestId('dialog');
      return dialog;
    };
    const modalEntry = (dialog, name) => entry(name, dialog);
    const modalLines = (dialog) => lines(dialog.querySelector('svg'));
    const row = (dialog, name) => [...dialog.querySelectorAll('[data-testid="StockWarehouseRow"]')].find(r => r.textContent.startsWith(name));

    it('opens with the panel visible set; a click isolates (even a hidden one), a second click restores', async () => {
      await renderPanel();
      fireEvent.click(panelEntry('WH-A'));
      const dialog = await openModal();
      expect(modalEntry(dialog, 'WH-A').getAttribute('aria-pressed')).toBe('false');
      expect(modalLines(dialog)).toHaveLength(2);
      fireEvent.click(modalEntry(dialog, 'WH-A'));
      expect(modalLines(dialog)).toHaveLength(1);
      expect(['WH-A', 'WH-B', 'WH-C'].map(n => modalEntry(dialog, n).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
      fireEvent.click(modalEntry(dialog, 'WH-A'));
      expect(modalLines(dialog)).toHaveLength(3);
    });

    it('a list click equals a legend click, and both controls share the same state', async () => {
      await renderPanel();
      const dialog = await openModal();
      fireEvent.click(row(dialog, 'WH-B'));
      expect(modalEntry(dialog, 'WH-B').getAttribute('aria-pressed')).toBe('true');
      expect(modalEntry(dialog, 'WH-A').getAttribute('aria-pressed')).toBe('false');
      expect(row(dialog, 'WH-B').getAttribute('aria-pressed')).toBe('true');
      expect(row(dialog, 'WH-A').getAttribute('aria-pressed')).toBe('false');
      expect(row(dialog, 'WH-A').className).toContain('bg-muted');
      fireEvent.click(modalEntry(dialog, 'WH-B'));
      expect(row(dialog, 'WH-A').getAttribute('aria-pressed')).toBe('true');
    });

    it('the footer total is always the sum of ALL warehouses, whatever is isolated', async () => {
      await renderPanel();
      const dialog = await openModal();
      expect(screen.getByTestId('StockWarehouseTotal').textContent).toBe('total: 140 units');
      fireEvent.click(modalEntry(dialog, 'WH-C'));
      expect(screen.getByTestId('StockWarehouseTotal').textContent).toBe('total: 140 units');
    });

    it('modal changes never touch the panel, and reopening re-syncs from the panel', async () => {
      await renderPanel();
      fireEvent.click(panelEntry('WH-C'));
      let dialog = await openModal();
      fireEvent.click(modalEntry(dialog, 'WH-A'));
      expect(panelEntry('WH-A').getAttribute('aria-pressed')).toBe('true');
      expect(panelEntry('WH-B').getAttribute('aria-pressed')).toBe('true');
      expect(panelEntry('WH-C').getAttribute('aria-pressed')).toBe('false');
    });

    it('hover highlight works in the modal legend', async () => {
      await renderPanel();
      const dialog = await openModal();
      fireEvent.mouseEnter(modalEntry(dialog, 'WH-B'));
      expect([...modalLines(dialog)].map(l => l.getAttribute('opacity'))).toEqual(['0.25', '1', '0.25']);
    });
  });
});

// ETP-5908 RF-16: collapse the panel to a 48 px strip.
describe('ProductSidebar — collapse (RF-16)', () => {
  const rows = () => ({
    stockRows: [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 100 },
      { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-B', quantityOnHand: 30 },
    ],
    transactions: [
      { movementDate: '2026-05-10', movementQuantity: 100, storageBin: 'LOC1' },
      { movementDate: '2026-05-10', movementQuantity: 30, storageBin: 'LOC2' },
    ],
  });
  const collapse = () => fireEvent.click(screen.getByTestId('ProductSidebarCollapseButton'));
  const marker = (c) => c.querySelector('[data-product-sidebar-collapsed]').getAttribute('data-product-sidebar-collapsed');

  beforeEach(() => { vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('shows the collapse button (Lucide PanelRightClose) with name, tooltip and aria-expanded', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);
    const btn = screen.getByTestId('ProductSidebarCollapseButton');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-label')).toBe('hidePanel');
    expect(btn.getAttribute('title')).toBe('hidePanel');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('icon-panel-close')).toBeInTheDocument();
  });

  it('also shows the collapse button in the empty state and for a new product', async () => {
    mockFetchResponses({ stockRows: [], transactions: [] });
    const { unmount } = render(<ProductSidebar {...defaultProps} />);
    await screen.findByText('noStockMovements');
    expect(screen.getByTestId('ProductSidebarCollapseButton')).toBeInTheDocument();
    unmount();
    render(<ProductSidebar {...defaultProps} recordId={null} />);
    expect(screen.getByTestId('ProductSidebarCollapseButton')).toBeInTheDocument();
  });

  it('collapsing renders the strip: open button, Summary and Warehouses icons, expanded content hidden', async () => {
    mockFetchResponses(rows());
    const { container } = render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    expect(marker(container)).toBe('false');
    collapse();
    expect(marker(container)).toBe('true');
    const strip = screen.getByTestId('ProductSidebarCollapsed');
    expect(strip.getAttribute('aria-label')).toBe('productSidePanel');
    const open = screen.getByTestId('ProductSidebarOpenButton');
    expect(open.getAttribute('aria-label')).toBe('showPanel');
    expect(open.getAttribute('title')).toBe('showPanel');
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('ProductSidebarStripSummary').getAttribute('aria-label')).toBe('summary');
    expect(screen.getByTestId('ProductSidebarStripWarehouses').getAttribute('title')).toBe('warehouses');
    expect(screen.queryByTestId('StockChartLegend')).toBeNull();
    expect(screen.queryByTestId('ProductSidebarCollapseButton')).toBeNull();
    expect(localStorage.getItem('etendo.product.sidebar.collapsed')).toBe('true');
  });

  it('moves focus to the counterpart after a user toggle, never on mount', async () => {
    mockFetchResponses(rows());
    const { unmount } = render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    expect(document.activeElement).toBe(document.body);
    collapse();
    expect(document.activeElement).toBe(screen.getByTestId('ProductSidebarOpenButton'));
    fireEvent.click(screen.getByTestId('ProductSidebarOpenButton'));
    expect(document.activeElement).toBe(screen.getByTestId('ProductSidebarCollapseButton'));
    collapse();
    fireEvent.click(screen.getByTestId('ProductSidebarStripWarehouses'));
    expect(document.activeElement).toBe(screen.getByTestId('ProductSidebarTab-warehouses'));
    unmount();
    for (const stored of ['true', 'false']) {
      localStorage.setItem('etendo.product.sidebar.collapsed', stored);
      const r = render(<ProductSidebar {...defaultProps} />);
      expect(document.activeElement).toBe(document.body);
      r.unmount();
    }
  });

  it('starts collapsed when the stored preference says so', () => {
    localStorage.setItem('etendo.product.sidebar.collapsed', 'true');
    mockFetchResponses();
    const { container } = render(<ProductSidebar {...defaultProps} />);
    expect(marker(container)).toBe('true');
    expect(screen.queryByText('summary')).toBeNull();
  });

  it('the open button reopens on the tab that was active', async () => {
    mockFetchResponses(rows());
    render(<ProductSidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('warehouses'));
    await screen.findByTestId('WarehouseCards');
    collapse();
    fireEvent.click(screen.getByTestId('ProductSidebarOpenButton'));
    expect(await screen.findByTestId('WarehouseCards')).toBeInTheDocument();
    expect(localStorage.getItem('etendo.product.sidebar.collapsed')).toBe('false');
  });

  it.each([
    ['ProductSidebarStripWarehouses', 'WarehouseCards', 'AvailabilityLocationsLink'],
    ['ProductSidebarStripSummary', 'AvailabilityLocationsLink', 'WarehouseCards'],
  ])('clicking %s reopens on that tab', async (stripId, shown, hidden) => {
    mockFetchResponses(rows());
    render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    // Start from the opposite tab so the strip icon really switches it.
    if (stripId.endsWith('Summary')) fireEvent.click(screen.getByText('warehouses'));
    collapse();
    fireEvent.click(screen.getByTestId(stripId));
    expect(screen.queryByTestId('ProductSidebarCollapsed')).toBeNull();
    expect(screen.getByTestId(shown)).toBeInTheDocument();
    expect(screen.queryByTestId(hidden)).toBeNull();
  });

  it('keeps period, hidden series and the loaded history across a collapse/expand cycle', async () => {
    mockFetchResponses(rows());
    render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    const fetchesBefore = globalThis.fetch.mock.calls.length;
    const item = (n) => screen.getAllByTestId('StockChartLegendItem').find(b => b.textContent === n);
    fireEvent.click(item('WH-A'));
    fireEvent.click(screen.getByText('last12Months'));
    fireEvent.click(screen.getByText('last3Months'));
    collapse();
    fireEvent.click(screen.getByTestId('ProductSidebarOpenButton'));
    expect(item('WH-A').getAttribute('aria-pressed')).toBe('false');
    expect(item('WH-B').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByText('last3Months').length).toBeGreaterThan(0);
    expect(globalThis.fetch.mock.calls.length).toBe(fetchesBefore);
  });

  it('the expand modal still works after reopening', async () => {
    mockFetchResponses(rows());
    render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
    collapse();
    fireEvent.click(screen.getByTestId('ProductSidebarOpenButton'));
    fireEvent.click(screen.getByTestId('StockChartExpandButton'));
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });
});

// ETP-5908 batch E: "Ver movimientos" link + chart click.
describe('ProductSidebar — Ver movimientos link and chart click', () => {
  const data = {
    stockRows: [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 100 },
      { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-B', quantityOnHand: 30 },
    ],
    transactions: [
      { movementDate: '2026-05-10', movementQuantity: 100, storageBin: 'LOC1' },
      { movementDate: '2026-05-10', movementQuantity: 30, storageBin: 'LOC2' },
    ],
  };
  const link = () => screen.queryByTestId('ProductViewMovementsLink');
  const renderPanel = async () => {
    mockFetchResponses(data);
    render(<ProductSidebar {...defaultProps} />);
    await screen.findByTestId('StockChartLegend');
  };
  const chartSvg = () => screen.getAllByTestId('ChartSVG__59b33d')[0] ?? document.querySelector('svg');

  it.each([
    ['off', { productMovements: false }],
    ['unknown (empty map)', {}],
    ['unknown (null)', null],
  ])('renders no link while the capability is %s', async (_n, caps) => {
    router.capabilities = caps;
    await renderPanel();
    expect(link()).toBeNull();
    expect(document.body.textContent).not.toContain('productMovementsViewLink');
  });

  it.each(['summary', 'warehouses'])('shows the link with the capability on, in the %s tab', async (tab) => {
    router.capabilities = { productMovements: true };
    await renderPanel();
    fireEvent.click(screen.getByTestId(`ProductSidebarTab-${tab}`));
    expect(link().tagName).toBe('BUTTON');
    expect(link().textContent).toContain('productMovementsViewLink');
  });

  it.each([['3M', 'last3m'], ['6M', 'last6m'], ['12M', 'last12m']])('navigates to the Movements tab prefiltered by %s', async (period, preset) => {
    router.capabilities = { productMovements: true };
    await renderPanel();
    if (period !== '12M') {
      fireEvent.click(screen.getByText('last12Months'));
      fireEvent.click(screen.getByText(period === '3M' ? 'last3Months' : 'last6Months'));
    }
    fireEvent.click(link());
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith('/product/prod-1?x=1', {
      replace: true,
      state: { openSecondaryTab: 'custom:movements', movementsPeriod: preset },
    });
  });

  it('does not navigate when the capability is off', async () => {
    await renderPanel();
    fireEvent.click(screen.getByTestId('ProductSidebarTab-summary'));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it.each([['on', { productMovements: true }], ['off', {}]])('a click on the chart plot opens the expand modal with the flag %s', async (_n, caps) => {
    router.capabilities = caps;
    await renderPanel();
    expect(screen.queryByTestId('dialog')).toBeNull();
    const svg = document.querySelector('svg.cursor-pointer');
    expect(svg).not.toBeNull();
    fireEvent.click(svg);
    expect(await screen.findByTestId('dialog')).toBeInTheDocument();
  });

  it('a click on a legend entry does not open the modal', async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByTestId('StockChartLegendItem')[0]);
    expect(screen.queryByTestId('dialog')).toBeNull();
  });
});

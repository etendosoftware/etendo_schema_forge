// @covers tools/app-shell/src/windows/custom/product/ProductMovementsTab.jsx
// ETP-5889 — the Product "Movements" tab: server-side filters, sorting and paging over the product's
// transactions, with the source document and the resulting stock the backend adds to each row.
import { createContext, useContext } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  tracking: vi.fn(),
  // The per-account flag, published by the backend as `capabilities.productMovements`.
  capabilities: { productMovements: true },
}));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mocks.apiFetch }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({ useCapabilitiesSafe: () => mocks.capabilities }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('../useProductMovementsTabTracking', () => ({ useProductMovementsTabTracking: (args) => mocks.tracking(args) }));
vi.mock('@/components/ui/date-range-popover.jsx', () => ({
  DateRangePopover: ({ onChange }) => <button type="button" data-testid="period" onClick={() => onChange({ presetId: 'last30' })}>period</button>,
}));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <span /> }));
vi.mock('@/components/ui/select', () => {
  const Ctx = createContext(() => {});
  return {
    Select: ({ onValueChange, children }) => <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>,
    SelectTrigger: ({ children, 'aria-label': ariaLabel }) => <div role="combobox" aria-label={ariaLabel}>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem: function SelectItem({ value, children }) {
      const onValueChange = useContext(Ctx);
      return <button type="button" data-testid={`warehouse-${value}`} onClick={() => onValueChange(value)}>{children}</button>;
    },
  };
});
vi.mock('lucide-react', () => new Proxy({}, {
  has: (_t, prop) => typeof prop === 'string' && prop !== 'then',
  get: (_t, prop) => (typeof prop === 'string' && prop !== 'then' ? (props) => <span {...props} /> : undefined),
}));

import ProductMovementsTab from '../ProductMovementsTab';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

const storable = { id: 'p1', productType: 'I', stocked: true };

const row = (overrides = {}) => ({
  id: `t-${Math.random()}`,
  movementDate: '2026-10-20',
  movementQuantity: 4,
  transactionCost: 5.34,
  etgoDocKind: 'goods-movements',
  etgoDocWindow: 'goods-movements',
  etgoDocHeaderId: 'doc-1',
  etgoDocLabel: 'MV-0021',
  etgoStockAfter: 21,
  etgoWarehouse: 'wh-1',
  'etgoWarehouse$_identifier': 'Almacén Norte',
  ...overrides,
});

const respond = (rows, totalRows = rows.length, extra = {}) => ({ ok: true, json: async () => ({ response: { data: rows, totalRows, ...extra } }) });

// Routes every request: the count (one row), the stock (warehouses) and the pages.
function route({ pages = [[row()]], total = 1, stock = [], withExactTotal = true } = {}) {
  let page = 0;
  mocks.apiFetch.mockImplementation(async (path) => {
    if (path.startsWith('/stock')) return respond(stock);
    // NEO reports the rows returned plus one as totalRows on a partial page; the exact total is the backend's.
    if (path.includes('_endRow=0&') || path.endsWith('_endRow=0')) return respond([], 2, withExactTotal ? { etgoTotalRows: total } : {});
    const rows = pages[Math.min(page, pages.length - 1)];
    page += 1;
    return respond(rows, total);
  });
}

const pageRequests = () => mocks.apiFetch.mock.calls.map(([path]) => path).filter((p) => p.startsWith('/transactions') && !p.includes('_endRow=0&') && !p.endsWith('_endRow=0'));
const query = (path) => new URLSearchParams(path.split('?')[1]);

describe('ProductMovementsTab (ETP-5889)', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.tracking.mockReset();
    mocks.capabilities = { productMovements: true };
    route();
  });

  // The flag is evaluated by the backend only; the tab reads its answer as `capabilities.productMovements`.
  describe('account feature flag (capabilities.productMovements)', () => {
    it('is shown and loads data while the capability is on', async () => {
      const onVisibilityChange = vi.fn();
      render(<ProductMovementsTab data={storable} isActive onVisibilityChange={onVisibilityChange} />);

      expect(await screen.findByTestId('product-movements-tab')).toBeInTheDocument();
      expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
      await waitFor(() => expect(pageRequests()).toHaveLength(1));
    });

    it.each([
      ['off', { productMovements: false }],
      ['absent', {}],
    ])('hides itself, fetches nothing and emits no telemetry while the capability is %s', async (_name, capabilities) => {
      mocks.capabilities = capabilities;
      const onVisibilityChange = vi.fn();
      const onCountChange = vi.fn();
      const { container } = render(
        <ProductMovementsTab data={storable} isActive onVisibilityChange={onVisibilityChange} onCountChange={onCountChange} />,
      );

      expect(container).toBeEmptyDOMElement();
      expect(onVisibilityChange).toHaveBeenCalledWith(false);
      expect(onVisibilityChange).not.toHaveBeenCalledWith(true);
      expect(mocks.apiFetch).not.toHaveBeenCalled();
      expect(onCountChange).not.toHaveBeenCalled();
      // The tracking hook only fires on isActive: it must never be told the tab is active.
      expect(mocks.tracking).not.toHaveBeenCalledWith({ isActive: true });
    });

    it('appears and starts loading when the capability turns on after mount', async () => {
      mocks.capabilities = { productMovements: false };
      const onVisibilityChange = vi.fn();
      const { rerender } = render(<ProductMovementsTab data={storable} isActive onVisibilityChange={onVisibilityChange} />);
      expect(mocks.apiFetch).not.toHaveBeenCalled();

      mocks.capabilities = { productMovements: true };
      rerender(<ProductMovementsTab data={storable} isActive onVisibilityChange={onVisibilityChange} />);

      expect(await screen.findByTestId('product-movements-tab')).toBeInTheDocument();
      expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('renders nothing and hides itself for a product that is not stocked', async () => {
    const onVisibilityChange = vi.fn();
    const { container } = render(
      <ProductMovementsTab data={{ id: 'p1', productType: 'S', stocked: true }} isActive onVisibilityChange={onVisibilityChange} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('declares that it needs a saved product, with its hint, so DetailView shows it disabled on a new one (ETP-5309)', () => {
    expect(ProductMovementsTab.requiresSavedRecord).toBe(true);
    expect(ProductMovementsTab.savedRecordHintKey).toBe('productMovementsSaveFirstHint');
  });

  it('stays offered, but renders and requests nothing, while the product is not saved yet', async () => {
    const onVisibilityChange = vi.fn();
    const { container } = render(<ProductMovementsTab data={{ productType: 'I', stocked: true }} isActive onVisibilityChange={onVisibilityChange} />);

    expect(container).toBeEmptyDOMElement();
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('keeps the sticky header on the sticky tier of the elevation scale (z-30)', async () => {
    const { container } = render(<ProductMovementsTab data={storable} isActive />);
    await waitFor(() => expect(pageRequests()).toHaveLength(1));

    const header = container.querySelector('.sticky');
    expect(header.className).toContain('z-30');
    expect(header.className).not.toContain('z-10');
  });

  it('formats the cost with the organisation currency and the guideline fallback, never a hardcoded euro', async () => {
    route({ pages: [[row({ transactionCost: 1892.72 })]] });
    render(<ProductMovementsTab data={storable} isActive />);

    const line = await screen.findByTestId('product-movements-row');
    expect(line).toHaveTextContent('1.892,72');
  });

  it('asks the tab to stay visible for a stocked item', async () => {
    const onVisibilityChange = vi.fn();
    render(<ProductMovementsTab data={storable} isActive={false} onVisibilityChange={onVisibilityChange} />);

    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it('counts the movements as soon as it is mounted, but loads the rows only once it is shown', async () => {
    const onCountChange = vi.fn();
    const { rerender } = render(<ProductMovementsTab data={storable} isActive={false} onCountChange={onCountChange} />);

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));
    expect(pageRequests()).toHaveLength(0);

    rerender(<ProductMovementsTab data={storable} isActive onCountChange={onCountChange} />);

    await waitFor(() => expect(pageRequests()).toHaveLength(1));
  });

  it('counts with the exact total of the backend, not with the lower bound NEO calls totalRows', async () => {
    route({ total: 8 });
    const onCountChange = vi.fn();
    render(<ProductMovementsTab data={storable} isActive={false} onCountChange={onCountChange} />);

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(8));
    expect(onCountChange).not.toHaveBeenCalledWith(2);
  });

  it('shows no counter, rather than a wrong one, when the backend sends no exact total', async () => {
    route({ total: 8, withExactTotal: false });
    const onCountChange = vi.fn();
    render(<ProductMovementsTab data={storable} isActive onCountChange={onCountChange} />);

    await screen.findByTestId('product-movements-row');
    expect(onCountChange).not.toHaveBeenCalled();
  });

  it('opens on the last 7 days, newest first, 50 rows at a time', async () => {
    render(<ProductMovementsTab data={storable} isActive />);

    await waitFor(() => expect(pageRequests()).toHaveLength(1));
    const params = query(pageRequests()[0]);
    expect(params.get('parentId')).toBe('p1');
    expect(params.get('_sortBy')).toBe('movementDate desc');
    expect(params.get('_startRow')).toBe('0');
    expect(params.get('_endRow')).toBe('49');
    const criteria = JSON.parse(params.get('criteria'));
    expect(criteria.map((c) => `${c.fieldName}:${c.operator}`)).toEqual(['movementDate:greaterOrEqual', 'movementDate:lessOrEqual']);
  });

  it('tells the tracking hook it is active only while it is shown for a stocked product', async () => {
    const { rerender } = render(<ProductMovementsTab data={storable} isActive={false} />);
    expect(mocks.tracking).toHaveBeenLastCalledWith({ isActive: false });

    rerender(<ProductMovementsTab data={storable} isActive />);
    expect(mocks.tracking).toHaveBeenLastCalledWith({ isActive: true });

    rerender(<ProductMovementsTab data={{ ...storable, productType: 'S' }} isActive />);
    expect(mocks.tracking).toHaveBeenLastCalledWith({ isActive: false });
  });

  it('shows type, document, warehouse, signed quantity, cost and resulting stock of each movement', async () => {
    route({ pages: [[
      row({ etgoDocKind: 'goods-shipment', etgoDocWindow: 'goods-shipment', etgoDocLabel: 'AV-0047', movementQuantity: -7, etgoStockAfter: 25, 'etgoWarehouse$_identifier': 'Almacén Principal' }),
    ]] });
    render(<ProductMovementsTab data={storable} isActive />);

    const line = await screen.findByTestId('product-movements-row');
    expect(line).toHaveTextContent('productMovementsTypeCustomerShipment');
    expect(line).toHaveTextContent('AV-0047');
    expect(line).toHaveTextContent('Almacén Principal');
    expect(line).toHaveTextContent('−7');
    expect(line).toHaveTextContent('25');
    expect(line).toHaveTextContent('5,34');
    expect(line).toHaveTextContent('20/10/2026');
  });

  it('colours the type badge with the shared Tag variants: green in, orange out, neutral for a transfer', async () => {
    route({ pages: [[
      row({ id: 'in', etgoDocKind: 'goods-receipt', etgoDocWindow: 'goods-receipt', movementQuantity: 10 }),
      row({ id: 'out', etgoDocKind: 'goods-shipment', etgoDocWindow: 'goods-shipment', movementQuantity: -3 }),
      row({ id: 'tr', etgoDocKind: 'goods-movements', movementQuantity: 4 }),
    ]], total: 3 });
    const { container } = render(<ProductMovementsTab data={storable} isActive />);

    await screen.findAllByTestId('product-movements-row');
    const variants = [...container.querySelectorAll('.tag')].map((tag) => [...tag.classList].find((c) => c.startsWith('tag--')));
    expect(variants).toEqual(['tag--green', 'tag--orange', 'tag--neutral']);
  });

  it('paints the sign of a quantity with the semantic colours of the grid, not with its own palette', async () => {
    route({ pages: [[row({ id: 'a', movementQuantity: 4 }), row({ id: 'b', movementQuantity: -4 })]], total: 2 });
    render(<ProductMovementsTab data={storable} isActive />);

    const [entry, exit] = await screen.findAllByTestId('product-movements-row');
    const colourOf = (line) => [...line.querySelectorAll('span')].find((el) => /^[+\u2212]\d/.test(el.textContent)).style.color;
    expect(colourOf(entry)).toBe('var(--status-success-fg)');
    expect(colourOf(exit)).toBe('hsl(var(--destructive))');
  });

  it('shows a dash, not a zero, when the backend sends no resulting stock', async () => {
    route({ pages: [[row({ etgoStockAfter: null })]] });
    render(<ProductMovementsTab data={storable} isActive />);

    const line = await screen.findByTestId('product-movements-row');
    expect(line.lastElementChild).toHaveTextContent('—');
  });

  it('opens the source document in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ProductMovementsTab data={storable} isActive />);

    await userEvent.click(await screen.findByTestId('product-movements-doc-link'));

    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0];
    expect(url).toMatch(/\/goods-movements\/doc-1$/);
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
    open.mockRestore();
  });

  it('shows both sides of a transfer between warehouses as separate rows', async () => {
    route({ pages: [[
      row({ movementQuantity: -4, 'etgoWarehouse$_identifier': 'Almacén Principal' }),
      row({ movementQuantity: 4, 'etgoWarehouse$_identifier': 'Almacén Norte' }),
    ]], total: 2 });
    render(<ProductMovementsTab data={storable} isActive />);

    const lines = await screen.findAllByTestId('product-movements-row');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('productMovementsTypeTransfer');
    expect(lines[1]).toHaveTextContent('productMovementsTypeTransfer');
  });

  it('sorts by the warehouse name and starts again from the first page', async () => {
    render(<ProductMovementsTab data={storable} isActive />);
    await waitFor(() => expect(pageRequests()).toHaveLength(1));

    await userEvent.click(screen.getByText('productMovementsWarehouse'));

    await waitFor(() => expect(pageRequests()).toHaveLength(2));
    const params = query(pageRequests()[1]);
    expect(params.get('_sortBy')).toBe('etgoWarehouse$_identifier');
    expect(params.get('_startRow')).toBe('0');
  });

  it('flips the direction when the sorted column is clicked again', async () => {
    render(<ProductMovementsTab data={storable} isActive />);
    await waitFor(() => expect(pageRequests()).toHaveLength(1));

    await userEvent.click(screen.getByText('date'));

    await waitFor(() => expect(pageRequests()).toHaveLength(2));
    expect(query(pageRequests()[1]).get('_sortBy')).toBe('movementDate asc');
  });

  it('does not let the resulting stock be sorted', async () => {
    render(<ProductMovementsTab data={storable} isActive />);
    await waitFor(() => expect(pageRequests()).toHaveLength(1));

    expect(screen.getByText('productMovementsStockAfter').closest('button')).toBeNull();
  });

  it('filters the exits by the sign of the quantity', async () => {
    render(<ProductMovementsTab data={storable} isActive />);
    await waitFor(() => expect(pageRequests()).toHaveLength(1));

    await userEvent.click(screen.getByText('productMovementsOut'));

    await waitFor(() => expect(pageRequests()).toHaveLength(2));
    const criteria = JSON.parse(query(pageRequests()[1]).get('criteria'));
    expect(criteria).toContainEqual({ fieldName: 'movementQuantity', operator: 'lessThan', value: 0 });
  });

  it('filters by period and by warehouse', async () => {
    route({ stock: [{ warehouse: 'wh-9', 'warehouse$_identifier': 'Almacén Sur' }] });
    render(<ProductMovementsTab data={storable} isActive />);
    await waitFor(() => expect(pageRequests()).toHaveLength(1));

    await userEvent.click(screen.getByTestId('period'));
    await waitFor(() => expect(pageRequests()).toHaveLength(2));

    await userEvent.click(await screen.findByTestId('warehouse-wh-9'));
    await waitFor(() => expect(pageRequests()).toHaveLength(3));
    const criteria = JSON.parse(query(pageRequests()[2]).get('criteria'));
    expect(criteria).toContainEqual({ fieldName: 'etgoWarehouse', operator: 'equals', value: 'wh-9' });
  });

  it('loads the next 50 rows when the list is scrolled to the end', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => row({ id: `a-${i}` }));
    route({ pages: [firstPage, [row({ id: 'b-0' })]], total: 51 });
    render(<ProductMovementsTab data={storable} isActive />);
    await waitFor(() => expect(screen.getAllByTestId('product-movements-row')).toHaveLength(50));

    const scroller = screen.getByTestId('product-movements-scroll');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
    scroller.scrollTop = 560;
    fireEvent.scroll(scroller);

    await waitFor(() => expect(screen.getAllByTestId('product-movements-row')).toHaveLength(51));
    expect(query(pageRequests()[1]).get('_startRow')).toBe('50');
  });

  it('does not ask for another page when the last one came back short', async () => {
    route({ pages: [[row()]], total: 1 });
    render(<ProductMovementsTab data={storable} isActive />);
    await screen.findByTestId('product-movements-row');

    const scroller = screen.getByTestId('product-movements-scroll');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 300 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 300 });
    fireEvent.scroll(scroller);

    expect(pageRequests()).toHaveLength(1);
  });

  it('says the product has no movements when its total is zero', async () => {
    route({ pages: [[]], total: 0 });
    render(<ProductMovementsTab data={storable} isActive />);

    expect(await screen.findByTestId('product-movements-empty')).toHaveTextContent('noStockMovements');
  });

  it('says there are no results for the filters when the product does have movements', async () => {
    route({ pages: [[]], total: 12 });
    render(<ProductMovementsTab data={storable} isActive />);

    expect(await screen.findByTestId('product-movements-no-results')).toHaveTextContent('productMovementsNoResults');
  });

  it('shows skeleton rows while the first page loads', async () => {
    mocks.apiFetch.mockImplementation(() => new Promise(() => {}));
    render(<ProductMovementsTab data={storable} isActive />);

    expect(await screen.findAllByTestId('product-movements-skeleton')).toHaveLength(6);
  });

  it('shows an error instead of an empty state when the request fails', async () => {
    mocks.apiFetch.mockImplementation(async (path) => (path.startsWith('/transactions') && !path.endsWith('_endRow=0')
      ? { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }
      : respond([], 3)));
    render(<ProductMovementsTab data={storable} isActive />);

    expect(await screen.findByText('productMovementsError')).toBeInTheDocument();
    expect(screen.queryByTestId('product-movements-empty')).toBeNull();
  });

  // Retry of a failed load: the error is an alert with a button that asks for the same page again.
  describe('error and retry', () => {
    const isCount = (p) => p.startsWith('/transactions') && (p.includes('_endRow=0&') || p.endsWith('_endRow=0'));
    const failure = { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) };
    // `outcomes` is consumed one per page request: 'reject' | 'http' | an array of rows.
    function routeOutcomes(outcomes, total = 51) {
      let n = 0;
      mocks.apiFetch.mockImplementation(async (path) => {
        if (path.startsWith('/stock')) return respond([]);
        if (isCount(path)) return respond([], 2, { etgoTotalRows: total });
        const outcome = outcomes[Math.min(n, outcomes.length - 1)];
        n += 1;
        if (outcome === 'reject') throw new Error('network down');
        if (outcome === 'http') return failure;
        return respond(outcome, total);
      });
    }
    const scrollToEnd = () => {
      const scroller = screen.getByTestId('product-movements-scroll');
      Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
      Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 });
      scroller.scrollTop = 560;
      fireEvent.scroll(scroller);
    };
    const fullPage = (prefix) => Array.from({ length: 50 }, (_, i) => row({ id: `${prefix}-${i}` }));

    it('shows no retry button while there is no error', async () => {
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      expect(screen.queryByTestId('product-movements-error')).toBeNull();
      expect(screen.queryByTestId('product-movements-retry')).toBeNull();
    });

    it.each([
      ['the request rejects', 'reject'],
      ['the response is not ok', 'http'],
    ])('a failed first load (%s) shows the alert with the message and a retry button labelled retry', async (_name, outcome) => {
      routeOutcomes([outcome]);
      render(<ProductMovementsTab data={storable} isActive />);

      const alert = await screen.findByTestId('product-movements-error');
      expect(alert).toHaveAttribute('role', 'alert');
      expect(alert).toHaveTextContent('productMovementsError');
      expect(screen.getByTestId('product-movements-retry')).toHaveTextContent('retry');
      expect(screen.queryAllByTestId('product-movements-row')).toHaveLength(0);
    });

    it('retrying a failed first load asks for the first page again, shows skeletons, then clears the error and paints the rows', async () => {
      routeOutcomes(['reject', [row({ id: 'ok-1' }), row({ id: 'ok-2' })]], 2);
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-retry');
      expect(pageRequests()).toHaveLength(1);

      // Hold the retry response to observe the loading state.
      let release;
      const gate = new Promise((r) => { release = r; });
      const inner = mocks.apiFetch.getMockImplementation();
      mocks.apiFetch.mockImplementation(async (path, ...rest) => {
        if (path.startsWith('/transactions') && !isCount(path)) await gate;
        return inner(path, ...rest);
      });

      await userEvent.click(screen.getByTestId('product-movements-retry'));

      expect(await screen.findAllByTestId('product-movements-skeleton')).toHaveLength(6);
      expect(screen.queryByTestId('product-movements-error')).toBeNull();
      release();

      await waitFor(() => expect(screen.getAllByTestId('product-movements-row')).toHaveLength(2));
      expect(screen.queryByTestId('product-movements-error')).toBeNull();
      expect(screen.queryByTestId('product-movements-retry')).toBeNull();
      expect(pageRequests()).toHaveLength(2);
      expect(query(pageRequests()[1]).get('_startRow')).toBe('0');
    });

    it('a failed next page keeps the loaded rows visible with the alert and the retry button', async () => {
      routeOutcomes([fullPage('a'), 'reject']);
      render(<ProductMovementsTab data={storable} isActive />);
      await waitFor(() => expect(screen.getAllByTestId('product-movements-row')).toHaveLength(50));

      scrollToEnd();

      expect(await screen.findByTestId('product-movements-error')).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId('product-movements-retry')).toBeInTheDocument();
      expect(screen.getAllByTestId('product-movements-row')).toHaveLength(50);
    });

    it('retrying a failed page asks for that same page and appends it once, without duplicating rows', async () => {
      routeOutcomes([fullPage('a'), 'http', [row({ id: 'b-0' })]]);
      render(<ProductMovementsTab data={storable} isActive />);
      await waitFor(() => expect(screen.getAllByTestId('product-movements-row')).toHaveLength(50));
      scrollToEnd();
      await userEvent.click(await screen.findByTestId('product-movements-retry'));

      await waitFor(() => expect(screen.getAllByTestId('product-movements-row')).toHaveLength(51));
      expect(screen.queryByTestId('product-movements-error')).toBeNull();
      expect(screen.queryByTestId('product-movements-retry')).toBeNull();
      const starts = pageRequests().map((p) => query(p).get('_startRow'));
      expect(starts).toEqual(['0', '50', '50']);
    });

    it('keeps the error visible when the retry fails again, and lets the user retry once more', async () => {
      routeOutcomes(['reject', 'http', [row({ id: 'ok-1' })]], 1);
      render(<ProductMovementsTab data={storable} isActive />);
      await userEvent.click(await screen.findByTestId('product-movements-retry'));

      await waitFor(() => expect(pageRequests()).toHaveLength(2));
      expect(await screen.findByTestId('product-movements-error')).toHaveTextContent('productMovementsError');
      expect(screen.getByTestId('product-movements-retry')).toBeInTheDocument();
      expect(screen.queryAllByTestId('product-movements-row')).toHaveLength(0);

      await userEvent.click(screen.getByTestId('product-movements-retry'));
      expect(await screen.findByTestId('product-movements-row')).toBeInTheDocument();
      expect(screen.queryByTestId('product-movements-error')).toBeNull();
    });
  });

  // The tab survives a change of record: nothing of the previous product may leak into the next one.
  // C3 — accessibility semantics of the scrollable grid, its filters and the document link.
  describe('accessibility (roles, aria-sort, aria-busy, labels)', () => {
    const SORTABLE = ['date', 'type', 'warehouse', 'quantity', 'cost'];
    const headers = () => screen.getAllByRole('columnheader');
    const headerOf = (labelKey) => headers().find((h) => h.textContent.includes(labelKey));

    it('exposes the scroll container as a focusable, labelled table', async () => {
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      const table = screen.getByRole('table', { name: 'productMovements' });
      expect(table).toBe(screen.getByTestId('product-movements-scroll'));
      expect(table).toHaveAttribute('tabindex', '0');
    });

    it('is aria-busy while the first page loads and not busy at rest', async () => {
      let release;
      mocks.apiFetch.mockImplementation((path) => {
        if (path.startsWith('/transactions') && !path.endsWith('_endRow=0')) {
          return new Promise((resolve) => { release = () => resolve(respond([row()])); });
        }
        return Promise.resolve(respond([], 2, { etgoTotalRows: 1 }));
      });
      render(<ProductMovementsTab data={storable} isActive />);

      const table = await screen.findByTestId('product-movements-scroll');
      expect(table).toHaveAttribute('aria-busy', 'true');
      await waitFor(() => expect(release).toBeDefined());
      release();
      await screen.findByTestId('product-movements-row');
      expect(table).toHaveAttribute('aria-busy', 'false');
    });

    it('is aria-busy while a following page loads', async () => {
      const full = Array.from({ length: 50 }, (_, i) => row({ id: `r-${i}` }));
      let releaseSecond;
      let calls = 0;
      mocks.apiFetch.mockImplementation((path) => {
        if (path.startsWith('/stock')) return Promise.resolve(respond([]));
        if (path.includes('_endRow=0&') || path.endsWith('_endRow=0')) return Promise.resolve(respond([], 2, { etgoTotalRows: 80 }));
        calls += 1;
        if (calls === 1) return Promise.resolve(respond(full, 80));
        return new Promise((resolve) => { releaseSecond = () => resolve(respond([row({ id: 'r-next' })], 80)); });
      });
      render(<ProductMovementsTab data={storable} isActive />);
      await waitFor(() => expect(screen.getAllByTestId('product-movements-row')).toHaveLength(50));
      const table = screen.getByTestId('product-movements-scroll');
      expect(table).toHaveAttribute('aria-busy', 'false');

      Object.defineProperty(table, 'scrollHeight', { configurable: true, value: 1000 });
      Object.defineProperty(table, 'clientHeight', { configurable: true, value: 400 });
      table.scrollTop = 600;
      fireEvent.scroll(table);

      await waitFor(() => expect(table).toHaveAttribute('aria-busy', 'true'));
      releaseSecond();
      await waitFor(() => expect(table).toHaveAttribute('aria-busy', 'false'));
    });

    it('marks the header as a row of six column headers', async () => {
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      expect(headers()).toHaveLength(6);
      const headerRow = headers()[0].closest('[role="row"]');
      expect(headerRow).not.toBe(screen.getByTestId('product-movements-row'));
      headers().forEach((h) => expect(h.parentElement).toBe(headerRow));
    });

    it('gives aria-sort a direction only on the active column and "none" on the other sortable ones', async () => {
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      // Default sort: date, newest first.
      expect(headerOf('date')).toHaveAttribute('aria-sort', 'descending');
      for (const key of SORTABLE.filter((k) => k !== 'date')) {
        const label = { type: 'typeColumn', warehouse: 'productMovementsWarehouse', quantity: 'productMovementsQuantity', cost: 'productMovementsCost' }[key];
        expect(headerOf(label)).toHaveAttribute('aria-sort', 'none');
      }
    });

    it('never puts aria-sort on the non-sortable resulting-stock column', async () => {
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      expect(headerOf('productMovementsStockAfter')).not.toHaveAttribute('aria-sort');
    });

    it('moves aria-sort to the clicked column and flips it when clicked again', async () => {
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      await userEvent.click(screen.getByText('productMovementsWarehouse'));
      expect(headerOf('productMovementsWarehouse')).toHaveAttribute('aria-sort', 'ascending');
      expect(headerOf('date')).toHaveAttribute('aria-sort', 'none');

      await userEvent.click(screen.getByText('productMovementsWarehouse'));
      expect(headerOf('productMovementsWarehouse')).toHaveAttribute('aria-sort', 'descending');
      expect(headerOf('productMovementsStockAfter')).not.toHaveAttribute('aria-sort');
    });

    it('renders each movement as a row of six cells', async () => {
      route({ pages: [[row({ id: 'a' }), row({ id: 'b' })]] });
      render(<ProductMovementsTab data={storable} isActive />);

      const rows = await screen.findAllByTestId('product-movements-row');
      expect(rows).toHaveLength(2);
      rows.forEach((r) => {
        expect(r).toHaveAttribute('role', 'row');
        const children = Array.from(r.children);
        expect(children).toHaveLength(6);
        children.forEach((c) => expect(c).toHaveAttribute('role', 'cell'));
      });
    });

    it('hides the skeleton rows from assistive technology', async () => {
      mocks.apiFetch.mockImplementation(() => new Promise(() => {}));
      render(<ProductMovementsTab data={storable} isActive />);

      const skeletons = await screen.findAllByTestId('product-movements-skeleton');
      expect(skeletons).toHaveLength(6);
      skeletons.forEach((s) => expect(s).toHaveAttribute('aria-hidden', 'true'));
    });

    it('labels the direction group and the warehouse filter', async () => {
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      const group = screen.getByRole('group', { name: 'productMovementsDirection' });
      expect(group).toBe(screen.getByTestId('product-movements-direction'));
      expect(group.querySelectorAll('button')).toHaveLength(3);
      expect(screen.getByRole('combobox', { name: 'productMovementsWarehouse' })).toBeInTheDocument();
    });

    it('announces that the document link opens a new tab: decorative icon, sr-only text, same window.open', async () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      render(<ProductMovementsTab data={storable} isActive />);

      const link = await screen.findByTestId('product-movements-doc-link');
      const srOnly = link.querySelector('.sr-only');
      expect(srOnly).toHaveTextContent('openFullReport');
      expect(link).toHaveAccessibleName(/MV-0021.*openFullReport/);
      expect(link.querySelector('[aria-hidden="true"]')).not.toBeNull();

      await userEvent.click(link);
      expect(open).toHaveBeenCalledTimes(1);
      expect(open.mock.calls[0][0]).toMatch(/\/goods-movements\/doc-1$/);
      expect(open.mock.calls[0].slice(1)).toEqual(['_blank', 'noopener,noreferrer']);
      open.mockRestore();
    });

    it('keeps the error block as an alert', async () => {
      mocks.apiFetch.mockImplementation(async (path) => (path.startsWith('/transactions') && !path.endsWith('_endRow=0')
        ? { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }
        : respond([], 3)));
      render(<ProductMovementsTab data={storable} isActive />);

      expect(await screen.findByRole('alert')).toHaveTextContent('productMovementsError');
    });
  });

  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('declares a non-empty productMovementsDirection label in %s', (_locale, json) => {
    expect(JSON.stringify(json)).toMatch(/"productMovementsDirection":\s*"[^"]+"/);
  });

  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('declares non-empty resulting-stock hints (total and warehouse) in %s', (_locale, json) => {
    const text = JSON.stringify(json);
    expect(text).toMatch(/"productMovementsStockAfterTotalHint":\s*"[^"]+"/);
    expect(text).toMatch(/"productMovementsStockAfterWarehouseHint":\s*"[^"]+"/);
  });

  describe('hint of the resulting-stock column (all warehouses vs the selected one)', () => {
    const stockAfterHeader = () => screen.getByText('productMovementsStockAfter').closest('[role="columnheader"]');
    const withTwoWarehouses = { stock: [{ warehouse: 'wh-9', 'warehouse$_identifier': 'Almacén Sur' }] };

    it('says the stock is the total of all warehouses while no warehouse is selected', async () => {
      route(withTwoWarehouses);
      render(<ProductMovementsTab data={storable} isActive />);
      await screen.findByTestId('product-movements-row');

      expect(stockAfterHeader()).toHaveAttribute('title', 'productMovementsStockAfterTotalHint');
    });

    it('switches to the warehouse hint when a warehouse is selected and back to the total one when the filter is cleared', async () => {
      route(withTwoWarehouses);
      render(<ProductMovementsTab data={storable} isActive />);
      await userEvent.click(await screen.findByTestId('warehouse-wh-9'));
      await waitFor(() => expect(stockAfterHeader()).toHaveAttribute('title', 'productMovementsStockAfterWarehouseHint'));

      await userEvent.click(screen.getByTestId('warehouse-all'));
      await waitFor(() => expect(stockAfterHeader()).toHaveAttribute('title', 'productMovementsStockAfterTotalHint'));
    });

    it('goes back to the total hint when the product changes with a warehouse selected', async () => {
      const productA = { id: 'pA', productType: 'I', stocked: true };
      const productB = { id: 'pB', productType: 'I', stocked: true };
      route({ stock: [{ warehouse: 'wh-A', 'warehouse$_identifier': 'Almacén A' }] });
      const { rerender } = render(<ProductMovementsTab data={productA} isActive />);
      await userEvent.click(await screen.findByTestId('warehouse-wh-A'));
      await waitFor(() => expect(stockAfterHeader()).toHaveAttribute('title', 'productMovementsStockAfterWarehouseHint'));

      rerender(<ProductMovementsTab data={productB} isActive />);

      await waitFor(() => expect(stockAfterHeader()).toHaveAttribute('title', 'productMovementsStockAfterTotalHint'));
    });

    it('sends the warehouse as an equals criterion on etgoWarehouse (the one the backend uses for the per-warehouse balance) and drops it when cleared', async () => {
      route(withTwoWarehouses);
      render(<ProductMovementsTab data={storable} isActive />);
      await waitFor(() => expect(pageRequests()).toHaveLength(1));
      expect(JSON.parse(query(pageRequests()[0]).get('criteria')).map((c) => c.fieldName)).not.toContain('etgoWarehouse');

      await userEvent.click(await screen.findByTestId('warehouse-wh-9'));
      await waitFor(() => expect(pageRequests()).toHaveLength(2));
      const withWarehouse = JSON.parse(query(pageRequests()[1]).get('criteria')).filter((c) => c.fieldName === 'etgoWarehouse');
      expect(withWarehouse).toEqual([{ fieldName: 'etgoWarehouse', operator: 'equals', value: 'wh-9' }]);

      await userEvent.click(screen.getByTestId('warehouse-all'));
      await waitFor(() => expect(pageRequests()).toHaveLength(3));
      expect(JSON.parse(query(pageRequests()[2]).get('criteria')).map((c) => c.fieldName)).not.toContain('etgoWarehouse');
    });
  });

  describe('change of product with the tab mounted', () => {
    const productA = { id: 'pA', productType: 'I', stocked: true };
    const productB = { id: 'pB', productType: 'I', stocked: true };
    const isCount = (p) => p.startsWith('/transactions') && (p.includes('_endRow=0&') || p.endsWith('_endRow=0'));
    const parentOf = (p) => query(p).get('parentId');
    const deferred = () => {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      return { promise, resolve };
    };
    const pagesOf = (id) => pageRequests().filter((p) => parentOf(p) === id);

    // Per-product router. `count`, `pages` and `stock` may be a value or a deferred promise to hold the answer.
    function routeProducts(config) {
      mocks.apiFetch.mockImplementation(async (path) => {
        const id = path.startsWith('/stock') ? new URLSearchParams(path.split('?')[1]).get('parentId') : parentOf(path);
        const cfg = config[id];
        if (path.startsWith('/stock')) return respond(await (cfg.stock ?? []));
        if (isCount(path)) return respond([], 2, { etgoTotalRows: await cfg.count });
        return respond(await (cfg.pages ?? [row()]));
      });
    }

    it('does not show the "no movements" notice of the previous product while the counter of the new one is pending, and clears the tab counter', async () => {
      const countB = deferred();
      routeProducts({ pA: { count: 0, pages: [] }, pB: { count: countB.promise, pages: [] } });
      const onCountChange = vi.fn();
      const { rerender } = render(<ProductMovementsTab data={productA} isActive onCountChange={onCountChange} />);
      expect(await screen.findByTestId('product-movements-empty')).toBeInTheDocument();
      expect(onCountChange).toHaveBeenLastCalledWith(0);

      rerender(<ProductMovementsTab data={productB} isActive onCountChange={onCountChange} />);

      await waitFor(() => expect(pagesOf('pB')).toHaveLength(1));
      await screen.findByTestId('product-movements-no-results');
      expect(screen.queryByTestId('product-movements-empty')).toBeNull();
      expect(onCountChange).toHaveBeenCalledWith(undefined);
      expect(onCountChange).toHaveBeenLastCalledWith(undefined);

      countB.resolve(0);
      expect(await screen.findByTestId('product-movements-empty')).toBeInTheDocument();
      expect(onCountChange).toHaveBeenLastCalledWith(0);
    });

    it('does not apply the warehouse filter of the previous product to the new one, and takes the warehouse list from the new one', async () => {
      routeProducts({
        pA: { count: 1, stock: [{ warehouse: 'wh-A', 'warehouse$_identifier': 'Almacén A' }] },
        pB: { count: 1, stock: [{ warehouse: 'wh-B', 'warehouse$_identifier': 'Almacén B' }] },
      });
      const { rerender } = render(<ProductMovementsTab data={productA} isActive />);
      await userEvent.click(await screen.findByTestId('warehouse-wh-A'));
      await waitFor(() => expect(pagesOf('pA')).toHaveLength(2));
      expect(JSON.parse(query(pagesOf('pA')[1]).get('criteria'))).toContainEqual({ fieldName: 'etgoWarehouse', operator: 'equals', value: 'wh-A' });

      rerender(<ProductMovementsTab data={productB} isActive />);

      await waitFor(() => expect(pagesOf('pB').length).toBeGreaterThan(0));
      for (const path of pagesOf('pB')) {
        expect(JSON.parse(query(path).get('criteria')).map((c) => c.fieldName)).not.toContain('etgoWarehouse');
      }
      expect(await screen.findByTestId('warehouse-wh-B')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByTestId('warehouse-wh-A')).toBeNull());
    });

    it('does not paint rows of the previous product, answered late, in the new one', async () => {
      const pagesA = deferred();
      const pagesB = deferred();
      routeProducts({
        pA: { count: 1, pages: pagesA.promise },
        pB: { count: 1, pages: pagesB.promise },
      });
      const { rerender } = render(<ProductMovementsTab data={productA} isActive />);
      await waitFor(() => expect(pagesOf('pA')).toHaveLength(1));

      rerender(<ProductMovementsTab data={productB} isActive />);
      await waitFor(() => expect(pagesOf('pB')).toHaveLength(1));

      pagesA.resolve([row({ id: 'a-late', etgoDocLabel: 'A-LATE' })]);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText('A-LATE')).toBeNull();
      expect(screen.queryByTestId('product-movements-row')).toBeNull();
      expect(screen.getAllByTestId('product-movements-skeleton')).toHaveLength(6);

      pagesB.resolve([row({ id: 'b-1', etgoDocLabel: 'B-ROW' })]);
      expect(await screen.findByText('B-ROW')).toBeInTheDocument();
      expect(screen.queryByText('A-LATE')).toBeNull();
    });

    it('loads the new product when the tab is active, and waits to be shown when it is not', async () => {
      routeProducts({ pA: { count: 1 }, pB: { count: 1 } });
      const active = render(<ProductMovementsTab data={productA} isActive />);
      await waitFor(() => expect(pagesOf('pA')).toHaveLength(1));
      active.rerender(<ProductMovementsTab data={productB} isActive />);
      await waitFor(() => expect(pagesOf('pB')).toHaveLength(1));
      active.unmount();

      mocks.apiFetch.mockClear();
      const onCountChange = vi.fn();
      const idle = render(<ProductMovementsTab data={productA} isActive={false} onCountChange={onCountChange} />);
      await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));
      idle.rerender(<ProductMovementsTab data={productB} isActive={false} onCountChange={onCountChange} />);
      await waitFor(() => expect(mocks.apiFetch.mock.calls.some(([p]) => isCount(p) && parentOf(p) === 'pB')).toBe(true));
      await new Promise((r) => setTimeout(r, 20));
      expect(pageRequests()).toHaveLength(0);
      expect(mocks.apiFetch.mock.calls.some(([p]) => p.startsWith('/stock'))).toBe(false);

      idle.rerender(<ProductMovementsTab data={productB} isActive onCountChange={onCountChange} />);
      await waitFor(() => expect(pagesOf('pB')).toHaveLength(1));
      expect(pagesOf('pA')).toHaveLength(0);
    });

    it('does not reset anything nor repeat requests when it re-renders with the same product', async () => {
      routeProducts({ pA: { count: 1, stock: [{ warehouse: 'wh-A', 'warehouse$_identifier': 'Almacén A' }] } });
      const onCountChange = vi.fn();
      const { rerender } = render(<ProductMovementsTab data={productA} isActive onCountChange={onCountChange} />);
      await screen.findByTestId('product-movements-row');
      await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));
      await screen.findByTestId('warehouse-wh-A');
      const calls = mocks.apiFetch.mock.calls.length;
      onCountChange.mockClear();

      rerender(<ProductMovementsTab data={{ ...productA }} isActive onCountChange={onCountChange} />);
      await new Promise((r) => setTimeout(r, 20));

      expect(mocks.apiFetch).toHaveBeenCalledTimes(calls);
      expect(onCountChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('product-movements-row')).toBeInTheDocument();
      expect(screen.getByTestId('warehouse-wh-A')).toBeInTheDocument();
      expect(screen.queryByTestId('product-movements-skeleton')).toBeNull();
    });
  });
});

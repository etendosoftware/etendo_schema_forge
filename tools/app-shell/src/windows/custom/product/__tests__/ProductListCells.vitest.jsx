// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

// Mock useProductImage so ProductNameCell does not make real fetch calls.
// We expose a setter so individual tests can control whether an image src is returned.
let _mockImgSrc = null;
vi.mock('../useProductImage.js', () => ({
  useProductImage: () => _mockImgSrc,
}));

import { render, screen, waitFor, renderHook, act } from '@testing-library/react';
import {
  BoxIcon,
  ProductNameCell,
  ProductSalePriceCell,
  ProductPurchasePriceCell,
  ProductStockCell,
  selectPriceRow,
  useProductPrices,
} from '../ProductListCells.jsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFetch(response, ok = true) {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      json: () => Promise.resolve(response),
    }),
  );
}

function buildRejectFetch() {
  return vi.fn(() => Promise.reject(new Error('Network failure')));
}

const DEFAULT_ROW = { id: 'prod-1', name: 'Widget', searchKey: 'WGT', image: 'img-42' };
const DEFAULT_PROPS = { token: 'tok', apiBaseUrl: '/api/product/header' };

// Fixed "now" for deterministic date comparisons
const NOW = new Date('2026-06-01T00:00:00.000Z');

// ---------------------------------------------------------------------------
// selectPriceRow — pure function
// ---------------------------------------------------------------------------

describe('selectPriceRow', () => {
  // ---- null / empty input ----

  it('returns null for empty array', () => {
    expect(selectPriceRow([], { sales: true }, NOW)).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(selectPriceRow(null, { sales: true }, NOW)).toBeNull();
    expect(selectPriceRow(undefined, { sales: true }, NOW)).toBeNull();
    expect(selectPriceRow('string', { sales: true }, NOW)).toBeNull();
  });

  it('returns null when no rows match the requested side', () => {
    const rows = [
      { 'priceListVersion$salesPriceList': false, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '5' },
    ];
    expect(selectPriceRow(rows, { sales: true }, NOW)).toBeNull();
  });

  // ---- side isolation ----

  it('returns only sales rows when sales=true', () => {
    const sale = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '10' };
    const purchase = { 'priceListVersion$salesPriceList': false, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '7' };
    expect(selectPriceRow([sale, purchase], { sales: true }, NOW)).toBe(sale);
    expect(selectPriceRow([sale, purchase], { sales: false }, NOW)).toBe(purchase);
  });

  // ---- string flag variants ----

  it('treats string "Y" as truthy salesPriceList', () => {
    const rows = [
      { 'priceListVersion$salesPriceList': 'Y', 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '9' },
    ];
    expect(selectPriceRow(rows, { sales: true }, NOW)).toBe(rows[0]);
  });

  it('treats string "N" as falsy salesPriceList', () => {
    const rows = [
      { 'priceListVersion$salesPriceList': 'N', 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '9' },
    ];
    expect(selectPriceRow(rows, { sales: true }, NOW)).toBeNull();
    expect(selectPriceRow(rows, { sales: false }, NOW)).toBe(rows[0]);
  });

  it.each([
    ['true'],
    ['y'],
    ['yes'],
    ['1'],
    ['TRUE'],
    ['Y'],
    ['YES'],
  ])('treats salesPriceList=%s as truthy', (value) => {
    const row = { 'priceListVersion$salesPriceList': value, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '5' };
    expect(selectPriceRow([row], { sales: true }, NOW)).toBe(row);
  });

  it.each([
    [false],
    ['false'],
    ['n'],
    ['no'],
    ['0'],
    ['N'],
  ])('treats salesPriceList=%s as falsy', (value) => {
    const row = { 'priceListVersion$salesPriceList': value, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '5' };
    expect(selectPriceRow([row], { sales: true }, NOW)).toBeNull();
  });

  // ---- no default on side → first side row ----

  it('returns first side row when no defaults exist', () => {
    const rows = [
      { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2024-01-01', standardPrice: '1' },
      { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '2' },
    ];
    expect(selectPriceRow(rows, { sales: true }, NOW)).toBe(rows[0]);
  });

  // ---- single default with validFromDate <= now ----

  it('returns default row when its validFromDate is in the past', () => {
    const rows = [
      { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2024-06-01', standardPrice: '1' },
      { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '9' },
    ];
    expect(selectPriceRow(rows, { sales: true }, NOW)).toBe(rows[1]);
  });

  // ---- multiple defaults: most recent validFromDate <= now wins ----

  it('returns most recent valid default when multiple defaults exist', () => {
    const old = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2024-01-01', standardPrice: '1' };
    const recent = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2026-01-01', standardPrice: '2' };
    const newest = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2026-05-01', standardPrice: '3' };
    // all three <= NOW (2026-06-01)
    expect(selectPriceRow([old, recent, newest], { sales: true }, NOW)).toBe(newest);
  });

  // ---- default with future validFromDate excluded when older valid default exists ----

  it('excludes future defaults and picks most recent valid one', () => {
    const past = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '5' };
    const future = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2027-01-01', standardPrice: '8' };
    // NOW = 2026-06-01 → future row excluded
    expect(selectPriceRow([past, future], { sales: true }, NOW)).toBe(past);
  });

  // ---- all defaults are future → falls back to most recent overall ----

  it('returns most recent overall default when all defaults are in the future', () => {
    const futureA = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2027-01-01', standardPrice: '10' };
    const futureB = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2028-01-01', standardPrice: '20' };
    // Both > NOW → validNow is empty → pool = all defaults → pick most recent = futureB
    expect(selectPriceRow([futureA, futureB], { sales: true }, NOW)).toBe(futureB);
  });

  // ---- boolean true flag for default ----

  it('treats boolean true as default', () => {
    const row = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2025-06-01', standardPrice: '42' };
    expect(selectPriceRow([row], { sales: true }, NOW)).toBe(row);
  });

  // ---- purchase side isolated from sales defaults ----

  it('sale default does not bleed into purchase selection', () => {
    const saleDefault = { 'priceListVersion$salesPriceList': true, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '10' };
    const purchaseNoDefault = { 'priceListVersion$salesPriceList': false, 'priceListVersion$default': false, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '7' };
    expect(selectPriceRow([saleDefault, purchaseNoDefault], { sales: false }, NOW)).toBe(purchaseNoDefault);
  });

  // ---- only purchase rows, sales requested → null ----

  it('returns null for sales when only purchase rows exist', () => {
    const rows = [
      { 'priceListVersion$salesPriceList': false, 'priceListVersion$default': true, 'priceListVersion$validFromDate': '2025-01-01', standardPrice: '5' },
    ];
    expect(selectPriceRow(rows, { sales: true }, NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useProductPrices — hook
// ---------------------------------------------------------------------------

describe('useProductPrices', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { sale: undefined, purchase: undefined } while loading', () => {
    global.fetch = buildFetch({ response: { data: [] } });
    const { result } = renderHook(() => useProductPrices('prod-1', 'tok', '/api'));
    expect(result.current.sale).toBeUndefined();
    expect(result.current.purchase).toBeUndefined();
  });

  it('returns { sale: null, purchase: null } when productId is falsy', async () => {
    global.fetch = vi.fn();
    const { result } = renderHook(() => useProductPrices(null, 'tok', '/api'));
    await waitFor(() => expect(result.current.sale).toBeNull());
    expect(result.current.purchase).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves sale price from a sales row with default', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': true,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: '12.5',
          },
        ],
      },
    });
    const { result } = renderHook(() => useProductPrices('prod-1', 'tok', '/api'));
    await waitFor(() => expect(result.current.sale).not.toBeUndefined());
    expect(result.current.sale).toBe(12.5);
  });

  it('resolves purchase price from a purchase row', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': false,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: '8',
          },
        ],
      },
    });
    const { result } = renderHook(() => useProductPrices('prod-1', 'tok', '/api'));
    await waitFor(() => expect(result.current.purchase).not.toBeUndefined());
    expect(result.current.purchase).toBe(8);
    expect(result.current.sale).toBeNull();
  });

  it('sets null side when no row exists for that side', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': true,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: '5',
          },
        ],
      },
    });
    const { result } = renderHook(() => useProductPrices('prod-1', 'tok', '/api'));
    await waitFor(() => expect(result.current.sale).not.toBeUndefined());
    expect(result.current.sale).toBe(5);
    expect(result.current.purchase).toBeNull();
  });

  it('resolves both sale and purchase when rows for both sides exist', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': true,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: '10',
          },
          {
            'priceListVersion$salesPriceList': false,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: '6',
          },
        ],
      },
    });
    const { result } = renderHook(() => useProductPrices('prod-1', 'tok', '/api'));
    await waitFor(() => expect(result.current.sale).not.toBeUndefined());
    expect(result.current.sale).toBe(10);
    expect(result.current.purchase).toBe(6);
  });

  it('returns { sale: null, purchase: null } on empty data array', async () => {
    global.fetch = buildFetch({ response: { data: [] } });
    const { result } = renderHook(() => useProductPrices('prod-1', 'tok', '/api'));
    await waitFor(() => expect(result.current.sale).toBeNull());
    expect(result.current.purchase).toBeNull();
  });

  it('returns { sale: null, purchase: null } on fetch rejection', async () => {
    global.fetch = buildRejectFetch();
    const { result } = renderHook(() => useProductPrices('prod-1', 'tok', '/api'));
    await waitFor(() => expect(result.current.sale).toBeNull());
    expect(result.current.purchase).toBeNull();
  });

  it('fetches from the correct /price URL', async () => {
    global.fetch = buildFetch({ response: { data: [] } });
    renderHook(() => useProductPrices('prod-abc', 'mytoken', '/api/base'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/base/price?parentId=prod-abc');
    expect(opts.headers.Authorization).toBe('Bearer mytoken');
  });
});

// ---------------------------------------------------------------------------
// Dedup test: two cells sharing one fetch for the same productId
// ---------------------------------------------------------------------------

describe('dedup: ProductSalePriceCell + ProductPurchasePriceCell share one fetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fetch exactly once when both cells mount for the same row', async () => {
    // Strategy: keep the fetch promise unresolved while both useEffects run so
    // the second effect finds the in-flight Map entry placed by the first.
    //
    // We wrap the render in act() to ensure React flushes both effects before
    // the outer promise (longPromise) settles.

    // A unique productId + apiBaseUrl guarantees no Map bleed from prior tests.
    const DEDUP_ID = 'prod-dedup-unique';
    const DEDUP_BASE = '/api/dedup-base';

    let resolvePrice;
    const longPromise = new Promise((res) => { resolvePrice = res; });

    // Use a vi.fn() assigned directly (same pattern as all other tests in this file)
    // so we avoid vi.spyOn property-not-defined issues in jsdom.
    const fetchMock = vi.fn(() =>
      longPromise.then((data) => ({
        ok: true,
        json: () => Promise.resolve(data),
      })),
    );
    global.fetch = fetchMock;

    // Wrap render in act so React flushes synchronous useEffects before we assert.
    await act(async () => {
      render(
        <>
          <ProductSalePriceCell row={{ id: DEDUP_ID }} token="tok" apiBaseUrl={DEDUP_BASE} />
          <ProductPurchasePriceCell row={{ id: DEDUP_ID }} token="tok" apiBaseUrl={DEDUP_BASE} />
        </>,
      );
    });

    // Both effects have now run. The first dispatched fetch (added Map entry) and
    // the second reused the cached promise (no second fetch call).
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Settle the promise so React state updates resolve and no warnings leak.
    resolvePrice({ response: { data: [] } });

    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// ProductSalePriceCell
// ---------------------------------------------------------------------------

describe('ProductSalePriceCell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dash while loading (undefined state)', () => {
    global.fetch = buildFetch({ response: { data: [] } });
    render(<ProductSalePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash and does not fetch when row has no id', async () => {
    global.fetch = vi.fn();
    render(<ProductSalePriceCell row={{ name: 'No ID' }} {...DEFAULT_PROPS} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders formatted price with euro sign after fetch', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': true,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: 9.99,
          },
        ],
      },
    });
    render(<ProductSalePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('9.99 €')).toBeInTheDocument());
  });

  it('renders dash when no sales row exists', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': false,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: 5,
          },
        ],
      },
    });
    render(<ProductSalePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });

  it('applies font-semibold class (bold) to the price span', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': true,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: 15,
          },
        ],
      },
    });
    const { container } = render(<ProductSalePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('15.00 €')).toBeInTheDocument());
    const span = container.querySelector('span.font-semibold');
    expect(span).toBeInTheDocument();
    expect(span).toHaveTextContent('15.00 €');
  });
});

// ---------------------------------------------------------------------------
// ProductPurchasePriceCell
// ---------------------------------------------------------------------------

describe('ProductPurchasePriceCell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dash while loading (undefined state)', () => {
    global.fetch = buildFetch({ response: { data: [] } });
    render(<ProductPurchasePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash and does not fetch when row has no id', async () => {
    global.fetch = vi.fn();
    render(<ProductPurchasePriceCell row={{ name: 'No ID' }} {...DEFAULT_PROPS} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders formatted purchase price with euro sign', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': false,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: 4.5,
          },
        ],
      },
    });
    render(<ProductPurchasePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('4.50 €')).toBeInTheDocument());
  });

  it('renders dash when no purchase row exists', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': true,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: 8,
          },
        ],
      },
    });
    render(<ProductPurchasePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });

  it('does NOT apply font-semibold class (normal weight)', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          {
            'priceListVersion$salesPriceList': false,
            'priceListVersion$default': true,
            'priceListVersion$validFromDate': '2025-01-01',
            standardPrice: 3,
          },
        ],
      },
    });
    const { container } = render(<ProductPurchasePriceCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('3.00 €')).toBeInTheDocument());
    const boldSpan = container.querySelector('span.font-semibold');
    expect(boldSpan).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BoxIcon
// ---------------------------------------------------------------------------

describe('BoxIcon', () => {
  it('renders an svg element', () => {
    const { container } = render(<BoxIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies default size 24', () => {
    const { container } = render(<BoxIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('applies custom size prop', () => {
    const { container } = render(<BoxIcon size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('applies custom color via stroke', () => {
    const { container } = render(<BoxIcon color="#FF0000" />);
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('stroke', '#FF0000');
  });
});

// ---------------------------------------------------------------------------
// ProductNameCell
// ---------------------------------------------------------------------------

describe('ProductNameCell', () => {
  beforeEach(() => {
    _mockImgSrc = null;
  });

  it('renders the product name', () => {
    render(<ProductNameCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    expect(screen.getByText('Widget')).toBeInTheDocument();
  });

  it('renders the searchKey badge when searchKey is present', () => {
    render(<ProductNameCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    expect(screen.getByText('WGT')).toBeInTheDocument();
  });

  it('does not render a searchKey badge when searchKey is absent', () => {
    render(<ProductNameCell row={{ ...DEFAULT_ROW, searchKey: null }} {...DEFAULT_PROPS} />);
    expect(screen.queryByText('WGT')).not.toBeInTheDocument();
  });

  it('renders an img tag when imgSrc is available', () => {
    _mockImgSrc = 'blob:http://localhost/test-image';
    render(<ProductNameCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'blob:http://localhost/test-image');
    expect(img).toHaveAttribute('alt', 'Widget');
  });

  it('renders BoxIcon fallback (svg) when no imgSrc is available', () => {
    _mockImgSrc = null;
    const { container } = render(<ProductNameCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProductStockCell
// ---------------------------------------------------------------------------

describe('ProductStockCell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders dash while stock is loading', () => {
    global.fetch = buildFetch({ response: { data: [] } });
    render(<ProductStockCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash and does not fetch when row has no id', async () => {
    global.fetch = vi.fn();
    render(<ProductStockCell row={{ name: 'No ID' }} {...DEFAULT_PROPS} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sums quantityOnHand across all stock rows', async () => {
    global.fetch = buildFetch({
      response: {
        data: [
          { quantityOnHand: 10 },
          { quantityOnHand: 5 },
          { quantityOnHand: 3 },
        ],
      },
    });
    render(<ProductStockCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument());
  });

  it('shows 0 when all rows have quantityOnHand=0', async () => {
    global.fetch = buildFetch({
      response: {
        data: [{ quantityOnHand: 0 }, { quantityOnHand: 0 }],
      },
    });
    render(<ProductStockCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('handles non-numeric quantityOnHand gracefully (treats as 0)', async () => {
    global.fetch = buildFetch({
      response: {
        data: [{ quantityOnHand: 'bad' }, { quantityOnHand: 5 }],
      },
    });
    render(<ProductStockCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
  });

  it('shows 0 when data array is empty', async () => {
    global.fetch = buildFetch({ response: { data: [] } });
    render(<ProductStockCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('0')).toBeInTheDocument());
  });

  it('renders dash on non-ok response', async () => {
    global.fetch = buildFetch(null, false);
    render(<ProductStockCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });

  it('renders dash on fetch rejection', async () => {
    global.fetch = buildRejectFetch();
    render(<ProductStockCell row={DEFAULT_ROW} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });

  it('fetches from the correct stock URL', async () => {
    global.fetch = buildFetch({ response: { data: [] } });
    render(<ProductStockCell row={{ id: 'prod-99' }} {...DEFAULT_PROPS} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/stock?parentId=prod-99');
  });
});

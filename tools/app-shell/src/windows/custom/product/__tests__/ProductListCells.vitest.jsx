// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import {
  BoxIcon,
  ProductSalePriceCell,
  ProductPurchasePriceCell,
  ProductStockCell,
} from '../ProductListCells.jsx';

// ---------------------------------------------------------------------------
// After the EPL-1807 refactor, eStock / eSalePrice / ePurchasePrice are STORED
// COMPUTED columns materialized on M_Product and returned WITH the list row.
// The cells read the materialized field straight from `row` — NO secondary
// fetch, NO client-side price selection. These tests pin that behavior.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ProductSalePriceCell — reads row.eTGOSalePrice, bold
// ---------------------------------------------------------------------------

describe('ProductSalePriceCell', () => {
  it('renders eTGOSalePrice formatted with two decimals and euro sign', () => {
    render(<ProductSalePriceCell row={{ eTGOSalePrice: 9.99 }} />);
    expect(screen.getByText('9,99 €')).toBeInTheDocument();
  });

  it('formats an integer value to two decimals', () => {
    render(<ProductSalePriceCell row={{ eTGOSalePrice: 15 }} />);
    expect(screen.getByText('15,00 €')).toBeInTheDocument();
  });

  it('coerces a numeric string to a number and formats it', () => {
    render(<ProductSalePriceCell row={{ eTGOSalePrice: '12.5' }} />);
    expect(screen.getByText('12,50 €')).toBeInTheDocument();
  });

  it('ETP-4314 regression: uses the Spanish decimal separator, not a period', () => {
    // Was `value.toFixed(2)` (always period-decimal, e.g. "46.00 €") before this
    // cell was routed through the canonical formatCurrency() — QA reported this
    // exact symptom on the Product List.
    render(<ProductSalePriceCell row={{ eTGOSalePrice: 46 }} />);
    expect(screen.getByText('46,00 €')).toBeInTheDocument();
    expect(screen.queryByText('46.00 €')).not.toBeInTheDocument();
  });

  it('ETP-4314 regression: groups thousands for a price >= 1000', () => {
    render(<ProductSalePriceCell row={{ eTGOSalePrice: 1234.5 }} />);
    expect(screen.getByText('1.234,50 €')).toBeInTheDocument();
  });

  it('applies font-semibold (bold) to the price span', () => {
    const { container } = render(<ProductSalePriceCell row={{ eTGOSalePrice: 15 }} />);
    const span = container.querySelector('span.font-semibold');
    expect(span).toBeInTheDocument();
    expect(span).toHaveTextContent('15,00 €');
  });

  it('renders dash when eTGOSalePrice is null', () => {
    render(<ProductSalePriceCell row={{ eTGOSalePrice: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOSalePrice is undefined (field absent)', () => {
    render(<ProductSalePriceCell row={{}} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOSalePrice is a blank string', () => {
    render(<ProductSalePriceCell row={{ eTGOSalePrice: '' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOSalePrice is non-numeric (coerces to null)', () => {
    render(<ProductSalePriceCell row={{ eTGOSalePrice: 'abc' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when row is null', () => {
    render(<ProductSalePriceCell row={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProductPurchasePriceCell — reads row.eTGOPurchasePrice, NOT bold
// ---------------------------------------------------------------------------

describe('ProductPurchasePriceCell', () => {
  it('renders eTGOPurchasePrice formatted with two decimals and euro sign', () => {
    render(<ProductPurchasePriceCell row={{ eTGOPurchasePrice: 4.5 }} />);
    expect(screen.getByText('4,50 €')).toBeInTheDocument();
  });

  it('coerces a numeric string to a number and formats it', () => {
    render(<ProductPurchasePriceCell row={{ eTGOPurchasePrice: '8' }} />);
    expect(screen.getByText('8,00 €')).toBeInTheDocument();
  });

  it('does NOT apply font-semibold (normal weight)', () => {
    const { container } = render(<ProductPurchasePriceCell row={{ eTGOPurchasePrice: 3 }} />);
    expect(screen.getByText('3,00 €')).toBeInTheDocument();
    expect(container.querySelector('span.font-semibold')).not.toBeInTheDocument();
  });

  it('renders dash when eTGOPurchasePrice is null', () => {
    render(<ProductPurchasePriceCell row={{ eTGOPurchasePrice: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOPurchasePrice is undefined (field absent)', () => {
    render(<ProductPurchasePriceCell row={{}} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOPurchasePrice is a blank string', () => {
    render(<ProductPurchasePriceCell row={{ eTGOPurchasePrice: '' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOPurchasePrice is non-numeric (coerces to null)', () => {
    render(<ProductPurchasePriceCell row={{ eTGOPurchasePrice: 'NaN-ish' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProductStockCell — reads row.eTGOStock
// ---------------------------------------------------------------------------

describe('ProductStockCell', () => {
  it('renders the numeric stock value', () => {
    render(<ProductStockCell row={{ eTGOStock: 18 }} />);
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('renders 0 stock', () => {
    render(<ProductStockCell row={{ eTGOStock: 0 }} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('coerces a numeric string to a number', () => {
    render(<ProductStockCell row={{ eTGOStock: '42' }} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders dash when eTGOStock is null', () => {
    render(<ProductStockCell row={{ eTGOStock: null }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOStock is undefined (field absent)', () => {
    render(<ProductStockCell row={{}} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOStock is a blank string', () => {
    render(<ProductStockCell row={{ eTGOStock: '' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when eTGOStock is non-numeric (coerces to null)', () => {
    render(<ProductStockCell row={{ eTGOStock: 'bad' }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash when row is null', () => {
    render(<ProductStockCell row={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Regression: data comes WITH the list row — cells must never fetch.
// This pins the EPL-1807 fix: no per-row secondary /stock or /price request.
// ---------------------------------------------------------------------------

describe('no network access (stored computed columns)', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error('Unexpected fetch: cells must read materialized fields from the row');
    });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call fetch when rendering the price and stock cells with data', () => {
    render(
      <>
        <ProductSalePriceCell row={{ eTGOSalePrice: 10, eTGOPurchasePrice: 6, eTGOStock: 3 }} />
        <ProductPurchasePriceCell row={{ eTGOSalePrice: 10, eTGOPurchasePrice: 6, eTGOStock: 3 }} />
        <ProductStockCell row={{ eTGOSalePrice: 10, eTGOPurchasePrice: 6, eTGOStock: 3 }} />
      </>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not call fetch even when the materialized fields are missing', () => {
    render(
      <>
        <ProductSalePriceCell row={{}} />
        <ProductPurchasePriceCell row={{}} />
        <ProductStockCell row={{}} />
      </>,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BoxIcon re-export
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

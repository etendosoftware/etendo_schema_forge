vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => params ? `${key}(${JSON.stringify(params)})` : key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('../useWarehouseStock', () => ({
  useWarehouseStock: vi.fn(),
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: vi.fn(() => 'USD'),
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: vi.fn((code, value) => `${code}:${value}`),
}));

import { render, screen } from '@testing-library/react';
import WarehouseSummary from '../WarehouseSummary.jsx';
import { useWarehouseStock } from '../useWarehouseStock';
import { formatCurrency } from '@/lib/formatCurrency';

describe('WarehouseSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows loading message while stock is loading', () => {
    useWarehouseStock.mockReturnValue({ loading: true, error: null, products: [], transactions: [] });
    render(<WarehouseSummary data={{ id: 'wh-1' }} token="t" apiBaseUrl="/api" />);
    expect(screen.getByText('warehouseLoadingStock')).toBeInTheDocument();
  });

  it('shows error message on fetch failure', () => {
    useWarehouseStock.mockReturnValue({ loading: false, error: 'Network error', products: [], transactions: [] });
    render(<WarehouseSummary data={{ id: 'wh-1' }} token="t" apiBaseUrl="/api" />);
    expect(screen.getByText('warehouseStockError')).toBeInTheDocument();
  });

  it('renders the "Datos de stock" section with valuation and products-with-stock stats', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      products: [
        { qty: 5, valuation: 500 },
        { qty: 3, valuation: 417 },
      ],
      transactions: [],
    });
    render(<WarehouseSummary data={{ id: 'wh-1' }} token="t" apiBaseUrl="/api" />);

    // Section title
    expect(screen.getByText('warehouseStockDataTitle')).toBeInTheDocument();

    // Valuation stat labels and badge
    expect(screen.getByText('warehouseTotalValuation')).toBeInTheDocument();
    expect(screen.getByText('warehouseValuationBadge')).toBeInTheDocument();

    // formatCurrency was called with the summed valuation (500 + 417 = 917)
    expect(formatCurrency).toHaveBeenCalledWith('USD', 917);

    // Products-with-stock stat labels, count, and badge
    expect(screen.getByText('warehouseProductsWithStock')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('warehouseProductsWithStockBadge')).toBeInTheDocument();
  });

  it('renders without crashing when data prop is undefined', () => {
    useWarehouseStock.mockReturnValue({ loading: true, error: null, products: [], transactions: [] });
    expect(() => render(<WarehouseSummary token="t" apiBaseUrl="/api" />)).not.toThrow();
  });
});

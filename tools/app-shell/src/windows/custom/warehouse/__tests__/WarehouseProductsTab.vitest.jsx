// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: vi.fn(() => 'USD'),
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: vi.fn((currency, value) => `${currency}:${value}`),
}));

vi.mock('../useWarehouseStock', () => ({
  useWarehouseStock: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Loader2: (props) => <span data-testid="Loader2__215b73" {...props} />,
}));

// --- Imports ---

import { render, screen } from '@testing-library/react';
import WarehouseProductsTab from '../WarehouseProductsTab.jsx';
import { useWarehouseStock } from '../useWarehouseStock';
import { formatCurrency } from '@/lib/formatCurrency';

// --- Fixtures ---

const defaultProps = {
  parentId: 'wh-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/warehouse',
  onCount: vi.fn(),
};

const sampleProducts = [
  { id: 'p1', label: 'Widget A', uom: 'Each', valuation: 1500, qty: 10 },
  { id: 'p2', label: 'Gadget B', uom: 'Box', valuation: 0, qty: 5 },
];

// --- Tests ---

describe('WarehouseProductsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading spinner and label while loading', () => {
      useWarehouseStock.mockReturnValue({ loading: true, error: null, products: [] });
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByTestId('Loader2__215b73')).toBeInTheDocument();
      expect(screen.getByText('warehouseLoadingStock')).toBeInTheDocument();
    });

    it('does not render a table while loading', () => {
      useWarehouseStock.mockReturnValue({ loading: true, error: null, products: [] });
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when error is set', () => {
      useWarehouseStock.mockReturnValue({ loading: false, error: 'Network error', products: [] });
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('warehouseStockError')).toBeInTheDocument();
    });

    it('does not render a table on error', () => {
      useWarehouseStock.mockReturnValue({ loading: false, error: 'fail', products: [] });
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty message when products is empty', () => {
      useWarehouseStock.mockReturnValue({ loading: false, error: null, products: [] });
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('warehouseNoStock')).toBeInTheDocument();
    });

    it('calls onCount with 0 when products is empty', () => {
      useWarehouseStock.mockReturnValue({ loading: false, error: null, products: [] });
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(defaultProps.onCount).toHaveBeenCalledWith(0);
    });
  });

  describe('populated state — column headers', () => {
    beforeEach(() => {
      useWarehouseStock.mockReturnValue({ loading: false, error: null, products: sampleProducts });
    });

    it('renders the product column header', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('warehouseProduct')).toBeInTheDocument();
    });

    it('renders the UOM column header', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('warehouseUom')).toBeInTheDocument();
    });

    it('renders the valuation column header', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('warehouseValuation')).toBeInTheDocument();
    });

    it('renders the stock column header', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('warehouseStock')).toBeInTheDocument();
    });
  });

  describe('populated state — row data', () => {
    beforeEach(() => {
      useWarehouseStock.mockReturnValue({ loading: false, error: null, products: sampleProducts });
    });

    it('renders product labels', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('Widget A')).toBeInTheDocument();
      expect(screen.getByText('Gadget B')).toBeInTheDocument();
    });

    it('renders UOM values', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('Each')).toBeInTheDocument();
      expect(screen.getByText('Box')).toBeInTheDocument();
    });

    it('calls formatCurrency for products with valuation > 0', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(formatCurrency).toHaveBeenCalledWith('USD', 1500);
    });

    it('shows — for products with zero valuation', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      // p2 has valuation 0, so formatCurrency is NOT called for it and '—' is displayed
      expect(formatCurrency).not.toHaveBeenCalledWith('USD', 0);
    });

    it('renders formatted valuation output from formatCurrency', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('USD:1500')).toBeInTheDocument();
    });

    it('renders qty values', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('calls onCount with the number of products', () => {
      render(<WarehouseProductsTab {...defaultProps} />);
      expect(defaultProps.onCount).toHaveBeenCalledWith(2);
    });
  });

  describe('UOM fallback', () => {
    it('renders — when uom is empty string', () => {
      useWarehouseStock.mockReturnValue({
        loading: false,
        error: null,
        products: [{ id: 'p1', label: 'Widget', uom: '', valuation: 10, qty: 1 }],
      });
      render(<WarehouseProductsTab {...defaultProps} />);
      // The cell renders '—' for falsy uom
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('onCount not provided', () => {
    it('renders without crashing when onCount is undefined', () => {
      useWarehouseStock.mockReturnValue({ loading: false, error: null, products: sampleProducts });
      render(<WarehouseProductsTab parentId="wh-1" token="t" apiBaseUrl="/api" />);
      expect(screen.getByText('Widget A')).toBeInTheDocument();
    });
  });
});

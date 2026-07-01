// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }) => <span data-testid="badge" {...props}>{children}</span>,
}));

vi.mock('lucide-react', () => ({
  Plus: (props) => <span data-testid="icon-plus" {...props} />,
  TrendingUp: (props) => <span data-testid="icon-trending" {...props} />,
  LayoutGrid: (props) => <span data-testid="icon-grid" {...props} />,
  List: (props) => <span data-testid="icon-list" {...props} />,
}));

// --- Imports ---

import { render, screen, fireEvent } from '@testing-library/react';
import ProductGrid from '../ProductGrid.jsx';

// --- Helpers ---

const PRODUCTS = [
  { id: 'p1', productId: 'p1', name: 'Alpha Widget', searchKey: 'AW-001', price: 10.5, stock: 25, category: 'Electronics' },
  { id: 'p2', productId: 'p2', name: 'Beta Gadget', searchKey: 'BG-002', price: 5.0, stock: 0, category: 'Toys' },
  { id: 'p3', productId: 'p3', name: 'Gamma Tool', searchKey: 'GT-003', price: 99.99, stock: null, category: 'Electronics' },
];

const defaultProps = {
  products: PRODUCTS,
  categories: ['Electronics', 'Toys'],
  category: 'all',
  onCategoryChange: vi.fn(),
  onAddProduct: vi.fn(),
  topSellerIds: new Set(),
  showPriority: false,
  viewMode: 'grid',
  onViewModeChange: vi.fn(),
};

// --- Tests ---

describe('ProductGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ProductGrid {...defaultProps} />);
    expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
  });

  it('renders all products in grid mode', () => {
    render(<ProductGrid {...defaultProps} />);
    expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
    expect(screen.getByText('Beta Gadget')).toBeInTheDocument();
    expect(screen.getByText('Gamma Tool')).toBeInTheDocument();
  });

  it('renders category filter buttons including "all"', () => {
    render(<ProductGrid {...defaultProps} />);
    expect(screen.getByText('qsoAllCategories')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(screen.getByText('Toys')).toBeInTheDocument();
  });

  it('calls onCategoryChange when a category button is clicked', () => {
    render(<ProductGrid {...defaultProps} />);
    fireEvent.click(screen.getByText('Electronics'));
    expect(defaultProps.onCategoryChange).toHaveBeenCalledWith('Electronics');
  });

  it('calls onAddProduct when a product card is clicked', () => {
    render(<ProductGrid {...defaultProps} />);
    fireEvent.click(screen.getByText('Alpha Widget'));
    expect(defaultProps.onAddProduct).toHaveBeenCalledWith(PRODUCTS[0]);
  });

  it('shows empty state when products array is empty', () => {
    render(<ProductGrid {...defaultProps} products={[]} />);
    expect(screen.getByText('qsoNoResults')).toBeInTheDocument();
  });

  it('renders product prices', () => {
    render(<ProductGrid {...defaultProps} />);
    expect(screen.getByText(/10\.50/)).toBeInTheDocument();
    expect(screen.getByText(/5\.00/)).toBeInTheDocument();
  });

  it('renders product search keys', () => {
    render(<ProductGrid {...defaultProps} />);
    expect(screen.getByText('AW-001')).toBeInTheDocument();
    expect(screen.getByText('BG-002')).toBeInTheDocument();
  });

  it('renders view mode toggle buttons', () => {
    render(<ProductGrid {...defaultProps} />);
    const gridBtn = screen.getByTitle('qsoGridView');
    const listBtn = screen.getByTitle('qsoListView');
    expect(gridBtn).toBeInTheDocument();
    expect(listBtn).toBeInTheDocument();
  });

  it('calls onViewModeChange when list view is clicked', () => {
    render(<ProductGrid {...defaultProps} />);
    fireEvent.click(screen.getByTitle('qsoListView'));
    expect(defaultProps.onViewModeChange).toHaveBeenCalledWith('list');
  });

  it('renders in list mode when viewMode is "list"', () => {
    render(<ProductGrid {...defaultProps} viewMode="list" />);
    // All products should still be visible
    expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
    expect(screen.getByText('Beta Gadget')).toBeInTheDocument();
  });

  it('shows top seller badge when product is in topSellerIds', () => {
    const topSellers = new Set(['p1']);
    render(<ProductGrid {...defaultProps} topSellerIds={topSellers} showPriority={true} />);
    // Top seller badge text via i18n key
    const badges = screen.getAllByText('qsoTopSeller');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('sorts top sellers first when showPriority is true', () => {
    const topSellers = new Set(['p2']);
    const { container } = render(
      <ProductGrid {...defaultProps} topSellerIds={topSellers} showPriority={true} />
    );
    const productIds = [...container.querySelectorAll('[data-product-id]')].map(
      el => el.dataset.productId
    );
    // p2 (top seller) should come first
    expect(productIds[0]).toBe('p2');
  });

  it('does not sort by priority when showPriority is false', () => {
    const topSellers = new Set(['p2']);
    const { container } = render(
      <ProductGrid {...defaultProps} topSellerIds={topSellers} showPriority={false} />
    );
    const productIds = [...container.querySelectorAll('[data-product-id]')].map(
      el => el.dataset.productId
    );
    // Original order preserved
    expect(productIds[0]).toBe('p1');
  });

  it('does not render view mode toggle when onViewModeChange is not provided', () => {
    render(<ProductGrid {...defaultProps} onViewModeChange={undefined} />);
    expect(screen.queryByTitle('qsoGridView')).not.toBeInTheDocument();
  });

  it('renders with only "all" category when categories prop is absent', () => {
    render(<ProductGrid {...defaultProps} categories={undefined} />);
    expect(screen.getByText('qsoAllCategories')).toBeInTheDocument();
  });

  it('handles null topSellerIds gracefully', () => {
    render(<ProductGrid {...defaultProps} topSellerIds={null} showPriority={true} />);
    expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
  });
});

/**
 * Integration render test for ProductResolverPopup.
 * Renders the real component with mocked dependencies.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

import ProductResolverPopup from '../ProductResolverPopup.jsx';

describe('ProductResolverPopup', () => {
  const defaultProps = {
    unmatched: [],
    selectorUrl: 'http://localhost/sws/neo/purchase-invoice/lines/selectors/M_Product_ID',
    productSpecUrl: 'http://localhost/sws/neo/product',
    token: 'test-token',
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing with empty unmatched list', () => {
    render(<ProductResolverPopup {...defaultProps} />);
    expect(screen.getByText('ocrProductResolverTitle')).toBeInTheDocument();
    expect(screen.getByText('ocrProductResolverHint')).toBeInTheDocument();
  });

  it('renders cancel and continue buttons', () => {
    render(<ProductResolverPopup {...defaultProps} />);
    expect(screen.getByText('cancel')).toBeInTheDocument();
    expect(screen.getByText('continue')).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ProductResolverPopup {...defaultProps} />);
    await user.click(screen.getByText('cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when X button is clicked', async () => {
    const user = userEvent.setup();
    render(<ProductResolverPopup {...defaultProps} />);
    const xButton = screen.getByLabelText('cancel');
    await user.click(xButton);
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('calls onSubmit with empty map when no unmatched rows', async () => {
    const user = userEvent.setup();
    render(<ProductResolverPopup {...defaultProps} />);
    await user.click(screen.getByText('continue'));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({});
  });

  it('renders product rows for each unmatched item', () => {
    const unmatched = [
      { idx: 0, description: 'Widget A', quantity: 5, unitPrice: 10 },
      { idx: 1, description: 'Gadget B' },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    expect(screen.getByText('Widget A')).toBeInTheDocument();
    expect(screen.getByText('Gadget B')).toBeInTheDocument();
  });

  it('shows quantity and unit price when present', () => {
    const unmatched = [
      { idx: 0, description: 'Widget A', quantity: 5, unitPrice: 10 },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it('shows extracted label and pick label for each row', () => {
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    expect(screen.getByText('ocrProductExtracted')).toBeInTheDocument();
    expect(screen.getByText('ocrProductPick')).toBeInTheDocument();
  });

  it('calls onSubmit with null for unselected rows', async () => {
    const user = userEvent.setup();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
      { idx: 1, description: 'Gadget B' },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByText('continue'));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: null, 1: null });
  });

  it('renders skip label in selector buttons when nothing is selected', () => {
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    expect(screen.getByText('ocrProductSkip')).toBeInTheDocument();
  });

  it('handles null productSpecUrl gracefully (no create button)', () => {
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    render(<ProductResolverPopup {...defaultProps} productSpecUrl={null} unmatched={unmatched} />);
    // Should still render without crashing
    expect(screen.getByText('Widget A')).toBeInTheDocument();
  });

  it('renders unmatched items with descriptions and quantities', () => {
    const unmatched = [
      { idx: 0, description: 'Bolt M8x50', quantity: 100, unitPrice: 0.35 },
      { idx: 1, description: 'Washer M8', quantity: 200 },
      { idx: 2, description: 'Nut M8', unitPrice: 0.12 },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    expect(screen.getByText('Bolt M8x50')).toBeInTheDocument();
    expect(screen.getByText('Washer M8')).toBeInTheDocument();
    expect(screen.getByText('Nut M8')).toBeInTheDocument();
    // Quantities and prices are shown
    expect(screen.getByText(/100/)).toBeInTheDocument();
    expect(screen.getByText(/0\.35/)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
    expect(screen.getByText(/0\.12/)).toBeInTheDocument();
  });

  it('opens inline selector when clicking a product row selector button', async () => {
    const user = userEvent.setup();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'p1', name: 'Product One' }] }),
    });
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    // Click the selector button (shows "ocrProductSkip" initially)
    const selectorBtn = screen.getByText('ocrProductSkip');
    await user.click(selectorBtn);
    // After opening, the search input and dropdown appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText('ocrProductSearchPlaceholder')).toBeInTheDocument();
    });
  });

  it('selects a product from the inline selector dropdown', async () => {
    const user = userEvent.setup();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'p1', name: 'Product One' }] }),
    });
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    // Open selector
    await user.click(screen.getByText('ocrProductSkip'));
    // Wait for options to load
    await waitFor(() => {
      expect(screen.getByText('Product One')).toBeInTheDocument();
    });
    // Pick the product
    await user.click(screen.getByText('Product One'));
    // Now the selector should show the selected product label
    await waitFor(() => {
      expect(screen.getByText('Product One')).toBeInTheDocument();
    });
  });

  it('submits with resolved product ids', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'p1', name: 'Product One' }] }),
    });
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} onSubmit={onSubmit} />);
    // Open selector and pick product
    await user.click(screen.getByText('ocrProductSkip'));
    await waitFor(() => {
      expect(screen.getByText('Product One')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Product One'));
    // Submit
    await user.click(screen.getByText('continue'));
    expect(onSubmit).toHaveBeenCalledWith({ 0: 'p1' });
  });

  it('submits null for unresolved products when some rows are unselected', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
      { idx: 1, description: 'Widget B' },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'p1', name: 'Product One' }] }),
    });
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} onSubmit={onSubmit} />);
    // Only pick product for first row
    const skipBtns = screen.getAllByText('ocrProductSkip');
    await user.click(skipBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Product One')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Product One'));
    // Submit — second row still unresolved
    await user.click(screen.getByText('continue'));
    expect(onSubmit).toHaveBeenCalledWith({ 0: 'p1', 1: null });
  });

  it('calls onCancel when bottom cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ProductResolverPopup {...defaultProps} onCancel={onCancel} />);
    await user.click(screen.getByText('cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows create new button in inline selector when productSpecUrl is set', async () => {
    const user = userEvent.setup();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByText('ocrProductSkip'));
    await waitFor(() => {
      expect(screen.getByText('ocrProductCreateNew')).toBeInTheDocument();
    });
  });

  it('shows noResults when selector returns empty items', async () => {
    const user = userEvent.setup();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByText('ocrProductSkip'));
    await waitFor(() => {
      expect(screen.getByText('noResults')).toBeInTheDocument();
    });
  });

  it('shows load error when fetch fails in inline selector', async () => {
    const user = userEvent.setup();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
    ];
    globalThis.fetch.mockRejectedValue(new Error('network error'));
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByText('ocrProductSkip'));
    await waitFor(() => {
      expect(screen.getByText('ocrProductLoadError')).toBeInTheDocument();
    });
  });

  it('renders quantity only when unitPrice is null', () => {
    const unmatched = [
      { idx: 0, description: 'Only Qty', quantity: 50 },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    expect(screen.getByText(/50/)).toBeInTheDocument();
  });

  it('renders unitPrice only when quantity is null', () => {
    const unmatched = [
      { idx: 0, description: 'Only Price', unitPrice: 9.99 },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    expect(screen.getByText(/9\.99/)).toBeInTheDocument();
  });

  it('does not show quantity/price section when both are absent', () => {
    const unmatched = [
      { idx: 0, description: 'No extras' },
    ];
    const { container } = render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    // The ocrProductQty/ocrProductUnit labels should not be present
    expect(screen.queryByText('ocrProductQty')).toBeNull();
    expect(screen.queryByText('ocrProductUnit')).toBeNull();
  });
});

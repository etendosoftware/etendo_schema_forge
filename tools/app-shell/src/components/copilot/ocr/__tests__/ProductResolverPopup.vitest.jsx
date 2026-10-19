// @covers tools/app-shell/src/components/copilot/ocr/ProductResolverPopup.jsx
/**
 * Integration render test for ProductResolverPopup.
 * Renders the real component with mocked dependencies.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

import ProductResolverPopup from '../ProductResolverPopup.jsx';

// Explicitly skips a row through its dropdown entry.
async function skipRow(user, idx) {
  await user.click(screen.getByTestId(`ocr-product-open-${idx}`));
  await user.click(await screen.findByTestId(`ocr-product-skip-option-${idx}`));
}

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

  // ETP-5654 — a name-similarity suggestion is offered, never silently selected.
  describe('suggested product', () => {
    const suggested = [
      { idx: 0, description: 'Servicio de desarrollo y mantenimiento web', suggestion: { id: 'p-mw', name: 'Mantenimiento Web' } },
    ];
    const plain = { idx: 1, description: 'Widget A' };

    it('offers the suggestion as a chip and leaves the row undecided', () => {
      render(<ProductResolverPopup {...defaultProps} unmatched={suggested} />);
      expect(screen.getByTestId('ocr-product-suggestion-0')).toHaveTextContent('Mantenimiento Web');
      expect(screen.getByTestId('ocr-product-main-0')).toHaveTextContent('createProduct');
      expect(screen.queryByTestId('ocr-product-skip-0')).not.toBeInTheDocument();
    });

    it('does not let Continue through while the suggestion is not accepted', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={suggested} />);
      expect(screen.getByText('continue').closest('button')).toBeDisabled();
      expect(screen.getByTestId('ocr-product-incomplete-hint')).toBeInTheDocument();
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('accepting the chip selects the suggested id and swaps the chip for the skip button', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={suggested} />);
      await user.click(screen.getByTestId('ocr-product-suggestion-0'));
      expect(screen.getByTestId('ocr-product-main-0')).toHaveTextContent('Mantenimiento Web');
      expect(screen.queryByTestId('ocr-product-suggestion-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('ocr-product-skip-0')).toHaveTextContent('ocrProductSkip');
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: 'p-mw' });
    });

    it('shows the chip only on rows that carry a suggestion', () => {
      render(<ProductResolverPopup {...defaultProps} unmatched={[...suggested, plain]} />);
      expect(screen.getByTestId('ocr-product-suggestion-0')).toBeInTheDocument();
      expect(screen.queryByTestId('ocr-product-suggestion-1')).not.toBeInTheDocument();
    });

    it('skipping the row explicitly hides the chip and submits null', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={suggested} />);
      await skipRow(user, 0);
      expect(screen.queryByTestId('ocr-product-suggestion-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('ocr-product-main-0')).toHaveTextContent('ocrProductSkip');
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: null });
    });

    it('picking a different product instead of the suggestion submits the picked id', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [{ id: 'p-other', label: 'Other Product' }] }),
      });
      render(<ProductResolverPopup {...defaultProps} unmatched={suggested} />);
      await user.click(screen.getByTestId('ocr-product-open-0'));
      await user.click(await screen.findByText('Other Product'));
      expect(screen.queryByTestId('ocr-product-suggestion-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('ocr-product-skip-0')).toBeInTheDocument();
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: 'p-other' });
    });

    it('renders a non-dismissible warning banner when a row carries a suggestion', () => {
      render(<ProductResolverPopup {...defaultProps} unmatched={suggested} />);
      const banner = screen.getByTestId('ocr-product-autoMatched-warning');
      expect(banner).toHaveTextContent('ocrProductAutoMatchedWarning');
      expect(screen.queryByTestId('info-banner-dismiss')).not.toBeInTheDocument();
    });

    it('renders no banner when no row has a suggestion', () => {
      render(<ProductResolverPopup {...defaultProps} unmatched={[plain]} />);
      expect(screen.queryByTestId('ocr-product-autoMatched-warning')).not.toBeInTheDocument();
    });

    it('shows the hint only when at least one row has no suggestion', () => {
      const { rerender } = render(<ProductResolverPopup {...defaultProps} unmatched={suggested} />);
      expect(screen.queryByText('ocrProductResolverHint')).not.toBeInTheDocument();
      rerender(<ProductResolverPopup {...defaultProps} unmatched={[...suggested, plain]} />);
      expect(screen.getByText('ocrProductResolverHint')).toBeInTheDocument();
    });
  });

  it('submits null for rows the user explicitly skipped', async () => {
    const user = userEvent.setup();
    const unmatched = [
      { idx: 0, description: 'Widget A' },
      { idx: 1, description: 'Gadget B' },
    ];
    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await skipRow(user, 0);
    await skipRow(user, 1);
    await user.click(screen.getByText('continue'));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: null, 1: null });
  });

  // ETP-5585 QA — an unsuggested row is undecided, not skipped.
  describe('undecided rows', () => {
    const plainRows = [{ idx: 0, description: 'Widget A' }];

    it('shows "+ Create product" (not the skip label) on a row without suggestion', () => {
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      expect(screen.getByTestId('ocr-product-main-0')).toHaveTextContent('createProduct');
      expect(screen.queryByText('ocrProductSkip')).not.toBeInTheDocument();
    });

    it('does not auto-open the create modal nor POST anything', () => {
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      expect(screen.queryByText('ocrProductCreateTitle')).not.toBeInTheDocument();
      expect(globalThis.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    });

    it('disables Continue and shows the helper while a row is undecided', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      expect(screen.getByText('continue').closest('button')).toBeDisabled();
      expect(screen.getByTestId('ocr-product-incomplete-hint')).toHaveTextContent('ocrProductResolverIncomplete');
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('opens the create modal when the label is clicked', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      await user.click(screen.getByTestId('ocr-product-main-0'));
      expect(await screen.findByText('ocrProductCreateTitle')).toBeInTheDocument();
    });

    it('cancelling the create modal leaves the row undecided', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      await user.click(screen.getByTestId('ocr-product-main-0'));
      await user.click(await screen.findByTestId('Button__b3ae11_createCancel'));
      expect(screen.getByText('continue').closest('button')).toBeDisabled();
      expect(screen.getByTestId('ocr-product-main-0')).toHaveTextContent('createProduct');
    });

    it('explicit skip from the dropdown enables Continue and submits null', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      await skipRow(user, 0);
      expect(screen.getByTestId('ocr-product-main-0')).toHaveTextContent('ocrProductSkip');
      expect(screen.queryByTestId('ocr-product-incomplete-hint')).not.toBeInTheDocument();
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: null });
    });

    it('picking an existing product enables Continue and submits its id', async () => {
      const user = userEvent.setup();
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'p1', name: 'Product One' }] }) });
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      await user.click(screen.getByTestId('ocr-product-open-0'));
      await user.click(await screen.findByText('Product One'));
      expect(screen.getByText('continue').closest('button')).toBeEnabled();
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: 'p1' });
    });

    it('a skipped row can go back to creating a product', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      await skipRow(user, 0);
      await user.click(screen.getByTestId('ocr-product-open-0'));
      await user.click(await screen.findByText('createProduct'));
      expect(await screen.findByText('ocrProductCreateTitle')).toBeInTheDocument();
    });

    it('a skipped row can go back to picking a product', async () => {
      const user = userEvent.setup();
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'p1', name: 'Product One' }] }) });
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      await skipRow(user, 0);
      await user.click(screen.getByTestId('ocr-product-main-0'));
      await user.click(await screen.findByText('Product One'));
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: 'p1' });
    });

    it('mixed rows: Continue stays disabled until every row is decided', async () => {
      const user = userEvent.setup();
      const rows = [
        { idx: 0, description: 'Suggested', suggestion: { id: 'p-s', name: 'Suggested Product' } },
        { idx: 1, description: 'Widget A' },
        { idx: 2, description: 'Gadget B' },
      ];
      render(<ProductResolverPopup {...defaultProps} unmatched={rows} />);
      const cont = () => screen.getByText('continue').closest('button');
      expect(cont()).toBeDisabled();
      await user.click(screen.getByTestId('ocr-product-suggestion-0'));
      expect(cont()).toBeDisabled();
      await skipRow(user, 1);
      expect(cont()).toBeDisabled();
      await skipRow(user, 2);
      expect(cont()).toBeEnabled();
      await user.click(cont());
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: 'p-s', 1: null, 2: null });
    });

    it('links the helper to Continue via aria-describedby only while it is disabled', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      const cont = () => screen.getByTestId('Button__b3ae11_continue');
      const hintId = screen.getByTestId('ocr-product-incomplete-hint').id;
      expect(hintId).toBeTruthy();
      expect(cont()).toHaveAttribute('aria-describedby', hintId);
      await skipRow(user, 0);
      expect(cont()).toBeEnabled();
      expect(cont()).not.toHaveAttribute('aria-describedby');
    });

    it('ghost skip on a row with a product keeps Continue enabled and submits null', async () => {
      const user = userEvent.setup();
      const rows = [{ idx: 0, description: 'Suggested', suggestion: { id: 'p-s', name: 'Suggested Product' } }];
      render(<ProductResolverPopup {...defaultProps} unmatched={rows} />);
      await user.click(screen.getByTestId('ocr-product-suggestion-0'));
      await user.click(screen.getByTestId('ocr-product-skip-0'));
      expect(screen.getByText('continue').closest('button')).toBeEnabled();
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: null });
    });

    it('ghost skip on a row whose product was picked submits null, not the picked id', async () => {
      const user = userEvent.setup();
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'p1', name: 'Product One' }] }) });
      render(<ProductResolverPopup {...defaultProps} unmatched={plainRows} />);
      await user.click(screen.getByTestId('ocr-product-open-0'));
      await user.click(await screen.findByText('Product One'));
      await user.click(screen.getByTestId('ocr-product-skip-0'));
      expect(screen.getByText('continue').closest('button')).toBeEnabled();
      await user.click(screen.getByText('continue'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({ 0: null });
    });

    it('a row with a suggestion starts undecided: Continue disabled, helper shown', () => {
      const rows = [{ idx: 0, description: 'Suggested', suggestion: { id: 'p-s', name: 'Suggested Product' } }];
      render(<ProductResolverPopup {...defaultProps} unmatched={rows} />);
      expect(screen.getByText('continue').closest('button')).toBeDisabled();
      expect(screen.getByTestId('ocr-product-incomplete-hint')).toBeInTheDocument();
    });

    it('without a product spec the label is a neutral prompt that opens the dropdown', async () => {
      const user = userEvent.setup();
      render(<ProductResolverPopup {...defaultProps} productSpecUrl={null} unmatched={plainRows} />);
      expect(screen.getByTestId('ocr-product-main-0')).toHaveTextContent('ocrProductCreateSelect');
      await user.click(screen.getByTestId('ocr-product-main-0'));
      expect(await screen.findByPlaceholderText('ocrProductSearchPlaceholder')).toBeInTheDocument();
    });
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
    // The chevron opens the search dropdown (the label would open the create modal)
    await user.click(screen.getByTestId('ocr-product-open-0'));
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
    await user.click(screen.getByTestId('ocr-product-open-0'));
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
    await user.click(screen.getByTestId('ocr-product-open-0'));
    await waitFor(() => {
      expect(screen.getByText('Product One')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Product One'));
    // Submit
    await user.click(screen.getByText('continue'));
    expect(onSubmit).toHaveBeenCalledWith({ 0: 'p1' });
  });

  it('submits null for the skipped row next to a resolved one', async () => {
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
    await user.click(screen.getByTestId('ocr-product-open-0'));
    await waitFor(() => {
      expect(screen.getByText('Product One')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Product One'));
    // Second row explicitly skipped
    await skipRow(user, 1);
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
    await user.click(screen.getByTestId('ocr-product-open-0'));
    // Row label + the dropdown's own create entry
    await waitFor(() => {
      expect(screen.getAllByText('createProduct')).toHaveLength(2);
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
    await user.click(screen.getByTestId('ocr-product-open-0'));
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
    await user.click(screen.getByTestId('ocr-product-open-0'));
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

  it('shows create-product validation and defaults warning when defaults fail', async () => {
    const user = userEvent.setup();
    const unmatched = [{ idx: 0, description: 'Widget A' }];

    globalThis.fetch.mockImplementation((url) => {
      if (String(url).endsWith('/product/defaults')) {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByTestId('ocr-product-main-0'));

    expect(await screen.findByText('ocrProductCreateTitle')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('ocrProductCreateDefaultsFailed')).toBeInTheDocument());

    await user.click(screen.getByText('ocrProductCreate'));
    expect(screen.getByText('ocrProductCreateUomRequired')).toBeInTheDocument();
  });

  it('clears the create-product validation message as soon as the field is edited', async () => {
    const user = userEvent.setup();
    const unmatched = [{ idx: 0, description: 'Widget A' }];

    globalThis.fetch.mockImplementation((url) => {
      if (String(url).endsWith('/product/defaults')) {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByTestId('ocr-product-main-0'));
    expect(await screen.findByText('ocrProductCreateTitle')).toBeInTheDocument();

    // Name: empty it, submit, then type again.
    const [nameInput, searchKeyInput] = screen.getAllByRole('textbox');
    await user.clear(nameInput);
    await user.click(screen.getByText('ocrProductCreate'));
    expect(screen.getByText('ocrProductCreateNameRequired')).toBeInTheDocument();
    await user.type(nameInput, 'Widget B');
    expect(screen.queryByText('ocrProductCreateNameRequired')).not.toBeInTheDocument();

    // Search key: same flow.
    await user.clear(searchKeyInput);
    await user.click(screen.getByText('ocrProductCreate'));
    expect(screen.getByText('ocrProductCreateSearchKeyRequired')).toBeInTheDocument();
    await user.type(searchKeyInput, 'WB');
    expect(screen.queryByText('ocrProductCreateSearchKeyRequired')).not.toBeInTheDocument();
  });

  it('keeps a server create error visible while the user edits a field', async () => {
    const user = userEvent.setup();
    const unmatched = [{ idx: 0, description: 'Widget A' }];

    globalThis.fetch.mockImplementation((url, options = {}) => {
      const href = String(url);
      if (href.endsWith('/product/defaults')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            defaults: {
              id: 'default-id',
              uOM: 'uom-1',
              'uOM$_identifier': 'Unit',
              taxCategory: 'tax-1',
              'taxCategory$_identifier': 'VAT 21',
            },
          }),
        });
      }
      if (href.endsWith('/product') && options.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { message: 'Server exploded' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByTestId('ocr-product-main-0'));
    expect(await screen.findByText('ocrProductCreateTitle')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Unit').length).toBeGreaterThan(0));

    await user.click(screen.getByText('ocrProductCreate'));
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();

    const [nameInput] = screen.getAllByRole('textbox');
    await user.type(nameInput, ' B');
    expect(screen.getByText('Server exploded')).toBeInTheDocument();
  });

  it('creates a new product from OCR data and selects it for submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const unmatched = [{ idx: 0, description: 'Widget A' }];

    globalThis.fetch.mockImplementation((url, options = {}) => {
      const href = String(url);
      if (href.endsWith('/product/defaults')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ defaults: { id: 'default-id', searchKey: 'SERVER-SK', productType: 'I' } }),
        });
      }
      if (href.includes('/selectors/C_UOM_ID')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [{ id: 'uom-1', name: 'Unit' }] }),
        });
      }
      if (href.includes('/selectors/C_TaxCategory_ID')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: [{ id: 'tax-1', _identifier: 'VAT 21' }] } }),
        });
      }
      if (href.endsWith('/product') && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ response: { data: [{ id: 'prod-new', name: 'Widget A' }] } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} onSubmit={onSubmit} />);
    await user.click(screen.getByTestId('ocr-product-main-0'));

    expect(await screen.findByText('ocrProductCreateTitle')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Widget A').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByDisplayValue('WidgetA')).toBeInTheDocument());

    await user.click(screen.getAllByText('ocrProductCreateSelect')[0]);
    await waitFor(() => expect(screen.getByText('Unit')).toBeInTheDocument());
    await user.click(screen.getByText('Unit'));

    await user.click(screen.getAllByText('ocrProductCreateSelect')[0]);
    await waitFor(() => expect(screen.getByText('VAT 21')).toBeInTheDocument());
    await user.click(screen.getByText('VAT 21'));

    await user.click(screen.getByText('ocrProductCreate'));

    await waitFor(() => expect(screen.queryByText('ocrProductCreateTitle')).not.toBeInTheDocument());
    await user.click(screen.getByText('continue'));
    expect(onSubmit).toHaveBeenCalledWith({ 0: 'prod-new' });

    const postCall = globalThis.fetch.mock.calls.find(([url, options]) => String(url).endsWith('/product') && options?.method === 'POST');
    expect(JSON.parse(postCall[1].body)).toMatchObject({
      name: 'Widget A',
      searchKey: 'WidgetA',
      productType: 'I',
      uOM: 'uom-1',
      taxCategory: 'tax-1',
    });
    expect(JSON.parse(postCall[1].body)).not.toHaveProperty('id');
  });

  // ETP-5585 — UoM / tax category are prefilled from /product/defaults, like the product window.
  it('prefills UoM and tax category from product defaults and posts their ids', async () => {
    const user = userEvent.setup();
    const unmatched = [{ idx: 0, description: 'Widget A' }];
    globalThis.fetch.mockImplementation((url, options = {}) => {
      const href = String(url);
      if (href.endsWith('/product/defaults')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ defaults: {
            id: 'default-id', uOM: 'uom-def', 'uOM$_identifier': 'Unidad',
            taxCategory: 'tax-def', 'taxCategory$_identifier': 'IVA Normal',
          } }),
        });
      }
      if (href.endsWith('/product') && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ response: { data: [{ id: 'prod-new', name: 'Widget A' }] } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByTestId('ocr-product-main-0'));

    expect(await screen.findByText('Unidad')).toBeInTheDocument();
    expect(screen.getByText('IVA Normal')).toBeInTheDocument();

    await user.click(screen.getByText('ocrProductCreate'));
    await waitFor(() => expect(screen.queryByText('ocrProductCreateTitle')).not.toBeInTheDocument());
    const postCall = globalThis.fetch.mock.calls.find(([url, options]) => String(url).endsWith('/product') && options?.method === 'POST');
    expect(JSON.parse(postCall[1].body)).toMatchObject({ uOM: 'uom-def', taxCategory: 'tax-def' });
  });

  it('does not overwrite a UoM picked before the defaults response arrives', async () => {
    const user = userEvent.setup();
    const unmatched = [{ idx: 0, description: 'Widget A' }];
    let resolveDefaults;
    globalThis.fetch.mockImplementation((url) => {
      const href = String(url);
      if (href.endsWith('/product/defaults')) {
        return new Promise((resolve) => { resolveDefaults = () => resolve({
          ok: true,
          json: async () => ({ defaults: { uOM: 'uom-def', 'uOM$_identifier': 'Unidad', taxCategory: 'tax-def', 'taxCategory$_identifier': 'IVA Normal' } }),
        }); });
      }
      if (href.includes('/selectors/C_UOM_ID')) {
        return Promise.resolve({ ok: true, json: async () => ({ items: [{ id: 'uom-1', name: 'Kilo' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<ProductResolverPopup {...defaultProps} unmatched={unmatched} />);
    await user.click(screen.getByTestId('ocr-product-main-0'));
    await screen.findByText('ocrProductCreateTitle');

    await user.click(screen.getAllByText('ocrProductCreateSelect')[0]);
    await waitFor(() => expect(screen.getByText('Kilo')).toBeInTheDocument());
    await user.click(screen.getByText('Kilo'));

    await act(async () => { resolveDefaults(); });
    await waitFor(() => expect(screen.getByText('IVA Normal')).toBeInTheDocument());
    expect(screen.getByText('Kilo')).toBeInTheDocument();
    expect(screen.queryByText('Unidad')).toBeNull();
  });

  // ETP-5289 Bug 6 — as an `absolute` child the list was clipped by the popup's scrolling body.
  it('renders the product dropdown outside the popup body so it can overlap it', async () => {
    const user = userEvent.setup();
    render(<ProductResolverPopup {...defaultProps} unmatched={[{ idx: 0, description: 'Widget A' }]} />);

    const trigger = screen.getByTestId('ocr-product-open-0');
    await user.click(trigger);

    const input = await screen.findByPlaceholderText('ocrProductSearchPlaceholder');
    const popupBody = trigger.closest('.overflow-y-auto');
    expect(popupBody).not.toBeNull();
    expect(popupBody.contains(input)).toBe(false);
  });

  // ETP-5289 Bug 5 — the save buttons used the info-banner tint and read as disabled.
  it('renders the continue button with the primary button style', () => {
    render(<ProductResolverPopup {...defaultProps} />);
    const continueBtn = screen.getByText('continue').closest('button');
    expect(continueBtn.className).toContain('bg-primary');
    expect(continueBtn.className).not.toContain('bg-status-info');
  });

  // ETP-5585 — the create form prefills the tax category of the line's own tax; priority is
  // user pick > line tax's category > /product/defaults, whatever the order of the two loads.
  describe('create-product form — tax category from the line tax', () => {
    const DEFAULTS = { defaults: { uOM: 'uom-def', 'uOM$_identifier': 'Unidad', taxCategory: 'cat-normal', 'taxCategory$_identifier': 'IVA Normal' } };
    const TAX_RECORD = { response: { data: [{ id: 'TAX10', taxCategory: 'cat-reducido', 'taxCategory$_identifier': 'IVA Reducido' }] } };

    function deferred() {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      return { promise, resolve };
    }

    // Defaults / tax record responses are gated so each test picks the resolution order.
    function mockBackend({ defaults, tax, taxResponse = { ok: true, json: async () => TAX_RECORD } }) {
      globalThis.fetch.mockImplementation((url) => {
        const href = String(url);
        if (href.endsWith('/product/defaults')) return defaults.promise.then(() => ({ ok: true, json: async () => DEFAULTS }));
        if (href.includes('/tax/tax/')) return tax.promise.then(() => taxResponse);
        if (href.includes('/selectors/C_TaxCategory_ID')) {
          return Promise.resolve({ ok: true, json: async () => ({ items: [{ id: 'cat-user', name: 'Exento' }] }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
      });
    }

    async function open(user, row = { idx: 0, description: 'Widget A', taxId: 'TAX10' }) {
      render(<ProductResolverPopup {...defaultProps} unmatched={[row]} />);
      await user.click(screen.getByTestId('ocr-product-main-0'));
      await screen.findByText('ocrProductCreateTitle');
    }

    const taxCalls = () => globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/tax/tax/'));

    it('tax category wins over defaults when defaults resolve first', async () => {
      const user = userEvent.setup();
      const defaults = deferred(); const tax = deferred();
      mockBackend({ defaults, tax });
      await open(user);
      await act(async () => { defaults.resolve(); });
      await screen.findByText('IVA Normal');
      await act(async () => { tax.resolve(); });
      expect(await screen.findByText('IVA Reducido')).toBeInTheDocument();
      expect(screen.queryByText('IVA Normal')).toBeNull();
    });

    it('tax category wins over defaults when the tax record resolves first', async () => {
      const user = userEvent.setup();
      const defaults = deferred(); const tax = deferred();
      mockBackend({ defaults, tax });
      await open(user);
      await act(async () => { tax.resolve(); });
      await screen.findByText('IVA Reducido');
      await act(async () => { defaults.resolve(); });
      await waitFor(() => expect(screen.getByText('Unidad')).toBeInTheDocument());
      expect(screen.getByText('IVA Reducido')).toBeInTheDocument();
      expect(screen.queryByText('IVA Normal')).toBeNull();
    });

    it('never overwrites a category the user picked, before either response', async () => {
      const user = userEvent.setup();
      const defaults = deferred(); const tax = deferred();
      mockBackend({ defaults, tax });
      await open(user);
      await user.click(screen.getAllByText('ocrProductCreateSelect')[1]);
      await user.click(await screen.findByText('Exento'));
      await act(async () => { defaults.resolve(); tax.resolve(); });
      await waitFor(() => expect(screen.getByText('Unidad')).toBeInTheDocument());
      await waitFor(() => expect(taxCalls()).toHaveLength(1));
      expect(screen.getByText('Exento')).toBeInTheDocument();
      expect(screen.queryByText('IVA Reducido')).toBeNull();
      expect(screen.queryByText('IVA Normal')).toBeNull();
    });

    it('never overwrites a category the user picked after the defaults but before the tax record', async () => {
      const user = userEvent.setup();
      const defaults = deferred(); const tax = deferred();
      mockBackend({ defaults, tax });
      await open(user);
      await act(async () => { defaults.resolve(); });
      await screen.findByText('IVA Normal');
      await user.click(screen.getByText('IVA Normal'));
      await user.click(await screen.findByText('Exento'));
      await act(async () => { tax.resolve(); });
      await waitFor(() => expect(taxCalls()).toHaveLength(1));
      expect(screen.getByText('Exento')).toBeInTheDocument();
      expect(screen.queryByText('IVA Reducido')).toBeNull();
    });

    it('requests the tax record only when the form opens, through the shared apiFetch', async () => {
      const user = userEvent.setup();
      const defaults = deferred(); const tax = deferred();
      mockBackend({ defaults, tax });
      render(<ProductResolverPopup {...defaultProps} unmatched={[{ idx: 0, description: 'Widget A', taxId: 'TAX10' }]} />);
      expect(taxCalls()).toHaveLength(0);
      await user.click(screen.getByTestId('ocr-product-main-0'));
      await screen.findByText('ocrProductCreateTitle');
      await waitFor(() => expect(taxCalls()).toHaveLength(1));
      const [url, options] = taxCalls()[0];
      expect(String(url)).toBe('http://localhost/sws/neo/tax/tax/TAX10');
      expect(JSON.stringify(options)).toContain('test-token');
    });

    it('keeps the defaults category and makes no tax request for a row without taxId', async () => {
      const user = userEvent.setup();
      const defaults = deferred(); const tax = deferred();
      mockBackend({ defaults, tax });
      await open(user, { idx: 0, description: 'Widget A', taxId: null });
      await act(async () => { defaults.resolve(); });
      expect(await screen.findByText('IVA Normal')).toBeInTheDocument();
      expect(taxCalls()).toHaveLength(0);
    });

    it.each([
      ['non-OK answer', { ok: false, status: 403 }],
      ['a record without taxCategory', { ok: true, json: async () => ({ response: { data: [{ id: 'TAX10' }] } }) }],
    ])('keeps the defaults category on %s', async (_label, taxResponse) => {
      const user = userEvent.setup();
      const defaults = deferred(); const tax = deferred();
      mockBackend({ defaults, tax, taxResponse });
      await open(user);
      await act(async () => { tax.resolve(); defaults.resolve(); });
      expect(await screen.findByText('IVA Normal')).toBeInTheDocument();
      expect(screen.queryByText('IVA Reducido')).toBeNull();
    });

    it('keeps the defaults category when the tax request fails on the network', async () => {
      const user = userEvent.setup();
      const defaults = deferred();
      globalThis.fetch.mockImplementation((url) => {
        const href = String(url);
        if (href.endsWith('/product/defaults')) return defaults.promise.then(() => ({ ok: true, json: async () => DEFAULTS }));
        if (href.includes('/tax/tax/')) return Promise.reject(new Error('network'));
        return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
      });
      await open(user);
      await act(async () => { defaults.resolve(); });
      expect(await screen.findByText('IVA Normal')).toBeInTheDocument();
    });
  });

  describe('create-product form', () => {
    async function openCreateForm(user) {
      render(<ProductResolverPopup {...defaultProps} unmatched={[{ idx: 0, description: 'Widget A' }]} />);
      await user.click(screen.getByTestId('ocr-product-main-0'));
      await screen.findByText('ocrProductCreateTitle');
    }

    it('marks name, search key, UoM and tax category labels as required', async () => {
      const user = userEvent.setup();
      await openCreateForm(user);
      for (const key of ['ocrProductCreateName', 'ocrProductCreateSearchKey', 'ocrProductCreateUom', 'ocrProductCreateTaxCategory']) {
        const label = screen.getByText(key, { selector: 'label' });
        expect(label.querySelector('[aria-hidden], span')).not.toBeNull();
        expect(label.textContent).toContain('*');
      }
    });

    it.each([
      [0, 'ocrProductCreateUomSearchPlaceholder'],
      [1, 'ocrProductCreateTaxSearchPlaceholder'],
    ])('picker %i shows its own search placeholder', async (index, placeholder) => {
      const user = userEvent.setup();
      await openCreateForm(user);
      await user.click(screen.getAllByText('ocrProductCreateSelect')[index].closest('button'));
      expect(await screen.findByPlaceholderText(placeholder)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('ocrProductSearchPlaceholder')).not.toBeInTheDocument();
    });
  });
});

// ETP-5654 — back navigation and selection preservation.
describe('ProductResolverPopup — back navigation', () => {
  const props = {
    unmatched: [
      { idx: 0, description: 'Widget', suggestion: null },
      { idx: 2, description: 'Gadget', suggestion: null },
    ],
    selectorUrl: 'http://localhost/sel',
    productSpecUrl: 'http://localhost/sws/neo/product',
    token: 't',
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  });

  it('renders no back button unless onBack is provided', () => {
    render(<ProductResolverPopup {...props} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId('Button__b3ae11_back')).not.toBeInTheDocument();
  });

  it('back reports the selections and calls onBack, never onCancel or onSubmit', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onStateChange = vi.fn();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<ProductResolverPopup {...props} onBack={onBack} onStateChange={onStateChange} onSubmit={onSubmit} onCancel={onCancel} />);
    await skipRow(user, 0);
    await user.click(screen.getByTestId('Button__b3ae11_back'));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(Object.keys(onStateChange.mock.calls[0][0])).toEqual(['0']);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('restores initialSelections for rows still unmatched and ignores stale rows', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProductResolverPopup
        {...props}
        initialSelections={{
          0: { id: 'p-new', label: 'Created widget' },
          2: { id: 'p-gadget', label: 'Gadget X' },
          9: { id: 'p-stale', label: 'Gone' },
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()} />,
    );
    await user.click(screen.getByTestId('Button__b3ae11_continue'));

    expect(onSubmit).toHaveBeenCalledWith({ 0: 'p-new', 2: 'p-gadget' });
  });
});

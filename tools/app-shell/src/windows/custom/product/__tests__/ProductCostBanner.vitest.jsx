vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import ProductCostBanner from '../ProductCostBanner.jsx';

/**
 * ETP-5245 — the banner is ADVISORY. It renders exactly when `isProductMissingRequiredCost` is
 * true for the record and is completely absent otherwise, so the user is warned about a real
 * missing cost and never about anything else.
 *
 * It used to accompany a hard save-block in `useEntity`, and re-opened itself through the
 * save-block bus every time that block fired. The block was removed by product decision and the
 * `reopenSignal` wiring went with it: dismissing the banner now keeps it dismissed until the
 * record is re-read, the normal `InfoBanner` contract. Nothing here may assert a refused save.
 */
describe('ProductCostBanner', () => {
  /** Minimal record that shows the banner: a saved product whose cost flag is false. */
  const warning = {
    id: 'prod-1',
    productType: 'I',
    stocked: true,
    bookUsingPurchaseOrderPrice: false,
    etgoHasCost: false,
  };

  it('renders the warning for a saved product with no cost', () => {
    render(<ProductCostBanner data={warning} />);
    const banner = screen.getByTestId('product-cost-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('productCostRequired');
  });

  it('uses the warning tone', () => {
    render(<ProductCostBanner data={warning} />);
    // InfoBanner maps tone -> container classes; 'warning' is the only one using these tokens.
    expect(screen.getByTestId('product-cost-banner').className)
      .toContain('bg-status-warning');
  });

  it('renders nothing when the product already has a cost', () => {
    const { container } = render(
      <ProductCostBanner data={{ ...warning, etgoHasCost: true }} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the backend did not emit etgoHasCost', () => {
    const { etgoHasCost, ...withoutFlag } = warning;
    expect(etgoHasCost).toBe(false);
    render(<ProductCostBanner data={withoutFlag} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
  });

  it('renders nothing on the creation form (unsaved record)', () => {
    render(<ProductCostBanner data={{ ...warning, id: 'new' }} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
  });

  it('renders nothing for a record with no id at all', () => {
    const { id, ...withoutId } = warning;
    expect(id).toBeTruthy();
    render(<ProductCostBanner data={withoutId} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
  });

  /**
   * WIDENED SCOPE (deliberate — do not restore the old expectations). The banner used to be shown
   * only for a stocked `Item` not valued at its purchase order price. By product decision it now
   * warns on EVERY costless product, including services, expenses and resources, which the costing
   * engine never values. The three assertions below are the inverse of what they once were.
   */
  it('renders the warning for a non-stocked product (was hidden before the widening)', () => {
    render(<ProductCostBanner data={{ ...warning, stocked: false }} />);
    expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
  });

  it.each(['S', 'E', 'R'])(
    'renders the warning for product type "%s" (was hidden before the widening)',
    (productType) => {
      render(<ProductCostBanner data={{ ...warning, productType }} />);
      expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
    },
  );

  it('renders the warning even when the product is valued at its purchase order price', () => {
    render(<ProductCostBanner data={{ ...warning, bookUsingPurchaseOrderPrice: true }} />);
    expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
  });

  it('renders the warning for a bare saved record with only the cost flag', () => {
    render(<ProductCostBanner data={{ id: 'prod-2', etgoHasCost: false }} />);
    expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
  });

  it('does not crash on null or undefined data', () => {
    expect(() => render(<ProductCostBanner data={null} />)).not.toThrow();
    expect(() => render(<ProductCostBanner />)).not.toThrow();
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
  });

  it('takes its text from the i18n layer rather than a hardcoded string', () => {
    render(<ProductCostBanner data={warning} />);
    // The mocked useUI echoes the key back, so the rendered text IS the key.
    expect(screen.getByText('productCostRequired')).toBeInTheDocument();
  });

  /**
   * Visibility follows the record, one prop, every time: the same component instance must show
   * and hide as the cost flag changes (a cost line added on the Costing tab re-reads the header).
   */
  it('follows the cost flag across re-renders of the same instance', () => {
    const { rerender } = render(<ProductCostBanner data={warning} />);
    expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();

    rerender(<ProductCostBanner data={{ ...warning, etgoHasCost: true }} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();

    rerender(<ProductCostBanner data={{ ...warning, etgoHasCost: false }} />);
    expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
  });

  /**
   * Advisory banners are dismissible and STAY dismissed. There is no save-block bus wiring left —
   * nothing publishes `product-cost-required` any more, so a banner that re-opened itself would be
   * re-opening on someone else's signal.
   */
  describe('dismissal', () => {
    it('can be dismissed by the user', () => {
      render(<ProductCostBanner data={warning} />);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
    });

    it('stays dismissed while the record still has no cost', () => {
      const { rerender } = render(<ProductCostBanner data={warning} />);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      rerender(<ProductCostBanner data={{ ...warning, name: 'Widget renamed' }} />);
      expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
    });

    it('comes back when the record is re-read as a fresh banner', () => {
      const { unmount } = render(<ProductCostBanner data={warning} />);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      unmount();

      render(<ProductCostBanner data={warning} />);
      expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
    });
  });
});

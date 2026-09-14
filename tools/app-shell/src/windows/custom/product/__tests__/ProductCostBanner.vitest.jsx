vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import ProductCostBanner from '../ProductCostBanner.jsx';
import { notifySaveBlock, resetSaveBlockSignals } from '@/lib/saveBlockSignal.js';

/**
 * ETP-5245 — the banner is the visible half of the same rule the save gate enforces
 * (isProductMissingRequiredCost). It must appear exactly when a save would be refused, and be
 * completely absent otherwise, so the user is never warned about a save that would in fact
 * succeed (nor silently refused without a warning).
 */
describe('ProductCostBanner', () => {
  /** Minimal record that shows the banner: a saved product whose cost flag is false. */
  const blocking = {
    id: 'prod-1',
    productType: 'I',
    stocked: true,
    bookUsingPurchaseOrderPrice: false,
    etgoHasCost: false,
  };

  it('renders the warning for a saved product with no cost', () => {
    render(<ProductCostBanner data={blocking} />);
    const banner = screen.getByTestId('product-cost-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('productCostRequired');
  });

  it('uses the warning tone', () => {
    render(<ProductCostBanner data={blocking} />);
    // InfoBanner maps tone -> container classes; 'warning' is the only one using these tokens.
    expect(screen.getByTestId('product-cost-banner').className)
      .toContain('bg-status-warning');
  });

  it('renders nothing when the product already has a cost', () => {
    const { container } = render(
      <ProductCostBanner data={{ ...blocking, etgoHasCost: true }} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the backend did not emit etgoHasCost', () => {
    const { etgoHasCost, ...withoutFlag } = blocking;
    expect(etgoHasCost).toBe(false);
    render(<ProductCostBanner data={withoutFlag} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
  });

  it('renders nothing on the creation form (unsaved record)', () => {
    render(<ProductCostBanner data={{ ...blocking, id: 'new' }} />);
    expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
  });

  /**
   * WIDENED SCOPE (deliberate — do not restore the old expectations). The banner used to be shown
   * only for a stocked `Item` not valued at its purchase order price. By product decision it now
   * warns on EVERY costless product, including services, expenses and resources, which the costing
   * engine never values. The three assertions below are the inverse of what they once were.
   */
  it('renders the warning for a non-stocked product (was hidden before the widening)', () => {
    render(<ProductCostBanner data={{ ...blocking, stocked: false }} />);
    expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
  });

  it.each(['S', 'E', 'R'])(
    'renders the warning for product type "%s" (was hidden before the widening)',
    (productType) => {
      render(<ProductCostBanner data={{ ...blocking, productType }} />);
      expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
    },
  );

  it('renders the warning even when the product is valued at its purchase order price', () => {
    render(<ProductCostBanner data={{ ...blocking, bookUsingPurchaseOrderPrice: true }} />);
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
    render(<ProductCostBanner data={blocking} />);
    // The mocked useUI echoes the key back, so the rendered text IS the key.
    expect(screen.getByText('productCostRequired')).toBeInTheDocument();
  });

  /**
   * ETP-5245 — banners are dismissible by default now, but this one explains a HARD SAVE BLOCK.
   * Closing it must not be able to leave the user refused with nothing on screen saying why, so
   * the save gate's own refusal (announced on the save-block bus under the same stable toast id
   * it uses for the toast, `product-cost-required`) brings it back.
   */
  describe('reopens when the save it explains is refused', () => {
    beforeEach(() => {
      resetSaveBlockSignals();
    });

    it('can be dismissed by the user', () => {
      render(<ProductCostBanner data={blocking} />);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
    });

    it('reappears when the save gate refuses a save for this reason', () => {
      render(<ProductCostBanner data={blocking} />);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
      act(() => notifySaveBlock('product-cost-required'));
      expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
    });

    it('stays closed when a DIFFERENT save block fires', () => {
      render(<ProductCostBanner data={blocking} />);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      act(() => notifySaveBlock('numeric-field-usableLifeMonths'));
      expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
    });

    it('reopens again on every further refusal, not just the first', () => {
      render(<ProductCostBanner data={blocking} />);
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      act(() => notifySaveBlock('product-cost-required'));
      fireEvent.click(screen.getByTestId('info-banner-dismiss'));
      expect(screen.queryByTestId('product-cost-banner')).not.toBeInTheDocument();
      act(() => notifySaveBlock('product-cost-required'));
      expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
    });

    // A block fired while the banner was NOT on screen (product had a cost, or the user was on
    // another record) must not leave a stale "already dismissed at count N" behind: the banner
    // reads the live count on mount, so it starts open regardless of the history.
    it('starts open even if blocks were recorded before it mounted', () => {
      act(() => notifySaveBlock('product-cost-required'));
      render(<ProductCostBanner data={blocking} />);
      expect(screen.getByTestId('product-cost-banner')).toBeInTheDocument();
    });
  });
});

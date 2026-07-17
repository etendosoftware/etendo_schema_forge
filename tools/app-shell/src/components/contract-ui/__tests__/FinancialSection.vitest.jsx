import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../modal-styles.js', () => ({
  MODAL_STYLES: { fieldLabel: {} },
}));

import FinancialSection from '../FinancialSection.jsx';

const OPTS = {
  salesPriceLists: { options: [{ id: 'PL1', label: 'Price List 1' }], loading: false, error: false, onRetry: vi.fn() },
  purchasePriceLists: { options: [{ id: 'PPL1', label: 'Purchase PL' }], loading: false, error: false, onRetry: vi.fn() },
  paymentMethods: { options: [{ id: 'PM1', label: 'Wire' }], loading: false, error: false, onRetry: vi.fn() },
  paymentTerms: { options: [{ id: 'PT1', label: 'Net 30' }], loading: false, error: false, onRetry: vi.fn() },
  financialAccounts: { options: [{ id: 'FA1', label: 'Bank 1' }], loading: false, error: false, onRetry: vi.fn() },
};

describe('FinancialSection', () => {
  it('renders customer and vendor checkboxes', () => {
    render(<FinancialSection form={{}} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.getByText('customer')).toBeInTheDocument();
    expect(screen.getByText('isVendorField')).toBeInTheDocument();
  });

  it('shows customer fields when isCustomer is true', () => {
    render(<FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.getByText('salesPriceListField')).toBeInTheDocument();
    expect(screen.getByText('paymentMethodField')).toBeInTheDocument();
    expect(screen.getByText('paymentTermField')).toBeInTheDocument();
    expect(screen.getByText('financialAccountField')).toBeInTheDocument();
  });

  it('hides customer fields when isCustomer is false', () => {
    render(<FinancialSection form={{ isCustomer: false }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.queryByText('salesPriceListField')).not.toBeInTheDocument();
  });

  it('shows vendor fields when isVendor is true', () => {
    render(<FinancialSection form={{ isVendor: true }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.getByText('purchasePriceListField')).toBeInTheDocument();
    expect(screen.getByText('paymentMethodPOField')).toBeInTheDocument();
    expect(screen.getByText('paymentTermPOField')).toBeInTheDocument();
    expect(screen.getByText('financialAccountPOField')).toBeInTheDocument();
  });

  it('hides vendor fields when isVendor is false', () => {
    render(<FinancialSection form={{ isVendor: false }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.queryByText('purchasePriceListField')).not.toBeInTheDocument();
  });

  it('shows customer block checkbox when customer section is open', () => {
    render(<FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.getByText('customerBlockField')).toBeInTheDocument();
  });

  it('shows vendor block checkbox when vendor section is open', () => {
    render(<FinancialSection form={{ isVendor: true }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.getByText('vendorBlockField')).toBeInTheDocument();
  });

  it('calls onChange when customer checkbox is toggled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FinancialSection form={{}} onChange={onChange} opts={OPTS} />);
    const customerCheckbox = screen.getByText('customer');
    await user.click(customerCheckbox);
    expect(onChange).toHaveBeenCalledWith('isCustomer', true);
  });

  it('shows loading state for selects', () => {
    const loadingOpts = { ...OPTS, salesPriceLists: { ...OPTS.salesPriceLists, loading: true } };
    render(<FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={loadingOpts} />);
    expect(screen.getByText('loadingOptions')).toBeInTheDocument();
  });

  it('shows error state with retry button for selects', () => {
    const errorOpts = { ...OPTS, salesPriceLists: { ...OPTS.salesPriceLists, error: true, onRetry: vi.fn() } };
    render(<FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={errorOpts} />);
    expect(screen.getByText('errorLoadingOptions')).toBeInTheDocument();
    expect(screen.getByText('retryLoad')).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const errorOpts = { ...OPTS, salesPriceLists: { ...OPTS.salesPriceLists, error: true, onRetry } };
    render(<FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={errorOpts} />);
    await user.click(screen.getByText('retryLoad'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders both customer and vendor sections open', () => {
    render(<FinancialSection form={{ isCustomer: true, isVendor: true }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.getByText('salesPriceListField')).toBeInTheDocument();
    expect(screen.getByText('purchasePriceListField')).toBeInTheDocument();
  });

  it('renders with selected values', () => {
    render(<FinancialSection form={{ isCustomer: true, salesPriceList: 'PL1' }} onChange={vi.fn()} opts={OPTS} />);
    expect(screen.getByText('Price List 1')).toBeInTheDocument();
  });

  it('shows dash when no option selected', () => {
    render(<FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={OPTS} />);
    // Unselected selects show '—'
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('handles opts with undefined keys gracefully', () => {
    const minOpts = { salesPriceLists: undefined, paymentMethods: undefined, paymentTerms: undefined, financialAccounts: undefined, purchasePriceLists: undefined };
    render(<FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={minOpts} />);
    expect(screen.getByText('salesPriceListField')).toBeInTheDocument();
  });

  // ETP-4321: the DynamicSelect trigger button consumes the TRIGGER_CLS (with the
  // FIELD_HEIGHT `h-9` token) and the TRIGGER_STYLE module const (fontSize only —
  // the inline height was removed so the token wins). Rendering the customer
  // section mounts a trigger that exercises both module-level consts.
  it('select trigger uses the h-9 density token and the fontSize-only TRIGGER_STYLE', () => {
    const { container } = render(
      <FinancialSection form={{ isCustomer: true }} onChange={vi.fn()} opts={OPTS} />
    );
    // The trigger is a button carrying TRIGGER_CLS; find the one with the height token.
    const trigger = Array.from(container.querySelectorAll('button')).find(
      b => b.className.includes('h-9')
    );
    expect(trigger).toBeTruthy();
    expect(trigger.className).toContain('h-9');
    // TRIGGER_STYLE keeps fontSize only (no inline height/minHeight overriding the token).
    expect(trigger.style.fontSize).toBe('14px');
    expect(trigger.style.height).toBe('');
  });
});

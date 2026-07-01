import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/documentTotals', () => ({
  computeDocumentTotals: (lines, pending, editing, config, discPct) => {
    const gross = lines.reduce((a, l) => a + (l.lineGrossAmount || 0), 0) + (pending?.lineGrossAmount || 0);
    const net = lines.reduce((a, l) => a + (l.lineNetAmount || 0), 0) + (pending?.lineNetAmount || 0);
    const disc = lines.reduce((a, l) => a + (l.discount || 0), 0);
    const tax = gross - net;
    const totalDiscAmt = net * (discPct / 100);
    return { grossSubtotal: gross, netSubtotal: net, grandTotal: gross, discountAmt: disc, taxAmt: tax, totalDiscountAmt: totalDiscAmt };
  },
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => (
    <input type="checkbox" data-testid="total-discount-checkbox" checked={checked} onChange={onChange} />
  ),
}));

import DocumentTotalsPanel from '../DocumentTotalsPanel.jsx';

const LINE_CONFIG = { qtyField: 'qty', priceField: 'unitPrice', discountField: 'discount', grossField: 'lineGrossAmount' };
const LINES = [
  { id: 'L1', lineGrossAmount: 121, lineNetAmount: 100, discount: 0, qty: 1, unitPrice: 100 },
];

describe('DocumentTotalsPanel', () => {
  it('renders gross subtotal', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} currency="EUR" />);
    expect(screen.getByText('subtotalWithoutDiscount')).toBeInTheDocument();
  });

  it('renders per-product discount row', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} currency="EUR" />);
    expect(screen.getByText('discountPerProduct')).toBeInTheDocument();
  });

  it('renders subtotal row', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} currency="EUR" />);
    expect(screen.getByTestId('totals-row-subtotal')).toBeInTheDocument();
  });

  it('renders total row', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} currency="EUR" />);
    expect(screen.getByTestId('totals-row-total')).toBeInTheDocument();
  });

  it('renders tax row when taxAmt is non-zero', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} currency="EUR" />);
    expect(screen.getByTestId('totals-row-tax')).toBeInTheDocument();
  });

  it('shows add total discount button when not readOnly and has lines', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    expect(screen.getByText(/addTotalDiscount/)).toBeInTheDocument();
  });

  it('hides add total discount button when readOnly', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} readOnly={true} />);
    expect(screen.queryByText(/addTotalDiscount/)).not.toBeInTheDocument();
  });

  it('hides add total discount button when no lines', () => {
    render(<DocumentTotalsPanel lines={[]} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    expect(screen.queryByText(/addTotalDiscount/)).not.toBeInTheDocument();
  });

  it('opens total discount panel when totalDiscountPct > 0', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} totalDiscountPct={10} />);
    expect(screen.getByText('totalDiscount')).toBeInTheDocument();
  });

  it('shows readOnly total discount display', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} totalDiscountPct={5} readOnly={true} />);
    expect(screen.getByText(/totalDiscount/)).toBeInTheDocument();
    expect(screen.getByText(/5%/)).toBeInTheDocument();
  });

  it('opens total discount panel when button clicked', async () => {
    const user = userEvent.setup();
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    await user.click(screen.getByText(/addTotalDiscount/));
    expect(screen.getByTestId('total-discount-checkbox')).toBeInTheDocument();
  });

  it('formats amounts with formatAmount function', () => {
    const fmt = (v, c) => `${v.toFixed(2)} ${c}`;
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={fmt} currency="USD" />);
    expect(screen.getByTestId('totals-row-total-value').textContent).toContain('USD');
  });

  it('handles null formatAmount gracefully', () => {
    render(<DocumentTotalsPanel lines={LINES} lineConfig={LINE_CONFIG} formatAmount={null} currency="EUR" />);
    expect(screen.getByTestId('totals-row-total')).toBeInTheDocument();
  });

  it('shows discount amount with minus sign when discount > 0', () => {
    const linesWithDisc = [{ id: 'L1', lineGrossAmount: 100, lineNetAmount: 80, discount: 10, qty: 1 }];
    render(<DocumentTotalsPanel lines={linesWithDisc} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    expect(screen.getByText('discountPerProduct')).toBeInTheDocument();
  });

  it('renders with pendingLine', () => {
    const pending = { lineGrossAmount: 50, lineNetAmount: 40 };
    render(<DocumentTotalsPanel lines={[]} pendingLine={pending} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    expect(screen.getByTestId('totals-row-total')).toBeInTheDocument();
  });

  it('renders with editingLine', () => {
    render(<DocumentTotalsPanel lines={LINES} editingLine={{ lineGrossAmount: 200 }} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    expect(screen.getByTestId('totals-row-total')).toBeInTheDocument();
  });

  it('renders with empty lines and no pendingLine (minimal state)', () => {
    const { container } = render(<DocumentTotalsPanel lines={[]} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    expect(container.textContent).toContain('subtotalWithoutDiscount');
  });

  it('shows add button with pendingLine but no lines', () => {
    render(<DocumentTotalsPanel lines={[]} pendingLine={{ lineGrossAmount: 10, lineNetAmount: 8 }} lineConfig={LINE_CONFIG} formatAmount={(v) => `${v}`} />);
    expect(screen.getByText(/addTotalDiscount/)).toBeInTheDocument();
  });

  it('hides add button when lineConfig has no discountField', () => {
    const config = { qtyField: 'qty', priceField: 'unitPrice', grossField: 'lineGrossAmount' };
    render(<DocumentTotalsPanel lines={LINES} lineConfig={config} formatAmount={(v) => `${v}`} />);
    expect(screen.queryByText(/addTotalDiscount/)).not.toBeInTheDocument();
  });
});

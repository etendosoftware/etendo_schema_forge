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

  // ETP-4777 — the Form summary panel must never show a client-recomputed
  // total that differs from the persisted backend value (the one the Grid
  // and the printed document show). Whenever nothing is actively being
  // edited, the panel must display the authoritative `persistedTotals`
  // as-is instead of recomputing from `lines` via computeDocumentTotals.
  describe('ETP-4777 — persisted backend total takes precedence over client recompute', () => {
    it('shows the persisted total instead of recomputing from lines when nothing is pending (Case 1: Draft)', () => {
      // Mocked computeDocumentTotals (see top of file) would sum LINES'
      // lineGrossAmount and return grandTotal=121 — a different number than
      // the backend-persisted total, reproducing the reported Form-vs-Grid
      // mismatch (e.g. Form showed 89.19 while Grid's Imp. Total was 89.21).
      const persistedTotals = { grandTotal: 89.21, netSubtotal: 70, taxAmt: 19.21 };
      render(
        <DocumentTotalsPanel
          lines={LINES}
          lineConfig={LINE_CONFIG}
          formatAmount={(v) => `${v}`}
          persistedTotals={persistedTotals}
        />
      );
      expect(screen.getByTestId('totals-row-total-value').textContent).toBe('89.21');
    });

    it('keeps showing the persisted total after the document is completed, not the stale pre-Complete number (Case 3)', () => {
      // Simulates the Grid/print already updated to the post-Complete value
      // (e.g. 89.20) while the old buggy panel kept showing the pre-Complete
      // recompute (89.19) forever, because it never read the persisted total.
      const persistedTotals = { grandTotal: 76.43, netSubtotal: 60, taxAmt: 16.43 };
      render(
        <DocumentTotalsPanel
          lines={LINES}
          lineConfig={LINE_CONFIG}
          formatAmount={(v) => `${v}`}
          readOnly={true}
          persistedTotals={persistedTotals}
        />
      );
      expect(screen.getByTestId('totals-row-total-value').textContent).toBe('76.43');
    });

    it('falls back to the live recompute while the user is actively typing an unsaved total-discount %, even with no pending line', async () => {
      // Reproduces a real regression found during manual verification: typing
      // into the "Descuento total" % input doesn't touch pendingLine/
      // editingLine at all, so without this guard the panel would freeze on
      // the stale persistedTotals baseline and ignore every keystroke until
      // the onBlur PATCH round-trips back with a fresh header.
      const user = userEvent.setup();
      const persistedTotals = { grandTotal: 89.21, netSubtotal: 70, taxAmt: 19.21 };
      render(
        <DocumentTotalsPanel
          lines={LINES}
          lineConfig={LINE_CONFIG}
          formatAmount={(v) => `${v}`}
          persistedTotals={persistedTotals}
        />
      );
      // Baseline shown initially (no pending edit yet).
      expect(screen.getByTestId('totals-row-total-value').textContent).toBe('89.21');

      await user.click(screen.getByText(/addTotalDiscount/));
      const pctInput = screen.getByDisplayValue('0');
      await user.clear(pctInput);
      await user.type(pctInput, '25');

      // Mocked computeDocumentTotals always returns grandTotal=121 (sum of
      // LINES' lineGrossAmount) regardless of discPct — the point here is
      // only that it's no longer showing the frozen persisted baseline.
      expect(screen.getByTestId('totals-row-total-value').textContent).toBe('121');
    });

    it('falls back to the live recompute while a line is actively pending/unsaved (no persisted number exists yet for it)', () => {
      // While the user is mid-edit on a new row, there is nothing wrong to
      // fix — this is the one state where computeDocumentTotals is still the
      // right source, per the fix's design (see docs/plans/2026-08-12-etp4777-total-rounding-fix-plan.md §2).
      const persistedTotals = { grandTotal: 89.21, netSubtotal: 70, taxAmt: 19.21 };
      const pending = { lineGrossAmount: 50, lineNetAmount: 40 };
      render(
        <DocumentTotalsPanel
          lines={LINES}
          pendingLine={pending}
          lineConfig={LINE_CONFIG}
          formatAmount={(v) => `${v}`}
          persistedTotals={persistedTotals}
        />
      );
      // Mocked computeDocumentTotals sums LINES (121) + pending (50) = 171.
      expect(screen.getByTestId('totals-row-total-value').textContent).toBe('171');
    });
  });
});

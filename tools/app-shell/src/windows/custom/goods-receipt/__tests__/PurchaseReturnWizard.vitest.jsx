// @covers artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PurchaseReturnWizard from '@generated/goods-receipt/custom/PurchaseReturnWizard.jsx';

const LINES = [
  { id: 'line-1', 'product$_identifier': 'Product A', movementQuantity: 5 },
  { id: 'line-2', 'product$_identifier': 'Product B', movementQuantity: 3 },
];

const RECEIPT = { id: 'receipt-1', documentNo: 'ALB-001', 'businessPartner$_identifier': 'Vendor X' };

function renderWizard(overrides = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    receiptData: RECEIPT,
    lines: LINES,
    base: '/api',
    headers: {},
    onSuccess: vi.fn(),
    onError: vi.fn(),
  };
  return render(<PurchaseReturnWizard {...defaults} {...overrides} />);
}

describe('PurchaseReturnWizard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render when open is false', () => {
    renderWizard({ open: false });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders the product lines', () => {
    renderWizard();
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
  });

  it('shows the receipt document number', () => {
    renderWizard();
    expect(screen.getByText(/ALB-001/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderWizard({ onClose });
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  // ETP-5729 CP-15 — the shared CreateReturnWizard has a single step: Create return is on the
  // first screen, with no Next/Back.
  it('shows Create return directly, with no Next step', () => {
    renderWizard();
    expect(screen.queryByText('next')).not.toBeInTheDocument();
    expect(screen.getByText('createReturn')).toBeInTheDocument();
  });
});

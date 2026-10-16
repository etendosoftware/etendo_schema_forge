// @covers artifacts/goods-shipment/custom/ReturnWizard.jsx
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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReturnWizard from '@generated/goods-shipment/custom/ReturnWizard.jsx';

const LINES = [
  { id: 'line-1', product: 'p1', 'product$_identifier': 'Product A', movementQuantity: 5 },
  { id: 'line-2', product: 'p2', 'product$_identifier': 'Product B', movementQuantity: 3 },
];

const SHIPMENT = { id: 'shipment-1', documentNo: 'ALB-001', 'businessPartner$_identifier': 'Acme Inc' };

function renderWizard(overrides = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    shipmentData: SHIPMENT,
    lines: LINES,
    base: '/api',
    headers: {},
    onSuccess: vi.fn(),
    onError: vi.fn(),
  };
  return render(<ReturnWizard {...defaults} {...overrides} />);
}

describe('ReturnWizard (goods-shipment) — CreateReturnWizard delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({}),
    }));
  });

  it('does not render when open is false', () => {
    renderWizard({ open: false });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders the product lines and the shipment reference', () => {
    renderWizard();
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
    expect(screen.getByText(/ALB-001/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderWizard({ onClose });
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  // ETP-5729 CP-15 — no confirmation step and no amount column: the sales wrapper used to price
  // each line from the linked sales order BY PRODUCT, which was wrong when one product sat on two
  // order lines at different prices. Prices live on the credit note only.
  it('opens a single-step dialog with no Next step and no Amount column', () => {
    renderWizard({ shipmentData: { ...SHIPMENT, salesOrder: 'order-1' } });
    expect(screen.queryByText('next')).not.toBeInTheDocument();
    expect(screen.queryByText('amount')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("POSTs the createReturn action to the shipment's own action URL", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: { id: 'return-1' } } }),
    }));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderWizard({ onSuccess, onClose });

    fireEvent.click(screen.getByText('createReturn'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/goods-shipment/goodsShipment/shipment-1/action/createReturn');
    expect(options.method).toBe('POST');
  });
});

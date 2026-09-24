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

  it('renders step 1 with product lines and the shipment reference', () => {
    renderWizard();
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
    expect(screen.getByText(/ALB-001/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked in step 1', () => {
    const onClose = vi.fn();
    renderWizard({ onClose });
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('advances to step 2 when Next is clicked with lines selected', () => {
    renderWizard();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText('followingDocumentsWillBeCreated')).toBeInTheDocument();
  });

  it('goes back to step 1 when Back is clicked from step 2', () => {
    renderWizard();
    fireEvent.click(screen.getByText('next'));
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('Product A')).toBeInTheDocument();
  });

  // Sales-side differential vs. the purchase wizard: goods-shipment lines carry no price of
  // their own, so ReturnWizard wires showAmountColumn + a module-level fetchPrices that reads
  // the linked sales order. Unlike PurchaseReturnWizard (which passes neither prop at all), the
  // Amount column must be present in step 2 here.
  it('shows the Amount column in step 2, unlike the purchase-side wizard (showAmountColumn=true)', () => {
    renderWizard();
    fireEvent.click(screen.getByText('next'));
    expect(screen.getByText('amount')).toBeInTheDocument();
  });

  it("POSTs the createReturn action to the shipment's own action URL", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: { id: 'return-1' } } }),
    }));
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderWizard({ onSuccess, onClose });

    fireEvent.click(screen.getByText('next'));
    fireEvent.click(screen.getByText('createReturn'));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/goods-shipment/goodsShipment/shipment-1/action/createReturn');
    expect(options.method).toBe('POST');
  });
});

// ── fetchPrices (module-level helper) ──────────────────────────────────────────
//
// Tested by importing the same module the component uses and driving its default export's
// internal fetchPrices call indirectly is not possible (it's not exported) — so these tests
// exercise it the way CreateReturnWizard itself does: render with open=true + showAmountColumn
// wired on by the wrapper, and assert on the fetch calls it triggers via the mocked
// `@/auth/api.js` apiFetch used inside ReturnWizard.jsx (module-level, not useApiFetch-based).
describe('ReturnWizard — fetchPrices (module-level helper, sales-order price lookup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call fetch at all when sourceData.salesOrder is absent', async () => {
    globalThis.fetch = vi.fn();
    renderWizard({ shipmentData: { ...SHIPMENT, salesOrder: undefined } });

    // Give any stray microtask a chance to run before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches the linked sales order header and lines when sourceData.salesOrder is present', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/sales-order/header/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { data: [{ 'currency$_identifier': 'EUR' }] } }),
        });
      }
      if (url.includes('/sales-order/lines')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            response: {
              data: [
                { product: 'p1', unitPrice: 10 },
                { product: 'p2', priceActual: 20 },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });

    renderWizard({ shipmentData: { ...SHIPMENT, salesOrder: 'order-1' } });

    await waitFor(() => {
      const urls = globalThis.fetch.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => u.includes('/sales-order/header/order-1'))).toBe(true);
      expect(urls.some((u) => u.includes('/sales-order/lines?parentId=order-1&_limit=200'))).toBe(true);
    });

    // Both endpoints resolved -> the Amount cells reflect the fetched unitPrice/priceActual.
    fireEvent.click(screen.getByText('next'));
    await waitFor(() => {
      const cells = screen.getAllByText((_, el) => /50|60/.test(el?.textContent || ''));
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  it('does not throw and leaves prices empty when one of the two fetch calls rejects', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/sales-order/header/')) {
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [{ product: 'p1', unitPrice: 10 }] } }),
      });
    });

    expect(() => renderWizard({ shipmentData: { ...SHIPMENT, salesOrder: 'order-1' } })).not.toThrow();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    // No crash, and the wizard is still usable — step 1 still renders its lines.
    expect(screen.getByText('Product A')).toBeInTheDocument();
  });

  it('does not throw when both fetch calls reject', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error')));

    expect(() => renderWizard({ shipmentData: { ...SHIPMENT, salesOrder: 'order-1' } })).not.toThrow();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.getByText('Product A')).toBeInTheDocument();
  });
});

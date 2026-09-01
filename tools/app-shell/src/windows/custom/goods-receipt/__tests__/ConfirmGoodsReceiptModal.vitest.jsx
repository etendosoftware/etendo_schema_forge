// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ConfirmGoodsReceiptModal from '@generated/goods-receipt/custom/ConfirmGoodsReceiptModal';

const defaultProps = {
  data: {
    documentNo: 'ALB-001',
    'businessPartner$_identifier': 'Supplier A',
    grandTotalAmount: 1234.5,
    'currency$_identifier': 'EUR',
  },
  base: '/api',
  headers: { Authorization: 'Bearer tok', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
  recordId: 'receipt-1',
  onConfirmed: vi.fn(),
  onClose: vi.fn(),
};

function renderModal(overrides = {}) {
  return render(<ConfirmGoodsReceiptModal {...defaultProps} {...overrides} />);
}

// ETP-4942: ConfirmGoodsReceiptModal has no linkedOrders on defaultProps.data, so
// hasLinkedOrder is false and the price-list picker becomes mandatory before the
// Confirm button is enabled. Route fetch by URL substring — same pattern as
// ConfirmInOutModal.spec.jsx's mockFetchRouter — so the picker's own
// /price-list/priceList GET resolves independently from the doc-action/invoice
// call each test actually asserts on. This modal is purchase-side (isSOTrx=false),
// so the returned price list must have salesPriceList: false to survive
// PriceListPicker's filter. Because hasLinkedOrder is false here, PriceListPicker's
// `allowGenericFallback` is also false (the tariff must have real business meaning,
// not just an arbitrary system default) — so auto-selection only happens via a
// `defaultPriceListId` match, which is why RESOLVED_PRICE_LIST_ID below must equal
// the id returned by this router AND be threaded through `data.resolvedPriceListId`
// on every render in the tests below that need Confirm enabled.
const RESOLVED_PRICE_LIST_ID = 'pl-1';

function mockFetchRouterFor(actionHandler) {
  vi.stubGlobal('fetch', vi.fn((url) => {
    const u = String(url);
    if (u.includes('/price-list/priceList')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: [{ id: RESOLVED_PRICE_LIST_ID, name: 'PL', active: true, salesPriceList: false, default: true }] },
        }),
      });
    }
    return actionHandler(u);
  }));
}

function dataWithResolvedPriceList(overrides = {}) {
  return { ...defaultProps.data, resolvedPriceListId: RESOLVED_PRICE_LIST_ID, ...overrides };
}

describe('ConfirmGoodsReceiptModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('rendering', () => {
    it('renders the modal title using i18n key', () => {
      renderModal();
      expect(screen.getByText('goodsReceipt.confirmModal.title')).toBeInTheDocument();
    });

    it('renders subtitle parts: documentNo, businessPartner, and formatted amount', () => {
      renderModal();
      expect(screen.getByText('ALB-001')).toBeInTheDocument();
      expect(screen.getByText('Supplier A')).toBeInTheDocument();
      // The amount span shows the real currency symbol (never the raw ISO code) —
      // ETP-4314 centralization via formatCurrency().
      const amountSpan = screen.getByText((content, el) =>
        el?.tagName === 'SPAN' && content.includes('€') && content.includes(','),
      );
      expect(amountSpan).toBeInTheDocument();
      expect(screen.queryByText(/EUR/)).toBeNull();
    });

    it('omits subtitle parts that are missing', () => {
      renderModal({ data: {} });
      // should still render without crashing — no documentNo, no bpName, no amount
      expect(screen.getByText('goodsReceipt.confirmModal.title')).toBeInTheDocument();
    });

    it('renders the close (×) button', () => {
      renderModal();
      expect(screen.getByRole('button', { name: '×' })).toBeInTheDocument();
    });

    it('renders the cancel button', () => {
      renderModal();
      expect(screen.getByRole('button', { name: 'cancel' })).toBeInTheDocument();
    });

    it('switch starts ON — createInvoice toggle is aria-checked true', () => {
      renderModal();
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('primary button text is confirmWithInvoice when switch is ON', () => {
      renderModal();
      expect(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      ).toBeInTheDocument();
    });
  });

  describe('toggle switch', () => {
    it('toggles aria-checked when clicked', () => {
      renderModal();
      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('primary button text changes to titleConfirm when switch is OFF', () => {
      renderModal();
      fireEvent.click(screen.getByRole('switch'));
      expect(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.titleConfirm' }),
      ).toBeInTheDocument();
    });

    it('toggles switch with Space key', () => {
      renderModal();
      const toggle = screen.getByRole('switch');
      fireEvent.keyDown(toggle, { key: ' ' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('toggles switch with Enter key', () => {
      renderModal();
      const toggle = screen.getByRole('switch');
      fireEvent.keyDown(toggle, { key: 'Enter' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('dismissal', () => {
    it('calls onClose when cancel button is clicked', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when × button is clicked', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.click(screen.getByRole('button', { name: '×' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when overlay backdrop is clicked', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.click(screen.getByRole('dialog'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed on the dialog', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onClose when the inner card is clicked', () => {
      const onClose = vi.fn();
      renderModal({ onClose });
      // Click on the title which is inside the inner card (stopPropagation)
      fireEvent.click(screen.getByText('goodsReceipt.confirmModal.title'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('confirm — switch ON (creates both documentAction and invoice)', () => {
    it('calls documentAction POST then createPurchaseInvoice POST and calls onConfirmed with invoice data', async () => {
      const onConfirmed = vi.fn();
      mockFetchRouterFor((url) => {
        if (url.includes('documentAction')) {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('createPurchaseInvoice')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ response: { data: { id: 'inv-1', documentNo: 'FAC-001' } } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      renderModal({ onConfirmed, data: dataWithResolvedPriceList() });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
        ).not.toBeDisabled();
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      );

      await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
      expect(onConfirmed).toHaveBeenCalledWith({
        invoice: expect.objectContaining({ id: 'inv-1', documentNo: 'FAC-001' }),
      });

      const calls = global.fetch.mock.calls;
      expect(calls.some(([url]) => url.includes('documentAction'))).toBe(true);
      expect(calls.some(([url]) => url.includes('createPurchaseInvoice'))).toBe(true);
    });

    it('sends docAction CO in the documentAction request body', async () => {
      mockFetchRouterFor(() =>
        Promise.resolve({ ok: true, json: async () => ({ response: { data: {} } }) }),
      );
      const onConfirmed = vi.fn();
      renderModal({ onConfirmed, data: dataWithResolvedPriceList() });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
        ).not.toBeDisabled();
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      );
      await waitFor(() => expect(onConfirmed).toHaveBeenCalled());

      const docActionCall = global.fetch.mock.calls.find(([url]) => url.includes('documentAction'));
      expect(JSON.parse(docActionCall[1].body)).toEqual({ docAction: 'CO' });
    });
  });

  describe('confirm — switch OFF (only documentAction, no invoice)', () => {
    it('calls only documentAction and calls onConfirmed with invoice null', async () => {
      const onConfirmed = vi.fn();
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.resolve({ ok: true, json: async () => ({}) }),
      ));

      renderModal({ onConfirmed });
      // turn switch OFF
      fireEvent.click(screen.getByRole('switch'));
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.titleConfirm' }),
      );

      await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
      expect(onConfirmed).toHaveBeenCalledWith({ invoice: null });

      const calls = global.fetch.mock.calls;
      expect(calls.some(([url]) => url.includes('documentAction'))).toBe(true);
      expect(calls.some(([url]) => url.includes('createPurchaseInvoice'))).toBe(false);
    });
  });

  describe('error handling', () => {
    it('shows inline error div when documentAction fails', async () => {
      mockFetchRouterFor(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ response: { message: 'Server error' } }),
        }),
      );

      renderModal({ data: dataWithResolvedPriceList() });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
        ).not.toBeDisabled();
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      );

      await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
      // onConfirmed must NOT have been called
      expect(defaultProps.onConfirmed).not.toHaveBeenCalled();
    });

    it('shows fallback error message when response body has no message', async () => {
      mockFetchRouterFor(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({}),
        }),
      );

      renderModal({ data: dataWithResolvedPriceList() });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
        ).not.toBeDisabled();
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      );

      await waitFor(() => expect(screen.getByText('Error (503)')).toBeInTheDocument());
    });

    it('does not call onConfirmed when the API fails', async () => {
      const onConfirmed = vi.fn();
      mockFetchRouterFor(() =>
        Promise.resolve({ ok: false, status: 400, json: async () => ({}) }),
      );

      renderModal({ onConfirmed, data: dataWithResolvedPriceList() });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
        ).not.toBeDisabled();
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      );

      await waitFor(() => expect(screen.getByText('Error (400)')).toBeInTheDocument());
      expect(onConfirmed).not.toHaveBeenCalled();
    });

    it('shows error and keeps modal open when fetch rejects (network error)', async () => {
      mockFetchRouterFor(() => Promise.reject(new Error('Network error')));
      const onConfirmed = vi.fn();

      renderModal({ onConfirmed, data: dataWithResolvedPriceList() });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
        ).not.toBeDisabled();
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      );

      await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
      expect(onConfirmed).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows processing text while confirm is in flight', async () => {
      let resolveDocAction;
      mockFetchRouterFor(() =>
        new Promise((res) => { resolveDocAction = res; }),
      );

      renderModal({ data: dataWithResolvedPriceList() });
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
        ).not.toBeDisabled();
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'goodsReceipt.confirmModal.confirmWithInvoice' }),
      );

      expect(screen.getByText('processing')).toBeInTheDocument();

      // cancel and × buttons are disabled while loading
      expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled();

      // resolve to avoid dangling promise
      await act(async () => {
        resolveDocAction({ ok: true, json: async () => ({ response: { data: {} } }) });
      });
    });
  });
});

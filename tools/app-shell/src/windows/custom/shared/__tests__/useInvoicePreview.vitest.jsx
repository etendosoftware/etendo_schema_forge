/**
 * useInvoicePreview — how much of an invoice is still free to pay.
 *
 * A draft payment does not lower the invoice's outstanding amount, so the raw outstanding
 * over-states what a new payment may take: confirming both drafts would over-pay the invoice.
 * These cover the arithmetic the preview's "Registrar pago" button and the payment modal's
 * default amount are both driven by.
 */
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('../useInvoicePdf.js', () => ({
  useInvoicePdf: () => ({ pdfUrl: null, pdfBlob: null, loading: false, error: null }),
}));
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: () => ({ profile: null }),
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 't', selectedOrg: { id: 'org-1' } }),
}));

const apiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetch }));

import { renderHook, waitFor } from '@testing-library/react';
import { useInvoicePreview } from '../useInvoicePreview.js';

const INVOICE = { id: 'inv-1', documentStatus: 'CO', grandTotalAmount: '500.00' };

/** paymentPlan answers with one installment, invoicePayments with whatever the case needs. */
function stubApi({ outstanding, payments }) {
  apiFetch.mockImplementation((url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      response: {
        data: String(url).includes('/paymentPlan')
          ? [{ id: 'i1', outstandingAmount: outstanding }]
          : payments,
      },
    }),
  }));
}

function renderPreview() {
  return renderHook(() => useInvoicePreview({
    invoice: INVOICE, apiBaseUrl: 'http://host/sws/neo/purchase-invoice', specName: 'purchase-invoice',
  }));
}

describe('useInvoicePreview — free-to-allocate gating', () => {
  beforeEach(() => { apiFetch.mockReset(); });

  it('offers the whole outstanding when no draft reserves any of it', async () => {
    stubApi({ outstanding: '500.00', payments: [] });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(500);
    expect(result.current.canAddPayment).toBe(true);
    expect(result.current.addPaymentBlockedByDraft).toBe(false);
  });

  it('blocks a new payment when the drafts already reserve the whole outstanding', async () => {
    stubApi({
      outstanding: '500.00',
      payments: [{ id: 'p1', amount: '500.00', status: 'RPAP', processed: false }],
    });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(0);
    expect(result.current.canAddPayment).toBe(false);
    // Blocked, not "takes no payments": the invoice is still completed and still owes 500.
    expect(result.current.addPaymentBlockedByDraft).toBe(true);
  });

  it('leaves the remainder open when a draft only covers part of the invoice', async () => {
    stubApi({
      outstanding: '500.00',
      payments: [{ id: 'p1', amount: '200.00', status: 'RPAP', processed: false }],
    });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(300);
    expect(result.current.canAddPayment).toBe(true);
    expect(result.current.addPaymentBlockedByDraft).toBe(false);
  });

  it('ignores confirmed payments, which the outstanding already accounts for', async () => {
    // 300 of the 500 was paid and confirmed: the plan reports 200 outstanding, and that 200 is
    // fully free — subtracting the confirmed payment again would block a legitimate payment.
    stubApi({
      outstanding: '200.00',
      payments: [{ id: 'p1', amount: '300.00', status: 'RPPC', processed: true }],
    });
    const { result } = renderPreview();
    await waitFor(() => expect(result.current.loadingPayments).toBe(false));

    expect(result.current.freeToAllocate).toBe(200);
    expect(result.current.canAddPayment).toBe(true);
  });
});

// ETP-5424 — confirming a purchase order runs the document process synchronously (and, with
// "confirm + invoice", creates the invoice right after). Either can outlive apiFetch's default
// timeout; a client-side cut while the server still commits invites a double submit, so both
// requests of the confirm flow opt out with `timeout: 0`. The real client performs the request;
// only its options are recorded (see `@/test/recordApiFetch.js`).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/formatCurrency', () => ({
  formatCurrency: (_curr, val) => `$${Number(val || 0).toFixed(2)}`,
}));

vi.mock('lucide-react', () => ({
  FileText: () => <span data-testid="icon-file" />,
  Check: () => <span data-testid="icon-check" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), custom: vi.fn() },
}));

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { apiFetchCallsTo, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import PurchaseOrderActions from '../PurchaseOrderActions.jsx';

function renderDraft() {
  return render(
    <PurchaseOrderActions
      data={{ documentStatus: 'DR', documentNo: 'PO-001', grandTotalAmount: 500 }}
      recordId="order-1"
      token="tok"
      apiBaseUrl="/api/purchase-order"
      api={{ save: vi.fn() }}
      onProcess={vi.fn()}
    />,
  );
}

describe('PurchaseOrderActions — confirm flow timeout opt-out (ETP-5424)', () => {
  beforeEach(() => {
    resetApiFetchCalls();
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/action/rMCreateInvoice')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: { id: 'inv-1', documentNo: 'INV-1' } } }) });
      }
      if (u.includes('/lines')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: [{ id: 'order-1' }] } }) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the documentAction (CO) request passes timeout: 0', async () => {
    renderDraft();
    fireEvent.click(screen.getByText('poConfirmBtn'));
    fireEvent.click(screen.getByText('soConfirmOnly'));
    fireEvent.click(await screen.findByText('soConfirmActionOnly'));

    await waitFor(() => expect(apiFetchCallsTo('/action/documentAction').length).toBe(1));
    expect(apiFetchCallsTo('/action/documentAction')[0].options.timeout).toBe(0);
  });

  it('confirm + invoice: the rMCreateInvoice request passes timeout: 0 too', async () => {
    renderDraft();
    fireEvent.click(screen.getByText('poConfirmBtn'));
    fireEvent.click(screen.getByText('poConfirmWithInvoice'));
    fireEvent.click(await screen.findByText('soConfirmActionInvoice'));

    await waitFor(() => expect(apiFetchCallsTo('/action/rMCreateInvoice').length).toBe(1));
    expect(apiFetchCallsTo('/action/documentAction')[0].options.timeout).toBe(0);
    expect(apiFetchCallsTo('/action/rMCreateInvoice')[0].options.timeout).toBe(0);
  });
});

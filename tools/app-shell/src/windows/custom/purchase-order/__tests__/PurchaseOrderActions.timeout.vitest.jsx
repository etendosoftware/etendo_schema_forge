// ETP-5424 — confirming a purchase order runs the document process synchronously (and, with
// "confirm + invoice", creates the invoice right after). Either can outlive apiFetch's default
// timeout; a client-side cut while the server still commits invites a double submit, so the
// documentAction and createPurchaseInvoice requests opt out with `timeout: 0`. The goods-receipt
// request is deliberately NOT covered here: ETP-5424 never changed it (it keeps the default).
// The real client performs the request; only its options are recorded (see `@/test/recordApiFetch.js`).
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: () => <div />,
  SendDocumentButton: () => <button type="button" />,
}));

vi.mock('@/components/contract-ui', () => ({
  ConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
}));

vi.mock('@/components/contract-ui/CopyRecordLinkButton', () => ({
  default: () => <button type="button" />,
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: () => <div />,
}));

vi.mock('@/lib/surveys/survey-state.js', () => ({ incrementSurveyCounter: vi.fn() }));
vi.mock('@/lib/surveys/survey-engine.js', () => ({ emitSurveyTrigger: vi.fn() }));
vi.mock('@/windows/custom/shared/usePurchaseOrderPdf.js', () => ({
  usePurchaseOrderPdf: () => ({ pdfUrl: null, loading: false }),
}));
vi.mock('@/lib/observability/health-events.js', () => ({
  trackTransactionPosted: vi.fn(),
  trackDocumentCreated: vi.fn(),
}));
vi.mock('@/lib/formatCurrency.js', () => ({
  formatCurrency: (_currency, value) => `${Number(value || 0).toFixed(2)} €`,
}));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { apiFetchCallsTo, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import PurchaseOrderActions from '@generated/purchase-order/custom/PurchaseOrderActions';

async function renderDraftAndOpenConfirm() {
  await act(async () => {
    render(
      <PurchaseOrderActions
        data={{ documentStatus: 'DR', documentNo: 'PO-001', grandTotalAmount: 500 }}
        recordId="order-1"
        token="tok"
        apiBaseUrl="/sws/neo/purchase-order"
        onProcess={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn(async () => ({ id: 'order-1' }))}
      />,
    );
  });
  await act(async () => {
    window.dispatchEvent(new CustomEvent('purchase-order:open-confirm-modal'));
  });
}

describe('PurchaseOrderActions — confirm flow timeout opt-out (ETP-5424)', () => {
  beforeEach(() => {
    resetApiFetchCalls();
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/action/')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: { id: 'doc-1', documentNo: 'D-1' } } }) });
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
    await renderDraftAndOpenConfirm();
    fireEvent.click(await screen.findByTestId('action-confirm-modal'));

    await waitFor(() => expect(apiFetchCallsTo('/action/documentAction').length).toBe(1));
    expect(apiFetchCallsTo('/action/documentAction')[0].options.timeout).toBe(0);
  });

  it('confirm + invoice: the documentAction and createPurchaseInvoice requests pass timeout: 0', async () => {
    await renderDraftAndOpenConfirm();
    // The receipt option is selected too only so the flow runs end to end; its timeout is not asserted.
    fireEvent.click(await screen.findByText('poCreateReceiptTitle'));
    fireEvent.click(screen.getByText('soCreateInvoiceTitle'));
    fireEvent.click(screen.getByTestId('action-confirm-modal'));

    await waitFor(() => expect(apiFetchCallsTo('/action/createPurchaseInvoice').length).toBe(1));
    expect(apiFetchCallsTo('/action/documentAction')[0].options.timeout).toBe(0);
    expect(apiFetchCallsTo('/action/createPurchaseInvoice')[0].options.timeout).toBe(0);
    expect(apiFetchCallsTo('/action/createGoodsReceipt')[0].options.timeout).toBeUndefined();
  });
});

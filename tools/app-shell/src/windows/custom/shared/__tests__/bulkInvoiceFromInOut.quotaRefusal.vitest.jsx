// @covers artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx
// @covers artifacts/goods-receipt/custom/BulkInvoiceFromReceipt.jsx
/**
 * ETP-5051 — the grid's bulk "Crear factura" from selected goods shipments / goods receipts creates
 * ONE invoice from all of them, so a plan quota can refuse it (403 QUOTA_EXCEEDED, or 500
 * QUOTA_CHECK_FAILED). The toast must read as the translated quota sentence, never "Failed (403)"
 * nor the backend's English prose; every other refusal reads exactly as before.
 *
 * The two components are twins (same modal, same request shape, same error path), so one
 * parametrized suite pins both. The shared CreateInvoiceConfirmModal is reduced to a button that
 * calls `onConfirm`; the network goes through a mocked `useApiFetch` (docs/request-policy.md).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Keys echo back, except the two plan-quota sentences: an echoed key reads as "not translated",
// so the translator would fall back and the quota path could not be observed.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    if (key === 'backendError.quotaExceeded') return `Límite del plan alcanzado: ${params.resource}`;
    if (key === 'backendError.quotaCheckFailed') return 'No se pudo comprobar la cuota del plan.';
    return key;
  },
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: ({ onConfirm, loading }) => (
    <div data-testid="create-invoice-confirm-modal">
      <button type="button" data-testid="invoice-confirm-confirm" onClick={() => onConfirm?.('pl-1')} disabled={loading}>
        confirm
      </button>
    </div>
  ),
}));

vi.mock('@/components/contract-ui', () => ({
  ConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
}));

import { toast } from 'sonner';
import BulkInvoiceFromShipment from '@generated/goods-shipment/custom/BulkInvoiceFromShipment';
import BulkInvoiceFromReceipt from '@generated/goods-receipt/custom/BulkInvoiceFromReceipt';

const ROWS = [
  { id: 'doc-1', documentNo: 'ALB-1', documentStatus: 'CO', invoiceStatus: 0, businessPartner: 'bp-1', 'businessPartner$_identifier': 'Acme', etgoCurrency: 'EUR' },
  { id: 'doc-2', documentNo: 'ALB-2', documentStatus: 'CO', invoiceStatus: 0, businessPartner: 'bp-1', 'businessPartner$_identifier': 'Acme', etgoCurrency: 'EUR' },
];

const QUOTA_BODY = {
  error: {
    code: 'QUOTA_EXCEEDED', status: 403, message: 'Quota exceeded: Invoices (100/100)',
    quota: { resourceKey: 'BULK_INOUT_INVOICES', resourceName: 'Invoices', includedQty: 100, consumed: 100, verdict: 'DENY' },
  },
};

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe.each([
  ['BulkInvoiceFromShipment', BulkInvoiceFromShipment, 'createDraftInvoice', '/sws/neo/goods-shipment/goodsShipment'],
  ['BulkInvoiceFromReceipt', BulkInvoiceFromReceipt, 'createPurchaseInvoice', '/sws/neo/goods-receipt/goodsReceipt'],
])('%s — a refused bulk invoice (ETP-5051)', (name, Component, action, apiBaseUrl) => {
  /** The create action answers `status`/`body`; every lookup the modal makes answers an empty list. */
  function routeCreate(status, body) {
    mockApiFetch.mockImplementation((url) => (String(url).includes(`/action/${action}`)
      ? Promise.resolve(jsonResponse(body, { ok: status < 400, status }))
      : Promise.resolve(jsonResponse({ response: { data: [] } }))));
  }

  async function confirm() {
    render(<Component selectedRows={ROWS} clearSelection={vi.fn()} token="tok" apiBaseUrl={apiBaseUrl} refresh={vi.fn()} />);
    fireEvent.click(screen.getByTestId(`${name}__button`));
    fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toasts the translated quota sentence for a 403 QUOTA_EXCEEDED, and keeps the modal open', async () => {
    routeCreate(403, QUOTA_BODY);
    await confirm();

    expect(toast.error).toHaveBeenCalledWith('Límite del plan alcanzado: Invoices');
    expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
    // One create request for the whole selection.
    const creates = mockApiFetch.mock.calls.filter(([url]) => String(url).includes(`/action/${action}`));
    expect(creates).toHaveLength(1);
  });

  it('toasts the check-failed sentence for a 500 QUOTA_CHECK_FAILED', async () => {
    routeCreate(500, { error: { code: 'QUOTA_CHECK_FAILED', status: 500, message: 'The quota check failed; nothing was saved. Try again.' } });
    await confirm();

    expect(toast.error).toHaveBeenCalledWith('No se pudo comprobar la cuota del plan.');
  });

  it('keeps the backend message of any other refusal', async () => {
    routeCreate(409, { response: { status: -1, message: 'Lines already invoiced' } });
    await confirm();

    expect(toast.error).toHaveBeenCalledWith('Lines already invoiced');
  });

  it('keeps "Failed (<status>)" for a refusal with no message', async () => {
    routeCreate(502, null);
    await confirm();

    expect(toast.error).toHaveBeenCalledWith('Failed (502)');
  });
});

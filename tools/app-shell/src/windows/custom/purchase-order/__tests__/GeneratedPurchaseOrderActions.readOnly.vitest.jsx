/**
 * ETP-5205 (QA pasada 1) — under the Solo-Lectura tier (DetailView's `windowReadOnly`) the
 * "Gestionar recepción y factura" topbar action renders NOTHING. The trap it guards: the shipments/invoices fetch is
 * skipped under read-only, so `fetched` stays null — if the read-only return were placed after
 * the loading return, the header would show the "…" placeholder forever. It also must not open
 * any of its modals from a stray window event.
 */

import { render, screen, act } from '@testing-library/react';

// ── Mocks (before the import under test) ─────────────────────────────────────────────────

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
  default: () => <div data-testid="send-document-modal" />,
  SendDocumentButton: () => <button type="button" data-testid="send-document-button" />,
}));

vi.mock('@/components/contract-ui', () => ({
  ConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
}));

vi.mock('@/components/contract-ui/CopyRecordLinkButton', () => ({
  default: () => <button type="button" data-testid="copy-record-link" />,
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: () => <div data-testid="clone-order-modal" />,
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

import PurchaseOrderActions from '@generated/purchase-order/custom/PurchaseOrderActions';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const ORDER = {
  id: 'po-refresh-1',
  documentNo: 'PO/0002',
  documentStatus: 'CO',
  grandTotalAmount: 1000,
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'Proveedor E2E, S.L.',
};

const baseProps = {
  recordId: 'po-refresh-1',
  token: 'tok',
  apiBaseUrl: '/sws/neo/purchase-order',
  onProcess: vi.fn(),
  onRefresh: vi.fn(),
  onSave: vi.fn(),
};

/** `phase` drives what the three CO-lookups return; flipped between mount and the event. */
function installFetchMock(phaseRef) {
  globalThis.fetch = vi.fn((url) => {
    if (url.includes('goods-receipt')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    }
    if (url.includes('/lines?')) {
      const orderLines = phaseRef.value === 'done'
        ? [{ orderedQuantity: 10, deliveredQuantity: 10 }]
        : [{ orderedQuantity: 10, deliveredQuantity: 0 }];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: orderLines } }) });
    }
    if (url.includes('purchase-invoice')) {
      const invoices = phaseRef.value === 'done'
        ? [{ documentStatus: 'CO', grandTotalAmount: 1000 }]
        : [];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: invoices } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
  });
}

async function renderActions(phaseRef, props = {}) {
  installFetchMock(phaseRef);
  let result;
  await act(async () => {
    result = render(<PurchaseOrderActions {...baseProps} data={ORDER} {...props} />);
  });
  return result;
}

describe('PurchaseOrderActions — Solo-Lectura tier (ETP-5205)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing, with no loading placeholder and no fetch', async () => {
    const { container } = await renderActions({ value: 'pending' }, { windowReadOnly: true });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('poManageReceiptAndInvoice')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('ignores the open-modal events', async () => {
    const { container } = await renderActions({ value: 'pending' }, { windowReadOnly: true });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('purchase-order:open-actions-modal', { detail: {} }));
      window.dispatchEvent(new CustomEvent('purchase-order:open-confirm-modal'));
      window.dispatchEvent(new CustomEvent('purchase-order:open-send-modal'));
    });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  it('still shows the manage button under full access (control)', async () => {
    await renderActions({ value: 'pending' });

    expect(screen.getByText('poManageReceiptAndInvoice')).toBeInTheDocument();
  });
});

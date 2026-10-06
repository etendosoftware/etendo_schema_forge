/**
 * ETP-5205 (QA pasada 1) — under the Solo-Lectura tier (DetailView's `windowReadOnly`) the
 * "Gestionar envío y factura" topbar action renders NOTHING. The trap it guards: the shipments/invoices fetch is
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

vi.mock('@/auth/api.js', () => ({
  buildHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
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
vi.mock('@/windows/custom/shared/useOrderPdf.js', () => ({
  useOrderPdf: () => ({ pdfUrl: null, loading: false }),
}));
vi.mock('@/lib/observability/health-events.js', () => ({
  trackTransactionPosted: vi.fn(),
  trackDocumentCreated: vi.fn(),
}));
vi.mock('@/lib/formatCurrency.js', () => ({
  formatCurrency: (_currency, value) => `${Number(value || 0).toFixed(2)} €`,
}));

import OrderCreateInvoice from '@generated/sales-order/custom/OrderCreateInvoice';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const ORDER = {
  id: 'so-refresh-1',
  documentNo: 'SO/0002',
  documentStatus: 'CO',
  grandTotalAmount: 1000,
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'Cliente E2E, S.L.',
};

const baseProps = {
  recordId: 'so-refresh-1',
  token: 'tok',
  apiBaseUrl: '/sws/neo/sales-order',
  onRefresh: vi.fn(),
  onSave: vi.fn(),
};

/** `phase` drives what the three CO-lookups (shipments, lines, listInvoices) return. */
function installFetchMock(phaseRef) {
  globalThis.fetch = vi.fn((url) => {
    if (url.includes('goods-shipment')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    }
    if (url.includes('/lines?')) {
      const orderLines = phaseRef.value === 'done'
        ? [{ orderedQuantity: 10, deliveredQuantity: 10 }]
        : [{ orderedQuantity: 10, deliveredQuantity: 0 }];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: orderLines } }) });
    }
    if (url.includes('listInvoices')) {
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
    result = render(<OrderCreateInvoice {...baseProps} data={ORDER} {...props} />);
  });
  return result;
}

describe('OrderCreateInvoice — Solo-Lectura tier (ETP-5205)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing, with no loading placeholder and no fetch', async () => {
    const { container } = await renderActions({ value: 'pending' }, { windowReadOnly: true });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('soManageShipmentAndInvoice')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('ignores the open-modal events', async () => {
    const { container } = await renderActions({ value: 'pending' }, { windowReadOnly: true });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('sales-order:open-actions-modal', { detail: {} }));
      window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal'));
      window.dispatchEvent(new CustomEvent('sales-order:open-send-modal'));
    });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  it('still shows the manage button under full access (control)', async () => {
    await renderActions({ value: 'pending' });

    expect(screen.getByText('soManageShipmentAndInvoice')).toBeInTheDocument();
  });
});

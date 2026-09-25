/**
 * ETP-5308 — opening the edit form of a Draft Sales Order fired
 * POST /jsreport/api/report on mount, because useOrderPdf was called with the real
 * recordId unconditionally, even while the Send modal was closed. The fix calls the hook
 * with `showSend ? recordId : null` and derives `sendPdfLoading` to paper over the
 * one-render gap between `showSend` flipping true and the hook's own `loading` flag
 * catching up.
 *
 * Imported through `@generated/...`, same convention and same mock set as the sibling
 * `OrderCreateInvoice.confirmModalLifecycle.vitest.jsx` (see that file's header comment
 * for why `@generated` and why this lives under `tools/app-shell/src/`) — except
 * `useOrderPdf` here is a tracked `vi.fn()` instead of a fixed stub, since the id/loading
 * it receives across renders is exactly what this fix changed.
 */

import { render, screen, act, cleanup } from '@testing-library/react';

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

const mockUseOrderPdf = vi.fn();
vi.mock('@/windows/custom/shared/useOrderPdf.js', () => ({
  useOrderPdf: (...args) => mockUseOrderPdf(...args),
}));

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: (props) => (
    <div
      data-testid="send-document-modal"
      data-pdf-blob-loading={String(props.pdfBlobLoading)}
    />
  ),
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
vi.mock('@/lib/observability/health-events.js', () => ({
  trackTransactionPosted: vi.fn(),
  trackDocumentCreated: vi.fn(),
}));
vi.mock('@/lib/formatCurrency.js', () => ({
  formatCurrency: (_currency, value) => `${Number(value || 0).toFixed(2)} €`,
}));

import OrderCreateInvoice from '@generated/sales-order/custom/OrderCreateInvoice';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const ORDER = (documentStatus) => ({
  id: 'so-pdf-lazy-1',
  documentNo: 'SO/0001',
  documentStatus,
  grandTotalAmount: 1210,
  summedLineAmount: 1000,
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'Cliente E2E, S.L.',
});

const baseProps = {
  recordId: 'so-pdf-lazy-1',
  token: 'tok',
  apiBaseUrl: '/sws/neo/sales-order',
  onRefresh: vi.fn(),
  onSave: vi.fn(),
};

/** Renders, awaiting mount effects, with the order already Completed (only status that shows the modal). */
async function renderActions(overrides = {}) {
  let result;
  await act(async () => {
    result = render(<OrderCreateInvoice {...baseProps} data={ORDER('CO')} {...overrides} />);
  });
  return result;
}

async function dispatchOpenSend() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('sales-order:open-send-modal'));
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('OrderCreateInvoice — lazy PDF load on Send modal open (ETP-5308)', () => {
  beforeEach(() => {
    mockUseOrderPdf.mockReset();
    mockUseOrderPdf.mockReturnValue({ pdfUrl: null, loading: false, error: null });
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [] } }),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('calls useOrderPdf with a null id on mount, before the Send modal is opened', async () => {
    await renderActions();

    expect(mockUseOrderPdf).toHaveBeenCalled();
    const [idArg] = mockUseOrderPdf.mock.calls[mockUseOrderPdf.mock.calls.length - 1];
    expect(idArg).toBeNull();
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  it('calls useOrderPdf with the real recordId once the Send modal is opened', async () => {
    await renderActions();
    await dispatchOpenSend();

    const [idArg] = mockUseOrderPdf.mock.calls[mockUseOrderPdf.mock.calls.length - 1];
    expect(idArg).toBe('so-pdf-lazy-1');
  });

  it('passes pdfBlobLoading=true to SendDocumentModal while the url is pending', async () => {
    mockUseOrderPdf.mockReturnValue({ pdfUrl: null, loading: true, error: null });
    await renderActions();
    await dispatchOpenSend();

    expect(screen.getByTestId('send-document-modal')).toHaveAttribute('data-pdf-blob-loading', 'true');
  });

  it('passes pdfBlobLoading=false to SendDocumentModal once the url has arrived', async () => {
    mockUseOrderPdf.mockReturnValue({ pdfUrl: 'blob:generated', loading: false, error: null });
    await renderActions();
    await dispatchOpenSend();

    expect(screen.getByTestId('send-document-modal')).toHaveAttribute('data-pdf-blob-loading', 'false');
  });

  it('passes pdfBlobLoading=false when the hook reports an error, so the modal falls through to its own fallback', async () => {
    mockUseOrderPdf.mockReturnValue({ pdfUrl: null, loading: false, error: 'boom' });
    await renderActions();
    await dispatchOpenSend();

    expect(screen.getByTestId('send-document-modal')).toHaveAttribute('data-pdf-blob-loading', 'false');
  });

  it('unmounting and remounting with the Send modal still closed never requests the recordId (DetailView topbar-remount regression)', async () => {
    const { unmount } = await renderActions();
    unmount();
    await renderActions();

    for (const [idArg] of mockUseOrderPdf.mock.calls) {
      expect(idArg).toBeNull();
    }
  });
});

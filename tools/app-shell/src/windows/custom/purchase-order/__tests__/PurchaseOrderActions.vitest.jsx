// Live-module smoke tests for PurchaseOrderActions (ETP-5280). They replace the layout-independent
// cases of the suite that used to target the dead app-shell copy. Layout-only cases of that suite
// (poSave / delete / receive-goods / create-invoice / email buttons) were dropped: DetailView owns
// those buttons now, and the live component's states are covered by the
// GeneratedPurchaseOrderActions.* suites.
import { render, screen, fireEvent, act } from '@testing-library/react';

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

import PurchaseOrderActions from '@generated/purchase-order/custom/PurchaseOrderActions';

const props = {
  recordId: 'order-1',
  token: 'tok',
  apiBaseUrl: '/sws/neo/purchase-order',
  onProcess: vi.fn(),
  onRefresh: vi.fn(),
  onSave: vi.fn(async () => ({ id: 'order-1' })),
};
const DRAFT = { documentStatus: 'DR', documentNo: 'PO-001', grandTotalAmount: 500 };

async function renderActions(data) {
  let result;
  await act(async () => {
    result = render(<PurchaseOrderActions {...props} data={data} />);
  });
  return result;
}

describe('PurchaseOrderActions (live module)', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ response: { data: [] } }),
    }));
  });

  it('renders nothing when data is null', async () => {
    const { container } = await renderActions(null);
    expect(container.firstChild).toBeNull();
  });

  // ETP-4728 — the decorative Print icon (onProcess('print') -> a broken POST) was removed; the
  // generic DetailView Printer button + DocumentPrintDrawer own printing for this window.
  it('does not render a print icon', async () => {
    await renderActions(DRAFT);
    expect(screen.queryByLabelText('print')).not.toBeInTheDocument();
  });

  it('opens the confirm modal on the purchase-order:open-confirm-modal event, in draft', async () => {
    await renderActions(DRAFT);
    expect(screen.queryByTestId('action-confirm-modal')).not.toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('purchase-order:open-confirm-modal'));
    });
    expect(await screen.findByTestId('action-confirm-modal')).toBeInTheDocument();
  });
});

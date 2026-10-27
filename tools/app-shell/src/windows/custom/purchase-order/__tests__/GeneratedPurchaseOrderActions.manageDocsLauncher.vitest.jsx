/**
 * Rules-of-Hooks regression for `ManageDocsLauncher` (ETP-5295).
 *
 * ## Which file this tests, and why it lives here
 *
 * `artifacts/purchase-order/custom/PurchaseOrderActions.jsx`, imported below through
 * `@generated/...` — the same module the list-view row kebab's "Gestionar recepción/factura"
 * action mounts. It lives under `tools/app-shell/src/` because vitest's `include` is
 * `src/**\/*.vitest.{js,jsx}` relative to `tools/app-shell`: a `.vitest.jsx` placed next to the
 * component under `artifacts/` would never be collected (see the sibling
 * `GeneratedPurchaseOrderActions.confirmModalLifecycle.vitest.jsx`, which documents the same
 * constraint for `ConfirmModal`).
 *
 * ## The bug
 *
 * `ManageDocsLauncher` used to compute `nothingToManage` and register its auto-close
 * `useEffect` AFTER an early `if (!fetched) return <Spinner/>`. React calls hooks in the same
 * fixed order and count on every render; skipping a hook on the first (loading) render and
 * registering it only once `fetched` resolves makes React see a different hook count between
 * renders and throw "Rendered more hooks than during the previous render." — with no
 * ErrorBoundary anywhere in the app to catch it, this crashed the whole SPA to a blank page,
 * confirmed live via browser reproduction.
 *
 * The fix (26aacff58) hoists every hook above any early return and guards the derived values
 * against `fetched` being null instead. The two tests below exercise exactly the transition
 * that used to crash: loading → resolved-with-nothing-pending (closes silently) and
 * loading → resolved-with-something-pending (opens `CreateDocsModal`). A third test pins the
 * regression class itself by asserting no "Rendered more hooks" console error is ever logged.
 */

// @covers artifacts/purchase-order/custom/PurchaseOrderActions.jsx
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';

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

import PurchaseOrderActions, {
  ManageDocsLauncher,
  CreateDocsModal,
  poManageDocsLabel,
} from '@generated/purchase-order/custom/PurchaseOrderActions';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const ORDER = (overrides = {}) => ({
  id: 'po-launcher-1',
  documentNo: 'PO/0002',
  documentStatus: 'CO',
  grandTotalAmount: 0,
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'Proveedor E2E, S.L.',
  ...overrides,
});

const baseProps = {
  orderId: 'po-launcher-1',
  apiBaseUrl: '/sws/neo/purchase-order',
  token: 'tok',
};

/** Builds a `fetch` mock that answers the three lookups by URL shape, in any call order. */
function mockFetch({ receipts = [], orderLines = [], invoices = [] } = {}) {
  return vi.fn((url) => {
    let data = [];
    if (url.includes('goods-receipt')) data = receipts;
    else if (url.includes('/lines?')) data = orderLines;
    else if (url.includes('purchase-invoice')) data = invoices;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
  });
}

// Every title the manage-docs dialog can carry (button wording or the generic fallback).
const DOCS_TITLES_RE = /^(poManageReceiptAndInvoice|poManageReceipt|poManageInvoice|soManageDocsTitle)$/;

const HOOKS_ORDER_REGEXP = /Rendered more hooks|change in the order of Hooks/;

describe('ManageDocsLauncher — Rules-of-Hooks regression (ETP-5295)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  function assertNoHooksOrderViolation() {
    const offending = consoleErrorSpy.mock.calls.find((args) =>
      args.some((a) => HOOKS_ORDER_REGEXP.test(String(a))),
    );
    expect(
      offending,
      `console.error logged a Rules-of-Hooks violation: ${JSON.stringify(offending)}`,
    ).toBeUndefined();
  }

  it('renders the loading spinner while `fetched` is still null, without crashing', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    const onClose = vi.fn();

    await act(async () => {
      render(<ManageDocsLauncher {...baseProps} data={ORDER()} onClose={onClose} onCreated={vi.fn()} />);
    });

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    assertNoHooksOrderViolation();
  });

  // This is the exact transition that used to crash: on the render right after `fetched`
  // resolves, the old code added a hook (the auto-close effect) that had not run on the
  // loading render — "Rendered more hooks than during the previous render."
  it('closes silently once fetch resolves with nothing pending (nothingToManage)', async () => {
    globalThis.fetch = mockFetch({ receipts: [], orderLines: [], invoices: [] });
    const onClose = vi.fn();

    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER({ grandTotalAmount: 0 })}
          onClose={onClose}
          onCreated={vi.fn()}
        />,
      );
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // CreateDocsModal never renders when nothing is pending — checked via its title text
    // rather than a testid, since PurchaseOrderActions' CreateDocsModal ignores the
    // `data-testid` prop it is passed (destructures neither it nor a spread — a separately
    // reported issue), so the string literal never reaches the DOM either way.
    expect(screen.queryByTestId('purchase-order-docs-receipt-card')).not.toBeInTheDocument();
    expect(screen.queryByText(DOCS_TITLES_RE)).not.toBeInTheDocument();
    assertNoHooksOrderViolation();
  });

  it('renders CreateDocsModal once fetch resolves with something pending, without crashing', async () => {
    globalThis.fetch = mockFetch({
      receipts: [],
      orderLines: [{ orderedQuantity: 10, deliveredQuantity: 0 }],
      invoices: [],
    });
    const onClose = vi.fn();

    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER({ grandTotalAmount: 500 })}
          onClose={onClose}
          onCreated={vi.fn()}
        />,
      );
    });

    // `purchase-order-docs-receipt-card` is the one real testid CreateDocsModal renders here
    // (needsReceipt is true from the pending order line); the modal component itself is never
    // given a testid of its own (see note above).
    await waitFor(() =>
      expect(screen.getByTestId('purchase-order-docs-receipt-card')).toBeInTheDocument(),
    );
    // Both receipt and invoice pending: the title is the combined wording, not the generic one.
    expect(screen.getByText('poManageReceiptAndInvoice')).toBeInTheDocument();
    expect(screen.queryByText('soManageDocsTitle')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    assertNoHooksOrderViolation();
  });

  // ETP-5295 QA gap — the loading→resolved transition guarded by the Rules-of-Hooks fix is
  // exercised above only for the happy (fetch resolves) path. The component's own `catch`
  // block (falling back to empty receipts/invoices/orderLines) is the OTHER way `fetched`
  // transitions from null to non-null, and it goes through the exact same hook-ordering path
  // the fix targeted. A rejected `Promise.all` (network error / one of the 3 endpoints down)
  // must resolve to the same "nothing pending" outcome as an empty-but-successful fetch —
  // and must not resurrect the "Rendered more hooks" crash this whole file guards against.
  it('falls back to empty state and closes silently when the fetch rejects (network error)', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    const onClose = vi.fn();

    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER({ grandTotalAmount: 0 })}
          onClose={onClose}
          onCreated={vi.fn()}
        />,
      );
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('purchase-order-docs-receipt-card')).not.toBeInTheDocument();
    expect(screen.queryByText(DOCS_TITLES_RE)).not.toBeInTheDocument();
    assertNoHooksOrderViolation();
  });
});

// ETP-5688 — the dialog title is the same wording as the button that opens it. Before, it was
// always `soManageDocsTitle` ("Generar factura"), so a receipt-only order opened a dialog about
// invoicing. The title follows what is PENDING (the backend annotations on the record), never
// what the user ticks.
describe('poManageDocsLabel', () => {
  const ui = (key) => key;

  it.each([
    ['both pending', true, true, 'poManageReceiptAndInvoice'],
    ['invoice only', false, true, 'poManageInvoice'],
    ['receipt only', true, false, 'poManageReceipt'],
    ['nothing pending', false, false, null],
  ])('%s -> %s', (_label, needsReceipt, needsInvoice, expected) => {
    expect(poManageDocsLabel(ui, needsReceipt, needsInvoice)).toBe(expected);
  });
});

describe('CreateDocsModal — title follows what is pending', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const SCENARIOS = [
    ['receipt only', { needsPrimaryDoc: true, needsInvoiceDoc: false, grandTotalAmount: 0 },
      [{ orderedQuantity: 10, deliveredQuantity: 0 }], 'poManageReceipt'],
    ['invoice only', { needsPrimaryDoc: false, needsInvoiceDoc: true, grandTotalAmount: 500 },
      [{ orderedQuantity: 10, deliveredQuantity: 10 }], 'poManageInvoice'],
    ['receipt and invoice', { needsPrimaryDoc: true, needsInvoiceDoc: true, grandTotalAmount: 500 },
      [{ orderedQuantity: 10, deliveredQuantity: 0 }], 'poManageReceiptAndInvoice'],
  ];

  it.each(SCENARIOS)('ManageDocsLauncher, %s pending -> title %s (no ticking)', async (_l, annotations, orderLines, title) => {
    globalThis.fetch = mockFetch({ orderLines });
    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER(annotations)}
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />,
      );
    });

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByText('soManageDocsTitle')).not.toBeInTheDocument();
  });

  it.each(SCENARIOS)('detail button, %s pending -> dialog title equals the button text %s', async (_l, annotations, orderLines, title) => {
    globalThis.fetch = mockFetch({ orderLines });
    await act(async () => {
      render(
        <PurchaseOrderActions
          recordId="po-launcher-1"
          token="tok"
          apiBaseUrl="/sws/neo/purchase-order"
          onProcess={vi.fn()}
          onRefresh={vi.fn()}
          onSave={vi.fn()}
          data={ORDER(annotations)}
        />,
      );
    });

    const button = await screen.findByTestId('purchase-order-manage-docs');
    expect(button).toHaveTextContent(title);

    await act(async () => {
      fireEvent.click(button);
    });

    // Button text + dialog title are the same string, so it now appears twice.
    expect(screen.getAllByText(title)).toHaveLength(2);
    expect(screen.queryByText('soManageDocsTitle')).not.toBeInTheDocument();
  });

  it('keeps the combined title when the user ticks only one of the two pending actions', async () => {
    globalThis.fetch = mockFetch({ orderLines: [{ orderedQuantity: 10, deliveredQuantity: 0 }] });
    await act(async () => {
      render(
        <ManageDocsLauncher
          {...baseProps}
          data={ORDER({ needsPrimaryDoc: true, needsInvoiceDoc: true, grandTotalAmount: 500 })}
          onClose={vi.fn()}
          onCreated={vi.fn()}
        />,
      );
    });
    await screen.findByText('poManageReceiptAndInvoice');

    const receiptCard = screen.getByTestId('purchase-order-docs-receipt-card');
    const tick = receiptCard.querySelector('input[type="checkbox"]') ?? receiptCard;
    await act(async () => {
      fireEvent.click(tick);
    });

    expect(screen.getByText('poManageReceiptAndInvoice')).toBeInTheDocument();
    expect(screen.queryByText('poManageReceipt')).not.toBeInTheDocument();
  });

  it('falls back to the generic title when the dialog is opened with nothing pending', () => {
    const derived = {
      receiptsComplete: [], invoicesComplete: [],
      qtyOrdered: 0, qtyDelivered: 0, qtyPending: 0,
      totalOrder: 0, totalInvoiced: 0, totalPending: 0,
      needsReceipt: false, needsInvoice: false,
    };
    render(
      <CreateDocsModal
        orderId="po-launcher-1"
        data={ORDER()}
        base="/sws/neo"
        currency="EUR"
        derived={derived}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    expect(screen.getByText('soManageDocsTitle')).toBeInTheDocument();
  });
});

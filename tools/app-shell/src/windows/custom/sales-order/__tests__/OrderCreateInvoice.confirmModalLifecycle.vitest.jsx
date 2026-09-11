/**
 * Confirm-modal lifecycle of the sales-order topbar actions (ETP-5255).
 *
 * ## Which file this tests
 *
 * `artifacts/sales-order/custom/OrderCreateInvoice.jsx`, imported below through
 * `@generated/...` — the same module the running window uses (`customLoaders` in
 * `windows/registry.js` wins over `windowLoaders`, so the live window is
 * `windows/custom/sales-order/index.jsx`, whose generated `HeaderPage` passes
 * `topbarRight={OrderCreateInvoice}`). Unlike its purchase-order twin there is NO second copy
 * of this component under `windows/custom/sales-order/` — that directory holds only
 * `index.jsx` — so there is no sibling test importing the wrong file here.
 *
 * It lives under `tools/app-shell/src/` because vitest's `include` is
 * `src/**\/*.vitest.{js,jsx}` relative to `tools/app-shell`: a `.vitest.jsx` placed next to the
 * component under `artifacts/` would never be collected.
 *
 * ## What this replaces
 *
 * `artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js` used to assert
 * `/\{isDraft && showConfirm && createPortal\(/` against the file's own SOURCE TEXT — the kind
 * of assertion forbidden since ETP-4958. It was worse than merely brittle: it pinned the exact
 * expression that produced a silent failure, so the defect below could not be fixed without
 * "breaking" a green test, and no test anywhere covered the property that actually matters.
 *
 * ## The properties, and why the last one exists
 *
 * `isDraft` must gate OPENING the modal, and nothing else. Confirming the order moves it
 * DR→CO, and the modal has to outlive that transition because it is the only place the result
 * of the shipment / invoice steps is reported. Three separate things dropped it, and the third
 * was only found after the first two were fixed:
 *
 *   1. the `{isDraft && showConfirm && …}` gate — `isDraft` goes false the moment `onRefresh()`
 *      reloads the confirmed record;
 *   2. the `if (isCompleted && !fetched)` early return — on reaching CO, `fetched` is `null`
 *      again until the CO effect's three lookups resolve, so even code after that gate never
 *      ran;
 *   3. and once the portal was rendered from BOTH returns to survive (1) and (2), it sat at a
 *      different child index in each, so React reconciled it as a new element and REMOUNTED
 *      `ConfirmModal` — wiping `error`, `orderConfirmed`, `shipmentResult` and `invoiceResult`.
 *      That was strictly worse than the unmount: the modal came back blank, both checkboxes
 *      cleared, and pressing Confirm re-sent `docAction: 'CO'` to an order already in CO
 *      (`@AlreadyPosted@`) while never retrying the step that failed.
 *
 * Neither a `key` on the portal nor rendering it from both returns fixes (3) — both were tried
 * on the purchase twin and both failed. What does is not crossing: the loading return yields to
 * an open modal (`isCompleted && !fetched && !showConfirm`), so the portal lives at exactly one
 * position. Each property is asserted separately below; a fix addressing only some of them
 * leaves the rest live, which is what happened twice on the twin.
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

// Only `buildHeaders` is imported from the auth barrel (ETP-5024 moved this modal's headers
// onto it). Mocked so the test needs no AuthProvider.
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

const ORDER = (documentStatus) => ({
  id: 'so-lifecycle-1',
  documentNo: 'SO/0001',
  documentStatus,
  grandTotalAmount: 1210,
  summedLineAmount: 1000,
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'Cliente E2E, S.L.',
});

const baseProps = {
  recordId: 'so-lifecycle-1',
  token: 'tok',
  apiBaseUrl: '/sws/neo/sales-order',
  onRefresh: vi.fn(),
  onSave: vi.fn(),
};

/** The modal's submit button. Its presence is the modal's presence. */
const confirmModal = () => screen.queryByTestId('sales-order-confirm-submit');

/** The event DetailView's draftMode Confirm button dispatches. This is the real entry point. */
async function dispatchOpenConfirm() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('sales-order:open-confirm-modal'));
  });
}

/** Renders, awaiting the mount effects so pending fetches are in flight before assertions. */
async function renderActions(documentStatus, overrides = {}) {
  let result;
  await act(async () => {
    result = render(<OrderCreateInvoice {...baseProps} data={ORDER(documentStatus)} {...overrides} />);
  });
  return result;
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('OrderCreateInvoice — confirm modal lifecycle', () => {
  beforeEach(() => {
    // The CO effect's three lookups (shipments, lines, listInvoices) plus the modal's own two.
    // Resolved with empty payloads by default; the "still loading" test below replaces this
    // with a never-settling promise.
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [] } }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not open the confirm modal for an order that is not in draft', async () => {
    await renderActions('CO');
    expect(confirmModal()).not.toBeInTheDocument();

    await dispatchOpenConfirm();

    // `isDraft` gates opening. Confirming an already-completed order would answer
    // @AlreadyPosted@, so the modal must not appear even though the event fired.
    expect(confirmModal()).not.toBeInTheDocument();
  });

  it('keeps the open confirm modal mounted when the order moves to CO', async () => {
    const { rerender } = await renderActions('DR');

    await dispatchOpenConfirm();
    expect(confirmModal()).toBeInTheDocument();

    // What `onRefresh()` does after the order is confirmed: the record comes back as CO. The
    // modal is still where the shipment/invoice outcome is reported, so it must survive.
    await act(async () => {
      rerender(<OrderCreateInvoice {...baseProps} data={ORDER('CO')} />);
    });

    expect(
      confirmModal(),
      'The confirm modal was unmounted by the DR→CO transition. A failed shipment/invoice step '
      + 'is then reported nowhere at all, and the user cannot retry — the draft Confirm button '
      + 'is not rendered in CO either. `isDraft` must gate opening the modal, not keeping it '
      + 'mounted.',
    ).toBeInTheDocument();
  });

  it('keeps the open confirm modal mounted while the CO lookups are still loading', async () => {
    const { rerender } = await renderActions('DR');

    await dispatchOpenConfirm();
    expect(confirmModal()).toBeInTheDocument();

    // The second unmount path, and the one a fix for the gate above does not cover: on reaching
    // CO the component's own effect refetches shipments/lines/invoices, and until those resolve
    // `fetched` is null and `isCompleted && !fetched` returns a spinner-only tree. Anything
    // rendered after that gate — the modal included — is dropped.
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    await act(async () => {
      rerender(<OrderCreateInvoice {...baseProps} data={ORDER('CO')} />);
    });

    expect(
      confirmModal(),
      'The confirm modal was unmounted by the `isCompleted && !fetched` early return while the '
      + 'CO lookups were in flight. The modal must be rendered on that path too.',
    ).toBeInTheDocument();
  });

  it('preserves the confirm modal\'s own state across the DR→CO transition', async () => {
    const { rerender } = await renderActions('DR');
    await dispatchOpenConfirm();

    // Tick "create shipment" — the same state the real flow latches its results in. The
    // checkbox is a proxy for INSTANCE IDENTITY: it is component state, so it survives a
    // re-render and cannot survive a remount.
    await act(async () => {
      screen.getByTestId('sales-order-confirm-shipment-card').click();
    });
    expect(screen.getByText('soConfirmActionShipment')).toBeInTheDocument();

    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    await act(async () => {
      rerender(<OrderCreateInvoice {...baseProps} data={ORDER('CO')} />);
    });

    // A preserved instance still reads "confirm + shipment"; a remounted one reverts to the
    // nothing-selected label because `createShipment` is false again.
    expect(
      screen.queryByText('soConfirmActionShipment'),
      'ConfirmModal was REMOUNTED across the DR→CO transition, so it lost `error`, '
      + '`orderConfirmed`, `shipmentResult` and `invoiceResult`. The retry then re-confirms an '
      + 'already-confirmed order and never retries the step that failed.',
    ).toBeInTheDocument();
  });

  it('closes the confirm modal only through its own close handler', async () => {
    await renderActions('DR');
    await dispatchOpenConfirm();
    expect(confirmModal()).toBeInTheDocument();

    // Cancel is the sibling of the submit button in the modal's footer, and the one documented
    // way out while nothing has been confirmed yet — the counterpart to the tests above, so
    // "survives everything" cannot be satisfied by a modal that never closes.
    await act(async () => {
      screen.getByText('cancel').click();
    });

    expect(confirmModal()).not.toBeInTheDocument();
  });
});

/**
 * Confirm-modal lifecycle of the LIVE purchase-order topbar actions (ETP-5255).
 *
 * ## Which file this tests, and why it is not the sibling
 *
 * There are two `PurchaseOrderActions.jsx`. The one the running window uses is
 * `artifacts/purchase-order/custom/PurchaseOrderActions.jsx` — `customLoaders` in
 * `windows/registry.js` wins over `windowLoaders`, so the live window is
 * `windows/custom/purchase-order/index.jsx`, and it imports the confirm modal from
 * `@generated/purchase-order/custom/PurchaseOrderActions`. That is the module imported below.
 * The `PurchaseOrderActions.vitest.jsx` next to this file imports
 * `../PurchaseOrderActions.jsx`, a different component that does not contain the confirm modal
 * at all — do not add these cases there.
 *
 * ## What this replaces
 *
 * `artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.test.js` used to assert
 * `/\{isDraft && showConfirm && createPortal\(/` against the file's own SOURCE TEXT — the kind
 * of assertion forbidden since ETP-4958. It was worse than merely brittle: it pinned the exact
 * expression that produced a silent failure, so the defect below could not be fixed without
 * "breaking" a green test, and no test anywhere covered the property that actually matters.
 *
 * ## The two properties, and why the second one exists
 *
 * `isDraft` must gate OPENING the modal, and nothing else. Confirming the order moves it DR→CO,
 * and the modal has to outlive that transition because it is the only place the result of the
 * goods-receipt / invoice steps is reported. Two separate render paths dropped it:
 *
 *   1. the `{isDraft && showConfirm && …}` gate — `isDraft` goes false the moment `onRefresh()`
 *      reloads the confirmed record;
 *   2. the `if (isCompleted && !fetched)` early return — on reaching CO, `fetched` is `null`
 *      again until the CO effect's three lookups resolve, so even code after that gate never
 *      ran.
 *
 * With either one in place the modal vanished mid-flow: a failed receipt was reported nowhere —
 * no error, no toast — and there was no way to retry, since the draft Confirm button is not
 * rendered in CO either. Both paths are asserted separately below; a fix that only addresses one
 * leaves the other live, which is exactly what happened once already.
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

const ORDER = (documentStatus) => ({
  id: 'po-lifecycle-1',
  documentNo: 'PO/0001',
  documentStatus,
  grandTotalAmount: 1210,
  summedLineAmount: 1000,
  'currency$_identifier': 'EUR',
  'businessPartner$_identifier': 'Proveedor E2E, S.L.',
});

const baseProps = {
  recordId: 'po-lifecycle-1',
  token: 'tok',
  apiBaseUrl: '/sws/neo/purchase-order',
  onProcess: vi.fn(),
  onRefresh: vi.fn(),
  onSave: vi.fn(),
};

/**
 * The confirm button inside `ConfirmModal` — the only element of that modal carrying a real
 * `data-testid` (`PoCheckboxCard` accepts the prop and never applies it, reported separately).
 * Its presence is the modal's presence.
 */
const confirmModal = () => screen.queryByTestId('action-confirm-modal');

/** The event DetailView's draftMode Confirm button dispatches. This is the real entry point. */
async function dispatchOpenConfirm() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('purchase-order:open-confirm-modal'));
  });
}

/** Renders, awaiting the mount effects so pending fetches are in flight before assertions. */
async function renderActions(documentStatus, overrides = {}) {
  let result;
  await act(async () => {
    result = render(<PurchaseOrderActions {...baseProps} data={ORDER(documentStatus)} {...overrides} />);
  });
  return result;
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('PurchaseOrderActions — confirm modal lifecycle', () => {
  beforeEach(() => {
    // The CO effect's three lookups plus the modal's own two. Resolved with empty payloads by
    // default; the "still loading" test below replaces this with a never-settling promise.
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
    // modal is still where the receipt/invoice outcome is reported, so it must survive.
    await act(async () => {
      rerender(<PurchaseOrderActions {...baseProps} data={ORDER('CO')} />);
    });

    expect(
      confirmModal(),
      'The confirm modal was unmounted by the DR→CO transition. A failed receipt/invoice step is '
      + 'then reported nowhere at all, and the user cannot retry — the draft Confirm button is '
      + 'not rendered in CO either. `isDraft` must gate opening the modal, not keeping it mounted.',
    ).toBeInTheDocument();
  });

  it('keeps the open confirm modal mounted while the CO lookups are still loading', async () => {
    const { rerender } = await renderActions('DR');

    await dispatchOpenConfirm();
    expect(confirmModal()).toBeInTheDocument();

    // The second unmount path, and the one a fix for the gate above does not cover: on reaching
    // CO the component's own effect refetches receipts/lines/invoices, and until those resolve
    // `fetched` is null and `isCompleted && !fetched` returns a spinner-only tree. Anything
    // rendered after that gate — the modal included — is dropped.
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    await act(async () => {
      rerender(<PurchaseOrderActions {...baseProps} data={ORDER('CO')} />);
    });

    expect(
      confirmModal(),
      'The confirm modal was unmounted by the `isCompleted && !fetched` early return while the '
      + 'CO lookups were in flight. The modal must be rendered on that path too.',
    ).toBeInTheDocument();
  });

  /**
   * "Still in the DOM" is not the same as "same instance", and the difference is the whole
   * defect. `confirmPortal` used to sit at a different child index in the
   * `isCompleted && !fetched` early-return fragment than in the main return, so crossing between
   * the two returns made React reconcile it as a NEW element and remount `ConfirmModal` — wiping
   * `error`, `orderConfirmed`, `receiptResult` and `invoiceResult`.
   *
   * The two tests above pass against that, because a remounted modal is still a modal. The
   * damage was the lost state, and it was worse than the unmount it replaced: measured in
   * `e2e/tests/flows/purchase-order-confirm-stale-token.mocked.spec.js`, after a failed goods
   * receipt the reset modal showed no error at all, both checkboxes came back unticked, and
   * pressing Confirm again re-sent `docAction: 'CO'` to an order that was already CO
   * (`@AlreadyPosted@` on a real backend) while never retrying the receipt that actually failed.
   * A re-ticked invoice checkbox would have created a SECOND purchase invoice, since
   * `invoiceResult` was null again.
   *
   * Neither a `key` on the portal nor rendering it from both returns fixes this (both were tried
   * and both failed). What does is not crossing: the loading return yields to an open modal
   * (`isCompleted && !fetched && !showConfirm`), so `confirmPortal` lives at exactly one
   * position.
   *
   * The checkbox is a proxy for identity: it is component state, so it survives a re-render and
   * cannot survive a remount.
   */
  it('preserves the confirm modal\'s own state across the DR→CO transition', async () => {
    const { rerender } = await renderActions('DR');
    await dispatchOpenConfirm();

    // Tick "create goods receipt" — the same state the real flow latches its results in.
    await act(async () => {
      screen.getByText('poCreateReceiptTitle').click();
    });
    expect(screen.getByText('poConfirmActionReceipt')).toBeInTheDocument();

    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    await act(async () => {
      rerender(<PurchaseOrderActions {...baseProps} data={ORDER('CO')} />);
    });

    // A preserved instance still reads "Confirm + receipt"; a remounted one reverts to the
    // nothing-selected label because `createReceipt` is false again.
    expect(
      screen.queryByText('poConfirmActionReceipt'),
      'ConfirmModal was REMOUNTED across the DR→CO transition, so it lost `error`, '
      + '`orderConfirmed`, `receiptResult` and `invoiceResult`. The retry then re-confirms an '
      + 'already-confirmed order and never retries the step that failed.',
    ).toBeInTheDocument();
  });

  it('closes the confirm modal only through its own close handler', async () => {
    await renderActions('DR');
    await dispatchOpenConfirm();
    const button = confirmModal();
    expect(button).toBeInTheDocument();

    // Cancel is the sibling of the confirm button in the modal's footer. Clicking it is the one
    // documented way out while nothing has been confirmed yet — the counterpart to the two tests
    // above, so "survives everything" cannot be satisfied by a modal that never closes.
    await act(async () => {
      screen.getByText('cancel').click();
    });

    expect(confirmModal()).not.toBeInTheDocument();
  });
});

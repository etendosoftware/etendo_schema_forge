// Real-render coverage companion to ConfirmWithCreditButtonBase.test.js (which
// only asserts regex/string matches against the source text and therefore
// contributes zero executed lines to coverage). Mirrors the sibling
// return-material-receipt/__tests__/ConfirmWithCreditButton.spec.jsx convention
// (jsdom render + @testing-library/react against the real component tree).
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockNavigate = vi.fn();
// ETP-5333 follow-up — onRefresh is what DetailView's renderSlotAction actually
// passes to this topbarRight component in production; tests assert against
// this mock instead of window.location.reload, which the component no longer calls.
const mockOnRefresh = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

// Mocks below expose the props needed to exercise ConfirmWithCreditButtonBase's
// own callback wiring (onConfirmed/onClose/onConfirm/navigate) via buttons the
// tests can click directly — the real modals' internals are out of scope here.
vi.mock('@/components/contract-ui/ConfirmInOutModal', () => ({
  // invoiceAction/defaultCreateInvoice are exposed as data-attributes (ETP-4848)
  // so tests can assert what ConfirmWithCreditButtonBase computed and passed down,
  // without needing to render the real modal's internals.
  default: ({ onConfirmed, onClose, invoiceAction, defaultCreateInvoice }) => (
    <div
      data-testid="confirm-inout-modal"
      data-invoice-action={invoiceAction ?? ''}
      data-default-create-invoice={String(defaultCreateInvoice)}
    >
      <button data-testid="confirm-inout-confirm-with-id" onClick={() => onConfirmed({ invoice: { id: 'INV-1', documentNo: 'FC-001', amount: 100 } })} />
      <button data-testid="confirm-inout-confirm-no-id" onClick={() => onConfirmed({ invoice: {} })} />
      <button data-testid="confirm-inout-close" onClick={onClose} />
    </div>
  ),
}));

vi.mock('@/components/contract-ui/ConfirmResultModal', () => ({
  ConfirmResultModal: ({ navigate, onClose }) => (
    <div data-testid="confirm-result-modal">
      <button data-testid="result-navigate" onClick={() => navigate('/some/route')} />
      <button data-testid="result-close" onClick={onClose} />
    </div>
  ),
}));

// ETP-5333 — the mock exposes `loading` (forwarded by ConfirmWithCreditButtonBase
// as `loading={creatingInvoice}`) so tests can assert the modal shows the
// processing label and a disabled confirm button while the request is in
// flight, and stays mounted until it resolves — mirroring the real
// CreateInvoiceConfirmModal's own loading contract.
vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: ({ onConfirm, onClose, loading }) => (
    <div data-testid="create-invoice-confirm-modal">
      <button data-testid="create-invoice-confirm" onClick={onConfirm} disabled={loading}>
        {loading ? 'soProcessing' : 'soCreateDocsBtn'}
      </button>
      <button data-testid="create-invoice-close" onClick={onClose} disabled={loading} />
    </div>
  ),
}));

import ConfirmWithCreditButtonBase from '../ConfirmWithCreditButtonBase.jsx';

const CONFIRM_EVENT = 'some-window:open-confirm-modal';

const BASE_PROPS = {
  recordId: 'REC-001',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/some-window',
  entitySegment: 'someWindow',
  invoiceRoute: '/sales-invoice/',
  invoiceType: 'facturaVenta',
  invoiceCreatedTitleKey: 'invoiceCreatedTitle',
  generatePdfFn: vi.fn(),
  getPdfLabelsFn: () => ({}),
  specName: 'some-window',
  entityName: 'someWindow',
  onRefresh: mockOnRefresh,
  confirmEventName: CONFIRM_EVENT,
};

// ETP-5408 — the Borrador "Confirmar" is the GENERIC draftMode Confirm rendered by
// DetailView (saveActions.jsx); the window's draftMode.onConfirm dispatches this event
// and ConfirmWithCreditButtonBase only listens for it. Tests drive the confirm flow
// exactly the way production does: by dispatching the event on `window`.
function fireConfirm(eventName = CONFIRM_EVENT) {
  act(() => { window.dispatchEvent(new CustomEvent(eventName)); });
}

describe('ConfirmWithCreditButtonBase — postConfirmButtonLabel (ETP-4737)', () => {
  it('falls back to ui("createReturnInvoice") when postConfirmButtonLabel is not provided', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    const btn = screen.getByTestId('action-create-return-invoice');
    expect(btn).toHaveTextContent('createReturnInvoice');
  });

  it('renders the caller-provided postConfirmButtonLabel as the button text instead of the default', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
        postConfirmButtonLabel="Crear Factura Rectificativa"
      />
    );
    const btn = screen.getByTestId('action-create-return-invoice');
    expect(btn).toHaveTextContent('Crear Factura Rectificativa');
    expect(btn).not.toHaveTextContent('createReturnInvoice');
  });

  it('does not render the post-confirm button at all when status is CO but hasReturnInvoice is true', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: true }}
        postConfirmButtonLabel="Crear Factura Rectificativa"
      />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('does not render the post-confirm button in DR status, regardless of postConfirmButtonLabel', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
        postConfirmButtonLabel="Crear Factura Rectificativa"
      />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
    // ETP-5408: and no Borrador confirm button of its own either — that is the generic
    // draftMode Confirm (`action-save`) rendered by DetailView, not by this component.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

// ETP-4728 — print unification. PrintButton no longer exists: printing is
// served exclusively by the generic icon-only print flow in DetailView.jsx /
// DocumentPrintDrawer.jsx. This component must never regrow it.
// ── ETP-5381 — a DRAFT rectificative invoice already counts as "invoiced" ─────────
// The duplicate-invoice gate lives entirely in the shared layer: useConfirmWithCredit
// derives hasReturnInvoice and ConfirmWithCreditButtonBase renders the create button
// only for `status === 'CO' && !hasReturnInvoice`. Every return window reaches it
// through a thin wrapper, so this matrix belongs here once, not per window.
//
// The DR case is deliberately inverted from what it used to assert. It used to demand
// the button stay VISIBLE while a rectificative invoice sat in DR, which is precisely
// how a second one got created: a draft reserves nothing (C_Invoice_Post is what raises
// qtyinvoiced / isinvoiced), so the same return document could be invoiced twice. The
// gate now mirrors the server-side duplicate guard — any non-voided invoice hides the
// button, and only a voided one is treated as if it were never issued.
describe('ConfirmWithCreditButtonBase — duplicate-invoice gate, returnInvoices array fallback (ETP-5381)', () => {
  const co = (extra) => ({ documentStatus: 'CO', ...extra });

  it('hides the create button when a DRAFT return invoice already exists', () => {
    render(
      <ConfirmWithCreditButtonBase {...BASE_PROPS} data={co({ returnInvoices: [{ documentStatus: 'DR' }] })} />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('hides the create button when a COMPLETED return invoice already exists', () => {
    render(
      <ConfirmWithCreditButtonBase {...BASE_PROPS} data={co({ returnInvoices: [{ documentStatus: 'CO' }] })} />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('hides the create button when only one entry of a mixed list is non-voided', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={co({ returnInvoices: [{ documentStatus: 'VO' }, { documentStatus: 'DR' }] })}
      />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('still shows the create button when every invoice in the list is VOIDED', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={co({ returnInvoices: [{ documentStatus: 'VO' }, { documentStatus: 'VO' }] })}
      />
    );
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });

  it('still shows the create button when returnInvoices is an empty array', () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={co({ returnInvoices: [] })} />);
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });

  it('still shows the create button when neither the flag nor the array is present', () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={co()} />);
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });

  it('lets the explicit backend flag win over the array: flag true + VO-only list hides the button', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={co({ hasReturnInvoice: true, returnInvoices: [{ documentStatus: 'VO' }] })}
      />
    );
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });

  it('lets the explicit backend flag win over the array: flag false + DRAFT list shows the button', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={co({ hasReturnInvoice: false, returnInvoices: [{ documentStatus: 'DR' }] })}
      />
    );
    expect(screen.getByTestId('action-create-return-invoice')).toBeInTheDocument();
  });
});

describe('ConfirmWithCreditButtonBase — no private PrintButton (ETP-4728)', () => {
  it('does not render a print button in any status', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    expect(screen.queryByText('print')).not.toBeInTheDocument();

    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    expect(screen.queryAllByText('print').length).toBe(0);
  });
});

// ETP-4737 round 3 — modal open/close/confirm callback wiring. These lines
// were previously untouched because no existing test ever clicked the action
// buttons or drove the mocked modals' own callback props.
describe('ConfirmWithCreditButtonBase — modal open/close/confirm wiring', () => {
  let originalLocation;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockOnRefresh.mockClear();
    // window.location.reload is non-configurable in jsdom — replace location,
    // matching the established pattern in useServiceWorker.vitest.jsx.
    originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, reload: vi.fn() };
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: { id: 'RET-1', documentNo: 'FC-002', grandTotalAmount: 50 } } }),
    }));
  });

  afterEach(() => {
    delete window.location;
    window.location = originalLocation;
  });

  it('opens ConfirmInOutModal when the confirm event is dispatched in Borrador', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument());
  });

  // ETP-5408: the empty-document gate belongs to the generic Confirm button
  // (draftMode.disableWhenEmpty, which reads the LIVE lines). The listener must not
  // re-check the header's linesCount — it can lag right after the first line is added,
  // and an enabled Confirm that silently does nothing is worse than no gate here.
  it('opens ConfirmInOutModal even when the header linesCount is 0 (lines gate lives in the button)', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 0 }}
      />
    );
    fireConfirm();
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
  });

  it('opens CreateInvoiceConfirmModal when the CO post-confirm button is clicked', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
    expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
  });

  it('closes ConfirmInOutModal without producing a result when its onClose fires', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('confirm-inout-close'));
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
  });

  it('closes ConfirmInOutModal and shows the result modal when onConfirmed resolves an invoice with an id', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-confirm-with-id')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-with-id'));

    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('closes ConfirmInOutModal and calls onRefresh (no result modal, no reload) when onConfirmed resolves an invoice without an id (ETP-5333 follow-up)', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-confirm-no-id')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-no-id'));

    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('closes CreateInvoiceConfirmModal without calling the return-invoice flow when its onClose fires', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false }}
      />
    );
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
    fireEvent.click(screen.getByTestId('create-invoice-close'));

    expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('triggers the return-invoice creation flow when onConfirm fires, and closes CreateInvoiceConfirmModal only once the request resolves (ETP-5333)', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false, id: 'REC-001' }}
      />
    );
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
    fireEvent.click(screen.getByTestId('create-invoice-confirm'));

    // ETP-5333 — the modal must NOT close synchronously on click anymore: it
    // stays mounted (with loading feedback) until the request settles.
    expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/action/createReturnInvoice');
    await waitFor(() => expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument());
  });

  it('marks the result as navigated and calls navigate when the result modal fires its primary action, and does not reload on close afterwards', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-confirm-with-id')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-with-id'));
    expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-navigate'));
    expect(mockNavigate).toHaveBeenCalledWith('/some/route');

    fireEvent.click(screen.getByTestId('result-close'));
    await waitFor(() => expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument());
    // setTimeout(0) inside onClose checks resultNavigatedRef — give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(mockOnRefresh).not.toHaveBeenCalled();
  });

  it('calls onRefresh (not a reload) after closing the result modal when the user did not navigate away first (ETP-5333 follow-up)', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-confirm-with-id')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-inout-confirm-with-id'));
    expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-close'));
    await waitFor(() => expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument());
    await waitFor(() => expect(mockOnRefresh).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});

// ETP-5333 — regression coverage. Before the fix, ConfirmWithCreditButtonBase's
// inline onConfirm handler closed CreateInvoiceConfirmModal SYNCHRONOUSLY on
// click (`() => { setShowModal(false); handleCreateReturnInvoice(); }`), before
// the createReturnInvoice request even started — the modal vanished with no
// loading feedback, then a second (result) modal popped up later once the
// request resolved. The fix moved `setShowModal(false)` inside
// `handleCreateReturnInvoice`'s SUCCESS branch (useConfirmWithCredit.js), right
// before `setResult(...)`, and simplified onConfirm to just
// `handleCreateReturnInvoice` — so the modal now stays mounted (showing
// `loading={creatingInvoice}`) for the whole request, matching
// ConfirmInOutModal's pre-existing behavior. These tests use a manually
// resolvable/rejectable deferred fetch promise to assert the mid-flight state,
// which the previous synchronous-close behavior made impossible to observe.
describe('ConfirmWithCreditButtonBase — CreateInvoiceConfirmModal stays open during the async request (ETP-5333)', () => {
  let originalLocation;

  beforeEach(() => {
    mockNavigate.mockClear();
    mockOnRefresh.mockClear();
    originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, reload: vi.fn() };
  });

  afterEach(() => {
    delete window.location;
    window.location = originalLocation;
  });

  function openCoModal() {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'CO', hasReturnInvoice: false, id: 'REC-001' }}
      />
    );
    fireEvent.click(screen.getByTestId('action-create-return-invoice'));
  }

  it('regression: stays mounted and shows the loading label with a disabled confirm button before the request resolves', async () => {
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    openCoModal();

    fireEvent.click(screen.getByTestId('create-invoice-confirm'));

    // The bug: previously the modal unmounted here, synchronously, before the
    // request even started.
    expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('create-invoice-confirm')).toHaveTextContent('soProcessing'));
    expect(screen.getByTestId('create-invoice-confirm')).toBeDisabled();

    // Cleanup: let the pending promise settle so it doesn't leak into other tests.
    await act(async () => {
      resolveFetch({ ok: true, json: () => Promise.resolve({ response: { data: {} } }) });
    });
  });

  it('on success: the modal disappears and the result modal appears with the invoice data', async () => {
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    openCoModal();
    fireEvent.click(screen.getByTestId('create-invoice-confirm'));
    await waitFor(() => expect(screen.getByTestId('create-invoice-confirm')).toHaveTextContent('soProcessing'));

    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ response: { data: { id: 'RET-1', documentNo: 'FC-002', grandTotalAmount: 50 } } }),
      });
    });

    expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();
  });

  it('on failure: the modal stays open, returns to the idle label, and toast.error is called — no result modal', async () => {
    let rejectFetch;
    globalThis.fetch = vi.fn(() => new Promise((_resolve, reject) => { rejectFetch = reject; }));
    openCoModal();
    fireEvent.click(screen.getByTestId('create-invoice-confirm'));
    await waitFor(() => expect(screen.getByTestId('create-invoice-confirm')).toHaveTextContent('soProcessing'));

    await act(async () => {
      rejectFetch(new Error('Network error'));
    });

    expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('create-invoice-confirm')).toHaveTextContent('soCreateDocsBtn');
    expect(screen.getByTestId('create-invoice-confirm')).not.toBeDisabled();
    expect(toast.error).toHaveBeenCalledWith('Network error');
    expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
  });

  it('rapid double-click on the confirm button while a request is in flight results in exactly one POST call', async () => {
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    openCoModal();

    fireEvent.click(screen.getByTestId('create-invoice-confirm'));
    fireEvent.click(screen.getByTestId('create-invoice-confirm'));

    await waitFor(() => expect(screen.getByTestId('create-invoice-confirm')).toHaveTextContent('soProcessing'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch({ ok: true, json: () => Promise.resolve({ response: { data: {} } }) });
    });
  });
});

// ETP-4848 — DR-status confirm modal must default-check the invoice option
// whenever the document is not yet fully invoiced (isFullyInvoiced = parseFloat
// (data?.invoiceStatus ?? 0) >= 100), and must hide the invoice option entirely
// (invoiceAction=undefined) once it is fully invoiced.
describe('ConfirmWithCreditButtonBase — DR confirm modal invoice gating by invoiceStatus (ETP-4848)', () => {
  it('passes invoiceAction="createReturnInvoice" and defaultCreateInvoice=true when invoiceStatus is partial (40)', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2, invoiceStatus: 40 }}
      />
    );
    fireConfirm();
    const modal = await waitFor(() => screen.getByTestId('confirm-inout-modal'));
    expect(modal).toHaveAttribute('data-invoice-action', 'createReturnInvoice');
    expect(modal).toHaveAttribute('data-default-create-invoice', 'true');
  });

  it('passes invoiceAction="createReturnInvoice" and defaultCreateInvoice=true when invoiceStatus is unset', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    fireConfirm();
    const modal = await waitFor(() => screen.getByTestId('confirm-inout-modal'));
    expect(modal).toHaveAttribute('data-invoice-action', 'createReturnInvoice');
    expect(modal).toHaveAttribute('data-default-create-invoice', 'true');
  });

  it('passes invoiceAction=undefined and defaultCreateInvoice=false when invoiceStatus is 100 (number)', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2, invoiceStatus: 100 }}
      />
    );
    fireConfirm();
    const modal = await waitFor(() => screen.getByTestId('confirm-inout-modal'));
    expect(modal).toHaveAttribute('data-invoice-action', '');
    expect(modal).toHaveAttribute('data-default-create-invoice', 'false');
  });

  it('passes invoiceAction=undefined and defaultCreateInvoice=false when invoiceStatus is "100" (string, real API shape)', async () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2, invoiceStatus: '100' }}
      />
    );
    fireConfirm();
    const modal = await waitFor(() => screen.getByTestId('confirm-inout-modal'));
    expect(modal).toHaveAttribute('data-invoice-action', '');
    expect(modal).toHaveAttribute('data-default-create-invoice', 'false');
  });
});

// ETP-4940 follow-up, re-homed by ETP-5408. A header edit made without clicking Save
// used to be silently discarded because this component fired its own documentAction
// POST. The save-before-confirm now lives in ONE place: the generic runDraftModeConfirm
// (saveActions.jsx) calls maybeSaveBeforeConfirm BEFORE draftMode.onConfirm dispatches
// the event. The listener here must therefore never save again — a second save would be
// a second PATCH racing the first. Stray save props are passed on purpose to prove they
// are ignored.
describe('ConfirmWithCreditButtonBase — the confirm listener never saves (ETP-5408 / ETP-4940)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });

  it('opens the modal without calling onSave, even when isDirty is true', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'REC-001' });
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
        isDirty
        onSave={onSave}
      />
    );
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('issues no network request when the event opens the modal (no PATCH, no documentAction POST)', async () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={{ documentStatus: 'DR', linesCount: 2 }} />);
    fireConfirm();
    await waitFor(() => expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// ETP-5408 — the Borrador "Confirmar" was a hand-rolled button in this component: the
// only Confirmar in the product without the checkmark Facturas / Pedidos / Albaranes
// show. It now renders through the GENERIC draftMode Confirm (saveActions.jsx,
// `action-save`, with its Check icon); this component renders NO Borrador button and
// only reacts to the window's confirm event. The generic button covers its own
// rendering/icon/gate tooltip (DetailView.saveActions / saveButtons vitest suites);
// what is locked here is the listener contract.
const DR_DATA = { documentStatus: 'DR', linesCount: 2 };

describe('ConfirmWithCreditButtonBase — no bespoke Borrador confirm button (ETP-5408)', () => {
  it('renders no button at all in Borrador (the Confirm is the generic draftMode one)', () => {
    const { container } = render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} />);
    expect(container.querySelector('button')).toBeNull();
    expect(screen.queryByTestId('action-confirm-with-credit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  it('still renders extraActions in Borrador (the slot is independent of the removed button)', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={DR_DATA}
        extraActions={<span data-testid="extra-action" />}
      />
    );
    expect(screen.getByTestId('extra-action')).toBeInTheDocument();
  });
});

describe('ConfirmWithCreditButtonBase — confirm event listener (ETP-5408)', () => {
  const GATE = { blocked: true, title: 'saveMissingRequired: Business Partner' };

  it('opens ConfirmInOutModal on the configured event', () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} />);
    fireConfirm();
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
  });

  it('ignores an event with a different name (each window listens to its own)', () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} />);
    fireConfirm('other-window:open-confirm-modal');
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  it('does nothing when no confirmEventName is supplied', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} confirmEventName={undefined} data={DR_DATA} />);
    expect(addSpy.mock.calls.some(([name]) => name === CONFIRM_EVENT)).toBe(false);
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    addSpy.mockRestore();
  });

  // ETP-4933 guard: the generic Confirm already honours saveGate, but the listener
  // re-checks it so an event from anywhere else cannot confirm an incomplete record.
  it('does not open the modal while the required-field gate blocks it', () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} saveGate={GATE} />);
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  it('opens the modal when saveGate is present but not blocking', () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} saveGate={{ blocked: false }} />);
    fireConfirm();
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
  });

  it('opens nothing on a completed document (neither the confirm nor the create-invoice modal)', () => {
    render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={{ documentStatus: 'CO', hasReturnInvoice: false }} />);
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
  });

  it('opens nothing on a status outside DR/CO (listener registered, handler bails out)', () => {
    const { container } = render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={{ documentStatus: 'VO' }} />);
    fireConfirm();
    expect(container).toBeEmptyDOMElement();
  });

  // The effect depends on status / saveBlocked: a stale closure would keep acting on
  // the values of the first render.
  it('follows status changes: after the record becomes CO the event no longer opens the modal', () => {
    const { rerender } = render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} />);
    rerender(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={{ documentStatus: 'CO', hasReturnInvoice: true }} />);
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  it('follows the gate state: once saveGate unblocks, the event opens the modal', () => {
    const { rerender } = render(
      <ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} saveGate={GATE} />
    );
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    rerender(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} saveGate={{ blocked: false }} />);
    fireConfirm();
    expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
  });

  it('follows the gate state the other way: a gate that closes after mount blocks the event', () => {
    const { rerender } = render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} />);
    rerender(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} saveGate={GATE} />);
    fireConfirm();
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
  });

  it('removes its listener on unmount (the same handler it registered)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<ConfirmWithCreditButtonBase {...BASE_PROPS} data={DR_DATA} />);
    const added = addSpy.mock.calls.filter(([name]) => name === CONFIRM_EVENT).map(([, fn]) => fn);
    expect(added.length).toBeGreaterThan(0);
    const current = added[added.length - 1];

    unmount();
    expect(removeSpy).toHaveBeenCalledWith(CONFIRM_EVENT, current);
    // And a late event after unmount is a harmless no-op.
    expect(() => fireConfirm()).not.toThrow();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('ConfirmWithCreditButtonBase — respects isDocumentReadOnly (ETP-5205)', () => {
  it('disables the Confirm button when isDocumentReadOnly is true, with no other block active', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
        isDocumentReadOnly
      />
    );
    expect(screen.getByTestId('action-confirm-with-credit')).toBeDisabled();
  });

  it('regression: the Confirm button stays enabled when isDocumentReadOnly is false/absent', () => {
    render(
      <ConfirmWithCreditButtonBase
        {...BASE_PROPS}
        data={{ documentStatus: 'DR', linesCount: 2 }}
      />
    );
    expect(screen.getByTestId('action-confirm-with-credit')).not.toBeDisabled();
  });
});

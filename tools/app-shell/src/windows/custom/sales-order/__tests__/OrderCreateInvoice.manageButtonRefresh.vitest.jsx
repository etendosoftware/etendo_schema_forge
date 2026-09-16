/**
 * ETP-5315 (Bug 2) — the "Gestionar envío y factura" topbar button must disappear (or downgrade
 * to a single-action label) once the pending shipment/invoice is actually created through it,
 * WITHOUT the user having to leave and re-enter the record.
 *
 * ## The bug
 *
 * `OrderCreateInvoice` (this file, imported the same way as its confirm-modal-lifecycle sibling
 * — see that file's header comment for why `@generated/...` is the live module) loads `fetched`
 * (shipments/invoices/orderLines) once via a `useEffect` keyed on
 * `[isCompleted, recordId, base, headers, apiBaseUrl]` — none of which change when
 * `ConfirmModal`/`CreateDocsModal` create a shipment or invoice. Both already dispatch
 * `window.dispatchEvent(new CustomEvent('sales-order:document-created'))` on success, but this
 * component never listened for its own event, so `buttonLabel` (derived from the stale
 * `fetched`) kept showing "Gestionar envío y factura" after the user had just used it — inviting
 * a second, duplicate shipment/invoice. Switching Grilla→Formulario and back "fixed" it only
 * because that remounts the component and reloads `fetched` from scratch.
 *
 * ## The fix
 *
 * A `refreshKey` counter, bumped by a `sales-order:document-created` listener and added to the
 * fetch effect's dependency array — the exact pattern already used by the sibling
 * `OrderDraftChips.jsx` (topbarExtra) for the same event, and mirroring the purchase-order twin's
 * fix in `GeneratedPurchaseOrderActions.manageButtonRefresh.vitest.jsx`.
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

async function renderActions(phaseRef) {
  installFetchMock(phaseRef);
  let result;
  await act(async () => {
    result = render(<OrderCreateInvoice {...baseProps} data={ORDER} />);
  });
  return result;
}

/**
 * Deferred fetch mock for the race-guard test below: each Promise.all triggered by the CO effect
 * is a "batch" of 3 calls (goods-shipment, /lines?, listInvoices) grouped by call order (they fire
 * synchronously and in that order every effect run). Nothing resolves until `resolveBatch` is
 * called explicitly, so a test can start several refetches and control the ORDER in which they
 * settle — independent of the order they were started in.
 */
function installRaceFetchMock() {
  const batches = [];
  let callIndex = 0;
  globalThis.fetch = vi.fn((url) => {
    if (callIndex % 3 === 0) batches.push({});
    const batch = batches[batches.length - 1];
    const key = url.includes('goods-shipment') ? 'shipment' : url.includes('/lines?') ? 'lines' : 'invoice';
    callIndex += 1;
    return new Promise((resolve) => {
      batch[key] = (data) => resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
    });
  });
  return {
    resolveBatch(index, { shipments = [], lines = [], invoices = [] } = {}) {
      const batch = batches[index];
      batch.shipment(shipments);
      batch.lines(lines);
      batch.invoice(invoices);
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('OrderCreateInvoice — "Gestionar" button refreshes after document creation (ETP-5315)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the combined manage label while both a shipment and an invoice are still pending', async () => {
    const phaseRef = { value: 'pending' };
    await renderActions(phaseRef);

    expect(screen.getByText('soManageShipmentAndInvoice')).toBeInTheDocument();
  });

  it('hides the manage button after sales-order:document-created fires and the refetch finds nothing pending', async () => {
    const phaseRef = { value: 'pending' };
    await renderActions(phaseRef);
    expect(screen.getByText('soManageShipmentAndInvoice')).toBeInTheDocument();

    // Simulate the real flow: ConfirmModal/CreateDocsModal just created the shipment and
    // invoice, the backend state is now settled, and they dispatched the event.
    phaseRef.value = 'done';
    await act(async () => {
      window.dispatchEvent(new CustomEvent('sales-order:document-created'));
    });

    expect(
      screen.queryByText('soManageShipmentAndInvoice'),
      'The button kept showing the combined label after the event — the component never '
      + 'refetched `fetched` in reaction to sales-order:document-created.',
    ).not.toBeInTheDocument();
    expect(screen.queryByText('soManageShipment')).not.toBeInTheDocument();
    expect(screen.queryByText('soManageInvoice')).not.toBeInTheDocument();
  });

  it('downgrades to the single-action label when only the invoice is still pending after the event', async () => {
    const phaseRef = { value: 'pending' };
    await renderActions(phaseRef);
    expect(screen.getByText('soManageShipmentAndInvoice')).toBeInTheDocument();

    // Only the shipment got created; the invoice is still outstanding.
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('goods-shipment')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      if (url.includes('/lines?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: { data: [{ orderedQuantity: 10, deliveredQuantity: 10 }] } }),
        });
      }
      if (url.includes('listInvoices')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('sales-order:document-created'));
    });

    expect(screen.queryByText('soManageShipmentAndInvoice')).not.toBeInTheDocument();
    expect(screen.getByText('soManageInvoice')).toBeInTheDocument();
  });

  it('does not let a stale in-flight refetch overwrite a newer one when the event fires twice in a row (race guard)', async () => {
    // Realistic trigger: the user creates the shipment via ConfirmModal (dispatch #1 starts a
    // refetch), then — before that refetch settles — creates the invoice via CreateDocsModal too
    // (dispatch #2 starts a second refetch). Both are in flight; only the SECOND must ever win.
    const race = installRaceFetchMock();
    let result;
    await act(async () => {
      result = render(<OrderCreateInvoice {...baseProps} data={ORDER} />);
    });
    await act(async () => {
      race.resolveBatch(0, { lines: [{ orderedQuantity: 10, deliveredQuantity: 0 }] }); // mount: both pending
    });
    expect(screen.getByText('soManageShipmentAndInvoice')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('sales-order:document-created')); // refreshKey 0→1, batch[1] starts
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent('sales-order:document-created')); // refreshKey 1→2, batch[2] starts
      // batch[1]'s effect cleanup ran synchronously above and flipped ITS `cancelled` closure to
      // true — batch[1] resolving after this point must be a no-op regardless of timing.
    });

    // Settle the LATEST refetch (batch 2) first with "everything resolved" data, then settle the
    // STALE one (batch 1) afterwards with contradicting "still pending" data. If the effect's
    // `cancelled` guard were not correctly scoped per refreshKey run, the late-resolving stale
    // batch would win and wrongly bring the button back.
    await act(async () => {
      race.resolveBatch(2, {
        lines: [{ orderedQuantity: 10, deliveredQuantity: 10 }],
        invoices: [{ documentStatus: 'CO', grandTotalAmount: 1000 }],
      });
    });
    await act(async () => {
      race.resolveBatch(1, { lines: [{ orderedQuantity: 10, deliveredQuantity: 0 }] }); // stale — must be ignored
    });

    expect(
      screen.queryByText('soManageShipmentAndInvoice'),
      'The stale batch-1 refetch overwrote the newer batch-2 result after resolving out of order '
      + '— the fetch effect\'s `cancelled` guard did not protect the refreshKey-triggered refetch.',
    ).not.toBeInTheDocument();
  });

  it('removes the sales-order:document-created listener on unmount', async () => {
    const phaseRef = { value: 'pending' };
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = await renderActions(phaseRef);

    unmount();

    expect(
      removeSpy.mock.calls.some(([eventName]) => eventName === 'sales-order:document-created'),
      'unmount did not remove the sales-order:document-created listener — a leaked listener keeps '
      + 'bumping refreshKey (and refetching) for a component instance that no longer exists.',
    ).toBe(true);

    removeSpy.mockRestore();
  });
});

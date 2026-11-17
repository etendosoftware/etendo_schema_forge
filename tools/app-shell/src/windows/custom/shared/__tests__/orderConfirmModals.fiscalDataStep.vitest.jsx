// @covers artifacts/sales-order/custom/OrderCreateInvoice.jsx
// @covers artifacts/purchase-order/custom/PurchaseOrderActions.jsx
/**
 * ETP-6179 — the "Datos fiscales" step in the two order windows' invoice-creating modals:
 *   - ConfirmModal (draft order: confirm + optionally create shipment/receipt and invoice);
 *   - CreateDocsModal (completed order: create the pending documents).
 *
 * What must hold, on both windows (they are twins: same flow, different spec and actions):
 *   - the step shows only when the sifDefaults preview lists an active fiscal system;
 *   - nothing is written before the step's final confirm — the order is NOT confirmed (ConfirmModal)
 *     and no invoice is created while the user is on the step, and Cancelar writes nothing;
 *   - "Atrás" returns to the first screen and keeps the edits;
 *   - the invoice POST carries `sifFields` (the edited values) only after the final confirm;
 *   - a preview that fails is skipped: the flow goes on without the step and without `sifFields`.
 *
 * The modals are named exports, rendered directly; requests are observed at the `fetch` boundary
 * `useApiFetch` ends in, like the sibling per-window suites do.
 */
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
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
vi.mock('@/lib/surveys/survey-state.js', () => ({ incrementSurveyCounter: vi.fn() }));
vi.mock('@/lib/surveys/survey-engine.js', () => ({ emitSurveyTrigger: vi.fn() }));
vi.mock('@/lib/observability/health-events.js', () => ({
  trackTransactionPosted: vi.fn(),
  trackDocumentCreated: vi.fn(),
}));

import {
  ConfirmModal as SalesConfirmModal,
  CreateDocsModal as SalesCreateDocsModal,
} from '@generated/sales-order/custom/OrderCreateInvoice';
import {
  ConfirmModal as PurchaseConfirmModal,
  CreateDocsModal as PurchaseCreateDocsModal,
} from '@generated/purchase-order/custom/PurchaseOrderActions';

const PREVIEW = {
  systems: ['SII'],
  rectificative: false,
  fields: { etsgDateOperation: '2026-11-10', aeatsiiDescripcionSii: 'Compra' },
  fieldSpecs: [
    { name: 'etsgDateOperation', system: 'SII', type: 'date' },
    { name: 'aeatsiiDescripcionSii', system: 'SII', type: 'text' },
  ],
  siiAuthorizationAvailable: false,
};
const NO_SYSTEMS = { systems: [], fields: {}, fieldSpecs: [] };

const ORDER = {
  id: 'ord-1', documentNo: 'ORD/0001', documentStatus: 'DR', grandTotalAmount: 500,
  summedLineAmount: 500, 'currency$_identifier': 'EUR', 'businessPartner$_identifier': 'Acme',
};

let sifAnswer;

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

function installFetch() {
  globalThis.fetch = vi.fn((url, init = {}) => {
    const u = String(url);
    if (u.includes('/action/sifDefaults')) return sifAnswer();
    if (init.method === 'POST') {
      return jsonResponse({ response: { data: { id: 'doc-1', documentNo: 'DOC-1', documentStatus: 'CO' } } });
    }
    // Record / lines lookups and draft pre-checks.
    return jsonResponse({ response: { data: [] } });
  });
}

const posts = () => globalThis.fetch.mock.calls
  .filter(([, init]) => init?.method === 'POST')
  .map(([u, init]) => ({ action: String(u).split('/action/')[1], body: init.body ? JSON.parse(init.body) : undefined }));
const postsTo = (action) => posts().filter(p => p.action === action);
const okPreview = (data) => () => jsonResponse({ response: { data } });

describe.each([
  {
    name: 'sales-order',
    ConfirmModal: SalesConfirmModal,
    CreateDocsModal: SalesCreateDocsModal,
    apiBaseUrl: '/sws/neo/sales-order',
    invoiceCard: 'sales-order-confirm-invoice-card',
    invoiceLabel: 'soConfirmActionInvoice',
    invoiceAction: 'createDraftInvoice',
    otherCard: 'sales-order-confirm-shipment-card',
    otherLabel: 'soConfirmActionShipment',
    otherAction: 'createShipment',
    confirmBackId: 'sales-order-confirm-sif-back',
    docsBackId: 'sales-order-manage-docs-sif-back',
    derived: {
      needsShip: false, needsInvoice: true, qtyOrdered: 10, qtyDelivered: 10, qtyPending: 0,
      totalOrder: 500, totalInvoiced: 0, totalPending: 500,
    },
  },
  {
    name: 'purchase-order',
    ConfirmModal: PurchaseConfirmModal,
    CreateDocsModal: PurchaseCreateDocsModal,
    apiBaseUrl: '/sws/neo/purchase-order',
    invoiceCard: 'purchase-order-confirm-invoice-card',
    invoiceLabel: 'poConfirmActionInvoice',
    invoiceAction: 'createPurchaseInvoice',
    otherCard: 'purchase-order-confirm-receipt-card',
    otherLabel: 'poConfirmActionReceipt',
    otherAction: 'createGoodsReceipt',
    confirmBackId: 'purchase-order-confirm-sif-back',
    docsBackId: 'purchase-order-docs-sif-back',
    derived: {
      needsReceipt: false, needsInvoice: true, qtyOrdered: 10, qtyDelivered: 10, qtyPending: 0,
      totalOrder: 500, totalInvoiced: 0, totalPending: 500,
    },
  },
])('$name — fiscal data step (ETP-6179)', (w) => {
  beforeEach(() => {
    vi.clearAllMocks();
    sifAnswer = okPreview(PREVIEW);
    installFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ConfirmModal', () => {
    async function renderConfirm({ withInvoice = true } = {}) {
      const props = { onClose: vi.fn(), onConfirmed: vi.fn(), onRefresh: vi.fn() };
      await act(async () => {
        render(<w.ConfirmModal orderId="ord-1" data={ORDER} apiBaseUrl={w.apiBaseUrl} {...props} />);
      });
      if (withInvoice) fireEvent.click(screen.getByTestId(w.invoiceCard));
      return props;
    }
    const primary = (label = w.invoiceLabel) => screen.getByRole('button', { name: label });

    it('shows the step before confirming the order, and writes nothing yet', async () => {
      const { onConfirmed } = await renderConfirm();
      fireEvent.click(primary());

      await screen.findByTestId('invoice-sif-step');
      expect(screen.getByText('invoiceSifStep.title')).toBeInTheDocument();
      expect(screen.queryByTestId(w.invoiceCard)).not.toBeInTheDocument();
      expect(postsTo('sifDefaults')).toHaveLength(1);
      expect(postsTo('documentAction')).toHaveLength(0);
      expect(postsTo(w.invoiceAction)).toHaveLength(0);
      expect(onConfirmed).not.toHaveBeenCalled();
    });

    it('the final confirm completes the order, then sends the edited values as sifFields', async () => {
      const { onConfirmed } = await renderConfirm();
      fireEvent.click(primary());
      await screen.findByTestId('invoice-sif-step');
      fireEvent.change(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii'), { target: { value: 'Editada' } });
      fireEvent.click(primary());

      await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
      expect(posts().map(p => p.action)).toEqual(['sifDefaults', 'documentAction', w.invoiceAction]);
      expect(postsTo(w.invoiceAction)[0].body).toEqual({
        sifFields: { ...PREVIEW.fields, aeatsiiDescripcionSii: 'Editada' },
      });
    });

    it('Atrás returns to the first screen with the edits kept, and confirms nothing', async () => {
      await renderConfirm();
      fireEvent.click(primary());
      await screen.findByTestId('invoice-sif-step');
      fireEvent.change(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii'), { target: { value: 'Editada' } });

      fireEvent.click(screen.getByTestId(w.confirmBackId));
      expect(screen.queryByTestId('invoice-sif-step')).not.toBeInTheDocument();
      expect(screen.getByTestId(w.invoiceCard)).toBeInTheDocument();

      fireEvent.click(primary());
      await screen.findByTestId('invoice-sif-step');
      expect(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii')).toHaveValue('Editada');
      expect(postsTo('sifDefaults')).toHaveLength(1);
      expect(postsTo('documentAction')).toHaveLength(0);
    });

    it('Cancelar on the step closes without confirming the order', async () => {
      const { onClose } = await renderConfirm();
      fireEvent.click(primary());
      await screen.findByTestId('invoice-sif-step');
      fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(postsTo('documentAction')).toHaveLength(0);
      expect(postsTo(w.invoiceAction)).toHaveLength(0);
    });

    it('never asks for the preview when no invoice is requested', async () => {
      const { onConfirmed } = await renderConfirm({ withInvoice: false });
      fireEvent.click(screen.getByTestId(w.otherCard));
      fireEvent.click(primary(w.otherLabel));

      await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
      expect(postsTo('sifDefaults')).toHaveLength(0);
      expect(postsTo(w.otherAction)).toHaveLength(1);
    });

    it('confirms straight away, without sifFields, when no fiscal system is active', async () => {
      sifAnswer = okPreview(NO_SYSTEMS);
      const { onConfirmed } = await renderConfirm();
      fireEvent.click(primary());

      await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('invoice-sif-step')).not.toBeInTheDocument();
      expect(postsTo(w.invoiceAction)[0].body).toEqual({});
    });

    it('fails open: a preview that fails confirms without the step and without sifFields', async () => {
      sifAnswer = () => jsonResponse({ error: 'boom' }, false, 500);
      const { onConfirmed } = await renderConfirm();
      fireEvent.click(primary());

      await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('invoice-sif-step')).not.toBeInTheDocument();
      expect(postsTo('documentAction')).toHaveLength(1);
      expect(postsTo(w.invoiceAction)[0].body).toEqual({});
    });
  });

  describe('CreateDocsModal', () => {
    async function renderDocs() {
      const props = { onClose: vi.fn(), onCreated: vi.fn() };
      await act(async () => {
        render(
          <w.CreateDocsModal
            orderId="ord-1"
            data={{ ...ORDER, documentStatus: 'CO' }}
            base="/sws/neo"
            currency="EUR"
            derived={w.derived}
            {...props} />,
        );
      });
      return props;
    }
    const primary = () => screen.getByRole('button', { name: 'soCreateDocsBtn' });

    it('shows the step, then sends sifFields only on the final confirm', async () => {
      const { onCreated } = await renderDocs();
      fireEvent.click(primary());
      await screen.findByTestId('invoice-sif-step');
      expect(postsTo(w.invoiceAction)).toHaveLength(0);

      fireEvent.change(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii'), { target: { value: 'Editada' } });
      fireEvent.click(primary());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(postsTo(w.invoiceAction)[0].body).toEqual({
        sifFields: { ...PREVIEW.fields, aeatsiiDescripcionSii: 'Editada' },
      });
    });

    it('Atrás keeps the edits; Cancelar on the step creates nothing', async () => {
      const { onClose } = await renderDocs();
      fireEvent.click(primary());
      await screen.findByTestId('invoice-sif-step');
      fireEvent.change(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii'), { target: { value: 'Editada' } });
      fireEvent.click(screen.getByTestId(w.docsBackId));
      expect(screen.queryByTestId('invoice-sif-step')).not.toBeInTheDocument();

      fireEvent.click(primary());
      await screen.findByTestId('invoice-sif-step');
      expect(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii')).toHaveValue('Editada');

      fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(postsTo(w.invoiceAction)).toHaveLength(0);
    });

    it('creates straight away, without sifFields, when no fiscal system is active', async () => {
      sifAnswer = okPreview(NO_SYSTEMS);
      const { onCreated } = await renderDocs();
      fireEvent.click(primary());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('invoice-sif-step')).not.toBeInTheDocument();
      expect(postsTo(w.invoiceAction)[0].body).toEqual({});
    });

    it('fails open: a preview that fails creates without the step', async () => {
      sifAnswer = () => Promise.reject(new TypeError('Failed to fetch'));
      const { onCreated } = await renderDocs();
      fireEvent.click(primary());

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('invoice-sif-step')).not.toBeInTheDocument();
      expect(postsTo(w.invoiceAction)[0].body).toEqual({});
    });
  });
});

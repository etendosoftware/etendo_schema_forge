// @covers artifacts/sales-order/custom/BulkOrderMoreMenu.jsx
// @covers artifacts/purchase-order/custom/BulkPurchaseOrderMoreMenu.jsx
/**
 * ETP-5051 — the order grid's bulk kebab (Create invoices / Create shipments for sales orders,
 * Create invoices / Create receipts for purchase orders) fans one create request out per selected
 * order. A plan quota refuses the ones past the limit with 403 QUOTA_EXCEEDED.
 *
 * What must hold:
 *  - a refused row is flagged `quotaRefusal` and carries the translated quota sentence, so the
 *    single-row toast IS that sentence and a multi-row summary shows it once as its description
 *    (`showBulkActionToast`, real here);
 *  - any other refusal reads exactly as before: the backend message for one row, the plain count
 *    summary with no description for several.
 *
 * The two menus are twins (same fan-out, same toast, different window and actions), so one
 * parametrized suite pins both. Radix DropdownMenu cannot run in jsdom, so its items become plain
 * buttons; the module-level `apiFetch` both menus import is mocked at its boundary.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    if (key === 'backendError.quotaExceeded') return `Límite del plan alcanzado: ${params.resource}`;
    if (key === 'processExecuted') return '{ok} ok, {failed} failed';
    if (key === 'backendError.draftInvoiceCoversPending') return `La factura borrador ${params.docs} ya cubre lo pendiente`;
    if (key === 'invoiceSifStep.bulkNotice') return `Bulk notice: ${params.systems}`;
    if (key === 'listConjunctionAnd') return 'y';
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock('@/lib/observability/health-events.js', () => ({ trackDocumentCreated: vi.fn() }));

// The real toast, observed: a mixed run's toast shows only counts, so the per-row failure messages
// are read from the result handed to it.
vi.mock('@/hooks/useBulkActionToast', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, showBulkActionToast: vi.fn(real.showBulkActionToast) };
});

vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }) => <>{children}</>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>{children}</button>
  ),
}));

import { toast } from 'sonner';
import { showBulkActionToast } from '@/hooks/useBulkActionToast';
import BulkOrderMoreMenu from '@generated/sales-order/custom/BulkOrderMoreMenu';
import BulkPurchaseOrderMoreMenu from '@generated/purchase-order/custom/BulkPurchaseOrderMoreMenu';

const QUOTA_TEXT = 'Límite del plan alcanzado: Invoices';
const quotaBody = (resourceKey) => ({
  error: {
    code: 'QUOTA_EXCEEDED', status: 403, message: 'Quota exceeded: Invoices (100/100)',
    quota: { resourceKey, resourceName: 'Invoices', includedQty: 100, consumed: 100, verdict: 'DENY' },
  },
});
const order = (id) => ({ id, documentNo: id.toUpperCase(), documentStatus: 'CO' });

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe.each([
  ['BulkOrderMoreMenu', BulkOrderMoreMenu, '/sws/neo/sales-order/header', [
    ['soBulkCreateInvoices', 'createDraftInvoice'],
    ['soBulkCreateShipments', 'createShipment'],
  ]],
  ['BulkPurchaseOrderMoreMenu', BulkPurchaseOrderMoreMenu, '/sws/neo/purchase-order/header', [
    ['poBulkCreateInvoices', 'createPurchaseInvoice'],
    ['poBulkCreateReceipts', 'createGoodsReceipt'],
  ]],
])('%s — plan-quota refusals (ETP-5051)', (_name, Menu, apiBaseUrl, items) => {
  /**
   * Each order's create answers what `answers[orderId]` says (default: created). Every draft
   * pre-check answers "no draft", so every row reaches its create request.
   */
  function route(answers) {
    mockApiFetch.mockImplementation((url, init = {}) => {
      const u = String(url);
      if (init.method === 'POST') {
        const id = u.match(/\/header\/([^/]+)\/action\//)?.[1];
        const answer = answers[id];
        if (answer) return Promise.resolve(jsonResponse(answer.body, { ok: false, status: answer.status }));
        return Promise.resolve(jsonResponse({ response: { data: { id: `new-${id}` } } }));
      }
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    });
  }

  async function run(label, rows) {
    const refresh = vi.fn();
    render(<Menu selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl={apiBaseUrl} refresh={refresh} />);
    fireEvent.click(screen.getByText(new RegExp(`^${label}`)));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each(items)('%s (%s)', (label, action) => {
    it('shows the quota sentence itself when the one selected order is refused', async () => {
      route({ 'so-1': { status: 403, body: quotaBody(`${action}-single`) } });
      await run(label, [order('so-1')]);

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(QUOTA_TEXT);
      expect(mockApiFetch.mock.calls.some(([u, i]) => i?.method === 'POST' && String(u).endsWith(`/action/${action}`))).toBe(true);
    });

    it('adds the quota sentence once to the summary when several orders are refused', async () => {
      route({
        'so-2': { status: 403, body: quotaBody(`${action}-multi`) },
        'so-3': { status: 403, body: quotaBody(`${action}-multi`) },
      });
      await run(label, [order('so-1'), order('so-2'), order('so-3')]);

      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.warning).toHaveBeenCalledWith('1 ok, 2 failed', { description: QUOTA_TEXT });
    });

    it('names the quota on an all-failed summary even when other rows failed for other reasons', async () => {
      route({
        'so-1': { status: 409, body: { response: { status: -1, message: 'No pending lines' } } },
        'so-2': { status: 403, body: quotaBody(`${action}-mixed`) },
      });
      await run(label, [order('so-1'), order('so-2')]);

      expect(toast.error).toHaveBeenCalledWith('0 ok, 2 failed', { description: QUOTA_TEXT });
    });

    it('keeps the backend message for one order refused for another reason', async () => {
      route({ 'so-1': { status: 409, body: { response: { status: -1, message: 'No pending lines' } } } });
      await run(label, [order('so-1')]);

      expect(toast.error).toHaveBeenCalledWith('No pending lines');
    });

    it('keeps the plain summary, with no description, when no refusal is a quota one', async () => {
      route({
        'so-1': { status: 409, body: { response: { status: -1, message: 'No pending lines' } } },
        'so-2': { status: 500, body: null },
      });
      await run(label, [order('so-1'), order('so-2')]);

      expect(toast.error).toHaveBeenCalledWith('0 ok, 2 failed');
      expect(toast.error.mock.calls[0]).toHaveLength(1);
    });
  });
});

// ETP-5828 — the sales bulk "Generar factura" no longer pre-skips an order with a draft invoice:
// the backend invoices what is left net of its drafts, and one whose drafts already hold
// everything left answers the draft-covers 400, shown translated as that row's failure.
describe('BulkOrderMoreMenu — createDraftInvoice leaves the draft rule to the backend (ETP-5828)', () => {
  const COVERS = 'A draft invoice (FV1) already covers what is left to invoice; '
    + 'complete or delete it instead of creating another one.';
  const URL = (id, action) => `/sws/neo/sales-order/header/${id}/action/${action}`;

  // One mixed run. `hasDraft` is what the removed checkDraftInvoice pre-check would have answered:
  // the route below still answers it `exists: true` for those rows, so a returning pre-check would
  // skip them client-side and drop their POST.
  const ROWS = [
    { id: 'so-a', status: 'CO', hasDraft: false, post: { ok: true }, failure: null },
    { id: 'so-b', status: 'CO', hasDraft: true, post: { ok: true }, failure: null },
    { id: 'so-c', status: 'CO', hasDraft: true, post: { ok: false, status: 400, body: { status: 'error', message: COVERS } },
      failure: 'La factura borrador FV1 ya cubre lo pendiente' },
    { id: 'so-d', status: 'DR', hasDraft: false, post: null, failure: 'soBulkOrderNotCompleted' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts every completed order, translates the draft-covers refusal and never pre-checks draft invoices', async () => {
    const byId = Object.fromEntries(ROWS.map((r) => [r.id, r]));
    mockApiFetch.mockImplementation((url, init = {}) => {
      const [, id, action] = String(url).match(/\/header\/([^/]+)\/action\/(\w+)/) ?? [];
      if (action === 'checkDraftInvoice') {
        return Promise.resolve(jsonResponse({ response: { data: { exists: byId[id].hasDraft } } }));
      }
      if (init.method === 'POST') {
        const { ok, status, body } = byId[id].post;
        return Promise.resolve(ok
          ? jsonResponse({ response: { data: { id: `inv-${id}` } } })
          : jsonResponse(body, { ok: false, status }));
      }
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    });
    const refresh = vi.fn();
    const rows = ROWS.map((r) => ({ id: r.id, documentNo: r.id.toUpperCase(), documentStatus: r.status }));
    render(<BulkOrderMoreMenu selectedRows={rows} clearSelection={vi.fn()} token="tok"
      apiBaseUrl="/sws/neo/sales-order" refresh={refresh} />);
    fireEvent.click(screen.getByText(/^soBulkCreateInvoices/));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // ETP-6179: the fiscal-data preview (sifDefaults) is read first; none is active here, so the
    // run goes straight on and only the invoice POSTs remain to compare.
    const allUrls = mockApiFetch.mock.calls.map(([u]) => String(u));
    const urls = allUrls.filter((u) => !u.includes('/action/sifDefaults'));
    expect(allUrls.some((u) => u.includes('/action/sifDefaults'))).toBe(true);
    expect(urls.some((u) => u.includes('/action/checkDraftInvoice'))).toBe(false);
    expect(urls).toEqual(ROWS.filter((r) => r.post).map((r) => URL(r.id, 'createDraftInvoice')));
    expect(mockApiFetch.mock.calls.every(([, init]) => init?.method === 'POST')).toBe(true);

    expect(showBulkActionToast).toHaveBeenCalledWith(expect.any(Function), {
      ok: ROWS.filter((r) => !r.failure).length,
      failed: ROWS.filter((r) => r.failure).map((r) => ({ documentNo: r.id.toUpperCase(), message: r.failure })),
    });
    expect(toast.warning).toHaveBeenCalledWith('2 ok, 2 failed');
  });
});

// ETP-6179 — with a fiscal system active, "Crear facturas" first shows the fiscal data read-only.
// The orders here differ only in the SII key (customers with their own key): the shared fields show
// their value, the key shows "per customer", and each order's POST carries its OWN preview values.
// Both menus share the flow, so both are pinned; the receipt / shipment action never asks.
describe.each([
  ['BulkOrderMoreMenu', BulkOrderMoreMenu, '/sws/neo/sales-order', 'soBulkCreateInvoices', 'createDraftInvoice',
    'soBulkCreateShipments', 'createShipment'],
  ['BulkPurchaseOrderMoreMenu', BulkPurchaseOrderMoreMenu, '/sws/neo/purchase-order', 'poBulkCreateInvoices',
    'createPurchaseInvoice', 'poBulkCreateReceipts', 'createGoodsReceipt'],
])('%s — read-only fiscal data summary before bulk invoicing (ETP-6179)', (
  _name, Menu, apiBaseUrl, invoiceLabel, invoiceAction, otherLabel, otherAction,
) => {
  const preview = (siiKey, extra = {}) => ({
    systems: ['SII', 'Verifactu'], sales: true, rectificative: false,
    fields: { etsgDateOperation: '2026-11-11', aeatsiiClaveTipo: siiKey, etvfacInvType: 'F1' },
    fieldSpecs: [
      { name: 'etsgDateOperation', system: 'SII', type: 'date' },
      { name: 'aeatsiiClaveTipo', system: 'SII', type: 'option', options: ['F1', 'F2', 'F4'] },
      { name: 'etvfacInvType', system: 'Verifactu', type: 'option' },
    ],
    siiAuthorizationAvailable: false,
    ...extra,
  });
  const KEYS = { 'so-a': 'F1', 'so-b': 'F2' };
  let previews;

  const sifCalls = () => mockApiFetch.mock.calls.filter(([u]) => String(u).includes('/action/sifDefaults'));
  const postsOf = (action) => mockApiFetch.mock.calls.filter(([u]) => String(u).includes(`/action/${action}`));

  beforeEach(() => {
    vi.clearAllMocks();
    previews = Object.fromEntries(Object.entries(KEYS).map(([id, k]) => [id, jsonResponse({ response: { data: preview(k) } })]));
    mockApiFetch.mockImplementation((url, init = {}) => {
      const [, id, action] = String(url).match(/\/header\/([^/]+)\/action\/(\w+)/) ?? [];
      if (action === 'sifDefaults') return Promise.resolve(previews[id]);
      if (init.method === 'POST') return Promise.resolve(jsonResponse({ response: { data: { id: `inv-${id}` } } }));
      // Draft pre-checks (GET): no draft anywhere.
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    });
  });

  function renderMenu(rows = [order('so-a'), order('so-b')]) {
    const refresh = vi.fn();
    render(<Menu selectedRows={rows} clearSelection={vi.fn()} token="tok" apiBaseUrl={apiBaseUrl} refresh={refresh} />);
    return refresh;
  }

  it('shows "per customer" for the differing SII key and sends each order its own values', async () => {
    const refresh = renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));

    await screen.findByTestId('invoice-sif-step-modal');
    expect(screen.getByTestId('Varies__sifstep_aeatsiiClaveTipo'))
      .toHaveValue('invoiceSifStep.variesPerCustomer');
    expect(screen.queryByTestId('Varies__sifstep_etsgDateOperation')).toBeNull();
    expect(postsOf(invoiceAction)).toHaveLength(0);

    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-confirm'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const sent = Object.fromEntries(postsOf(invoiceAction).map(([u, init]) => [
      String(u).match(/header\/([^/]+)\//)[1], JSON.parse(init.body).sifFields]));
    expect(sent).toEqual({ 'so-a': preview('F1').fields, 'so-b': preview('F2').fields });
  });

  it('is read-only: the InfoBanner notice names the systems and every control is disabled', async () => {
    renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));
    await screen.findByTestId('invoice-sif-step-modal');

    expect(screen.getByTestId('invoice-sif-step-notice'))
      .toHaveTextContent('Bulk notice: sifDataTabs.tab.sii y sifDataTabs.tab.verifactu');
    expect(screen.queryByText('invoiceSifStep.description')).toBeNull();
    expect(screen.getByTestId('SelectTrigger__sifstep_etvfacInvType')).toBeDisabled();
    expect(screen.getByTestId('Varies__sifstep_aeatsiiClaveTipo')).toBeDisabled();
    const date = screen.getByTestId('invoice-sif-step-SII').querySelector('#sif-step-etsgDateOperation');
    expect(date).toBeDisabled();
    // A bulk summary has no earlier screen to go back to.
    expect(screen.queryByTestId('invoice-sif-step-modal-back')).toBeNull();
    expect(screen.getByTestId('invoice-sif-step-modal-confirm')).toHaveTextContent(`${invoiceLabel} (2)`);
  });

  it('shows the shared value when every order gets the same one', async () => {
    previews['so-b'] = jsonResponse({ response: { data: preview('F1') } });
    renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));
    await screen.findByTestId('invoice-sif-step-modal');
    expect(screen.queryByTestId('Varies__sifstep_aeatsiiClaveTipo')).toBeNull();
    expect(screen.getByTestId('SelectTrigger__sifstep_aeatsiiClaveTipo')).toHaveTextContent('F1 - sifDataTabs.option.invoice');
  });

  it('creates nothing when the summary is cancelled', async () => {
    renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));
    await screen.findByTestId('invoice-sif-step-modal');
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-cancel'));

    await waitFor(() => expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull());
    expect(postsOf(invoiceAction)).toHaveLength(0);
  });

  it('creates nothing when the summary is closed with the ×', async () => {
    renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));
    await screen.findByTestId('invoice-sif-step-modal');
    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-close'));

    await waitFor(() => expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull());
    expect(postsOf(invoiceAction)).toHaveLength(0);
  });

  it('shows no modal and posts without sifFields when no order has an active system', async () => {
    previews = {
      'so-a': jsonResponse({ response: { data: { systems: [], fields: {}, fieldSpecs: [] } } }),
      'so-b': jsonResponse({ response: { data: { systems: [], fields: {}, fieldSpecs: [] } } }),
    };
    const refresh = renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull();
    expect(postsOf(invoiceAction)).toHaveLength(2);
    postsOf(invoiceAction).forEach(([, init]) => expect(JSON.parse(init.body)).toEqual({}));
  });

  it('fails open: one unreadable preview skips the summary and posts without sifFields', async () => {
    previews['so-b'] = jsonResponse({ error: 'boom' }, { ok: false, status: 500 });
    const refresh = renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull();
    postsOf(invoiceAction).forEach(([, init]) => expect(JSON.parse(init.body)).not.toHaveProperty('sifFields'));
  });

  it('only previews the completed orders', async () => {
    renderMenu([order('so-a'), { id: 'so-dr', documentNo: 'SO-DR', documentStatus: 'DR' }]);
    fireEvent.click(screen.getByText(new RegExp(`^${invoiceLabel}`)));
    await screen.findByTestId('invoice-sif-step-modal');
    expect(sifCalls().map(([u]) => String(u))).toEqual([`${apiBaseUrl}/header/so-a/action/sifDefaults`]);
  });

  it(`never asks for fiscal data on ${otherAction}`, async () => {
    const refresh = renderMenu();
    fireEvent.click(screen.getByText(new RegExp(`^${otherLabel}`)));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(sifCalls()).toHaveLength(0);
    expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull();
    postsOf(otherAction).forEach(([, init]) => expect(JSON.parse(init.body)).toEqual({}));
  });
});

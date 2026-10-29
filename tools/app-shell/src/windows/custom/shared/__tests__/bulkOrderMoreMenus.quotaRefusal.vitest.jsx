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

vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }) => <>{children}</>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>{children}</button>
  ),
}));

import { toast } from 'sonner';
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

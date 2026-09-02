import { renderHook, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';
import { useDashboardData } from '../useDashboardData';

/**
 * ETP-5088 — a hidden widget must not merely be hidden: its request must never be issued, so a
 * restricted role costs fewer round trips. This suite asserts the REQUESTS, which the sibling
 * suites (mapping-focused, run as client-admin) deliberately do not.
 *
 * Roles are expressed as the real `AD_Window_Access` grants they hold in the tenant, same as
 * `src/lib/__tests__/dashboardWidgetAccess.test.js` and `pages/__tests__/DashboardPage.vitest.jsx`.
 */

const WINDOW = {
  contacts: '123', product: '140', salesOrder: '143', salesInvoice: '167',
  physicalInventory: '168', goodsShipment: '169', purchaseInvoice: '183',
  goodsReceipt: '184', financialAccount: '94EAA455D2644E04AB25D93BE5157B6D',
};

const authState = vi.hoisted(() => ({ value: { token: 'test-token', windowAccess: {}, capabilities: {} } }));

vi.mock('@generated/dashboard/generated/config', () => ({
  kpisConfig: [{ key: 'revenue', label: 'Revenue', icon: 'DollarSign' }],
  actions: [],
}));

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => authState.value }));

vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: createStableUseApiFetchMock() }));

vi.mock('@/lib/dashboardNavigation.js', () => ({
  createDashboardNavigation: (opts) => ({ ...opts }),
}));

vi.mock('@/components/dashboard/DashboardDateRangeContext', () => ({
  useDashboardDateRange: () => ({ range: 'month' }),
}));

describe('useDashboardData — widget gating (ETP-5088)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ response: { data: [] } }) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asRole = (windowAccess, capabilities = {}) => {
    authState.value = { token: 'test-token', windowAccess, capabilities };
  };

  /** The widget entities actually requested, in no particular order. */
  async function requestedEntities() {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    return globalThis.fetch.mock.calls
      .map(([url]) => String(url).split('/dashboard/')[1]?.split('?')[0])
      .filter(Boolean)
      .sort();
  }

  it('a Sales role does not request the financial widgets it cannot see', async () => {
    asRole({
      [WINDOW.contacts]: 'full', [WINDOW.product]: 'full', [WINDOW.salesOrder]: 'full',
      [WINDOW.salesInvoice]: 'full', [WINDOW.physicalInventory]: 'full',
      [WINDOW.goodsShipment]: 'full',
    });
    const entities = await requestedEntities();

    expect(entities).not.toContain('kpis');
    expect(entities).not.toContain('trends');
    // ...but everything Sales is entitled to is still fetched.
    expect(entities).toEqual(expect.arrayContaining([
      'recent-invoices', 'top-clients', 'best-products', 'best-sellers', 'pending-amounts',
    ]));
  });

  it('an Inventory role requests neither the sales widgets nor pending-amounts', async () => {
    asRole({
      [WINDOW.contacts]: 'read-only', [WINDOW.product]: 'full',
      [WINDOW.physicalInventory]: 'full', [WINDOW.goodsShipment]: 'full',
      [WINDOW.goodsReceipt]: 'full',
    });
    const entities = await requestedEntities();

    for (const hidden of ['kpis', 'trends', 'recent-invoices', 'top-clients', 'pending-amounts']) {
      expect(entities).not.toContain(hidden);
    }
    expect(entities).toEqual(expect.arrayContaining(['best-products', 'best-sellers']));
  });

  it('the feed widgets are always requested — they are filtered per item, not hidden', async () => {
    asRole({ [WINDOW.product]: 'full' });
    const entities = await requestedEntities();

    expect(entities).toEqual(expect.arrayContaining(['pending-tasks', 'activity']));
  });

  it('a role with no grants at all requests only the feed widgets (fail closed)', async () => {
    asRole({});
    const entities = await requestedEntities();

    expect(entities).toEqual(['activity', 'pending-tasks']);
  });

  it('a client-admin requests every widget', async () => {
    asRole({}, { isAdminOrClientAdmin: true });
    const entities = await requestedEntities();

    expect(entities).toEqual([
      'activity', 'best-products', 'best-sellers', 'kpis', 'pending-amounts',
      'pending-tasks', 'recent-invoices', 'top-clients', 'trends',
    ]);
  });

  it('drops a pending task whose window the role cannot reach, and keeps the rest', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const entity = String(url).split('/dashboard/')[1]?.split('?')[0];
      if (entity !== 'pending-tasks') return { ok: true, json: async () => ({ response: { data: [] } }) };
      return {
        ok: true,
        json: async () => ({
          response: {
            data: [
              { type: 'warning', text: 'Overdue invoices', navigation: { type: 'list', window: 'sales-invoice' } },
              { type: 'warning', text: 'Payments due today', navigation: { type: 'list', window: 'purchase-invoice' } },
            ],
          },
        }),
      };
    });
    // Sales: sales-invoice yes, purchase-invoice no.
    asRole({ [WINDOW.salesInvoice]: 'full' });

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks).toHaveLength(1);
    expect(result.current.pendingTasks[0].text).toBe('Overdue invoices');
  });
});

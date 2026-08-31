/**
 * Tests for the `inferPendingTaskKey` logic inside `useDashboardData.js`.
 *
 * The function is private, but it is exercised through the public hook via
 * `mapPendingTasks`. Each test feeds a single task (without `taskKey`) to the
 * `pending-tasks` endpoint and asserts that the resulting
 * `pendingTasks[0].taskKey` equals the expected inferred value.
 *
 * PENDING_TASK_RULES coverage:
 *   Rule 1 – sales-invoice link / "overdue invoices" text
 *   Rule 2 – goods-receipt link (startsWith) / "pending reception" text
 *   Rule 3 – goods-shipment link (startsWith) / "pending delivery" text
 *   Rule 4 – "collection" + "due today" text
 *   Rule 5 – "payment" + "due today" text
 *   Rule 6 – physical-inventory link / "low stock alert" text
 * Edge cases:
 *   – existing taskKey is preserved without inference
 *   – unrecognized task returns null / absent taskKey
 */

// --- Mocks must be declared before any imports that trigger module resolution ---

vi.mock('@generated/dashboard/generated/config', () => ({
  kpisConfig: [],
  actions: [],
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/lib/dashboardNavigation.js', () => ({
  createDashboardNavigation: (opts) => ({ ...opts }),
  resolveDashboardNavigation: () => null,
}));

vi.mock('@/components/dashboard/DashboardDateRangeContext', () => ({
  useDashboardDateRange: () => ({ range: 'last90d', setRange: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// --- Imports ---

import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fetch mock that returns the provided task objects from the
 * `pending-tasks` endpoint. All other dashboard endpoints return empty/minimal
 * successful responses so the hook does not fall into the "all failed" fallback.
 */
function mockFetchWithPendingTasks(taskRows) {
  globalThis.fetch = vi.fn().mockImplementation(async (url) => {
    const entity = url.split('/dashboard/')[1]?.split('?')[0];

    if (entity === 'pending-tasks') {
      return {
        ok: true,
        json: async () => ({ response: { data: taskRows } }),
      };
    }

    if (entity === 'pending-amounts') {
      return {
        ok: true,
        json: async () => ({
          response: {
            data: { toCollect: { count: 0, amount: 0 }, toPay: { count: 0, amount: 0 } },
          },
        }),
      };
    }

    // kpis, trends, activity, recent-invoices, best-products, best-sellers, top-clients
    return {
      ok: true,
      json: async () => ({ response: { data: [] } }),
    };
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { pathname: '/etendo/web/app' },
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDashboardData — inferPendingTaskKey (PENDING_TASK_RULES)', () => {

  // ---- Rule 1: sales-invoice / overdue invoices ----

  it('infersPendingTaskKeyFromLinkSalesInvoice — link match, count > 1 → plural', async () => {
    mockFetchWithPendingTasks([
      { link: '/sales-invoice', text: '3 overdue', count: 3 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('overdueInvoices_plural');
  });

  it('infersPendingTaskKeyFromTextOverdueInvoices — text match, count 1 → singular', async () => {
    mockFetchWithPendingTasks([
      { link: '/other', text: '1 overdue invoices today', count: 1 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('overdueInvoices');
  });

  // ---- Rule 2: goods-receipt / pending reception ----

  it('infersPendingTaskKeyFromLinkGoodsReceipt — link startsWith match, count > 1 → plural', async () => {
    mockFetchWithPendingTasks([
      { link: '/goods-receipt?DocStatus=DR', text: '2 pending', count: 2 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('pendingReceptions_plural');
  });

  it('infersPendingTaskKeyFromTextPendingReception — text match, count 1 → singular', async () => {
    mockFetchWithPendingTasks([
      { link: '', text: '1 pending reception', count: 1 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('pendingReceptions');
  });

  // ---- Rule 3: goods-shipment / pending delivery ----

  it('infersPendingTaskKeyFromLinkGoodsShipment — link startsWith match, count > 1 → plural', async () => {
    mockFetchWithPendingTasks([
      { link: '/goods-shipment?DocStatus=DR', text: '5 pending', count: 5 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('pendingSalesDeliveries_plural');
  });

  it('infersPendingTaskKeyFromTextPendingDelivery — text match, count 1 → singular', async () => {
    mockFetchWithPendingTasks([
      { link: '', text: '1 pending delivery', count: 1 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('pendingSalesDeliveries');
  });

  // ---- Rule 4: collection due today ----

  it('infersPendingTaskKeyFromTextCollectionsDueToday — count > 1 → plural', async () => {
    mockFetchWithPendingTasks([
      { link: '', text: '3 collection due today', count: 3 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('collectionsDueToday_plural');
  });

  // ---- Rule 5: payment due today ----

  it('infersPendingTaskKeyFromTextPaymentsDueToday — count 1 → singular', async () => {
    mockFetchWithPendingTasks([
      { link: '', text: '1 payment due today', count: 1 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('paymentsDueToday');
  });

  // ---- Rule (ETP-5017): payment overdue — checked before "payment due today" ----

  it('infersPendingTaskKeyFromTextPaymentsOverdue — count > 1 → plural', async () => {
    mockFetchWithPendingTasks([
      { link: '', text: '3 payments overdue', count: 3 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('paymentsOverdue_plural');
  });

  it('infersPendingTaskKeyFromTextPaymentsOverdue — count 1 → singular', async () => {
    mockFetchWithPendingTasks([
      { link: '', text: '1 payment overdue', count: 1 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('paymentsOverdue');
  });

  // ---- Rule 6: physical-inventory / low stock alert ----

  it('infersPendingTaskKeyFromLinkPhysicalInventory — link match, count > 1 → plural', async () => {
    mockFetchWithPendingTasks([
      { link: '/physical-inventory', text: '2 alerts', count: 2 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('lowStockAlerts');
  });

  // ---- Edge case: existing taskKey must be preserved ----

  it('preservesExistingTaskKeyWithoutInference — taskKey from handler wins over rules', async () => {
    // The link and text WOULD match Rule 1, but taskKey is already set.
    mockFetchWithPendingTasks([
      { link: '/sales-invoice', text: 'overdue invoices', taskKey: 'customKey', count: 1 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingTasks[0].taskKey).toBe('customKey');
  });

  // ---- Edge case: unrecognized task ----

  it('returnsNullForUnrecognizedTask — no rule matches → taskKey is null or absent', async () => {
    mockFetchWithPendingTasks([
      { link: '/unknown', text: 'something else', count: 1 },
    ]);

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // inferPendingTaskKey returns null → mapPendingTasks does not set taskKey
    // (it only sets it if the value is truthy — null is falsy and not stored)
    const taskKey = result.current.pendingTasks[0].taskKey;
    expect(taskKey == null).toBe(true);
  });
});

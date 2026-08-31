/**
 * Regression tests for the "Ventas Recientes" date-filter bug (ETP-4004).
 *
 * Root cause fixed: mapRecentInvoices() previously had a hardcoded client-side
 * 7-day filter that silently dropped invoices outside that window regardless of
 * the ?range= param sent to the server.
 *
 * These tests verify:
 *   1. Invoices from 40 days ago (outside the old 7-day window) ARE returned
 *      when the backend sends them — the frontend no longer filters by date.
 *   2. Only CO/CL statuses pass through; DR and VO are excluded.
 *   3. Empty backend response → recentInvoices is [].
 *   4. null amount in backend → defaults to 0 in the mapped item.
 */

// --- Mocks must be declared before any imports that trigger module resolution ---

vi.mock('@generated/dashboard/generated/config', () => ({
  kpisConfig: [],
  actions: [],
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// useApiFetch wraps app-shell-core auth hooks not set up in this unit-test
// environment. Mock as a STABLE (vi.hoisted) passthrough to globalThis.fetch:
// apiFetch is a useCallback dependency in the hook, so a fresh function
// identity per render would re-trigger the effect forever.
const { mockApiFetch } = vi.hoisted(() => ({
  mockApiFetch: (url, options) => globalThis.fetch(url, options),
}));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
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

/** Build a date string N days before today, in ISO format (YYYY-MM-DD). */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Mock globalThis.fetch so that:
 *  - recent-invoices returns the provided array
 *  - all other dashboard endpoints return an empty successful response
 */
function mockFetchWithInvoices(invoiceRows) {
  globalThis.fetch = vi.fn().mockImplementation(async (url) => {
    const entity = url.split('/dashboard/')[1]?.split('?')[0];
    if (entity === 'recent-invoices') {
      return {
        ok: true,
        json: async () => ({ response: { data: invoiceRows } }),
      };
    }
    // Kpis endpoint needs an array; pending-amounts needs an object shape;
    // everything else can be an empty array.
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

describe('useDashboardData — mapRecentInvoices regression (ETP-4004)', () => {

  it('returns invoices from 40 days ago — frontend must not filter by date', async () => {
    // The old bug: a client-side "7 days" filter silently dropped these rows.
    const oldDate = daysAgo(40);
    mockFetchWithInvoices([
      { id: 'inv-001', documentNo: 'F-001', client: 'Acme Corp', date: oldDate, amount: 1500, status: 'CO' },
      { id: 'inv-002', documentNo: 'F-002', client: 'Acme Corp', date: oldDate, amount: 2000, status: 'CL' },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recentInvoices).toHaveLength(2);
    expect(result.current.recentInvoices[0].id).toBe('inv-001');
    expect(result.current.recentInvoices[1].id).toBe('inv-002');
  });

  it('passes through CO status invoices', async () => {
    mockFetchWithInvoices([
      { id: 'inv-co', documentNo: 'F-CO', client: 'Beta LLC', date: daysAgo(5), amount: 500, status: 'CO' },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recentInvoices).toHaveLength(1);
    expect(result.current.recentInvoices[0].status).toBe('CO');
  });

  it('passes through CL status invoices', async () => {
    mockFetchWithInvoices([
      { id: 'inv-cl', documentNo: 'F-CL', client: 'Beta LLC', date: daysAgo(5), amount: 300, status: 'CL' },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recentInvoices).toHaveLength(1);
    expect(result.current.recentInvoices[0].status).toBe('CL');
  });

  it('filters out invoices with status DR', async () => {
    mockFetchWithInvoices([
      { id: 'inv-dr', documentNo: 'F-DR', client: 'Draft Co', date: daysAgo(1), amount: 100, status: 'DR' },
      { id: 'inv-co', documentNo: 'F-CO', client: 'Good Co', date: daysAgo(1), amount: 200, status: 'CO' },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only the CO invoice passes
    expect(result.current.recentInvoices).toHaveLength(1);
    expect(result.current.recentInvoices[0].id).toBe('inv-co');
  });

  it('filters out invoices with status VO (voided)', async () => {
    mockFetchWithInvoices([
      { id: 'inv-vo', documentNo: 'F-VO', client: 'Void Co', date: daysAgo(2), amount: 750, status: 'VO' },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recentInvoices).toHaveLength(0);
  });

  it('filters out all non-CO/CL statuses and returns only valid ones', async () => {
    mockFetchWithInvoices([
      { id: 'a', documentNo: 'F-A', client: 'A', date: daysAgo(1), amount: 100, status: 'DR' },
      { id: 'b', documentNo: 'F-B', client: 'B', date: daysAgo(1), amount: 200, status: 'VO' },
      { id: 'c', documentNo: 'F-C', client: 'C', date: daysAgo(1), amount: 300, status: 'CO' },
      { id: 'd', documentNo: 'F-D', client: 'D', date: daysAgo(1), amount: 400, status: 'CL' },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recentInvoices).toHaveLength(2);
    const ids = result.current.recentInvoices.map((i) => i.id);
    expect(ids).toContain('c');
    expect(ids).toContain('d');
  });

  it('returns empty array when backend returns empty data', async () => {
    mockFetchWithInvoices([]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recentInvoices).toEqual([]);
  });

  it('defaults amount to 0 when backend sends null', async () => {
    mockFetchWithInvoices([
      { id: 'inv-null-amount', documentNo: 'F-NULL', client: 'Null Corp', date: daysAgo(3), amount: null, status: 'CO' },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recentInvoices).toHaveLength(1);
    expect(result.current.recentInvoices[0].amount).toBe(0);
  });

  it('maps all expected fields from backend response', async () => {
    const testDate = daysAgo(10);
    mockFetchWithInvoices([
      {
        id: 'inv-full',
        documentNo: 'F-999',
        client: 'Full Client',
        date: testDate,
        amount: 9999,
        status: 'CO',
      },
    ]);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const inv = result.current.recentInvoices[0];
    expect(inv.id).toBe('inv-full');
    expect(inv.documentNo).toBe('F-999');
    expect(inv.client).toBe('Full Client');
    expect(inv.date).toBe(testDate);
    expect(inv.amount).toBe(9999);
    expect(inv.status).toBe('CO');
    expect(inv.navigation).toBeTruthy();
  });

  it('sends the range query param to the recent-invoices endpoint', async () => {
    mockFetchWithInvoices([]);

    renderHook(() => useDashboardData());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const invoiceCall = globalThis.fetch.mock.calls.find(
      ([url]) => url.includes('/dashboard/recent-invoices'),
    );
    expect(invoiceCall).toBeTruthy();
    expect(invoiceCall[0]).toContain('range=last90d');
  });
});

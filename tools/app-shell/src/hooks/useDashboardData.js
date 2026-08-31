import { useState, useEffect, useCallback } from 'react';
import { kpisConfig, actions } from '@generated/dashboard/generated/config';
import { useAuth } from '@/auth/AuthContext';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { createDashboardNavigation } from '@/lib/dashboardNavigation.js';
import { useDashboardDateRange } from '@/components/dashboard/DashboardDateRangeContext';

/* ------------------------------------------------------------------
 * Constants
 * ----------------------------------------------------------------*/

const FETCH_TIMEOUT_MS = 10000;

/* ------------------------------------------------------------------
 * Low-level helpers
 * ----------------------------------------------------------------*/

/**
 * Fetch a dashboard widget endpoint.
 * All widget endpoints live under /sws/neo/dashboard/{entity}.
 *
 * 401 is treated as "unavailable" rather than an expired session — a single failed
 * widget must not log the whole dashboard out — so it is passed through via
 * `on401: 'ignore'` and falls into the same !res.ok handling as any other failure.
 */
async function fetchWidget(apiFetch, entity, range) {
  const qs = range ? `?range=${encodeURIComponent(range)}` : '';
  const path = `/sws/neo/dashboard/${entity}${qs}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await apiFetch(path, { signal: ctrl.signal, on401: 'ignore' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.response) {
      console.warn(`[dashboard] Unexpected response shape for dashboard/${entity}:`, json);
      return null;
    }
    return json.response.data ?? [];
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[dashboard] Failed to fetch dashboard/${entity}:`, err.message);
    return null;
  }
}

/** Format a dollar amount for display. */
function fmtAmount(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

/* ------------------------------------------------------------------
 * Mappers: handler response → frontend shape
 * ----------------------------------------------------------------*/

/**
 * Map KPI handler response to the shape expected by DashboardPage.
 * Handler returns: [{key, label, value, format, trend, icon}, ...]
 */
function mapKpis(handlerData) {
  if (!handlerData) return null;
  if (handlerData.length === 0) return [];

  // Build a lookup from handler data keyed by `key`
  const byKey = {};
  for (const item of handlerData) {
    byKey[item.key] = item;
  }

  return kpisConfig.map((cfg) => {
    const h = byKey[cfg.key];
    if (!h) return { ...cfg, value: 0, trend: 0, previousValue: 0 };
    const trend = h.trend || 0;
    const value = h.value || 0;
    const previousValue = trend !== 0
      ? Math.round(value / (1 + trend / 100))
      : value;
    return { ...cfg, value, trend, previousValue };
  });
}

/**
 * Map trends handler response.
 * Handler returns: [{labels, values}]
 */
function mapTrends(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  const trend = handlerData[0];

  const toNumberArray = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    });
  };

  const values = toNumberArray(trend.values);
  const rawExpenseValues = toNumberArray(
    trend.expenseValues ?? trend.expenses ?? trend.expenseTrend ?? []
  );

  return {
    labels: Array.isArray(trend.labels) ? trend.labels : [],
    values,
    expenseValues: values.map((_, idx) => rawExpenseValues[idx] ?? 0),
  };
}

/**
 * Map pending tasks handler response.
 * Handler returns: [{type, text, navigation?, link?, amount?, detail?}]
 */
function mapPendingTasks(handlerData) {
  if (!handlerData || handlerData.length === 0) return [];

  return handlerData.map((task) => {
    const mapped = {
      type: task.type || 'info',
      text: task.text || '',
      link: task.link || '',
      navigation: task.navigation || null,
    };
    if (task.amount != null) mapped.amount = task.amount;
    if (task.detail) mapped.detail = task.detail;
    if (task.count != null) mapped.count = task.count;
    if (task.labelKey) mapped.labelKey = task.labelKey;
    if (task.taskKey) mapped.taskKey = task.taskKey;

    // Only infer taskKey if not provided by handler
    if (!mapped.taskKey) {
      mapped.taskKey = inferPendingTaskKey(mapped);
    }

    // Backward-compatible link fallback while handlers migrate to navigation
    if (!mapped.navigation && mapped.taskKey && !mapped.link.includes('?')) {
      const FILTER_LINKS = {
        overdueInvoices: '/sales-invoice?filter=overdue',
        overdueInvoices_plural: '/sales-invoice?filter=overdue',
        collectionsDueToday: '/sales-invoice?filter=overdue',
        collectionsDueToday_plural: '/sales-invoice?filter=overdue',
        paymentsDueToday: '/purchase-invoice?filter=overdue',
        paymentsDueToday_plural: '/purchase-invoice?filter=overdue',
        pendingReceptions: '/goods-receipt?DocStatus=DR',
        pendingReceptions_plural: '/goods-receipt?DocStatus=DR',
        pendingSalesDeliveries: '/goods-shipment?DocStatus=DR',
        pendingSalesDeliveries_plural: '/goods-shipment?DocStatus=DR',
      };
      if (FILTER_LINKS[mapped.taskKey]) {
        mapped.link = FILTER_LINKS[mapped.taskKey];
      }
    }

    return mapped;
  });
}

const PENDING_TASK_RULES = [
  { match: (l, t) => l === '/sales-invoice' || t.includes('overdue invoices'),            singular: 'overdueInvoices',        plural: 'overdueInvoices_plural'        },
  { match: (l, t) => l.startsWith('/goods-receipt') || t.includes('pending reception'),   singular: 'pendingReceptions',      plural: 'pendingReceptions_plural'      },
  { match: (l, t) => l.startsWith('/goods-shipment') || t.includes('pending delivery'),   singular: 'pendingSalesDeliveries', plural: 'pendingSalesDeliveries_plural' },
  { match: (l, t) => t.includes('collection') && t.includes('due today'),                 singular: 'collectionsDueToday',    plural: 'collectionsDueToday_plural'    },
  { match: (l, t) => t.includes('payment') && t.includes('due today'),                    singular: 'paymentsDueToday',       plural: 'paymentsDueToday_plural'       },
  { match: (l, t) => l === '/physical-inventory' || t.includes('low stock alert'),        singular: 'lowStockAlert',          plural: 'lowStockAlerts'                },
];

function inferPendingTaskKey(task) {
  if (task?.taskKey) return task.taskKey;
  const text = String(task?.text ?? '').toLowerCase();
  const link = task?.link ?? '';
  const rule = PENDING_TASK_RULES.find(r => r.match(link, text));
  if (!rule) return null;
  return task?.count === 1 ? rule.singular : rule.plural;
}

/**
 * Map activity handler response.
 * Handler returns: [{id, author, text, timestamp, type}]
 */
function mapActivity(handlerData) {
  if (!handlerData || handlerData.length === 0) return [];
  return handlerData;
}

const COMPLETED_INVOICE_STATUSES = new Set(['CO', 'CL']);

/**
 * Map recent invoices handler response.
 * Handler returns: [{id, client, date, amount, status}]
 */
function mapRecentInvoices(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;

  return handlerData
    .filter((inv) => COMPLETED_INVOICE_STATUSES.has(inv?.status))
    .map((inv) => ({
      id: inv.id || '',
      documentNo: inv.documentNo || inv.document_no || inv.docNo || null,
      client: inv.client || '',
      date: inv.date || '',
      amount: inv.amount || 0,
      status: inv.status || '',
      navigation: inv.navigation || createDashboardNavigation({
        type: 'record',
        window: 'sales-invoice',
        recordId: inv.id || '',
      }),
    }));
}

/**
 * Map best products handler response.
 * Handler returns: [{name, qty, amount}]
 */
function mapBestProducts(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  return handlerData.map((p) => ({
    id: p.id || p.productId || p.mProductId || '',
    name: p.name || '',
    qty: p.qty || 0,
    amount: p.amount || 0,
    trendPct: p.trendPct ?? null,
  }));
}

/**
 * Map best sellers handler response.
 * Handler returns: [{name, qty, uom}]
 */
function mapBestSellers(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  return handlerData.map((s) => ({
    id: s.id || s.productId || s.mProductId || '',
    name: s.name || '',
    qty: s.qty || 0,
    uom: s.uom || '',
    trendPct: s.trendPct ?? null,
  }));
}

/**
 * Map top clients handler response.
 * Handler returns: [{id?, businessPartnerId?, name, total}]
 */
function mapTopClients(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  return handlerData.map((c) => ({
    id: c.id || c.businessPartnerId || '',
    name: c.name || '',
    total: c.total || 0,
    navigation: c.navigation || ((c.id || c.businessPartnerId)
      ? createDashboardNavigation({
          type: 'record',
          window: 'contacts',
          recordId: c.id || c.businessPartnerId || '',
        })
      : null),
  }));
}

/**
 * Map pending amounts handler response.
 * Handler returns: {toCollect: {count, amount}, toPay: {count, amount}}
 * Note: this endpoint returns a single object, not an array.
 */
function mapPendingAmounts(handlerData) {
  if (!handlerData) return null;
  // Handler returns data as object (not array) or as first element of array
  const obj = Array.isArray(handlerData) ? handlerData[0] : handlerData;
  if (!obj) return null;
  return {
    toCollect: {
      count: obj.toCollect?.count ?? 0,
      amount: obj.toCollect?.amount ?? 0,
      navigation: obj.toCollect?.navigation || createDashboardNavigation({
        type: 'list',
        window: 'sales-invoice',
        filter: 'overdue',
      }),
    },
    toPay: {
      count: obj.toPay?.count ?? 0,
      amount: obj.toPay?.amount ?? 0,
      navigation: obj.toPay?.navigation || createDashboardNavigation({
        type: 'list',
        window: 'purchase-invoice',
        filter: 'overdue',
      }),
    },
  };
}

/* ------------------------------------------------------------------
 * Empty fallback — used when no token or all endpoints fail
 * ----------------------------------------------------------------*/

const EMPTY_PENDING_AMOUNTS = {
  toCollect: { count: 0, amount: 0 },
  toPay: { count: 0, amount: 0 },
};

function buildEmptyFallback() {
  const kpis = kpisConfig.map((cfg) => ({
    ...cfg,
    value: 0,
    trend: 0,
    previousValue: 0,
  }));
  return {
    kpis,
    revenueTrend: { labels: Array(12).fill(''), values: Array(12).fill(0) },
    pendingTasks: [],
    recentMessages: [],
    recentInvoices: [],
    bestProducts: [],
    bestSellers: [],
    pendingAmounts: EMPTY_PENDING_AMOUNTS,
    topClients: [],
  };
}

/* ------------------------------------------------------------------
 * Hook
 * ----------------------------------------------------------------*/

/**
 * Hook that provides all dashboard data.
 * Fetches from 4 dedicated widget handler endpoints in parallel,
 * falls back to empty state (zeros) on error or when unauthenticated.
 */
export function useDashboardData() {
  const { token } = useAuth();
  const { range } = useDashboardDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiFetch = useApiFetch();

  const fetchData = useCallback(async () => {
    if (!token) {
      setData(buildEmptyFallback());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [
        kpisRes, trendsRes, pendingRes, activityRes,
        invoicesRes, bestProductsRes, bestSellersRes, pendingAmountsRes,
        topClientsRes,
      ] = await Promise.allSettled([
        // ETP-5011: the Financial Summary widget is always a calendar-year figure
        // and does not follow the date-range selector, so `kpis` is fetched without `range`.
        fetchWidget(apiFetch, 'kpis', null),
        fetchWidget(apiFetch, 'trends', range),
        fetchWidget(apiFetch, 'pending-tasks', range),
        fetchWidget(apiFetch, 'activity', range),
        fetchWidget(apiFetch, 'recent-invoices', range),
        fetchWidget(apiFetch, 'best-products', range),
        fetchWidget(apiFetch, 'best-sellers', range),
        fetchWidget(apiFetch, 'pending-amounts', range),
        fetchWidget(apiFetch, 'top-clients', range),
      ]);

      const kpisData    = kpisRes.status    === 'fulfilled' ? kpisRes.value    : null;
      const trendsData  = trendsRes.status  === 'fulfilled' ? trendsRes.value  : null;
      const pendingData = pendingRes.status === 'fulfilled' ? pendingRes.value : null;
      const activityData = activityRes.status === 'fulfilled' ? activityRes.value : null;
      const invoicesData = invoicesRes.status === 'fulfilled' ? invoicesRes.value : null;
      const bestProductsData = bestProductsRes.status === 'fulfilled' ? bestProductsRes.value : null;
      const bestSellersData = bestSellersRes.status === 'fulfilled' ? bestSellersRes.value : null;
      const pendingAmountsData = pendingAmountsRes.status === 'fulfilled' ? pendingAmountsRes.value : null;
      const topClientsData = topClientsRes.status === 'fulfilled' ? topClientsRes.value : null;

      console.debug('[dashboard] widget fetch results:', {
        kpis: kpisData?.length ?? 'FAILED',
        trends: trendsData?.length ?? 'FAILED',
        pending: pendingData?.length ?? 'FAILED',
        activity: activityData?.length ?? 'FAILED',
        invoices: invoicesData?.length ?? 'FAILED',
        bestProducts: bestProductsData?.length ?? 'FAILED',
        bestSellers: bestSellersData?.length ?? 'FAILED',
        pendingAmounts: pendingAmountsData ? 'OK' : 'FAILED',
        topClients: topClientsData?.length ?? 'FAILED',
      });

      // If ALL handlers failed, fall back to empty state
      const allFailed = !kpisData && !trendsData && !pendingData && !activityData
        && !invoicesData && !bestProductsData && !bestSellersData && !pendingAmountsData
        && !topClientsData;
      if (allFailed) {
        console.warn('[dashboard] All widget endpoints failed — showing empty state');
        setData(buildEmptyFallback());
        setLoading(false);
        return;
      }

      const empty = buildEmptyFallback();
      const mappedKpis = mapKpis(kpisData);
      const mappedTrends = mapTrends(trendsData);

      setData({
        kpis: mappedKpis !== null ? mappedKpis : empty.kpis,
        revenueTrend: mappedTrends ?? empty.revenueTrend,
        expenseTrend: mappedTrends?.expenseValues ?? [],
        topClients: mapTopClients(topClientsData) ?? [],
        pendingTasks: mapPendingTasks(pendingData),
        recentMessages: mapActivity(activityData) || [],
        recentInvoices: mapRecentInvoices(invoicesData) ?? [],
        bestProducts: mapBestProducts(bestProductsData) ?? [],
        bestSellers: mapBestSellers(bestSellersData) ?? [],
        pendingAmounts: mapPendingAmounts(pendingAmountsData) ?? EMPTY_PENDING_AMOUNTS,
      });
    } catch (err) {
      console.warn('[dashboard] Unexpected error, showing empty state:', err.message);
      setData(buildEmptyFallback());
    } finally {
      setLoading(false);
    }
  }, [token, apiFetch, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resolved = data ?? buildEmptyFallback();

  return {
    kpis: resolved.kpis,
    revenueTrend: resolved.revenueTrend,
    expenseTrend: resolved.expenseTrend ?? [],
    topClients: resolved.topClients ?? [],
    pendingTasks: resolved.pendingTasks,
    recentMessages: resolved.recentMessages,
    recentInvoices: resolved.recentInvoices ?? [],
    bestProducts: resolved.bestProducts ?? [],
    bestSellers: resolved.bestSellers ?? [],
    pendingAmounts: resolved.pendingAmounts ?? EMPTY_PENDING_AMOUNTS,
    actions,
    loading,
    refresh: fetchData,
  };
}

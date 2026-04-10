import { useState, useEffect, useCallback, useMemo } from 'react';
import { kpisConfig, actions } from '@generated/dashboard/generated/config';
import { useAuth } from '@/auth/AuthContext';

/* ------------------------------------------------------------------
 * Constants
 * ----------------------------------------------------------------*/

const FETCH_TIMEOUT_MS = 10000;

/* ------------------------------------------------------------------
 * Low-level helpers
 * ----------------------------------------------------------------*/

/** Detect the Etendo context path for building API URLs. */
function getApiBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx === -1) return import.meta.env.VITE_API_BASE || '';
  return path.substring(0, webIdx);
}

/**
 * Fetch a dashboard widget endpoint.
 * All widget endpoints live under /sws/neo/dashboard/{entity}.
 */
async function fetchWidget(apiBase, token, entity) {
  const url = `${apiBase}/sws/neo/dashboard/${entity}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
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
  if (!handlerData || handlerData.length === 0) return null;

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
 * Handler returns: [{type, text, link, amount?, detail?}]
 */
function mapPendingTasks(handlerData) {
  if (!handlerData || handlerData.length === 0) return [];

  return handlerData.map((task) => {
    const mapped = {
      type: task.type || 'info',
      text: task.text || '',
      link: task.link || '',
    };
    if (task.amount) mapped.amount = task.amount;
    if (task.detail) mapped.detail = task.detail;
    if (task.count) mapped.count = task.count;
    if (task.labelKey) mapped.labelKey = task.labelKey;
    if (task.taskKey) mapped.taskKey = task.taskKey;

    // Only infer taskKey if not provided by handler
    if (!mapped.taskKey) {
      mapped.taskKey = inferPendingTaskKey(mapped);
    }

    return mapped;
  });
}

function inferPendingTaskKey(task) {
  const text = String(task?.text ?? '').toLowerCase();

  if (task?.taskKey) return task.taskKey;
  if (task?.link === '/sales-invoice' || text.includes('overdue invoices')) {
    return task?.count === 1 ? 'overdueInvoices' : 'overdueInvoices_plural';
  }
  if (task?.link === '/goods-shipment' || text.includes('pending shipment')) {
    return 'pendingShipments';
  }
  if (task?.link === '/purchase-order' || text.includes('purchase orders to confirm')) {
    return 'purchaseOrdersToConfirm';
  }
  if (task?.link === '/physical-inventory' || text.includes('low stock alert')) {
    return task?.count === 1 ? 'lowStockAlert' : 'lowStockAlerts';
  }
  return null;
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

function parseInvoiceDate(input) {
  if (!input) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const ddmmyyyy = String(input).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!ddmmyyyy) return null;

  const day = Number(ddmmyyyy[1]);
  const month = Number(ddmmyyyy[2]);
  const year = Number(ddmmyyyy[3]);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinLastDays(input, days) {
  const parsed = parseInvoiceDate(input);
  if (!parsed) return false;

  const now = new Date();
  const threshold = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return parsed >= threshold;
}

/**
 * Map recent invoices handler response.
 * Handler returns: [{id, client, date, amount, status}]
 */
function mapRecentInvoices(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;

  return handlerData
    .filter((inv) => COMPLETED_INVOICE_STATUSES.has(inv?.status))
    .filter((inv) => isWithinLastDays(inv?.date, 7))
    .map((inv) => ({
      id: inv.id || '',
      client: inv.client || '',
      date: inv.date || '',
      amount: inv.amount || 0,
      status: inv.status || '',
    }));
}

/**
 * Map best products handler response.
 * Handler returns: [{name, qty, amount}]
 */
function mapBestProducts(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  return handlerData.map((p) => ({
    name: p.name || '',
    qty: p.qty || 0,
    amount: p.amount || 0,
  }));
}

/**
 * Map best sellers handler response.
 * Handler returns: [{name, qty, uom}]
 */
function mapBestSellers(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  return handlerData.map((s) => ({
    name: s.name || '',
    qty: s.qty || 0,
    uom: s.uom || '',
  }));
}

/**
 * Map top clients handler response.
 * Handler returns: [{name, total}]
 */
function mapTopClients(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  return handlerData.map((c) => ({
    name: c.name || '',
    total: c.total || 0,
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
    },
    toPay: {
      count: obj.toPay?.count ?? 0,
      amount: obj.toPay?.amount ?? 0,
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiBase = useMemo(() => getApiBase(), []);

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
        fetchWidget(apiBase, token, 'kpis'),
        fetchWidget(apiBase, token, 'trends'),
        fetchWidget(apiBase, token, 'pending-tasks'),
        fetchWidget(apiBase, token, 'activity'),
        fetchWidget(apiBase, token, 'recent-invoices'),
        fetchWidget(apiBase, token, 'best-products'),
        fetchWidget(apiBase, token, 'best-sellers'),
        fetchWidget(apiBase, token, 'pending-amounts'),
        fetchWidget(apiBase, token, 'top-clients'),
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
        kpis: mappedKpis ?? empty.kpis,
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
  }, [token, apiBase]);

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

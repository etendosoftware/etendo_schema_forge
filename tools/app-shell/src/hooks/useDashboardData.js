import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  kpis as mockKpiValues,
  revenueTrend as mockRevenueTrend,
  pendingTasks as mockPendingTasks,
  recentMessages as mockRecentMessages,
} from '@generated/dashboard/generated/mockData';
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
  return {
    labels: trend.labels || [],
    values: trend.values || [],
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

/**
 * Map recent invoices handler response.
 * Handler returns: [{id, client, date, amount, status}]
 */
function mapRecentInvoices(handlerData) {
  if (!handlerData || handlerData.length === 0) return null;
  return handlerData.map((inv) => ({
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
 * Mock fallback
 * ----------------------------------------------------------------*/

const MOCK_RECENT_INVOICES = [
  { id: '1', client: 'Empresa ABC', date: '09-03-2026', amount: 8500, status: 'CO' },
  { id: '2', client: 'Restaurantes Luna', date: '08-03-2026', amount: 3200, status: 'DR' },
  { id: '3', client: 'Grupo XYZ', date: '07-03-2026', amount: 15600, status: 'CO' },
  { id: '4', client: 'Comercial Norte', date: '06-03-2026', amount: 4750, status: 'CO' },
  { id: '5', client: 'Distribuciones Sur', date: '05-03-2026', amount: 9200, status: 'DR' },
];

const MOCK_BEST_PRODUCTS = [
  { name: 'Cola 0,5L', qty: 10161, amount: 18290 },
  { name: 'Bebida Energética 0,5L', qty: 8009, amount: 14416 },
  { name: 'Zumo de Piña 0,5L', qty: 7970, amount: 11955 },
  { name: 'Agua Mineral 1L', qty: 6500, amount: 7800 },
  { name: 'Refresco Limón 0,33L', qty: 5200, amount: 6240 },
];

const MOCK_BEST_SELLERS = [
  { name: 'Cola 0,5L', qty: 10161, uom: 'Unit' },
  { name: 'Bebida Energética 0,5L', qty: 8009, uom: 'Unit' },
  { name: 'Zumo de Piña 0,5L', qty: 7970, uom: 'Unit' },
  { name: 'Agua sin Gas 1L', qty: 7331, uom: 'Unit' },
  { name: 'Limonada 0,5L', qty: 7329, uom: 'Unit' },
  { name: 'Vino Tinto 0,75L', qty: 7310, uom: 'Unit' },
  { name: 'Zumo de Pera 0,5L', qty: 7207, uom: 'Unit' },
  { name: 'Vino Blanco 0,75L', qty: 7155, uom: 'Unit' },
  { name: 'Vino Rosado 0,75L', qty: 7117, uom: 'Unit' },
  { name: 'Cola de Cereza 0,5L', qty: 6831, uom: 'Unit' },
];

const MOCK_PENDING_AMOUNTS = {
  toCollect: { count: 5, amount: 24900 },
  toPay: { count: 3, amount: 14650 },
};

function buildMockFallback() {
  const kpis = kpisConfig.map((cfg) => ({
    ...cfg,
    ...mockKpiValues[cfg.key],
    previousValue: Math.round(
      mockKpiValues[cfg.key].value / (1 + mockKpiValues[cfg.key].trend / 100)
    ),
  }));
  return {
    kpis,
    revenueTrend: mockRevenueTrend,
    pendingTasks: [],
    recentMessages: mockRecentMessages,
    recentInvoices: MOCK_RECENT_INVOICES,
    bestProducts: MOCK_BEST_PRODUCTS,
    bestSellers: MOCK_BEST_SELLERS,
    pendingAmounts: MOCK_PENDING_AMOUNTS,
  };
}

/* ------------------------------------------------------------------
 * Hook
 * ----------------------------------------------------------------*/

/**
 * Hook that provides all dashboard data.
 * Fetches from 4 dedicated widget handler endpoints in parallel,
 * falls back to mock on error.
 */
export function useDashboardData() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiBase = useMemo(() => getApiBase(), []);

  const fetchData = useCallback(async () => {
    if (!token) {
      setData(buildMockFallback());
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

      // If ALL handlers failed, fall back to full mock
      const allFailed = !kpisData && !trendsData && !pendingData && !activityData
        && !invoicesData && !bestProductsData && !bestSellersData && !pendingAmountsData
        && !topClientsData;
      if (allFailed) {
        console.warn('[dashboard] All widget endpoints failed — using mock data');
        setData(buildMockFallback());
        setLoading(false);
        return;
      }

      const mock = buildMockFallback();
      const mappedKpis = mapKpis(kpisData);
      const mappedTrends = mapTrends(trendsData);

      setData({
        kpis: mappedKpis ?? mock.kpis,
        revenueTrend: mappedTrends ?? mock.revenueTrend,
        expenseTrend: mock.revenueTrend.values.map(() => 0),
        topClients: mapTopClients(topClientsData) ?? [],
        pendingTasks: mapPendingTasks(pendingData),
        recentMessages: mapActivity(activityData) || mock.recentMessages,
        recentInvoices: mapRecentInvoices(invoicesData) ?? mock.recentInvoices,
        bestProducts: mapBestProducts(bestProductsData) ?? mock.bestProducts,
        bestSellers: mapBestSellers(bestSellersData) ?? mock.bestSellers,
        pendingAmounts: mapPendingAmounts(pendingAmountsData) ?? mock.pendingAmounts,
      });
    } catch (err) {
      console.warn('[dashboard] Unexpected error, using mock data:', err.message);
      setData(buildMockFallback());
    } finally {
      setLoading(false);
    }
  }, [token, apiBase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resolved = data ?? buildMockFallback();

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
    pendingAmounts: resolved.pendingAmounts ?? MOCK_PENDING_AMOUNTS,
    actions,
    loading,
    refresh: fetchData,
  };
}

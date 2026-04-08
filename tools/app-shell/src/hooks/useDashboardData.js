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
const LARGE_PAGE = 9999;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
 * Fetch ALL records from a NEO Headless endpoint (no server-side filters).
 * NEO does not reliably filter by field values — all filtering is done client-side.
 */
async function fetchAllRecords(apiBase, token, spec, entity) {
  const params = new URLSearchParams();
  params.set('_startRow', '0');
  params.set('_endRow', String(LARGE_PAGE));
  params.set('_sortBy', 'creationDate desc');

  const url = `${apiBase}/sws/neo/${spec}/${entity}?${params}`;
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
    if (!json?.response || json.response.status !== 0) {
      console.warn(`[dashboard] API error for ${spec}/${entity}:`, json?.response?.error ?? 'unknown');
      return null;
    }
    return json.response.data ?? [];
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[dashboard] Failed to fetch ${spec}/${entity}:`, err.message);
    return null;
  }
}

/** Parse a date string (ISO or Etendo dd-MM-yyyy format). */
function parseDate(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return new Date(str);
}

/** Check if a value is falsy in Etendo's boolean world (Y/N strings). */
function isFalsy(val) {
  return !val || val === 'N' || val === 'false' || val === 'No' || val === false;
}

/** Sum a numeric field across records. */
function sumField(records, field) {
  return records.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
}

/** Filter records whose dateField falls within a given year/month. */
function filterByMonth(records, dateField, year, month) {
  return records.filter((r) => {
    const d = parseDate(r[dateField]);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });
}

/** Format a dollar amount for display. */
function fmtAmount(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

/* ------------------------------------------------------------------
 * Aggregation: KPIs
 * ----------------------------------------------------------------*/

function buildKpis(allSalesInvoices, allPurchaseInvoices) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
  const prevYear = curMonth === 0 ? curYear - 1 : curYear;

  // Client-side filter: only completed invoices for revenue/expenses
  const completedSales = allSalesInvoices.filter((r) => r.documentStatus === 'CO');
  const completedPurchases = allPurchaseInvoices.filter((r) => r.documentStatus === 'CO');

  const curSales = filterByMonth(completedSales, 'invoiceDate', curYear, curMonth);
  const prevSales = filterByMonth(completedSales, 'invoiceDate', prevYear, prevMonth);
  const curPurchases = filterByMonth(completedPurchases, 'invoiceDate', curYear, curMonth);
  const prevPurchases = filterByMonth(completedPurchases, 'invoiceDate', prevYear, prevMonth);

  const revenue = sumField(curSales, 'grandTotalAmount');
  const prevRevenue = sumField(prevSales, 'grandTotalAmount');
  const expenses = sumField(curPurchases, 'grandTotalAmount');
  const prevExpenses = sumField(prevPurchases, 'grandTotalAmount');
  const profit = revenue - expenses;
  const prevProfit = prevRevenue - prevExpenses;

  // Pending invoices: draft sales + draft purchase invoices
  const pendingCount = allSalesInvoices.filter((r) => r.documentStatus === 'DR').length
    + allPurchaseInvoices.filter((r) => r.documentStatus === 'DR').length;

  function trendPct(cur, prev) {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  }

  const values = {
    revenueThisMonth: { value: revenue, trend: trendPct(revenue, prevRevenue), previousValue: prevRevenue },
    expensesThisMonth: { value: expenses, trend: trendPct(expenses, prevExpenses), previousValue: prevExpenses },
    netProfit: { value: profit, trend: trendPct(profit, prevProfit), previousValue: prevProfit },
    pendingInvoices: { value: pendingCount, trend: 0, previousValue: pendingCount },
  };

  return kpisConfig.map((cfg) => ({ ...cfg, ...values[cfg.key] }));
}

/* ------------------------------------------------------------------
 * Aggregation: Revenue Trend (12 months)
 * ----------------------------------------------------------------*/

function buildRevenueTrend(allSalesInvoices) {
  const completedSales = allSalesInvoices.filter((r) => r.documentStatus === 'CO');
  const now = new Date();
  const labels = [];
  const values = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTH_LABELS[d.getMonth()]);
    const monthRecords = filterByMonth(completedSales, 'invoiceDate', d.getFullYear(), d.getMonth());
    values.push(sumField(monthRecords, 'grandTotalAmount'));
  }

  return { labels, values };
}

/* ------------------------------------------------------------------
 * Aggregation: Expense Trend (12 months)
 * ----------------------------------------------------------------*/

function buildExpenseTrend(allPurchaseInvoices) {
  const completedPurchases = allPurchaseInvoices.filter((r) => r.documentStatus === 'CO');
  const now = new Date();
  const values = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthRecords = filterByMonth(completedPurchases, 'invoiceDate', d.getFullYear(), d.getMonth());
    values.push(sumField(monthRecords, 'grandTotalAmount'));
  }

  return values;
}

/* ------------------------------------------------------------------
 * Aggregation: Top Clients (last 12 months)
 * ----------------------------------------------------------------*/

function buildTopClients(allSalesInvoices) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const completedSales = allSalesInvoices.filter((r) => {
    if (r.documentStatus !== 'CO') return false;
    const d = parseDate(r.invoiceDate);
    return d && d >= cutoff;
  });
  const totals = {};
  for (const r of completedSales) {
    const name = r['businessPartner$_identifier'] || r.businessPartner || 'Unknown';
    totals[name] = (totals[name] || 0) + (Number(r.grandTotalAmount) || 0);
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }));
}

/* ------------------------------------------------------------------
 * Aggregation: Pending Tasks
 * ----------------------------------------------------------------*/

function buildPendingTasks(allSalesInvoices, allPurchaseInvoices, allPurchaseOrders, allShipments) {
  const draftSalesInvoices = allSalesInvoices.filter((r) => r.documentStatus === 'DR');
  const draftPurchaseInvoices = (allPurchaseInvoices ?? []).filter((r) => r.documentStatus === 'DR');

  // Draft shipments and purchase orders (client-side filter)
  const draftShipments = allShipments.filter((r) => r.documentStatus === 'DR');
  const draftPOs = allPurchaseOrders.filter((r) => r.documentStatus === 'DR');

  const tasks = [];

  if (draftSalesInvoices.length > 0) {
    tasks.push({
      type: 'info',
      text: `${draftSalesInvoices.length} Sales Invoice${draftSalesInvoices.length > 1 ? 's' : ''} pending`,
      link: '/sales-invoice',
      count: draftSalesInvoices.length,
      amount: fmtAmount(sumField(draftSalesInvoices, 'grandTotalAmount')),
    });
  }

  if (draftPurchaseInvoices.length > 0) {
    tasks.push({
      type: 'info',
      text: `${draftPurchaseInvoices.length} Purchase Invoice${draftPurchaseInvoices.length > 1 ? 's' : ''} pending`,
      link: '/purchase-invoice',
      count: draftPurchaseInvoices.length,
      amount: fmtAmount(sumField(draftPurchaseInvoices, 'grandTotalAmount')),
    });
  }

  if (draftShipments.length > 0) {
    tasks.push({
      type: 'info',
      text: `${draftShipments.length} orders pending shipment`,
      link: '/goods-shipment',
      count: draftShipments.length,
    });
  }

  if (draftPOs.length > 0) {
    tasks.push({
      type: 'info',
      text: `${draftPOs.length} purchase orders to confirm`,
      link: '/purchase-order',
      count: draftPOs.length,
    });
  }

  return tasks;
}

/* ------------------------------------------------------------------
 * Aggregation: Recent Invoices (last 5)
 * ----------------------------------------------------------------*/

function buildRecentInvoices(allSalesInvoices) {
  return [...allSalesInvoices]
    .sort((a, b) => {
      const da = parseDate(a.invoiceDate);
      const db = parseDate(b.invoiceDate);
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    })
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      client: r['businessPartner$_identifier'] || 'Unknown',
      date: r.invoiceDate,
      amount: Number(r.grandTotalAmount) || 0,
      status: r.documentStatus,
    }));
}

/* ------------------------------------------------------------------
 * Aggregation: Best Products (top 5 by revenue in order lines)
 * ----------------------------------------------------------------*/

/**
 * Build a Map<orderId, dateOrdered> from sales order headers.
 * Used to join order lines (which have no date) with their parent order.
 */
function buildOrderDateMap(allSalesOrders) {
  const map = new Map();
  if (!allSalesOrders) return map;
  if (allSalesOrders.length > 0) {
    console.debug('[dashboard] Sample sales order header fields:', Object.keys(allSalesOrders[0]));
    console.debug('[dashboard] Sample sales order header:', allSalesOrders[0]);
  }
  for (const o of allSalesOrders) {
    const date = o.dateOrdered || o.orderDate;
    if (o.id && date) map.set(o.id, date);
  }
  console.debug(`[dashboard] orderDateMap built: ${map.size} entries`);
  return map;
}

/**
 * Returns the cutoff date for a 12-month window (first day of month 11 months ago).
 * If orderDateMap is empty we cannot filter — return null so callers include everything.
 */
function get12MonthCutoff(orderDateMap) {
  if (!orderDateMap || orderDateMap.size === 0) return null;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 11, 1);
}

function buildBestProducts(allOrderLines, orderDateMap) {
  if (!allOrderLines || allOrderLines.length === 0) return [];
  const cutoff = get12MonthCutoff(orderDateMap);

  // Debug: log field names of the first order line to verify FK field name
  if (allOrderLines.length > 0) {
    console.debug('[dashboard] Sample order line fields:', Object.keys(allOrderLines[0]));
    console.debug('[dashboard] Sample order line:', allOrderLines[0]);
  }

  const totals = {};
  for (const line of allOrderLines) {
    if (cutoff) {
      // C_OrderLine.C_Order_ID is exposed as 'salesOrder' in NEO (Etendo OB property name)
      const orderId = line.salesOrder || line.order || line.salesOrderId || line.cOrderId;
      const rawDate = orderId ? orderDateMap.get(orderId) : undefined;
      const d = rawDate ? parseDate(rawDate) : null;
      // If no date found, exclude the line (conservative) — avoids pulling all-time history
      if (!d || d < cutoff) continue;
    }
    const name = line['product$_identifier'] || line.product || 'Unknown';
    if (!name || name === 'Unknown') continue;
    if (!totals[name]) totals[name] = { name, qty: 0, amount: 0 };
    totals[name].qty += Number(line.orderedQuantity) || 0;
    totals[name].amount += Number(line.lineNetAmount) || 0;
  }
  return Object.values(totals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

/* ------------------------------------------------------------------
 * Aggregation: Best Sellers (top 10 by quantity, with UOM)
 * ----------------------------------------------------------------*/

function buildBestSellers(allOrderLines, orderDateMap) {
  if (!allOrderLines || allOrderLines.length === 0) return [];
  const cutoff = get12MonthCutoff(orderDateMap);
  const totals = {};
  for (const line of allOrderLines) {
    if (cutoff) {
      const orderId = line.salesOrder || line.order || line.salesOrderId || line.cOrderId;
      const rawDate = orderId ? orderDateMap.get(orderId) : undefined;
      const d = rawDate ? parseDate(rawDate) : null;
      if (!d || d < cutoff) continue;
    }
    const name = line['product$_identifier'] || line.product || 'Unknown';
    if (!name || name === 'Unknown') continue;
    const uom = line['uOM$_identifier'] || line['uom$_identifier'] || '';
    if (!totals[name]) totals[name] = { name, qty: 0, uom };
    totals[name].qty += Number(line.orderedQuantity) || 0;
  }
  return Object.values(totals)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
}

/* ------------------------------------------------------------------
 * Aggregation: Pending Amounts (to collect / to pay)
 * ----------------------------------------------------------------*/

function buildPendingAmounts(allSalesInvoices, allPurchaseInvoices) {
  const draftSales = allSalesInvoices.filter((r) => r.documentStatus === 'DR');
  const draftPurchases = (allPurchaseInvoices || []).filter((r) => r.documentStatus === 'DR');
  return {
    toCollect: { count: draftSales.length, amount: sumField(draftSales, 'grandTotalAmount') },
    toPay: { count: draftPurchases.length, amount: sumField(draftPurchases, 'grandTotalAmount') },
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
    pendingTasks: mockPendingTasks,
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
 * Fetches all records from NEO Headless CRUD endpoints in parallel,
 * filters and aggregates client-side, falls back to mock on error.
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
      // Fetch all records — filtering is done client-side because NEO
      // does not reliably apply field-level query parameters as filters.
      const [salesRes, purchasesRes, posRes, shipmentsRes, orderLinesRes, salesOrdersRes] = await Promise.allSettled([
        fetchAllRecords(apiBase, token, 'sales-invoice', 'header'),
        fetchAllRecords(apiBase, token, 'purchase-invoice', 'invoice'),
        fetchAllRecords(apiBase, token, 'purchase-order', 'order'),
        fetchAllRecords(apiBase, token, 'goods-shipment', 'goodsShipment'),
        fetchAllRecords(apiBase, token, 'sales-order', 'lines'),
        fetchAllRecords(apiBase, token, 'sales-order', 'header'),
      ]);

      const salesInvoices   = salesRes.status        === 'fulfilled' ? salesRes.value        : null;
      const purchaseInvoices= purchasesRes.status    === 'fulfilled' ? purchasesRes.value    : null;
      const purchaseOrders  = posRes.status          === 'fulfilled' ? posRes.value          : null;
      const shipments       = shipmentsRes.status    === 'fulfilled' ? shipmentsRes.value    : null;
      const orderLines      = orderLinesRes.status   === 'fulfilled' ? orderLinesRes.value   : null;
      const salesOrders     = salesOrdersRes.status  === 'fulfilled' ? salesOrdersRes.value  : null;

      // Map orderId → dateOrdered for joining with order lines (C_OrderLine has no date)
      const orderDateMap = buildOrderDateMap(salesOrders);

      if (!salesInvoices && !purchaseInvoices && !purchaseOrders && !shipments && !orderLines && !salesOrders) {
        console.warn('[dashboard] All API queries failed — using mock data');
        setData(buildMockFallback());
        setLoading(false);
        return;
      }

      const mock = buildMockFallback();

      setData({
        kpis: salesInvoices
          ? buildKpis(salesInvoices, purchaseInvoices ?? [])
          : mock.kpis,
        revenueTrend: salesInvoices
          ? buildRevenueTrend(salesInvoices)
          : mock.revenueTrend,
        expenseTrend: purchaseInvoices
          ? buildExpenseTrend(purchaseInvoices)
          : mock.revenueTrend.values.map(() => 0),
        topClients: salesInvoices
          ? buildTopClients(salesInvoices)
          : [],
        pendingTasks: (salesInvoices && purchaseOrders && shipments)
          ? buildPendingTasks(salesInvoices, purchaseInvoices, purchaseOrders, shipments)
          : mock.pendingTasks,
        recentMessages: mockRecentMessages,
        recentInvoices: salesInvoices
          ? buildRecentInvoices(salesInvoices)
          : mock.recentInvoices,
        bestProducts: orderLines
          ? buildBestProducts(orderLines, orderDateMap)
          : mock.bestProducts,
        bestSellers: orderLines
          ? buildBestSellers(orderLines, orderDateMap)
          : mock.bestSellers,
        pendingAmounts: salesInvoices
          ? buildPendingAmounts(salesInvoices, purchaseInvoices)
          : mock.pendingAmounts,
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

import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createQueryKey, useOptionalDataCache } from '@etendosoftware/app-shell-core/data';

import { useApiFetch } from '@/auth/useApiFetch.js';
/* eslint-disable react/prop-types */

/**
 * Shared financial-summary state for the Contacts detail view. The horizontal
 * summary widget is rendered twice (General tab via the headerContent slot, and at
 * the top of ContactsFinancialPanel) and hosts the period button, so the instances
 * coordinate the selected period and the fetched bp-stats / bp-trend data through
 * this context.
 *
 * Data is fetched lazily: the summary widget reports the active record id via
 * `setRecordId`, which triggers the fetch. The period button only reads/writes
 * `period`; the chart slices the trend arrays by the selected period.
 *
 * ETP-5600: bp-stats is period-aware — it is requested with `months` (3M → 3,
 * 6M → 6) and refetched when the period changes, so the summary amounts and the
 * variation chips follow the selector. bp-trend always returns the full series
 * and is NOT refetched on a period change (the chart slices it client-side).
 * With `months` the bp-stats `data` array carries two extra KPI entries,
 * `revenue` and `expenses` (`{ value, previousValue, trend, hasPrevious }`),
 * next to the unchanged `revenueThisMonth` / `expensesThisMonth`.
 */
const ContactsFinanceContext = createContext(null);

const EMPTY_TREND = { labels: [], revenue: [], expenses: [] };

/** Selector period → `months` query parameter of bp-stats. */
export const PERIOD_MONTHS = { '3M': 3, '6M': 6 };

export function periodToMonths(period) {
  return PERIOD_MONTHS[period] ?? PERIOD_MONTHS['3M'];
}

export function ContactsFinanceProvider({ token, apiBaseUrl, children }) {
  const [period, setPeriod] = useState('3M');
  const [recordId, setRecordId] = useState(null);
  const [stats, setStats] = useState(null); // null = loading, [] = loaded/empty
  const [trend, setTrend] = useState(null);
  const months = periodToMonths(period);

  // ETP-4564: route the KPI reads through the shared cache so reopening a contact
  // within the freshness window reuses the data instead of refetching. Falls back
  // to a direct fetch when no DataProvider is mounted (preserves prior behavior).
  const dataCache = useOptionalDataCache();
  const cacheScope = dataCache?.scope;
  const apiFetch = useApiFetch(apiBaseUrl);

  // A KPI query is identified by its endpoint kind (bp-stats / bp-trend), the
  // business partner id and — for bp-stats — the requested `months` (carried in
  // `filters` so 6M is never served from the 3M entry), isolated by
  // session/org/role via the provider scope. `{ entity: kind }` invalidation
  // still matches every period.
  const runKpi = useCallback((kind, id, { force = false, params = null } = {}) => {
    const qs = new URLSearchParams({ businessPartnerId: id, ...(params ?? {}) }).toString();
    const fetcher = (signal) => apiFetch(`/${kind}?${qs}`, { signal })
      .then(r => (r.ok ? r.json() : null));
    if (dataCache?.cache && cacheScope) {
      const key = createQueryKey({
        ...cacheScope, apiBase: apiBaseUrl, spec: 'contacts', entity: kind, recordId: id,
        ...(params ? { filters: params } : {}),
      });
      return dataCache.cache.fetchQuery({ key, fetcher: ({ signal }) => fetcher(signal), force, staleTime: dataCache.recordStaleTime });
    }
    return fetcher();
  }, [apiFetch, apiBaseUrl, dataCache, cacheScope]);

  // ETP-4576: do NOT gate the KPI load on `token`. Under the cookie credential
  // mode the bearer token is empty by design (the browser sends the session
  // cookie), so a `!token` guard would permanently skip the fetch and leave the
  // KPI panel silently empty. apiFetch carries auth for both modes.
  // A quick 3M → 6M → 3M toggle can resolve out of order; only the latest
  // bp-stats request may write the state.
  const statsSeq = useRef(0);
  const loadStats = useCallback((id, m, { force = false } = {}) => {
    const seq = ++statsSeq.current;
    setStats(null);
    if (!id || !apiBaseUrl) return;
    const apply = (value) => { if (seq === statsSeq.current) setStats(value); };
    runKpi('bp-stats', id, { force, params: { months: String(m) } })
      .then(data => apply(data?.response?.data ?? []))
      .catch(() => apply([]));
  }, [apiBaseUrl, runKpi]);

  const loadTrend = useCallback((id, { force = false } = {}) => {
    setTrend(null);
    if (!id || !apiBaseUrl) return;
    runKpi('bp-trend', id, { force })
      .then(data => setTrend(data?.response?.data ?? EMPTY_TREND))
      .catch(() => setTrend(EMPTY_TREND));
  }, [apiBaseUrl, runKpi]);

  // bp-stats follows the record AND the period; bp-trend only the record.
  useEffect(() => { loadStats(recordId, months); }, [recordId, months, loadStats]);
  useEffect(() => { loadTrend(recordId); }, [recordId, loadTrend]);

  // Force a network revalidation of the KPIs (used after finance mutations).
  const refresh = useCallback(() => {
    loadStats(recordId, months, { force: true });
    loadTrend(recordId, { force: true });
  }, [loadStats, loadTrend, recordId, months]);

  const value = useMemo(() => ({
    period, setPeriod,
    recordId, setRecordId,
    stats, trend, refresh,
  }), [period, recordId, stats, trend, refresh]);

  return (
    <ContactsFinanceContext.Provider value={value}>
      {children}
    </ContactsFinanceContext.Provider>
  );
}

export function useContactsFinance({ optional = false } = {}) {
  const ctx = useContext(ContactsFinanceContext);
  if (!ctx && !optional) throw new Error('useContactsFinance must be used inside ContactsFinanceProvider');
  return ctx;
}

/**
 * Keep the provider's recordId in sync with the record currently shown in the
 * detail view. No-op (clears) when there is no saved record yet.
 */
export function useSyncFinanceRecordId(recordId, options = {}) {
  const finance = useContactsFinance(options);
  const setRecordId = finance?.setRecordId;
  const syncId = useCallback(() => {
    setRecordId?.(recordId ?? null);
  }, [setRecordId, recordId]);
  useEffect(() => { syncId(); }, [syncId]);
}

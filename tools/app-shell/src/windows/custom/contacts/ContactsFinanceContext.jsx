import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { createQueryKey, useOptionalDataCache } from '@etendosoftware/app-shell-core/data';

/* eslint-disable react/prop-types */

/**
 * Shared financial-summary state for the Contacts detail view. The horizontal
 * summary widget (headerContent slot) and the period button (tabsBarRight slot)
 * are rendered in separate React subtrees, so they coordinate the selected
 * period and the fetched bp-stats / bp-trend data through this context.
 *
 * Data is fetched lazily: the summary widget reports the active record id via
 * `setRecordId`, which triggers the fetch. The period button only reads/writes
 * `period`; the chart slices the trend arrays by the selected period.
 */
const ContactsFinanceContext = createContext(null);

const EMPTY_TREND = { labels: [], revenue: [], expenses: [] };

export function ContactsFinanceProvider({ token, apiBaseUrl, children }) {
  const [period, setPeriod] = useState('3M');
  const [recordId, setRecordId] = useState(null);
  const [stats, setStats] = useState(null); // null = loading, [] = loaded/empty
  const [trend, setTrend] = useState(null);

  // ETP-4564: route the KPI reads through the shared cache so reopening a contact
  // within the freshness window reuses the data instead of refetching. Falls back
  // to a direct fetch when no DataProvider is mounted (preserves prior behavior).
  const dataCache = useOptionalDataCache();
  const cacheScope = dataCache?.scope;

  // A KPI query is identified by its endpoint kind (bp-stats / bp-trend) and the
  // business partner id, isolated by session/org/role via the provider scope.
  const runKpi = useCallback((kind, id, { force = false } = {}) => {
    const headers = { Authorization: `Bearer ${token}` };
    const fetcher = (signal) => fetch(`${apiBaseUrl}/${kind}?businessPartnerId=${id}`, { headers, signal })
      .then(r => (r.ok ? r.json() : null));
    if (dataCache?.cache && cacheScope) {
      const key = createQueryKey({ ...cacheScope, apiBase: apiBaseUrl, spec: 'contacts', entity: kind, recordId: id });
      return dataCache.cache.fetchQuery({ key, fetcher: ({ signal }) => fetcher(signal), force, staleTime: dataCache.recordStaleTime });
    }
    return fetcher();
  }, [token, apiBaseUrl, dataCache, cacheScope]);

  const load = useCallback((id, { force = false } = {}) => {
    if (!id || !token || !apiBaseUrl) {
      setStats(null);
      setTrend(null);
      return;
    }
    setStats(null);
    setTrend(null);
    runKpi('bp-stats', id, { force })
      .then(data => setStats(data?.response?.data ?? []))
      .catch(() => setStats([]));
    runKpi('bp-trend', id, { force })
      .then(data => setTrend(data?.response?.data ?? EMPTY_TREND))
      .catch(() => setTrend(EMPTY_TREND));
  }, [token, apiBaseUrl, runKpi]);

  useEffect(() => { load(recordId); }, [recordId, load]);

  // Force a network revalidation of the KPIs (used after finance mutations).
  const refresh = useCallback(() => load(recordId, { force: true }), [load, recordId]);

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

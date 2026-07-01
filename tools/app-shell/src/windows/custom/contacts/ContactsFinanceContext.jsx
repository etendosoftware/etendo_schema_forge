import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

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

  useEffect(() => {
    if (!recordId || !token || !apiBaseUrl) {
      setStats(null);
      setTrend(null);
      return;
    }
    setStats(null);
    setTrend(null);
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${apiBaseUrl}/bp-stats?businessPartnerId=${recordId}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => setStats(data?.response?.data ?? []))
      .catch(() => setStats([]));
    fetch(`${apiBaseUrl}/bp-trend?businessPartnerId=${recordId}`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(data => setTrend(data?.response?.data ?? EMPTY_TREND))
      .catch(() => setTrend(EMPTY_TREND));
  }, [recordId, token, apiBaseUrl]);

  const value = useMemo(() => ({
    period, setPeriod,
    recordId, setRecordId,
    stats, trend,
  }), [period, recordId, stats, trend]);

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

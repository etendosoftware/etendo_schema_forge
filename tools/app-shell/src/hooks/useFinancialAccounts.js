import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';

const FETCH_TIMEOUT_MS = 10000;
const ENDPOINT = '/sws/neo/financial-accounts-page';

function getApiBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx === -1) return import.meta.env.VITE_API_BASE || '';
  return path.substring(0, webIdx);
}

async function fetchAccountsPayload(apiBase, token, signal) {
  const url = `${apiBase}${ENDPOINT}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data = json?.response?.data;
  if (!data) {
    throw new Error('Unexpected response shape from financial-accounts-page');
  }
  return data;
}

const EMPTY_SUMMARY = {
  totalBalance: 0,
  byCurrency: [],
  pending: { accountsWithPending: 0, suggestionsReady: 0, byRule: 0 },
};

export function useFinancialAccounts() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apiBase = useMemo(() => getApiBase(), []);

  const load = useCallback(async () => {
    if (!token) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccountsPayload(apiBase, token, ctrl.signal);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[financial-accounts] failed to load:', err.message);
        setError(err);
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    load();
  }, [load]);

  return { accounts, summary, loading, error, reload: load };
}

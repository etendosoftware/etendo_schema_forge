import { useCallback, useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';

const ENDPOINT = '/sws/go/demo-data-transfer';
const POLL_INTERVAL_MS = 2_000;

function isTerminal(status) {
  return ['COMPLETED', 'SKIPPED', 'NOT_REQUESTED'].includes(status);
}

/**
 * Reads the server-owned transfer job for the productive tenant in the current session.
 *
 * The job deliberately outlives this component. Polling is only a view refresh: closing the
 * tab never cancels work, and reopening First Steps resumes from the persisted projection.
 */
export function useDemoDataTransfer() {
  const apiFetch = useApiFetch(getApiBase());
  const [state, setState] = useState({ status: 'LOADING', products: {}, contacts: {} });
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch(ENDPOINT);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json();
      setState(next ?? { status: 'NOT_REQUESTED', products: {}, contacts: {} });
      setError(false);
      return next;
    } catch {
      // A missing/temporarily unavailable migration endpoint must not hold the whole checklist
      // behind its loading gate forever. Keep the error separately so the row can explain it.
      setState((current) => current.status === 'LOADING'
        ? { status: 'NOT_REQUESTED', products: {}, contacts: {} } : current);
      setError(true);
      return null;
    }
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const poll = async () => {
      const next = await refresh();
      if (!cancelled && next && !isTerminal(next.status)) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  const retry = useCallback(async () => {
    const response = await apiFetch(`${ENDPOINT}/retry`, { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = await response.json();
    setState(next ?? { status: 'RUNNING', products: {}, contacts: {} });
    setError(false);
    return next;
  }, [apiFetch]);

  return { ...state, error, refresh, retry, loading: state.status === 'LOADING' };
}

export default useDemoDataTransfer;

import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from './useNeoResource';
import { openCenteredPopup } from '@/lib/popupWindow.js';

import { buildHeaders } from '@/auth/api.js';
const BASE_PATH = '/sws/neo/financial-account-bank-connection';

/** SPA route the Salt Edge popup returns to (see BankConnectionCallbackPage). */
export const BANK_CONNECTION_CALLBACK_PATH = '/financial-account/bank-connection-callback';
/** localStorage key the callback route uses to hand the connection id back to the opener. */
export const BANK_CONNECTION_KEY = 'bankConnection:lastConnectionId';

function buildQuery(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Opens a centered popup window synchronously (must be called inside the click handler so the
 * browser does not block it), then navigates it to the Salt Edge connect URL resolved by
 * {@code getConnectUrl} and resolves once the {@link BankConnectionCallbackPage} hands back the connection
 * id (via postMessage / localStorage) or the user closes the popup.
 *
 * @param {() => Promise<string>} getConnectUrl resolves the Salt Edge connect/reconnect URL
 * @returns {Promise<string|null>} the Salt Edge connection id, or null if the popup was closed
 *   without completing the bank authentication
 */
export async function launchSaltEdgePopup(getConnectUrl) {
  const popup = openCenteredPopup('', 'bank-connection-connect');
  if (!popup) {
    throw new Error('POPUP_BLOCKED');
  }
  let url;
  try {
    url = await getConnectUrl();
  } catch (err) {
    popup.close();
    throw err;
  }
  if (!url) {
    popup.close();
    throw new Error('NO_CONNECT_URL');
  }
  popup.location.href = url;
  return waitForConnection(popup);
}

function waitForConnection(popup) {
  return new Promise((resolve) => {
    try { localStorage.removeItem(BANK_CONNECTION_KEY); } catch { /* ignore */ }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
      try { localStorage.removeItem(BANK_CONNECTION_KEY); } catch { /* ignore */ }
      resolve(value);
    };
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'bank-connection-connected' && event.data.connectionId) {
        finish(event.data.connectionId);
      }
    };
    const timer = setInterval(() => {
      let stored = null;
      try { stored = localStorage.getItem(BANK_CONNECTION_KEY); } catch { /* ignore */ }
      if (stored) {
        finish(stored);
        return;
      }
      if (popup.closed) {
        finish(null);
      }
    }, 500);
    window.addEventListener('message', onMessage);
  });
}

/**
 * Bank connection (PSD2 / Salt Edge) actions backed by the {@code financial-account-bank-connection} NEO bridge. All calls
 * go through the bridge in com.etendoerp.go, which delegates to the PSD2 module helpers.
 *
 * @returns {{
 *   connect: () => Promise<string>,
 *   fetchAccounts: (connectionId: string, type?: string, financialAccountId?: string) => Promise<Array<object>>,
 *   link: (payload: object) => Promise<object>,
 *   createAndLink: (payload: object) => Promise<object>,
 *   reconnect: (financialAccountId: string) => Promise<string>,
 *   finishReconnect: (financialAccountId: string, connectionId: string) => Promise<object>,
 *   disconnect: (financialAccountId: string, opts?: {permanentDeletion?: boolean}) => Promise<object>,
 *   sync: (financialAccountId: string) => Promise<object>,
 *   saveImportSettings: (payload: object) => Promise<object>,
 *   fetchStatus: (financialAccountId: string) => Promise<object>,
 *   loading: boolean,
 *   error: Error|null,
 * }}
 */
export function useBankConnectionActions() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(async (method, action, { query = {}, body = null, timeoutMs = 45000 } = {}) => {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = `${getApiBase()}${BASE_PATH}${buildQuery({ action, ...query })}`;
      const res = await fetch(url, {
        method,
        headers: buildHeaders(token),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      if (!res.ok) {
        const err = new Error(json?.error?.message || `HTTP ${res.status}`);
        err.status = json?.error?.status ?? res.status;
        throw err;
      }
      return json?.response?.data ?? {};
    } catch (err) {
      // Surface a clear message when the bank service (Salt Edge middleware) is unreachable
      // and the request is aborted by the timeout, instead of a generic abort error.
      const finalErr = err.name === 'AbortError' ? new Error('BANK_CONNECTION_TIMEOUT') : err;
      setError(finalErr);
      throw finalErr;
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [token]);

  const connect = useCallback(
    // financialAccountId is optional: when connecting an existing account the bridge uses it to
    // preselect the account's known bank (chosen at offline creation), skipping the bank picker.
    async (financialAccountId) => {
      const body = financialAccountId ? { financialAccountId } : {};
      return (await call('POST', 'connect', { body })).connectUrl;
    },
    [call],
  );

  const fetchAccounts = useCallback(
    async (connectionId, type, financialAccountId) => {
      const data = await call('GET', 'accounts', { query: { connectionId, type, financialAccountId } });
      return {
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        providerName: data.providerName || '',
        providerLogoUrl: data.providerLogoUrl || '',
      };
    },
    [call],
  );

  const fetchProviders = useCallback(
    async (country, q) => {
      // Short timeout so the bank picker falls back to its static catalog quickly when the
      // Salt Edge middleware is slow/unreachable, instead of hanging the picker.
      const data = await call('GET', 'providers', { query: { country, q }, timeoutMs: 15000 });
      return Array.isArray(data.providers) ? data.providers : [];
    },
    [call],
  );

  const link = useCallback((payload) => call('POST', 'link', { body: payload }), [call]);

  const createAndLink = useCallback(
    (payload) => call('POST', 'createAndLink', { body: payload }),
    [call],
  );

  /**
   * Finalizes a reconnect after the Salt Edge popup returns its connection id.
   *
   * Required because the popup's `return_to` is an app route that only relays the id — unlike
   * Classic, where Salt Edge redirects into a servlet that reactivates the connection itself.
   * Without this call the connection stays inactive and the account keeps showing as deactivated.
   */
  const finishReconnect = useCallback(
    (financialAccountId, connectionId) =>
      call('POST', 'reconnect-callback', { body: { financialAccountId, connectionId } }),
    [call],
  );

  const reconnect = useCallback(
    async (financialAccountId) =>
      (await call('POST', 'reconnect', { body: { financialAccountId } })).reconnectUrl,
    [call],
  );

  /**
   * Disconnects a bank connection in one of two modes:
   * - `permanentDeletion: false` (default) — soft disconnect: the connection is deactivated but
   *   the Salt Edge link is kept, so the account can be reconnected later without losing history.
   * - `permanentDeletion: true` — irreversibly deletes the connection on the Salt Edge side.
   *
   * The bridge reports what actually happened (`permanent` / `reconnectable`) rather than echoing
   * the request, because a connection shared with other accounts is always unlinked, never
   * deactivated.
   */
  const disconnect = useCallback(
    (financialAccountId, { permanentDeletion = false } = {}) =>
      call('POST', 'disconnect', { body: { financialAccountId, permanentDeletion } }),
    [call],
  );

  const sync = useCallback(
    (financialAccountId) => call('POST', 'sync', { body: { financialAccountId } }),
    [call],
  );

  const saveImportSettings = useCallback(
    (payload) => call('POST', 'import-settings', { body: payload }),
    [call],
  );

  const fetchStatus = useCallback(
    (financialAccountId) => call('GET', 'status', { query: { financialAccountId } }),
    [call],
  );

  return {
    connect,
    fetchAccounts,
    fetchProviders,
    link,
    createAndLink,
    reconnect,
    finishReconnect,
    disconnect,
    sync,
    saveImportSettings,
    fetchStatus,
    loading,
    error,
  };
}

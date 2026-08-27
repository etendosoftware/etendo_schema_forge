import { useEffect, useState } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';
/**
 * The single, canonical "is this year closed" derivation for the whole Calendar window —
 * reused by YearCloseStatusBadge (detail header pill), YearTableWithCloseStatus (list column),
 * and index.jsx's menuActions override (Cerrar Año / Deshacer Cierre de Año visibility) so none
 * of the three can ever disagree. A year is closed iff the `end-year-close` spec's `accounting`
 * endpoint returns at least one row for it (see YearAccountingHandler.java: only Fact_Acct rows
 * with a year-end closing/regularization type are returned there).
 *
 * @param {string|undefined} yearId
 * @param {string} token
 * @param {string} endYearCloseApiBaseUrl - already rewritten to the `end-year-close` spec base
 *   (e.g. `.../end-year-close`), NOT the year header's own `.../fiscal-calendar` base.
 * @returns {boolean|undefined|null} `undefined` while loading, `null` on error, else the
 *   resolved boolean.
 */
export function useYearCloseStatus(yearId, token, endYearCloseApiBaseUrl) {
  const [closed, setClosed] = useState(undefined);
  const apiFetch = useApiFetch(endYearCloseApiBaseUrl);

  useEffect(() => {
    if (!yearId) {
      setClosed(undefined);
      return;
    }
    let cancelled = false;
    setClosed(undefined);
    apiFetch(`/accounting?year=${yearId}`, { token, on401: 'ignore' })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setClosed((body.data ?? []).length > 0);
      })
      .catch(() => {
        if (!cancelled) setClosed(null);
      });
    return () => {
      cancelled = true;
    };
  }, [yearId, apiFetch, token]);

  return closed;
}

import { useCallback, useEffect, useState } from 'react';

// Same classic-Openbravo-datasource caveat documented in PeriodsExpandablePanel.jsx: a plain
// `?year=<id>` query param is silently ignored by NEO's generic DefaultJsonDataService, which
// backs `periodControl`'s list endpoint — the `criteria` JSON-array param is the real mechanism.
// Duplicated here (not imported) rather than extracted, matching this custom window's existing
// convention of small, independently-orchestrated per-panel helpers (see PeriodsExpandablePanel.jsx,
// AccountingPanel.jsx) instead of a shared cross-file utility for a two-line query builder.
function yearCriteria(yearId) {
  return `criteria=${encodeURIComponent(JSON.stringify([{ fieldName: 'year', operator: 'equals', value: yearId }]))}`;
}

/**
 * Whether a fiscal year already has at least one `C_Period` record — used to hide the
 * "Create Periods" button (`year.processNow`) once periods exist, so re-running Create Periods
 * on an already-populated year (which the backend tolerates, see calendar.md manual verification
 * step 7) isn't offered as a header action in the first place.
 *
 * @param {string|undefined} yearId
 * @param {string} token
 * @param {string} periodControlApiBaseUrl - already rewritten to the `open-close-period-control`
 *   spec base (e.g. `.../open-close-period-control`), NOT the year header's own `.../fiscal-calendar` base.
 * @returns {boolean|undefined|null} `undefined` while loading, `null` on error, else the resolved boolean.
 */
export function useYearHasPeriods(yearId, token, periodControlApiBaseUrl) {
  const [hasPeriods, setHasPeriods] = useState(undefined);

  const load = useCallback(async () => {
    if (!yearId) {
      setHasPeriods(undefined);
      return;
    }
    try {
      const res = await fetch(`${periodControlApiBaseUrl}/periodControl?${yearCriteria(yearId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const body = await res.json();
      // periodControl's LIST goes through NEO's generic DefaultJsonDataService, which wraps rows
      // as { response: { data: [...] } } — matches PeriodsExpandablePanel.jsx's fetchJson fallback
      // (also tolerates a flat { data: [...] } or bare array shape).
      const rows = body?.response?.data ?? body?.data ?? (Array.isArray(body) ? body : []);
      setHasPeriods(rows.length > 0);
    } catch {
      setHasPeriods(null);
    }
  }, [yearId, periodControlApiBaseUrl, token]);

  useEffect(() => {
    setHasPeriods(undefined);
    load();
  }, [load]);

  // Refresh right after "Create Periods" succeeds — the same cross-subtree `neo:processSuccess`
  // signal PeriodsExpandablePanel.jsx already listens for, filtered on `recordId` only (not
  // `entity`), matching that same convention. Needed even though this hook lives in the same
  // subtree (YearPage) that fires the process: the header re-render already happened by the time
  // the process resolves, so without this the button would only disappear after a manual refresh.
  useEffect(() => {
    if (!yearId) return undefined;
    function onProcessSuccess(e) {
      if (String(e?.detail?.recordId) !== String(yearId)) return;
      load();
    }
    window.addEventListener('neo:processSuccess', onProcessSuccess);
    return () => window.removeEventListener('neo:processSuccess', onProcessSuccess);
  }, [yearId, load]);

  return hasPeriods;
}

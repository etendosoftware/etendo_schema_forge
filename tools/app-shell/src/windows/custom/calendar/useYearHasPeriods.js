import { useCallback, useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
 * @param {string} periodControlApiBaseUrl - already rewritten to the `open-close-period-control`
 *   spec base (e.g. `.../open-close-period-control`), NOT the year header's own `.../fiscal-calendar` base.
 * @returns {boolean|undefined|null} `undefined` while loading, `null` on error, else the resolved boolean.
 */
export function useYearHasPeriods(yearId, periodControlApiBaseUrl) {
  const [hasPeriods, setHasPeriods] = useState(undefined);
  const apiFetch = useApiFetch(periodControlApiBaseUrl);

  // `isStale` lets a caller opt into the cancellation-guard convention used elsewhere in this
  // codebase (e.g. `useViewerRole.js`'s `cancelled` flag) without forcing it on every call site:
  // the mount/`yearId`-change effect below passes one so a late-resolving response from a
  // superseded `yearId` (or one that arrives after unmount) can't overwrite fresher state; the
  // `neo:processSuccess` effect further down doesn't need it — it's a single fire-and-refresh
  // call, not one that gets superseded by a new call for a different `yearId`.
  const load = useCallback(async (isStale = () => false) => {
    if (!yearId) {
      if (!isStale()) setHasPeriods(undefined);
      return;
    }
    try {
      const res = await apiFetch(`/periodControl?${yearCriteria(yearId)}`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const body = await res.json();
      // periodControl's LIST goes through NEO's generic DefaultJsonDataService, which wraps rows
      // as { response: { data: [...] } } — matches PeriodsExpandablePanel.jsx's fetchJson fallback
      // (also tolerates a flat { data: [...] } or bare array shape).
      const rows = body?.response?.data ?? body?.data ?? (Array.isArray(body) ? body : []);
      if (!isStale()) setHasPeriods(rows.length > 0);
    } catch {
      if (!isStale()) setHasPeriods(null);
    }
  }, [yearId, apiFetch]);

  useEffect(() => {
    let cancelled = false;
    setHasPeriods(undefined);
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
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

import { useEffect, useRef, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { useApiFetch } from '@/auth/useApiFetch.js';

export const QUERY_DEBOUNCE_MS = 300;

/**
 * Params the query cannot run without (ETP-6080 §19): the PyG SQL's `ase.c_acctschema_id` is not
 * optional (no schema = an empty tree), and the org and the dates decide what the user sees first.
 * Until all four have a value the hook sends nothing, so the first request never runs on the
 * wrong data.
 */
export const REQUIRED_QUERY_PARAMS = Object.freeze(['orgId', 'acctSchemaId', 'dateFrom', 'dateTo']);

export function isQueryReady(params, required = REQUIRED_QUERY_PARAMS) {
  return required.every((name) => params?.[name] != null && params[name] !== '');
}

/** Error class for telemetry and the UI (`network`, `http_404`, `org_access_denied`), never a message. */
function errorCodeOf(status, body) {
  return body?.code ? String(body.code).toLowerCase() : `http_${status}`;
}

/**
 * POST /api/reports/:id/query for the interactive view (ETP-6080 F7).
 *
 * - Debounced: a burst of filter changes sends one request, `QUERY_DEBOUNCE_MS` after the last.
 * - One `AbortController` per request; a newer change aborts the older request, so an older answer
 *   can never overwrite a newer one. An abort is not an error.
 * - `data` keeps the last good answer while the next one loads, and after a failure.
 *
 * `required` overrides the params it waits for (the journal-entry drill-down has no dates).
 *
 * Returns `{ data, loading, error, errorCode }`: `error` is a displayable message (a network failure
 * carries its own translated one), `errorCode` the class (`network`, `org_access_denied`, `http_500`).
 */
export function useReportQuery(reportId, params, { locale, enabled = true, required = REQUIRED_QUERY_PARAMS } = {}) {
  const apiFetch = useApiFetch('');
  const [state, setState] = useState({ data: null, loading: false, error: null, errorCode: null });
  // Params compared by value: the view rebuilds the object on every render.
  const paramsKey = JSON.stringify(params ?? {});
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const canRun = Boolean(enabled && reportId) && isQueryReady(params, required);

  useEffect(() => {
    if (!canRun) {
      // A pending request was aborted by the cleanup: nothing is loading any more.
      setState((s) => (s.loading ? { ...s, loading: false } : s));
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/reports/${reportId}/query`, {
          method: 'POST',
          baseUrl: '',
          body: JSON.stringify({ params: paramsRef.current, locale }),
          signal: controller.signal,
        });
        const body = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setState((s) => ({ ...s, loading: false, error: body?.error || `HTTP ${res.status}`, errorCode: errorCodeOf(res.status, body) }));
          return;
        }
        setState({ data: body, loading: false, error: null, errorCode: null });
      } catch (err) {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err?.message ?? null,
          errorCode: isNetworkError(err) ? 'network' : 'unknown',
        }));
      }
    }, QUERY_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiFetch, reportId, paramsKey, locale, canRun]);

  return state;
}

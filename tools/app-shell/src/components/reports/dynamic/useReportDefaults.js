import { useEffect, useState } from 'react';
import { detectBaseUrl } from '@etendosoftware/app-shell-core/auth';
import { useApiFetch } from '@/auth/useApiFetch.js';

// The year selector's own cap (ReportSelectorsServlet MAX_LIMIT): covers every year of a calendar.
const YEAR_LIMIT = 100;

const itemsOf = (data) => (Array.isArray(data) ? data : data?.items ?? []);

/**
 * ETP-6080 §19 — what the dynamic view needs before its first query: the accounting schema (the
 * first one the role sees, as the old viewer's `autoDefault` does) and the fiscal years of the
 * calendar the org uses (`selectedOrgId` is always sent: without it the years of every calendar
 * of the client come back). A failed request resolves to "none" (no schema / no years), so the
 * view still opens: on 1 January → today, with its hint.
 *
 * Returns `{ loading, acctSchemaId, acctSchemaName, years }`.
 */
export function useReportDefaults(selectedOrgId) {
  const apiFetch = useApiFetch(detectBaseUrl());
  const [state, setState] = useState({ loading: true, acctSchemaId: null, acctSchemaName: '', years: [] });

  useEffect(() => {
    let cancelled = false;
    const get = (url) => apiFetch(url).then((r) => (r.ok ? r.json() : null)).then(itemsOf).catch(() => []);
    const orgParam = selectedOrgId ? `&selectedOrgId=${encodeURIComponent(selectedOrgId)}` : '';
    setState((s) => ({ ...s, loading: true }));
    Promise.all([
      get('/sws/report-selectors/acctschema?q='),
      get(`/sws/report-selectors/year?q=&limit=${YEAR_LIMIT}${orgParam}`),
    ]).then(([schemas, years]) => {
      if (cancelled) return;
      // A year with no periods has no bounds: Java sends '' and the dev engine null. Neither is a range.
      const ranged = years.filter((y) => y.startDate && y.endDate);
      setState({ loading: false, acctSchemaId: schemas[0]?.id ?? null, acctSchemaName: schemas[0]?.name ?? '', years: ranged });
    });
    return () => { cancelled = true; };
  }, [apiFetch, selectedOrgId]);

  return state;
}

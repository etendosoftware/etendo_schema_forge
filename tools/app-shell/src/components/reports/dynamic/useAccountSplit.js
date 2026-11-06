import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * ETP-6080 — the parts of one leaf account by a dimension (`org` / `bpartner` / `product`), loaded
 * when its row is opened: `/query` with `splitBy`, `splitNodeId` and `splitSign` (the row's
 * effective sign, so the parts carry the same sign as the account). The split query reads exactly
 * the main query's period, org and dimension predicates, so the parts add up to the row.
 *
 * Any change of the params or the dimension drops every loaded split and aborts what is in flight.
 * Returns `{ splits, toggle }`: `splits[node_id]` = `{ loading, rows, error }`; `toggle(row)` opens
 * (and loads) or closes one row.
 */
export function useAccountSplit(reportId, params, splitBy, { locale } = {}) {
  const apiFetch = useApiFetch('');
  const [splits, setSplits] = useState({});
  const controllers = useRef(new Map());
  const key = `${splitBy}|${JSON.stringify(params ?? {})}`;

  useEffect(() => () => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setSplits({});
  }, [key]);

  const toggle = useCallback((row) => {
    const id = row.node_id;
    if (splits[id]) {
      controllers.current.get(id)?.abort();
      controllers.current.delete(id);
      setSplits(({ [id]: _closed, ...rest }) => rest);
      return;
    }
    const controller = new AbortController();
    controllers.current.set(id, controller);
    setSplits((s) => ({ ...s, [id]: { loading: true, rows: [], error: null } }));
    apiFetch(`/api/reports/${reportId}/query`, {
      method: 'POST',
      baseUrl: '',
      body: JSON.stringify({ params: { ...params, splitBy, splitNodeId: id, splitSign: row.sign }, locale }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { code: body?.code });
        return body?.rows ?? [];
      })
      .then((rows) => {
        if (!controller.signal.aborted) setSplits((s) => (s[id] ? { ...s, [id]: { loading: false, rows, error: null } } : s));
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setSplits((s) => (s[id] ? { ...s, [id]: { loading: false, rows: [], error: err.message } } : s));
      });
  }, [apiFetch, reportId, params, splitBy, locale, splits]);

  return { splits, toggle };
}

import { useCallback, useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { extractApiErrorMessage } from '@/lib/apiError.js';
import { sortByLineNo } from './representanteLegal.js';

/**
 * useRepresentantesLegales — loads/creates/updates/deletes the organization's legal
 * representatives (`OREP_Representative_Info`, curated as `representanteLegal` under the
 * `organization` spec — ETP-5716). Same spec base and parent/child wiring as
 * `useActividadesIae.js`: list reads take `?parentId=<orgId>`, a create carries `parentId` in
 * the body and the server maps it to the FK (`NeoCrudHandler#injectParentIdAsProperty`).
 *
 * Ordering matters here, unlike the IAE grid: the Modelo 390 reads the FIRST 3 rows by `LINE`.
 * The list does not come back ordered by line unless asked, so the request carries
 * `_sortBy=lineNo` and the rows are sorted again on the client (`sortByLineNo`) so the UI
 * never depends on the server honouring it.
 *
 * `lineNo` is never sent on create — the server assigns `MAX(line)+10` (see
 * `buildRepresentativePayload` in representanteLegal.js).
 */
export function useRepresentantesLegales(orgId, apiBaseUrl) {
  const repApiFetch = useApiFetch(`${neoBase(apiBaseUrl)}/organization`);

  const [state, setState] = useState({ loading: false, error: null, rows: [] });

  const load = useCallback(async () => {
    if (!orgId) {
      setState({ loading: false, error: null, rows: [] });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await repApiFetch(`/representanteLegal?parentId=${orgId}&_limit=100&_sortBy=lineNo`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json())?.response?.data ?? [];
      setState({ loading: false, error: null, rows: sortByLineNo(rows) });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [orgId, repApiFetch]);

  useEffect(() => { load(); }, [load]);

  const createRow = useCallback(async (payload) => {
    // Defensive: whatever the caller passes, the server owns the line number.
    const body = { ...payload };
    delete body.lineNo;
    const res = await repApiFetch('/representanteLegal', {
      method: 'POST',
      body: JSON.stringify({ ...body, parentId: orgId }),
    });
    if (!res.ok) throw new Error(await extractApiErrorMessage(res));
    return (await res.json().catch(() => null))?.response?.data?.[0] ?? null;
  }, [repApiFetch, orgId]);

  const updateRow = useCallback(async (id, payload) => {
    const res = await repApiFetch(`/representanteLegal/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiErrorMessage(res));
    return (await res.json().catch(() => null))?.response?.data?.[0] ?? null;
  }, [repApiFetch]);

  const deleteRow = useCallback(async (id) => {
    const res = await repApiFetch(`/representanteLegal/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await extractApiErrorMessage(res));
  }, [repApiFetch]);

  return {
    ...state,
    refetch: load,
    createRow,
    updateRow,
    deleteRow,
  };
}

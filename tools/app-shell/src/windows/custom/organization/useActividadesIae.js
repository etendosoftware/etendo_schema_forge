import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';

/**
 * useActividadesIae — loads/creates/updates/deletes "Actividades del IAE" rows
 * (`EPIAE_OrgInfo_Epigraph`, curated as `actividadesDelIae` under the `organization`
 * spec — see `artifacts/organization/decisions.json`, ETP-4975).
 *
 * Spec base note: mirrors `useOrganizationData.js`'s own `organizationApiFetch`
 * (`${neoBase(apiBaseUrl)}/organization`) — the SAME spec `organization`/`information`
 * already fetch from. `contract.json`'s own `apiPrediction` section predicts a
 * different spec name ("organizaci-n", computed from `decisions.json`'s
 * `window.name` = "Organización" via `toSpecName()`), but that is only a
 * documentation prediction; the spec actually pushed to NEO for this window keeps
 * the artifact/registry name `organization` (`cli/config/regen-windows.json`),
 * which is what `useOrganizationData.js` already fetches successfully against.
 *
 * Parent/child wiring follows the NEO Headless convention documented in
 * `neo-headless.md` §6 ("Parent-Child Tab Filtering"): list reads take
 * `?parentId=<orgId>` and the servlet resolves the FK property itself; a create
 * (`POST`) must carry `parentId` in the JSON body for the same auto-mapping
 * (`NeoCrudHandler#injectParentIdAsProperty`) — the client never needs to know the
 * FK column name (`Ad_Org_ID`/`organization`).
 */
export function useActividadesIae(orgId, apiBaseUrl) {
  const iaeApiFetch = useApiFetch(`${neoBase(apiBaseUrl)}/organization`);

  const [state, setState] = useState({ loading: false, error: null, rows: [] });

  /**
   * BUG-1 (ETP-4975, reported by QA): `enforceSingleDefault` used to filter
   * over `state.rows` captured in its own closure — that snapshot only moves
   * forward when `refetch()`'s `setState` lands, never optimistically at the
   * moment a toggle fires. Two "Principal" toggles fired back-to-back (before
   * either PATCH round-trip settles) each read the OTHER row as still
   * `default:false` in their own stale closure, so neither swept the other —
   * both persisted `default:true` server-side with no corrective PATCH ever
   * issued. `rowsRef` is the fix: a ref mirrors `state.rows` for normal reads,
   * but every call to `enforceSingleDefault` ALSO writes its own optimistic
   * mark into the ref synchronously, before doing anything async. Because a
   * JS async function runs its synchronous prefix to completion before
   * yielding (no other code can interleave until the next `await`), the
   * "mark self default:true, then look for other rows already marked
   * default:true" pair below is effectively atomic across concurrent calls —
   * whichever call resumes second is guaranteed to see the first call's mark
   * and sweep it, even though neither call ever awaited a fresh reload.
   *
   * Deliberately NOT paired with a UI-level lock that disables every row's
   * "Principal" checkbox while any default toggle is in flight (the other
   * defense sketched for this bug): that would suppress the SECOND click
   * outright (a disabled checkbox never dispatches a change event), so the
   * two `default:true` PATCHes this fix corrects would never be sent in the
   * first place — a valid alternative UX, but a different behavior than the
   * one this ref-based fix targets (let both edits land, then converge to a
   * single default), and it would falsify QA's regression test, which
   * asserts BOTH rows' `default:true` PATCH bodies were sent before the sweep
   * kicks in.
   */
  const rowsRef = useRef(state.rows);
  useEffect(() => { rowsRef.current = state.rows; }, [state.rows]);

  const load = useCallback(async () => {
    if (!orgId) {
      setState({ loading: false, error: null, rows: [] });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await iaeApiFetch(`/actividadesDelIae?parentId=${orgId}&_limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json())?.response?.data ?? [];
      setState({ loading: false, error: null, rows: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [orgId, iaeApiFetch]);

  useEffect(() => { load(); }, [load]);

  const patchRow = useCallback(async (id, payload) => {
    const res = await iaeApiFetch(`/actividadesDelIae/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json().catch(() => null))?.response?.data?.[0] ?? null;
  }, [iaeApiFetch]);

  const createRow = useCallback(async (payload) => {
    const res = await iaeApiFetch('/actividadesDelIae', {
      method: 'POST',
      // parentId drives NeoCrudHandler#injectParentIdAsProperty server-side —
      // see module docstring above.
      body: JSON.stringify({ ...payload, parentId: orgId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json().catch(() => null))?.response?.data?.[0] ?? null;
  }, [iaeApiFetch, orgId]);

  const deleteRow = useCallback(async (id) => {
    const res = await iaeApiFetch(`/actividadesDelIae/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, [iaeApiFetch]);

  /**
   * Design decision (ETP-4975): Classic's `SL_IsDefault` callout
   * (`org.openbravo.erpCommon.ad_callouts.SL_IsDefault`) — which is what kept a
   * single default row per organization in the Classic "Actividades del IAE"
   * tab — could not be classified/ported to this custom UI (`rules-raw.json`:
   * `complexity: "unknown"`, `confidence: "low"`, `warning: "Source not found"`).
   * We replicate its net *effect* by hand instead: whenever a row is marked
   * `default = true`, every OTHER row belonging to this organization is
   * explicitly persisted as `default = false` via its own `PATCH` call — not
   * just flipped in local component state — so at most one default row ever
   * exists server-side, and a stale reload or a second editor never see two.
   * The just-marked row is excluded (its own update already carries the
   * correct value); a failed sweep on one sibling is swallowed per-row so one
   * bad row can't stop the others from being corrected.
   */
  const enforceSingleDefault = useCallback(async (keepId) => {
    // Synchronous prefix (see rowsRef docstring above) — mark `keepId` as the
    // optimistic default BEFORE checking siblings, so a concurrent call that
    // resumes right after this one still finds this row's mark.
    rowsRef.current = rowsRef.current.map(r =>
      (r.id === keepId ? { ...r, default: true } : r));
    const others = rowsRef.current.filter(r => r.id !== keepId && (r.default === true || r.default === 'Y'));
    if (others.length === 0) return;
    // Clear them in the ref too, so a third overlapping call doesn't re-target
    // a row this call already swept.
    rowsRef.current = rowsRef.current.map(r =>
      (others.some(o => o.id === r.id) ? { ...r, default: false } : r));
    await Promise.all(others.map(r => patchRow(r.id, { default: false }).catch(() => null)));
  }, [patchRow]);

  return {
    ...state,
    refetch: load,
    createRow,
    updateRow: patchRow,
    deleteRow,
    enforceSingleDefault,
  };
}

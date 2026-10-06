import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { createQueryKey, useOptionalDataCache } from '@etendosoftware/app-shell-core/data';
import { newAttachmentsSource, notifyAttachmentsChanged, useAttachmentsChanged } from './attachmentsBus';

import { useApiFetch } from '@/auth/useApiFetch.js';
// Re-exported so this module's public surface (and its tests) are unchanged; the
// implementation moved to `lib/` so a caller that wants only the formatter does not
// have to import a React hook module — and the `@/i18n` barrel — to get it.
export { formatBytes } from '@/lib/formatBytes.js';
import { formatBytes } from '@/lib/formatBytes.js';
/**
 * Trigger a browser download for a binary blob.
 *
 * @param {Blob} blob - The blob to download.
 * @param {string} filename - The suggested filename.
 */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'download';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Try to read a backend error message from a non-OK fetch response.
 *
 * @param {Response} res - The fetch response.
 * @returns {Promise<string|null>} Error message or null when not available.
 */
async function extractErrorMessage(res) {
  try {
    const json = await res.clone().json();
    return (
      json?.error?.message
      || json?.response?.error?.message
      || json?.message
      || null
    );
  } catch {
    try {
      const text = await res.text();
      return text || null;
    } catch {
      return null;
    }
  }
}

const EMPTY_ITEMS = [];
const EMPTY_LIST_STATE = { key: null, items: EMPTY_ITEMS, loaded: false };
const EMPTY_COUNT_STATE = { key: null, count: null };

// Cache entities: the full list and the lightweight count of the same record
// are cached separately (different payloads) and invalidated together.
const LIST_ENTITY = 'attachments';
const COUNT_ENTITY = 'attachments-count';

/** Identity of the attachment list of one record. */
function recordKey(tableName, recordId) {
  return `${tableName}/${recordId}`;
}

/**
 * Hook that drives the AttachmentsTab UI: list / upload / download / remove /
 * update-description, optimistic state, inflight cancellation, and lazy load
 * when the tab becomes active.
 *
 * @param {object} params
 * @param {string} params.tableName  - AD table name (e.g. "C_Order").
 * @param {string} params.recordId   - Owning record id.
 * @param {string} params.token      - Bearer token for the API.
 * @param {string} params.apiBaseUrl - Base URL for the NEO Headless API.
 * @param {boolean} params.isActive  - Whether the tab is currently visible.
 *                                     Used to lazy-load only when needed.
 * @param {object} [params.config]   - Optional config (currently unused here,
 *                                     reserved for future extensions).
 * @param {boolean} [params.prefetchCount=false] - ETP-5526: while the tab is
 *                                     inactive, fetch only the attachment COUNT of
 *                                     the record (`GET .../{recordId}/count`) so a
 *                                     badge can show it on record open. The full
 *                                     list stays lazy. Opt-in: consumers without a
 *                                     badge (upload-only, always-active) pay nothing.
 * @returns {{
 *   items: object[],
 *   loaded: boolean,
 *   count: number|null,
 *   loading: boolean,
 *   error: Error|null,
 *   uploadingFiles: Map<string, { name: string, size: number }>,
 *   list: (opts?: { recordId?: string }) => Promise<void>,
 *   upload: (file: File, opts?: { recordId?: string }) => Promise<void>,
 *   download: (attachment: object) => Promise<void>,
 *   downloadAll: () => Promise<void>,
 *   remove: (attachmentId: string) => Promise<void>,
 *   removeAll: () => Promise<void>,
 *   updateDescription: (attachmentId: string, description: string) => Promise<void>,
 *   formatBytes: (bytes: number) => string,
 * }}
 */
export function useAttachments({
  tableName, recordId, token, apiBaseUrl, isActive, config, prefetchCount = false,
}) {
  const ui = useUI();

  // apiBaseUrl may be the full spec URL (e.g. http://host/sws/neo/sales-order).
  // Strip the spec-specific segment so we get the root proxy base for the
  // transversal attachments endpoint (http://host).
  const attachmentsBase = apiBaseUrl
    ? apiBaseUrl.split('/sws/neo/')[0]
    : '';
  const apiFetch = useApiFetch(attachmentsBase);

  // ETP-4564: `undefined` isActive → treat as always-active (eager), preserving
  // the prior behavior for consumers that don't pass it; consumers that do pass
  // isActive get true lazy loading (list fires only once the tab is activated).
  const active = isActive === undefined ? true : isActive;

  // Shared client-side cache (app-shell-core). Null when no DataProvider is
  // mounted → the list falls back to a direct fetch, preserving prior behavior.
  const dataCache = useOptionalDataCache();
  const cacheScope = dataCache?.scope;

  // DetailView routes a not-yet-saved record as the literal string "new" —
  // truthy, so a plain `!recordId` guard misses it. Nothing can be attached
  // to a record that doesn't exist yet, and firing this GET anyway is worse
  // than a wasted request: it can resolve *after* a real upload's own list()
  // (ETP-4315 QA follow-up's saveBeforeAttach path) and clobber the correct
  // items with an empty result.
  const hasRealRecord = !!(tableName && recordId && recordId !== 'new');
  const currentKey = hasRealRecord ? recordKey(tableName, recordId) : null;

  // ETP-5526: the list state is owned by the record it was read for. `items`
  // and `loaded` are derived against the current record below, so switching
  // records never shows (or counts) the previous record's files, and a write
  // that resolves for another record — e.g. the saveBeforeAttach upload, which
  // targets the just-saved id before this hook's `recordId` prop catches up —
  // lands under its own key instead of being dropped or leaking.
  const [listState, setListState] = useState(EMPTY_LIST_STATE);
  const ownsCurrent = currentKey !== null && listState.key === currentKey;
  const items = ownsCurrent ? listState.items : EMPTY_ITEMS;
  // True once the full list of the CURRENT record has been read from the server
  // at least once, i.e. `items.length` is the real count. False while the tab
  // has never been opened (lazy load, ETP-4564), after a failed first read, and
  // right after the record changes — a consumer must treat the count as unknown.
  const loaded = ownsCurrent && listState.loaded;
  // ETP-5526: the count fetched from the lightweight endpoint, owned by the
  // record it was read for (same keyed approach as the list). `null` = unknown.
  const [countState, setCountState] = useState(EMPTY_COUNT_STATE);
  const fetchedCount = currentKey !== null && countState.key === currentKey ? countState.count : null;
  // The single number a badge shows: the real list length once the list was
  // read, otherwise the fetched count, otherwise null (unknown — never a fake 0).
  const count = loaded ? items.length : fetchedCount;
  const [loading, setLoading] = useState(hasRealRecord && active);
  const [error, setError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(new Map());

  // AbortController shared by all read requests for the current record.
  const abortRef = useRef(null);
  // Separate controller + generation for count reads: a count read must never
  // abort (or be aborted by) a list read, and only the latest one commits. The
  // controller is used only on the uncached path — see fetchCount.
  const countAbortRef = useRef(null);
  const countGenerationRef = useRef(0);

  // Monotonic guard against out-of-order writes to `items` (ETP-4315 QA
  // follow-up): the saveBeforeAttach path force-saves the header, which
  // updates this hook's own `recordId` prop mid-flight (before the upload
  // that triggered the save has even resolved) and re-fires the mount
  // effect's list() below. If that list() call resolves *after* upload()'s
  // own items write, it silently overwrites the correct (just-uploaded) state
  // with a now-stale read. Every write bumps this ref first and only
  // commits if it's still the most recent write by the time its async work
  // resolves — a request that started earlier but resolves later is
  // discarded rather than allowed to clobber a newer one.
  const stateGenerationRef = useRef(0);

  // Identity used to skip our own change notifications (ETP-4855): this hook
  // already updates `items` optimistically, so reloading on its own event would
  // just add a redundant GET and undo the optimistic UX.
  const sourceRef = useRef(null);
  if (!sourceRef.current) sourceRef.current = newAttachmentsSource();
  const announceChange = useCallback(() => {
    notifyAttachmentsChanged({ tableName, recordId, source: sourceRef.current });
  }, [tableName, recordId]);

  // Tracks the latest items synchronously so optimistic operations can snapshot
  // them before a setState updater runs (React 18 defers the updater function).
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // Same, for upload() to tell whether the target record's list is authoritative.
  const listStateRef = useRef(listState);
  useEffect(() => { listStateRef.current = listState; }, [listState]);
  // The record this hook shows NOW — read by upload() after its POST resolves,
  // when the user may already be on another record.
  const currentKeyRef = useRef(currentKey);
  useEffect(() => { currentKeyRef.current = currentKey; }, [currentKey]);
  // Whether the CURRENT record's list was read — read by async callbacks that
  // decide between "the list already gives the count" and "refresh the count".
  const loadedRef = useRef(loaded);
  useEffect(() => { loadedRef.current = loaded; }, [loaded]);

  // Replace the items of one record's list, leaving `loaded` untouched. A no-op
  // when the list state has meanwhile moved to another record, so a late
  // optimistic write or rollback can never land on the wrong record.
  const replaceItems = useCallback((key, nextItems) => {
    setListState((prev) => (prev.key === key ? { ...prev, items: nextItems } : prev));
  }, []);

  const resetAbortController = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    return ctrl;
  }, []);

  // The attachment list for a record is identified by table + record, isolated
  // by session/org/role via the cache scope. Both helpers take the record the
  // caller actually targets (`opts.recordId` overrides, see list()/upload()), so
  // a read for a just-saved record is not cached under the stale "new" id.
  const listKey = useCallback((targetRecordId = recordId) => (
    cacheScope
      ? createQueryKey({ ...cacheScope, apiBase: attachmentsBase, entity: LIST_ENTITY, spec: tableName, recordId: targetRecordId })
      : null
  ), [cacheScope, attachmentsBase, tableName, recordId]);

  const countKey = useCallback((targetRecordId = recordId) => (
    cacheScope
      ? createQueryKey({ ...cacheScope, apiBase: attachmentsBase, entity: COUNT_ENTITY, spec: tableName, recordId: targetRecordId })
      : null
  ), [cacheScope, attachmentsBase, tableName, recordId]);

  // Mark the cached attachment list AND count stale so the next read
  // revalidates. Called after any mutation (upload / remove / update) and on a
  // change announced by another view, so a reopened tab / badge is fresh.
  const invalidateList = useCallback((targetRecordId = recordId) => {
    if (dataCache?.cache && cacheScope) {
      dataCache.cache.invalidate({ entity: LIST_ENTITY, spec: tableName, recordId: targetRecordId });
      dataCache.cache.invalidate({ entity: COUNT_ENTITY, spec: tableName, recordId: targetRecordId });
    }
  }, [dataCache, cacheScope, tableName, recordId]);

  // ── count (ETP-5526) ────────────────────────────────────────────────────
  // Reads only the number of attachments of the current record, for the tab
  // badge while the full list is still lazy. Optional by design: frontend and
  // backend deploy separately. An older backend ignores the unknown `/count`
  // segment and answers the list (`200 { items }`), which fails the integer
  // check below; that, a 404/405, a network error or any other failure leaves
  // the count silently `null` (no number) — no toast, unlike the list. A 401 still follows apiFetch's default logout
  // path: an expired session is not a missing endpoint.
  const fetchCount = useCallback(async (opts = {}) => {
    const { force = false } = opts;
    if (!hasRealRecord) return;
    const key = recordKey(tableName, recordId);
    const generation = ++countGenerationRef.current;
    const fetcher = async (signal) => {
      const res = await apiFetch(
        `/sws/neo/attachments/${tableName}/${recordId}/count`,
        { signal, token },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const value = json?.count ?? json?.response?.data?.count ?? json?.data?.count;
      if (!Number.isInteger(value) || value < 0) throw new Error('Invalid attachments count');
      return value;
    };
    try {
      let value;
      if (dataCache?.cache && cacheScope) {
        // No consumer signal on the shared cached read. The cache hands ONE
        // in-flight promise to every concurrent caller, and that promise runs
        // with the signal of whoever started it: aborting it on unmount or on
        // a re-call killed the request for everybody — the caller that joined
        // got an AbortError and kept `null`, and a consumer mounting after the
        // rejection found neither an in-flight request nor a cached entry and
        // asked again (two /count requests for one record open). Letting the
        // tiny COUNT read finish populates the cache for the next reader; a
        // superseded or unmounted caller is kept from writing state by the
        // generation guard below (bumped on unmount too).
        value = await dataCache.cache.fetchQuery({
          key: countKey(recordId),
          fetcher: () => fetcher(undefined),
          force,
          staleTime: dataCache.recordStaleTime,
        });
      } else {
        // Uncached: the request belongs to this caller alone, so cancelling the
        // superseded one is safe.
        if (countAbortRef.current) countAbortRef.current.abort();
        const ctrl = new AbortController();
        countAbortRef.current = ctrl;
        value = await fetcher(ctrl.signal);
      }
      // Out-of-order guard: a slower read started for an earlier record (or an
      // earlier refresh) never overwrites a newer one.
      if (generation === countGenerationRef.current) {
        setCountState({ key, count: value });
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (generation === countGenerationRef.current) {
        setCountState({ key, count: null });
      }
      // eslint-disable-next-line no-console
      console.debug('[attachments] count unavailable, badge shows no number:', err?.message);
    }
  }, [apiFetch, tableName, recordId, token, hasRealRecord, dataCache, cacheScope, countKey]);

  // After a change while the list of the current record is NOT loaded, the
  // fetched count is the only source of the badge: re-read it (forced, so the
  // cache cannot answer). Re-reading beats adjusting it by ±1 — the fetched
  // value may itself be in flight or stale, and another view may have written
  // too; one COUNT query is authoritative. Once the list is loaded the badge
  // derives from it and no count request is needed.
  const refreshCountIfUnloaded = useCallback(() => {
    if (prefetchCount && !loadedRef.current) fetchCount({ force: true });
  }, [prefetchCount, fetchCount]);

  // ── list ────────────────────────────────────────────────────────────────
  // `opts.recordId` mirrors upload()'s override (ETP-4315 QA follow-up): the
  // list() closure captured by a caller from an earlier render (e.g. the
  // saveBeforeAttach flow, whose whole async chain runs against the "new"
  // AttachmentsTab render it started from) still has `hasRealRecord` bound
  // to that render's "new" recordId, so calling the bare `list()` it holds
  // would silently no-op on its own stale guard — passing the just-saved id
  // through here instead of relying on the hook's own (stale) closure fixes
  // that without waiting for a re-render to hand out a fresh `list`.
  // `opts.force` (ETP-4564) bypasses the shared-cache freshness window.
  const list = useCallback(async (opts = {}) => {
    const { force = false } = opts;
    const targetRecordId = opts.recordId || recordId;
    const targetHasRealRecord = !!(tableName && targetRecordId && targetRecordId !== 'new');
    if (!targetHasRealRecord) return;
    const generation = ++stateGenerationRef.current;
    const ctrl = resetAbortController();
    setLoading(true);
    setError(null);
    const fetcher = async (signal) => {
      const res = await apiFetch(
        `/sws/neo/attachments/${tableName}/${targetRecordId}`,
        { signal, token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const data = json?.items ?? json?.response?.data ?? json?.data ?? json;
      return Array.isArray(data) ? data : [];
    };
    try {
      let data;
      if (dataCache?.cache && cacheScope) {
        data = await dataCache.cache.fetchQuery({
          key: listKey(targetRecordId),
          fetcher: ({ signal }) => fetcher(signal),
          force,
          staleTime: dataCache.recordStaleTime,
          signal: ctrl.signal,
        });
      } else {
        data = await fetcher(ctrl.signal);
      }
      // Out-of-order guard (ETP-4315): only the most recent list() commits.
      // A committed read is the authoritative list of `targetRecordId`, so it
      // also marks that list as loaded (ETP-5526: the tab badge shows a count).
      if (generation === stateGenerationRef.current) {
        setListState({ key: recordKey(tableName, targetRecordId), items: data, loaded: true });
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (generation === stateGenerationRef.current) {
        setError(err);
        toast.error(err.message || ui('attachmentsListError'));
      }
    } finally {
      // Unconditional: this call is done (success, error, or superseded) either
      // way, so its own loading is over regardless of whether a newer write won
      // the race and its data got discarded above. Gating this on `generation`
      // too — instead of just the items/error writes — left `loading` stuck
      // true forever whenever this call went stale, since nothing else was
      // going to clear it (caught by review on the saveBeforeAttach PR).
      setLoading(false);
    }
  }, [apiFetch, tableName, recordId, token, resetAbortController, ui, dataCache, cacheScope, listKey]);

  // Cancel inflight when record/table changes or component unmounts.
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
    if (countAbortRef.current) countAbortRef.current.abort();
    // Discard any count read still pending (the cached one is not aborted).
    countGenerationRef.current += 1;
  }, []);

  // Lazy load: fetch only once the tab is active (ETP-4564). `active` defaults to
  // true when isActive is not provided, preserving eager behavior for callers
  // that don't pass it. Reopening a fresh tab reuses the cache (no new request).
  useEffect(() => {
    if (hasRealRecord && active) {
      list();
    }
    // Intentionally not depending on `list` to avoid extra re-runs when
    // its identity changes due to unrelated deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, recordId, hasRealRecord, active]);

  // ETP-5526: count on record open. Only for a consumer that shows a badge
  // (`prefetchCount`), only while the tab is inactive and the list of this
  // record has not been read — an active tab loads the list, whose length IS
  // the count, so a parallel count request would be wasted.
  useEffect(() => {
    if (prefetchCount && hasRealRecord && !active && !loadedRef.current) {
      fetchCount();
    }
    // Same rationale as the list effect above: re-run on record/visibility
    // changes only, not on callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, recordId, hasRealRecord, active, prefetchCount]);

  // Reload when another view attaches or deletes a file on this record — e.g.
  // the OCR side panel, which is mounted alongside this tab in form view. That
  // view does not touch the shared cache, so mark it stale first (otherwise a
  // fresh cached list/count would answer with the pre-change data). A badge
  // consumer whose list was never read refreshes only the count, keeping the
  // full list lazy (ETP-4564); every other case reloads the list as before.
  const onExternalChange = useCallback(() => {
    invalidateList();
    if (prefetchCount && !active && !loadedRef.current) {
      fetchCount({ force: true });
      return;
    }
    list();
  }, [invalidateList, prefetchCount, active, fetchCount, list]);
  useAttachmentsChanged({ tableName, recordId, source: sourceRef.current }, onExternalChange);

  // ── upload ──────────────────────────────────────────────────────────────
  // `opts.recordId` lets a caller upload against a record it just created but
  // that hasn't reached this hook's own `recordId` prop yet (ETP-4315 QA
  // follow-up — a new/unsaved header has no persisted id to attach to, so
  // AttachmentsTab force-saves the header first and passes the freshly
  // returned id here instead of waiting for a re-render).
  // ETP-5309: "new" is not a persisted id — mirror hasRealRecord instead of POSTing it.
  const upload = useCallback(async (file, opts = {}) => {
    const targetRecordId = opts.recordId || recordId;
    if (!file || !tableName || !targetRecordId || targetRecordId === 'new') return;
    const tempId = `upload-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    setUploadingFiles((prev) => {
      const next = new Map(prev);
      next.set(tempId, { name: file.name, size: file.size });
      return next;
    });
    try {
      const form = new FormData();
      form.append('file', file);
      // NOTE: apiFetch drops Content-Type for a FormData body — the browser sets the boundary.
      const res = await apiFetch(
        `/sws/neo/attachments/${tableName}/${targetRecordId}`,
        { method: 'POST', body: form, token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const created = json?.response?.data ?? json?.data ?? json;
      const targetKey = recordKey(tableName, targetRecordId);
      const known = listStateRef.current;
      const targetLoaded = known.key === targetKey && known.loaded;
      // ETP-5526: the hook may have moved to another record while the POST was
      // in flight. Adopting the target's list then (forced read or prepend)
      // would take the newest generation and replace the CURRENT record's list
      // with the old one's, leaving an empty table and no badge. Only write
      // state when the hook still shows the target, or shows no real record
      // yet (saveBeforeAttach: the prop is still "new" while the file goes to
      // the just-saved id). Otherwise just mark the target's cached list stale.
      const showingTarget = currentKeyRef.current === targetKey || currentKeyRef.current === null;
      if (!showingTarget) {
        invalidateList(targetRecordId);
      } else if (created && created.id && !targetLoaded && active) {
        // ETP-5526: prepending to a list that was never read (an upload racing
        // the first list(), or saveBeforeAttach's just-saved record) would make
        // the badge claim "1" while older files may exist. The tab is visible,
        // so read the real list instead; this also supersedes the racing read.
        invalidateList(targetRecordId);
        await list({ recordId: targetRecordId, force: true });
      } else if (created && created.id) {
        // Bump first: invalidates any list() already in flight (e.g. the one
        // saveBeforeAttach's force-save just re-triggered via the recordId
        // prop update) so it can't overwrite this with a stale read.
        stateGenerationRef.current += 1;
        // An inactive, never-loaded instance (e.g. the fiscal models' upload-only
        // hook) keeps its lazy contract: no extra read, and `loaded` stays false
        // because these items are not the full list.
        setListState((prev) => (prev.key === targetKey
          ? { ...prev, items: [created, ...prev.items] }
          : { key: targetKey, items: [created], loaded: false }));
        invalidateList(targetRecordId); // cached list is now stale for other/future readers
        // The prepended items are not the full list, so a badge still reads
        // the fetched count — which this upload just made stale.
        if (targetKey === currentKeyRef.current) refreshCountIfUnloaded();
      } else {
        // Fallback: force a fresh reload when the server did not return the item.
        // Pass targetRecordId explicitly rather than calling list() bare:
        // this closure's own `list` can still be bound to the "new" record
        // from the render that started this call chain (ETP-4315 QA
        // follow-up's saveBeforeAttach flow runs its whole async sequence
        // against the closures captured at drop time, before the force-save
        // hands out a fresh recordId on the next render). `force` (ETP-4564)
        // bypasses the shared-cache freshness window on this fallback reload.
        await list({ recordId: targetRecordId, force: true });
      }
      announceChange();
      toast.success(ui('attachmentsUploadSuccess'));
    } catch (err) {
      toast.error(err.message || ui('attachmentsUploadError'));
    } finally {
      setUploadingFiles((prev) => {
        const next = new Map(prev);
        next.delete(tempId);
        return next;
      });
    }
  }, [apiFetch, tableName, recordId, token, active, list, ui, invalidateList, announceChange, refreshCountIfUnloaded]);

  // ── download (single) ───────────────────────────────────────────────────
  const download = useCallback(async (attachment) => {
    if (!attachment?.id) return;
    try {
      const res = await apiFetch(
        `/sws/neo/attachments/file/${attachment.id}`,
        { token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      triggerBlobDownload(blob, attachment.name || attachment.fileName || `attachment-${attachment.id}`);
    } catch (err) {
      toast.error(err.message || ui('attachmentsDownloadError'));
    }
  }, [apiFetch, token, ui]);

  // ── download all (zip) ──────────────────────────────────────────────────
  const downloadAll = useCallback(async () => {
    if (!tableName || !recordId) return;
    try {
      // ETP-5424 — the server builds the whole archive before it answers, so a record with many
      // attachments can outlive the default read timeout; opt out.
      const res = await apiFetch(
        `/sws/neo/attachments/${tableName}/${recordId}/zip`,
        { token, timeout: 0 },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      triggerBlobDownload(blob, `attachments-${recordId}.zip`);
    } catch (err) {
      toast.error(err.message || ui('attachmentsDownloadError'));
    }
  }, [apiFetch, tableName, recordId, token, ui]);

  // ── remove (optimistic) ─────────────────────────────────────────────────
  const remove = useCallback(async (attachmentId) => {
    if (!attachmentId) return;
    const key = currentKey;
    const snapshot = itemsRef.current;
    replaceItems(key, snapshot.filter((it) => it.id !== attachmentId));
    try {
      const res = await apiFetch(
        `/sws/neo/attachments/file/${attachmentId}`,
        { method: 'DELETE', token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      invalidateList();
      refreshCountIfUnloaded();
      announceChange();
      toast.success(ui('attachmentsDeleteSuccess'));
    } catch (err) {
      replaceItems(key, snapshot);
      toast.error(err.message || ui('attachmentsDeleteError'));
    }
  }, [apiFetch, token, ui, invalidateList, refreshCountIfUnloaded, announceChange, currentKey, replaceItems]);

  // ── removeAll (optimistic) ──────────────────────────────────────────────
  const removeAll = useCallback(async () => {
    const key = currentKey;
    const snapshot = itemsRef.current;
    if (!snapshot.length) return;
    replaceItems(key, []);
    try {
      await Promise.all(
        snapshot.map((it) =>
          apiFetch(`/sws/neo/attachments/file/${it.id}`, {
            method: 'DELETE',
            token,
          }).then((res) => {
            if (!res.ok) return res.text().then((t) => { throw new Error(t || `HTTP ${res.status}`); });
          })
        )
      );
      invalidateList();
      refreshCountIfUnloaded();
      announceChange();
      toast.success(ui('attachmentsDeleteAllSuccess'));
    } catch (err) {
      replaceItems(key, snapshot);
      toast.error(err.message || ui('attachmentsDeleteAllError'));
    }
  }, [apiFetch, token, ui, invalidateList, refreshCountIfUnloaded, announceChange, currentKey, replaceItems]);

  // ── update description (optimistic) ─────────────────────────────────────
  const updateDescription = useCallback(async (attachmentId, description) => {
    if (!attachmentId) return;
    const key = currentKey;
    const snapshot = itemsRef.current;
    replaceItems(key, snapshot.map((it) => (it.id === attachmentId ? { ...it, description } : it)));
    try {
      const res = await apiFetch(
        `/sws/neo/attachments/file/${attachmentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ description }),
          token,
        },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      invalidateList();
      toast.success(ui('attachmentsUpdateSuccess'));
    } catch (err) {
      replaceItems(key, snapshot);
      toast.error(err.message || ui('attachmentsUpdateError'));
    }
  }, [apiFetch, token, ui, invalidateList, currentKey, replaceItems]);

  return {
    items,
    loaded,
    count,
    loading,
    error,
    uploadingFiles,
    list,
    upload,
    download,
    downloadAll,
    remove,
    removeAll,
    updateDescription,
    formatBytes,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchById } from './helpers.js';

const asArray = (value) => (Array.isArray(value) ? value : []);
// Stable empty map while a fetch is in flight, so the `items` memo does not recompute.
const EMPTY = {};

function chipTypeOf(source, doc) {
  return typeof source.type === 'function' ? source.type(doc) : source.type;
}

/**
 * Flattens per-source results into `{ type, doc }` items, in source order, dropping
 * repeated documents (same chip type + id) that two sources may both return — e.g. a
 * rectified invoice that is also a manually linked origin invoice.
 *
 * @param {Array<[source, doc[]]>} results
 * @returns {Array<{ type: string, doc: object }>}
 */
export function collectRelatedItems(results) {
  const seen = new Set();
  const items = [];
  for (const [source, docs] of results) {
    for (const doc of asArray(docs)) {
      if (!doc || typeof doc !== 'object') continue;
      const type = chipTypeOf(source, doc);
      const key = `${type}-${doc.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ type, doc });
    }
  }
  return items;
}

/**
 * Resolves the related documents of one record from a definition (see
 * salesRelatedDocs.js). Shared by the form's RelatedDocuments section and the list
 * preview's RelatedDocumentsCard so both show exactly the same documents.
 *
 * @param {object}  params
 * @param {object|null} params.definition — entry of SALES_RELATED_DOCS; null disables the hook
 * @param {string}  params.id             — record id ('new' or empty disables the hook)
 * @param {object|null|undefined} params.record
 *        the DETAIL record. `undefined` → the hook loads it itself (list previews only hold
 *        the list row); `null` → not available yet, wait for it (forms while loading).
 * @param {string}  params.token
 * @param {string}  params.apiBaseUrl     — spec-scoped NEO base (`.../sws/neo/<spec>`)
 * @param {*}       [params.refreshSignal] — any value; a change triggers a refetch
 * @returns {{ items: Array<{type: string, doc: object}>, loading: boolean, refresh: () => void }}
 */
export function useRelatedDocuments({ definition, id, record, token, apiBaseUrl, refreshSignal }) {
  const enabled = Boolean(definition && id && id !== 'new');
  const needsLoad = record === undefined;
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const refreshEvent = definition?.refreshEvent;
  useEffect(() => {
    if (!refreshEvent) return undefined;
    window.addEventListener(refreshEvent, refresh);
    return () => window.removeEventListener(refreshEvent, refresh);
  }, [refreshEvent, refresh]);

  // ── Detail record (preview mode: only the list row is known) ─────────────────
  const [loaded, setLoaded] = useState({ id: null, version: 0, record: null });
  const [loadingRecord, setLoadingRecord] = useState(needsLoad);
  useEffect(() => {
    if (!enabled || !needsLoad) return undefined;
    let cancelled = false;
    setLoadingRecord(true);
    fetchById(definition.spec, definition.entity, id, token, apiBaseUrl)
      .catch(() => null)
      .then((detail) => {
        if (cancelled) return;
        setLoaded(prev => ({ id, version: prev.version + 1, record: detail ?? {} }));
        setLoadingRecord(false);
      });
    return () => { cancelled = true; };
  }, [enabled, needsLoad, definition, id, token, apiBaseUrl, refreshKey, refreshSignal]);

  let effectiveRecord = record;
  if (needsLoad) effectiveRecord = loaded.id === id ? loaded.record : null;
  // Record mode: on A→B navigation `id` can change before `record` does. A record that
  // belongs to another id is not ready — otherwise B would be fetched with A's record
  // and A's select-chips would flash under B.
  else if (record?.id && record.id !== id) effectiveRecord = null;
  const recordReady = effectiveRecord != null;

  // ── Async sources ────────────────────────────────────────────────────────────
  const fetchSources = useMemo(
    () => (definition?.sources ?? []).filter(s => typeof s.fetch === 'function'),
    [definition],
  );
  const hasFetch = fetchSources.length > 0;
  const depsKey = recordReady && definition?.depsKey ? definition.depsKey(effectiveRecord) : '';
  // Load mode refetches when a (re)loaded record lands; record mode on explicit refreshes.
  const loadedVersion = loaded.id === id ? loaded.version : 0;
  const trigger = needsLoad
    ? loadedVersion
    : `${refreshKey}:${String(refreshSignal ?? '')}`;
  const recordRef = useRef(effectiveRecord);
  recordRef.current = effectiveRecord;

  // The fetched docs remember which request they answer, so a stale result is never
  // shown as current while the next request is in flight.
  const fetchKey = `${id}|${depsKey}|${trigger}`;
  const [fetched, setFetched] = useState({ key: null, docs: {} });
  useEffect(() => {
    if (!enabled || !recordReady || !hasFetch) return undefined;
    let cancelled = false;
    const rec = recordRef.current;
    Promise.all(fetchSources.map(source =>
      Promise.resolve()
        .then(() => source.fetch({ id, record: rec, token, apiBaseUrl }))
        .catch(() => [])
        .then(docs => [source.key, asArray(docs)])
    )).then((entries) => {
      if (cancelled) return;
      setFetched({ key: fetchKey, docs: Object.fromEntries(entries) });
    });
    return () => { cancelled = true; };
  // fetchKey already encodes id, depsKey and trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, recordReady, hasFetch, fetchSources, fetchKey, token, apiBaseUrl]);
  const fetching = hasFetch && fetched.key !== fetchKey;
  const fetchedDocs = fetching ? EMPTY : fetched.docs;

  const items = useMemo(() => {
    if (!enabled || !recordReady) return [];
    const results = (definition.sources ?? []).map((source) => {
      if (typeof source.select === 'function') {
        let docs = [];
        try { docs = source.select(effectiveRecord); } catch { docs = []; }
        return [source, docs];
      }
      return [source, fetchedDocs[source.key] ?? []];
    });
    return collectRelatedItems(results);
  }, [enabled, recordReady, definition, effectiveRecord, fetchedDocs]);

  const loading = enabled && (
    !recordReady
    || (needsLoad && loadingRecord)
    || fetching
  );

  return { items, loading, refresh };
}

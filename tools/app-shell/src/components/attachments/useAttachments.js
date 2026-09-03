import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { newAttachmentsSource, notifyAttachmentsChanged, useAttachmentsChanged } from './attachmentsBus';

import { useApiFetch } from '@/auth/useApiFetch.js';
/**
 * Format a byte size into a human readable string.
 *
 * @param {number} bytes - Raw size in bytes.
 * @returns {string} A short, locale-agnostic representation (e.g. "1.2 MB").
 */
export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

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
 * @returns {{
 *   items: object[],
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
export function useAttachments({ tableName, recordId, token, apiBaseUrl, isActive, config }) {
  const ui = useUI();

  // apiBaseUrl may be the full spec URL (e.g. http://host/sws/neo/sales-order).
  // Strip the spec-specific segment so we get the root proxy base for the
  // transversal attachments endpoint (http://host).
  const attachmentsBase = apiBaseUrl
    ? apiBaseUrl.split('/sws/neo/')[0]
    : '';
  const apiFetch = useApiFetch(attachmentsBase);

  // DetailView routes a not-yet-saved record as the literal string "new" —
  // truthy, so a plain `!recordId` guard misses it. Nothing can be attached
  // to a record that doesn't exist yet, and firing this GET anyway is worse
  // than a wasted request: it can resolve *after* a real upload's own list()
  // (ETP-4315 QA follow-up's saveBeforeAttach path) and clobber the correct
  // items with an empty result.
  const hasRealRecord = !!(tableName && recordId && recordId !== 'new');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(hasRealRecord);
  const [error, setError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(new Map());

  // AbortController shared by all read requests for the current record.
  const abortRef = useRef(null);

  // Monotonic guard against out-of-order writes to `items` (ETP-4315 QA
  // follow-up): the saveBeforeAttach path force-saves the header, which
  // updates this hook's own `recordId` prop mid-flight (before the upload
  // that triggered the save has even resolved) and re-fires the mount
  // effect's list() below. If that list() call resolves *after* upload()'s
  // own setItems, it silently overwrites the correct (just-uploaded) state
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

  const resetAbortController = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    return ctrl;
  }, []);

  // ── list ────────────────────────────────────────────────────────────────
  // `opts.recordId` mirrors upload()'s override (ETP-4315 QA follow-up): the
  // list() closure captured by a caller from an earlier render (e.g. the
  // saveBeforeAttach flow, whose whole async chain runs against the "new"
  // AttachmentsTab render it started from) still has `hasRealRecord` bound
  // to that render's "new" recordId, so calling the bare `list()` it holds
  // would silently no-op on its own stale guard — passing the just-saved id
  // through here instead of relying on the hook's own (stale) closure fixes
  // that without waiting for a re-render to hand out a fresh `list`.
  const list = useCallback(async (opts = {}) => {
    const targetRecordId = opts.recordId || recordId;
    const targetHasRealRecord = !!(tableName && targetRecordId && targetRecordId !== 'new');
    if (!targetHasRealRecord) return;
    const generation = ++stateGenerationRef.current;
    const ctrl = resetAbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/sws/neo/attachments/${tableName}/${targetRecordId}`,
        { signal: ctrl.signal, token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const data = json?.items ?? json?.response?.data ?? json?.data ?? json;
      if (generation === stateGenerationRef.current) {
        setItems(Array.isArray(data) ? data : []);
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
  }, [apiFetch, tableName, recordId, token, resetAbortController, ui]);

  // Cancel inflight when record/table changes or component unmounts.
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // Eager load when record is available (same pattern as secondary tabs).
  useEffect(() => {
    if (hasRealRecord) {
      list();
    }
    // Intentionally not depending on `list` to avoid extra re-runs when
    // its identity changes due to unrelated deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, recordId, hasRealRecord]);

  // Reload when another view attaches or deletes a file on this record — e.g.
  // the OCR side panel, which is mounted alongside this tab in form view.
  useAttachmentsChanged({ tableName, recordId, source: sourceRef.current }, list);

  // ── upload ──────────────────────────────────────────────────────────────
  // `opts.recordId` lets a caller upload against a record it just created but
  // that hasn't reached this hook's own `recordId` prop yet (ETP-4315 QA
  // follow-up — a new/unsaved header has no persisted id to attach to, so
  // AttachmentsTab force-saves the header first and passes the freshly
  // returned id here instead of waiting for a re-render).
  const upload = useCallback(async (file, opts = {}) => {
    const targetRecordId = opts.recordId || recordId;
    if (!file || !tableName || !targetRecordId) return;
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
      if (created && created.id) {
        // Bump first: invalidates any list() already in flight (e.g. the one
        // saveBeforeAttach's force-save just re-triggered via the recordId
        // prop update) so it can't overwrite this with a stale read.
        stateGenerationRef.current += 1;
        setItems((prev) => [created, ...prev]);
      } else {
        // Fallback: reload list when the server did not return the new item.
        // Pass targetRecordId explicitly rather than calling list() bare:
        // this closure's own `list` can still be bound to the "new" record
        // from the render that started this call chain (ETP-4315 QA
        // follow-up's saveBeforeAttach flow runs its whole async sequence
        // against the closures captured at drop time, before the force-save
        // hands out a fresh recordId on the next render).
        await list({ recordId: targetRecordId });
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
  }, [apiFetch, tableName, recordId, token, list, ui, announceChange]);

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
      const res = await apiFetch(
        `/sws/neo/attachments/${tableName}/${recordId}/zip`,
        { token },
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
    const snapshot = itemsRef.current;
    setItems(snapshot.filter((it) => it.id !== attachmentId));
    try {
      const res = await apiFetch(
        `/sws/neo/attachments/file/${attachmentId}`,
        { method: 'DELETE', token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      announceChange();
      toast.success(ui('attachmentsDeleteSuccess'));
    } catch (err) {
      setItems(snapshot);
      toast.error(err.message || ui('attachmentsDeleteError'));
    }
  }, [apiFetch, token, ui, announceChange]);

  // ── removeAll (optimistic) ──────────────────────────────────────────────
  const removeAll = useCallback(async () => {
    const snapshot = itemsRef.current;
    if (!snapshot.length) return;
    setItems([]);
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
      announceChange();
      toast.success(ui('attachmentsDeleteAllSuccess'));
    } catch (err) {
      setItems(snapshot);
      toast.error(err.message || ui('attachmentsDeleteAllError'));
    }
  }, [apiFetch, token, ui, announceChange]);

  // ── update description (optimistic) ─────────────────────────────────────
  const updateDescription = useCallback(async (attachmentId, description) => {
    if (!attachmentId) return;
    const snapshot = itemsRef.current;
    setItems(snapshot.map((it) => (it.id === attachmentId ? { ...it, description } : it)));
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
      toast.success(ui('attachmentsUpdateSuccess'));
    } catch (err) {
      setItems(snapshot);
      toast.error(err.message || ui('attachmentsUpdateError'));
    }
  }, [apiFetch, token, ui]);

  return {
    items,
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

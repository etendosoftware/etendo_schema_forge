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
 *   list: () => Promise<void>,
 *   upload: (file: File) => Promise<void>,
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

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(!!(tableName && recordId));
  const [error, setError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(new Map());

  // AbortController shared by all read requests for the current record.
  const abortRef = useRef(null);

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
  const list = useCallback(async () => {
    if (!tableName || !recordId) return;
    const ctrl = resetAbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/sws/neo/attachments/${tableName}/${recordId}`,
        { signal: ctrl.signal, token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const data = json?.items ?? json?.response?.data ?? json?.data ?? json;
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err);
      toast.error(err.message || ui('attachmentsListError'));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, tableName, recordId, token, resetAbortController, ui]);

  // Cancel inflight when record/table changes or component unmounts.
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // Eager load when record is available (same pattern as secondary tabs).
  useEffect(() => {
    if (tableName && recordId) {
      list();
    }
    // Intentionally not depending on `list` to avoid extra re-runs when
    // its identity changes due to unrelated deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, recordId]);

  // Reload when another view attaches or deletes a file on this record — e.g.
  // the OCR side panel, which is mounted alongside this tab in form view.
  useAttachmentsChanged({ tableName, recordId, source: sourceRef.current }, list);

  // ── upload ──────────────────────────────────────────────────────────────
  const upload = useCallback(async (file) => {
    if (!file || !tableName || !recordId) return;
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
        `/sws/neo/attachments/${tableName}/${recordId}`,
        { method: 'POST', body: form, token },
      );
      if (!res.ok) {
        const msg = await extractErrorMessage(res);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const created = json?.response?.data ?? json?.data ?? json;
      if (created && created.id) {
        setItems((prev) => [created, ...prev]);
      } else {
        // Fallback: reload list when the server did not return the new item.
        await list();
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

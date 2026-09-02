import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchMainAttachment,
  fetchAttachmentBlobUrl,
  uploadAndMarkMainAttachment,
  markAttachmentAsMain,
  deleteAttachment,
} from '@/components/copilot/ocr/listAttachments';
import {
  newAttachmentsSource,
  notifyAttachmentsChanged,
  useAttachmentsChanged,
} from '@/components/attachments/attachmentsBus';
import { isAttachmentStale } from '@/lib/attachmentFreshness.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
/**
 * useMainAttachment — sidebar/tab and preview always agree, because both read
 * and write the same real `Attachment` row, marked via `EM_ETGO_ISPREVIEWMAIN`
 * (ETP-4315). Backs `GenericPreviewModal`'s `ManagedLeftPanel` and the OCR side
 * panel (`OcrSidePanel`'s `DocumentView`) against `/sws/neo/attachments/*` (the
 * retired `/sws/neo/preview-file` cache and its `usePreviewAttachment` hook
 * were removed once every window had migrated).
 *
 * When storeCondition is false (or required params are missing) the hook is a
 * no-op: storedFile stays null and writes are silently skipped.
 *
 * ── Cross-view sync (ETP-4855) ──────────────────────────────────────────────
 * This hook and the Attachments tab (`useAttachments`) each own independent
 * client state over the same server record, and both can be mounted at once
 * (form view keeps inactive tabs mounted). A write through one leaves the
 * other stale until it remounts. `attachmentsBus` closes that gap: this hook
 * announces its own writes/deletes and reloads whenever another view
 * announces a change to the same (tableName, recordId) — ignoring its own
 * announcements via a stable per-instance `source` id.
 *
 * @param {Object} params
 * @param {string|null}  params.documentId     - PK of the record the attachment belongs to
 * @param {string|null}  params.tableName      - AD_Table.name (e.g. 'C_Invoice', 'M_InOut')
 * @param {boolean}      params.storeCondition - false → no-op
 * @param {string|null}  params.token          - Bearer token
 * @param {string|null}  params.apiBaseUrl     - Window base URL (last segment stripped inside)
 */
export function useMainAttachment({
  documentId = null,
  tableName = null,
  storeCondition = false,
  token = null,
  apiBaseUrl = null,
  recordUpdated = null,
} = {}) {
  const [storedFile, setStoredFile] = useState(null);
  // ETP-4787 — the stored file is still shown while it lasts, but callers are told it
  // predates the record so they can overwrite it with a fresh rendering. Reported
  // separately from `storedFile` rather than by hiding it: the panel would otherwise
  // blank out for the duration of the re-upload.
  const [storedFileIsStale, setStoredFileIsStale] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [storeFailed, setStoreFailed] = useState(false);
  const apiFetch = useApiFetch(apiBaseUrl);
  const objectUrlRef = useRef(null);
  const sourceRef = useRef(null);
  if (!sourceRef.current) sourceRef.current = newAttachmentsSource();

  const active = !!(storeCondition && documentId && tableName && token);

  const revokeUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const applyAttachment = useCallback((attachmentId, fileName, mimeType, objectUrl) => {
    revokeUrl();
    objectUrlRef.current = objectUrl;
    setStoredFile({ attachmentId, fileName, mimeType, objectUrl });
  }, [revokeUrl]);

  // Look up the marked attachment, then fetch its blob. Used both on mount and
  // whenever another view announces a change to this same record's attachments.
  const refresh = useCallback(async () => {
    if (!active) return;
    let objectUrl = null;
    setIsBusy(true);
    try {
      const main = await fetchMainAttachment({ token, tableName, recordId: documentId, apiBaseUrl });
      if (!main) {
        revokeUrl();
        setStoredFile(null);
        setStoredFileIsStale(false);
        return;
      }
      setStoredFileIsStale(isAttachmentStale(main, recordUpdated));
      objectUrl = await fetchAttachmentBlobUrl({ token, attachmentId: main.id, apiBaseUrl });
      if (objectUrl) applyAttachment(main.id, main.name, main.dataType, objectUrl);
    } catch {
      // keep whatever was already shown; a transient refresh failure isn't fatal
    } finally {
      setIsBusy(false);
    }
  }, [active, token, tableName, documentId, apiBaseUrl, recordUpdated, applyAttachment, revokeUrl]);

  // Restore from server on mount / whenever the record identity changes.
  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await refresh(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, token, tableName, documentId, apiBaseUrl, recordUpdated]);

  // Another view (Attachments tab, another mounted OcrSidePanel/preview) wrote
  // to this same record — reload so this instance stops showing stale data.
  useAttachmentsChanged(
    { tableName: active ? tableName : null, recordId: documentId, source: sourceRef.current },
    refresh,
  );

  // Revoke Blob URL on unmount
  useEffect(() => () => revokeUrl(), [revokeUrl]);

  const uploadAndMark = useCallback(async (blob, fileName, mimeType) => {
    if (!active) return;
    const created = await uploadAndMarkMainAttachment({
      token, tableName, recordId: documentId, file: blob, fileName, apiBaseUrl,
    });
    if (!created || !created.id) {
      throw new Error('Upload failed');
    }
    const objectUrl = URL.createObjectURL(blob);
    applyAttachment(created.id, fileName, mimeType, objectUrl);
    // `markAsMain=true` deleted the previous marked attachment in the same transaction,
    // so the record's cache is now this blob — by construction not stale.
    setStoredFileIsStale(false);
    notifyAttachmentsChanged({ tableName, recordId: documentId, source: sourceRef.current });
  }, [active, token, tableName, documentId, apiBaseUrl, applyAttachment]);

  const storeFile = useCallback(async (file) => {
    if (!active) return;
    setIsBusy(true);
    setStoreFailed(false);
    try {
      await uploadAndMark(file, file.name, file.type);
    } catch {
      setStoreFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, [active, uploadAndMark]);

  const storeBlob = useCallback(async (blob, fileName) => {
    if (!active) return;
    setIsBusy(true);
    setStoreFailed(false);
    try {
      await uploadAndMark(blob, fileName, blob.type || 'application/pdf');
    } catch {
      setStoreFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, [active, uploadAndMark]);

  const storeUrl = useCallback(async (url, fileName) => {
    if (!active) return;
    setIsBusy(true);
    setStoreFailed(false);
    try {
      const res = await apiFetch(url, { baseUrl: '', token });
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
      const blob = await res.blob();
      await uploadAndMark(blob, fileName, blob.type || 'application/pdf');
    } catch {
      setStoreFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, [active, token, apiFetch, uploadAndMark]);

  /**
   * Marks an already-uploaded attachment (e.g. one created by an external
   * flow such as OCR ingestion) as this record's main document, then loads
   * it into view. Used by the OCR bridge, not by `GenericPreviewModal`.
   */
  const markExisting = useCallback(async (attachmentId, fileName, mimeType) => {
    if (!active) return false;
    const ok = await markAttachmentAsMain({ token, attachmentId, isMain: true, apiBaseUrl });
    if (!ok) return false;
    const objectUrl = await fetchAttachmentBlobUrl({ token, attachmentId, apiBaseUrl });
    if (objectUrl) {
      applyAttachment(attachmentId, fileName, mimeType, objectUrl);
    }
    notifyAttachmentsChanged({ tableName, recordId: documentId, source: sourceRef.current });
    return true;
  }, [active, token, apiBaseUrl, applyAttachment, tableName, documentId]);

  const deleteFile = useCallback(async () => {
    if (!active || !storedFile?.attachmentId) return;
    const result = await deleteAttachment({ token, attachmentId: storedFile.attachmentId, apiBaseUrl });
    if (!result?.ok) return;
    revokeUrl();
    setStoredFile(null);
    setStoredFileIsStale(false);
    notifyAttachmentsChanged({ tableName, recordId: documentId, source: sourceRef.current });
  }, [active, storedFile, token, apiBaseUrl, revokeUrl, tableName, documentId]);

  return {
    storedFile, storedFileIsStale, isBusy, storeFailed,
    storeFile, storeBlob, storeUrl, markExisting, deleteFile,
  };
}

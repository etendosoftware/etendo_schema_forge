import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchMainAttachment,
  fetchAttachmentBlobUrl,
  uploadAndMarkMainAttachment,
  markAttachmentAsMain,
  deleteAttachment,
} from '@/components/copilot/ocr/listAttachments';

/**
 * useMainAttachment — sidebar/tab and preview always agree, because both read
 * and write the same real `Attachment` row, marked via `EM_ETGO_ISPREVIEWMAIN`
 * (ETP-4315). Same public shape as `usePreviewAttachment` — a drop-in
 * replacement for `GenericPreviewModal`'s `ManagedLeftPanel` — but backed by
 * `/sws/neo/attachments/*` instead of the (retired for these windows)
 * `/sws/neo/preview-file` cache.
 *
 * When storeCondition is false (or required params are missing) the hook is a
 * no-op: storedFile stays null and writes are silently skipped.
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
} = {}) {
  const [storedFile, setStoredFile] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [storeFailed, setStoreFailed] = useState(false);
  const objectUrlRef = useRef(null);

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

  // Restore from server on mount: look up the marked attachment, then fetch its blob.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setIsBusy(true);
    fetchMainAttachment({ token, tableName, recordId: documentId, apiBaseUrl })
      .then(async (main) => {
        if (cancelled || !main) return;
        const objectUrl = await fetchAttachmentBlobUrl({
          token, attachmentId: main.id, apiBaseUrl,
        });
        if (cancelled || !objectUrl) return;
        applyAttachment(main.id, main.name, main.dataType, objectUrl);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsBusy(false); });
    return () => { cancelled = true; };
  }, [active, token, tableName, documentId, apiBaseUrl, applyAttachment]);

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
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
      const blob = await res.blob();
      await uploadAndMark(blob, fileName, blob.type || 'application/pdf');
    } catch {
      setStoreFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, [active, token, uploadAndMark]);

  /**
   * Marks an already-uploaded attachment (e.g. one created by an external
   * flow such as OCR ingestion) as this record's main document, then loads
   * it into view. Not part of `usePreviewAttachment`'s shape — used by the
   * OCR bridge, not by `GenericPreviewModal`.
   */
  const markExisting = useCallback(async (attachmentId, fileName, mimeType) => {
    if (!active) return false;
    const ok = await markAttachmentAsMain({ token, attachmentId, isMain: true, apiBaseUrl });
    if (!ok) return false;
    const objectUrl = await fetchAttachmentBlobUrl({ token, attachmentId, apiBaseUrl });
    if (objectUrl) {
      applyAttachment(attachmentId, fileName, mimeType, objectUrl);
    }
    return true;
  }, [active, token, apiBaseUrl, applyAttachment]);

  const deleteFile = useCallback(async () => {
    if (!active || !storedFile?.attachmentId) return;
    await deleteAttachment({ token, attachmentId: storedFile.attachmentId, apiBaseUrl });
    revokeUrl();
    setStoredFile(null);
  }, [active, storedFile, token, apiBaseUrl, revokeUrl]);

  return { storedFile, isBusy, storeFailed, storeFile, storeBlob, storeUrl, markExisting, deleteFile };
}

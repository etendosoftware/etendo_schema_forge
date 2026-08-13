import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
} from '@/components/copilot/ocr/listAttachments';
import {
  newAttachmentsSource,
  notifyAttachmentsChanged,
  useAttachmentsChanged,
} from '@/components/attachments/attachmentsBus';
import {
  fetchPreviewFile,
  storePreviewFile,
  deletePreviewFile,
  previewFileToBlob,
} from './previewFileApi.js';

export const ACCEPTED_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
};
export const ACCEPT_ATTR = Object.keys(ACCEPTED_TYPES).join(',');

/**
 * usePreviewAttachment — the document slot of a record.
 *
 * Reads and writes `/sws/neo/preview-file`, which holds **one file per
 * (specName, recordId)**. That single-slot shape is what makes it the answer to
 * "which document does this record's preview show": for sales documents it is a
 * cache of the PDF we generate, and for a purchase invoice — which has no
 * generated report at all — it is the document the user provided, so nothing
 * competes for the slot (ETP-4855).
 *
 * Both side panels (grid preview and form view) read this slot, so a record with
 * no slot file shows nothing: exactly the wanted behaviour for invoices captured
 * by hand or imported historically.
 *
 * When storeCondition is false (or required params are missing) the hook is a
 * no-op: storedFile stays null and writes are silently skipped.
 *
 * On mount (when active): reads the slot. If empty and sourceUrl is provided,
 * GenericPreviewModal calls storeUrl() to fetch and cache the file on first open.
 *
 * ── Mirroring into the record's attachments ────────────────────────────────
 * Passing `tableName` (e.g. 'C_Invoice') additionally copies what the user
 * stores here into `/sws/neo/attachments/{tableName}/{recordId}`, so the file
 * also appears in the document's Attachments tab — required by ETP-4855 Error 3.
 * Omit it for generated-PDF caches: nobody attached those, so they must not show
 * up as attachments.
 *
 * The copy means the same bytes live in two places, so deletions are kept
 * consistent in both directions: deleting here removes the mirror when it is
 * unambiguous, and a deletion made from the Attachments tab clears this slot via
 * the attachments bus (see the reconcile effect below).
 *
 * @param {Object} params
 * @param {string|null}  params.documentId     - PK of the source document
 * @param {string|null}  params.specName       - Spec identifier (e.g. 'sales-invoice')
 * @param {boolean}      params.storeCondition - false → no-op
 * @param {string|null}  params.token          - Bearer token
 * @param {string|null}  params.apiBaseUrl     - Window base URL (last segment stripped inside)
 * @param {string|null}  params.tableName      - AD table; enables the attachments mirror
 */
export function usePreviewAttachment({
  documentId = null,
  specName = null,
  storeCondition = false,
  token = null,
  apiBaseUrl = null,
  tableName = null,
} = {}) {
  const [storedFile, setStoredFile] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [storeFailed, setStoreFailed] = useState(false);
  const objectUrlRef = useRef(null);

  const neoBase = apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '') : null;
  const active = !!(storeCondition && documentId && specName && token && neoBase);
  const mirrored = !!(active && tableName);

  const sourceRef = useRef(null);
  if (!sourceRef.current) sourceRef.current = newAttachmentsSource();

  const revokeUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const applyBlob = useCallback((fileName, mimeType, blob) => {
    revokeUrl();
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    setStoredFile({ fileName, mimeType, objectUrl: url });
  }, [revokeUrl]);

  const clearStoredFile = useCallback(() => {
    revokeUrl();
    setStoredFile(null);
  }, [revokeUrl]);

  // Read the slot on mount and whenever the record it belongs to changes.
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setIsBusy(true);
    (async () => {
      const payload = await fetchPreviewFile({ token, apiBaseUrl, specName, recordId: documentId });
      if (cancelled) return;
      const blob = previewFileToBlob(payload);
      if (blob) applyBlob(payload.fileName, payload.mimeType, blob);
      setIsBusy(false);
    })();
    return () => { cancelled = true; };
  }, [active, apiBaseUrl, specName, documentId, token, applyBlob]);

  // Revoke Blob URL on unmount
  useEffect(() => () => revokeUrl(), [revokeUrl]);

  /**
   * Find the mirrored copy of the slot file among the record's attachments.
   * Matched by name: only an unambiguous single match counts, so a record that
   * happens to hold several files with the same name is left untouched rather
   * than guessing which one to delete.
   */
  const findMirror = useCallback(async (fileName) => {
    if (!mirrored || !fileName) return null;
    const rows = await listAttachments({ token, tableName, recordId: documentId, apiBaseUrl });
    const matches = (rows || []).filter(r => r?.id && r.name === fileName);
    return matches.length === 1 ? matches[0] : null;
  }, [mirrored, token, tableName, documentId, apiBaseUrl]);

  /**
   * The Attachments tab (or the other side panel) changed this record's files.
   * If our slot file is no longer among them it was deleted there, so empty the
   * slot too — otherwise the panel would keep showing a document that no longer
   * exists on the record.
   */
  const reconcileWithAttachments = useCallback(async () => {
    if (!mirrored) return;
    const fileName = storedFile?.fileName;
    if (!fileName) return;
    const rows = await listAttachments({ token, tableName, recordId: documentId, apiBaseUrl });
    const stillThere = (rows || []).some(r => r?.name === fileName);
    if (stillThere) return;
    await deletePreviewFile({ token, apiBaseUrl, specName, recordId: documentId });
    clearStoredFile();
  }, [mirrored, storedFile?.fileName, token, tableName, documentId, apiBaseUrl, specName, clearStoredFile]);

  useAttachmentsChanged(
    { tableName: mirrored ? tableName : null, recordId: documentId, source: sourceRef.current },
    reconcileWithAttachments,
  );

  const postBlob = useCallback(async (blob, fileName, mimeType) => {
    if (!active) return;
    const res = await storePreviewFile({
      token, apiBaseUrl, specName, recordId: documentId, file: blob, fileName, mimeType,
    });
    if (!res.ok) throw new Error(`Store failed: ${res.error}`);
    applyBlob(fileName, mimeType, blob);

    if (!mirrored) return;
    // Mirror into the record's attachments so the file shows up in the
    // Attachments tab. A failure here is not fatal: the slot — what both panels
    // render — is already stored.
    const copy = await uploadAttachment({
      token, tableName, recordId: documentId, file: blob, fileName, apiBaseUrl,
    });
    if (copy?.ok) {
      notifyAttachmentsChanged({ tableName, recordId: documentId, source: sourceRef.current });
    } else {
      console.warn('[preview] attachments mirror failed (non-fatal):', copy?.error);
    }
  }, [active, mirrored, token, apiBaseUrl, specName, documentId, tableName, applyBlob]);

  const storeFile = useCallback(async (file) => {
    if (!active) return;
    setIsBusy(true);
    setStoreFailed(false);
    try {
      await postBlob(file, file.name, file.type);
    } catch {
      setStoreFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, [active, postBlob]);

  const storeBlob = useCallback(async (blob, fileName) => {
    if (!active) return;
    setIsBusy(true);
    setStoreFailed(false);
    try {
      await postBlob(blob, fileName, blob.type || 'application/pdf');
    } catch {
      setStoreFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, [active, postBlob]);

  const storeUrl = useCallback(async (url, fileName) => {
    if (!active) return;
    setIsBusy(true);
    setStoreFailed(false);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
      const blob = await res.blob();
      await postBlob(blob, fileName, blob.type || 'application/pdf');
    } catch {
      setStoreFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, [active, token, postBlob]);

  const deleteFile = useCallback(async () => {
    if (!active) return;
    const fileName = storedFile?.fileName;
    await deletePreviewFile({ token, apiBaseUrl, specName, recordId: documentId });
    clearStoredFile();

    if (!mirrored) return;
    const copy = await findMirror(fileName);
    if (!copy) return;
    await deleteAttachment({ token, attachmentId: copy.id, apiBaseUrl });
    notifyAttachmentsChanged({ tableName, recordId: documentId, source: sourceRef.current });
  }, [active, mirrored, storedFile?.fileName, token, apiBaseUrl, specName, documentId, tableName, clearStoredFile, findMirror]);

  return { storedFile, isBusy, storeFailed, storeFile, storeBlob, storeUrl, deleteFile };
}

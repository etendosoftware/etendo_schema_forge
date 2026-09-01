import { useCallback, useEffect, useRef, useState } from 'react';
import { useUI } from '@/i18n';
import { useAttachments } from './useAttachments';
import UploadDropzone from './UploadDropzone';
import AttachmentsTable from './AttachmentsTable';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';

const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/rtf',
  'application/xml',
  'text/xml',
  'text/plain',
  'image/*',
];

/**
 * Generic attachments tab. Renders an upload dropzone, the list of
 * attachments for the current record, and the edit / delete dialogs.
 *
 * Drop this into any window's DetailView tabs — no window-specific logic is
 * required. Backed by the NEO Headless attachments endpoints.
 *
 * Props:
 *   recordId    - Owning record id.
 *   data        - Full record payload (passed through for parity with other
 *                  tabs, but not used internally).
 *   token       - Bearer token for the API.
 *   apiBaseUrl  - Base URL for the NEO Headless API.
 *   api         - createApiFetch instance (reserved for future extensions).
 *   tableName   - AD table name (e.g. "C_Order").
 *   config      - { maxSizeMB?: number, allowedMimeTypes?: string[], saveBeforeAttach?: boolean }
 *                  Defaults: maxSizeMB = 10, allowedMimeTypes = undefined (any),
 *                  saveBeforeAttach = false.
 *   isActive    - Whether the tab is currently active. Drives the lazy load.
 *   isNew            - True while the owning header record hasn't been saved yet
 *                       (recordId is the literal string "new"). Passed by
 *                       DetailView to every 'tab'-placement custom component.
 *   onSaveHeader      - ({ navigateAfter? }) => Promise<record|null>. Force-saves
 *                       the header. Only present (non-undefined) while isNew.
 *   onGoToSavedRecord - (savedRecord) => void. Navigates to the just-saved
 *                       record with this tab re-opened. Only present while isNew.
 *
 * ── Attaching before the header is saved (ETP-4315 QA follow-up) ───────────
 * A brand-new record has no persisted id, so `recordId` here is the literal
 * string "new" — truthy, so the dropzone stays enabled, but a real upload
 * against it 404s server-side and the file is silently lost. Config-gated
 * per window (`saveBeforeAttach`, default false — every other window keeps
 * today's behavior until its own follow-up) because forcing a save just to
 * attach a file is the right UX for a document-capture-first flow (purchase
 * invoice) but not necessarily for the rest.
 */
// eslint-disable-next-line no-unused-vars
export default function AttachmentsTab({
  recordId,
  data,
  token,
  apiBaseUrl,
  api,
  tableName,
  config = {},
  isActive,
  onCountChange,
  isNew,
  onSaveHeader,
  onGoToSavedRecord,
}) {
  const ui = useUI();
  const saveBeforeAttach = !!config.saveBeforeAttach;
  const [isSavingBeforeAttach, setIsSavingBeforeAttach] = useState(false);

  const effectiveConfig = {
    maxSizeMB: 10,
    allowedMimeTypes: DEFAULT_ALLOWED_MIME_TYPES,
    typesLabel: ui('attachmentsDefaultTypesLabel'),
    ...config,
  };

  const {
    items,
    loading,
    uploadingFiles,
    upload,
    download,
    downloadAll,
    remove,
    removeAll,
    formatBytes,
  } = useAttachments({
    tableName,
    recordId,
    token,
    apiBaseUrl,
    isActive,
    config: effectiveConfig,
  });

  const [deletingAttachment, setDeletingAttachment] = useState(null);
  const [pendingUploadFile, setPendingUploadFile] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => { onCountChangeRef.current = onCountChange; });
  useEffect(() => {
    if (!loading) onCountChangeRef.current?.(items.length);
  }, [items.length, loading]);

  const uploadToNewRecord = useCallback(async (file) => {
    if (!onSaveHeader) return;
    setIsSavingBeforeAttach(true);
    try {
      const saved = await onSaveHeader({ navigateAfter: false });
      if (!saved?.id) return; // validation/save failed — handleSave already toasted why
      await upload(file, { recordId: saved.id });
      onGoToSavedRecord?.(saved);
    } finally {
      setIsSavingBeforeAttach(false);
    }
  }, [onSaveHeader, onGoToSavedRecord, upload]);

  const handleUpload = (file) => {
    if (isNew && saveBeforeAttach) {
      uploadToNewRecord(file);
      return;
    }
    const isDuplicate = items.some(
      (item) => (item.name || item.fileName) === file.name
    );
    if (isDuplicate) {
      setPendingUploadFile(file);
    } else {
      upload(file);
    }
  };

  return (
    <div className="space-y-2" data-testid="attachments-tab-panel">
      <UploadDropzone
        onFiles={handleUpload}
        config={effectiveConfig}
        disabled={!recordId || isSavingBeforeAttach}
        data-testid="UploadDropzone__281340" />
      <AttachmentsTable
        items={items}
        loading={loading}
        uploadingFiles={uploadingFiles}
        onDownload={download}
        onDelete={setDeletingAttachment}
        onDownloadAll={items.length > 0 ? downloadAll : undefined}
        onDeleteAll={items.length > 0 ? () => setConfirmDeleteAll(true) : undefined}
        formatBytes={formatBytes}
        data-testid="AttachmentsTable__281340" />
      <ConfirmDeleteDialog
        open={!!deletingAttachment}
        onClose={() => setDeletingAttachment(null)}
        onConfirm={() => {
          if (deletingAttachment?.id) {
            remove(deletingAttachment.id);
          }
        }}
        data-testid="ConfirmDeleteDialog__281340" />
      <ConfirmDeleteDialog
        open={!!pendingUploadFile}
        message={ui('attachmentsConfirmReplace')}
        confirmLabel={ui('attachmentsContinue')}
        confirmVariant="default"
        onClose={() => setPendingUploadFile(null)}
        onConfirm={() => {
          if (pendingUploadFile) {
            upload(pendingUploadFile);
          }
        }}
        data-testid="ConfirmDeleteDialog__281340" />
      <ConfirmDeleteDialog
        open={confirmDeleteAll}
        title={ui('attachmentsRemoveAllTitle')}
        message={ui('attachmentsRemoveAllMessage')}
        onClose={() => setConfirmDeleteAll(false)}
        onConfirm={removeAll}
        data-testid="ConfirmDeleteDialog__281340" />
    </div>
  );
}

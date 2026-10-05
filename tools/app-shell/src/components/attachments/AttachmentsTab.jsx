import { useCallback, useEffect, useRef, useState } from 'react';
import { useUI } from '@/i18n';
import { useAttachments } from './useAttachments';
import UploadDropzone from './UploadDropzone';
import AttachmentsTable from './AttachmentsTable';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import { useAttachmentPolicy } from './useAttachmentPolicy';
import { buildTypesLabel } from './attachmentPolicy';

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
 *                       the header; null means the host already told the user
 *                       why. Only present (non-undefined) while isNew.
 *   onGoToSavedRecord - (savedRecord) => void. Navigates to the just-saved
 *                       record with this tab re-opened. Only present while isNew.
 *   readOnly          - When true, hides the single-row and "delete all" delete
 *                       actions (download/upload stay available). Default false
 *                       (every existing caller is unaffected). A window passes
 *                       this when the owning record has left an editable/draft
 *                       state — e.g. fiscal-models' "Justificante" tab, where an
 *                       already-submitted declaration's receipt must not be
 *                       deletable (ETP-5432 pt.3). This is a UI convenience only:
 *                       the backend `DELETE /sws/neo/attachments/:id` endpoint has
 *                       no per-record status check, so it does not stop a direct
 *                       API call — see NeoAttachmentsHelper#handleDelete.
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
  isDocumentReadOnly,
  readOnly = false,
}) {
  const ui = useUI();
  // ETP-5432/ETP-5205 merge fix: `isDocumentReadOnly` (generic, wired by DetailView
  // from the document's own lock/processed state) and `readOnly` (explicit, for
  // bespoke callers outside DetailView — e.g. fiscal-models' "Justificante" tab,
  // which is not rendered through DetailView) are two independent signals; either
  // one should suppress delete. Losing either source silently re-enables delete on
  // a record that must not allow it — this exact regression shipped once already:
  // a develop merge kept `isDocumentReadOnly` and dropped `readOnly`, so both
  // FmModel303Page's and FmModel349Page's `readOnly={status !== 'draft'}` silently
  // stopped doing anything.
  const effectiveReadOnly = !!isDocumentReadOnly || !!readOnly;
  const saveBeforeAttach = !!config.saveBeforeAttach;
  const [isSavingBeforeAttach, setIsSavingBeforeAttach] = useState(false);

  // ETP-5038: the accepted types and the max size come from the backend
  // (GET /sws/neo/attachments/config), which is also what enforces them on upload — one
  // list, not two that drift. A window may still NARROW it via `config` (the fiscal-model
  // receipt tabs restrict their dropzone to PDF).
  const policy = useAttachmentPolicy({ apiBaseUrl, token, enabled: isActive });
  const overridesTypes = config.allowedMimeTypes != null || config.allowedExtensions != null;
  // An override replaces the type rules wholesale: keeping the server's extension list
  // alongside a narrowed MIME list would let the extension fallback wave through exactly
  // the files the override meant to exclude.
  const typeRules = overridesTypes
    ? {
      allowedMimeTypes: config.allowedMimeTypes,
      allowedExtensions: config.allowedExtensions,
    }
    : {
      allowedMimeTypes: policy.allowedMimeTypes,
      allowedExtensions: policy.allowedExtensions,
      typeGroups: policy.typeGroups,
    };

  const effectiveConfig = {
    maxSizeMB: policy.maxSizeMB,
    ...typeRules,
    // Derived from the very list being enforced, so the label cannot promise a format the
    // upload will reject — the mismatch that made this ticket ("PDF, Word, Excel,
    // PowerPoint, Images" while .txt was silently accepted).
    typesLabel: buildTypesLabel(typeRules, ui) ?? ui('attachmentsDefaultTypesLabel'),
    ...config,
  };

  const {
    items,
    count,
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
    // ETP-5526: only a tab that reports a badge pays for the count request.
    prefetchCount: Boolean(onCountChange),
  });

  const [deletingAttachment, setDeletingAttachment] = useState(null);
  const [pendingUploadFile, setPendingUploadFile] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => { onCountChangeRef.current = onCountChange; });
  // ETP-5526: report the real count as soon as the record opens — the hook
  // fetches it from the lightweight count endpoint while the full list stays
  // lazy (ETP-4564), and switches to the list length once the list is read.
  // `null` when it is still unknown or cannot be fetched (e.g. an older
  // backend without the endpoint): the badge then shows no number, never a
  // fake 0 that reads as "the file was lost".
  useEffect(() => {
    if (!loading) onCountChangeRef.current?.(count);
  }, [count, loading]);

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

  const onDeleteAll = !effectiveReadOnly && items.length > 0 ? () => setConfirmDeleteAll(true) : undefined;

  return (
    <div className="space-y-2" data-testid="attachments-tab-panel">
      <UploadDropzone
        onFiles={handleUpload}
        config={effectiveConfig}
        // Upload stays gated by `isDocumentReadOnly` only — the bespoke `readOnly`
        // prop is delete-only by contract (see JSDoc above: "download/upload stay
        // available"), so it must not disable the dropzone.
        disabled={!recordId || isSavingBeforeAttach || isDocumentReadOnly}
        data-testid="UploadDropzone__281340" />
      <AttachmentsTable
        items={items}
        loading={loading}
        uploadingFiles={uploadingFiles}
        onDownload={download}
        onDelete={effectiveReadOnly ? undefined : setDeletingAttachment}
        onDownloadAll={items.length > 0 ? downloadAll : undefined}
        onDeleteAll={onDeleteAll}
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

import { useEffect, useRef, useState } from 'react';
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
 *   config      - { maxSizeMB?: number, allowedMimeTypes?: string[] }
 *                  Defaults: maxSizeMB = 10, allowedMimeTypes = undefined (any).
 *   isActive    - Whether the tab is currently active. Drives the lazy load.
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
}) {
  const ui = useUI();

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

  const handleUpload = (file) => {
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
        disabled={!recordId}
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

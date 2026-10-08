import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';
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
 *   readOnly          - When true, hides every delete action — the per-row one and
 *                       the selection bar's. Download and upload stay available;
 *                       that asymmetry is the prop's contract, not an oversight.
 *                       Default false (every existing caller is unaffected). A
 *                       window passes this when the owning record has left an
 *                       editable/draft state — e.g. fiscal-models' "Justificante"
 *                       tab, where an already-submitted declaration's receipt must
 *                       not be deletable (ETP-5432 pt.3). This is a UI convenience
 *                       only: the backend `DELETE /sws/neo/attachments/:id`
 *                       endpoint DOES reject it for a non-draft fiscal declaration
 *                       (409), but no generic per-record status check exists — see
 *                       NeoAttachmentsHelper#handleDelete.
 *   isDocumentReadOnly - Accepted and deliberately IGNORED since ETP-5526; see the
 *                       note above `effectiveReadOnly` below. Kept in the signature
 *                       because DetailView passes it to every tab-placement custom
 *                       component, and because silently dropping it from the list
 *                       would read as "this tab never received the document lock".
 *
 * ── Attaching before the header is saved (ETP-4315 QA follow-up) ───────────
 * A brand-new record has no persisted id, so `recordId` here is the literal
 * string "new" — truthy, so the dropzone stays enabled, but a real upload
 * against it 404s server-side and the file is silently lost. Config-gated
 * per window (`saveBeforeAttach`, default false — every other window keeps
 * today's behavior until its own follow-up) because forcing a save just to
 * attach a file is the right UX for a document-capture-first flow (purchase
 * invoice) but not necessarily for the rest.
 *
 * ETP-5309: without `saveBeforeAttach`, a new record renders a save-first hint
 * instead of the dropzone (the upload used to POST against "new" and surface a
 * raw backend 500). DetailView also disables the tab button itself through the
 * `requiresSavedRecord` / `savedRecordHintKey` statics declared below.
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
  // ── Two signals, now DELIBERATELY asymmetric (ETP-5526). Read before "fixing". ──
  //
  // This used to be `!!isDocumentReadOnly || !!readOnly`, and the OR was load-bearing:
  // a develop merge once kept `isDocumentReadOnly` and dropped `readOnly`, which
  // silently re-enabled delete on records that must not allow it (FmModel303Page and
  // FmModel349Page both pass `readOnly={status !== 'draft'}` and simply stopped doing
  // anything). That regression is why the warning below is this long.
  //
  //   `readOnly` — the explicit prop, passed by bespoke callers that do NOT render
  //   through DetailView: the fiscal-model "Justificante" tabs. It is UNCHANGED and
  //   must stay so. It hides every delete affordance (per-row AND the selection bar's)
  //   and deliberately does NOT touch upload or download — ETP-5432 blocks *removing*
  //   a submitted declaration's receipt, nothing else. Dropping it, renaming it, or
  //   widening it to cover upload all re-break ETP-5432.
  //
  //   `isDocumentReadOnly` — the generic lock DetailView wires from the document's own
  //   processed/completed state. It no longer takes part here AT ALL: a processed
  //   document now accepts attachment work (upload and delete), by product decision.
  //   Attachments are evidence about a document, not part of it, and a closed invoice
  //   is exactly when someone needs to file the signed copy. This is NOT a lost signal
  //   — it is the ticket's intended behaviour change. Re-adding it to this expression,
  //   or back to the dropzone's `disabled`, reverts a deliberate product decision.
  //
  // Consequence, known and accepted: there is currently no way to express a fully
  // read-only attachments view through this component.
  const effectiveReadOnly = !!readOnly;
  const saveBeforeAttach = !!config.saveBeforeAttach;
  const needsSavedRecord = !!isNew && !saveBeforeAttach;
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
    downloadSelection,
    remove,
    removeMany,
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
  const [confirmDeleteSelection, setConfirmDeleteSelection] = useState(false);

  // ── Multi-select (ETP-5526) ───────────────────────────────────────────────
  // This tab owns the selection; AttachmentsTable only renders it (see its
  // "Selection is an opt-in capability" note). Same split as
  // MovementsTab → StatementsTable, including who renders the SelectionToolbar.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleRow = useCallback((id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);
  const replaceSelection = useCallback((ids) => setSelectedIds(new Set(ids)), []);

  // A selection must never outlive the record it was made on: DetailView keeps
  // this tab mounted across record navigation, so without this the next record
  // would open with the previous one's ids ticked — and the bar would offer to
  // delete rows that are not on screen.
  useEffect(() => { clearSelection(); }, [recordId, clearSelection]);

  // Intersected with the live list rather than read straight off the Set: after a
  // bulk delete the removed ids linger for one render, and the count (and the bar
  // itself) must follow what the user can actually see.
  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );
  const selectionCount = selectedItems.length;

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

  const downloadSelected = () => downloadSelection(selectedItems.map((it) => it.id));

  return (
    <div className="space-y-2" data-testid="attachments-tab-panel">
      {/* ETP-5309: an unsaved record has no id to attach to — a save-first hint replaces
          the dropzone rather than letting the upload POST against the literal "new".
          A tab configured with `saveBeforeAttach` saves the header itself, so it keeps
          the dropzone. */}
      {needsSavedRecord ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="attachments-save-first-hint">
          {ui('attachmentsSaveFirstHint')}
        </p>
      ) : (
        <UploadDropzone
          onFiles={handleUpload}
          config={effectiveConfig}
          // Neither read-only signal gates upload any more: `readOnly` never did (it is
          // delete-only by contract — see JSDoc above: "download/upload stay available")
          // and `isDocumentReadOnly` deliberately stopped doing so in ETP-5526 —
          // attaching to a processed document is now allowed. What is left are the two
          // mechanical reasons an upload cannot happen at all.
          disabled={!recordId || isSavingBeforeAttach}
          data-testid="UploadDropzone__281340" />
      )}
      <AttachmentsTable
        items={items}
        loading={loading}
        uploadingFiles={uploadingFiles}
        onDownload={download}
        onDelete={effectiveReadOnly ? undefined : setDeletingAttachment}
        selectedIds={selectedIds}
        onToggleRow={toggleRow}
        onToggleAll={replaceSelection}
        formatBytes={formatBytes}
        data-testid="AttachmentsTable__281340" />
      {/* The system's own bulk-selection pill (SelectionToolbar) — the same shell
          Contactos, Cuentas financieras, Amortización, Activos and every list view
          use. Two segments, as that component expects: the counter, then the
          actions. Delete obeys exactly the same gate as the per-row delete, so the
          bar can never become a way around a rule the row respects. */}
      <SelectionToolbar
        visible={selectionCount > 0}
        onClose={clearSelection}
        closeTitle={ui('close')}
        data-testid="attachments-selection-bar">
        <span
          role="status"
          className="text-sm font-medium"
          data-testid="attachments-selection-count">
          {ui('selected', { count: selectionCount })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={ui('attachmentsDownloadZip')}
            aria-label={ui('attachmentsDownloadZip')}
            onClick={downloadSelected}
            className="inline-flex items-center justify-center rounded-md p-2 transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)]"
            data-testid="attachments-download-selected">
            <Download className="h-3.5 w-3.5" data-testid="Download__281340" />
          </button>
          {!effectiveReadOnly && (
            <button
              type="button"
              title={ui('delete')}
              aria-label={ui('delete')}
              onClick={() => setConfirmDeleteSelection(true)}
              className="inline-flex items-center justify-center rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10"
              data-testid="attachments-delete-selected">
              <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__281340" />
            </button>
          )}
        </div>
      </SelectionToolbar>
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
      {/* The bulk delete keeps the confirmation step the old delete-all header
          control had — the bar deletes nothing directly. Only the wording moved:
          the message now names the selection and its size instead of claiming to
          remove every attachment of the record. */}
      <ConfirmDeleteDialog
        open={confirmDeleteSelection}
        title={ui('attachmentsRemoveSelectedTitle')}
        message={ui('attachmentsRemoveSelectedMessage', { count: selectionCount })}
        onClose={() => setConfirmDeleteSelection(false)}
        onConfirm={() => {
          removeMany(selectedItems.map((it) => it.id));
          clearSelection();
        }}
        data-testid="ConfirmDeleteDialog__281340" />
    </div>
  );
}

// Read by DetailView (getCustomTabSaveFirstHint) to disable this tab's button on a
// new record: a tab with `saveBeforeAttach` saves the header itself, so it stays usable.
AttachmentsTab.requiresSavedRecord = (props = {}) => !props.config?.saveBeforeAttach;
AttachmentsTab.savedRecordHintKey = 'attachmentsSaveFirstHint';

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, Upload, Trash2, Loader2, Download } from 'lucide-react';
import { useUI } from '@/i18n';
import { usePreviewAttachment, ACCEPTED_TYPES, ACCEPT_ATTR } from './usePreviewAttachment.js';
import PdfViewer from './PdfViewer.jsx';

function getBackdropClass(animState) {
  if (animState === 'opening') return 'opacity-0';
  if (animState === 'closing') return 'opacity-0 transition-opacity duration-[280ms]';
  return 'opacity-100 transition-opacity duration-[280ms]';
}

function getCardClass(animState) {
  if (animState === 'opening') return 'translate-x-full';
  if (animState === 'closing') return 'translate-x-full transition-transform duration-[280ms]';
  if (animState === 'closingUp') return 'opacity-0 translate-x-full transition-all duration-[280ms]';
  return 'translate-x-0 transition-transform duration-[280ms]';
}

function ManagedLeftPanel({ cfg, leftPanel }) {
  const ui = useUI();
  const autoFetch = !!(cfg.autoFetch);
  const attachment = usePreviewAttachment({
    documentId: cfg.documentId ?? null,
    specName: cfg.specName ?? null,
    storeCondition: cfg.storeCondition ?? false,
    token: cfg.token ?? null,
    apiBaseUrl: cfg.apiBaseUrl ?? null,
  });

  useEffect(() => {
    cfg.onFileChange?.(attachment.storedFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.storedFile]);

  const autoStoreAttempted = useRef(false);
  const autoStoreDocKey = `${cfg.documentId}::${cfg.specName}`;
  const prevAutoStoreKey = useRef(null);
  if (prevAutoStoreKey.current !== autoStoreDocKey) {
    prevAutoStoreKey.current = autoStoreDocKey;
    autoStoreAttempted.current = false;
  }

  useEffect(() => {
    if (!cfg.storeCondition) return;
    const hasSource = cfg.sourceBlob || cfg.sourceUrl;
    if (!hasSource) return;
    if (attachment.storedFile || attachment.isBusy) return;
    if (autoStoreAttempted.current) return;
    autoStoreAttempted.current = true;
    const fileName = `${cfg.documentId ?? 'preview'}.pdf`;
    if (cfg.sourceBlob) {
      attachment.storeBlob(cfg.sourceBlob, fileName).catch(() => {});
    } else {
      attachment.storeUrl(cfg.sourceUrl, fileName).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.storeCondition, cfg.sourceBlob, cfg.sourceUrl, cfg.documentId, attachment.storedFile, attachment.isBusy]);

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && ACCEPTED_TYPES[file.type]) attachment.storeFile(file).catch(() => {});
  }, [attachment]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file && ACCEPTED_TYPES[file.type]) attachment.storeFile(file).catch(() => {});
    e.target.value = '';
  }, [attachment]);

  if (attachment.storedFile) {
    const { objectUrl, mimeType, fileName } = attachment.storedFile;
    return (
      <div className="relative flex flex-col h-full min-h-0">
        {!autoFetch && (
          <div className="absolute top-2 left-2 z-10 flex gap-1">
            <a
              href={objectUrl}
              download={fileName}
              className="w-8 h-8 flex items-center justify-center bg-white border border-[#D1D4DB] shadow-sm rounded-lg hover:bg-gray-50 transition-colors"
              title={`${ui('downloadPdf')} — ${fileName}`}
              aria-label={ui('downloadPdf')}
            >
              <Download size={16} className="text-[#828FA3]" data-testid="Download__152ff6" />
            </a>
            <button
              type="button"
              onClick={() => attachment.deleteFile().catch(() => {})}
              className="w-8 h-8 flex items-center justify-center bg-white border border-[#D1D4DB] shadow-sm rounded-lg hover:bg-gray-50 transition-colors"
              title={`${ui('deleteDocument')} — ${fileName}`}
              aria-label={ui('deleteDocument')}
            >
              <Trash2 size={16} className="text-[#828FA3]" data-testid="Trash2__152ff6" />
            </button>
          </div>
        )}
        {mimeType?.startsWith('image/') ? (
          <div className="w-full h-full overflow-auto flex items-center justify-center">
            <img src={objectUrl} alt={fileName} className="max-w-full max-h-full object-contain bg-white shadow-md" />
          </div>
        ) : (
          <PdfViewer url={objectUrl} data-testid="PdfViewer__152ff6" />
        )}
      </div>
    );
  }

  if (autoFetch) return leftPanel;

  if (attachment.isBusy) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__152ff6" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div
        data-testid="preview-drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full h-full max-h-[420px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors ${
          isDragOver ? 'border-gray-400 bg-gray-100' : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100/60'
        }`}
      >
        <div className="w-16 h-20 bg-white rounded-lg border border-gray-200 flex items-center justify-center shadow-sm">
          <Upload size={20} className="text-gray-400" data-testid="Upload__152ff6" />
        </div>
        {isDragOver ? (
          <p className="text-sm font-medium text-gray-700">{ui('dropZoneDropHere')}</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mt-1">{ui('dropZoneUploadPrompt')}</p>
            <button
              className="px-4 py-2 text-sm font-medium text-gray-900 bg-transparent border border-gray-900 rounded-lg hover:bg-gray-900 hover:text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              {ui('dropZoneBrowse')}
            </button>
            <p className="text-xs text-gray-400">{ui('dropZoneAcceptedTypes')}</p>
          </>
        )}
        <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  );
}

/**
 * GenericPreviewModal — domain-agnostic slide-in preview shell.
 *
 * Layout: full-screen backdrop + right-anchored side panel.
 * Two columns: flexible left panel + fixed 380px right panel.
 * Right panel contains: close button, title/subtitle, action buttons slot,
 * tab switcher, and scrollable tab content.
 *
 * Animation lifecycle:
 *   opening → open → closing  → onClose() called → caller unmounts
 *                  → closingUp → onEdit() called  → caller unmounts
 *
 * IMPORTANT: Do NOT unmount this component on the first close signal.
 * Always wait for onClose / onEdit to be called (after the 280ms exit animation).
 * ListView handles this automatically when used via the renderPreview prop.
 *
 * @param {string}   title          - Bold heading in the right panel header.
 * @param {string}   [subtitle]     - Smaller line below the title (e.g. client name).
 * @param {ReactNode} [leftPanel]   - Content for the left column. Used only when
 *                                    attachmentConfig is absent or storeCondition is false.
 * @param {Function} onClose        - Called after the slide-out (closing) animation.
 * @param {Function} [onEdit]       - Called after the slide-up-right (closingUp) animation.
 * @param {ReactNode|Function} [actionButtons]
 *   Static ReactNode — rendered as-is in the header actions row.
 *   Function form — receives { triggerClose, triggerEdit } animation controls.
 *   Use the function form when a button (e.g. Edit) needs to play the exit animation.
 * @param {Array}    [tabs]         - Array of { key, label, content: ReactNode }.
 * @param {string}   [initialTab]   - Key of the tab active on first render.
 * @param {Object}   [attachmentConfig] - Optional file persistence config:
 *   {
 *     documentId: string,       - PK of the source document
 *     specName: string,         - e.g. 'sales-invoice'
 *     storeCondition: boolean,  - false = no-op, caller's leftPanel is used as-is
 *     sourceBlob?: Blob,        - Blob to cache on first open (preferred over sourceUrl)
 *     sourceUrl?: string,       - URL to fetch and cache (fallback when sourceBlob absent)
 *     autoFetch?: boolean,      - true = caller provides leftPanel as fallback while caching
 *     token: string,
 *     apiBaseUrl: string,
 *   }
 *   When storeCondition is true GenericPreviewModal manages the left panel:
 *     - stored file view (PDF iframe or image) when a cached file is available
 *     - caller's leftPanel when autoFetch=true and no cached file yet
 *       (background caching runs via sourceUrl; caller shows the live PDF)
 *     - spinner while checking/storing when autoFetch=false
 *     - drop zone when autoFetch=false and no file is cached
 */
const GenericPreviewModal = forwardRef(function GenericPreviewModal({
  title,
  subtitle,
  leftPanel,
  onClose,
  onEdit,
  actionButtons,
  tabs = [],
  initialTab,
  attachmentConfig,
}, ref) {
  const ui = useUI();
  const [animState, setAnimState] = useState('opening');
  const [activeTab, setActiveTab] = useState(() => initialTab ?? tabs[0]?.key ?? null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimState('open'));
    return () => cancelAnimationFrame(t);
  }, []);

  const triggerClose = useCallback(() => {
    setAnimState('closing');
    setTimeout(onClose, 280);
  }, [onClose]);

  const triggerEdit = useCallback(() => {
    setAnimState('closingUp');
    setTimeout(() => onEdit?.(), 280);
  }, [onEdit]);

  useImperativeHandle(ref, () => ({ triggerEdit }), [triggerEdit]);

  const resolvedActionButtons = typeof actionButtons === 'function'
    ? actionButtons({ triggerClose, triggerEdit })
    : (actionButtons ?? null);

  const activeContent = tabs.find((t) => t.key === activeTab)?.content ?? null;

  const cfg = attachmentConfig ?? {};
  const shouldManagePanel = !!(cfg.storeCondition && cfg.documentId && cfg.specName);
  const resolvedLeftPanel = shouldManagePanel
    ? <ManagedLeftPanel cfg={cfg} leftPanel={leftPanel} data-testid="ManagedLeftPanel__152ff6" />
    : leftPanel;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/30 ${getBackdropClass(animState)}`}
      onClick={triggerClose}
    >
      <div
        data-testid="generic-preview-modal"
        className={`absolute bg-white shadow-2xl overflow-hidden flex flex-col ${getCardClass(animState)}`}
        style={{ top: 8, right: 8, bottom: 8, width: resolvedLeftPanel != null ? 'min(calc(100vw - 308px), 1400px)' : 380, borderRadius: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 min-h-0">

          {/* Left panel — hidden when resolvedLeftPanel is null */}
          {resolvedLeftPanel != null && (
            <div
              className="flex-1 min-w-0 flex flex-col min-h-0 px-7 pt-6 rounded-l-xl"
              style={{ backgroundColor: '#E8EAEF' }}
            >
              {resolvedLeftPanel}
            </div>
          )}

          {/* Right panel */}
          <div className="w-[380px] shrink-0 flex flex-col relative">

            <button
              onClick={triggerClose}
              className="absolute top-3 right-3 z-10 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label={ui('close')}
            >
              <X size={16} data-testid="X__152ff6" />
            </button>

            {/* Header: title + subtitle + action buttons */}
            <div className="px-4 pt-4 pb-3 border-b border-gray-200 shrink-0">
              <div className="pr-8 mb-3">
                <span className="font-bold text-gray-900 text-lg leading-tight block">{title}</span>
                {subtitle && (
                  <span className="text-xs text-gray-500 mt-0.5 block">{subtitle}</span>
                )}
              </div>
              {resolvedActionButtons != null && (
                <div className="flex items-start flex-wrap gap-2">
                  {resolvedActionButtons}
                </div>
              )}
            </div>

            {/* Tab switcher */}
            {tabs.length > 0 && (
              <div className="px-3 pt-3 pb-2 shrink-0">
                <div
                  className="flex items-center gap-1 p-1 rounded-xl"
                  style={{ backgroundColor: '#F5F7F9' }}
                >
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 h-8 px-2 py-1 text-sm font-medium rounded-lg transition-colors text-[#121217] ${
                        activeTab === tab.key ? 'bg-white shadow-sm' : 'hover:bg-white/50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {activeContent}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
});

export default GenericPreviewModal;

export function EmptyPanel({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-20">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinesBottomSection, LinesEmptyState } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import RelatedDocuments from './RelatedDocuments';
import ImportFromReceiptModal from '@/windows/custom/return-to-vendor-shipment/ImportFromReceiptModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

export default function ReturnToVendorShipmentBottomPanel(props) {
  // Import-only lines (ETP-4462): this window sets `window.maxDetailLines: 0`,
  // so DetailView suppresses the whole add-line area — including the
  // detailExtraActions slot that normally hosts the import trigger once the
  // document has lines. Re-render the trigger here (bottomSection is always
  // rendered below the lines area) so importing more lines stays possible on
  // a draft that already has lines. Gated on lines.length > 0 to avoid
  // doubling the empty state's own import button, and on draft + business
  // partner to avoid an empty bordered strip on completed documents
  // (ReturnToVendorLineActions self-gates on the same condition).
  // No refresh callback exists in DetailView's bottomSection contract, so a
  // successful import falls back to a full reload (same pattern as
  // ConfirmWithCreditButtonBase / BulkDocumentAction).
  const hasLines = Array.isArray(props.lines) && props.lines.length > 0;
  const showImportTrigger = hasLines && props.data?.documentStatus === 'DR' && props.data?.businessPartner;
  return (
    <>
      {showImportTrigger && (
        <div
          style={{
            // Mirrors DetailView's suppressed add-line wrapper (default
            // linesLayout) so the trigger keeps the same visual slot.
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            borderTop: '0.5px solid var(--color-border-tertiary, hsl(var(--foreground)))',
            padding: '10px 16px',
          }}
        >
          <ReturnToVendorLineActions
            data={props.data}
            recordId={props.recordId}
            token={props.token}
            apiBaseUrl={props.apiBaseUrl}
            onRefresh={() => window.location.reload()}
          />
        </div>
      )}
      <LinesBottomSection
        {...props}
        relatedDocuments={RelatedDocuments}
        showTotals={false}
      />
    </>
  );
}
ReturnToVendorShipmentBottomPanel.showLineTotals = false;

function ReturnToVendorLinesEmptyState({ data, onAddLine, recordId, token, apiBaseUrl, onRefresh, onSave, forceOpen, onForceOpenHandled, canAddLine = true }) {
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  const apiFetch = useApiFetch(apiBaseUrl);

  useEffect(() => {
    if (!forceOpen) return;
    setShowModal(true);
    onForceOpenHandled?.();
  }, [forceOpen, onForceOpenHandled]);

  const handleImportClick = async () => {
    if (onSave) {
      const ok = await onSave();
      if (!ok) return;
    }
    setShowModal(true);
  };

  const importButton = bpId ? (
    <button
      type="button"
      data-testid="action-import-receipt-empty-state"
      onClick={handleImportClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid hsl(var(--muted-foreground))', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      {ui('importFromReceipt')}
    </button>
  ) : null;

  return (
    <>
      <LinesEmptyState
        data={data}
        onAddLine={onAddLine}
        canAddLine={canAddLine}
        description={canAddLine ? ui('addLinesManuallyOrImportFromReceipt') : ui('linesImportOnlyFromReceipt')}
        secondaryAction={importButton}
      />
      {showModal && (
        <ImportFromReceiptModal
          targetId={recordId}
          bpId={bpId}
          base={base}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); onRefresh?.(); }}
        />
      )}
    </>
  );
}

const ReturnToVendorLineActions = forwardRef(function ReturnToVendorLineActions(
  { data, recordId, token, apiBaseUrl, onRefresh, hideTrigger = false, onSave, forceOpen, onForceOpenHandled },
  ref,
) {
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  const apiFetch = useApiFetch(apiBaseUrl);

  useEffect(() => {
    if (!forceOpen) return;
    setShowModal(true);
    onForceOpenHandled?.();
  }, [forceOpen, onForceOpenHandled]);

  const handleImportClick = async () => {
    if (onSave) {
      const ok = await onSave();
      if (!ok) return;
    }
    setShowModal(true);
  };

  useImperativeHandle(ref, () => ({ openImportModal: handleImportClick }), [onSave]);

  if (!isDraft || !bpId) return null;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={handleImportClick}
          // Same look as the empty state's import button; alignSelf keeps the
          // bordered pill compact inside the flex-column with-lines wrapper.
          style={{ display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start', gap: 5, border: '0.5px solid hsl(var(--muted-foreground))', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {ui('importFromReceipt')}
        </button>
      )}
      {showModal && createPortal(
        <ImportFromReceiptModal
          targetId={recordId}
          bpId={bpId}
          base={base}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </>
  );
});

ReturnToVendorShipmentBottomPanel.linesEmptyState = ReturnToVendorLinesEmptyState;
ReturnToVendorShipmentBottomPanel.detailExtraActions = ReturnToVendorLineActions;

ReturnToVendorShipmentBottomPanel.lineMenuActions = function lineMenuActions({ data, importRef }) {
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  if (!isDraft || !bpId) return [];
  return [
    {
      key: 'import-receipt',
      label: 'importFromReceipt',
      onClick: () => importRef.current?.openImportModal?.(),
    },
  ];
};

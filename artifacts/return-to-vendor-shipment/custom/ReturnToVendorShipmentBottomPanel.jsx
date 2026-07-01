import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinesBottomSection, LinesEmptyState } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import RelatedDocuments from './RelatedDocuments';
import ImportFromReceiptModal from '@/windows/custom/return-to-vendor-shipment/ImportFromReceiptModal';

export default function ReturnToVendorShipmentBottomPanel(props) {
  return (
    <LinesBottomSection
      {...props}
      relatedDocuments={RelatedDocuments}
      showTotals={false}
    />
  );
}
ReturnToVendorShipmentBottomPanel.showLineTotals = false;

function ReturnToVendorLinesEmptyState({ data, onAddLine, recordId, token, apiBaseUrl, onRefresh, onSave, forceOpen, onForceOpenHandled }) {
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

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
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}
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
        description={ui('addLinesManuallyOrImportFromReceipt')}
        secondaryAction={importButton}
      />
      {showModal && (
        <ImportFromReceiptModal
          targetId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
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
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

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
          style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', cursor: 'pointer' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
          headers={headers}
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

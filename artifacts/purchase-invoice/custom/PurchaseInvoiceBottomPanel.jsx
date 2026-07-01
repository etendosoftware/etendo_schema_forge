import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from '@/windows/custom/purchase-invoice/RelatedDocuments.jsx';
import ImportFromGoodsReceiptModal from './ImportFromGoodsReceiptModal';
import ImportFromPurchaseOrderModal from './ImportFromPurchaseOrderModal';
import { getApSubtype } from './purchaseInvoiceSubtype';

/* eslint-disable react/prop-types */

/**
 * Purchase Invoice bottom section. Delegates to the shared LinesBottomSection
 * so the Docs/Notes/Totals layout stays identical to the rest of the
 * inline-editable family; injects the purchase-invoice-specific RelatedDocuments
 * and the SIF (fiscal) data tabs as the `notesExtra` slot beneath the notes block.
 */
export default function PurchaseInvoiceBottomPanel(props) {
  return (
    <LinesBottomSection
      {...props}
      relatedDocuments={RelatedDocuments}
    />
  );
}

function PurchaseInvoiceLinesEmptyState({ data, onAddLine, canAddLine = true, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, onRefresh }) {
  const ui = useUI();
  const [showImportReceiptModal, setShowImportReceiptModal] = useState(false);
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const pendingModal = useRef('receipt');
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const isNc = getApSubtype(data) === 'NC';
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (forceOpen) {
      if (pendingModal.current === 'order') { setShowImportOrderModal(true); }
      else { setShowImportReceiptModal(true); }
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const handleImportReceiptClick = async () => {
    pendingModal.current = 'receipt';
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowImportReceiptModal(true);
  };

  const handleImportOrderClick = async () => {
    pendingModal.current = 'order';
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowImportOrderModal(true);
  };

  if (!isDraft) return null;

  const importIconSvg = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' };

  const emptyHintKey = isNc ? 'addLinesManually' : 'addLinesManuallyOrImportFromOrderOrReceipt';

  return (
    <div style={{ margin: '24px 16px', padding: '32px 24px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>{ui('noLinesYet')}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>{ui(emptyHintKey)}</span>
      {canAddLine && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onAddLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: '#18181b', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + {ui('addLines')}
          </button>
          {bpId && !isNc && (
            <>
              <button type="button" onClick={handleImportReceiptClick} style={ghostBtn}>
                {importIconSvg}
                {ui('importFromGoodsReceipt')}
              </button>
              <button type="button" onClick={handleImportOrderClick} style={ghostBtn}>
                {importIconSvg}
                {ui('importFromPurchaseOrder')}
              </button>
            </>
          )}
        </div>
      )}
      {showImportReceiptModal && createPortal(
        <ImportFromGoodsReceiptModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportReceiptModal(false)}
          onSuccess={() => { setShowImportReceiptModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportOrderModal && createPortal(
        <ImportFromPurchaseOrderModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportOrderModal(false)}
          onSuccess={() => { setShowImportOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </div>
  );
}

const PurchaseInvoiceLineActions = forwardRef(function PurchaseInvoiceLineActions(
  { data, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, hideTrigger = false, onRefresh },
  ref,
) {
  const ui = useUI();
  const [showImportReceiptModal, setShowImportReceiptModal] = useState(false);
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const pendingModal = useRef('receipt');
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const isNc = getApSubtype(data) === 'NC';
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (forceOpen) {
      if (pendingModal.current === 'order') { setShowImportOrderModal(true); }
      else { setShowImportReceiptModal(true); }
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const openReceiptModal = async () => {
    pendingModal.current = 'receipt';
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowImportReceiptModal(true);
  };

  const openOrderModal = async () => {
    pendingModal.current = 'order';
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowImportOrderModal(true);
  };

  useImperativeHandle(ref, () => ({
    openImportReceiptModal: openReceiptModal,
    openImportOrderModal: openOrderModal,
  }), [onSave]);

  if (!isDraft || !bpId || isNc) return null;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={openReceiptModal}
          style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', cursor: 'pointer' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {ui('importFromGoodsReceipt')}
        </button>
      )}
      {showImportReceiptModal && createPortal(
        <ImportFromGoodsReceiptModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportReceiptModal(false)}
          onSuccess={() => { setShowImportReceiptModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportOrderModal && createPortal(
        <ImportFromPurchaseOrderModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportOrderModal(false)}
          onSuccess={() => { setShowImportOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </>
  );
});

PurchaseInvoiceBottomPanel.linesEmptyState = PurchaseInvoiceLinesEmptyState;
PurchaseInvoiceBottomPanel.detailExtraActions = PurchaseInvoiceLineActions;

PurchaseInvoiceBottomPanel.lineMenuActions = function lineMenuActions({ data, importRef }) {
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const isNc = getApSubtype(data) === 'NC';
  if (!isDraft || !bpId || isNc) return [];
  return [
    {
      key: 'import-receipt',
      label: 'importFromGoodsReceipt',
      onClick: () => importRef.current?.openImportReceiptModal?.(),
    },
    {
      key: 'import-order',
      label: 'importFromPurchaseOrder',
      onClick: () => importRef.current?.openImportOrderModal?.(),
    },
  ];
};

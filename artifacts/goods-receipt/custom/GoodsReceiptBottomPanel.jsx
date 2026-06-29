import { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from '@/windows/custom/goods-receipt/RelatedDocuments';
import ImportFromPurchaseOrderModal from './ImportFromPurchaseOrderModal';
import ImportFromPurchaseInvoiceModal from './ImportFromPurchaseInvoiceModal';

export default function GoodsReceiptBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} showTotals={false} />;
}
GoodsReceiptBottomPanel.showLineTotals = false;

function GoodsReceiptLinesEmptyState({ data, onAddLine, canAddLine = true, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, onRefresh }) {
  const ui = useUI();
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const [showImportInvoiceModal, setShowImportInvoiceModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  // Auto-open the correct modal when forceOpen is set (after save+navigate for new records).
  useEffect(() => {
    if (!forceOpen) return;
    if (forceOpen === 'invoice') setShowImportInvoiceModal(true);
    else setShowImportOrderModal(true);
    onForceOpenHandled?.();
  }, [forceOpen]);

  const handleImportClick = async (openFn, modalType) => {
    if (onSave) {
      const ok = await onSave(modalType);
      if (!ok) return;
    }
    openFn(true);
  };

  if (!isDraft) return null;

  return (
    <div style={{ margin: '24px 16px', padding: '32px 24px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>{ui('noLinesYet')}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>{ui('addLinesManuallyOrImportFromPurchaseOrderOrInvoice')}</span>
      {canAddLine && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onAddLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: '#18181b', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + {ui('addLines')}
          </button>
          {bpId && (
            <button type="button" onClick={() => handleImportClick(setShowImportOrderModal, 'order')} onMouseDown={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {ui('importFromPurchaseOrder')}
            </button>
          )}
          {bpId && (
            <button type="button" onClick={() => handleImportClick(setShowImportInvoiceModal, 'invoice')} onMouseDown={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {ui('importFromPurchaseInvoice')}
            </button>
          )}
        </div>
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
      {showImportInvoiceModal && createPortal(
        <ImportFromPurchaseInvoiceModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportInvoiceModal(false)}
          onSuccess={() => { setShowImportInvoiceModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </div>
  );
}

const GoodsReceiptLineActions = forwardRef(function GoodsReceiptLineActions(
  { data, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, hideTrigger = false, onRefresh },
  ref,
) {
  const ui = useUI();
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const [showImportInvoiceModal, setShowImportInvoiceModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  // Auto-open the correct modal when forceOpen is set (after save+navigate for new records).
  useEffect(() => {
    if (!forceOpen) return;
    if (forceOpen === 'invoice') setShowImportInvoiceModal(true);
    else setShowImportOrderModal(true);
    onForceOpenHandled?.();
  }, [forceOpen]);

  const openOrderModal = async () => {
    if (onSave) {
      const ok = await onSave('order');
      if (!ok) return;
    }
    setShowImportOrderModal(true);
  };

  const openInvoiceModal = async () => {
    if (onSave) {
      const ok = await onSave('invoice');
      if (!ok) return;
    }
    setShowImportInvoiceModal(true);
  };

  useImperativeHandle(ref, () => ({
    openImportOrderModal: openOrderModal,
    openImportInvoiceModal: openInvoiceModal,
  }), [onSave]);

  if (!isDraft || !bpId) return null;

  return (
    <>
      {!hideTrigger && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={openOrderModal}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {ui('importFromPurchaseOrder')}
          </button>
          <button
            type="button"
            onClick={openInvoiceModal}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {ui('importFromPurchaseInvoice')}
          </button>
        </div>
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
      {showImportInvoiceModal && createPortal(
        <ImportFromPurchaseInvoiceModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportInvoiceModal(false)}
          onSuccess={() => { setShowImportInvoiceModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </>
  );
});

GoodsReceiptBottomPanel.linesEmptyState = GoodsReceiptLinesEmptyState;
GoodsReceiptBottomPanel.detailExtraActions = GoodsReceiptLineActions;

GoodsReceiptBottomPanel.lineMenuActions = function lineMenuActions({ data, importRef }) {
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  if (!isDraft || !bpId) return [];
  return [
    {
      key: 'import-order',
      label: 'importFromPurchaseOrder',
      onClick: () => importRef.current?.openImportOrderModal?.(),
    },
    {
      key: 'import-invoice',
      label: 'importFromPurchaseInvoice',
      onClick: () => importRef.current?.openImportInvoiceModal?.(),
    },
  ];
};

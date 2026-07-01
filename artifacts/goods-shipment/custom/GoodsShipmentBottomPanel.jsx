import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';
import ImportFromSalesOrderModal from './ImportFromSalesOrderModal';
import ImportFromSalesInvoiceModal from './ImportFromSalesInvoiceModal';

function ShipmentLinesEmptyState({ data, recordId, apiBaseUrl, token, onAddLine, canAddLine, onSave, onRefresh, forceOpen, onForceOpenHandled }) {
  const ui = useUI();
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  useEffect(() => {
    if (!forceOpen) return;
    setShowOrderModal(true);
    onForceOpenHandled?.();
  }, [forceOpen, onForceOpenHandled]);

  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  const handleImportOrderClick = async () => {
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowOrderModal(true);
  };

  const handleImportInvoiceClick = async () => {
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowInvoiceModal(true);
  };

  return (
    <div style={{ margin: '24px 16px', padding: '32px 24px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
          <rect x="9" y="11" width="14" height="10" rx="2" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>{ui('noLinesYet')}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>{ui('addLinesManuallyOrImportFromOrderOrInvoice')}</span>
      {isDraft && canAddLine && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onAddLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: '#18181b', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + {ui('addLines')}
          </button>
          {bpId && (
            <button type="button" onClick={handleImportOrderClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {ui('importFromSalesOrder')}
            </button>
          )}
          {bpId && (
            <button type="button" onClick={handleImportInvoiceClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="13" y2="17" />
              </svg>
              {ui('importFromSalesInvoice')}
            </button>
          )}
        </div>
      )}
      {showOrderModal && createPortal(
        <ImportFromSalesOrderModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowOrderModal(false)}
          onSuccess={() => { setShowOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showInvoiceModal && createPortal(
        <ImportFromSalesInvoiceModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowInvoiceModal(false)}
          onSuccess={() => { setShowInvoiceModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </div>
  );
}

const ShipmentLineActions = forwardRef(function ShipmentLineActions(
  { data, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, hideTrigger = false, onRefresh },
  ref,
) {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const pendingModal = useMemo(() => ({ current: 'order' }), []);

  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  );

  useEffect(() => {
    if (!forceOpen) return;
    if (pendingModal.current === 'invoice') setShowInvoiceModal(true);
    else setShowOrderModal(true);
    onForceOpenHandled?.();
  }, [forceOpen, onForceOpenHandled]);

  const openOrderModal = async () => {
    pendingModal.current = 'order';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowOrderModal(true);
  };

  const openInvoiceModal = async () => {
    pendingModal.current = 'invoice';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowInvoiceModal(true);
  };

  useImperativeHandle(ref, () => ({ openOrderModal, openInvoiceModal }), [onSave]);

  if (!isDraft || !bpId) return null;

  return (
    <>
      {showOrderModal && createPortal(
        <ImportFromSalesOrderModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowOrderModal(false)}
          onSuccess={() => { setShowOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showInvoiceModal && createPortal(
        <ImportFromSalesInvoiceModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowInvoiceModal(false)}
          onSuccess={() => { setShowInvoiceModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </>
  );
});

export default function GoodsShipmentBottomPanel(props) {
  return <LinesBottomSection {...props} relatedDocuments={RelatedDocuments} showTotals={false} />;
}

GoodsShipmentBottomPanel.showLineTotals = false;
GoodsShipmentBottomPanel.linesEmptyState = ShipmentLinesEmptyState;
GoodsShipmentBottomPanel.detailExtraActions = ShipmentLineActions;
GoodsShipmentBottomPanel.lineMenuActions = function lineMenuActions({ data, importRef }) {
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  if (!isDraft || !bpId) return [];
  return [
    { key: 'import-order', label: 'importFromSalesOrder', onClick: () => importRef.current?.openOrderModal?.() },
    { key: 'import-invoice', label: 'importFromSalesInvoice', onClick: () => importRef.current?.openInvoiceModal?.() },
  ];
};

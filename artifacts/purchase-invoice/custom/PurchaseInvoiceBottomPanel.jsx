import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from '@/windows/custom/purchase-invoice/RelatedDocuments.jsx';
import ImportFromGoodsReceiptModal from './ImportFromGoodsReceiptModal';
import ImportFromPurchaseOrderModal from './ImportFromPurchaseOrderModal';
import ImportFromGoodsReturnModal from './ImportFromGoodsReturnModal';
import ImportFromSourceInvoiceModal from './ImportFromSourceInvoiceModal';
import { getApSubtype } from './purchaseInvoiceSubtype';
import { useApiFetch } from '@/auth/useApiFetch.js';

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

const FORCE_OPEN_TYPES = ['order', 'receipt', 'return', 'source'];

function PurchaseInvoiceLinesEmptyState({ data, onAddLine, canAddLine = true, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, onRefresh }) {
  const ui = useUI();
  const [showImportReceiptModal, setShowImportReceiptModal] = useState(false);
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const [showImportReturnModal, setShowImportReturnModal] = useState(false);
  const [showImportSourceModal, setShowImportSourceModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const isRectificativa = getApSubtype(data) === 'RECTIFICATIVA';
  const pendingModal = useRef(isRectificativa ? 'return' : 'receipt');
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

  useEffect(() => {
    if (forceOpen) {
      // forceOpen carries the modal type across the save-navigate remount of a
      // NEW record (pendingModal is reset on remount, so it can't be trusted then).
      const type = FORCE_OPEN_TYPES.includes(forceOpen) ? forceOpen : pendingModal.current;
      if (type === 'order') { setShowImportOrderModal(true); }
      else if (type === 'return') { setShowImportReturnModal(true); }
      else if (type === 'source') { setShowImportSourceModal(true); }
      else { setShowImportReceiptModal(true); }
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const handleImportClick = (type, setter) => async () => {
    pendingModal.current = type;
    if (onSave) {
      const shouldOpen = await onSave(type);
      if (!shouldOpen) return;
    }
    setter(true);
  };

  const handleImportReceiptClick = handleImportClick('receipt', setShowImportReceiptModal);
  const handleImportOrderClick = handleImportClick('order', setShowImportOrderModal);
  const handleImportReturnClick = handleImportClick('return', setShowImportReturnModal);
  const handleImportSourceClick = handleImportClick('source', setShowImportSourceModal);

  if (!isDraft) return null;

  const importIconSvg = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid hsl(var(--muted-foreground))', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' };

  const emptyHintKey = isRectificativa
    ? 'addLinesManuallyOrImportFromGoodsReturnOrSourceInvoice'
    : 'addLinesManuallyOrImportFromOrderOrReceipt';

  return (
    <div style={{ margin: '24px 16px', padding: '32px 24px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--border-radius-md)', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
          <button type="button" onClick={onAddLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: 'hsl(var(--foreground))', color: 'hsl(var(--card))', border: 'none', cursor: 'pointer' }}>
            + {ui('addLines')}
          </button>
          {bpId && !isRectificativa && (
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
          {bpId && isRectificativa && (
            <>
              <button type="button" onClick={handleImportReturnClick} style={ghostBtn}>
                {importIconSvg}
                {ui('importFromGoodsReturn')}
              </button>
              <button type="button" onClick={handleImportSourceClick} style={ghostBtn}>
                {importIconSvg}
                {ui('importFromSourceInvoice')}
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
          onClose={() => setShowImportOrderModal(false)}
          onSuccess={() => { setShowImportOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportReturnModal && createPortal(
        <ImportFromGoodsReturnModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          onClose={() => setShowImportReturnModal(false)}
          onSuccess={() => { setShowImportReturnModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportSourceModal && createPortal(
        <ImportFromSourceInvoiceModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          onClose={() => setShowImportSourceModal(false)}
          onSuccess={() => { setShowImportSourceModal(false); onRefresh?.(); }}
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
  const [showImportReturnModal, setShowImportReturnModal] = useState(false);
  const [showImportSourceModal, setShowImportSourceModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const isRectificativa = getApSubtype(data) === 'RECTIFICATIVA';
  const pendingModal = useRef(isRectificativa ? 'return' : 'receipt');
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  const apiFetch = useApiFetch('');

  useEffect(() => {
    if (forceOpen) {
      // forceOpen carries the modal type across the save-navigate remount of a
      // NEW record (pendingModal is reset on remount, so it can't be trusted then).
      const type = FORCE_OPEN_TYPES.includes(forceOpen) ? forceOpen : pendingModal.current;
      if (type === 'order') { setShowImportOrderModal(true); }
      else if (type === 'return') { setShowImportReturnModal(true); }
      else if (type === 'source') { setShowImportSourceModal(true); }
      else { setShowImportReceiptModal(true); }
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const openModal = (type, setter) => async () => {
    pendingModal.current = type;
    if (onSave) {
      const shouldOpen = await onSave(type);
      if (!shouldOpen) return;
    }
    setter(true);
  };

  const openReceiptModal = openModal('receipt', setShowImportReceiptModal);
  const openOrderModal = openModal('order', setShowImportOrderModal);
  const openReturnModal = openModal('return', setShowImportReturnModal);
  const openSourceModal = openModal('source', setShowImportSourceModal);

  useImperativeHandle(ref, () => ({
    openImportReceiptModal: openReceiptModal,
    openImportOrderModal: openOrderModal,
    openImportReturnModal: openReturnModal,
    openImportSourceModal: openSourceModal,
  }), [onSave]);

  if (!isDraft || !bpId) return null;

  const primaryTrigger = isRectificativa
    ? { onClick: openReturnModal, labelKey: 'importFromGoodsReturn' }
    : { onClick: openReceiptModal, labelKey: 'importFromGoodsReceipt' };

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={primaryTrigger.onClick}
          style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, hsl(var(--muted-foreground)))', cursor: 'pointer' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {ui(primaryTrigger.labelKey)}
        </button>
      )}
      {showImportReceiptModal && createPortal(
        <ImportFromGoodsReceiptModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
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
          onClose={() => setShowImportOrderModal(false)}
          onSuccess={() => { setShowImportOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportReturnModal && createPortal(
        <ImportFromGoodsReturnModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          onClose={() => setShowImportReturnModal(false)}
          onSuccess={() => { setShowImportReturnModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportSourceModal && createPortal(
        <ImportFromSourceInvoiceModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          onClose={() => setShowImportSourceModal(false)}
          onSuccess={() => { setShowImportSourceModal(false); onRefresh?.(); }}
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
  const isRectificativa = getApSubtype(data) === 'RECTIFICATIVA';
  if (!isDraft || !bpId) return [];
  if (isRectificativa) {
    return [
      {
        key: 'import-return',
        label: 'importFromGoodsReturn',
        onClick: () => importRef.current?.openImportReturnModal?.(),
      },
      {
        key: 'import-source',
        label: 'importFromSourceInvoice',
        onClick: () => importRef.current?.openImportSourceModal?.(),
      },
    ];
  }
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

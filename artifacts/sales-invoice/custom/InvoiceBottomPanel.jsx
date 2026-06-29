import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from '@/i18n';
import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';
import ImportFromShipmentModal from './ImportFromShipmentModal';
import ImportFromOrderModal from './ImportFromOrderModal';
import ImportFromReturnShipmentModal from './ImportFromReturnShipmentModal';
import { getArSubtype } from './invoiceSubtype';

/**
 * Sales Invoice bottom section. Delegates to the shared LinesBottomSection so
 * the Docs/Notes/Totals layout stays identical to the rest of the
 * inline-editable family. The SIF fiscal data is now rendered in its own
 * primary tab (via extraTabs in decisions.json), not here.
 */
export default function InvoiceBottomPanel(props) {
  return (
    <LinesBottomSection
      {...props}
      relatedDocuments={RelatedDocuments}
    />
  );
}

function InvoiceLinesEmptyState({ data, onAddLine, canAddLine = true, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, onRefresh }) {
  const ui = useUI();
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const [showImportReturnModal, setShowImportReturnModal] = useState(false);
  const pendingModal = useRef('shipment');
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const arSubtype = getArSubtype(data);
  const isReturn = arSubtype === 'DEV';
  const isNc = arSubtype === 'NC';
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (forceOpen) {
      if (pendingModal.current === 'order') { setShowImportOrderModal(true); }
      else if (pendingModal.current === 'return') { setShowImportReturnModal(true); }
      else { setShowImportModal(true); }
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const handleImportClick = async () => {
    pendingModal.current = 'shipment';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowImportModal(true);
  };

  const handleImportOrderClick = async () => {
    pendingModal.current = 'order';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowImportOrderModal(true);
  };

  const handleImportReturnClick = async () => {
    pendingModal.current = 'return';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowImportReturnModal(true);
  };

  const emptyHintKey = isReturn
    ? 'addLinesManuallyOrImportFromReturn'
    : isNc
    ? 'addLinesManually'
    : 'addLinesManuallyOrImportFromShipmentOrOrder';

  const importSvg = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' };

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
      {isDraft && canAddLine && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onAddLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: '#18181b', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + {ui('addLines')}
          </button>
          {bpId && isReturn && (
            <button type="button" onClick={handleImportReturnClick} style={ghostBtn}>
              {importSvg}
              {ui('importFromReturnShipment')}
            </button>
          )}
          {bpId && !isReturn && !isNc && (
            <>
              <button type="button" onClick={handleImportClick} style={ghostBtn}>
                {importSvg}
                {ui('importFromShipment')}
              </button>
              <button type="button" onClick={handleImportOrderClick} style={ghostBtn}>
                {importSvg}
                {ui('importFromSalesOrder')}
              </button>
            </>
          )}
        </div>
      )}
      {showImportModal && createPortal(
        <ImportFromShipmentModal
          invoiceId={recordId} bpId={bpId} base={base} headers={headers}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportOrderModal && createPortal(
        <ImportFromOrderModal
          invoiceId={recordId} bpId={bpId} base={base} headers={headers}
          onClose={() => setShowImportOrderModal(false)}
          onSuccess={() => { setShowImportOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportReturnModal && createPortal(
        <ImportFromReturnShipmentModal
          invoiceId={recordId} bpId={bpId} base={base} headers={headers}
          onClose={() => setShowImportReturnModal(false)}
          onSuccess={() => { setShowImportReturnModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </div>
  );
}

// forwardRef so DetailView can imperatively trigger the import modal from a menu
// item in the "+ Añadir línea" dropdown — see InvoiceBottomPanel.lineMenuActions
// below. `hideTrigger` lets DetailView mount this only for the modal portal
// (the visible link is suppressed when the menu item is in use).
const InvoiceLineActions = forwardRef(function InvoiceLineActions(
  { data, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, hideTrigger = false, onRefresh },
  ref,
) {
  const ui = useUI();
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const [showImportReturnModal, setShowImportReturnModal] = useState(false);
  const pendingModal = useRef('shipment');
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const arSubtype = getArSubtype(data);
  const isReturn = arSubtype === 'DEV';
  const isNc = arSubtype === 'NC';
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (forceOpen) {
      if (pendingModal.current === 'order') { setShowImportOrderModal(true); }
      else if (pendingModal.current === 'return') { setShowImportReturnModal(true); }
      else { setShowImportModal(true); }
      onForceOpenHandled?.();
    }
  }, [forceOpen, onForceOpenHandled]);

  const openModal = async () => {
    pendingModal.current = 'shipment';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowImportModal(true);
  };

  const openOrderModal = async () => {
    pendingModal.current = 'order';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowImportOrderModal(true);
  };

  const openReturnModal = async () => {
    pendingModal.current = 'return';
    if (onSave) { const ok = await onSave(); if (!ok) return; }
    setShowImportReturnModal(true);
  };

  useImperativeHandle(ref, () => ({
    openImportModal: openModal,
    openImportOrderModal: openOrderModal,
    openImportReturnModal: openReturnModal,
  }), [onSave]);

  if (!isDraft || !bpId || isNc) {
    return null;
  }

  return (
    <>
      {!hideTrigger && !isReturn && (
        <button
          type="button"
          onClick={openModal}
          style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', cursor: 'pointer' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {ui('importFromShipment')}
        </button>
      )}
      {!hideTrigger && isReturn && (
        <button
          type="button"
          onClick={openReturnModal}
          style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', cursor: 'pointer' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {ui('importFromReturnShipment')}
        </button>
      )}
      {showImportModal && createPortal(
        <ImportFromShipmentModal
          invoiceId={recordId} bpId={bpId} base={base} headers={headers}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportOrderModal && createPortal(
        <ImportFromOrderModal
          invoiceId={recordId} bpId={bpId} base={base} headers={headers}
          onClose={() => setShowImportOrderModal(false)}
          onSuccess={() => { setShowImportOrderModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
      {showImportReturnModal && createPortal(
        <ImportFromReturnShipmentModal
          invoiceId={recordId} bpId={bpId} base={base} headers={headers}
          onClose={() => setShowImportReturnModal(false)}
          onSuccess={() => { setShowImportReturnModal(false); onRefresh?.(); }}
        />,
        document.body,
      )}
    </>
  );
});

InvoiceBottomPanel.linesEmptyState = InvoiceLinesEmptyState;
InvoiceBottomPanel.detailExtraActions = InvoiceLineActions;

/**
 * Returns the menu items for the "+ Añadir línea" dropdown chevron. Plain
 * function (NOT a hook) — called every render of DetailView at the top level,
 * so React's hook-order tracking isn't involved. The `importRef` points at the
 * `InvoiceLineActions` instance mounted by DetailView with `hideTrigger`, which
 * exposes the open* methods via `useImperativeHandle`.
 */
InvoiceBottomPanel.lineMenuActions = function lineMenuActions({ data, importRef }) {
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const arSubtype = getArSubtype(data);
  const isReturn = arSubtype === 'DEV';
  const isNc = arSubtype === 'NC';
  if (!isDraft || !bpId || isNc) return [];
  if (isReturn) {
    return [
      {
        key: 'import-return',
        label: 'importFromReturnShipment',
        onClick: () => importRef.current?.openImportReturnModal?.(),
      },
    ];
  }
  return [
    {
      key: 'import-shipment',
      label: 'importFromShipment',
      onClick: () => importRef.current?.openImportModal?.(),
    },
    {
      key: 'import-order',
      label: 'importFromSalesOrder',
      onClick: () => importRef.current?.openImportOrderModal?.(),
    },
  ];
};

import { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { LinesBottomSection } from '@/components/contract-ui';
import RelatedDocuments from './RelatedDocuments';
import SifDataTabs from './SifDataTabs';
import ImportFromShipmentModal from './ImportFromShipmentModal';

/**
 * Sales Invoice bottom section. Delegates to the shared LinesBottomSection so
 * the Docs/Notes/Totals layout stays identical to the rest of the
 * inline-editable family; injects the invoice-specific RelatedDocuments and
 * the SIF (fiscal) data tabs as the `notesExtra` slot beneath the notes
 * block — preserving the bespoke fiscal UI without diverging from the
 * shared layout.
 */
export default function InvoiceBottomPanel(props) {
  return (
    <LinesBottomSection
      {...props}
      relatedDocuments={RelatedDocuments}
      notesExtra={SifDataTabs}
    />
  );
}

function InvoiceLinesEmptyState({ data, onAddLine, canAddLine = true, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled }) {
  const ui = useUI();
  const [showImportModal, setShowImportModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (forceOpen) { setShowImportModal(true); onForceOpenHandled?.(); }
  }, [forceOpen, onForceOpenHandled]);

  const handleImportClick = async () => {
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowImportModal(true);
  };

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
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>{ui('addLinesManuallyOrImportFromShipment')}</span>
      {isDraft && canAddLine && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onAddLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: '#18181b', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + {ui('addLines')}
          </button>
          {bpId && (
            <button type="button" onClick={handleImportClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {ui('importFromShipment')}
            </button>
          )}
        </div>
      )}
      {showImportModal && createPortal(
        <ImportFromShipmentModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); toast.success(ui('linesImportedFromShipment')); window.location.reload(); }}
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
  { data, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, hideTrigger = false },
  ref,
) {
  const ui = useUI();
  const [showImportModal, setShowImportModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => {
    if (forceOpen) { setShowImportModal(true); onForceOpenHandled?.(); }
  }, [forceOpen, onForceOpenHandled]);

  const openModal = async () => {
    if (onSave) {
      const shouldOpen = await onSave();
      if (!shouldOpen) return;
    }
    setShowImportModal(true);
  };

  useImperativeHandle(ref, () => ({ openImportModal: openModal }), [onSave]);

  if (!isDraft || !bpId) {
    // Still keep the modal portal mounted in case forceOpen fires; trigger
    // (link) only renders in the legacy mode.
    return null;
  }

  return (
    <>
      {!hideTrigger && (
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
      {showImportModal && createPortal(
        <ImportFromShipmentModal
          invoiceId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); toast.success(ui('linesImportedFromShipment')); window.location.reload(); }}
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
 * exposes `openImportModal` via `useImperativeHandle`.
 */
InvoiceBottomPanel.lineMenuActions = function lineMenuActions({ data, importRef }) {
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  if (!isDraft || !bpId) return [];
  return [
    {
      key: 'import-shipment',
      label: 'importFromShipment',
      onClick: () => importRef.current?.openImportModal?.(),
    },
  ];
};

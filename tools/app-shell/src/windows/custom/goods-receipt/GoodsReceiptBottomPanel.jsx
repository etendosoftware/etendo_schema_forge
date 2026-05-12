import { useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { LinesBottomSection } from '@/components/contract-ui';
import ImportFromPurchaseOrderModal from './ImportFromPurchaseOrderModal.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';
import { useUI } from '@/i18n';

/**
 * Goods Receipt bottom section. Delegates to the shared LinesBottomSection
 * for the Docs/Notes layout (no totals — shipment-style document) and exposes
 * "Importar desde pedido de compra" as a dropdown menu item under the
 * "+ Añadir línea" button instead of as a separate link beneath it.
 */
export default function GoodsReceiptBottomPanel(props) {
  return (
    <LinesBottomSection
      {...props}
      relatedDocuments={RelatedDocuments}
      showTotals={false}
    />
  );
}
GoodsReceiptBottomPanel.showLineTotals = false;

function ReceiptLinesEmptyState({ data, onAddLine, recordId, token, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const [showImportModal, setShowImportModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

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
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>{ui('addLinesManuallyOrImportFromPurchaseOrder')}</span>

      {isDraft && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onAddLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, background: '#18181b', color: '#fff', border: 'none', cursor: 'pointer' }}>
            + {ui('addLines')}
          </button>
          {bpId && (
            <button type="button" onClick={() => setShowImportModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid #888', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {ui('importFromPurchaseOrder')}
            </button>
          )}
        </div>
      )}

      {showImportModal && createPortal(
        <ImportFromPurchaseOrderModal
          receiptId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            onRefresh?.();
          }}
        />,
        document.body,
      )}
    </div>
  );
}

// forwardRef so DetailView can imperatively trigger the import modal from a
// dropdown menu item under the "+ Añadir línea" button — see lineMenuActions
// below. `hideTrigger` suppresses the visible inline link (we use the menu
// item instead) but the modal portal stays mounted.
const ReceiptLineActions = forwardRef(function ReceiptLineActions(
  { data, recordId, token, apiBaseUrl, onRefresh, hideTrigger = false },
  ref,
) {
  const ui = useUI();
  const [showImportModal, setShowImportModal] = useState(false);
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  useImperativeHandle(ref, () => ({ openImportModal: () => setShowImportModal(true) }), []);

  if (!isDraft || !bpId) return null;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', cursor: 'pointer' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {ui('importFromPurchaseOrder')}
        </button>
      )}

      {showImportModal && createPortal(
        <ImportFromPurchaseOrderModal
          receiptId={recordId}
          bpId={bpId}
          base={base}
          headers={headers}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            onRefresh?.();
          }}
        />,
        document.body,
      )}
    </>
  );
});

GoodsReceiptBottomPanel.linesEmptyState = ReceiptLinesEmptyState;
GoodsReceiptBottomPanel.detailExtraActions = ReceiptLineActions;

/**
 * Builds the menu items for the "+ Añadir línea" chevron dropdown. Plain
 * function (NOT a hook) so DetailView's hook order stays consistent. The
 * `importRef` points at ReceiptLineActions mounted with `hideTrigger`, which
 * exposes `openImportModal` via useImperativeHandle.
 */
GoodsReceiptBottomPanel.lineMenuActions = function lineMenuActions({ data, importRef }) {
  const isDraft = data?.documentStatus === 'DR';
  const bpId = data?.businessPartner;
  if (!isDraft || !bpId) return [];
  return [
    {
      key: 'import-purchase-order',
      label: 'importFromPurchaseOrder',
      onClick: () => importRef.current?.openImportModal?.(),
    },
  ];
};

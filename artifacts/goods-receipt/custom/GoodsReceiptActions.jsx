import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import ConfirmGoodsReceiptModal from './ConfirmGoodsReceiptModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { useMainAttachment } from '@/windows/custom/shared/useMainAttachment.js';
import PurchaseReturnWizard from './PurchaseReturnWizard';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import CopyRecordLinkButton from '@/components/contract-ui/CopyRecordLinkButton';


// ── Main component ────────────────────────────────────────────────────────────

export default function GoodsReceiptActions({ data, recordId, token, apiBaseUrl, onRefresh }) {
  const ui = useUI();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [returnLines, setReturnLines] = useState([]);
  const [returnedDoc, setReturnedDoc] = useState(null);
  const [isCloneHovered, setIsCloneHovered] = useState(false);
  const [confirmedDocs, setConfirmedDocs] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const resultNavigatedRef = useRef(false);

  const isCompleted = data?.documentStatus === 'CO';
  const isFullyInvoiced = (parseFloat(data?.invoiceStatus ?? 0)) >= 100;
  const isFullyReturned = (parseFloat(data?.returnStatus ?? 0)) >= 100;

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const downloadLinkRef = useRef(null);

  const previewAttachment = useMainAttachment({
    documentId: recordId,
    tableName: 'M_InOut',
    storeCondition: isCompleted,
    token,
    apiBaseUrl,
  });
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // ETP-5265 — when the receipt is already fully invoiced, Confirm skips the
  // intermediate "already invoiced" popup entirely and calls the document-action
  // endpoint directly, like any other direct action in the app: a loading toast
  // while in flight, then the same success path the popup used to trigger
  // (setConfirmedDocs({ invoice: null }) — picked up by the toast effect below),
  // or a toast.error on failure. The non-fully-invoiced flow (ConfirmGoodsReceiptModal)
  // is untouched.
  const confirmDocAction = useDocumentAction({ apiBaseUrl, entity: 'goodsReceipt', token });
  const confirmingFullyInvoicedRef = useRef(false);
  const handleConfirmFullyInvoiced = useCallback(async () => {
    if (confirmingFullyInvoicedRef.current) return;
    confirmingFullyInvoicedRef.current = true;
    const toastId = toast.loading(ui('processing'));
    try {
      await confirmDocAction.execute(recordId, 'CO');
      toast.dismiss(toastId);
      setConfirmedDocs({ invoice: null });
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err.message || ui('networkError'));
    } finally {
      confirmingFullyInvoicedRef.current = false;
    }
  }, [confirmDocAction.execute, recordId, ui]);

  useEffect(() => {
    const handler = () => {
      if (isFullyInvoiced) {
        handleConfirmFullyInvoiced();
      } else {
        setShowConfirm(true);
      }
    };
    window.addEventListener('goods-receipt:open-confirm-modal', handler);
    return () => window.removeEventListener('goods-receipt:open-confirm-modal', handler);
  }, [isFullyInvoiced, handleConfirmFullyInvoiced]);

  useEffect(() => {
    const handler = () => downloadLinkRef.current?.click();
    window.addEventListener('goods-receipt:download-pdf', handler);
    return () => window.removeEventListener('goods-receipt:download-pdf', handler);
  }, []);

  useEffect(() => {
    if (!wizardOpen || !recordId || !base) return;
    const bpId = data?.businessPartner;
    if (!bpId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${base}/return-to-vendor-shipment/returnToVendorShipment/_/action/availableReceiptLines`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ receiptId: recordId, businessPartner: bpId }),
          },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setReturnLines(json?.response?.data || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, recordId, base, headers, data?.businessPartner]);

  // ETP-5063 — when confirming the receipt created no related invoice, skip
  // the result modal and communicate success via an auto-dismissing toast
  // instead, matching the UX used everywhere else success is communicated.
  useEffect(() => {
    if (confirmedDocs && !confirmedDocs.invoice?.id) {
      toast.success(ui('goodsReceipt.confirmModal.confirmedTitle'));
      onRefresh?.();
      setConfirmedDocs(null);
    }
  }, [confirmedDocs, onRefresh, ui]);

  const handleCreateInvoice = async (priceListId) => {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    try {
      const res = await fetch(
        `${base}/goods-receipt/goodsReceipt/${recordId}/action/createPurchaseInvoice`,
        { method: 'POST', headers, body: JSON.stringify({ priceListId }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Error (${res.status})`);
      }
      const invData = (await res.json())?.response?.data;
      setConfirmedDocs({ invoice: { id: invData?.id ?? null, documentNo: invData?.documentNo || '' } });
    } catch (err) {
      toast.error(err.message || ui('failedToCreateInvoice'));
    } finally {
      setCreatingInvoice(false);
    }
  };

  const sqBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 36, width: 36, borderRadius: 6, border: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', cursor: 'pointer', boxShadow: '0px 1px 2px 0px hsl(var(--foreground) / 0.05)', flexShrink: 0 };
  const textBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0 };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowClone(true)}
        title={ui('cloneOrderBtn')}
        style={{ ...sqBtn, background: isCloneHovered ? 'hsl(var(--card))' : 'hsl(var(--card))' }}
        onMouseEnter={() => setIsCloneHovered(true)}
        onMouseLeave={() => setIsCloneHovered(false)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>

      {isCompleted && !isFullyReturned && (
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{ ...textBtn, border: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-5" />
            <path d="M12 15l-3 3 3 3" />
            <path d="M9 18h8" />
          </svg>
          {ui('createReturn')}
        </button>
      )}

      <CopyRecordLinkButton recordId={recordId} windowName="goods-receipt" />

      {isCompleted && !isFullyInvoiced && (
        <button
          type="button"
          onClick={() => setShowInvoiceConfirm(true)}
          style={{ ...textBtn, border: '1px solid var(--status-info-border)', background: 'var(--status-info-fg)', color: 'hsl(var(--card))' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-info-fg)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--status-info-fg)'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {ui('createInvoiceBtn')}
        </button>
      )}

      {/* ETP-5265 — the fully-invoiced case no longer opens a confirm popup here;
          see handleConfirmFullyInvoiced above. This modal only ever renders now
          for the normal (not-fully-invoiced) confirm flow. */}
      {!isFullyInvoiced && showConfirm && (
        <ConfirmGoodsReceiptModal
          data={data}
          base={base}
          headers={headers}
          recordId={recordId}
          onConfirmed={(docs) => { setShowConfirm(false); setConfirmedDocs(docs); }}
          onClose={() => setShowConfirm(false)}
        />
      )}

      {showInvoiceConfirm && (
        <CreateInvoiceConfirmModal
          data={data}
          loading={creatingInvoice}
          showPriceListPicker
          isSOTrx={false}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onConfirm={(priceListId) => { setShowInvoiceConfirm(false); handleCreateInvoice(priceListId); }}
          onClose={() => setShowInvoiceConfirm(false)}
        />
      )}

      {confirmedDocs?.invoice?.id && createPortal(
        <ConfirmResultModal
          title={ui('goodsReceipt.confirmModal.confirmedTitle')}
          docs={[{ type: 'facturaCompra', num: confirmedDocs.invoice.documentNo, amount: confirmedDocs.invoice.amount, route: `/purchase-invoice/${confirmedDocs.invoice.id}` }]}
          primary={ui('soViewInvoice')}
          currency={data?.['currency$_identifier'] || ''}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setConfirmedDocs(null);
            setTimeout(() => {
              // ETP-4779 — partial refresh instead of a full page reload: refetch
              // the header (badge/readonly state) via onRefresh; the "Documentos"
              // section (RelatedDocuments.jsx, derived from `data.linkedInvoices`)
              // picks up the newly created invoice automatically once `data`
              // updates. Skipped when the user navigated away instead of closing.
              if (!resultNavigatedRef.current) onRefresh?.();
              resultNavigatedRef.current = false;
            }, 0);
          }}
        />,
        document.body,
      )}

      {returnedDoc && createPortal(
        <ConfirmResultModal
          title={ui('purchaseReturnCreatedTitle')}
          docs={[{ type: 'salida', num: returnedDoc.documentNo, route: `/return-to-vendor-shipment/${returnedDoc.id}` }]}
          primary={ui('soViewShipment')}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setReturnedDoc(null);
            setTimeout(() => {
              // ETP-4779 — same partial-refresh rationale as the invoice
              // confirmation panel above.
              if (!resultNavigatedRef.current) onRefresh?.();
              resultNavigatedRef.current = false;
            }, 0);
          }}
        />,
        document.body,
      )}

      {isCompleted && previewAttachment.storedFile && (
        <a
          ref={downloadLinkRef}
          href={previewAttachment.storedFile.objectUrl}
          download={previewAttachment.storedFile.fileName}
          title={previewAttachment.storedFile.fileName}
          style={{ ...sqBtn, textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      )}

      <PurchaseReturnWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        receiptData={data}
        lines={returnLines}
        base={base}
        headers={headers}
        onSuccess={(result) => { setWizardOpen(false); setReturnedDoc(result); }}
        onError={(msg) => toast.error(msg)}
      />

      {showClone && createPortal(
        <CloneReceiptModal
          receiptId={recordId}
          data={data}
          base={base}
          headers={headers}
          onClose={() => setShowClone(false)}
          onCloned={(newId) => { setShowClone(false); navigate(`/goods-receipt/${newId}`); }}
        />,
        document.body,
      )}
    </>
  );
}

// ── CloneReceiptModal ─────────────────────────────────────────────────────────

function CloneReceiptModal({ receiptId, data, base, headers, onClose, onCloned }) {
  const ui = useUI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lines, setLines] = useState(null);

  const documentNo = data?.documentNo || '';
  const bpName = data?.['businessPartner$_identifier'] || '';
  const status = data?.documentStatus;

  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/goods-receipt/goodsReceiptLine?parentId=${receiptId}&_startRow=0&_endRow=999`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (!cancelled) setLines(json?.response?.data ?? []); })
      .catch(() => { if (!cancelled) setLines([]); });
    return () => { cancelled = true; };
  }, [receiptId, base, headers]);

  const statusMap = {
    DR: { label: ui('orderStatusDraft'), bg: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' },
    CO: { label: ui('orderStatusCompleted'), bg: 'var(--status-success-bg)', color: 'var(--status-success-fg)' },
  };
  const badge = statusMap[status] || { label: status, bg: 'hsl(var(--foreground))', color: 'hsl(var(--muted-foreground))' };
  const lineCount = lines?.length ?? null;
  const lineLabel = lineCount === null ? '…' : lineCount === 1 ? ui('soLine') : ui('soLines', { count: lineCount });

  const handleClone = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/goods-receipt/goodsReceipt/${receiptId}/action/cloneRecord`, { method: 'POST', headers });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.response?.error?.message || ui('cloneReceiptError'));
        return;
      }
      onCloned(json?.response?.data?.id);
    } catch {
      setError(ui('cloneReceiptError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--foreground) / 0.3)' }}>
      <div style={{ width: 440, borderRadius: 12, backgroundColor: 'hsl(var(--card))', boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--card))', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 0' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'hsl(var(--foreground))' }}>{ui('cloneReceiptConfirmTitle')}</span>
          <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>&times;</button>
        </div>

        <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ border: '1px solid hsl(var(--card))', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(var(--card))' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bpName}</span>
              {documentNo && <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', flexShrink: 0 }}>{documentNo}</span>}
              {status && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: badge.bg, color: badge.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{badge.label}</span>}
            </div>
            <div style={{ padding: '6px 14px 9px', background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--card))' }}>
              <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{lineLabel}</span>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', margin: 0, padding: '0 2px' }}>{ui('cloneReceiptConfirmBody')}</p>
          {error && <div style={{ color: 'hsl(var(--destructive))', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 6, border: '1px solid hsl(var(--card))', background: 'transparent', color: 'hsl(var(--muted))', cursor: 'pointer' }}>{ui('cancel')}</button>
            <button type="button" onClick={handleClone} disabled={loading} style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--status-info-bg)', color: 'hsl(var(--card))', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {loading ? ui('creating') : ui('cloneReceiptAction')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import ConfirmGoodsReceiptModal from './ConfirmGoodsReceiptModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { usePreviewAttachment } from '@/windows/custom/shared/usePreviewAttachment.js';
import PurchaseReturnWizard from './PurchaseReturnWizard';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { formatCurrency } from '@/lib/formatCurrency.js';


// ── Main component ────────────────────────────────────────────────────────────

export default function GoodsReceiptActions({ data, recordId, token, apiBaseUrl }) {
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

  const previewAttachment = usePreviewAttachment({
    documentId: recordId,
    specName: 'goods-receipt',
    storeCondition: isCompleted,
    token,
    apiBaseUrl,
  });
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => {
    const handler = () => setShowConfirm(true);
    window.addEventListener('goods-receipt:open-confirm-modal', handler);
    return () => window.removeEventListener('goods-receipt:open-confirm-modal', handler);
  }, []);

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

  const sqBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 36, width: 36, borderRadius: 6, border: '1px solid hsl(var(--card))', background: 'hsl(var(--card))', color: 'var(--status-info-bg)', cursor: 'pointer', boxShadow: '0px 1px 2px 0px hsl(var(--foreground) / 0.05)', flexShrink: 0 };
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
          style={{ ...textBtn, border: '1px solid hsl(var(--card))', background: 'hsl(var(--card))', color: 'var(--status-info-bg)' }}
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

      {isCompleted && !isFullyInvoiced && (
        <button
          type="button"
          onClick={() => setShowInvoiceConfirm(true)}
          style={{ ...textBtn, border: '1px solid var(--status-info-border)', background: 'var(--status-info-bg)', color: 'var(--status-info-fg)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-info-bg)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--status-info-bg)'; }}
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

      {showConfirm && isFullyInvoiced
        ? createPortal(
            <ConfirmReceiptInvoicedModal
              data={data}
              base={base}
              headers={headers}
              recordId={recordId}
              onConfirmed={(docs) => { setShowConfirm(false); setConfirmedDocs(docs); }}
              onClose={() => setShowConfirm(false)}
            />,
            document.body,
          )
        : showConfirm && (
            <ConfirmGoodsReceiptModal
              data={data}
              base={base}
              headers={headers}
              recordId={recordId}
              onConfirmed={(docs) => { setShowConfirm(false); setConfirmedDocs(docs); }}
              onClose={() => setShowConfirm(false)}
            />
          )
      }

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

      {confirmedDocs && createPortal(
        <ConfirmResultModal
          title={ui('goodsReceipt.confirmModal.confirmedTitle')}
          docs={confirmedDocs?.invoice?.id
            ? [{ type: 'facturaCompra', num: confirmedDocs.invoice.documentNo, amount: confirmedDocs.invoice.amount, route: `/purchase-invoice/${confirmedDocs.invoice.id}` }]
            : []
          }
          primary={ui('soViewInvoice')}
          currency={data?.['currency$_identifier'] || ''}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setConfirmedDocs(null);
            setTimeout(() => {
              if (!resultNavigatedRef.current) window.location.reload();
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
              if (!resultNavigatedRef.current) window.location.reload();
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

// ── ConfirmReceiptInvoicedModal (variant B — receipt already fully invoiced) ──

function ConfirmReceiptInvoicedModal({ data, base, headers, recordId, onConfirmed, onClose }) {
  const ui = useUI();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const invoices = Array.isArray(data?.linkedInvoices) ? data.linkedInvoices : [];
  const firstInvoice = invoices[0] || null;
  const extraCount = invoices.length - 1;
  const docNo = data?.documentNo || '';
  const bpName = data?.['businessPartner$_identifier'] || '';

  const fmtAmount = (v, currency) => {
    if (v == null) return '';
    return formatCurrency(currency, v);
  };

  const statusLabel = { CO: ui('orderStatusCompleted'), DR: ui('orderStatusDraft') };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${base}/goods-receipt/goodsReceipt/${recordId}/action/documentAction`,
        { method: 'POST', headers, body: JSON.stringify({ docAction: 'CO' }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.response?.message || body?.message || `Error (${res.status})`);
      }
      onConfirmed({ invoice: null });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--foreground) / .45)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, borderRadius: 14, background: 'hsl(var(--card))', boxShadow: '0 24px 60px -12px hsl(var(--foreground) / .35)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'hsl(var(--foreground))' }}>{ui('goodsReceipt.confirmModal.titleConfirm')}</span>
          <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Identity row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{docNo}</span>
            {bpName && <><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>·</span><span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{bpName}</span></>}
          </div>

          {/* First invoice card */}
          {firstInvoice && (
            <div style={{ border: '1px solid hsl(var(--foreground))', borderRadius: 11, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'hsl(var(--card))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--status-info-bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{ui('goodsReceipt.confirmModal.invoiceRef')} {firstInvoice.documentNo}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 6, background: 'hsl(var(--card))', color: 'var(--status-success-bg)', whiteSpace: 'nowrap' }}>
                    {statusLabel[firstInvoice.documentStatus] || firstInvoice.documentStatus}
                  </span>
                </div>
                {firstInvoice.grandTotalAmount != null && (
                  <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                    {fmtAmount(firstInvoice.grandTotalAmount, firstInvoice['currency$_identifier'])}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/purchase-invoice/${firstInvoice.id}`); }}
                style={{ all: 'unset', fontSize: 13, fontWeight: 600, color: 'var(--status-info-border)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-info-fg)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--status-info-border)'; }}
              >
                {ui('goodsReceipt.confirmModal.viewInvoice')}
              </button>
            </div>
          )}

          {/* +N more badge */}
          {extraCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'hsl(var(--card))', borderRadius: 9, border: '1px solid hsl(var(--card))' }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--status-info-bg)', background: 'hsl(var(--card))', borderRadius: 99, padding: '2px 9px', border: '1px solid var(--status-info-bg)', flexShrink: 0 }}>+{extraCount}</span>
              <span style={{ fontSize: 13, color: 'hsl(var(--muted))' }}>{ui('goodsReceipt.confirmModal.moreInvoices')}</span>
            </div>
          )}

          {/* Microcopy */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-success-bg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5, margin: 0 }}>
              {ui('goodsReceipt.confirmModal.fullyInvoicedInfo')}{' '}
              <strong style={{ color: 'hsl(var(--foreground))' }}>{ui('goodsReceipt.confirmModal.noNewInvoice')}</strong>
            </p>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--card))' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ fontSize: 13, padding: '9px 16px', borderRadius: 9, border: '1px solid hsl(var(--card))', background: 'transparent', color: 'hsl(var(--muted))', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '0 18px', borderRadius: 9, border: 'none', background: loading ? 'var(--status-info-bg)' : 'var(--status-info-bg)', color: 'hsl(var(--card))', cursor: loading ? 'not-allowed' : 'pointer' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--status-info-bg)'; }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--status-info-bg)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {loading ? ui('processing') : ui('goodsReceipt.confirmModal.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
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

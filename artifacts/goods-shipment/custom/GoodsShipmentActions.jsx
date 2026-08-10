import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI, useMenuLabel } from '@/i18n';
import ReturnWizard from './ReturnWizard';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import GoodsShipmentConfirmModal from './GoodsShipmentConfirmModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { useShipmentPdf } from '@/windows/custom/goods-shipment/useShipmentPdf';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { formatCurrency } from '@/lib/formatCurrency.js';
import CopyRecordLinkButton from '@/components/contract-ui/CopyRecordLinkButton';

export default function GoodsShipmentActions({ data, recordId, token, apiBaseUrl, api }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [returnLines, setReturnLines] = useState([]);
  const [showSend, setShowSend] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState(null);
  const [showClone, setShowClone] = useState(false);
  const resultNavigatedRef = useRef(false);

  const isCompleted = data?.documentStatus === 'CO';
  const isFullyInvoiced = data?.invoiceStatus >= 100;
  const canCreateReturn = data?.canCreateReturn === true;

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // ETP-4372 — source the same client-rendered delivery-note PDF the
  // GoodsShipmentPreview panel uses so the form-view topbar Send modal shows the
  // document instead of the "PDF not configured" fallback. Hook is called
  // unconditionally at top level (rules of hooks).
  const { pdfUrl: shipmentPdfUrl, loading: shipmentPdfLoading } = useShipmentPdf(recordId, apiBaseUrl, token);

  useEffect(() => {
    const handler = () => setShowConfirmModal(true);
    window.addEventListener('goods-shipment:open-confirm-modal', handler);
    return () => window.removeEventListener('goods-shipment:open-confirm-modal', handler);
  }, []);

  useEffect(() => {
    if (!wizardOpen || !recordId || !base) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${base}/return-material-receipt/returnMaterialReceipt/_/action/availableShipmentLines`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ shipmentId: recordId }),
          },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setReturnLines(json?.response?.data || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, recordId, base, headers]);

  const handleCreateInvoice = async (priceListId) => {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    try {
      const res = await fetch(
        `${base}/goods-shipment/goodsShipment/${recordId}/action/createDraftInvoice`,
        { method: 'POST', headers, body: JSON.stringify({ priceListId }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Failed (${res.status})`);
      }
      const json = await res.json();
      const invoiceId = json?.response?.data?.id;
      const docNo = json?.response?.data?.documentNo || '';
      setInvoiceResult({
        invoice: {
          id: invoiceId || null,
          documentNo: docNo,
          amount: json?.response?.data?.grandTotalAmount ?? null,
        },
      });
    } catch (err) {
      toast.error(err.message || ui('failedToCreateInvoice'));
    } finally {
      setCreatingInvoice(false);
    }
  };

  return (
    <>
      {isCompleted && !isFullyInvoiced && (
        <button
          type="button"
          onClick={() => setShowInvoiceConfirm(true)}
          disabled={creatingInvoice}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
          style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--status-info-border)', background: 'var(--status-info-fg)', color: 'hsl(var(--card))', opacity: creatingInvoice ? 0.6 : 1, cursor: creatingInvoice ? 'not-allowed' : 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-info-fg)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--status-info-fg)'; }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {ui('createInvoiceBtn')}
        </button>
      )}

      {isCompleted && canCreateReturn && (
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          style={{ padding: '4px 12px', borderRadius: '6px', borderWidth: '1px' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-5" />
            <path d="M12 15l-3 3 3 3" />
            <path d="M9 18h8" />
          </svg>
          {ui('createReturn')}
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowClone(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        style={{ padding: '4px 12px', borderRadius: '6px', borderWidth: '1px' }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        {ui('cloneOrderBtn')}
      </button>

      {isCompleted && <SendDocumentButton onClick={() => setShowSend(true)} />}

      <CopyRecordLinkButton recordId={recordId} windowName="goods-shipment" />

      {!isCompleted && showConfirmModal && isFullyInvoiced
        ? createPortal(
            <ConfirmShipmentInvoicedModal
              base={base}
              headers={headers}
              recordId={recordId}
              data={data}
              onConfirmed={() => {
                setShowConfirmModal(false);
                setInvoiceResult({ invoice: null });
              }}
              onClose={() => setShowConfirmModal(false)}
            />,
            document.body,
          )
        : !isCompleted && showConfirmModal && (
            <GoodsShipmentConfirmModal
              base={base}
              headers={headers}
              recordId={recordId}
              data={data}
              onConfirmed={({ invoice }) => {
                setShowConfirmModal(false);
                setInvoiceResult({ invoice: invoice || null });
              }}
              onClose={() => setShowConfirmModal(false)}
            />
          )
      }

      {showInvoiceConfirm && (
        <CreateInvoiceConfirmModal
          data={data}
          loading={creatingInvoice}
          pendingQtyUrl={`${base}/goods-shipment/goodsShipment/${recordId}/action/pendingInvoiceLines`}
          showPriceListPicker
          isSOTrx
          apiBaseUrl={apiBaseUrl}
          token={token}
          onConfirm={(priceListId) => { setShowInvoiceConfirm(false); handleCreateInvoice(priceListId); }}
          onClose={() => setShowInvoiceConfirm(false)}
        />
      )}

      {invoiceResult && createPortal(
        <ConfirmResultModal
          title={ui(invoiceResult.invoice?.id ? 'soInvoiceCreated' : 'goodsShipment.confirmModal.confirmedTitle')}
          docs={invoiceResult.invoice?.id
            ? [{ type: 'facturaVenta', num: invoiceResult.invoice.documentNo, amount: invoiceResult.invoice.amount, route: `/sales-invoice/${invoiceResult.invoice.id}` }]
            : []
          }
          primary={ui('soViewInvoice')}
          currency={data?.['currency$_identifier'] || ''}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setInvoiceResult(null);
            setTimeout(() => {
              if (!resultNavigatedRef.current) window.location.reload();
              resultNavigatedRef.current = false;
            }, 0);
          }}
        />,
        document.body,
      )}

      {showClone && createPortal(
        <CloneOrderModal
          recordId={recordId}
          data={data}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          headerEntity="goodsShipment"
          routePrefix="/goods-shipment/"
          onClose={() => setShowClone(false)}
        />,
        document.body,
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>


      <ReturnWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        shipmentData={data}
        lines={returnLines}
        token={token}
        apiBaseUrl={apiBaseUrl}
        onSuccess={(returnData) => {
          setWizardOpen(false);
          if (returnData?.id) {
            navigate(`/return-material-receipt/${returnData.id}`);
          } else {
            window.location.reload();
          }
        }}
        onError={(msg) => toast.error(msg)}
      />

      {showSend && createPortal(
        <SendDocumentModal
          documentType={tMenu('Goods Shipment')}
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bPartnerId={data?.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={recordId}
          windowName="goods-shipment"
          token={token}
          pdfBlobUrl={shipmentPdfUrl}
          pdfBlobLoading={shipmentPdfLoading}
          onClose={() => setShowSend(false)}
        />,
        document.body,
      )}
    </>
  );
}

// ── ConfirmShipmentInvoicedModal (shipment already fully invoiced — confirm only) ──

function ConfirmShipmentInvoicedModal({ data, base, headers, recordId, onConfirmed, onClose }) {
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
        `${base}/goods-shipment/goodsShipment/${recordId}/action/documentAction`,
        { method: 'POST', headers, body: JSON.stringify({ docAction: 'CO' }) },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.response?.message || body?.message || `Error (${res.status})`);
      }
      onConfirmed();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--foreground) / .45)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, borderRadius: 14, background: 'hsl(var(--card))', boxShadow: '0 24px 60px -12px hsl(var(--foreground) / .35)', overflow: 'hidden' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'hsl(var(--foreground))' }}>{ui('goodsShipment.confirmModal.titleConfirm')}</span>
          <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>&times;</button>
        </div>

        <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{docNo}</span>
            {bpName && <><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>·</span><span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{bpName}</span></>}
          </div>

          {firstInvoice && (
            <div style={{ border: '1px solid hsl(var(--foreground))', borderRadius: 11, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--status-info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--status-info-fg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{ui('goodsShipment.confirmModal.invoiceRef')} {firstInvoice.documentNo}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 6, background: 'var(--status-success-bg)', color: 'var(--status-success-fg)', whiteSpace: 'nowrap' }}>
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
                onClick={() => { onClose(); navigate(`/sales-invoice/${firstInvoice.id}`); }}
                style={{ all: 'unset', fontSize: 13, fontWeight: 600, color: 'var(--status-info-border)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-info-fg)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--status-info-border)'; }}
              >
                {ui('goodsShipment.confirmModal.viewInvoice')}
              </button>
            </div>
          )}

          {extraCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'hsl(var(--card))', borderRadius: 9, border: '1px solid hsl(var(--card))' }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--status-info-bg)', background: 'hsl(var(--card))', borderRadius: 99, padding: '2px 9px', border: '1px solid var(--status-info-bg)', flexShrink: 0 }}>+{extraCount}</span>
              <span style={{ fontSize: 13, color: 'hsl(var(--muted))' }}>{ui('goodsShipment.confirmModal.moreInvoices')}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-success-bg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5, margin: 0 }}>
              {ui('goodsShipment.confirmModal.fullyInvoicedInfo')}{' '}
              <strong style={{ color: 'hsl(var(--foreground))' }}>{ui('goodsShipment.confirmModal.noNewInvoice')}</strong>
            </p>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'hsl(var(--destructive))', background: 'hsl(var(--card))', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--card))' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ fontSize: 13, padding: '9px 16px', borderRadius: 9, border: '1px solid hsl(var(--card))', background: 'transparent', color: 'hsl(var(--muted))', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '0 18px', borderRadius: 9, border: 'none', background: loading ? 'var(--status-info-fg)' : 'var(--status-info-fg)', color: 'hsl(var(--card))', cursor: loading ? 'not-allowed' : 'pointer' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--status-info-fg)'; }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--status-info-fg)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {loading ? ui('processing') : ui('goodsShipment.confirmModal.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

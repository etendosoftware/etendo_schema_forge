import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI, useMenuLabel } from '@/i18n';
import ReturnWizard from './ReturnWizard';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import GoodsShipmentConfirmModal from './GoodsShipmentConfirmModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { generateShipmentPdf, getShipmentPdfLabels } from '@/windows/custom/goods-shipment/useShipmentPdf';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';

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
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadingAction, setPdfLoadingAction] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const menuRef = useRef(null);
  const resultNavigatedRef = useRef(false);

  const isCompleted = data?.documentStatus === 'CO';
  const isFullyInvoiced = data?.invoiceStatus >= 100;
  const canCreateReturn = data?.canCreateReturn === true;

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    const handler = () => setShowConfirmModal(true);
    window.addEventListener('goods-shipment:open-confirm-modal', handler);
    return () => window.removeEventListener('goods-shipment:open-confirm-modal', handler);
  }, []);

  const pdfLabels = getShipmentPdfLabels(ui);

  const handlePrint = async () => {
    if (pdfLoading) return;
    setPdfLoading(true); setPdfLoadingAction('print');
    try {
      const blob = await generateShipmentPdf(recordId, apiBaseUrl, token, pdfLabels);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      toast.error(err.message || ui('failedToGeneratePdf'));
    } finally {
      setPdfLoading(false); setPdfLoadingAction(null);
    }
  };

  const handleDownload = async () => {
    if (pdfLoading) return;
    setPdfLoading(true); setPdfLoadingAction('download');
    try {
      const blob = await generateShipmentPdf(recordId, apiBaseUrl, token, pdfLabels);
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `alb-${data?.documentNo || recordId}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || ui('failedToGeneratePdf'));
    } finally {
      setPdfLoading(false); setPdfLoadingAction(null);
    }
  };

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

  const handleCreateInvoice = async () => {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    try {
      const res = await fetch(
        `${base}/goods-shipment/goodsShipment/${recordId}/action/createDraftInvoice`,
        { method: 'POST', headers, body: JSON.stringify({}) },
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
          style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--color-border-info, #93c5fd)', background: 'var(--color-background-info, #eff6ff)', color: 'var(--color-text-info, #2563eb)', opacity: creatingInvoice ? 0.6 : 1, cursor: creatingInvoice ? 'not-allowed' : 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-background-info-hover, #dbeafe)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-background-info, #eff6ff)'; }}
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

      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        style={{ padding: '4px 12px', borderRadius: '6px', borderWidth: '1px', opacity: pdfLoading && pdfLoadingAction === 'print' ? 0.6 : 1 }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
        {ui('print')}
      </button>

      {isCompleted && (
        <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className="inline-flex items-center justify-center text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            style={{ padding: '4px 10px', borderRadius: '6px', borderWidth: '1px' }}
          >
            ⋮
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, minWidth: 170, background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); handleDownload(); }}
                disabled={pdfLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', fontSize: 13, color: '#111827', background: 'none', border: 'none', cursor: pdfLoading ? 'not-allowed' : 'pointer', opacity: pdfLoading && pdfLoadingAction === 'download' ? 0.6 : 1 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                {pdfLoading && pdfLoadingAction === 'download' ? (
                  <svg style={{ width: 14, height: 14, flexShrink: 0, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                ) : (
                  <svg style={{ width: 14, height: 14, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                )}
                {ui('invoicePreviewDownloadPdf')}
              </button>
            </div>
          )}
        </div>
      )}

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
          onConfirm={() => { setShowInvoiceConfirm(false); handleCreateInvoice(); }}
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
    return `${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,26,38,.45)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, borderRadius: 14, background: '#fff', boxShadow: '0 24px 60px -12px rgba(20,26,38,.35)', overflow: 'hidden' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#1f2733' }}>{ui('goodsShipment.confirmModal.titleConfirm')}</span>
          <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9aa1aa' }}>&times;</button>
        </div>

        <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2733' }}>{docNo}</span>
            {bpName && <><span style={{ color: '#9aa1aa', fontSize: 13 }}>·</span><span style={{ fontSize: 13, color: '#6b7480' }}>{bpName}</span></>}
          </div>

          {firstInvoice && (
            <div style={{ border: '1px solid #e7e9ec', borderRadius: 11, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: '#f3f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c5cff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2733' }}>{ui('goodsShipment.confirmModal.invoiceRef')} {firstInvoice.documentNo}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 6, background: '#e6f6ec', color: '#1f9d57', whiteSpace: 'nowrap' }}>
                    {statusLabel[firstInvoice.documentStatus] || firstInvoice.documentStatus}
                  </span>
                </div>
                {firstInvoice.grandTotalAmount != null && (
                  <div style={{ fontSize: 13, color: '#6b7480', marginTop: 2 }}>
                    {fmtAmount(firstInvoice.grandTotalAmount, firstInvoice['currency$_identifier'])}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/sales-invoice/${firstInvoice.id}`); }}
                style={{ all: 'unset', fontSize: 13, fontWeight: 600, color: '#2f73d6', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = '#2a67c2'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#2f73d6'; }}
              >
                {ui('goodsShipment.confirmModal.viewInvoice')}
              </button>
            </div>
          )}

          {extraCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f8f9fb', borderRadius: 9, border: '1px solid #e7e9ec' }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: '#2f73d6', background: '#eff5fe', borderRadius: 99, padding: '2px 9px', border: '1px solid #cadffb', flexShrink: 0 }}>+{extraCount}</span>
              <span style={{ fontSize: 13, color: '#6b7480' }}>{ui('goodsShipment.confirmModal.moreInvoices')}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f9d57" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <p style={{ fontSize: 13, color: '#6b7480', lineHeight: 1.5, margin: 0 }}>
              {ui('goodsShipment.confirmModal.fullyInvoicedInfo')}{' '}
              <strong style={{ color: '#1f2733' }}>{ui('goodsShipment.confirmModal.noNewInvoice')}</strong>
            </p>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', background: '#fbfcfd', borderTop: '1px solid #eef0f2' }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ fontSize: 13, padding: '9px 16px', borderRadius: 9, border: '1px solid #e7e9ec', background: 'transparent', color: '#6b7480', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '0 18px', borderRadius: 9, border: 'none', background: loading ? '#aac4e8' : '#2f73d6', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#2a67c2'; }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#2f73d6'; }}
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

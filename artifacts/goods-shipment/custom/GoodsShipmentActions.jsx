import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { useDocumentAction } from '@/hooks/useDocumentAction';
import CopyRecordLinkButton from '@/components/contract-ui/CopyRecordLinkButton';

export default function GoodsShipmentActions({ data, recordId, token, apiBaseUrl, api, onRefresh }) {
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

  // ETP-5265 — when the shipment is already fully invoiced, Confirm skips the
  // intermediate "already invoiced" popup entirely and calls the document-action
  // endpoint directly, like any other direct action in the app: a loading toast
  // while in flight, then the same success path the popup used to trigger
  // (setInvoiceResult({ invoice: null }) — picked up by the toast effect below),
  // or a toast.error on failure. The non-fully-invoiced flow (GoodsShipmentConfirmModal)
  // is untouched.
  const confirmDocAction = useDocumentAction({ apiBaseUrl, entity: 'goodsShipment', token });
  const confirmingFullyInvoicedRef = useRef(false);
  const handleConfirmFullyInvoiced = useCallback(async () => {
    if (confirmingFullyInvoicedRef.current) return;
    confirmingFullyInvoicedRef.current = true;
    const toastId = toast.loading(ui('processing'));
    try {
      await confirmDocAction.execute(recordId, 'CO');
      toast.dismiss(toastId);
      setInvoiceResult({ invoice: null });
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
        setShowConfirmModal(true);
      }
    };
    window.addEventListener('goods-shipment:open-confirm-modal', handler);
    return () => window.removeEventListener('goods-shipment:open-confirm-modal', handler);
  }, [isFullyInvoiced, handleConfirmFullyInvoiced]);

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

  // ETP-5063 — when confirming the shipment created no related invoice, skip
  // the result modal and communicate success via an auto-dismissing toast
  // instead, matching the UX used everywhere else success is communicated.
  useEffect(() => {
    if (invoiceResult && !invoiceResult.invoice?.id) {
      toast.success(ui('goodsShipment.confirmModal.confirmedTitle'));
      onRefresh?.();
      setInvoiceResult(null);
    }
  }, [invoiceResult, onRefresh, ui]);

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

      {/* ETP-5265 — the fully-invoiced case no longer opens a confirm popup here;
          see handleConfirmFullyInvoiced above. This modal only ever renders now
          for the normal (not-fully-invoiced) confirm flow. */}
      {!isCompleted && !isFullyInvoiced && showConfirmModal && (
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
      )}

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

      {invoiceResult?.invoice?.id && createPortal(
        <ConfirmResultModal
          title={ui('soInvoiceCreated')}
          docs={[{ type: 'facturaVenta', num: invoiceResult.invoice.documentNo, amount: invoiceResult.invoice.amount, route: `/sales-invoice/${invoiceResult.invoice.id}` }]}
          primary={ui('soViewInvoice')}
          currency={data?.['currency$_identifier'] || ''}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setInvoiceResult(null);
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
            // ETP-4779 — partial refresh (see rationale above) instead of a full
            // page reload when there's no id to navigate to.
            onRefresh?.();
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

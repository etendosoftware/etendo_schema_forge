import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI, useMenuLabel } from '@/i18n';
import ReturnWizard from './ReturnWizard';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal';
import GoodsShipmentConfirmModal from './GoodsShipmentConfirmModal';
import { ConfirmResultModal } from '@/components/contract-ui';
import { useShipmentPdf } from '@/windows/custom/goods-shipment/useShipmentPdf';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
  const resultNavigatedRef = useRef(false);

  const isCompleted = data?.documentStatus === 'CO';
  const isFullyInvoiced = data?.invoiceStatus >= 100;
  const canCreateReturn = data?.canCreateReturn === true;

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  // ETP-4576 - the credential belongs to apiFetch, not to the component: it picks the
  // active scheme's headers, and the CSRF proof on every unsafe method.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');

  // ETP-4372 — source the same client-rendered delivery-note PDF the
  // GoodsShipmentPreview panel uses so the form-view topbar Send modal shows the
  // document instead of the "PDF not configured" fallback. Hook is called
  // unconditionally at top level (rules of hooks).
  const { pdfUrl: shipmentPdfUrl, loading: shipmentPdfLoading } = useShipmentPdf(recordId, apiBaseUrl, token);

  // ETP-5265 — when the shipment is already fully invoiced, Confirm skips the
  // intermediate "already invoiced" popup entirely and calls the document-action
  // endpoint directly, like any other direct action in the app. The non-fully-invoiced
  // flow (GoodsShipmentConfirmModal) is untouched.
  //
  // ETP-5265 QA follow-up (2) — in-flight feedback is the Confirm button's own spinner,
  // never a floating toast. The listener below hands this promise back through the
  // CustomEvent `detail` (see dispatchConfirmModalEvent in the window's index.jsx) and
  // runDraftModeConfirm in saveActions.jsx awaits it, so whatever this function awaits
  // is exactly how long the button stays busy. It therefore awaits the refetch too
  // (`onRefresh`, which is `hook.fetchById(id, { force: true })` and became awaitable in
  // useEntity.js): the first cut resolved on the POST alone (~150-300 ms locally) and the
  // spinner was imperceptible, because the record refresh happened afterwards, out of
  // band. Now the busy state runs unbroken from the click until the refreshed record is
  // on screen.
  //
  // Two failure domains, deliberately separate: a failed POST is a failed confirmation
  // (toast.error, no success toast, no refresh); a failed REFRESH is not — the document
  // is confirmed, the screen is merely stale, and reporting it as an error would be a
  // lie. Success-toast placement mirrors the native draftMode path exactly: useEntity's
  // handleSaveAndProcess fires `toast.success` as soon as the action POST succeeds and
  // only then refetches, so ours fires there too, not after the refresh.
  //
  // NOTE — this path no longer routes through `setInvoiceResult({ invoice: null })`. That
  // setter's effect (ETP-5063) both toasts AND refreshes, and it cannot be awaited, so it
  // cannot hold the button busy. The effect is still live and still owns the
  // GoodsShipmentConfirmModal path, which is why the two look different here: only this
  // branch needs a promise to hand back.
  const confirmDocAction = useDocumentAction({ apiBaseUrl, entity: 'goodsShipment', token });
  const confirmingFullyInvoicedRef = useRef(false);
  const handleConfirmFullyInvoiced = useCallback(async () => {
    if (confirmingFullyInvoicedRef.current) return;
    confirmingFullyInvoicedRef.current = true;
    try {
      try {
        await confirmDocAction.execute(recordId, 'CO');
      } catch (err) {
        // Domain 1 — the confirmation itself failed. Nothing else must run.
        toast.error(err.message || ui('networkError'));
        return;
      }
      // The document IS confirmed from here on. Same moment the native path toasts.
      toast.success(ui('goodsShipment.confirmModal.confirmedTitle'));
      // Domain 2 — a refetch failure must never read as a failed confirmation. Swallowed
      // on purpose; the button simply stops spinning on stale (but correct) data.
      await Promise.resolve(onRefresh?.()).catch(() => {});
    } finally {
      // Cleared only once BOTH the POST and the refresh have settled, so a second click
      // cannot start while the first operation is still in flight.
      confirmingFullyInvoicedRef.current = false;
    }
  }, [confirmDocAction.execute, recordId, ui, onRefresh]);

  useEffect(() => {
    // ETP-5265 QA follow-up — `e.detail.promise` is how the in-flight documentAction
    // call reaches the core's Confirm button (see dispatchConfirmModalEvent in the
    // window's index.jsx). The modal branch deliberately leaves it unset: opening a
    // modal is instantaneous, so the button must not spin for it.
    const handler = (e) => {
      if (isFullyInvoiced) {
        if (e?.detail) e.detail.promise = handleConfirmFullyInvoiced();
        else handleConfirmFullyInvoiced();
      } else {
        setShowConfirmModal(true);
      }
    };
    window.addEventListener('goods-shipment:open-confirm-modal', handler);
    return () => window.removeEventListener('goods-shipment:open-confirm-modal', handler);
  }, [isFullyInvoiced, handleConfirmFullyInvoiced]);

  // ETP-5260 — the Send button now lives in the topbarSecondary slot
  // (GoodsShipmentSecondaryActions), while this modal (with its delivery-note
  // PDF context) stays here in topbarRight; the button dispatches this event
  // to open it.
  useEffect(() => {
    const handler = () => setShowSend(true);
    window.addEventListener('goods-shipment:open-send-modal', handler);
    return () => window.removeEventListener('goods-shipment:open-send-modal', handler);
  }, []);

  useEffect(() => {
    if (!wizardOpen || !recordId || !base) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `${base}/return-material-receipt/returnMaterialReceipt/_/action/availableShipmentLines`,
          {
            method: 'POST',
            body: JSON.stringify({ shipmentId: recordId }),
          },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setReturnLines(json?.response?.data || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, recordId, base, apiFetch]);

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
      const res = await apiFetch(
        `${base}/goods-shipment/goodsShipment/${recordId}/action/createDraftInvoice`,
        { method: 'POST', body: JSON.stringify({ priceListId }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Failed (${res.status})`);
      }
      const json = await res.json();
      const invoiceId = json?.response?.data?.id;
      const docNo = json?.response?.data?.documentNo || '';
      setShowInvoiceConfirm(false);
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
          // Fix (not part of ETP-5260): was `var(--status-info-fg)` — a badge-text token,
          // not a button-background token — which rendered a saturated blue instead of
          // the dark gray used by the real `Confirmar` button. Same pattern as ETP-4781.
          style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--status-info-border)', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', opacity: creatingInvoice ? 0.6 : 1, cursor: creatingInvoice ? 'not-allowed' : 'pointer' }}
          // Hover to match the shared Confirm button's `hover:bg-primary/90` (90% opacity).
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--primary) / 0.9)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--primary))'; }}
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

      {/* ETP-5260 — Clone/Copy-link/Send moved to the topbarSecondary slot
          (GoodsShipmentSecondaryActions). This component now only renders the
          PRIMARY flow buttons above and the modals below. */}

      {/* ETP-5265 — the fully-invoiced case no longer opens a confirm popup here;
          see handleConfirmFullyInvoiced above. This modal only ever renders now
          for the normal (not-fully-invoiced) confirm flow. */}
      {!isCompleted && !isFullyInvoiced && showConfirmModal && (
        <GoodsShipmentConfirmModal
          base={base}
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
          onConfirm={handleCreateInvoice}
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

      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>


      <ReturnWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        shipmentData={data}
        lines={returnLines}
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

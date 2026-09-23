import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ConfirmResultModal } from '@/components/contract-ui/ConfirmResultModal';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { useConfirmWithCredit } from './useConfirmWithCredit';

/**
 * Confirm flow + completed-state actions shared by the two return windows
 * (return-material-receipt, return-to-vendor-shipment), mounted in their `topbarRight` slot.
 *
 * The Borrador "Confirmar" button is NOT rendered here: it is the generic draftMode Confirm
 * (`saveActions.jsx` -> `renderDraftModeSaveActions`). That button owns every enablement
 * rule (disabled while `saveGate.blocked`, and while the document has no lines via
 * `draftMode.disableWhenEmpty`) and saves a dirty header before calling `draftMode.onConfirm`,
 * which each window's index.jsx wires to dispatch `confirmEventName`.
 *
 * This component only listens for that event and opens ConfirmInOutModal (documentAction
 * POST + optional rectificative invoice + result modal). It never saves. It also renders the
 * CO-state "create return invoice" button, `extraActions` and `extraPortals`.
 *
 * History: before ETP-5408 this component rendered its own DR Confirm button and ran the
 * save-before-confirm step itself (ETP-4940).
 */
export default function ConfirmWithCreditButtonBase({
  data, recordId, token, apiBaseUrl,
  entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey,
  specName, entityName,
  confirmEventName,
  saveGate, onRefresh,
  confirmDrLabel,
  confirmModalTitle, infoRowPre, infoRowBold, infoRowPost, confirmWithInvoiceLabel,
  postConfirmButtonLabel,
  cardTitle: cardTitleProp,
  cardDesc: cardDescProp,
  extraActions,
  extraPortals,
}) {
  const navigate = useNavigate();
  const resultNavigatedRef = useRef(false);
  const {
    ui, status, currency, hasReturnInvoice,
    headers, base, showModal, setShowModal,
    creatingInvoice, result, setResult,
    handleCreateReturnInvoice, buildInvoiceResultFromConfirm,
  } = useConfirmWithCredit({
    data, recordId, token, apiBaseUrl,
    entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey,
  });

  // ETP-5408 — the generic draftMode Confirm button dispatches this event (see the doc
  // comment above). The guard is only a backstop against an event dispatched outside that
  // button: not in Borrador, or the required-field save gate is closed (ETP-4933). It
  // deliberately does NOT re-check the lines count — the button's `disableWhenEmpty` reads
  // the live lines, while the header's `linesCount` may lag right after the first line is
  // added, and a disagreement would make an enabled Confirm silently do nothing.
  // Registered before the early return below (Rules of Hooks) and re-bound whenever
  // `status`/`saveGate.blocked` change, so the handler never reads a stale value.
  const saveBlocked = Boolean(saveGate?.blocked);
  useEffect(() => {
    if (!confirmEventName) return undefined;
    const handler = () => {
      if (status !== 'DR' || saveBlocked) return;
      setShowModal(true);
    };
    window.addEventListener(confirmEventName, handler);
    return () => window.removeEventListener(confirmEventName, handler);
  }, [confirmEventName, status, saveBlocked, setShowModal]);

  if (status !== 'DR' && status !== 'CO') return null;

  const isFullyInvoiced = parseFloat(data?.invoiceStatus ?? 0) >= 100;

  const rectifiableInvoicesUrl =
    `${base}/${specName}/${entityName}/${data?.id || recordId}/action/rectifiableInvoices`;

  return (
    <>
      {status === 'CO' && !hasReturnInvoice && (
        <button type="button" data-testid="action-create-return-invoice" onClick={() => setShowModal(true)}
          style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--status-info-fg)', color: 'hsl(var(--card))', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {postConfirmButtonLabel ?? ui('createReturnInvoice')}
        </button>
      )}
      {extraActions}
      {extraPortals}
      {showModal && status === 'DR' && (
        <ConfirmInOutModal
          base={base}
          headers={headers}
          recordId={data?.id || recordId}
          specName={specName}
          entityName={entityName}
          invoiceAction={isFullyInvoiced ? undefined : 'createReturnInvoice'}
          defaultCreateInvoice={!isFullyInvoiced}
          rectifiableInvoicesUrl={rectifiableInvoicesUrl}
          token={token}
          title={confirmModalTitle}
          docInfo={{ bpName: data?.['businessPartner$_identifier'], documentNo: data?.documentNo }}
          infoRowPre={infoRowPre}
          infoRowBold={infoRowBold}
          infoRowPost={infoRowPost}
          cardTitle={cardTitleProp ?? ui('createReturnInvoice')}
          cardDesc={cardDescProp ?? ui('createReturnInvoiceDescription')}
          confirmLabel={confirmDrLabel}
          confirmWithInvoiceLabel={confirmWithInvoiceLabel}
          processingLabel={ui('processing')}
          cancelLabel={ui('cancel')}
          onConfirmed={({ invoice }) => {
            setShowModal(false);
            const r = buildInvoiceResultFromConfirm(invoice);
            // ETP-5333 follow-up — same partial-refresh pattern as below: when
            // confirming without creating an invoice there's no result modal to
            // show, so refresh the header directly instead of a full reload.
            if (r) setResult(r); else onRefresh?.();
          }}
          onClose={() => setShowModal(false)}
          data-testid="ConfirmInOutModal__f9608e" />
      )}
      {showModal && status === 'CO' && createPortal(
        <CreateInvoiceConfirmModal
          data={data}
          loading={creatingInvoice}
          token={token}
          rectifiableInvoicesUrl={rectifiableInvoicesUrl}
          onConfirm={(_priceListId, originInvoices) => handleCreateReturnInvoice(originInvoices)}
          onClose={() => setShowModal(false)}
          data-testid="CreateInvoiceConfirmModal__f9608e" />,
        document.body,
      )}
      {result && createPortal(
        <ConfirmResultModal
          title={result.title}
          docs={result.docs}
          currency={currency}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          primary={result.docs.length > 0 ? ui('soViewInvoice') : undefined}
          onClose={() => {
            setResult(null);
            setTimeout(() => {
              // ETP-5333 follow-up — same partial-refresh pattern as ETP-4779
              // (GoodsReceiptActions.jsx / GoodsShipmentActions.jsx): refetch the
              // header via onRefresh instead of a full page reload. Skipped when
              // the user navigated away instead of closing.
              if (!resultNavigatedRef.current) onRefresh?.();
              resultNavigatedRef.current = false;
            }, 0);
          }}
          data-testid="ConfirmResultModal__f9608e" />,
        document.body,
      )}
    </>
  );
}

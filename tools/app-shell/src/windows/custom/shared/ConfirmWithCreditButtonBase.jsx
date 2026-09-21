import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmResultModal } from '@/components/contract-ui/ConfirmResultModal';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { getButtonClass, getSaveBtnCls, maybeSaveBeforeConfirm } from '@/components/contract-ui/detailViewHelpers.jsx';
import { GateTooltip } from '@/components/contract-ui/saveActions.jsx';
import { useConfirmWithCredit } from './useConfirmWithCredit';

/**
 * ETP-5408 — the DR "Confirm" button is the same kind of action as the generic
 * positive AD process button DetailView renders for Facturas / Pedidos / Albaranes,
 * so it must look the same: shared `Button` + a `<Check>` icon. It was a hand-rolled
 * `<button>` with inline styles and no icon, which is the whole bug.
 *
 * Classes come from the same helpers DetailView uses (`getButtonClass` /
 * `getSaveBtnCls`, see DetailView.jsx's process-button map) rather than being
 * restated here, so a future restyle of the positive process button reaches this
 * button too. Both arguments are the values DetailView would pass for these windows:
 * `salesTheme` is undefined (neither return window declares one) and
 * `toolbarButtonSize` is DetailView's own default `'sm'` (neither window overrides
 * that prop). `p` is the positive-style process descriptor shape the helper reads.
 */
const CONFIRM_BTN_CLS = `${getButtonClass(undefined, { style: 'positive' }, true)} ${getSaveBtnCls('sm')}`.trim();

export default function ConfirmWithCreditButtonBase({
  data, recordId, token, apiBaseUrl,
  entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey,
  specName, entityName,
  onSave, isDirty, saveGate, onRefresh,
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
    ui, status, currency, confirmDisabled, hasReturnInvoice,
    headers, base, showModal, setShowModal,
    creatingInvoice, result, setResult,
    handleCreateReturnInvoice, buildInvoiceResultFromConfirm,
  } = useConfirmWithCredit({
    data, recordId, token, apiBaseUrl,
    entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey,
  });

  if (status !== 'DR' && status !== 'CO') return null;

  // ETP-4933: this button PERSISTS before it confirms (maybeSaveBeforeConfirm below),
  // so it must respect the same required-field rule as Save — otherwise Save being
  // blocked means nothing: Confirm would save the incomplete record and advance the
  // document. It inherits ONLY the required-field verdict, deliberately not the rest
  // of Save's disabled condition: `!isDirty` must NOT block here, because confirming
  // an already-saved, unmodified document is the normal path.
  const confirmBlocked = confirmDisabled || Boolean(saveGate?.blocked);

  const isFullyInvoiced = parseFloat(data?.invoiceStatus ?? 0) >= 100;

  return (
    <>
      {status === 'DR' && (
        // A blocked button that does not say why is the bug we already hit once, and the
        // shared `Button` carries `disabled:pointer-events-none`, so once `confirmBlocked`
        // is true the element gets no hover and its own `title` never fires. GateTooltip
        // (the very wrapper saveActions.jsx uses for Save/Confirm) restores it: the span is
        // never disabled, so it does receive the hover, and it is only inserted when there
        // IS a reason to explain — the DOM is unchanged on the normal path.
        <GateTooltip title={saveGate?.blocked ? saveGate.title : undefined} data-testid="GateTooltip__f9608e"><Button type="button" data-testid="action-confirm-with-credit"
          variant="default"
          size="default"
          className={CONFIRM_BTN_CLS}
          onClick={async () => {
            if (confirmBlocked) return;
            // ETP-4940 follow-up: this button fires its own documentAction POST
            // (inside ConfirmInOutModal) that never went through DetailView's
            // draftMode/kebab save-before-confirm guards — an edit made without
            // clicking Save first was silently discarded, confirming the
            // last-persisted value. Persist any pending edit before opening the
            // modal; abort on save failure (handleSave already surfaced the error).
            if (!(await maybeSaveBeforeConfirm({ isDirty, handleSave: onSave }))) return;
            setShowModal(true);
          }}
          disabled={confirmBlocked}
          title={saveGate?.blocked ? saveGate.title : undefined}>
          <Check size={16} className="mr-1" data-testid="Check__f9608e" />
          {confirmDrLabel}
        </Button></GateTooltip>
      )}
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
          onConfirm={handleCreateReturnInvoice}
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

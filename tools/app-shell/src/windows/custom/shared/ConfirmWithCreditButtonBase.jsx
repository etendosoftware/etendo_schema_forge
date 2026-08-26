import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ConfirmResultModal } from '@/components/contract-ui/ConfirmResultModal';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { maybeSaveBeforeConfirm } from '@/components/contract-ui/detailViewHelpers.jsx';
import { useConfirmWithCredit } from './useConfirmWithCredit';

export default function ConfirmWithCreditButtonBase({
  data, recordId, token, apiBaseUrl,
  entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey,
  specName, entityName,
  onSave, isDirty, saveGate,
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
    base, showModal, setShowModal,
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
        <button type="button" data-testid="action-confirm-with-credit"
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
          // A blocked button that does not say why is the bug we already hit once. This
          // is a plain <button>, not the shared one carrying `disabled:pointer-events-none`,
          // so the native title fires on hover without needing a wrapper element.
          title={saveGate?.blocked ? saveGate.title : undefined}
          style={{ fontSize: 14, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: confirmBlocked ? 'hsl(var(--text-disabled))' : 'hsl(var(--foreground))', color: 'hsl(var(--card))', border: 'none', cursor: confirmBlocked ? 'not-allowed' : 'pointer', lineHeight: 1.4, opacity: confirmBlocked ? 0.6 : 1 }}>
          {confirmDrLabel}
        </button>
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
            if (r) setResult(r); else window.location.reload();
          }}
          onClose={() => setShowModal(false)}
          data-testid="ConfirmInOutModal__f9608e" />
      )}
      {showModal && status === 'CO' && createPortal(
        <CreateInvoiceConfirmModal
          data={data}
          loading={creatingInvoice}
          onConfirm={() => { setShowModal(false); handleCreateReturnInvoice(); }}
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
              if (!resultNavigatedRef.current) window.location.reload();
              resultNavigatedRef.current = false;
            }, 0);
          }}
          data-testid="ConfirmResultModal__f9608e" />,
        document.body,
      )}
    </>
  );
}

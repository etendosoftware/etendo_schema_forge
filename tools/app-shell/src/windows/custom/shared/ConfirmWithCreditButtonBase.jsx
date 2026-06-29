import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ConfirmResultModal } from '@/components/contract-ui/ConfirmResultModal';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import { useConfirmWithCredit } from './useConfirmWithCredit';
import PrintButton from './PrintButton';

export default function ConfirmWithCreditButtonBase({
  data, recordId, token, apiBaseUrl,
  entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey,
  generatePdfFn, getPdfLabelsFn,
  specName, entityName,
  confirmDrLabel,
  confirmModalTitle, infoRowPre, infoRowBold, infoRowPost, confirmWithInvoiceLabel,
  cardTitle: cardTitleProp,
  cardDesc: cardDescProp,
  extraActions,
  extraPortals,
}) {
  const navigate = useNavigate();
  const resultNavigatedRef = useRef(false);
  const {
    ui, status, currency, confirmDisabled, hasReturnInvoice,
    headers, base, pdfLoading, showModal, setShowModal,
    creatingInvoice, result, setResult,
    handlePrint, handleCreateReturnInvoice, buildInvoiceResultFromConfirm,
  } = useConfirmWithCredit({
    data, recordId, token, apiBaseUrl,
    entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey,
    generatePdfFn, getPdfLabelsFn,
  });

  if (status !== 'DR' && status !== 'CO') return null;

  return (
    <>
      {status === 'DR' && (
        <button type="button" data-testid="action-confirm-with-credit"
          onClick={() => !confirmDisabled && setShowModal(true)}
          disabled={confirmDisabled}
          style={{ fontSize: 14, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: confirmDisabled ? '#9ca3af' : '#18181b', color: '#fff', border: 'none', cursor: confirmDisabled ? 'not-allowed' : 'pointer', lineHeight: 1.4, opacity: confirmDisabled ? 0.6 : 1 }}>
          {confirmDrLabel}
        </button>
      )}
      {status === 'CO' && !hasReturnInvoice && (
        <button type="button" data-testid="action-create-return-invoice" onClick={() => setShowModal(true)}
          style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#185FA5', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {ui('createReturnInvoice')}
        </button>
      )}
      {extraActions}
      <PrintButton
        onClick={handlePrint}
        loading={pdfLoading}
        data-testid="PrintButton__f9608e" />
      {extraPortals}
      {showModal && status === 'DR' && (
        <ConfirmInOutModal
          base={base}
          headers={headers}
          recordId={data?.id || recordId}
          specName={specName}
          entityName={entityName}
          invoiceAction="createReturnInvoice"
          defaultCreateInvoice={true}
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

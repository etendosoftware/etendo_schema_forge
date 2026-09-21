import { useUI } from '@/i18n';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';

/**
 * ETP-5378 — row-hover Confirmar for return-material-receipt, via useRowConfirmAction.
 *
 * Mirrors the DR-status branch of `ConfirmWithCreditButtonBase`'s own `ConfirmInOutModal`
 * call — the exact popup the form shows on this same window
 * (`return-material-receipt/ConfirmWithCreditButton.jsx`) — so confirming from the grid
 * behaves identically to confirming from the form, including the fully-invoiced degraded
 * mode: `invoiceAction` is left undefined once the receipt is already 100% invoiced, since
 * `createReturnInvoice` would have nothing left to invoice.
 */
export default function ReturnMaterialReceiptRowConfirmModal({ base, headers, recordId, data, onConfirmed, onClose }) {
  const ui = useUI();
  const isFullyInvoiced = parseFloat(data?.invoiceStatus ?? 0) >= 100;
  return (
    <ConfirmInOutModal
      base={base}
      headers={headers}
      recordId={recordId}
      specName="return-material-receipt"
      entityName="returnMaterialReceipt"
      invoiceAction={isFullyInvoiced ? undefined : 'createReturnInvoice'}
      defaultCreateInvoice={!isFullyInvoiced}
      title={ui('returnReceipt.confirmModal.title')}
      docInfo={{ bpName: data?.['businessPartner$_identifier'], documentNo: data?.documentNo }}
      infoRowPre={ui('returnReceipt.confirmModal.infoRowPre')}
      infoRowBold={ui('returnReceipt.confirmModal.infoRowBold')}
      infoRowPost={ui('returnReceipt.confirmModal.infoRowPost')}
      cardTitle={ui('returnReceipt.createRectificativeInvoice')}
      cardDesc={ui('returnReceipt.createRectificativeInvoiceDescription')}
      confirmLabel={ui('processReceipt')}
      confirmWithInvoiceLabel={ui('returnReceipt.confirmModal.confirmWithInvoice')}
      processingLabel={ui('processing')}
      cancelLabel={ui('cancel')}
      onConfirmed={onConfirmed}
      onClose={onClose}
      data-testid="ConfirmInOutModal__1f8f4b" />
  );
}

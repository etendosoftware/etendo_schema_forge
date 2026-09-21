import { useUI } from '@/i18n';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';

/**
 * ETP-5378 — row-hover Confirmar for return-to-vendor-shipment, via useRowConfirmAction.
 *
 * Mirrors the DR-status branch of `ConfirmWithCreditButtonBase`'s own `ConfirmInOutModal`
 * call — the exact popup the form shows on this same window
 * (`return-to-vendor-shipment/ConfirmWithCreditButton.jsx`) — so confirming from the grid
 * behaves identically to confirming from the form, including the fully-invoiced degraded
 * mode: `invoiceAction` is left undefined once the shipment is already 100% invoiced, since
 * `createReturnInvoice` would have nothing left to invoice.
 */
export default function ReturnToVendorShipmentRowConfirmModal({ base, headers, recordId, data, onConfirmed, onClose }) {
  const ui = useUI();
  const isFullyInvoiced = parseFloat(data?.invoiceStatus ?? 0) >= 100;
  return (
    <ConfirmInOutModal
      base={base}
      headers={headers}
      recordId={recordId}
      specName="return-to-vendor-shipment"
      entityName="returnToVendorShipment"
      invoiceAction={isFullyInvoiced ? undefined : 'createReturnInvoice'}
      defaultCreateInvoice={!isFullyInvoiced}
      title={ui('returnToVendor.confirmModal.title')}
      docInfo={{ bpName: data?.['businessPartner$_identifier'], documentNo: data?.documentNo }}
      infoRowPre={ui('returnToVendor.confirmModal.infoRowPre')}
      infoRowBold={ui('returnToVendor.confirmModal.infoRowBold')}
      infoRowPost={ui('returnToVendor.confirmModal.infoRowPost')}
      cardTitle={ui('returnToVendor.createCreditNote')}
      cardDesc={ui('returnToVendor.createCreditNoteDescription')}
      confirmLabel={ui('confirmReturn')}
      confirmWithInvoiceLabel={ui('returnToVendor.confirmModal.confirmWithInvoice')}
      processingLabel={ui('processing')}
      cancelLabel={ui('cancel')}
      onConfirmed={onConfirmed}
      onClose={onClose}
      data-testid="ConfirmInOutModal__44be16" />
  );
}

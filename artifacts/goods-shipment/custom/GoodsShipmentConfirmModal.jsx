import { useUI } from '@/i18n';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';

export default function GoodsShipmentConfirmModal({ base, headers, recordId, data, onConfirmed, onClose }) {
  const ui = useUI();
  return (
    <ConfirmInOutModal
      base={base}
      headers={headers}
      recordId={recordId}
      specName="goods-shipment"
      entityName="goodsShipment"
      invoiceAction="createDraftInvoice"
      defaultCreateInvoice={false}
      title={ui('goodsShipment.confirmModal.title')}
      docInfo={{
        documentNo: data?.documentNo,
        bpName: data?.['businessPartner$_identifier'],
      }}
      infoRowPre={ui('goodsShipment.confirmModal.infoRowPre')}
      infoRowBold={ui('goodsShipment.confirmModal.infoRowBold')}
      infoRowPost={ui('goodsShipment.confirmModal.infoRowPost')}
      cardTitle={ui('goodsShipment.confirmModal.createInvoiceTitle')}
      cardDesc={ui('goodsShipment.confirmModal.createInvoiceDesc')}
      confirmLabel={ui('goodsShipment.confirmModal.confirmBtn')}
      confirmWithInvoiceLabel={ui('goodsShipment.confirmModal.confirmWithInvoice')}
      processingLabel={ui('processing')}
      cancelLabel={ui('cancel')}
      onConfirmed={onConfirmed}
      onClose={onClose}
    />
  );
}

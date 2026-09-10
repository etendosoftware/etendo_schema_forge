import { useUI } from '@/i18n';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';

export default function GoodsShipmentConfirmModal({ base, recordId, data, onConfirmed, onClose }) {
  const ui = useUI();
  // ETP-4942 — a shipment with no linked sales order has no price list of its own
  // (createInvoiceHeaderFromShipment falls back to the Business Partner's default,
  // which is often unset), so the backend cannot always resolve a tariff on its
  // own. Reuse the same picker CreateInvoiceConfirmModal already shows on the
  // post-completion "Crear factura" button — required only when there is no
  // linked order to derive the price list from automatically.
  // ETP-5052 — QA found the picker always preselected the system-default price list
  // instead of the linked order's / Business Partner's own tariff. `resolvedPriceListId`
  // is computed server-side (GoodsShipmentHeaderHandler#enrichResolvedPriceList) with the
  // same priority as the real invoice-creation flow, and passed through so the picker
  // preselects the correct value instead of only the system default.
  const hasLinkedOrder = Array.isArray(data?.linkedOrders) && data.linkedOrders.length > 0;
  return (
    <ConfirmInOutModal
      base={base}
      recordId={recordId}
      specName="goods-shipment"
      entityName="goodsShipment"
      invoiceAction="createDraftInvoice"
      defaultCreateInvoice={true}
      showPriceListPicker
      isSOTrx
      hasLinkedOrder={hasLinkedOrder}
      defaultPriceListId={data?.resolvedPriceListId}
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

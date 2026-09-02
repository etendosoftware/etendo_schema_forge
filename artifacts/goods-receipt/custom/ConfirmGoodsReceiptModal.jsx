import { useUI } from '@/i18n';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';

export default function ConfirmGoodsReceiptModal({ data, base, recordId, onConfirmed, onClose }) {
  const ui = useUI();
  // ETP-4942 — same bug as goods-shipment (see GoodsShipmentConfirmModal), on the
  // purchase side: a receipt with no linked purchase order has no price list of its
  // own, and the Business Partner's purchase tariff is often unset, so the backend
  // cannot always resolve one on its own. Reuse the same picker
  // CreateInvoiceConfirmModal already shows on the post-completion "Crear Factura"
  // button (ETP-4028) — required only when there is no linked order to derive the
  // price list from automatically. `resolvedPriceListId` is computed server-side
  // (GoodsReceiptHeaderHandler#enrichResolvedPriceList) with the same priority as
  // the real invoice-creation flow (CreatePurchaseInvoiceHandler#createFromReceiptNoPo),
  // so the picker preselects the correct value instead of only the system default.
  const hasLinkedOrder = Array.isArray(data?.linkedOrders) && data.linkedOrders.length > 0;
  return (
    <ConfirmInOutModal
      base={base}
      recordId={recordId}
      specName="goods-receipt"
      entityName="goodsReceipt"
      invoiceAction="createPurchaseInvoice"
      defaultCreateInvoice={true}
      showPriceListPicker
      isSOTrx={false}
      hasLinkedOrder={hasLinkedOrder}
      defaultPriceListId={data?.resolvedPriceListId}
      title={ui('goodsReceipt.confirmModal.title')}
      docInfo={{
        documentNo: data?.documentNo,
        bpName: data?.['businessPartner$_identifier'],
        total: data?.grandTotalAmount,
        currency: data?.['currency$_identifier'],
      }}
      infoRowPre={ui('goodsReceipt.confirmModal.infoRowPre')}
      infoRowBold={ui('goodsReceipt.confirmModal.infoRowBold')}
      infoRowPost={ui('goodsReceipt.confirmModal.infoRowPost')}
      cardTitle={ui('goodsReceipt.confirmModal.createInvoiceTitle')}
      cardDesc={ui('goodsReceipt.confirmModal.createInvoiceDesc')}
      confirmLabel={ui('goodsReceipt.confirmModal.titleConfirm')}
      confirmWithInvoiceLabel={ui('goodsReceipt.confirmModal.confirmWithInvoice')}
      processingLabel={ui('processing')}
      cancelLabel={ui('cancel')}
      onConfirmed={onConfirmed}
      onClose={onClose}
    />
  );
}

import { useUI } from '@/i18n';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';

export default function ConfirmGoodsReceiptModal({ data, base, headers, recordId, onConfirmed, onClose }) {
  const ui = useUI();
  return (
    <ConfirmInOutModal
      base={base}
      headers={headers}
      recordId={recordId}
      specName="goods-receipt"
      entityName="goodsReceipt"
      invoiceAction="createPurchaseInvoice"
      defaultCreateInvoice={true}
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

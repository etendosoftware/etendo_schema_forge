import CreateReturnWizard from '@/components/contract-ui/CreateReturnWizard';

export default function PurchaseReturnWizard({ receiptData, ...props }) {
  return (
    <CreateReturnWizard
      {...props}
      sourceData={receiptData}
      titleKey="createReturnFromReceipt"
      refLabelKey="receiptRef"
      docTypeLabelKey="purchaseReturnReceipt"
      docTypeDescriptionKey="returnStockToVendor"
      createActionUrl={(base, id) => `${base}/goods-receipt/goodsReceipt/${id}/action/createPurchaseReturn`}
    />
  );
}

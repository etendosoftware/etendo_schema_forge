import CreateReturnWizard from '@/components/contract-ui/CreateReturnWizard';

export default function ReturnWizard({ shipmentData, ...props }) {
  return (
    <CreateReturnWizard
      {...props}
      sourceData={shipmentData}
      titleKey="createReturnFromShipment"
      refLabelKey="shipmentRef"
      createActionUrl={(base, id) => `${base}/goods-shipment/goodsShipment/${id}/action/createReturn`}
    />
  );
}

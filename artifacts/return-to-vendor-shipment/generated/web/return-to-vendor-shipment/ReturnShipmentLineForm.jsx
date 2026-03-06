import { EntityForm } from '@/components/contract-ui';

const fields = [
  { key: 'product', label: 'Product', type: 'search', required: true, reference: 'Product', inputMode: 'search' },
  { key: 'movementQty', label: 'Movement Qty', type: 'number', required: true },
  { key: 'locator', label: 'Locator', type: 'selector', required: true, reference: 'Locator', inputMode: 'selector' },
  { key: 'lineNo', label: 'Line No', type: 'number', required: true },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'returnOrderLine', label: 'Return Order Line', type: 'dependent', reference: 'PurchaseOrderLine', inputMode: 'dependent', dependsOn: { field: 'returnShipment.orderReference', filterKey: 'cOrderId' } },
  { key: 'rmaLine', label: 'Rma Line', type: 'dependent', reference: 'ReturnMaterialAuthorizationLine', inputMode: 'dependent', dependsOn: { field: 'returnShipment.returnReason', filterKey: 'mRmaId' } },
];

export default function ReturnShipmentLineForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

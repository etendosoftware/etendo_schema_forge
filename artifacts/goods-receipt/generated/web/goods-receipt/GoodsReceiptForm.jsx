import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:goodsReceipt
const fields = [
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', required: true, section: 'principal', reference: 'BusinessPartner', inputMode: 'search', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'orderReference', column: 'POReference', type: 'text', label: 'Order Reference', section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'movementDate', column: 'MovementDate', type: 'date', label: 'Movement Date', required: true, section: 'principal', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse', required: true, section: 'principal', reference: 'Warehouse', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === true },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'collapsed', readOnlyLogic: (record) => record['processed'] === true },
];
// @sf-generated-end fields:goodsReceipt

// @sf-generated-start component:GoodsReceiptForm
export default function GoodsReceiptForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
GoodsReceiptForm.hasCollapsedFields = true;

// @sf-generated-end component:GoodsReceiptForm

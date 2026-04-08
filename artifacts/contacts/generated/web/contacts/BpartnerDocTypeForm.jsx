import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpartnerDocType
const fields = [
  // @sf-custom-slot callout:BusinessPartnerDocTypeValidation
  { key: 'documentcategory', column: 'Documentcategory', type: 'select', label: 'Document category', required: true, section: 'principal', options: [{ value: 'ORD', label: 'Order' }, { value: 'INV', label: 'Invoice' }, { value: 'SHIP', label: 'Shipment/Receipt' }] },
  // @sf-custom-slot callout:BusinessPartnerDocTypeValidation
  { key: 'issotrx', column: 'Issotrx', type: 'checkbox', label: 'Sales Transaction', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'cDoctypeID', column: 'C_Doctype_ID', type: 'selector', label: 'Document type', required: true, section: 'principal', reference: 'DocType', inputMode: 'selector' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal', defaultValue: 'Y' },
];
// @sf-generated-end fields:bpartnerDocType

// @sf-generated-start component:BpartnerDocTypeForm
export default function BpartnerDocTypeForm(props) {
  // @sf-custom-slot hooks:BpartnerDocTypeForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BpartnerDocTypeForm

// @sf-custom-slot section:BpartnerDocTypeForm-custom

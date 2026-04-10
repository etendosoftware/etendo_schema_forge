import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:documentType
const fields = [
  // @sf-custom-slot callout:BusinessPartnerDocTypeValidation
  { key: 'documentcategory', column: 'Documentcategory', type: 'select', label: 'Document category', required: true, section: 'principal', options: [{ value: 'ORD', label: 'Order' }, { value: 'INV', label: 'Invoice' }, { value: 'SHIP', label: 'Shipment/Receipt' }] },
  // @sf-custom-slot callout:BusinessPartnerDocTypeValidation
  { key: 'issotrx', column: 'Issotrx', type: 'checkbox', label: 'Sales Transaction', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'cDoctypeID', column: 'C_Doctype_ID', type: 'selector', label: 'Document type', required: true, section: 'principal', reference: 'DocType', inputMode: 'selector' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'principal', defaultValue: 'Y' },
];
// @sf-generated-end fields:documentType

// @sf-generated-start component:DocumentTypeForm
export default function DocumentTypeForm(props) {
  // @sf-custom-slot hooks:DocumentTypeForm
  return <EntityForm fields={fields} {...props} />;
}
DocumentTypeForm.hasCollapsedFields = false;
// @sf-generated-end component:DocumentTypeForm

// @sf-custom-slot section:DocumentTypeForm-custom

import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:relatedServices
const fields = [
  { key: 'documentNo', column: 'documentNo', type: 'text', readOnly: true, section: 'other' },
  { key: 'lineNo', column: 'lineNo', type: 'number', readOnly: true, section: 'other' },
  { key: 'product', column: 'product', type: 'search', required: true, readOnly: true, section: 'other', reference: 'Product', inputMode: 'search' },
  { key: 'attributeSetValue', column: 'attributeSetValue', type: 'text', readOnly: true, section: 'other' },
  { key: 'amount', column: 'amount', type: 'number', required: true, readOnly: true, section: 'other' },
  { key: 'quantity', column: 'quantity', type: 'text', required: true, readOnly: true, section: 'other' },
];
// @sf-generated-end fields:relatedServices

// @sf-generated-start component:RelatedServicesForm
export default function RelatedServicesForm(props) {
  // @sf-custom-slot hooks:RelatedServicesForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:RelatedServicesForm

// @sf-custom-slot section:RelatedServicesForm-custom

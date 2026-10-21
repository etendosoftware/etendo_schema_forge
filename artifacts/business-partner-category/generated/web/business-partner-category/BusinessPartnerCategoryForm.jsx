import { EntityForm } from '@/components/contract-ui';
import ContactTypeField from '../../../custom/ContactTypeField';

// @sf-generated-start fields:businessPartnerCategory
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal', maxLength: 40 },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', maxLength: 60 },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', required: true, section: 'principal' },
  { key: 'etgoIscustomer', column: 'EM_Etgo_Iscustomer', type: 'checkbox', label: 'Customer', required: true, section: 'principal', span: 4, customRenderer: ContactTypeField },
];
// @sf-generated-end fields:businessPartnerCategory

// @sf-generated-start component:BusinessPartnerCategoryForm
export default function BusinessPartnerCategoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
BusinessPartnerCategoryForm.fields = fields;

// @sf-generated-end component:BusinessPartnerCategoryForm

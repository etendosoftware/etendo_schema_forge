import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:businessPartnerCategory
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal', maxLength: 40 },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', maxLength: 60 },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', maxLength: 255, span: 2, rows: 1 },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', required: true, section: 'principal' },
];
// @sf-generated-end fields:businessPartnerCategory

// @sf-generated-start component:BusinessPartnerCategoryForm
export default function BusinessPartnerCategoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
BusinessPartnerCategoryForm.fields = fields;

// @sf-generated-end component:BusinessPartnerCategoryForm

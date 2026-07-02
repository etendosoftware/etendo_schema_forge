import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:businessPartnerCategory
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal', span: 2, rows: 1 },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', required: true, section: 'principal' },
];
// @sf-generated-end fields:businessPartnerCategory

// @sf-generated-start component:BusinessPartnerCategoryForm
export default function BusinessPartnerCategoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:BusinessPartnerCategoryForm

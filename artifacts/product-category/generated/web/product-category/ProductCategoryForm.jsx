import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:productCategory
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', required: true, section: 'principal' },
  { key: 'summaryLevel', column: 'Issummary', type: 'checkbox', label: 'Summary Level', required: true, section: 'principal', defaultValue: 'N' },
  { key: 'image', column: 'AD_Image_ID', type: 'image', label: 'Image', section: 'other' },
];
// @sf-generated-end fields:productCategory

// @sf-generated-start component:ProductCategoryForm
export default function ProductCategoryForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:ProductCategoryForm

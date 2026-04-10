import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:assets
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, section: 'principal' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal' },
  { key: 'assetCategory', column: 'A_Asset_Group_ID', type: 'selector', label: 'Asset Category', required: true, section: 'principal', reference: 'AssetGroup', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'principal' },
];
// @sf-generated-end fields:assets

// @sf-generated-start component:AssetsForm
export default function AssetsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
AssetsForm.hasCollapsedFields = false;
// @sf-generated-end component:AssetsForm

import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:assets
const fields = [
  { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', section: 'principal', reference: 'Product', inputMode: 'search' },
  { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', section: 'principal', reference: 'Project', inputMode: 'search', visible: null, visibilitySource: 'server', displayLogicReason: 'accounting-dimension' },
];
// @sf-generated-end fields:assets

// @sf-generated-start component:AssetsForm
export default function AssetsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AssetsForm

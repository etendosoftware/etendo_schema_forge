import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:assignedProducts
const fields = [
  { key: 'searchKey', column: 'Value', type: 'text', label: 'Search Key', required: true, readOnly: true, section: 'other' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, readOnly: true, section: 'other' },
  { key: 'productType', column: 'ProductType', type: 'select', label: 'Product Type', required: true, readOnly: true, section: 'other', options: [{ value: 'E', label: 'Expense type' }, { value: 'I', label: 'Item' }, { value: 'R', label: 'Resource' }, { value: 'S', label: 'Service' }], defaultValue: 'I' },
];
// @sf-generated-end fields:assignedProducts

// @sf-generated-start component:AssignedProductsForm
export default function AssignedProductsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:AssignedProductsForm

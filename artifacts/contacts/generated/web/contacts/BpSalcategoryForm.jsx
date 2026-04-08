import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpSalcategory
const fields = [
  { key: 'startingDate', column: 'Datefrom', type: 'date', label: 'Starting Date', required: true, section: 'principal' },
  { key: 'salaryCategory', column: 'C_Salary_Category_ID', type: 'selector', label: 'Cost Salary Category', required: true, section: 'principal', reference: 'Salary_Category', inputMode: 'selector' },
];
// @sf-generated-end fields:bpSalcategory

// @sf-generated-start component:BpSalcategoryForm
export default function BpSalcategoryForm(props) {
  // @sf-custom-slot hooks:BpSalcategoryForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BpSalcategoryForm

// @sf-custom-slot section:BpSalcategoryForm-custom

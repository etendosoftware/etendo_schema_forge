import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:costSalaryCategory
const fields = [
  { key: 'startingDate', column: 'Datefrom', type: 'date', label: 'Starting Date', required: true, section: 'principal' },
  { key: 'salaryCategory', column: 'C_Salary_Category_ID', type: 'selector', label: 'Cost Salary Category', required: true, section: 'principal', reference: 'Salary_Category', inputMode: 'selector' },
];
// @sf-generated-end fields:costSalaryCategory

// @sf-generated-start component:CostSalaryCategoryForm
export default function CostSalaryCategoryForm(props) {
  // @sf-custom-slot hooks:CostSalaryCategoryForm
  return <EntityForm fields={fields} {...props} />;
}
CostSalaryCategoryForm.hasCollapsedFields = false;
// @sf-generated-end component:CostSalaryCategoryForm

// @sf-custom-slot section:CostSalaryCategoryForm-custom

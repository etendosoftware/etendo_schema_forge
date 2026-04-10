import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:employee
const fields = [
  { key: 'employee', column: 'IsEmployee', type: 'checkbox', label: 'Employee', required: true, section: 'principal' },
  { key: 'isSalesRepresentative', column: 'IsSalesRep', type: 'checkbox', label: 'Is Sales Representative', required: true, section: 'principal' },
  { key: 'operator', column: 'Isworker', type: 'checkbox', label: 'Operator', section: 'principal', defaultValue: 'N' },
  { key: 'salaryCategory', column: 'C_Salary_Category_ID', type: 'selector', label: 'Current Salary Category', readOnly: true, section: 'other', reference: 'Salary_Category', inputMode: 'selector' },
];
// @sf-generated-end fields:employee

// @sf-generated-start component:EmployeeForm
export default function EmployeeForm(props) {
  // @sf-custom-slot hooks:EmployeeForm
  return <EntityForm fields={fields} {...props} />;
}
EmployeeForm.hasCollapsedFields = false;
// @sf-generated-end component:EmployeeForm

// @sf-custom-slot section:EmployeeForm-custom

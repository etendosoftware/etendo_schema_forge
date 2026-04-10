import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:employeeAccounting
const fields = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', label: 'General Ledger', required: true, readOnly: true, section: 'other', reference: 'AcctSchema', inputMode: 'selector' },
];
// @sf-generated-end fields:employeeAccounting

// @sf-generated-start component:EmployeeAccountingForm
export default function EmployeeAccountingForm(props) {
  // @sf-custom-slot hooks:EmployeeAccountingForm
  return <EntityForm fields={fields} {...props} />;
}
EmployeeAccountingForm.hasCollapsedFields = false;
// @sf-generated-end component:EmployeeAccountingForm

// @sf-custom-slot section:EmployeeAccountingForm-custom

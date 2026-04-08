import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:bpEmployeeAcct
const fields = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', label: 'General Ledger', required: true, readOnly: true, section: 'other', reference: 'AcctSchema', inputMode: 'selector' },
];
// @sf-generated-end fields:bpEmployeeAcct

// @sf-generated-start component:BpEmployeeAcctForm
export default function BpEmployeeAcctForm(props) {
  // @sf-custom-slot hooks:BpEmployeeAcctForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:BpEmployeeAcctForm

// @sf-custom-slot section:BpEmployeeAcctForm-custom

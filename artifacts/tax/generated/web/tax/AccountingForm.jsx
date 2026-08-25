import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'taxDue', column: 'T_Due_Acct', type: 'selector', label: 'Tax Due', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'taxCredit', column: 'T_Credit_Acct', type: 'selector', label: 'Tax Credit', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
AccountingForm.fields = fields;

// @sf-generated-end component:AccountingForm

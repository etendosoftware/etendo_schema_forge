import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:customerAccounting
const fields = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', label: 'General Ledger', required: true, readOnly: true, section: 'other', reference: 'AcctSchema', inputMode: 'selector' },
  { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', type: 'selector', label: 'Customer Receivables No.', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'customerPrepayment', column: 'C_Prepayment_Acct', type: 'selector', label: 'Customer Prepayment', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:customerAccounting

// @sf-generated-start component:CustomerAccountingForm
export default function CustomerAccountingForm(props) {
  // @sf-custom-slot hooks:CustomerAccountingForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:CustomerAccountingForm

// @sf-custom-slot section:CustomerAccountingForm-custom

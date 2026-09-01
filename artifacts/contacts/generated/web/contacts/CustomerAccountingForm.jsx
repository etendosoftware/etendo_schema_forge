import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:customerAccounting
const fields = [
  { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', type: 'selector', labels: {"en_US":"Receivables Account","es_ES":"Cuenta a Cobrar"}, label: 'Customer Receivables No.', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'customerPrepayment', column: 'C_Prepayment_Acct', type: 'selector', labels: {"en_US":"Prepayment Account","es_ES":"Cuenta de Anticipos"}, label: 'Customer Prepayment', section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:customerAccounting

// @sf-generated-start component:CustomerAccountingForm
export default function CustomerAccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
CustomerAccountingForm.fields = fields;

// @sf-generated-end component:CustomerAccountingForm

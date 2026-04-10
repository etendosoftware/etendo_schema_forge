import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', label: 'General Ledger', required: true, readOnly: true, section: 'other', reference: 'AcctSchema', inputMode: 'selector' },
  { key: 'warehouseDifferences', column: 'W_Differences_Acct', type: 'selector', label: 'Warehouse Differences', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  // @sf-custom-slot hooks:AccountingForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:AccountingForm

// @sf-custom-slot section:AccountingForm-custom

import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'warehouseDifferences', column: 'W_Differences_Acct', type: 'selector', label: 'Warehouse Differences', required: true, lookup: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
AccountingForm.fields = fields;

// @sf-generated-end component:AccountingForm

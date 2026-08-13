import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:accounting
const fields = [
  { key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', label: 'Product Asset', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productExpense', column: 'P_Expense_Acct', type: 'selector', label: 'Product Expense', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productRevenue', column: 'P_Revenue_Acct', type: 'selector', label: 'Product Revenue', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
  { key: 'productCOGS', column: 'P_Cogs_Acct', type: 'selector', label: 'Product COGS', required: true, section: 'principal', reference: 'ValidCombination', inputMode: 'selector' },
];
// @sf-generated-end fields:accounting

// @sf-generated-start component:AccountingForm
export default function AccountingForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:AccountingForm

import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:transactionAdjustments
const fields = [
  { key: 'costDate', column: 'CostDate', type: 'date', label: 'Cost Date', required: true, section: 'principal' },
  { key: 'cost', column: 'Cost', type: 'number', label: 'Cost', required: true, section: 'principal' },
  { key: 'cCurrencyID', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector' },
  { key: 'costAdjustmentLine', column: 'M_Costadjustmentline_ID', type: 'selector', label: 'Cost Adjustment Line', section: 'principal', reference: 'Costadjustmentline', inputMode: 'selector' },
  { key: 'unitCost', column: 'IsUnitCost', type: 'checkbox', label: 'Unit Cost', required: true, section: 'other', defaultValue: 'Y' },
  { key: 'accountingDate', column: 'DateAcct', type: 'date', label: 'Accounting Date', required: true, section: 'other' },
];
// @sf-generated-end fields:transactionAdjustments

// @sf-generated-start component:TransactionAdjustmentsForm
export default function TransactionAdjustmentsForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:TransactionAdjustmentsForm

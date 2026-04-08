import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:costing
const fields = [
  { key: 'costType', column: 'Costtype', type: 'select', required: true, readOnly: true, section: 'other', options: [{ value: 'AVA', label: 'Average' }, { value: 'STA', label: 'Standard' }] },
  { key: 'cost', column: 'Cost', type: 'text', readOnly: true, section: 'other' },
  { key: 'startingDate', column: 'DateFrom', type: 'date', required: true, readOnly: true, section: 'other' },
  { key: 'endingDate', column: 'DateTo', type: 'date', required: true, readOnly: true, section: 'other' },
  { key: 'quantity', column: 'Qty', type: 'text', readOnly: true, section: 'other' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', readOnly: true, section: 'other', reference: 'Warehouse', inputMode: 'selector' },
  { key: 'cCurrencyID', column: 'C_Currency_ID', type: 'selector', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '100' },
  { key: 'originalCost', column: 'Originalcost', type: 'text', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:costing

// @sf-generated-start component:CostingForm
export default function CostingForm(props) {
  // @sf-custom-slot hooks:CostingForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:CostingForm

// @sf-custom-slot section:CostingForm-custom

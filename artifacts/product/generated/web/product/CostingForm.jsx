import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:costing
const fields = [
  { key: 'costType', column: 'Costtype', type: 'select', label: 'Cost Type', required: true, readOnly: true, section: 'other', options: [{ value: 'AVA', label: 'Average' }, { value: 'STA', label: 'Standard' }] },
  { key: 'cost', column: 'Cost', type: 'number', label: 'Cost', readOnly: true, section: 'other' },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date', required: true, readOnly: true, section: 'other' },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date', required: true, readOnly: true, section: 'other' },
  { key: 'quantity', column: 'Qty', type: 'number', label: 'Quantity', readOnly: true, section: 'other' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector', label: 'Warehouse', readOnly: true, section: 'other', reference: 'Warehouse', inputMode: 'selector' },
  { key: 'cCurrencyID', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '100' },
  { key: 'originalCost', column: 'Originalcost', type: 'number', label: 'Original Cost', readOnly: true, section: 'other' },
];
// @sf-generated-end fields:costing

// @sf-generated-start component:CostingForm
export default function CostingForm(props) {
  // @sf-custom-slot hooks:CostingForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:CostingForm

// @sf-custom-slot section:CostingForm-custom

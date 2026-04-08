import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:landedCost
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', required: true, section: 'principal' },
  // @sf-custom-slot callout:SL_LandedCost_Cost_Type
  { key: 'landedCostType', column: 'M_Lc_Type_ID', type: 'selector', required: true, section: 'principal', reference: 'LandedCostType', inputMode: 'selector' },
  // @sf-custom-slot callout:SL_LandedCost_InvoiceLine
  { key: 'invoiceLine', column: 'C_Invoiceline_ID', type: 'selector', section: 'principal', reference: 'InvoiceLine', inputMode: 'selector' },
  { key: 'amount', column: 'Amount', type: 'text', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', required: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'landedCostDistributionAlgorithm', column: 'M_Lc_Distribution_Alg_ID', type: 'selector', required: true, section: 'other', reference: 'LandedCostDistributionAlgorithm', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', section: 'other' },
  { key: 'landedCost', column: 'M_Landedcost_ID', type: 'selector', readOnly: true, section: 'other', reference: 'LandedCost', inputMode: 'selector' },
  { key: 'matched', column: 'IsMatched', type: 'checkbox', required: true, readOnly: true, section: 'other' },
  { key: 'isMatchingAdjusted', column: 'IsMatchingAdjusted', type: 'checkbox', required: true, section: 'other' },
  { key: 'matchingAmount', column: 'Matching_Amt', type: 'number', readOnly: true, section: 'other' },
  { key: 'matchingCostAdjustment', column: 'Matching_Costadjustment_ID', type: 'selector', readOnly: true, section: 'other', reference: 'CostAdjustment', inputMode: 'selector' },
];
// @sf-generated-end fields:landedCost

// @sf-generated-start component:LandedCostForm
export default function LandedCostForm(props) {
  // @sf-custom-slot hooks:LandedCostForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:LandedCostForm

// @sf-custom-slot section:LandedCostForm-custom

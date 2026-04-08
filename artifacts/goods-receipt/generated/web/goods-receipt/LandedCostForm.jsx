import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:landedCost
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', required: true, section: 'principal', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM M_LC_COST\n WHERE (m_landedcost_id is not null and m_landedcost_id =@m_landedcost_id@) \n   or (m_landedcost_id is null and m_inout_id = @m_inout_id@)' },
  // @sf-custom-slot callout:SL_LandedCost_Cost_Type
  { key: 'landedCostType', column: 'M_Lc_Type_ID', type: 'selector', label: 'Landed Cost Type', required: true, section: 'principal', reference: 'LandedCostType', inputMode: 'selector' },
  // @sf-custom-slot callout:SL_LandedCost_InvoiceLine
  { key: 'invoiceLine', column: 'C_Invoiceline_ID', type: 'selector', label: 'Invoice Line', section: 'principal', reference: 'InvoiceLine', inputMode: 'selector' },
  { key: 'amount', column: 'Amount', type: 'number', label: 'Amount', required: true, section: 'principal' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'other', reference: 'Currency', inputMode: 'selector' },
  { key: 'landedCostDistributionAlgorithm', column: 'M_Lc_Distribution_Alg_ID', type: 'selector', label: 'Landed Cost Distribution Algorithm', required: true, section: 'other', reference: 'LandedCostDistributionAlgorithm', inputMode: 'selector' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'other' },
  { key: 'landedCost', column: 'M_Landedcost_ID', type: 'selector', label: 'Landed Cost', readOnly: true, section: 'other', reference: 'LandedCost', inputMode: 'selector' },
  { key: 'matched', column: 'IsMatched', type: 'checkbox', label: 'Matched', required: true, readOnly: true, section: 'other', defaultValue: 'N' },
  { key: 'isMatchingAdjusted', column: 'IsMatchingAdjusted', type: 'checkbox', label: 'Is Matching adjusted', required: true, section: 'other', defaultValue: 'N' },
  { key: 'matchingAmount', column: 'Matching_Amt', type: 'number', label: 'Matching Amount', readOnly: true, section: 'other' },
  { key: 'matchingCostAdjustment', column: 'Matching_Costadjustment_ID', type: 'selector', label: 'Matching Cost Adjustment', readOnly: true, section: 'other', reference: 'CostAdjustment', inputMode: 'selector' },
];
// @sf-generated-end fields:landedCost

// @sf-generated-start component:LandedCostForm
export default function LandedCostForm(props) {
  // @sf-custom-slot hooks:LandedCostForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:LandedCostForm

// @sf-custom-slot section:LandedCostForm-custom

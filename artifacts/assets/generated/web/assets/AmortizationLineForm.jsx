import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:amortizationLine
const fields = [
  { key: 'sEQNoAsset', column: 'SEQ_No_Asset', type: 'number', label: 'Line No.', readOnly: true, section: 'other', defaultValue: '@SQL=SELECT COALESCE(MAX(SEQ_No_Asset),0)+10 AS DefaultValue FROM A_AMORTIZATIONLINE WHERE A_ASSET_ID=@A_ASSET_ID@' },
  { key: 'amortization', column: 'A_Amortization_ID', type: 'search', label: 'Amortization', readOnly: true, section: 'other', reference: 'Amortization', inputMode: 'search' },
  { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', label: 'Amortization Percentage', section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', label: 'Amortization Amount', section: 'principal', readOnlyLogic: (record) => record['processed'] === 'Y' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', section: 'principal', reference: 'Currency', inputMode: 'selector', readOnlyLogic: (record) => record['processed'] === 'Y' },
];
// @sf-generated-end fields:amortizationLine

// @sf-generated-start component:AmortizationLineForm
export default function AmortizationLineForm(props) {
  // @sf-custom-slot hooks:AmortizationLineForm
  return <EntityForm fields={fields} {...props} />;
}
// @sf-generated-end component:AmortizationLineForm

// @sf-custom-slot section:AmortizationLineForm-custom

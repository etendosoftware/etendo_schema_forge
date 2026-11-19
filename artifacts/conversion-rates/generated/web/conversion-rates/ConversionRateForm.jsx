import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:conversionRate
const fields = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, readOnly: true, section: 'other', reference: 'Currency', inputMode: 'selector', defaultValue: '@SQL=SELECT C_CURRENCY_ID FROM AD_CLIENT  WHERE AD_CLIENT_ID = @AD_CLIENT_ID@' },
  { key: 'toCurrency', column: 'C_Currency_ID_To', type: 'selector', label: 'To Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', defaultValue: '@SQL=SELECT C_CURRENCY_ID FROM AD_CLIENT  WHERE AD_CLIENT_ID = @AD_CLIENT_ID@', readOnlyLogic: (record) => !!record.id || record.sMFCRSynced === true },
  { key: 'validFromDate', column: 'ValidFrom', type: 'text', label: 'Valid From Date', required: true, section: 'principal', maxLength: 19, readOnlyLogic: (record) => !!record.id || record.sMFCRSynced === true },
  { key: 'validToDate', column: 'ValidTo', type: 'text', label: 'Valid To Date', readOnly: true, section: 'other', maxLength: 19 },
  { key: 'multipleRateBy', column: 'MultiplyRate', type: 'number', label: 'Multiple Rate By', required: true, section: 'principal', readOnlyLogic: (record) => (record['sMFCRSynced'] === true || record['sMFCRSynced'] === 'Y') },
  { key: 'divideRateBy', column: 'DivideRate', type: 'number', label: 'Divide Rate By', required: true, readOnly: true, section: 'other' },
  { key: 'sMFCRSynced', column: 'EM_SMFCR_Is_Synced', type: 'checkbox', label: 'Synced', readOnly: true, section: 'principal' },
  { key: 'etgoRateStatus', column: 'EM_Etgo_Rate_Status', type: 'select', label: 'Status', readOnly: true, section: 'other', options: [{ value: 'CURRENT', label: 'Current', labels: {"es_ES":"Current"} }, { value: 'HISTORIC', label: 'Historic', labels: {"es_ES":"Historic"} }] },
];
// @sf-generated-end fields:conversionRate

// @sf-generated-start component:ConversionRateForm
export default function ConversionRateForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
ConversionRateForm.fields = fields;

// @sf-generated-end component:ConversionRateForm

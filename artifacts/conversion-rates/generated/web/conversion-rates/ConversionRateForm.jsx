import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:conversionRate
const fields = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', defaultValue: '@SQL=SELECT C_CURRENCY_ID FROM AD_CLIENT  WHERE AD_CLIENT_ID = @AD_CLIENT_ID@', readOnlyLogic: (record) => record['sMFCRSynced'] === true },
  { key: 'toCurrency', column: 'C_Currency_ID_To', type: 'selector', label: 'To Currency', required: true, section: 'principal', reference: 'Currency', inputMode: 'selector', defaultValue: '@SQL=SELECT C_CURRENCY_ID FROM AD_CLIENT  WHERE AD_CLIENT_ID = @AD_CLIENT_ID@', readOnlyLogic: (record) => record['sMFCRSynced'] === true },
  { key: 'validFromDate', column: 'ValidFrom', type: 'date', label: 'Valid From Date', required: true, section: 'principal', readOnlyLogic: (record) => record['sMFCRSynced'] === true },
  { key: 'validToDate', column: 'ValidTo', type: 'date', label: 'Valid To Date', section: 'principal', readOnlyLogic: (record) => record['sMFCRSynced'] === true },
  { key: 'multipleRateBy', column: 'MultiplyRate', type: 'text', label: 'Multiple Rate By', required: true, section: 'other', readOnlyLogic: (record) => record['sMFCRSynced'] === true },
  { key: 'divideRateBy', column: 'DivideRate', type: 'text', label: 'Divide Rate By', required: true, section: 'other', readOnlyLogic: (record) => record['sMFCRSynced'] === true },
  { key: 'sMFCRSynced', column: 'EM_SMFCR_Is_Synced', type: 'checkbox', label: 'Synced', readOnly: true, section: 'principal' },
];
// @sf-generated-end fields:conversionRate

// @sf-generated-start component:ConversionRateForm
export default function ConversionRateForm(props) {
  return <EntityForm fields={fields} {...props} />;
}

// @sf-generated-end component:ConversionRateForm

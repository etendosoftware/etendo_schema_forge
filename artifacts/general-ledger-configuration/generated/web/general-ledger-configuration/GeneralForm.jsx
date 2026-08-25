import { EntityForm } from '@/components/contract-ui';

// @sf-generated-start fields:General
const fields = [
  { key: 'organization', column: 'AD_Org_ID', type: 'selector', label: 'Organization', required: true, readOnly: true, section: 'identity', reference: 'Org', inputMode: 'selector', defaultValue: '@AD_Org_ID@' },
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'identity' },
  { key: 'description', column: 'Description', type: 'textarea', label: 'Description', section: 'identity' },
  { key: 'gAAP', column: 'GAAP', type: 'select', label: 'Accounting Standard', required: true, section: 'identity', options: [{ value: 'FR', label: 'French Accounting Standard', labels: {"es_ES":"Contabilidad francesa"} }, { value: 'DE', label: 'German HGB', labels: {"es_ES":"HGB alemán"} }, { value: 'IF', label: 'IFRS', labels: {"es_ES":"NIIF"} }, { value: 'SA', label: 'Spanish Accounting Standard', labels: {"es_ES":"Contablididad Estándar Española"} }, { value: 'US', label: 'US GAAP', labels: {"es_ES":"GAAP US"} }, { value: 'XX', label: 'Custom', labels: {"es_ES":"Personalizar reglas de contabilidad"} }, { value: 'OT', label: 'Other', labels: {"es_ES":"Otro"} }], defaultValue: 'OT' },
  { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', required: true, section: 'calendar', reference: 'Currency', inputMode: 'selector' },
  { key: 'allowNegative', column: 'Allownegative', type: 'checkbox', label: 'Allow negative', required: true, section: 'policies' },
  { key: 'accrual', column: 'IsAccrual', type: 'checkbox', label: 'Accrual', section: 'identity', defaultValue: 'Y' },
];
// @sf-generated-end fields:General

// @sf-generated-start component:GeneralForm
export default function GeneralForm(props) {
  return <EntityForm fields={fields} {...props} />;
}
GeneralForm.fields = fields;

// @sf-generated-end component:GeneralForm
